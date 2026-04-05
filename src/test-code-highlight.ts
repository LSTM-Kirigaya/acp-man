/**
 * 代码语法高亮测试 - 使用 tag: markdown
 */

import * as dotenv from 'dotenv';
import { initFeishuClient, sendFinalCard } from './feishu-messaging.js';

dotenv.config();

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const TARGET_USER_ID = process.env.TEST_USER_ID || 'ou_897b50063af8d0cc7737952fe3f10aea';

const TEST_MARKDOWN = `## 📝 代码示例

以下是一个**带有重试机制的 HTTP 请求装饰器**：

\`\`\`python
import time
import random
import functools
from typing import Callable, TypeVar, ParamSpec

P = ParamSpec('P')
T = TypeVar('T')

def retry(max_attempts: int = 3):
    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @functools.wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_attempts:
                        raise
                    time.sleep(2 ** attempt)
        return wrapper
    return decorator
\`\`\`

### TypeScript 版本

\`\`\`typescript
interface Config {
    retries?: number;
    timeout?: number;
}

async function fetchWithRetry(url: string, config: Config = {}): Promise<Response> {
    const { retries = 3 } = config;
    return fetch(url);
}
\`\`\`

内联代码如 \`npm install\` 和 \`config.yaml\` 应该显示为代码样式。

### 表格示例

| 功能 | 说明 |
|------|------|
| 重试 | 自动重试失败请求 |
| 退避 | 指数退避策略 |`;

async function main() {
    if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
        console.error('❌ 缺少环境变量');
        process.exit(1);
    }

    console.log('========================================');
    console.log('  代码语法高亮测试 - markdown 组件');
    console.log('========================================\n');

    initFeishuClient(FEISHU_APP_ID, FEISHU_APP_SECRET);

    console.log('[Test] 发送消息...');
    
    try {
        await sendFinalCard(TARGET_USER_ID, '🧪 代码语法高亮测试', TEST_MARKDOWN);
        console.log('✅ 发送成功！');
        console.log('\n请在飞书查看，确认：');
        console.log('  - Python 代码块有彩色语法高亮');
        console.log('  - TypeScript 代码块有彩色语法高亮');
        console.log('  - 代码块有行号');
        console.log('  - 内联代码显示正确');
    } catch (e) {
        console.error('❌ 失败:', e);
    }
}

main().catch(console.error);
