# Kimi ACP 客户端

一个用于连接 Kimi CLI (ACP 服务端) 的 TypeScript 客户端实现。

## 什么是 ACP?

ACP (Agent Client Protocol) 是一种标准化协议，用于规范 IDE 和其他客户端与 AI Agent（如 Kimi CLI）之间的通信。

- **服务端**: Kimi CLI (`kimi acp` 命令)
- **客户端**: 你的应用程序或 IDE（本实现）

## 安装

```bash
npm install @agentclientprotocol/sdk
```

## 前置要求

1. 安装 Kimi CLI:
```bash
npm install -g @anthropic-ai/kimi-cli
```

2. 登录 Kimi:
```bash
kimi login
```

## 快速开始

### 最小案例

```typescript
import { KimiAcpClient } from './kimi-acp-client';

async function main() {
  // 1. 创建客户端
  const client = new KimiAcpClient({ debug: true });

  // 2. 连接服务端
  await client.connect();

  // 3. 创建会话
  const session = await client.newSession(process.cwd());

  // 4. 发送消息
  const response = await client.sendMessage(
    session.sessionId, 
    '你好，请介绍一下自己'
  );

  // 5. 处理响应
  console.log(response.content?.[0]?.text);

  // 6. 断开连接
  await client.disconnect();
}

main();
```

## API 参考

### KimiAcpClient

#### 构造函数

```typescript
const client = new KimiAcpClient({
  // Kimi CLI 路径（可选，默认使用系统 PATH 中的 kimi）
  kimiPath?: string;
  
  // 工作目录（可选）
  cwd?: string;
  
  // 环境变量（可选）
  env?: Record<string, string>;
  
  // 是否启用调试日志
  debug?: boolean;
});
```

#### 方法

| 方法 | 描述 |
|------|------|
| `connect()` | 连接到 Kimi ACP 服务端 |
| `disconnect()` | 断开连接 |
| `newSession(cwd, options)` | 创建新会话 |
| `sendMessage(sessionId, prompt, options)` | 发送消息到会话 |
| `cancelSession(sessionId)` | 取消当前会话 |

#### 事件处理器

```typescript
// 处理会话更新（流式响应）
client.onSessionUpdate = (update) => {
  switch (update.update.type) {
    case 'text_delta':
      process.stdout.write(update.update.delta);
      break;
    case 'thinking_delta':
      console.log('[思考]', update.update.delta);
      break;
    case 'tool_call_start':
      console.log('[工具]', update.update.title);
      break;
  }
};

// 处理权限请求
client.onPermissionRequest = async (request) => {
  console.log('需要权限:', request.title);
  // 返回批准或拒绝
  return { outcome: 'approved' };
  // return { outcome: 'denied', reason: '用户拒绝' };
};
```

## 完整示例

运行完整示例:

```bash
npx ts-node src/kimi-acp-client/example.ts
```

运行最小案例:

```bash
npx ts-node src/kimi-acp-client/minimal.ts
```

## ACP 协议流程

```
┌─────────┐                    ┌─────────────┐
│ Client  │ ◄───── stdio ─────►│ Kimi (ACP)  │
│ (本库)  │    (JSON-RPC)      │ (服务端)    │
└────┬────┘                    └──────┬──────┘
     │                                │
     │ 1. initialize                  │
     │ ─────────────────────────────►│
     │ ◄─────────────────────────────│
     │                                │
     │ 2. session/new                 │
     │ ─────────────────────────────►│
     │ ◄─────────────────────────────│
     │                                │
     │ 3. session/prompt (重复)       │
     │ ─────────────────────────────►│
     │ ◄─────────────────────────────│
     │    (流式更新 via notification) │
```

## 相关链接

- [Kimi CLI 文档](https://moonshotai.github.io/kimi-cli/)
- [ACP 协议规范](https://agentclientprotocol.com/)
- [@agentclientprotocol/sdk](https://www.npmjs.com/package/@agentclientprotocol/sdk)
