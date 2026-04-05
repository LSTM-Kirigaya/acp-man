/**
 * 飞书消息工具模块 - 支持实时流式卡片
 */

import * as lark from '@larksuiteoapi/node-sdk';

let larkClient: lark.Client | null = null;

export function initFeishuClient(appId: string, appSecret: string): void {
    larkClient = new lark.Client({
        appId,
        appSecret,
        appType: lark.AppType.SelfBuild,
    });
}

export function getClient(): lark.Client {
    if (!larkClient) throw new Error('Feishu client not initialized');
    return larkClient;
}

// ============ 基础卡片发送 ============

/**
 * 发送简单的文本卡片（用于实时流中的独立消息）
 */
export async function sendTextCard(
    receiveId: string,
    title: string,
    content: string
): Promise<void> {
    const client = getClient();
    
    // 使用 Markdown 解析为卡片元素
    const contentElements = parseMarkdownToCardElements(content || '*(无内容)*');
    
    const card = {
        config: { wide_screen_mode: true },
        header: {
            template: 'green',
            title: { tag: 'plain_text', content: title }
        },
        elements: contentElements
    };

    try {
        const resp = await client.im.v1.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: receiveId,
                msg_type: 'interactive',
                content: JSON.stringify(card),
            } as any,
        });
        if (resp.code !== 0) {
            console.error('[Feishu] sendTextCard failed:', resp.msg);
        }
    } catch (e) {
        console.error('[Feishu] sendTextCard error:', e);
    }
}

/**
 * 将 Markdown 解析为飞书卡片元素
 * 
 * 支持的格式：
 * - 标题 (# ## ###)
 * - 表格 (| col1 | col2 |)
 * - 代码块 (```language\ncode\n```) - 使用飞书 code 组件，支持语法高亮
 * - 列表 (- item, * item)
 * - 引用 (> text)
 * - 分割线 (---, ***)
 * - 普通段落（支持 lark_md 内联格式：粗体、斜体、内联代码等）
 */
