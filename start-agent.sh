#!/bin/bash

# Feishu ACP Agent 启动脚本（WebSocket 模式）

echo "╔══════════════════════════════════════════════════════════╗"
echo "║          Feishu ACP Agent - 启动中...                    ║"
echo "║          使用 WebSocket 长连接（无需 Webhook）           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# 加载环境变量
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# 启动 Agent
TS_NODE_TRANSPILE_ONLY=true \
node --loader ts-node/esm \
--no-warnings \
src/feishu-acp-agent/index.ts
