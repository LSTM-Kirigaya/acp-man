/**
 * 飞书消息发送模块
 * 封装富文本和结构化卡片两种发送方式
 */

import * as lark from '@larksuiteoapi/node-sdk';

// 飞书客户端实例（单例）
let feishuClient: lark.Client | null = null;

/**
 * 初始化飞书客户端
 */
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

/**
 * 获取已初始化的飞书客户端
 */
export function getFeishuClient(): lark.Client {
    if (!feishuClient) {
        throw new Error('Feishu client not initialized. Call initFeishuClient first.');
    }
    return feishuClient;
}

/**
 * 发送富文本消息（Post）
 * 将 Markdown 转换为简化格式发送
 * 
 * @param receiveId 接收者 open_id
 * @param title 消息标题
 * @param markdown Markdown 内容
 */
export async function sendPostMessage(
    receiveId: string,
    title: string,
    markdown: string
): Promise<void> {
    const client = getFeishuClient();

    // 简化 Markdown 为纯文本
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

    // 按段落分割
    const paragraphs = plainText.split('\n').filter(p => p.trim());

    // 构建 content 数组
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
 * 发送结构化卡片消息（Interactive）
 * 支持 Markdown 标题、粗体、列表、表格等
 * 
 * @param receiveId 接收者 open_id
 * @param title 卡片标题
 * @param content 卡片内容（Markdown 格式）
 * @param thinking 可选的思考过程信息
 */
export async function sendStructuredCard(
    receiveId: string,
    title: string,
    content: string,
    thinking?: {
        thought: string;
        toolCalls: { name: string; params?: Record<string, unknown>; result?: string }[];
    }
): Promise<void> {
    const client = getFeishuClient();
    const elements: any[] = [];

    // 添加思考过程（如果有）
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

    await client.im.message.create({
        params: { receive_id_type: 'open_id' },
        data: {
            receive_id: receiveId,
            msg_type: 'interactive',
            content: JSON.stringify(card),
        },
    });
}

/**
 * 将 Markdown 解析为飞书卡片元素
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

        // 一级标题 # Title
        if (line.startsWith('# ') && !line.startsWith('## ')) {
            elements.push({
                tag: 'div',
                text: {
                    tag: 'plain_text',
                    content: line.substring(2),
                },
            });
            i++;
            continue;
        }

        // 二级标题 ## Title
        if (line.startsWith('## ') && !line.startsWith('### ')) {
            elements.push({
                tag: 'div',
                text: {
                    tag: 'plain_text',
                    content: line.substring(3),
                },
            });
            i++;
            continue;
        }

        // 三级标题 ### Title
        if (line.startsWith('### ')) {
            elements.push({
                tag: 'div',
                text: {
                    tag: 'plain_text',
                    content: line.substring(4),
                },
            });
            i++;
            continue;
        }

        // 表格处理
        if (line.includes('|')) {
            const tableLines: string[] = [];
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

        // 普通段落（使用 lark_md 支持粗体）
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
