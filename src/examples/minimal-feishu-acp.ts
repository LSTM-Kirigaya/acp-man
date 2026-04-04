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

// 加载 .env 文件
dotenv.config();

// ============ 配置 ============
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const WORK_PATH = process.env.ACP_DEFAULT_CWD || process.cwd();

// 检查必需的环境变量
if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
    console.error('❌ 错误: 缺少环境变量');
    console.error('   请确保 .env 文件存在并包含:');
    console.error('   FEISHU_APP_ID=cli_xxx');
    console.error('   FEISHU_APP_SECRET=xxx');
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

// ============ 核心类 ============

/**
 * ACP 客户端
 */
class AcpClient implements Client {
    private connection?: ClientSideConnection;
    private streamCollector?: { onMessageChunk: (c: string) => void };

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
        console.log('[ACP] Permission requested:', params.toolCall.title);
        const firstOption = params.options[0];
        if (firstOption) {
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

        if (sessionId && updateType === 'agent_message_chunk' && content?.text) {
            this.streamCollector?.onMessageChunk(content.text);
        }
    }

    async newSession() {
        const request: NewSessionRequest = {
            cwd: WORK_PATH,
            mcpServers: [],
        };
        const response = await this.connection!.newSession(request);
        return response.sessionId;
    }

    async sendMessageStream(sessionId: string, prompt: string) {
        let fullMessage = '';

        this.streamCollector = {
            onMessageChunk: (chunk: string) => {
                fullMessage += chunk;
            }
        };

        const request: PromptRequest = {
            sessionId,
            prompt: [{ type: 'text', text: prompt }],
        };
        await this.connection!.prompt(request);

        this.streamCollector = undefined;

        return fullMessage;
    }
}

/**
 * 飞书客户端
 * 使用富文本消息(post)支持 Markdown 渲染
 */
class FeishuClient {
    private client: lark.Client;

    constructor() {
        this.client = new lark.Client({
            appId: FEISHU_APP_ID!,
            appSecret: FEISHU_APP_SECRET!,
            appType: lark.AppType.SelfBuild,
            domain: lark.Domain.Feishu,
        });
    }

    /**
     * 发送富文本消息（支持 Markdown）
     * 使用 post 类型消息，飞书会自动渲染 Markdown
     */
    async sendPostMessage(receiveId: string, title: string, content: string) {
        // 构建富文本内容
        // 将 Markdown 内容分段处理
        const paragraphs = this.parseMarkdownToPost(content);
        
        const postContent = {
            zh_cn: {
                title: title,
                content: paragraphs,
            },
        };

        try {
            await this.client.im.message.create({
                params: { receive_id_type: 'open_id' },
                data: {
                    receive_id: receiveId,
                    msg_type: 'post',
                    content: JSON.stringify(postContent),
                },
            });
        } catch (error) {
            console.error('[Feishu] Failed to send post message:', error);
            // 失败后回退到纯文本
            await this.sendTextMessage(receiveId, content);
        }
    }

    /**
     * 将 Markdown 解析为飞书 post 格式
     */
    private parseMarkdownToPost(markdown: string): any[][] {
        const lines = markdown.split('\n');
        const paragraphs: any[][] = [];
        let currentParagraph: any[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed === '') {
                // 空行，结束当前段落
                if (currentParagraph.length > 0) {
                    paragraphs.push(currentParagraph);
                    currentParagraph = [];
                }
                continue;
            }

            // 解析行内 Markdown
            const elements = this.parseInlineMarkdown(trimmed);
            
            // 检测块级元素
            if (trimmed.startsWith('# ')) {
                // 一级标题
                paragraphs.push([{
                    tag: 'text',
                    text: trimmed.substring(2),
                    style: { bold: true, fontsize: 3 },
                }]);
            } else if (trimmed.startsWith('## ')) {
                // 二级标题
                paragraphs.push([{
                    tag: 'text',
                    text: trimmed.substring(3),
                    style: { bold: true, fontsize: 2 },
                }]);
            } else if (trimmed.startsWith('### ')) {
                // 三级标题
                paragraphs.push([{
                    tag: 'text',
                    text: trimmed.substring(4),
                    style: { bold: true, fontsize: 1 },
                }]);
            } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                // 列表项
                currentParagraph.push({
                    tag: 'text',
                    text: '• ' + trimmed.substring(2),
                });
                if (currentParagraph.length > 0) {
                    paragraphs.push([...currentParagraph]);
                    currentParagraph = [];
                }
            } else if (trimmed.startsWith('> ')) {
                // 引用
                paragraphs.push([{
                    tag: 'text',
                    text: trimmed.substring(2),
                    style: { italic: true },
                }]);
            } else if (trimmed.startsWith('```')) {
                // 代码块开始/结束，跳过
                continue;
            } else if (trimmed.includes('|')) {
                // 表格行，简化处理为文本
                const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
                if (cells.length > 0 && !cells[0].includes('-')) {
                    paragraphs.push([{
                        tag: 'text',
                        text: cells.join(' | '),
                    }]);
                }
            } else {
                // 普通段落
                currentParagraph.push(...elements);
                if (currentParagraph.length > 0) {
                    paragraphs.push([...currentParagraph]);
                    currentParagraph = [];
                }
            }
        }

        // 处理剩余内容
        if (currentParagraph.length > 0) {
            paragraphs.push(currentParagraph);
        }

        // 如果没有任何段落，返回原始内容
        if (paragraphs.length === 0) {
            return [[{ tag: 'text', text: markdown }]];
        }

        return paragraphs;
    }

    /**
     * 解析行内 Markdown
     */
    private parseInlineMarkdown(text: string): any[] {
        const elements: any[] = [];
        let remaining = text;

        // 处理 **粗体**
        const boldRegex = /\*\*(.*?)\*\*/g;
        let lastIndex = 0;
        let match;

        while ((match = boldRegex.exec(text)) !== null) {
            // 添加匹配前的文本
            if (match.index > lastIndex) {
                elements.push({
                    tag: 'text',
                    text: text.substring(lastIndex, match.index),
                });
            }
            // 添加粗体文本
            elements.push({
                tag: 'text',
                text: match[1],
                style: { bold: true },
            });
            lastIndex = match.index + match[0].length;
        }

        // 添加剩余文本
        if (lastIndex < text.length) {
            elements.push({
                tag: 'text',
                text: text.substring(lastIndex),
            });
        }

        // 如果没有匹配到任何格式，返回原文
        if (elements.length === 0) {
            elements.push({ tag: 'text', text: text });
        }

        return elements;
    }

    /**
     * 发送纯文本消息（后备方案）
     */
    async sendTextMessage(receiveId: string, text: string) {
        await this.client.im.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: receiveId,
                msg_type: 'text',
                content: JSON.stringify({ text }),
            },
        });
    }
}

