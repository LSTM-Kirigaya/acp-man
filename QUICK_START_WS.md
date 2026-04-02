# Feishu ACP Agent - 快速开始指南

使用 **WebSocket 长连接**，无需 Webhook、无需公网 IP、无需 ngrok！

## 核心特性

- ✅ **私聊**：主 Agent，无需绑定，直接对话
- ✅ **群聊**：需要绑定路径，绑定信息持久化保存
- ✅ **智能提示**：未绑定的群聊自动提示绑定
- ✅ **无需 @**：群聊绑定后，直接发送消息即可处理

---

## 前置条件

1. **Node.js** v18+
2. **Kimi CLI** 已安装并登录 (`kimi login`)
3. **飞书企业自建应用** 已创建

---

## 一、飞书应用配置

### 1. 创建应用

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 记录 **App ID** 和 **App Secret**

### 2. 开启机器人能力

应用能力 → 机器人 → 启用机器人能力

### 3. 配置权限

权限管理 → 添加以下权限：

**必须权限：**
- `im:message` - 接收消息
- `im:message:send_as_bot` - 发送消息
- `im:message.reactions:write` - 表情回复（"正在输入"效果）
- `im:chat:readonly` - 读取群聊信息

**可选权限：**
- `contact:user.base:readonly` - 获取用户基本信息（显示发送者名称）

### 4. 配置事件订阅（WebSocket 模式）

**⚠️ 重要：选择 WebSocket 模式，不是 Webhook！**

事件订阅 → 使用长连接接收事件 → 添加以下事件：
- `im.message.receive_v1` - 接收消息
- `im.chat.member.bot.added_v1` - 机器人入群
- `im.chat.member.bot.deleted_v1` - 机器人退群

### 5. 发布应用

版本管理与发布 → 创建版本 → 提交审核

---

## 二、本地配置

### 1. 配置环境变量

编辑 `.env` 文件：

```bash
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ACP_DEFAULT_CWD=/Users/yourname/projects
KIMI_PATH=kimi
DEBUG=false
```

### 2. 安装依赖

```bash
npm install
```

---

## 三、启动 Agent

```bash
npm run agent
```

你会看到：
```
╔══════════════════════════════════════════════════════════╗
║          Feishu ACP Agent - 启动中...                    ║
╠══════════════════════════════════════════════════════════╣
║  私聊：主 Agent，无需绑定，直接对话                      ║
║  群聊：需要绑定路径，绑定信息持久化保存                  ║
╚══════════════════════════════════════════════════════════╝

✅ Agent 启动成功！

📖 私聊使用：
   • 直接发送消息，无需绑定
   • 主 Agent 使用默认工作目录

📖 群聊使用：
   1. 首次使用发送 `/bind /路径` 绑定工作目录
   2. 绑定后直接发送消息即可（无需 @机器人）
   3. 发送 `/status` 查看绑定状态
```

---

## 四、使用指南

### 私聊（主 Agent）

直接对话，无需任何配置：

```
你: 你好
机器人: 你好！我是 Kimi，很高兴为你服务。

你: 分析一下当前目录的代码
机器人: 好的，我来分析一下...
（使用 ACP_DEFAULT_CWD 指定的默认路径）
```

### 群聊（需要绑定）

#### 首次使用

```
你: 你好
机器人: ⚠️ 此群聊尚未绑定工作目录
       
       请发送以下命令绑定路径：
       /bind /Users/username/project
       
       绑定后，Kimi Agent 将在此目录下执行操作。

你: /bind /Users/kirigaya/myapp
机器人: ✅ 绑定成功！
       
       工作目录：
       ```
       /Users/kirigaya/myapp
       ```
       
       现在可以开始对话了。
```

#### 已绑定使用

```
你: 重构这个函数
机器人: 我来帮你重构这个函数...

你: @某人 看一下这个方案
机器人: （不会触发，因为不是发给机器人的）

你: /status
机器人: 📊 群聊状态
       
       绑定路径：/Users/kirigaya/myapp
       消息队列：0 条待处理
       媒体缓存：0 个文件
```

### 命令列表

| 命令 | 场景 | 说明 |
|------|------|------|
| `/bind /path` | 群聊 | 绑定工作目录 |
| `/bind` | 群聊 | 查看当前绑定 |
| `/status` | 群聊 | 查看群聊状态 |
| `/help` | 通用 | 显示帮助信息 |

---

## 五、配置文件

群聊绑定信息保存在 `config/bindings.json`：

```json
{
  "chatBindings": {
    "oc_ebd78151370a65323ac99367a115a087": "/Users/kirigaya/app1",
    "oc_387bbaaa3010c1a3faa402de5b8a01a3": "/Users/kirigaya/app2"
  },
  "lastUpdated": 1775134567890
}
```

**注意**：此文件会被自动创建和更新，无需手动编辑。

---

## 六、交互效果

当机器人处理消息时，你会看到：

1. **收到消息时**：消息下方出现 🤔 表情
2. **处理中时**：聊天界面显示"对方正在输入..."
3. **完成时**：🤔 表情自动消失，显示回复

---

## 七、故障排查

### 无法接收消息
```bash
# 检查网络
ping open.feishu.cn

# 检查配置
cat .env
```

### 群聊提示未绑定
- 确保发送的是 `/bind /绝对路径`（以 / 开头）
- 检查 `config/bindings.json` 是否有写入权限

### 消息发送失败
- 检查机器人是否在群聊中
- 检查是否有 `im:message:send_as_bot` 权限

---

## 八、架构说明

详细架构设计请查看：[ARCHITECTURE.md](./ARCHITECTURE.md)
