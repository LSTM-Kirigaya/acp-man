/**
 * 测试飞书支持的代码块格式
 */

import * as dotenv from 'dotenv';
import * as lark from '@larksuiteoapi/node-sdk';

dotenv.config();

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const TARGET_USER_ID = process.env.TEST_USER_ID || 'ou_897b50063af8d0cc7737952fe3f10aea';

async function main() {
    if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
        console.error('❌ 缺少环境变量');
        process.exit(1);
    }

    const client = new lark.Client({
        appId: FEISHU_APP_ID,
        appSecret: FEISHU_APP_SECRET,
        appType: lark.AppType.SelfBuild,
        domain: lark.Domain.Feishu,
    });

    console.log('测试1: 使用 lark_md + markdown 代码块语法');
    
    // 测试方式1: lark_md 中的代码块
    const card1 = {
        config: { wide_screen_mode: true },
        header: {
            title: { tag: 'plain_text', content: '🧪 测试代码块格式' },
            template: 'blue',
        },
        elements: [
            {
                tag: 'div',
                text: {
                    tag: 'lark_md',
                    content: '以下是一段 Python 代码：',
                },
            },
            {
                tag: 'div',
                text: {
                    tag: 'lark_md',
                    // 使用 markdown 代码块语法
                    content: '```python\ndef hello():\n    print("Hello World")\n```',
                },
            },
            { tag: 'hr' },
            {
                tag: 'div',
                text: {
                    tag: 'lark_md',
                    content: '内联代码测试：`npm install` 和 `pip install`',
                },
            },
        ],
    };

    try {
        const resp = await client.im.v1.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: TARGET_USER_ID,
                msg_type: 'interactive',
                content: JSON.stringify(card1),
            } as any,
        });
        
        if (resp.code === 0) {
            console.log('✅ 测试1 发送成功');
        } else {
            console.error('❌ 测试1 失败:', resp.msg);
        }
    } catch (e: any) {
        console.error('❌ 测试1 错误:', e.response?.data || e.message);
    }

    // 等待一下再发第二条
    await new Promise(r => setTimeout(r, 1000));

    console.log('\n测试2: 使用 tag: markdown (如果支持)');
    
    const card2 = {
        config: { wide_screen_mode: true },
        header: {
            title: { tag: 'plain_text', content: '🧪 测试 markdown 组件' },
            template: 'green',
        },
        elements: [
            {
                tag: 'markdown',
                content: '```typescript\nconst x: number = 42;\nconsole.log(x);\n```',
            },
        ],
    };

    try {
        const resp = await client.im.v1.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: TARGET_USER_ID,
                msg_type: 'interactive',
                content: JSON.stringify(card2),
            } as any,
        });
        
        if (resp.code === 0) {
            console.log('✅ 测试2 发送成功');
        } else {
            console.error('❌ 测试2 失败:', resp.msg);
        }
    } catch (e: any) {
        console.error('❌ 测试2 错误:', e.response?.data || e.message);
    }
}

main().catch(console.error);
