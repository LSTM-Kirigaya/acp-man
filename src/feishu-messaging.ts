/**
 * 飞书消息发送模块
 * 支持实时流式输出（思考过程、工具调用、最终回复）
 */

import * as lark from '@larksuiteoapi/node-sdk';

let feishuClient: lark.Client | null = null;

export function initFeishuClient(appId: string, appSecret: string): lark.Client {
    if (!feishuClient) {
        feishuClient = new lark.Client({
            appId,
            appSecret,
            appType: lark.AppType.SelfBuild,
            domain: lark.Domain.Feishu,
        });
    }
    return feishuClient;
}

export function getFeishuClient(): lark.Client {
    if (!feishuClient) {
        throw new Error('Feishu client not initialized');
    }
    return feishuClient;
}

// 存储消息ID用于更新
const messageStore = new Map<string, string>();

/**
 * 发送/更新思考过程卡片
 * @param receiveId 接收者ID
 * @param thinkingContent 思考内容
 * @param messageId 可选，如果提供则更新原有消息
 * @returns 消息ID
 */
export async function sendThinkingCard(
    receiveId: string,
    thinkingContent: string,
    messageId?: string
): Promise<string> {
    const client = getFeishuClient();
    
    const card = {
        config: { wide_screen_mode: true },
        header: {
            title: { tag: 'plain_text', content: '🤔 思考中...' },
            template: 'blue',
        },
        elements: [
            {
                tag: 'div',
                text: {
                    tag: 'plain_text',
                    content: thinkingContent.substring(0, 1000), // 限制长度
                },
            },
        ],
    };

    try {
        if (messageId) {
            // 更新现有消息
            await client.im.message.patch({
                path: { message_id: messageId },
                data: {
                    content: JSON.stringify(card),
                },
            });
            return messageId;
        } else {
            // 发送新消息
            const response = await client.im.message.create({
                params: { receive_id_type: 'open_id' },
                data: {
                    receive_id: receiveId,
                    msg_type: 'interactive',
                    content: JSON.stringify(card),
                },
            });
            return (response.data as any)?.message_id || '';
        }
    } catch (error) {
        console.error('[sendThinkingCard] Error:', error);
        throw error;
    }
}

/**
 * 发送/更新工具调用卡片
 * @param receiveId 接收者ID
 * @param toolCallText 工具调用描述
 * @param messageId 可选，如果提供则追加到原有消息
 * @returns 消息ID
 */
export async function sendToolCallCard(
    receiveId: string,
    toolCallText: string,
    messageId?: string
): Promise<string> {
    const client = getFeishuClient();
    
    // 如果已有消息ID，获取现有工具列表并追加
    let toolCalls: string[] = [];
    if (messageId && messageStore.has(messageId)) {
        const stored = messageStore.get(messageId);
        if (stored) {
            toolCalls = JSON.parse(stored);
        }
    }
    toolCalls.push(toolCallText);
    
    // 保存到存储
    const storeKey = messageId || `new_${Date.now()}`;
    messageStore.set(storeKey, JSON.stringify(toolCalls));
    
    const card = {
        config: { wide_screen_mode: true },
        header: {
            title: { tag: 'plain_text', content: '🔧 工具调用' },
            template: 'orange',
        },
        elements: toolCalls.map(tc => ({
            tag: 'div',
            text: {
                tag: 'lark_md',
                content: tc,
            },
        })),
    };

    try {
        if (messageId) {
            await client.im.message.patch({
                path: { message_id: messageId },
                data: {
                    content: JSON.stringify(card),
                },
            });
            return messageId;
        } else {
            const response = await client.im.message.create({
                params: { receive_id_type: 'open_id' },
                data: {
                    receive_id: receiveId,
                    msg_type: 'interactive',
                    content: JSON.stringify(card),
                },
            });
            const newMessageId = (response.data as any)?.message_id || '';
            // 迁移存储
            if (newMessageId) {
                messageStore.set(newMessageId, JSON.stringify(toolCalls));
                messageStore.delete(storeKey);
            }
            return newMessageId;
        }
    } catch (error) {
        console.error('[sendToolCallCard] Error:', error);
        throw error;
    }
}

/**
 * 发送最终回复卡片
 * @param receiveId 接收者ID
 * @param title 标题
 * @param content 最终内容
 * @param thinking 思考过程信息
 * @param messageId 可选，更新已有消息
 */
