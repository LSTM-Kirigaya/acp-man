#!/usr/bin/env node
/**
 * Markdown 表格渲染修复 - 一键验证脚本
 * 使用方法: node verify-fix.mjs
 */

import { execSync } from 'child_process';

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

console.log('========================================');
console.log('  Markdown 表格渲染修复验证');
console.log('========================================\n');

// 检查环境变量
if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    console.error('❌ 错误: 缺少环境变量');
    console.error('   请设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    process.exit(1);
}

console.log('✅ 环境变量检查通过\n');
console.log('📋 测试内容预览:');
console.log('─'.repeat(40));
console.log(TEST_MARKDOWN);
console.log('─'.repeat(40));
console.log('');

console.log('🚀 正在发送测试消息到飞书...\n');

try {
    execSync(
        'node --loader ts-node/esm --no-warnings src/test-markdown-render.ts',
        { 
            cwd: '/Users/kirigaya/project/acp-man',
            stdio: 'inherit',
            env: { ...process.env }
        }
    );
} catch (e) {
    // 忽略错误，因为脚本本身会输出结果
}

console.log('\n========================================');
console.log('  验证步骤:');
console.log('  1. 打开飞书查看收到的消息');
console.log('  2. 确认表格正确渲染为表格样式');
console.log('  3. 确认没有显示原始 Markdown 符号 (|, -)');
console.log('  4. 确认列表和粗体格式正确');
console.log('========================================');
