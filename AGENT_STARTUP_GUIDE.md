# Feishu ACP Agent 启动指南

快速启动 Feishu ACP Agent 的完整步骤。

## 前置条件

1. **Node.js** 已安装（推荐 v18+）
2. **Kimi CLI** 已安装并登录
3. **飞书应用** 已创建

## 快速开始

### 步骤 1：安装依赖

```bash
cd /Users/kirigaya/project/acp-man
npm install
```

### 步骤 2：配置环境变量

编辑 `.env` 文件：

```bash
# 飞书应用配置（必填）
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Webhook 配置（可选，建议配置）
FEISHU_ENCRYPT_KEY=your_encrypt_key
FEISHU_VERIFICATION_TOKEN=your_verification_token

# Webhook 服务器配置
WEBHOOK_PORT=3000
WEBHOOK_PATH=/webhook/feishu
WEBHOOK_HOST=0.0.0.0

# ACP 配置
ACP_DEFAULT_CWD=/Users/yourname/projects
KIMI_PATH=kimi
```

### 步骤 3：配置飞书权限

在 [飞书开放平台](https://open.feishu.cn/) → 你的应用 → 权限管理，添加：

**必须权限：**
- ✅ `im:message:send_as_bot` - 发送消息
- ✅ `im:message.group_msg` - 群聊消息
- ✅ `im:message.p2p_msg` - 私聊消息
- ✅ `im:chat.interactive` - 卡片消息
- ✅ `im:chat:readonly` - 读取群聊
- ✅ `im:resource` - 资源访问

### 步骤 4：配置事件订阅

1. 在飞书开放平台 → 事件订阅
2. 设置请求地址：
   - 开发环境：使用 ngrok
     ```bash
     npx ngrok http 3000
     # 复制 https URL，加上 /webhook/feishu
     ```
   - 生产环境：你的服务器地址
3. 添加订阅事件：
   - `im.message.receive_v1`
   - `card.action.trigger`

### 步骤 5：运行测试

```bash
# 运行功能测试
npm run test:agent
```

期望输出：
```
✅ 飞书连接
✅ 获取群聊列表
✅ 发送文本消息
✅ 发送交互式卡片
✅ Kimi ACP 连接
✅ ACP 对话
```

### 步骤 6：启动 Agent

```bash
# 普通模式
npm run agent

# 调试模式
npm run agent:debug
```

## 使用方法

### 在飞书中测试

1. **添加机器人到群聊**
   - 在飞书群聊中添加你的机器人

2. **测试基础命令**
   ```
   @机器人 /help
   ```
   应显示帮助卡片

3. **绑定工作目录**
   ```
   @机器人 /bind
   ```
   填写路径，如：`/Users/yourname/project`

4. **开始对话**
   ```
   @机器人 你好，请介绍一下这个项目
   ```

### 支持的命令

| 命令 | 说明 |
|------|------|
| `/bind` | 绑定工作目录（显示交互式表单） |
| `/status` | 查看当前会话状态 |
| `/clear` | 清空媒体缓存 |
| `/help` | 显示帮助信息 |

### 消息队列机制

- 消息自动排队处理
- 可以同时发送图片/文件 + 文字
- 图片和文件会先暂存，随下一条文字消息一起发送

## 常见问题

### Q: 无法接收消息
**检查：**
1. Webhook 地址是否可访问
2. 事件订阅是否配置了 `im.message.receive_v1`
3. 机器人是否在群聊中

### Q: 无法回复消息
**检查：**
1. 是否有 `im:message:send_as_bot` 权限
2. 私聊需要先由用户发送第一条消息

### Q: 卡片无法显示
**检查：**
1. 是否有 `im:chat.interactive` 权限
2. 卡片 JSON 格式是否正确

### Q: ACP 连接失败
**检查：**
```bash
# 检查 kimi 是否可用
which kimi
kimi --version

# 检查是否已登录
kimi login
```

## 项目结构

```
src/feishu-acp-agent/
├── index.ts              # 主入口
├── FeishuAcpAgent.ts     # 主 Agent 类
├── ChatSessionManager.ts # 会话管理器（消息队列）
├── FeishuWebhookServer.ts # Webhook 服务器
├── MediaStorage.ts       # 媒体文件存储
├── CardBuilder.ts        # 卡片构建器
├── types.ts              # 类型定义
└── README.md             # 详细文档
```

## 调试

```bash
# 开启调试日志
DEBUG=true npm run agent

# 测试飞书连接
npm run test:basic

# 测试完整功能
npm run test:agent
```

## 生产部署

1. 使用 HTTPS
2. 配置 `FEISHU_ENCRYPT_KEY` 和 `FEISHU_VERIFICATION_TOKEN`
3. 使用进程管理器（如 pm2）
4. 配置日志收集

```bash
# 使用 pm2 启动
npm install -g pm2
pm2 start --name feishu-agent --interpreter node --node-args="--loader ts-node/esm" src/feishu-acp-agent/index.ts
```
