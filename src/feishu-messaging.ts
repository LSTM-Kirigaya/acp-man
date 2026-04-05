/**
 * 飞书消息发送模块
 * 支持实时流式输出
 */

import * as lark from '@larksuiteoapi/node-sdk';

let feishuClient: lark.Client | null = null;

export function initFeishuClient(appId: string, appSecret: string): lark.Client {
    if (!feishuClient) {
        feishuClient = new lark.Client({
            appId, appSecret,
            appType: lark.AppType.SelfBuild,
            domain: lark.Domain.Feishu,
        });
    }
    return feishuClient;
}

function getClient(): lark.Client {
    if (!feishuClient) throw new Error('Not initialized');
    return feishuClient;
}

/**
 * 发送简单文本卡片（用于实时显示思考和工具调用）
 */
export async function sendTextCard(
    receiveId: string,
    title: string,
    content: string
): Promise<void> {
    const card = {
        config: { wide_screen_mode: true },
        header: {
            title: { tag: 'plain_text', content: title },
            template: title.includes('思考') ? 'blue' : 'orange',
        },
        elements: [{
            tag: 'div',
            text: { tag: 'lark_md', content: content },
        }],
    };

    await getClient().im.message.create({
        params: { receive_id_type: 'open_id' },
        data: {
            receive_id: receiveId,
            msg_type: 'interactive',
            content: JSON.stringify(card),
        },
    });
}

/**
 * 发送最终回复卡片（包含完整内容）
 */
export async function sendFinalCard(
    receiveId: string,
    title: string,
    content: string,
    meta?: { thought: string; toolCalls: any[] }
): Promise<void> {
    const elements: any[] = [];

    // 如果有未发送的思考或工具调用，在这里显示摘要
    if (meta) {
        const parts: string[] = [];
        if (meta.thought) parts.push(`💭 ${meta.thought.length} 字符`);
        if (meta.toolCalls.length) parts.push(`🔧 ${meta.toolCalls.length} 个工具`);
        if (parts.length) {
            elements.push({
                tag: 'div',
                text: { tag: 'plain_text', content: parts.join('  |  ') },
            });
            elements.push({ tag: 'hr' });
        }
    }

    // 主要内容
    elements.push(...parseContent(content));

    const card = {
        config: { wide_screen_mode: true },
        header: {
            title: { tag: 'plain_text', content: title },
            template: 'green',
        },
        elements,
    };

    await getClient().im.message.create({
        params: { receive_id_type: 'open_id' },
        data: {
            receive_id: receiveId,
            msg_type: 'interactive',
            content: JSON.stringify(card),
        },
    });
}

/**
 * 解析 Markdown 为卡片元素
 */
function parseContent(markdown: string): any[] {
    const elements: any[] = [];
    const lines = markdown.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trim();
        if (!line) { i++; continue; }

        // 标题
        if (line.startsWith('### ')) {
            elements.push({ tag: 'div', text: { tag: 'plain_text', content: line.substring(4) } });
        } else if (line.startsWith('## ')) {
            elements.push({ tag: 'div', text: { tag: 'plain_text', content: line.substring(3) } });
        } else if (line.startsWith('# ')) {
            elements.push({ tag: 'div', text: { tag: 'plain_text', content: line.substring(2) } });
        }
        // 表格
        else if (line.includes('|')) {
            const rows: string[][] = [];
            while (i < lines.length && lines[i].includes('|')) {
                const cells = lines[i].split('|').map(c => c.trim()).filter(c => c && !c.match(/^-+$/));
                if (cells.length) rows.push(cells);
                i++;
            }
            if (rows.length) {
                elements.push({
                    tag: 'column_set',
                    flex_mode: 'stretch',
                    background_style: 'grey',
                    columns: rows[0].map((_, idx) => ({
                        tag: 'column',
                        width: 'weighted',
                        weight: 1,
                        elements: rows.map(r => ({
                            tag: 'div',
                            text: { tag: 'lark_md', content: r[idx] || '' }
                        }))
                    }))
                });
            }
            continue;
        }
        // 列表
        else if (line.startsWith('- ') || line.startsWith('* ')) {
            elements.push({ tag: 'div', text: { tag: 'lark_md', content: '• ' + line.substring(2) } });
        }
        // 引用
        else if (line.startsWith('> ')) {
            elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: line.substring(2) }] });
        }
        // 普通段落
        else {
            elements.push({ tag: 'div', text: { tag: 'lark_md', content: line } });
        }
        i++;
    }

    return elements;
}