export async function sendFinalCard(
    receiveId: string,
    title: string,
    content: string,
    thinking?: {
        thought: string;
        toolCalls: { name: string; params?: Record<string, unknown> }[];
    },
    messageId?: string
): Promise<string> {
    const client = getFeishuClient();
    
    const elements: any[] = [];

    // 添加思考过程折叠面板（如果有）
    if (thinking && (thinking.thought || thinking.toolCalls.length > 0)) {
        let summaryText = '';
        if (thinking.toolCalls.length > 0) {
            summaryText += `🔧 ${thinking.toolCalls.length} 个工具调用 `;
        }
        if (thinking.thought) {
            summaryText += `💭 ${thinking.thought.length} 字符思考`;
        }

        elements.push({
            tag: 'div',
            text: {
                tag: 'plain_text',
                content: summaryText,
            },
        });
        elements.push({ tag: 'hr' });
    }

    // 添加主要内容
    const contentElements = parseMarkdownToCardElements(content);
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
        if (messageId) {
            // 尝试更新，如果失败则发送新消息
            try {
                await client.im.message.patch({
                    path: { message_id: messageId },
                    data: {
                        content: JSON.stringify(card),
                    },
                });
                return messageId;
            } catch (e) {
                // 更新失败，发送新消息
                console.log('[sendFinalCard] Update failed, sending new message');
            }
        }
        
        const response = await client.im.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: receiveId,
                msg_type: 'interactive',
                content: JSON.stringify(card),
            },
        });
        return (response.data as any)?.message_id || '';
    } catch (error) {
        console.error('[sendFinalCard] Error:', error);
        throw error;
    }
}

/**
 * 发送富文本消息（简化版，用于后备）
 */
export async function sendPostMessage(
    receiveId: string,
    title: string,
    markdown: string
): Promise<void> {
    const client = getFeishuClient();

    const plainText = markdown
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .replace(/^\s*[-*]\s/gm, '• ')
        .replace(/^\s*>\s/gm, '')
        .replace(/^\|[-|\s]+\|$/gm, '')
        .replace(/\|/g, ' ')
        .trim();

    const paragraphs = plainText.split('\n').filter(p => p.trim());
    const content = paragraphs.map(text => [{
        tag: 'text',
        text: text.trim(),
    }]);

    const postContent = {
        zh_cn: {
            title: title,
            content: content,
        },
    };

    await client.im.message.create({
        params: { receive_id_type: 'open_id' },
        data: {
            receive_id: receiveId,
            msg_type: 'post',
            content: JSON.stringify(postContent),
        },
    });
}

/**
 * 解析 Markdown 为卡片元素
 */
function parseMarkdownToCardElements(markdown: string): any[] {
    const elements: any[] = [];
    const lines = markdown.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trim();

        if (line === '') {
            i++;
            continue;
        }

        // 标题
        if (line.startsWith('# ') && !line.startsWith('## ')) {
            elements.push({
                tag: 'div',
                text: { tag: 'plain_text', content: line.substring(2) },
            });
            i++;
            continue;
        }

        if (line.startsWith('## ') && !line.startsWith('### ')) {
            elements.push({
                tag: 'div',
                text: { tag: 'plain_text', content: line.substring(3) },
            });
            i++;
            continue;
        }

        if (line.startsWith('### ')) {
            elements.push({
                tag: 'div',
                text: { tag: 'plain_text', content: line.substring(4) },
            });
            i++;
            continue;
        }

        // 表格
        if (line.includes('|')) {
            const tableLines: string[][] = [];
            while (i < lines.length && lines[i].trim().includes('|')) {
                const row = lines[i].trim();
                if (!row.match(/^\|[-:\s|]+\|$/)) {
                    const cells = row.split('|').map(c => c.trim()).filter(c => c);
                    if (cells.length > 0) tableLines.push(cells);
                }
                i++;
            }

            if (tableLines.length > 0) {
                const columns = tableLines[0].map((_, colIndex) => ({
                    tag: 'column',
                    width: 'weighted',
                    weight: 1,
                    elements: tableLines.map(row => ({
                        tag: 'div',
                        text: { tag: 'lark_md', content: row[colIndex] || '' },
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

        // 列表
        if (line.startsWith('- ') || line.startsWith('* ')) {
            const listItems: any[] = [];
            while (i < lines.length) {
                const itemLine = lines[i].trim();
                if (!itemLine.startsWith('- ') && !itemLine.startsWith('* ')) break;
                listItems.push({
                    tag: 'div',
                    text: { tag: 'lark_md', content: '• ' + itemLine.substring(2) },
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
                elements: [{ tag: 'plain_text', content: line.substring(2) }],
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

        // 普通段落
        elements.push({
            tag: 'div',
            text: { tag: 'lark_md', content: line },
        });
        i++;
    }

    return elements;
}