// ============ 主程序 ============

async function main() {
    const agentPath = process.env.ACP_AGENT_PATH || 'kimi';
    const acp = new AcpClient();
    await acp.connect(agentPath);

    const feishu = new FeishuClient();
    console.log('[Feishu] Client initialized');

    // 会话映射：chatId -> ChatSession
    const sessions = new Map<string, ChatSession>();
    
    // 已处理消息ID集合（用于去重）
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

                // 只处理私聊文本消息
                if (message.chat_type !== 'p2p') return;
                if (message.message_type !== 'text') return;

                const chatId = message.chat_id;
                const senderId = sender.sender_id.open_id;
                const content = JSON.parse(message.content).text as string;
                const messageId = message.message_id || `msg_${Date.now()}`;

                // ===== 消息去重检查 =====
                if (processedMessageIds.has(messageId)) {
                    console.log(`[Feishu] ⚠️ Duplicate message ignored: ${messageId.substring(0, 16)}...`);
                    return;
                }
                processedMessageIds.add(messageId);

                // 清理旧的消息ID（保留最近100条）
                if (processedMessageIds.size > 100) {
                    const iterator = processedMessageIds.values();
                    const firstValue = iterator.next().value;
                    if (firstValue) {
                        processedMessageIds.delete(firstValue);
                    }
                }

                console.log(`\n[Feishu] 👤 ${senderId.substring(0, 16)}...: ${content.substring(0, 50)}`);

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
                console.log(`[ACP] Sending: ${content.substring(0, 50)}`);
                const fullReply = await acp.sendMessageStream(session.acpSessionId, content);
                console.log(`[ACP] Raw reply: ${fullReply.length} chars`);

                // 偏移截取
                let actualReply = fullReply;
                if (contentOffset > 0 && fullReply.length > contentOffset) {
                    actualReply = fullReply.substring(contentOffset).trim();
                    console.log(`[Offset] Sliced: ${fullReply.length} -> ${actualReply.length}`);
                } else if (session.messageHistory.length > 0) {
                    const lastResponse = session.messageHistory[session.messageHistory.length - 1]?.aiActualResponse;
                    if (lastResponse && fullReply.startsWith(lastResponse)) {
                        actualReply = fullReply.substring(lastResponse.length).trim();
                        console.log(`[Offset] Prefix sliced: ${fullReply.length} -> ${actualReply.length}`);
                    }
                }

                // ===== 跳过空回复 =====
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

                console.log(`[ACP] Actual: ${actualReply.substring(0, 80)}...`);

                // 发送富文本消息
                await feishu.sendPostMessage(senderId, 'Kimi', actualReply);
                console.log(`[Feishu] ✅ Sent: ${actualReply.length} chars`);
            } catch (error) {
                console.error('[Error] Failed to process message:', error);
            }
        },

        // 处理消息已读事件（消除警告）
        'im.message.message_read_v1': async (_data: unknown) => {
            // 无需处理，只是消除警告
        },
    });

    const wsClient = new lark.WSClient({
        appId: FEISHU_APP_ID!,
        appSecret: FEISHU_APP_SECRET!,
    });

    await wsClient.start({ eventDispatcher });
    console.log('[System] ✅ Ready');
}

main().catch(console.error);
