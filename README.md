# 飞书消息中间层系统

一个抽象的飞书消息系统，提供统一的消息接口，支持消息发送和接收。设计参考小龙虾的抽象理念，通过中间层将平台特定 API 与业务逻辑解耦。

## 🚀 Feishu ACP Agent（新功能）

基于 ACP 协议的飞书智能 Agent，连接 Kimi 和飞书平台：

- ✅ **WebSocket 长连接**：无需 Webhook、无需公网 IP、无需 ngrok
- ✅ **ACP 协议连接**：通过 ACP 协议与 Kimi CLI 通信
- ✅ **消息队列**：确保消息按顺序处理
- ✅ **多媒体处理**：图片、文件自动缓存并作为上下文
- ✅ **私聊/群聊**：同时支持私聊和群聊场景

### 快速开始

```bash
# 1. 配置环境变量（.env 文件）
# 只需要 FEISHU_APP_ID 和 FEISHU_APP_SECRET

# 2. 启动 Agent
npm run agent

# 3. 在飞书中测试：
#    @机器人 /bind /Users/yourname/project
#    @机器人 你好
```

详细文档：[QUICK_START_WS.md](./QUICK_START_WS.md)

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     业务应用层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   客服机器人  │  │   通知服务   │  │   群组管理   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼─────────────────┼─────────────────┼──────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│                 消息调度器 (MessageDispatcher)            │
│    统一的消息接口，支持多平台适配器管理                      │
│    - sendMessage()     - getChats()                      │
│    - sendPrivate()     - getUsers()                      │
│    - sendGroup()       - onEvent()                       │
└───────────────────────────┬──────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
┌─────────▼──────┐  ┌──────▼───────┐  ┌──────▼───────┐
│   飞书适配器    │  │  微信适配器   │  │  Slack适配器 │
│  (FeishuAdapter)│  │ (未来扩展)   │  │  (未来扩展)  │
└─────────────────┘  └──────────────┘  └──────────────┘
```

## 核心特性

- **抽象消息层**: 统一的消息、用户、聊天类型定义，与平台无关
- **飞书适配器**: 基于飞书官方 Node.js SDK，完整封装消息能力
- **消息调度器**: 管理多适配器，提供统一的消息操作接口
- **事件系统**: 支持消息接收、群聊事件等 webhook 事件处理
- **类型安全**: 完整的 TypeScript 类型支持

## 项目结构

```
src/
├── core/                          # 核心抽象层
│   ├── types/                     # 统一类型定义
│   │   └── index.ts              # Message, Chat, User 等类型
│   ├── interfaces/               # 接口定义
│   │   └── IMessagingAdapter.ts  # 适配器接口
│   └── events/                   # 事件系统
│       └── EventEmitter.ts       # 事件发射器
│
├── adapters/                     # 平台适配器
│   └── feishu/                  # 飞书适配器
│       ├── FeishuAdapter.ts     # 核心适配器实现
│       ├── transformer.ts       # 消息格式转换
│       ├── types.ts             # 飞书类型定义
│       └── index.ts             # 模块导出
│
├── messaging/                    # 消息调度层
│   └── MessageDispatcher.ts     # 消息调度器
│
├── feishu-acp-agent/            # 🆕 ACP Agent（新）
│   ├── index.ts                 # 主入口
│   ├── FeishuAcpAgent.ts        # 主 Agent 类
│   ├── FeishuWSClient.ts        # WebSocket 客户端
│   ├── ChatSessionManager.ts    # 会话管理器
│   ├── CardBuilder.ts           # 卡片构建器
│   └── types.ts                 # 类型定义
│
├── scripts/                      # 测试脚本
│   ├── test-feishu-basic.ts     # 基础功能测试
│   └── test-agent.ts            # Agent 功能测试
│
├── test.ts                       # 测试脚本
└── index.ts                      # 入口文件
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env`，填入你的飞书应用凭证：

```bash
# 飞书应用配置（必填）
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ACP Agent 配置
ACP_DEFAULT_CWD=/Users/yourname/projects
KIMI_PATH=kimi
DEBUG=false
```

### 运行测试

```bash
# 基础功能测试
npm run test:basic

# Agent 功能测试
npm run test:agent
```

### 启动 ACP Agent

```bash
# WebSocket 模式（推荐，无需 Webhook）
npm run agent

# 或
./start-agent.sh
```

## 飞书应用配置

### 1. 创建应用

访问 [飞书开放平台](https://open.feishu.cn/) 创建企业自建应用。

### 2. 获取凭证

在应用详情页的 "凭证与基础信息" 中获取：
- App ID
- App Secret

### 3. 配置权限

在 "权限管理" 中添加以下权限：

**消息相关：**
- `im:message` - 接收消息
- `im:message:send_as_bot` - 发送消息
- `im:chat.interactive` - 发送卡片消息
- `im:chat:readonly` - 读取群聊信息

### 4. 配置事件订阅（WebSocket 模式）

事件订阅 → **使用长连接接收事件** → 添加事件：
- `im.message.receive_v1`
- `im.chat.member.bot.added_v1`
- `im.chat.member.bot.deleted_v1`

### 5. 发布应用

版本管理与发布 → 创建版本 → 提交审核

## 使用示例

### 基础用法：直接调用飞书适配器

```typescript
import { FeishuAdapter } from './adapters/feishu';

const adapter = new FeishuAdapter({
  appId: 'your-app-id',
  appSecret: 'your-app-secret',
});

await adapter.initialize();

// 发送群聊消息
await adapter.sendMessage({
  chatType: 'group',
  chatId: 'oc_xxxxxx',
  content: 'Hello, Group!',
});
```

### ACP Agent 用法

```bash
# 启动 Agent
npm run agent

# 在飞书中：
# 1. @机器人 /bind /Users/yourname/project
# 2. @机器人 你好，介绍一下这个项目
```

## 命令列表

| 命令 | 说明 |
|------|------|
| `/bind [路径]` | 绑定工作目录，如 `/bind /Users/xxx/project` |
| `/status` | 查看当前会话状态 |
| `/clear` | 清空媒体缓存 |
| `/help` | 显示帮助信息 |

## 测试

```bash
# 基础功能测试
npm run test:basic

# Agent 功能测试
npm run test:agent

# 完整测试
npm test
```

## 相关资源

- [飞书开放平台](https://open.feishu.cn/)
- [飞书 Node.js SDK](https://github.com/larksuite/node-sdk)
- [QUICK_START_WS.md](./QUICK_START_WS.md) - WebSocket 模式快速开始
- [AGENT_TEST_GUIDE.md](./AGENT_TEST_GUIDE.md) - 详细测试指南

## License

MIT
