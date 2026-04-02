# 测试脚本目录

这个目录用于存放各种测试脚本和工具脚本。

## 脚本列表

### test-feishu-basic.ts
飞书基础功能测试脚本。

**测试内容：**
- 连接飞书 API
- 获取组织信息（需要通讯录权限）
- 获取群聊列表
- 发送测试消息到第一个群聊

**运行方式：**
```bash
npm run test:basic
```

**环境变量要求：**
- `FEISHU_APP_ID` - 飞书应用 ID
- `FEISHU_APP_SECRET` - 飞书应用密钥

可以在 `.env` 文件中配置这些变量。

## 添加新脚本

1. 在 `src/scripts/` 目录下创建新的 `.ts` 文件
2. 在 `package.json` 的 `scripts` 部分添加运行命令
3. 参考现有脚本的导入方式：
   ```typescript
   import dotenv from 'dotenv';
   import lark from '@larksuiteoapi/node-sdk';
   dotenv.config();
   ```
