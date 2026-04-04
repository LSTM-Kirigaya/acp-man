/**
 * 飞书 ACP Agent - 精简版（带 Markdown 渲染和思考过程输出）
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

// 思考过程和工具调用收集器
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

// ============ 核心类 ============

/**
 * ACP 客户端（带思考过程输出）
 */
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

        // 处理不同类型的更新
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
            case 'tool_call_update':
                console.log(`[ACP] 📊 Tool call update received`);
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

    // 流式发送消息（带思考过程收集）
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

/**
 * 飞书客户端（带结构化 Markdown 渲染）
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
     * 发送结构化卡片（支持表格、标题等）
     */
    async sendStructuredCard(receiveId: string, title: string, content: string, thinking?: ThinkingProcess) {
        const elements: any[] = [];

        // 如果有思考过程，添加可折叠面板
        if (thinking && (thinking.thought || thinking.toolCalls.length > 0)) {
            let thoughtContent = '';
            
            if (thinking.thought) {
                thoughtContent += `💭 **思考过程**\n${thinking.thought.substring(0, 500)}\n\n`;
            }
            
            if (thinking.toolCalls.length > 0) {
                thoughtContent += `🔧 **工具调用** (${thinking.toolCalls.length} 个)\n\n`;
                thinking.toolCalls.forEach((tc, i) => {
                    thoughtContent += `${i + 1}. **${tc.name}**`;
                    if (tc.params) {
                        const paramsStr = JSON.stringify(tc.params).substring(0, 100);
                        thoughtContent += `  \n   参数: \`${paramsStr}\``;
                    }
                    thoughtContent += '\n\n';
                });
            }

            // 简化为普通 div 显示（避免 collapsible_panel 兼容性问题）
            elements.push({
                tag: 'div',
                text: {
                    tag: 'lark_md',
                    content: thoughtContent.trim(),
                },
            });
            elements.push({ tag: 'hr' });
        }

        // 解析并添加主要内容
        const contentElements = this.parseContentToElements(content);
        elements.push(...contentElements);

        const card = {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: 'plain_text', content: title },
                template: 'green',
            },
            elements,
        };

        try {
            await this.client.im.message.create({
                params: { receive_id_type: 'open_id' },
                data: {
                    receive_id: receiveId,
                    msg_type: 'interactive',
                    content: JSON.stringify(card),
                },
            });
        } catch (error) {
            console.error('[Feishu] Failed to send card:', error);
            await this.sendTextMessage(receiveId, content);
        }
    }

    /**
     * 将内容解析为飞书卡片元素
     */
    private parseContentToElements(content: string): any[] {
        const elements: any[] = [];
        const lines = content.split('\n');
        let i = 0;

        while (i < lines.length) {
            const line = lines[i].trim();

            // 空行跳过
            if (line === '') {
                i++;
                continue;
            }

            // 一级标题
            if (line.startsWith('# ') && !line.startsWith('## ')) {
                elements.push({
                    tag: 'div',
                    text: {
                        tag: 'plain_text',
                        content: line.substring(2),
                        style: { bold: true, fontsize: 3 },
                    },
                });
                i++;
                continue;
            }

            // 二级标题
            if (line.startsWith('## ') && !line.startsWith('### ')) {
                elements.push({
                    tag: 'div',
                    text: {
                        tag: 'plain_text',
                        content: line.substring(3),
                        style: { bold: true, fontsize: 2 },
                    },
                });
                i++;
                continue;
            }

            // 三级标题
            if (line.startsWith('### ')) {
                elements.push({
                    tag: 'div',
                    text: {
                        tag: 'plain_text',
                        content: line.substring(4),
                        style: { bold: true, fontsize: 1 },
                    },
                });
                i++;
                continue;
            }

            // 表格
            if (line.includes('|')) {
                const tableRows: string[][] = [];
                while (i < lines.length && lines[i].trim().includes('|')) {
                    const row = lines[i].trim();
                    // 跳过分隔线 |---|---|
                    if (!row.match(/^\|[-:\s|]+\|$/)) {
                        const cells = row.split('|').map(c => c.trim()).filter(c => c);
                        if (cells.length > 0) {
                            tableRows.push(cells);
                        }
                    }
                    i++;
                }

                if (tableRows.length > 0) {
                    // 使用 column_set 实现表格
                    const columns = tableRows[0].map((_, colIndex) => ({
                        tag: 'column',
                        width: 'weighted',
                        weight: 1,
                        elements: tableRows.map(row => ({
                            tag: 'div',
                            text: {
                                tag: 'lark_md',
                                content: row[colIndex] || '',
                            },
                        })),
                    }));

                    elements.push({
                        tag: 'column_set',
                        flex_mode: 'stretch',
                        background_style: 'grey',
                        columns,
                    });
                }
                continue;
            }

            // 列表项
            if (line.startsWith('- ') || line.startsWith('* ')) {
                const listItems: any[] = [];
                while (i < lines.length) {
                    const itemLine = lines[i].trim();
                    if (!itemLine.startsWith('- ') && !itemLine.startsWith('* ')) break;
                    
                    const itemText = itemLine.substring(2);
                    listItems.push({
                        tag: 'div',
                        text: {
                            tag: 'lark_md',
                            content: '• ' + itemText,
                        },
                    });
                    i++;
                }
                elements.push(...listItems);
                continue;
            }

            // 引用
            if (line.startsWith('> ')) {
                elements.push({
                    tag: 'note',
                    elements: [
                        {
                            tag: 'plain_text',
                            content: line.substring(2),
                        },
                    ],
                });
                i++;
                continue;
            }

            // 分割线
            if (line === '---' || line === '***') {
                elements.push({ tag: 'hr' });
                i++;
                continue;
            }

            // 普通段落（带行内 Markdown）
            elements.push({
                tag: 'div',
                text: {
                    tag: 'lark_md',
                    content: line,
                },
            });
            i++;
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

                // 发送到 ACP（带思考过程）
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

                // 发送结构化卡片
                await feishu.sendStructuredCard(senderId, 'Kimi', actualReply, thinking);
                console.log(`[Feishu] ✅ Sent: ${actualReply.length} chars`);
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
