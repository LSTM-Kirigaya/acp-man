/**
 * Markdown 渲染调试工具 - 最终版
 * 明确展示飞书不同消息类型的 Markdown 支持差异
 * 
 * 重要结论：
 * 1. 纯文本(text) - ❌ 完全不支持 Markdown，会显示原始符号 ## | ** 等
 * 2. 富文本(post) - ⚠️  支持有限，需手动解析为飞书格式
 * 3. 卡片(interactive) - ✅ 支持结构化组件，但 lark_md 仅支持粗体/斜体等简单语法
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
     * 测试1: 纯文本消息 - ❌ 不支持 Markdown
     * 结果：会原样显示 ## ** | 等符号
     */
    async test1_Text() {
        console.log('[Test 1] 纯文本消息 (text) - 不支持 Markdown');
        console.log('         预期：显示原始符号 ## ** | 等');
        
        try {
            await this.client.im.message.create({
                params: { receive_id_type: 'open_id' },
                data: {
                    receive_id: TARGET_USER_ID,
                    msg_type: 'text',
                    content: JSON.stringify({ text: TEST_MARKDOWN }),
                },
            });
            console.log('         ✅ 发送成功\n');
        } catch (error) {
            console.error('         ❌ 失败:', error);
        }
    }

    /**
     * 测试2: 富文本消息 - ⚠️ 有限支持
     * 需要手动将 Markdown 转换为飞书的 post 格式
     */
    async test2_Post() {
        console.log('[Test 2] 富文本消息 (post) - 有限支持');
        console.log('         说明：手动解析 Markdown 为飞书格式');
        
        // 手动解析 Markdown 为飞书 post 格式
        const postContent = this.parseMarkdownToPost(TEST_MARKDOWN);
        
        try {
            await this.client.im.message.create({
                params: { receive_id_type: 'open_id' },
                data: {
                    receive_id: TARGET_USER_ID,
                    msg_type: 'post',
                    content: JSON.stringify({
                        zh_cn: {
                            title: '📈 富文本消息测试 (Post)',
                            content: postContent,
                        },
                    }),
                },
            });
            console.log('         ✅ 发送成功\n');
        } catch (error) {
            console.error('         ❌ 失败:', error);
        }
    }

    /**
     * 测试3: 卡片消息 - lark_md 简单语法支持
     * 仅支持 **粗体** *斜体* `代码` [链接](url) <at> 等简单语法
     * 不支持 ##标题 |表格|
     */
    async test3_Card_LarkMd() {
        console.log('[Test 3] 卡片消息 - lark_md 简单语法');
        console.log('         说明：仅支持 **粗体** *斜体* `代码` [链接] <at>');
        console.log('         不支持：##标题 |表格| >引用');
        
        const card = {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: 'plain_text', content: 'lark_md 简单语法测试' },
                template: 'orange',
            },
            elements: [
                {
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: TEST_MARKDOWN, // 直接用原始 Markdown 测试
                    },
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
            console.log('         ✅ 发送成功\n');
        } catch (error) {
            console.error('         ❌ 失败:', error);
        }
    }

    /**
     * 测试4: 卡片消息 - 结构化组件 ✅ 推荐方案
     * 使用 column_set, div, note 等组件实现类似效果
     */
    async test4_Card_Structured() {
        console.log('[Test 4] 卡片消息 - 结构化组件 (推荐)');
        console.log('         说明：使用 column_set 实现表格，div 实现标题');
        
        const card = {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: 'plain_text', content: '📈 近期股价波动概况' },
                template: 'green',
            },
            elements: [
                // 二级标题
                {
                    tag: 'div',
                    text: { tag: 'plain_text', content: '一、A股市场整体情况', style: { bold: true, fontsize: 2 } },
                },
                { tag: 'hr' },
                // 列表项（使用 lark_md 支持粗体）
                {
                    tag: 'div',
                    text: { tag: 'lark_md', content: '• **上证指数**: 约3880点，近期下跌约1%' },
                },
                {
                    tag: 'div',
                    text: { tag: 'lark_md', content: '• **超大盘指数**: 2458.69点，下跌0.76%' },
                },
                { tag: 'hr' },
                // 二级标题
                {
                    tag: 'div',
                    text: { tag: 'plain_text', content: '二、国际油价影响', style: { bold: true, fontsize: 2 } },
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
            console.log('         ✅ 发送成功\n');
        } catch (error) {
            console.error('         ❌ 失败:', error);
        }
    }

    /**
     * 将 Markdown 解析为飞书 post 格式
     */
    private parseMarkdownToPost(markdown: string): any[][] {
        const lines = markdown.split('\n');
        const paragraphs: any[][] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue;

            // 标题
            if (line.startsWith('### ')) {
                paragraphs.push([{ tag: 'text', text: line.substring(4), style: { bold: true, fontsize: 1 } }]);
                continue;
            }
            if (line.startsWith('## ')) {
                paragraphs.push([{ tag: 'text', text: line.substring(3), style: { bold: true, fontsize: 2 } }]);
                continue;
            }

            // 列表项 - 手动解析粗体
            if (line.startsWith('- ') || line.startsWith('* ')) {
                const text = line.substring(2);
                const elements = this.parseInlineStyles(text, '• ');
                paragraphs.push(elements);
                continue;
            }

            // 表格行（简化）
            if (line.includes('|') && !line.match(/^\|[-:\s|]+\|$/)) {
                const cells = line.split('|').map(c => c.trim()).filter(c => c);
                paragraphs.push([{ tag: 'text', text: cells.join('  |  '), style: { bold: true } }]);
                continue;
            }

            // 引用
            if (line.startsWith('> ')) {
                paragraphs.push([{ tag: 'text', text: line.substring(2), style: { italic: true } }]);
                continue;
            }

            // 普通文本
            paragraphs.push(this.parseInlineStyles(line));
        }

        return paragraphs;
    }

    private parseInlineStyles(text: string, prefix: string = ''): any[] {
        const elements: any[] = [];
        if (prefix) {
            elements.push({ tag: 'text', text: prefix });
        }

        // 简单的 **粗体** 解析
        const parts = text.split(/(\*\*.*?\*\*)/g);
        for (const part of parts) {
            if (part.startsWith('**') && part.endsWith('**')) {
                elements.push({ tag: 'text', text: part.slice(2, -2), style: { bold: true } });
            } else if (part) {
                elements.push({ tag: 'text', text: part });
            }
        }

        return elements.length > 0 ? elements : [{ tag: 'text', text: prefix + text }];
    }
}

// ============ 主程序 ============

async function main() {
    console.log('========================================');
    console.log('  飞书 Markdown 渲染测试 - 最终版');
    console.log('========================================\n');
    console.log('重要结论：');
    console.log('• 纯文本(text): ❌ 完全不支持 Markdown');
    console.log('• 富文本(post): ⚠️  有限支持，需手动转换');
    console.log('• 卡片(interactive): ✅ 结构化组件效果最佳\n');
    console.log(`目标用户: ${TARGET_USER_ID}\n`);

    const feishu = new FeishuClient();

    await feishu.test1_Text();
    await sleep(1500);

    await feishu.test2_Post();
    await sleep(1500);

    await feishu.test3_Card_LarkMd();
    await sleep(1500);

    await feishu.test4_Card_Structured();

    console.log('========================================');
    console.log('所有测试已发送，请在飞书查看效果对比');
    console.log('========================================');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