function parseMarkdownToCardElements(markdown: string): any[] {
    const elements: any[] = [];
    const lines = markdown.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (trimmedLine === '') {
            i++;
            continue;
        }

        // 代码块处理 (```language\ncode\n```)
        if (trimmedLine.startsWith('```')) {
            const language = trimmedLine.substring(3).trim() || 'plain';
            const codeLines: string[] = [];
            i++; // 跳过开始的 ```
            
            while (i < lines.length) {
                const codeLine = lines[i];
                if (codeLine.trim() === '```') {
                    i++; // 跳过结束的 ```
                    break;
                }
                codeLines.push(codeLine);
                i++;
            }

            if (codeLines.length > 0) {
                // 使用 lark_md 的代码块语法，飞书会渲染为带语法高亮的代码块
                const normalizedLang = normalizeLanguage(language);
                const codeContent = codeLines.join('\n');
                elements.push({
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: '```' + normalizedLang + '\n' + codeContent + '\n```',
                    },
                });
            }
            continue;
        }

        // 一级标题 # Title
        if (trimmedLine.startsWith('# ') && !trimmedLine.startsWith('## ')) {
            elements.push({
                tag: 'div',
                text: {
                    tag: 'plain_text',
                    content: trimmedLine.substring(2),
                },
            });
            i++;
            continue;
        }

        // 二级标题 ## Title
        if (trimmedLine.startsWith('## ') && !trimmedLine.startsWith('### ')) {
            elements.push({
                tag: 'div',
                text: {
                    tag: 'plain_text',
                    content: trimmedLine.substring(3),
                },
            });
            i++;
            continue;
        }

        // 三级标题 ### Title
        if (trimmedLine.startsWith('### ')) {
            elements.push({
                tag: 'div',
                text: {
                    tag: 'plain_text',
                    content: trimmedLine.substring(4),
                },
            });
            i++;
            continue;
        }

        // 表格处理
        if (trimmedLine.includes('|')) {
            const tableLines: string[][] = [];
            while (i < lines.length && lines[i].trim().includes('|')) {
                const row = lines[i].trim();
                if (!row.match(/^\|[-:\s|]+\|$/)) {
                    const cells = row.split('|').map(c => c.trim()).filter(c => c);
                    if (cells.length > 0) {
                        tableLines.push(cells);
                    }
                }
                i++;
            }

            if (tableLines.length > 0) {
                // 使用 column_set 实现表格
                const columns = tableLines[0].map((_, colIndex) => ({
                    tag: 'column',
                    width: 'weighted',
                    weight: 1,
                    elements: tableLines.map(row => ({
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
        if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
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
        if (trimmedLine.startsWith('> ')) {
            elements.push({
                tag: 'note',
                elements: [
                    {
                        tag: 'plain_text',
                        content: trimmedLine.substring(2),
                    },
                ],
            });
            i++;
            continue;
        }

        // 分割线
        if (trimmedLine === '---' || trimmedLine === '***') {
            elements.push({ tag: 'hr' });
            i++;
            continue;
        }

        // 普通段落（使用 lark_md 支持粗体、内联代码等）
        elements.push({
            tag: 'div',
            text: {
                tag: 'lark_md',
                content: trimmedLine,
            },
        });
        i++;
    }

    return elements;
}

/**
 * 标准化语言标识符
 * 将各种语言别名转换为飞书支持的标准语言名称
 */
function normalizeLanguage(lang: string): string {
    const languageMap: Record<string, string> = {
        'js': 'javascript',
        'ts': 'typescript',
        'py': 'python',
        'rb': 'ruby',
        'sh': 'bash',
        'shell': 'bash',
        'zsh': 'bash',
        'ps': 'powershell',
        'ps1': 'powershell',
        'c++': 'cpp',
        'c#': 'csharp',
        'cs': 'csharp',
        'kt': 'kotlin',
        'rs': 'rust',
        'golang': 'go',
        'yml': 'yaml',
        'md': 'markdown',
        'text': 'plain',
        'txt': 'plain',
        '': 'plain',
    };

    const normalized = lang.toLowerCase().trim();
    return languageMap[normalized] || normalized || 'plain';
}

/**
 * 发送结构化卡片（用于最终回复，包含思考、工具、回复等完整信息）
 */
export async function sendFinalCard(
    receiveId: string,
    title: string,
    content: string,
    options?: {
        thought?: string;
        toolCalls?: Array<{ name: string; params?: Record<string, unknown> }>;
    }
): Promise<void> {
    const client = getClient();
    const elements: any[] = [];

    // 思考过程（如果之前未发送）
    if (options?.thought && options.thought.trim()) {
        elements.push({
            tag: 'div',
            text: { tag: 'lark_md', content: `💭 **思考过程**\n> ${options.thought.substring(0, 1500)}` }
        });
    }

    // 工具调用记录
    if (options?.toolCalls && options.toolCalls.length > 0) {
        elements.push({
            tag: 'div',
            text: { tag: 'lark_md', content: `🔧 **已调用工具**\n${options.toolCalls.map(tc => `- ${tc.name}`).join('\n')}` }
        });
    }

    // 分隔线
    if (elements.length > 0) {
        elements.push({ tag: 'hr' });
    }

    // 最终回复内容 - 使用 Markdown 解析为卡片元素
    const contentElements = parseMarkdownToCardElements(content || '*(无回复内容)*');
    elements.push(...contentElements);

    const card = {
        config: { wide_screen_mode: true },
        header: {
            template: 'blue',
            title: { tag: 'plain_text', content: title }
        },
        elements
    };

    try {
        const resp = await client.im.v1.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: receiveId,
                msg_type: 'interactive',
                content: JSON.stringify(card),
            } as any,
        });
        if (resp.code !== 0) {
            console.error('[Feishu] sendFinalCard failed:', resp.msg);
        }
    } catch (e) {
        console.error('[Feishu] sendFinalCard error:', e);
    }
}

// ============ 流式卡片更新（进阶） ============

interface StreamCardState {
    messageId: string;
    thinking: string;
    toolCalls: Array<{ name: string; params?: any }>;
    message: string;
    thinkingSent: boolean;
}

const activeStreams = new Map<string, StreamCardState>();

/**
 * 创建一个新的流式卡片
 */
export async function createStreamCard(
    receiveId: string,
    title: string
): Promise<string | null> {
    const client = getClient();

    const card = {
        header: {
            template: 'grey',
            title: { tag: 'plain_text', content: title }
        },
        elements: [{
            tag: 'div',
            text: { tag: 'plain_text', content: '⏳ 处理中...' }
        }]
    };

    try {
        const resp = await client.im.v1.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: receiveId,
                msg_type: 'interactive',
                content: JSON.stringify(card),
            } as any,
        });

        if (resp.code === 0 && resp.data?.message_id) {
            activeStreams.set(resp.data.message_id, {
                messageId: resp.data.message_id,
                thinking: '',
                toolCalls: [],
                message: '',
                thinkingSent: false,
            });
            return resp.data.message_id;
        }
    } catch (e) {
        console.error('[Feishu] createStreamCard error:', e);
    }
    return null;
}

