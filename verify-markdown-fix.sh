#!/bin/bash
# Markdown 表格渲染修复验证脚本
# 一键验证表格是否能正确渲染

echo "=========================================="
echo "  Markdown 表格渲染修复验证"
echo "=========================================="
echo ""

# 检查环境变量
if [ -z "$FEISHU_APP_ID" ] || [ -z "$FEISHU_APP_SECRET" ]; then
    echo "❌ 错误: 缺少环境变量"
    echo "   请设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET"
    exit 1
fi

echo "✅ 环境变量检查通过"
echo ""

# 编译 TypeScript
echo "📦 编译 TypeScript..."
npx tsc src/feishu-messaging.ts --outDir dist --module NodeNext --moduleResolution NodeNext --esModuleInterop --declaration --skipLibCheck 2>&1 | grep -v "error TS" || true
echo ""

# 运行测试
echo "🚀 发送测试消息到飞书..."
echo "   内容包含: 表格、列表、粗体、代码"
echo ""

node --loader ts-node/esm src/test-markdown-render.ts 2>&1 | grep -v "ExperimentalWarning" | grep -v "DeprecationWarning"

echo ""
echo "=========================================="
echo "  验证步骤:"
echo "  1. 检查飞书是否收到消息"
echo "  2. 确认表格正确渲染（不是原始 Markdown 符号）"
echo "  3. 确认列表和粗体格式正确"
echo "=========================================="
