/**
 * Markdown 渲染调试工具 - 富文本版
 * 将 Markdown 转换为飞书富文本格式 (post message)
 */

import * as dotenv from 'dotenv';
import * as lark from '@larksuiteoapi/node-sdk';

dotenv.config();

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const TARGET_USER_ID = 'ou_897b50063af8d0cc7737952fe3f10aea';

const TEST_MARKDOWN = `## 📈 近期股价波动概况

### 一、A股市场整体情况
- **上证指数**: 约3880点，近期下跌约1%
- **超大盘指数**: 2458.69点，下跌0.76%

### 二、国际油价影响
| 品种 | 最新价格 | 涨跌 |
|------|---------|------|
| **布伦特原油** | $85.32 | +1.2% |
| **WTI原油** | $81.15 | +0.9% |

> 注意：以上数据仅供参考，投资有风险

**总结**: 建议关注政策动向和海外市场变化。`;

if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
    console.error('❌ 缺少环境变量');
    process.exit(1);
}

/**
 * Markdown 转飞书富文本转换器
 * 参考: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/im-v1/message/create
 */
class MarkdownToFeishuConverter {
    /**
     * 将 Markdown 转换为飞书 post 格式
     */
    convert(markdown: string): any {
        const lines = markdown.split('\n');
        const content: any[][] = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i].trim();

            // 空行跳过
            if (line === '') {
                i++;
                continue;
            }

            // 一级标题 # Title
            if (line.startsWith('# ') && !line.startsWith('## ')) {
                content.push([{
                    tag: 'text',
                    text: line.substring(2),
                    style: { bold: true },
                }]);
                i++;
                continue;
            }

            // 二级标题 ## Title
            if (line.startsWith('## ') && !line.startsWith('### ')) {
                content.push([{
                    tag: 'text',
                    text: line.substring(3),
                    style: { bold: true },
                }]);
                i++;
                continue;
            }

            // 三级标题 ### Title
            if (line.startsWith('### ')) {
                content.push([{
                    tag: 'text',
                    text: line.substring(4),
                    style: { bold: true },
                }]);
                i++;
                continue;
            }

            // 引用 > text
            if (line.startsWith('> ')) {
                content.push([{
                    tag: 'text',
                    text: '💡 ' + line.substring(2),
                }]);
                i++;
                continue;
            }

            // 分割线 ---
            if (line === '---' || line === '***') {
                i++;
                continue;
            }

            // 表格处理
            if (line.includes('|')) {
                const tableLines: string[] = [];
                while (i < lines.length && lines[i].trim().includes('|')) {
                    const row = lines[i].trim();
                    // 跳过分隔行 |---|---|
                    if (!row.match(/^\|[-:\s|]+\|$/)) {
                        tableLines.push(row);
                    }
                    i++;
                }

                // 简化表格为文本行
                for (const row of tableLines) {
                    const cells = row.split('|').map(c => c.trim()).filter(c => c);
                    if (cells.length > 0) {
                        content.push(this.parseInlineMarkdown(cells.join('  |  ')));
                    }
                }
                continue;
            }

            // 列表项 - item
            if (line.startsWith('- ') || line.startsWith('* ')) {
                const text = line.substring(2);
                const elements = this.parseInlineMarkdown(text);
                // 添加列表符号
                elements.unshift({ tag: 'text', text: '• ' });
                content.push(elements);
                i++;
                continue;
            }