/**
 * 更新流式卡片（如果不支持，则发送新消息）
 */
export async function updateStreamCard(
    receiveId: string,
    state: {
        thinking?: string;
        toolCalls?: Array<{ name: string; params?: any }>;
        message?: string;
    },
    messageId?: string | null
): Promise<string | null> {
    const client = getClient();

    // 构造新卡片内容
    const elements: any[] = [];

    if (state.thinking && state.thinking.trim()) {
        elements.push({
            tag: 'div',
            text: { tag: 'lark_md', content: `💭 **思考**\n> ${state.thinking.substring(0, 1000)}` }
        });
    }

    if (state.toolCalls && state.toolCalls.length > 0) {
        elements.push({
            tag: 'div',
            text: { tag: 'lark_md', content: state.toolCalls.map(tc => `🔧 **${tc.name}**`).join('\n') }
        });
    }

    if (state.message && state.message.trim()) {
        elements.push({
            tag: 'div',
            text: { tag: 'lark_md', content: state.message.substring(0, 2000) }
        });
    }

    if (elements.length === 0) {
        elements.push({ tag: 'div', text: { tag: 'plain_text', content: '⏳ 处理中...' } });
    }

    const card = {
        header: {
            template: 'green',
            title: { tag: 'plain_text', content: '🤖 Kimi' }
        },
        elements
    };

    try {
        // 尝试更新现有消息
        if (messageId) {
            const resp = await client.im.v1.message.patch({
                data: { content: JSON.stringify(card) } as any,
                path: { message_id: messageId },
            });
            if (resp.code === 0) {
                return messageId;
            }
        }

        // 失败则发送新消息
        const resp = await client.im.v1.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: receiveId,
                msg_type: 'interactive',
                content: JSON.stringify(card),
            } as any,
        });
        return resp.data?.message_id || null;
    } catch (e) {
        console.error('[Feishu] updateStreamCard error:', e);
        return null;
    }
}

// ============ 表情反应 (Reaction) ============

/**
 * 添加消息表情回复
 * @param messageId 消息ID
 * @param emojiType 表情类型，如 'KEY' (键盘/输入中), 'THUMBSUP', 'HEART' 等
 * @returns reaction_id 用于后续删除
 */
export async function addReaction(messageId: string, emojiType: string): Promise<string | null> {
    const client = getClient();
    
    try {
        const resp = await client.im.messageReaction.create({
            path: { message_id: messageId },
            data: {
                reaction_type: { emoji_type: emojiType }
            }
        });
        
        if (resp.code === 0 && resp.data?.reaction_id) {
            console.log(`[Reaction] Added ${emojiType} to ${messageId.substring(0, 20)}...`);
            return resp.data.reaction_id;
        } else {
            console.error('[Reaction] Failed to add:', resp.msg);
        }
    } catch (e) {
        console.error('[Reaction] Add error:', e);
    }
    return null;
}

/**
 * 删除消息表情回复
 * @param messageId 消息ID
 * @param reactionId 表情回复ID
 */
export async function removeReaction(messageId: string, reactionId: string): Promise<void> {
    const client = getClient();
    
    try {
        const resp = await client.im.messageReaction.delete({
            path: { 
                message_id: messageId,
                reaction_id: reactionId
            }
        });
        
        if (resp.code === 0) {
            console.log(`[Reaction] Removed from ${messageId.substring(0, 20)}...`);
        } else {
            console.error('[Reaction] Failed to remove:', resp.msg);
        }
    } catch (e) {
        console.error('[Reaction] Remove error:', e);
    }
}

// ============ 兼容旧接口 ============

export async function sendStructuredCard(
    _client: lark.Client,
    receiveId: string,
    title: string,
    content: string,
    thinking?: string
): Promise<string | null> {
    console.warn('[deprecated] sendStructuredCard is deprecated, use sendFinalCard instead');
    await sendFinalCard(receiveId, title, content, { thought: thinking });
    return null;
}
