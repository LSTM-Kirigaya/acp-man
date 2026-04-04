/**
 * 飞书 ACP Agent - 精简版
 * 使用 feishu-messaging 模块发送消息
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
    sendPostMessage,
    sendStructuredCard,
} from '../feishu-messaging.js';

dotenv.config();

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const WORK_PATH = process.env.ACP_DEFAULT_CWD || process.cwd();

if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
    console.error('❌ 缺少环境变量 FEISHU_APP_ID 或 FEISHU_APP_SECRET');
    process.exit(1);
}

// ============ 类型定义 ============

interface MessageHistory {
    messageId: string;
    userInput: string;
    aiFullResponse: string;
    aiActualResponse: string;
    contentOffset: number;
    contentLength: number;
    timestamp: number;
}

interface ChatSession {
    acpSessionId: string;
    messageHistory: MessageHistory[];
    lastActivity: number;
}

interface ThinkingProcess {
    thought: string;
    toolCalls: ToolCallInfo[];
}

interface ToolCallInfo {
    name: string;
    params?: Record<string, unknown>;
    result?: string;
    timestamp: number;
}

// ============ ACP 客户端 ============

class AcpClient implements Client {
    private connection?: ClientSideConnection;
    private streamCollector?: {
        onMessageChunk: (c: string) => void;
        onThoughtChunk?: (c: string) => void;
        onToolCall?: (tool: ToolCallInfo) => void;
    };

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
        console.log('[ACP] 🔐 Permission requested:', params.toolCall.title);
        const firstOption = params.options[0];
        if (firstOption) {
            console.log('[ACP] ✅ Auto-approved:', firstOption.name);
            return {
                outcome: {
                    outcome: 'selected',
                    optionId: firstOption.optionId,
                },
            };
        }
        return { outcome: { outcome: 'cancelled' } };
    }

    async sessionUpdate(params: SessionNotification): Promise<void> {
        const notification = params as SessionNotification & {
            sessionId?: string;
            update?: {
                sessionUpdate?: string;
                content?: { text?: string };
            };
        };
        const sessionId = notification.sessionId;
        const updateType = notification.update?.sessionUpdate;
        const content = notification.update?.content;

        if (!sessionId || !updateType) return;

        switch (updateType) {
            case 'agent_message_chunk':
                if (content?.text) {
                    this.streamCollector?.onMessageChunk(content.text);
                }
                break;
            case 'agent_thought_chunk':
                if (content?.text) {
                    console.log(`[ACP] 💭 Thought: ${content.text.substring(0, 100)}${content.text.length > 100 ? '...' : ''}`);
                    this.streamCollector?.onThoughtChunk?.(content.text);
                }
                break;
            case 'tool_call':
                const toolCall = this.parseToolCall(notification);
                console.log(`[ACP] 🔧 Tool call: ${toolCall.name}`);
                if (toolCall.params) {
                    console.log(`[ACP]    Params:`, JSON.stringify(toolCall.params).substring(0, 200));
                }
                this.streamCollector?.onToolCall?.(toolCall);
                break;
        }
    }

    private parseToolCall(notification: any): ToolCallInfo {
        const tc = notification.toolCall || notification;
        return {
            name: tc.title || tc.name || 'Unknown Tool',
            params: notification.params || tc.params,
            result: notification.result || tc.result,
            timestamp: Date.now(),
        };
    }

    async newSession() {
        const request: NewSessionRequest = {
            cwd: WORK_PATH,
            mcpServers: [],
        };
        const response = await this.connection!.newSession(request);
        return response.sessionId;
    }

    async sendMessageStream(sessionId: string, prompt: string): Promise<{ message: string; thinking: ThinkingProcess }> {
        let fullMessage = '';
        const thinking: ThinkingProcess = {
            thought: '',
            toolCalls: [],
        };

        this.streamCollector = {
            onMessageChunk: (chunk: string) => {
                fullMessage += chunk;
            },
            onThoughtChunk: (chunk: string) => {
                thinking.thought += chunk;
            },
            onToolCall: (tool: ToolCallInfo) => {
                thinking.toolCalls.push(tool);
            },
        };

        const request: PromptRequest = {
            sessionId,
            prompt: [{ type: 'text', text: prompt }],
        };

        console.log('[ACP] ⏳ Waiting for response...');
        await this.connection!.prompt(request);
        this.streamCollector = undefined;

        return { message: fullMessage, thinking };
    }
}

// ============ 主程序 ============

async function main() {
    // 1. 连接 ACP
    const agentPath = process.env.ACP_AGENT_PATH || 'kimi';
    const acp = new AcpClient();
    await acp.connect(agentPath);

    // 2. 初始化飞书客户端
    initFeishuClient(FEISHU_APP_ID!, FEISHU_APP_SECRET!);
    console.log('[Feishu] Client initialized');

    const sessions = new Map<string, ChatSession>();
    const processedMessageIds = new Set<string>();

    const eventDispatcher = new lark.EventDispatcher({});

    eventDispatcher.register({
        'im.message.receive_v1': async (data: unknown) => {
            try {
                const eventData = data as {
                    message: {
                        chat_id: string;
                        chat_type: string;
                        message_type: string;
                        content: string;
                        message_id?: string;
                    };
                    sender: {
                        sender_id: {
                            open_id: string;
                        };
                    };
                };
                const message = eventData.message;
                const sender = eventData.sender;

                if (message.chat_type !== 'p2p') return;
                if (message.message_type !== 'text') return;

                const chatId = message.chat_id;
                const senderId = sender.sender_id.open_id;
                const content = JSON.parse(message.content).text as string;
                const messageId = message.message_id || `msg_${Date.now()}`;

                // 消息去重
                if (processedMessageIds.has(messageId)) {
                    console.log(`[Feishu] ⚠️ Duplicate message ignored`);
                    return;
                }
                processedMessageIds.add(messageId);

                console.log(`\n${'='.repeat(50)}`);
                console.log(`[Feishu] 👤 User: ${content.substring(0, 50)}`);

                // 获取或创建会话
                let session = sessions.get(chatId);
                if (!session) {
                    const acpSessionId = await acp.newSession();
                    session = {
                        acpSessionId,
                        messageHistory: [],
                        lastActivity: Date.now(),
                    };
                    sessions.set(chatId, session);
                    console.log(`[ACP] Session created: ${acpSessionId.substring(0, 16)}...`);
                }
                session.lastActivity = Date.now();

                // 计算内容偏移量
                const contentOffset = session.messageHistory.reduce(
                    (sum, h) => sum + h.contentLength, 0
                );
                console.log(`[Offset] Rounds: ${session.messageHistory.length}, Offset: ${contentOffset}`);

                // 发送到 ACP
                console.log(`[ACP] Sending: ${content.substring(0, 50)}...`);
                const { message: fullReply, thinking } = await acp.sendMessageStream(session.acpSessionId, content);

                console.log(`\n[ACP] 📊 Response Summary:`);
                console.log(`  - Full length: ${fullReply.length} chars`);
                console.log(`  - Thought length: ${thinking.thought.length} chars`);
                console.log(`  - Tool calls: ${thinking.toolCalls.length}`);

                // 偏移截取
                let actualReply = fullReply;
                if (contentOffset > 0 && fullReply.length > contentOffset) {
                    actualReply = fullReply.substring(contentOffset).trim();
                    console.log(`[Offset] Sliced by offset: ${fullReply.length} -> ${actualReply.length}`);
                } else if (session.messageHistory.length > 0) {
                    const lastResponse = session.messageHistory[session.messageHistory.length - 1]?.aiActualResponse;
                    if (lastResponse && fullReply.startsWith(lastResponse)) {
                        actualReply = fullReply.substring(lastResponse.length).trim();
                        console.log(`[Offset] Sliced by prefix: ${fullReply.length} -> ${actualReply.length}`);
                    }
                }

                // 跳过空回复
                if (!actualReply || actualReply.length === 0) {
                    console.log(`[Feishu] ⚠️ Empty reply, skipping`);
                    return;
                }

                // 记录历史
                session.messageHistory.push({
                    messageId,
                    userInput: content,
                    aiFullResponse: fullReply,
                    aiActualResponse: actualReply,
                    contentOffset,
                    contentLength: actualReply.length,
                    timestamp: Date.now(),
                });

                console.log(`[ACP] Actual reply: ${actualReply.substring(0, 80)}...`);

                // ============ 使用 feishu-messaging 模块发送消息 ============
                
                // 方案1: 发送结构化卡片（推荐，支持 Markdown 渲染）
                await sendStructuredCard(senderId, 'Kimi', actualReply, thinking);
                console.log(`[Feishu] ✅ Structured card sent: ${actualReply.length} chars`);

                // 备选方案: 如果需要简化格式，使用富文本
                // await sendPostMessage(senderId, 'Kimi', actualReply);
                // console.log(`[Feishu] ✅ Post message sent: ${actualReply.length} chars`);

                console.log(`${'='.repeat(50)}\n`);

            } catch (error) {
                console.error('[Error] Failed to process message:', error);
            }
        },

        'im.message.message_read_v1': async () => {
            // 消除警告
        },
    });

    const wsClient = new lark.WSClient({
        appId: FEISHU_APP_ID!,
        appSecret: FEISHU_APP_SECRET!,
    });

    await wsClient.start({ eventDispatcher });
    console.log('[System] ✅ Ready for messages');
}

main().catch(console.error);
