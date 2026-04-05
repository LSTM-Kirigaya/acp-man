/**
 * 飞书 ACP Agent - 精简版（状态切换时立即发送）
 * 思考 ↔ 工具调用 穿插进行时，类型变化立即发送之前内容
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
    type NewSessionRequest,
    type PromptRequest,
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

// ============ 类型定义 ============

type StreamType = 'thinking' | 'tool' | 'message';

interface StreamContext {
    currentType: StreamType | null;
    thinkingBuffer: string;
    toolCalls: ToolCallInfo[];
    messageBuffer: string;
    receiverId: string;
    // 各类型是否已发送
    thinkingSent: boolean;
    toolsSent: boolean;
}

interface ToolCallInfo {
    name: string;
    params?: Record<string, unknown>;
    timestamp: number;
}

// ============ ACP 客户端 ============

class AcpClient implements Client {
    private connection?: ClientSideConnection;
    private context?: StreamContext;

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
        if (!this.context) return;

        const notification = params as any;
        const updateType = notification.update?.sessionUpdate;
        const content = notification.update?.content?.text;

        switch (updateType) {
            case 'agent_thought_chunk':
                await this.handleThinking(content);
                break;
            case 'tool_call':
                await this.handleToolCall(notification);
                break;
            case 'agent_message_chunk':
                if (content) this.context.messageBuffer += content;
                break;
        }
    }

    /**
     * 处理思考片段
     */
    private async handleThinking(content: string): Promise<void> {
        if (!this.context) return;
        
        // 如果之前是工具调用状态，先把工具调用发送出去
        if (this.context.currentType === 'tool' && !this.context.toolsSent) {
            await this.flushToolCalls();
        }

        this.context.currentType = 'thinking';
        this.context.thinkingBuffer += content;
        
        // 实时更新思考显示
        console.log(`[Thinking] ${content.substring(0, 50)}`);
    }

    /**
     * 处理工具调用
     */
    private async handleToolCall(notification: any): Promise<void> {
        if (!this.context) return;

        // 如果之前是思考状态，先把思考内容发送出去
        if (this.context.currentType === 'thinking' && !this.context.thinkingSent) {
            await this.flushThinking();
        }

        this.context.currentType = 'tool';

        // 解析工具调用（打印完整信息）
        console.log('[ACP] 🔍 Raw tool_call:', JSON.stringify(notification, null, 2));
        
        const tc = notification.toolCall || notification;
        const name = tc.title || tc.name || tc.tool || 'Unknown Tool';
        const params = notification.params || tc.params || {};

        this.context.toolCalls.push({ name, params, timestamp: Date.now() });
        
        // 立即发送这个工具调用
        const displayText = `🔧 **${name}**\n\`$${JSON.stringify(params).substring(0, 300)}\``;
        await sendTextCard(this.context.receiverId, '工具调用', displayText);
        this.context.toolsSent = true;
        
        console.log(`[Tool] ${name}`);
    }

    /**
     * 发送累积的思考内容
     */
    private async flushThinking(): Promise<void> {
        if (!this.context || this.context.thinkingSent) return;
        
        const content = this.context.thinkingBuffer.trim();
        if (content) {
            await sendTextCard(
                this.context.receiverId,
                '💭 思考过程',
                content.substring(0, 2000)
            );
            console.log(`[Flush] Thinking: ${content.length} chars`);
        }
        this.context.thinkingSent = true;
    }

    /**
     * 发送累积的工具调用
     */
    private async flushToolCalls(): Promise<void> {
        if (!this.context || this.context.toolsSent) return;

        // 工具调用是实时发送的，这里只是标记
        console.log(`[Flush] ${this.context.toolCalls.length} tool calls`);
        this.context.toolsSent = true;
    }

    async newSession() {
        const response = await this.connection!.newSession({
            cwd: WORK_PATH,
            mcpServers: [],
        });
        return response.sessionId;
    }

    /**
     * 流式发送
     */
    async sendMessageStream(
        sessionId: string,
        prompt: string,
        receiverId: string
    ): Promise<string> {
        this.context = {
            currentType: null,
            thinkingBuffer: '',
            toolCalls: [],
            messageBuffer: '',
            receiverId,
            thinkingSent: false,
            toolsSent: false,
        };

        await this.connection!.prompt({
            sessionId,
            prompt: [{ type: 'text', text: prompt }],
        });

        // 结束前确保所有内容都已发送
        if (this.context.currentType === 'thinking' && !this.context.thinkingSent) {
            await this.flushThinking();
        }

        const result = this.context.messageBuffer;
        const ctx = { ...this.context };
        this.context = undefined;

        return result;
    }

    getLastContext() {
        return this.context;
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

            console.log(`\n[User] ${content.substring(0, 50)}`);

            const sessionId = await acp.newSession();
            const finalReply = await acp.sendMessageStream(sessionId, content, senderId);

            // 发送最终回复
            const ctx = acp.getLastContext();
            if (ctx) {
                await sendFinalCard(senderId, 'Kimi 回复', finalReply, {
                    thought: ctx.thinkingSent ? '' : ctx.thinkingBuffer,
                    toolCalls: ctx.toolCalls,
                });
            }
        },
        'im.message.message_read_v1': async () => {},
    });

    await new lark.WSClient({
        appId: FEISHU_APP_ID!,
        appSecret: FEISHU_APP_SECRET!,
    }).start({ eventDispatcher });
}

main().catch(console.error);
