# Feishu ACP Agent 测试指南

本文档详细说明如何测试 Feishu ACP Agent 功能以及所需的飞书权限配置。

## 一、飞书权限配置

### 1.1 必须开启的权限

在飞书开放平台 → 你的应用 → 权限管理，添加以下权限：

#### 消息相关权限
| 权限 | 权限名称 | 说明 |
|------|----------|------|
| `im:message:send_as_bot` | 以机器人身份发送消息 | 基础消息发送 |
| `im:message.group_msg` | 发送群聊消息 | 群聊功能 |
| `im:message.p2p_msg` | 发送单聊消息 | 私聊功能 |
| `im:chat.interactive` | 发送卡片消息 | 交互式表单 |

#### 群聊相关权限
| 权限 | 权限名称 | 说明 |
|------|----------|------|
| `im:chat:readonly` | 读取群聊信息 | 获取群聊列表 |
| `im:chat` | 管理群聊 | 机器人进出群事件 |

#### 资源权限（用于图片/文件）
| 权限 | 权限名称 | 说明 |
|------|----------|------|
| `im:resource` | 访问消息资源 | 下载图片、文件 |
| `im:message.resource` | 获取消息资源 | 读取消息中的文件 |

### 1.2 可选权限

| 权限 | 权限名称 | 说明 |
|------|----------|------|
| `contact:user.department:readonly` | 读取用户部门信息 | 获取用户详细信息 |
| `contact:department:readonly` | 读取部门信息 | 获取组织架构 |

### 1.3 权限配置步骤

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 进入你的应用 → 权限管理
3. 搜索并添加上述权限
4. 发布版本（需要管理员审批）

## 二、事件订阅配置

### 2.1 配置 Webhook 地址

