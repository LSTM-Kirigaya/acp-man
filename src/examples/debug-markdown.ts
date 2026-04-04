/**
 * Markdown 渲染调试工具 - 第2版
 * 测试飞书卡片支持的各种格式
 */

import * as dotenv from 'dotenv';
import * as lark from '@larksuiteoapi/node-sdk';

dotenv.config();

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const TARGET_USER_ID = 'ou_897b50063af8d0cc7737952fe3f10aea';

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
     * 方案1: 使用飞书卡片的结构化元素（推荐）
     * 用 column_set, section 等原生组件实现表格效果
     */
    async sendStructuredCard(receiveId: string) {
        console.log('[Test] 发送结构化卡片...');
        
        const card = {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: 'plain_text', content: '📈 近期股价波动概况' },
                template: 'green',
            },
            elements: [
                // 二级标题 - 使用带样式的文本
                {
                    tag: 'div',
                    text: {
                        tag: 'plain_text',
                        content: '一、A股市场整体情况',
                    },
                },
                // 分割线
                { tag: 'hr' },
                // 列表项 - 使用字段布局
                {
                    tag: 'div',
                    fields: [
                        {
                            is_short: true,
                            text: {
                                tag: 'lark_md',
                                content: '**上证指数**\n约3880点',
                            },
                        },
                        {
                            is_short: true,
                            text: {
                                tag: 'lark_md',
                                content: '**涨跌幅**\n下跌约1%',
                            },
                        },
                    ],
                },
                {
                    tag: 'div',
                    fields: [
                        {
                            is_short: true,
                            text: {
                                tag: 'lark_md',
                                content: '**超大盘指数**\n2458.69点',
                            },
                        },
                        {
                            is_short: true,
                            text: {
                                tag: 'lark_md',
                                content: '**涨跌幅**\n下跌0.76%',
                            },
                        },
                    ],
                },
                // 分割线
                { tag: 'hr' },
                // 二级标题
                {
                    tag: 'div',
                    text: {
                        tag: 'plain_text',
                        content: '二、国际油价影响',
                    },
                },
                // 表格 - 使用 column_set 实现
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
                                {
                                    tag: 'div',
                                    text: {
                                        tag: 'plain_text',
                                        content: '品种',
                                    },
                                },
                            ],
                        },
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                {
                                    tag: 'div',
                                    text: {
                                        tag: 'plain_text',
                                        content: '最新价格',
                                    },
                                },
                            ],
                        },
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                {
                                    tag: 'div',
                                    text: {
                                        tag: 'plain_text',
                                        content: '涨跌',
                                    },
                                },
                            ],
                        },
                    ],
                },
                {
                    tag: 'column_set',
                    flex_mode: 'stretch',
                    columns: [
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                {
                                    tag: 'div',
                                    text: {
                                        tag: 'plain_text',
                                        content: '布伦特原油',
                                    },
                                },
                            ],
                        },
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                {
                                    tag: 'div',
                                    text: {
                                        tag: 'plain_text',
                                        content: '$85.32',
                                    },
                                },
                            ],
                        },
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                {
                                    tag: 'div',
                                    text: {
                                        tag: 'plain_text',
                                        content: '+1.2%',
                                    },
                                },
                            ],
                        },
                    ],
                },
                {
                    tag: 'column_set',
                    flex_mode: 'stretch',
                    columns: [
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                {
                                    tag: 'div',
                                    text: {
                                        tag: 'plain_text',
                                        content: 'WTI原油',
                                    },
                                },
                            ],
                        },
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                {
                                    tag: 'div',
                                    text: {
                                        tag: 'plain_text',
                                        content: '$81.15',
                                    },
                                },
                            ],
                        },
                        {
                            tag: 'column',
                            width: 'weighted',
                            weight: 1,
                            elements: [
                                {
                                    tag: 'div',
                                    text: {
                                        tag: 'plain_text',
                                        content: '+0.9%',
                                    },
                                },
                            ],
                        },
                    ],
                },
                // 分割线
                { tag: 'hr' },
                // 引用样式 - 使用 note
                {
                    tag: 'note',
                    elements: [
                        {
                            tag: 'plain_text',
                            content: '💡 注意：以上数据仅供参考，投资有风险',
                        },
                    ],
                },
                // 总结
                { tag: 'hr' },
                {
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: '**总结**: 建议关注政策动向和海外市场变化。',
                    },
                },
            ],
        };

        await this.sendCard(receiveId, card);
    }

    /**
     * 方案2: 纯文本卡片（简单内容）
     */
    async sendTextCard(receiveId: string, title: string, content: string) {
        console.log('[Test] 发送纯文本卡片...');
        
        const card = {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: 'plain_text', content: title },
                template: 'blue',
            },
            elements: [
                {
                    tag: 'div',
                    text: {
                        tag: 'plain_text',
                        content: content,
                    },
                },
            ],
        };

        await this.sendCard(receiveId, card);
    }

    /**
     * 方案3: 测试 lark_md 到底支持什么
     */
    async sendLarkMdTest(receiveId: string) {
        console.log('[Test] 测试 lark_md 支持...');
        
        const testContent = [
            '**粗体测试**',
            '*斜体测试*',
            '`代码测试`',
            '[链接测试](https://www.feishu.cn)',
            '~~删除线~~',
            '<at id=ou_xxx></at>',
        ].join('\n\n');

        const card = {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: 'plain_text', content: 'lark_md 语法测试' },
                template: 'orange',
            },
            elements: [
                {
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: testContent,
                    },
                },
            ],
        };

        await this.sendCard(receiveId, card);
    }

    /**
     * 发送原始 Markdown（用于对比）
     */
    async sendRawMarkdown(receiveId: string) {
        console.log('[Test] 发送原始 Markdown...');
        
        const content = `## 📈 近期股价波动概况

### 一、A股市场整体情况
- **上证指数**: 约3880点，近期下跌约1%
- **超大盘指数**: 2458.69点，下跌0.76%

### 二、国际油价影响
| 品种 | 最新价格 | 涨跌 |
|------|---------|------|
| **布伦特原油** | $85.32 | +1.2% |
| **WTI原油** | $81.15 | +0.9% |

> 注意：以上数据仅供参考，投资有风险

**总结**: 建议关注政策动向。`;

        const card = {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: 'plain_text', content: '原始 Markdown' },
                template: 'grey',
            },
            elements: [
                {
                    tag: 'div',
                    text: {
                        tag: 'plain_text',
                        content: content,
                    },
                },
            ],
        };

        await this.sendCard(receiveId, card);
    }

    private async sendCard(receiveId: string, card: any) {
        try {
            await this.client.im.message.create({
                params: { receive_id_type: 'open_id' },
                data: {
                    receive_id: receiveId,
                    msg_type: 'interactive',
                    content: JSON.stringify(card),
                },
            });
            console.log('[Test] ✅ 发送成功');
        } catch (error) {
            console.error('[Test] ❌ 发送失败:', error);
        }
    }
}

// ============ 主程序 ============

async function main() {
    console.log('=== 飞书卡片格式调试 ===\n');
    console.log(`目标用户: ${TARGET_USER_ID}\n`);

    const feishu = new FeishuClient();

    // 测试1: 结构化卡片（推荐方案）
    console.log('--- 测试1: 结构化卡片（使用 column_set 实现表格）---');
    await feishu.sendStructuredCard(TARGET_USER_ID);
    await sleep(2000);

    // 测试2: lark_md 语法测试
    console.log('\n--- 测试2: lark_md 语法支持测试 ---');
    await feishu.sendLarkMdTest(TARGET_USER_ID);
    await sleep(2000);

    // 测试3: 原始 Markdown 对比
    console.log('\n--- 测试3: 原始 Markdown（纯文本）---');
    await feishu.sendRawMarkdown(TARGET_USER_ID);

    console.log('\n=== 测试完成 ===');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
