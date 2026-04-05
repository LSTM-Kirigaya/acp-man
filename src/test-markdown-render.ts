/**
 * Markdown 渲染测试脚本 - 一键验证
 * 测试内容：包含表格、列表、粗体的 Markdown
 */

import * as dotenv from 'dotenv';
import { initFeishuClient, sendFinalCard } from './feishu-messaging';

dotenv.config();

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const TARGET_USER_ID = process.env.TEST_USER_ID || 'ou_897b50063af8d0cc7737952fe3f10aea';

// 测试用的 Markdown 内容（包含表格）
const TEST_MARKDOWN = `当前工作区 \`/Users/kirigaya/project\` 包含以下内容：

### 文件夹（共 3 个）：

| 文件夹名 | 说明 |
|---------|------|
| \`project-a\` | 项目A |
| \`project-b\` | 项目B |
| \`project-c\` | 项目C |

### 文件：
- \`README.md\` - 说明文档
- \`.gitignore\` - Git忽略文件

**总计**: 3 个文件夹，2 个文件`;

async function main() {
    if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
        console.error('❌ 缺少环境变量: FEISHU_APP_ID, FEISHU_APP_SECRET');
        process.exit(1);
    }

    console.log('========================================');
    console.log('  Markdown 渲染测试 - 表格支持');
    console.log('========================================\n');

    initFeishuClient(FEISHU_APP_ID, FEISHU_APP_SECRET);

    console.log('[Test] 发送包含表格的 Markdown...');
    console.log('[Content]');
    console.log(TEST_MARKDOWN);
    console.log('');

    await sendFinalCard(TARGET_USER_ID, '📋 工作区内容', TEST_MARKDOWN);

    console.log('\n✅ 消息已发送，请在飞书查看渲染效果');
    console.log('   期望: 表格应该正确渲染，而不是显示原始 Markdown 符号');
    console.log('========================================');
}

main().catch(console.error);
