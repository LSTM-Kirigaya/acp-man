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
 */
class MarkdownToFeishuConverter {
    /**
     * 将 Markdown 转换为飞书 post 格式
     */
    convert(markdown: string): any {
        const lines = markdown.split('\n');
        const paragraphs: any[][] = [];
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
                paragraphs.push([{
                    tag: 'text',
                    text: line.substring(2),
                    style: { bold: true, fontsize: 3 },
                }]);
                i++;
                continue;
            }

            // 二级标题 ## Title
            if (line.startsWith('## ') && !line.startsWith('### ')) {
                paragraphs.push([{
                    tag: 'text',
                    text: line.substring(3),
                    style: { bold: true, fontsize: 2 },
                }]);
                i++;
                continue;
            }

            // 三级标题 ### Title
            if (line.startsWith('### ')) {
                paragraphs.push([{
                    tag: 'text',
                    text: line.substring(4),
                    style: { bold: true, fontsize: 1 },
                }]);
                i++;
                continue;
            }

            // 引用 > text
            if (line.startsWith('> ')) {
                paragraphs.push([{
                    tag: 'text',
                    text: '💡 ' + line.substring(2),
                    style: { italic: true, bold: false },
                }]);
                i++;
                continue;
            }

            // 分割线 ---
            if (line === '---' || line === '***') {
                // 飞书 post 不支持 hr，用空行代替
                i++;
                continue;
            }

            // 表格处理
            if (line.includes('|')) {
                const tableLines: string[] = [];
                while (i < lines.length && lines[i].trim().includes('|')) {
                    tableLines.push(lines[i].trim());
                    i++;
                }

                const tableContent = this.parseTable(tableLines);
                if (tableContent) {
                    paragraphs.push(tableContent);
                }
                continue;
            }

            // 列表项 - item
            if (line.startsWith('- ') || line.startsWith('* ')) {
                const text = line.substring(2);
                const elements = this.parseInlineMarkdown(text);
                // 添加列表符号
                elements.unshift({ tag: 'text', text: '• ' });
                paragraphs.push(elements);
                i++;
                continue;
            }

            // 普通段落
            paragraphs.push(this.parseInlineMarkdown(line));
            i++;
        }

        return {
            zh_cn: {
                title: '📈 富文本消息测试',
                content: paragraphs,
            },
        };
    }

    /**
     * 解析表格
     */
    private parseTable(lines: string[]): any[] | null {
        // 过滤掉分隔行 |---|---|
        const dataLines = lines.filter(line => !line.match(/^\|[-:\s|]+\|$/));
        if (dataLines.length === 0) return null;

        const elements: any[] = [];

        // 表头（第一行）
        const headerLine = dataLines[0];
        const headers = headerLine.split('|').map(c => c.trim()).filter(c => c);
        if (headers.length > 0) {
            elements.push({
                tag: 'text',
                text: headers.join('  |  '),
                style: { bold: true },
            });
        }

        // 数据行
        for (let i = 1; i < dataLines.length; i++) {
            const cells = dataLines[i].split('|').map(c => c.trim()).filter(c => c);
            if (cells.length > 0) {
                // 解析每个单元格的行内 Markdown
                const cellElements: any[] = [];
                cells.forEach((cell, index) => {
                    if (index > 0) {
                        cellElements.push({ tag: 'text', text: '  |  ' });
                    }
                    // 解析单元格内的粗体
                    const inlineElements = this.parseInlineMarkdown(cell, false);
                    cellElements.push(...inlineElements);
                });
                elements.push(...cellElements);
            }
        }

        return elements;
    }

    /**
     * 解析行内 Markdown（粗体、斜体、代码）
     */
    private parseInlineMarkdown(text: string, addNewline: boolean = true): any[] {
        const elements: any[] = [];
        let remaining = text;

        // 处理 **粗体** 和 *斜体*
        const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
        let lastIndex = 0;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            // 添加匹配前的普通文本
            if (match.index > lastIndex) {
                elements.push({
                    tag: 'text',
                    text: text.substring(lastIndex, match.index),
                });
            }

            const content = match[0];
            if (content.startsWith('**') && content.endsWith('**')) {
                // 粗体
                elements.push({
                    tag: 'text',
                    text: content.slice(2, -2),
                    style: { bold: true },
                });
            } else if (content.startsWith('*') && content.endsWith('*')) {
                // 斜体
                elements.push({
                    tag: 'text',
                    text: content.slice(1, -1),
                    style: { italic: true },
                });
            } else if (content.startsWith('`') && content.endsWith('`')) {
                // 代码
                elements.push({
                    tag: 'text',
                    text: content.slice(1, -1),
                    style: { code: true },
                });
            }

            lastIndex = match.index + content.length;
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
        } catch (error) {
            console.error('❌ 发送失败:', error);
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
        } catch (error) {
            console.error('❌ 发送失败:', error);
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
                    text: { tag: 'plain_text', content: '一、A股市场整体情况', style: { bold: true, fontsize: 2 } },
                },
                { tag: 'hr' },
                // 列表
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
                    text: { tag: 'plain_text', content: '二、国际油价影响', style: { bold: true, fontsize: 2 } },
                },
                // 表格
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
                                { tag: 'div', text: { tag: 'plain_text', content: '品种', style: { bold: true } } },
                                { tag: 'div', text: { tag: 'plain_text', content: '布伦特原油' } },
                                { tag: 'div', text: { tag: 'plain_text', content: 'WTI原油' } },
                            ],
                        },
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                { tag: 'div', text: { tag: 'plain_text', content: '最新价格', style: { bold: true } } },
                                { tag: 'div', text: { tag: 'plain_text', content: '$85.32' } },
                                { tag: 'div', text: { tag: 'plain_text', content: '$81.15' } },
                            ],
                        },
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                { tag: 'div', text: { tag: 'plain_text', content: '涨跌', style: { bold: true } } },
                                { tag: 'div', text: { tag: 'plain_text', content: '+1.2%' } },
                                { tag: 'div', text: { tag: 'plain_text', content: '+0.9%' } },
                            ],
                        },
                    ],
                },
                { tag: 'hr' },
                // 引用
                {
                    tag: 'note',
                    elements: [{ tag: 'plain_text', content: '💡 注意：以上数据仅供参考，投资有风险' }],
                },
                { tag: 'hr' },
                // 总结
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
        } catch (error) {
            console.error('❌ 发送失败:', error);
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
