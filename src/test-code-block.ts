/**
 * 代码块渲染测试脚本
 * 测试内容：包含代码块、内联代码、表格的 Markdown
 */

import * as dotenv from 'dotenv';
import { initFeishuClient, sendFinalCard } from './feishu-messaging.js';

dotenv.config();

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const TARGET_USER_ID = process.env.TEST_USER_ID || 'ou_897b50063af8d0cc7737952fe3f10aea';

// 测试用的 Markdown 内容（包含代码块和内联代码）
const TEST_MARKDOWN = `## 📝 代码示例

当前工作目录 \`/Users/kirigaya/project\` 下有以下文件：

### 1. 安装依赖

使用 npm 安装：
\`\`\`bash
npm install @agentclientprotocol/sdk
\`\`\`

### 2. TypeScript 示例代码

\`\`\`typescript
import { ClientSideConnection } from '@agentclientprotocol/sdk';

async function main() {
    const connection = new ClientSideConnection();
    await connection.initialize({
        protocolVersion: '2024-11-05',
        clientCapabilities: {
            fs: { readTextFile: true }
        }
    });
    console.log('Connected!');
}
\`\`\`

### 3. Python 示例

\`\`\`python
def hello_world():
    """简单的问候函数"""
    name = "飞书"
    return f"Hello, {name}!"

result = hello_world()
print(result)
\`\`\`

### 4. 项目列表

| 项目名称 | 语言 | 说明 |
|---------|------|------|
| \`acp-man\` | TypeScript | ACP 管理工具 |
| \`server\` | Go | 后端服务 |
| \`web\` | Vue | 前端应用 |

### 5. 配置文件示例

\`\`\`yaml
# config.yaml
server:
  port: 8080
  host: 0.0.0.0

database:
  url: \${DATABASE_URL}
  pool_size: 10
\`\`\`

**注意**: 请确保 \`NODE_ENV\` 设置为 \`production\` 后再部署。`;

async function main() {
    if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
        console.error('❌ 缺少环境变量: FEISHU_APP_ID, FEISHU_APP_SECRET');
        process.exit(1);
    }

    console.log('========================================');
    console.log('  代码块渲染测试');
    console.log('========================================\n');

    initFeishuClient(FEISHU_APP_ID, FEISHU_APP_SECRET);

    console.log('[Test] 发送包含代码块的 Markdown...');
    console.log('[Content 预览]');
    console.log(TEST_MARKDOWN.substring(0, 500) + '...');
    console.log('');

    await sendFinalCard(TARGET_USER_ID, '🧪 代码块渲染测试', TEST_MARKDOWN);

    console.log('\n✅ 消息已发送，请在飞书查看渲染效果');
    console.log('   期望:');
    console.log('   - 代码块应有语法高亮');
    console.log('   - 内联代码 (如 `acp-man`) 应显示为代码样式');
    console.log('   - 表格应正确渲染');
    console.log('========================================');
}

main().catch(console.error);
