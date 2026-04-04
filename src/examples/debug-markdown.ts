/**
 * Markdown 渲染调试工具 - 富文本版
 * 将 Markdown 转换为飞书富文本格式 (post message)
 * 文档: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/im-v1/message/create
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
 * 构建简单的富文本内容
 */
function buildPostContent(title: string, markdown: string): any {
    // 将 Markdown 转为纯文本（去除格式符号）
    const plainText = markdown
        .replace(/#{1,6}\s/g, '')           // 去除标题符号
        .replace(/\*\*/g, '')               // 去除粗体符号
        .replace(/\*/g, '')                 // 去除斜体符号
        .replace(/`/g, '')                  // 去除代码符号
        .replace(/^\s*[-*]\s/gm, '• ')      // 列表符号替换
        .replace(/^\s*>\s/gm, '')           // 去除引用符号
        .replace(/^\|[-|\s]+\|$/gm, '')     // 去除表格分隔线
        .replace(/\|/g, ' ')                // 表格竖线替换为空格
        .trim();

    // 按段落分割
    const paragraphs = plainText.split('\n').filter(p => p.trim());

    // 构建 content 数组 - 每行是一个段落数组
    const content: any[][] = paragraphs.map(text => [{
        tag: 'text',
        text: text.trim(),
    }]);

    return {
        zh_cn: {
            title: title,
            content: content,
        },
    };
}

/**
 * 飞书客户端
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
     * 发送富文本消息（post）
     */
    async sendPostMessage(title: string, markdown: string) {
        console.log('[Test] 发送富文本消息 (post)...');
        
        const postContent = buildPostContent(title, markdown);

        try {
            const response = await this.client.im.message.create({
                params: { receive_id_type: 'open_id' },
                data: {
                    receive_id: TARGET_USER_ID,
                    msg_type: 'post',
                    content: JSON.stringify(postContent),
                },
            });
            console.log('✅ 富文本消息发送成功');
        } catch (error: any) {
            console.error('❌ 发送失败:', error.response?.data?.msg || error.message);
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
            console.log('✅ 纯文本消息发送成功');
        } catch (error: any) {
            console.error('❌ 发送失败:', error.response?.data?.msg || error.message);
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
                {
                    tag: 'div',
                    text: { tag: 'plain_text', content: '一、A股市场整体情况' },
                },
                { tag: 'hr' },
                {
                    tag: 'div',
                    text: { tag: 'lark_md', content: '• **上证指数**: 约3880点，近期下跌约1%' },
                },
                {
                    tag: 'div',
                    text: { tag: 'lark_md', content: '• **超大盘指数**: 2458.69点，下跌0.76%' },
                },
                { tag: 'hr' },
                {
                    tag: 'div',
                    text: { tag: 'plain_text', content: '二、国际油价影响' },
                },
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
                {
                    tag: 'note',
                    elements: [{ tag: 'plain_text', content: '💡 注意：以上数据仅供参考，投资有风险' }],
                },
                { tag: 'hr' },
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
            console.log('✅ 结构化卡片发送成功');
        } catch (error: any) {
            console.error('❌ 发送失败:', error.response?.data?.msg || error.message);
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
    await sleep(1000);

    // 2. 富文本（简化版本）
    console.log('\n--- 2. 富文本消息（简化版本）---');
    await feishu.sendPostMessage('富文本测试', TEST_MARKDOWN);
    await sleep(1000);

    // 3. 结构化卡片（最佳效果）
    console.log('\n--- 3. 结构化卡片（组件实现）---');
    await feishu.sendStructuredCard();

    console.log('\n========================================');
    console.log('测试完成，请在飞书查看效果');
    console.log('========================================');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
