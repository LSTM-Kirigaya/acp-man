/**
 * 代码块渲染测试 - 修复版
 */

import * as dotenv from 'dotenv';
import { initFeishuClient, sendFinalCard } from './feishu-messaging.js';

dotenv.config();

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const TARGET_USER_ID = process.env.TEST_USER_ID || 'ou_897b50063af8d0cc7737952fe3f10aea';

const TEST_MARKDOWN = `## 📝 代码示例

以下是一个**带有重试机制和指数退避的 HTTP 请求装饰器**：

\`\`\`python
import time
import random
import functools
from typing import Callable, TypeVar, ParamSpec

P = ParamSpec('P')
T = TypeVar('T')

def retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @functools.wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            attempt = 1
            current_delay = delay
            
            while attempt <= max_attempts:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_attempts:
                        raise
                    jitter = random.uniform(0, 0.1 * current_delay)
                    time.sleep(current_delay + jitter)
                    current_delay *= backoff
                    attempt += 1
        return wrapper
    return decorator
\`\`\`

### TypeScript 版本

\`\`\`typescript
interface Config {
    retries?: number;
    timeout?: number;
}

async function fetchWithRetry(
    url: string,
    config: Config = {}
): Promise<Response> {
    const { retries = 3, timeout = 5000 } = config;
    // 实现逻辑
    return fetch(url, { timeout });
}
\`\`\`

### 使用方法

在项目根目录运行：

\`\`\`bash
npm install
npm run build
npm start
\`\`\`

配置文件示例 \`config.yaml\`：

\`\`\`yaml
server:
  port: \${PORT:-8080}
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
    console.log('  代码块渲染测试 - 修复版');
    console.log('========================================\n');

    initFeishuClient(FEISHU_APP_ID, FEISHU_APP_SECRET);

    console.log('[Test] 发送包含代码块的消息...');
    
    try {
        await sendFinalCard(TARGET_USER_ID, '🧪 代码块渲染测试', TEST_MARKDOWN);
        console.log('✅ 消息发送成功！');
        console.log('\n请在飞书查看效果，确认：');
        console.log('  - Python 代码块有语法高亮');
        console.log('  - TypeScript 代码块有语法高亮');
        console.log('  - bash 代码块有语法高亮');
        console.log('  - yaml 代码块有语法高亮');
        console.log('  - 内联代码如 `config.yaml` 显示正确');
    } catch (e) {
        console.error('❌ 发送失败:', e);
    }
    
    console.log('\n========================================');
}

main().catch(console.error);
