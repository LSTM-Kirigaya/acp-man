/**
 * 飞书 ACP Agent - 修复并发重复问题
 */

import * as dotenv from 'dotenv';
import * as lark from '@larksuiteoapi/node-sdk';
import {
    ClientSideConnection,
    ndJsonStream,
    PROTOCOL_VERSION,
    type Client,
    type RequestPermissionRequest,
    type RequestPermissionResponse,
    type SessionNotification,
} from '@agentclientprotocol/sdk';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import {
    initFeishuClient,
    sendTextCard,
    sendFinalCard,
} from '../feishu-messaging.js';

dotenv.config();

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const WORK_PATH = process.env.ACP_DEFAULT_CWD || process.cwd();

if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
    console.error('❌ 缺少环境变量');
    process.exit(1);
}

// ============ Session 状态 ============
interface SessionState {
    sessionId: string;
    receiverId: string;
    thinkingBuffer: string;
    messageBuffer: string;
    sentToolIds: Set<string>;
    phase: 'thinking' | 'tool' | 'message';
    // 防重入锁
    isFlushingThinking: boolean;
}

const activeSessions = new Map<string, SessionState>();

// ============ ACP 客户端 ============
class AcpClient implements Client {
    private connection?: ClientSideConnection;

    async connect(agentPath: string = 'kimi') {
        const childProcess = spawn(agentPath, ['acp'], { stdio: ['pipe', 'pipe', 'pipe'] });
        const stream = ndJsonStream(
            Writable.toWeb(childProcess.stdin) as WritableStream<Uint8Array>,
            Readable.toWeb(childProcess.stdout) as ReadableStream<Uint8Array>
        );
        this.connection = new ClientSideConnection(() => this, stream);
        await this.connection.initialize({
            protocolVersion: PROTOCOL_VERSION,
            clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
        });
        console.log('[ACP] Connected');
    }

    async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
        const firstOption = params.options[0];
        return firstOption 
            ? { outcome: { outcome: 'selected', optionId: firstOption.optionId } }
            : { outcome: { outcome: 'cancelled' } };
    }

    async sessionUpdate(params: SessionNotification): Promise<void> {
        const notification = params as any;
        const sessionId = notification.sessionId;
        const updateType = notification.update?.sessionUpdate;
        const content = notification.update?.content?.text;
        
        const state = activeSessions.get(sessionId);
        if (!state) return;

        switch (updateType) {
            case 'agent_thought_chunk':
                if (content) {
                    state.phase = 'thinking';
                    state.thinkingBuffer += content;
                }
                break;

            case 'tool_call':
                console.log('\n[RAW TOOL_CALL]', JSON.stringify(notification.update, null, 2).substring(0, 600));
                await this.handleToolCall(state, notification);
                break;

            case 'agent_message_chunk':
                if (content) {
                    state.messageBuffer += content;
                }
                break;
        }
    }

    private async handleToolCall(state: SessionState, notification: any): Promise<void> {
        const update = notification.update || {};
        const toolId = update.toolCallId;
        
        if (!toolId || state.sentToolIds.has(toolId)) {
            console.log(`[Tool] Skip dup/empty: ${toolId?.substring(0, 20)}...`);
            return;
        }
        state.sentToolIds.add(toolId);

        const toolName = update.title || 'Unknown';
        
        // 尝试所有可能的参数字段
        const params = update.input || update.parameters || update.params || 
                      update.arguments || update.args || update.data || {};
        
        // 如果没找到，尝试从 content 解析（有些协议把参数放 content 里）
        let finalParams = params;
        if (Object.keys(params).length === 0 && update.content) {
            try {
                const contentText = update.content[0]?.content?.text;
                if (contentText) {
                    finalParams = JSON.parse(contentText);
                }
            } catch {
                finalParams = { query: update.content[0]?.content?.text };
            }
        }
        
        console.log(`[Tool] ${toolName} | params: ${JSON.stringify(finalParams).substring(0, 100)}`);

        // 切换前 flush 思考（带锁防止并发重复）
        if (state.phase === 'thinking' && state.thinkingBuffer.trim() && !state.isFlushingThinking) {
            await this.flushThinking(state);
        }
        state.phase = 'tool';

        // 发送工具卡片
        const display = `**${toolName}**\n\`$${JSON.stringify(finalParams).substring(0, 300)}\``;
        await sendTextCard(state.receiverId, '🔧 工具调用', display);
    }

    private async flushThinking(state: SessionState): Promise<void> {
        // 加锁：防止并发重复 flush
        if (state.isFlushingThinking) {
            console.log('[Flush] Already flushing, skip');
            return;
        }
        state.isFlushingThinking = true;

        try {
            // 立即提取并清空 buffer（防止并发读取相同内容）
            const content = state.thinkingBuffer.trim();
            state.thinkingBuffer = ''; // 立即清空！

            if (!content) {
                console.log('[Flush] Empty after clear, skip');
                return;
            }

            console.log(`[Flush] ${content.length} chars: "${content.substring(0, 50).replace(/\n/g, '\\n')}..."`);
            await sendTextCard(state.receiverId, '💭 思考过程', content.substring(0, 3000));
        } finally {
            state.isFlushingThinking = false;
        }
    }

    async newSession(): Promise<string> {
        const resp = await this.connection!.newSession({ cwd: WORK_PATH, mcpServers: [] });
        return resp.sessionId;
    }

    async sendMessageStream(
        sessionId: string,
        prompt: string,
        receiverId: string
    ): Promise<string> {
        const state: SessionState = {
            sessionId, receiverId,
            thinkingBuffer: '', messageBuffer: '',
            sentToolIds: new Set(),
            phase: 'message',
            isFlushingThinking: false,
        };
        activeSessions.set(sessionId, state);

        try {
            await this.connection!.prompt({
                sessionId,
                prompt: [{ type: 'text', text: prompt }],
            });

            // 最后 flush（带锁）
            if (state.thinkingBuffer.trim() && !state.isFlushingThinking) {
                await this.flushThinking(state);
            }

            return state.messageBuffer;
        } finally {
            activeSessions.delete(sessionId);
        }
    }
}

// ============ 主程序 ============
async function main() {
    const acp = new AcpClient();
    await acp.connect(process.env.ACP_AGENT_PATH || 'kimi');
    initFeishuClient(FEISHU_APP_ID!, FEISHU_APP_SECRET!);

    const eventDispatcher = new lark.EventDispatcher({});

    eventDispatcher.register({
        'im.message.receive_v1': async (data: any) => {
            const message = data.message;
            if (message.chat_type !== 'p2p' || message.message_type !== 'text') return;

            const senderId = data.sender.sender_id.open_id;
            const content = JSON.parse(message.content).text;

            console.log(`\n[User] ${content}`);

            const sessionId = await acp.newSession();
            const reply = await acp.sendMessageStream(sessionId, content, senderId);

            await sendFinalCard(senderId, '回复', reply);
        },
        'im.message.message_read_v1': async () => {},
    });

    await new lark.WSClient({
        appId: FEISHU_APP_ID!,
        appSecret: FEISHU_APP_SECRET!,
    }).start({ eventDispatcher });
}

main().catch(console.error);
