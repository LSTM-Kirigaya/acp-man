/**
 * 飞书 ACP Agent - 精简版（实时流式输出）
 * 思考过程和工具调用实时发送到飞书
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
    sendThinkingCard,
    sendToolCallCard,
    sendFinalCard,
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
    // 实时发送相关
    currentReceiverId?: string;
    thinkingBuffer: string;
    toolCalls: ToolCallInfo[];
    messageId?: string;  // 用于更新卡片
}

interface ToolCallInfo {
    name: string;
    params?: Record<string, unknown>;
    result?: string;
    timestamp: number;
}

// 消息发送回调类型
type MessageSender = (content: string, isThinking?: boolean) => Promise<void>;

// ============ ACP 客户端（实时流式版） ============

class AcpClient implements Client {
    private connection?: ClientSideConnection;
    private currentSender?: MessageSender;
    private thinkingTimeout?: NodeJS.Timeout;

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

    /**
     * 设置消息发送回调
     */
    setMessageSender(sender: MessageSender) {
        this.currentSender = sender;
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
        const updateType = notification.update?.sessionUpdate;
        const content = notification.update?.content;

        if (!updateType) return;

        switch (updateType) {
            case 'agent_message_chunk':
                // 最终回复片段，不在这里处理
                break;

            case 'agent_thought_chunk':
                if (content?.text && this.currentSender) {
                    // 累积思考内容，延迟发送（避免过于频繁）
                    this.bufferThinking(content.text);
                }
                break;

            case 'tool_call':
                // 立即发送工具调用
                const toolCall = this.parseToolCall(notification);
                console.log('[ACP] 🔧 Tool call:', JSON.stringify({
                    name: toolCall.name,
                    params: toolCall.params,
                    raw: notification  // 打印完整信息用于调试
                }, null, 2));
                
                if (this.currentSender) {
                    const toolText = `🔧 **${toolCall.name}**\n\`${JSON.stringify(toolCall.params || {}).substring(0, 200)}\``;
                    await this.currentSender(toolText, true);
                }
                break;
        }
    }

    /**
     * 缓冲思考内容，定期发送
     */
    private bufferThinking(text: string) {
        // 清除之前的定时器
        if (this.thinkingTimeout) {
            clearTimeout(this.thinkingTimeout);
        }

        // 累积一定时间后发送
        this.thinkingTimeout = setTimeout(async () => {
            if (this.currentSender && text.trim()) {
                await this.currentSender(`💭 ${text.trim()}`, true);
            }
        }, 500); // 500ms 延迟，合并短片段
    }

    /**
     * 解析工具调用 - 打印完整字段用于调试
     */
    private parseToolCall(notification: any): ToolCallInfo {
        // 打印完整通知结构用于调试
        console.log('[ACP] 🔍 Raw tool_call notification:', JSON.stringify(notification, null, 2));

        // 尝试多种可能的字段路径
        const toolCall = notification.toolCall || notification;
        
        // 尝试获取名称的各种可能字段
        const name = toolCall.title || 
                     toolCall.name || 
                     toolCall.function?.name ||
                     toolCall.command ||
                     toolCall.tool ||
                     'Unknown Tool';

        // 尝试获取参数的各种可能字段
        const params = notification.params || 
                      toolCall.params || 
                      toolCall.arguments ||
                      toolCall.args ||
                      toolCall.parameters ||
                      toolCall.input ||
                      {};

        return {
            name,
            params,
            result: notification.result || toolCall.result,
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

    /**
     * 流式发送消息，通过回调实时返回内容
     */
    async sendMessageStream(
        sessionId: string, 
        prompt: string,
        onContent: (type: 'thinking' | 'tool' | 'message', content: string) => Promise<void>
    ): Promise<string> {
        let fullMessage = '';

        // 设置回调
        this.currentSender = async (content: string, isThinking?: boolean) => {
            await onContent(isThinking ? 'thinking' : 'message', content);
        };

        const request: PromptRequest = {
            sessionId,
            prompt: [{ type: 'text', text: prompt }],
        };

        console.log('[ACP] ⏳ Streaming response...');
        await this.connection!.prompt(request);
        
        // 清除回调和定时器
        this.currentSender = undefined;
        if (this.thinkingTimeout) {
            clearTimeout(this.thinkingTimeout);
            this.thinkingTimeout = undefined;
        }

        return fullMessage;
    }
}

// ============ 主程序 ============

async function main() {
    const agentPath = process.env.ACP_AGENT_PATH || 'kimi';
    const acp = new AcpClient();
    await acp.connect(agentPath);

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
                    return;
                }
                processedMessageIds.add(messageId);

                console.log(`\n[Feishu] 👤 ${content.substring(0, 50)}`);

                // 获取或创建会话
                let session = sessions.get(chatId);
                if (!session) {
                    const acpSessionId = await acp.newSession();
                    session = {
                        acpSessionId,
                        messageHistory: [],
                        lastActivity: Date.now(),
                        currentReceiverId: senderId,
                        thinkingBuffer: '',
                        toolCalls: [],
                    };
                    sessions.set(chatId, session);
                    console.log(`[ACP] Session created`);
                }
                session.lastActivity = Date.now();
                session.currentReceiverId = senderId;

                // 计算内容偏移量
                const contentOffset = session.messageHistory.reduce(
                    (sum, h) => sum + h.contentLength, 0
                );

                // 实时消息发送器
                let lastMessageId: string | undefined;
                
                const sendRealTimeMessage = async (type: 'thinking' | 'tool' | 'message', text: string) => {
                    try {
                        if (type === 'thinking') {
                            // 更新思考卡片
                            session!.thinkingBuffer += text + '\n';
                            lastMessageId = await sendThinkingCard(senderId, session!.thinkingBuffer, lastMessageId);
                        } else if (type === 'tool') {
                            // 添加工具调用到列表
                            session!.toolCalls.push({
                                name: text.split('\n')[0].replace('🔧 **', '').replace('**', ''),
                                params: {},
                                timestamp: Date.now(),
                            });
                            lastMessageId = await sendToolCallCard(senderId, text, lastMessageId);
                        }
                    } catch (err) {
                        console.error('[Send Error]', err);
                    }
                };

                // 发送到 ACP（实时流式）
                const fullReply = await acp.sendMessageStream(
                    session.acpSessionId, 
                    content,
                    sendRealTimeMessage
                );

                console.log(`[ACP] Full reply: ${fullReply.length} chars`);

                // 偏移截取
                let actualReply = fullReply;
                if (contentOffset > 0 && fullReply.length > contentOffset) {
                    actualReply = fullReply.substring(contentOffset).trim();
                }

                if (!actualReply || actualReply.length === 0) {
                    console.log(`[Feishu] ⚠️ Empty reply`);
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

                // 发送最终回复
                await sendFinalCard(senderId, 'Kimi', actualReply, {
                    thought: session.thinkingBuffer,
                    toolCalls: session.toolCalls,
                }, lastMessageId);

                // 清空缓冲
                session.thinkingBuffer = '';
                session.toolCalls = [];

                console.log(`[Feishu] ✅ Reply sent: ${actualReply.length} chars\n`);

            } catch (error) {
                console.error('[Error]', error);
            }
        },

        'im.message.message_read_v1': async () => {},
    });

    const wsClient = new lark.WSClient({
        appId: FEISHU_APP_ID!,
        appSecret: FEISHU_APP_SECRET!,
    });

    await wsClient.start({ eventDispatcher });
    console.log('[System] ✅ Ready');
}

main().catch(console.error);