            // 普通段落
            content.push(this.parseInlineMarkdown(line));
            i++;
        }

        return {
            zh_cn: {
                title: '富文本测试',
                content: content,
            },
        };
    }

    /**
     * 解析行内 Markdown（粗体、斜体、代码）
     * 返回元素数组，每个段落必须是一个数组
     */
    private parseInlineMarkdown(text: string): any[] {
        const elements: any[] = [];
        
        // 简单的 **粗体** 解析
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        
        for (const part of parts) {
            if (part.startsWith('**') && part.endsWith('**')) {
                elements.push({
                    tag: 'text',
                    text: part.slice(2, -2),
                    style: { bold: true },
                });
            } else if (part) {
                // 处理行内代码 `code`
                const codeParts = part.split(/(`[^`]+`)/g);
                for (const codePart of codeParts) {
                    if (codePart.startsWith('`') && codePart.endsWith('`')) {
                        elements.push({
                            tag: 'text',
                            text: codePart.slice(1, -1),
                        });
                    } else if (codePart) {
                        elements.push({ tag: 'text', text: codePart });
                    }
                }
            }
        }

        if (elements.length === 0) {
            elements.push({ tag: 'text', text: text });
        }

        return elements;
    }
}

/**
 * 飞书客户端
 */
class FeishuClient {
    private client: lark.Client;
    private converter: MarkdownToFeishuConverter;

    constructor() {
        this.client = new lark.Client({
            appId: FEISHU_APP_ID!,
            appSecret: FEISHU_APP_SECRET!,
            appType: lark.AppType.SelfBuild,
            domain: lark.Domain.Feishu,
        });
        this.converter = new MarkdownToFeishuConverter();
    }

    /**
     * 发送富文本消息（post）
     */
    async sendPostMessage(title: string, markdown: string) {
        console.log('[Test] 发送富文本消息 (post)...');
        
        const postContent = this.converter.convert(markdown);
        postContent.zh_cn.title = title;

        try {
            await this.client.im.message.create({
                params: { receive_id_type: 'open_id' },
                data: {
                    receive_id: TARGET_USER_ID,
                    msg_type: 'post',
                    content: JSON.stringify(postContent),
                },
            });
            console.log('✅ 富文本消息发送成功\n');
        } catch (error: any) {
            console.error('❌ 发送失败:', error.response?.data || error.message);
        }
    }

    /**
     * 发送纯文本消息（对比用）
     */
    async sendTextMessage(text: string) {
        console.log('[Test] 发送纯文本消息 (text) - 对比用...');
        
        try {
            await this.client.im.message.create({
                params: { receive_id_type: 'open_id' },
                data: {
                    receive_id: TARGET_USER_ID,
                    msg_type: 'text',
                    content: JSON.stringify({ text }),
                },
            });
            console.log('✅ 纯文本消息发送成功\n');
        } catch (error: any) {
            console.error('❌ 发送失败:', error.response?.data || error.message);
        }
    }

    /**
     * 发送结构化卡片（最佳效果）
     */
    async sendStructuredCard() {
        console.log('[Test] 发送结构化卡片 (interactive) - 最佳效果...');
        
        const card = {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: 'plain_text', content: '📈 近期股价波动概况' },
                template: 'green',
            },
            elements: [
                // 标题
                {
                    tag: 'div',
                    text: { tag: 'plain_text', content: '一、A股市场整体情况' },
                },
                { tag: 'hr' },
                // 列表 - 使用 lark_md 支持粗体
                {
                    tag: 'div',
                    text: { tag: 'lark_md', content: '• **上证指数**: 约3880点，近期下跌约1%' },
                },
                {
                    tag: 'div',
                    text: { tag: 'lark_md', content: '• **超大盘指数**: 2458.69点，下跌0.76%' },
                },
                { tag: 'hr' },
                // 标题
                {
                    tag: 'div',
                    text: { tag: 'plain_text', content: '二、国际油价影响' },
                },
                // 表格 - 使用 column_set
                {
                    tag: 'column_set',
                    flex_mode: 'stretch',
                    background_style: 'grey',
                    columns: [
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                { tag: 'div', text: { tag: 'plain_text', content: '品种' } },
                                { tag: 'div', text: { tag: 'plain_text', content: '布伦特原油' } },
                                { tag: 'div', text: { tag: 'plain_text', content: 'WTI原油' } },
                            ],
                        },
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                { tag: 'div', text: { tag: 'plain_text', content: '最新价格' } },
                                { tag: 'div', text: { tag: 'plain_text', content: '$85.32' } },
                                { tag: 'div', text: { tag: 'plain_text', content: '$81.15' } },
                            ],
                        },
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                { tag: 'div', text: { tag: 'plain_text', content: '涨跌' } },
                                { tag: 'div', text: { tag: 'plain_text', content: '+1.2%' } },
                                { tag: 'div', text: { tag: 'plain_text', content: '+0.9%' } },
                            ],
                        },
                    ],
                },
                { tag: 'hr' },
                // 引用 - 使用 note
                {
                    tag: 'note',
                    elements: [{ tag: 'plain_text', content: '💡 注意：以上数据仅供参考，投资有风险' }],
                },
                { tag: 'hr' },
                // 总结 - lark_md 粗体
                {
                    tag: 'div',
                    text: { tag: 'lark_md', content: '**总结**: 建议关注政策动向和海外市场变化。' },
                },
            ],
        };

        try {
            await this.client.im.message.create({
                params: { receive_id_type: 'open_id' },
                data: {
                    receive_id: TARGET_USER_ID,
                    msg_type: 'interactive',
                    content: JSON.stringify(card),
                },
            });
            console.log('✅ 结构化卡片发送成功\n');
        } catch (error: any) {
            console.error('❌ 发送失败:', error.response?.data || error.message);
        }
    }
}

// ============ 主程序 ============

async function main() {
    console.log('========================================');
    console.log('  富文本 Markdown 渲染测试');
    console.log('========================================\n');

    const feishu = new FeishuClient();

    // 1. 纯文本（对比）
    console.log('--- 1. 纯文本消息（显示原始符号）---');
    await feishu.sendTextMessage(TEST_MARKDOWN);
    await sleep(1500);

    // 2. 富文本（基础转换）
    console.log('--- 2. 富文本消息（Markdown 转换）---');
    await feishu.sendPostMessage('富文本测试', TEST_MARKDOWN);
    await sleep(1500);

    // 3. 结构化卡片（最佳效果）
    console.log('--- 3. 结构化卡片（组件实现）---');
    await feishu.sendStructuredCard();

    console.log('========================================');
    console.log('测试完成，请在飞书查看效果');
    console.log('========================================');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