1. 在飞书开放平台 → 事件订阅
2. 配置请求地址：`http://your-server:3000/webhook/feishu`
3. 如果不方便暴露公网，可以使用 [ngrok](https://ngrok.com/) 做内网穿透

```bash
# 使用 ngrok 暴露本地服务
ngrok http 3000
```

### 2.2 订阅事件

添加以下事件订阅：

| 事件 | 说明 |
|------|------|
| `im.message.receive_v1` | 接收消息 |
| `im.chat.member.bot.added_v1` | 机器人被添加进群 |
| `im.chat.member.bot.deleted_v1` | 机器人被移除群 |
| `card.action.trigger` | 卡片交互事件 |

### 2.3 消息卡片配置

1. 在飞书开放平台 → 消息卡片
2. 配置卡片请求地址（可以与事件订阅相同）

## 三、测试步骤

### 3.1 运行自动化测试

```bash
# 运行基础功能测试
npm run test:basic

# 运行 Agent 功能测试
npm run test:agent
```

测试内容：
- ✅ 飞书 API 连接
- ✅ 获取群聊列表
- ✅ 发送文本消息
- ✅ 发送交互式卡片
- ✅ Kimi ACP 连接
- ✅ ACP 会话创建和对话

### 3.2 启动 Agent 服务

```bash
# 普通模式
npm run agent

# 调试模式（显示详细日志）
npm run agent:debug
```

启动成功后，你会看到：

```
╔══════════════════════════════════════════════════════════╗
║          Feishu ACP Agent - 启动中...                    ║
╚══════════════════════════════════════════════════════════╝

📋 配置信息:
   飞书 App ID: cli_a914...
   Webhook 端口: 3000
   Webhook 路径: /webhook/feishu
   ACP 默认目录: /Users/xxx/project
   调试模式: 关闭

[info]: [ 'client ready' ]
✅ Agent 启动成功！

📖 使用说明：
   1. 在飞书私聊或群聊中 @机器人 或发送消息
   2. 使用 /bind 命令绑定工作目录
   3. 发送消息与 Kimi Agent 对话
   4. 可以发送图片、文件作为上下文

📝 可用命令：
   /bind   - 绑定工作目录
   /status - 查看当前状态
   /clear  - 清空媒体缓存
   /help   - 显示帮助信息

按 Ctrl+C 退出程序...
```

### 3.3 功能测试清单

#### 测试 1：基础命令

1. 在飞书群聊中 @机器人 发送 `/help`
   - 期望：机器人回复帮助卡片

2. 发送 `/status`
   - 期望：显示当前状态（未绑定）

3. 发送 `/bind`
   - 期望：显示交互式表单，包含路径输入框和按钮

#### 测试 2：绑定工作目录

1. 输入 `/bind`
2. 在表单中输入路径（如 `/Users/yourname/project`）
3. 点击"确认绑定"
   - 期望：卡片更新为绑定成功提示

#### 测试 3：对话功能

1. 绑定路径后，发送普通消息
   - 期望：消息被转发到 Kimi，回复 Kimi 的响应

2. 连续发送多条消息
   - 期望：消息按顺序排队处理，不会丢失

#### 测试 4：多媒体功能

1. 发送一张图片（不输入文字）
   - 期望：机器人提示"图片已接收，会包含在下一次对话"

2. 发送一个文件
   - 期望：机器人提示"文件已接收"

3. 发送一条文字消息
   - 期望：文字消息和之前的图片/文件一起发送给 Kimi

#### 测试 5：队列功能

1. 快速发送多条消息
   - 期望：消息排队处理，回复按发送顺序返回

#### 测试 6：私聊功能

1. 在飞书中找到机器人，进入私聊
2. 重复上述测试
   - 期望：私聊同样正常工作

## 四、常见问题排查

### 4.1 无法接收消息

**症状**：在飞书发送消息，Agent 没有反应

**排查步骤**：

1. 检查 Webhook 是否可达
```bash
# 在服务器上运行
curl http://localhost:3000/webhook/feishu \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"type":"url_verification","challenge":"test"}'

# 应该返回 {"challenge":"test"}
```

2. 检查 ngrok 是否正常（如果使用）
3. 检查飞书事件订阅配置是否正确
4. 检查是否有错误日志

### 4.2 消息发送失败

**症状**：Agent 收到消息但无法回复

**可能原因**：
- 机器人不在群聊中
- 缺少 `im:message:send_as_bot` 权限
- 私聊需要先由用户发起

**解决**：
- 将机器人添加到群聊
- 检查并申请权限
- 私聊时先让用户发送任意消息

### 4.3 卡片无法显示

**症状**：发送 `/bind` 没有显示表单

**可能原因**：
- 缺少 `im:chat.interactive` 权限
- 卡片 JSON 格式错误

**解决**：
- 申请卡片消息权限
- 检查卡片构建器代码

### 4.4 ACP 连接失败

**症状**：无法连接到 Kimi ACP

**排查**：
```bash
# 检查 kimi 命令是否可用
which kimi
kimi --version

# 检查是否支持 acp
kimi acp --help
```

### 4.5 图片/文件无法下载

**症状**：收到图片/文件但无法处理

**可能原因**：
- 缺少 `im:resource` 权限
- SDK 限制

**临时解决方案**：
目前图片/文件处理需要额外实现下载逻辑，可以使用飞书 OpenAPI 直接下载：

```bash
curl -X GET \
  "https://open.feishu.cn/open-apis/im/v1/messages/{message_id}/resources/{file_key}?type=image" \
  -H "Authorization: Bearer $TOKEN" \
  --output image.png
```

## 五、调试技巧

### 5.1 开启调试模式

```bash
DEBUG=true npm run agent
```

会显示：
- 飞书 API 调用详情
- ACP 协议通信内容
- 消息队列状态

### 5.2 查看会话状态

在 Agent 运行后，发送 `/status` 查看：
- 当前绑定的路径
- 消息队列长度
- 媒体缓存数量

### 5.3 手动清理缓存

```bash
# 清理媒体文件
rm -rf ./media_storage/*
```

## 六、生产环境部署建议

1. **使用 HTTPS**：生产环境必须使用 HTTPS
2. **配置加密密钥**：设置 `FEISHU_ENCRYPT_KEY` 和 `FEISHU_VERIFICATION_TOKEN`
3. **持久化会话**：当前会话存储在内存中，重启会丢失，可考虑使用 Redis
4. **监控和日志**：配置日志收集和告警
5. **限流保护**：防止消息洪水攻击
