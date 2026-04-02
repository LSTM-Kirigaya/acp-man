/**
 * Webhook 服务器示例
 * 用于接收飞书推送的消息事件
 * 
 * 使用方法:
 * 1. 在飞书开发者平台配置 Webhook URL
 * 2. 运行此服务器: npx ts-node src/examples/webhook-server.ts
 * 3. 确保服务器可以从公网访问（可使用 ngrok 等工具）
 */

import * as http from 'http';
import * as dotenv from 'dotenv';
import * as lark from '@larksuiteoapi/node-sdk';
import { FeishuAdapter } from '../adapters/feishu/FeishuAdapter';

dotenv.config();

const PORT = parseInt(process.env.WEBHOOK_PORT || '3000');
const HOST = process.env.WEBHOOK_HOST || '0.0.0.0';
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/webhook/feishu';

const APP_ID = process.env.FEISHU_APP_ID || '';
const APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const ENCRYPT_KEY = process.env.FEISHU_ENCRYPT_KEY || '';
const VERIFICATION_TOKEN = process.env.FEISHU_VERIFICATION_TOKEN || '';

async function main() {
  // 检查配置
  if (!APP_ID || !APP_SECRET) {
    console.error('错误: 缺少飞书应用配置');
    console.error('请设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    process.exit(1);
  }

  // 创建适配器
  const adapter = new FeishuAdapter({
    appId: APP_ID,
    appSecret: APP_SECRET,
    encryptKey: ENCRYPT_KEY,
    verificationToken: VERIFICATION_TOKEN,
  });

  // 注册消息接收事件
  adapter.onEvent('message.receive', (event) => {
    const msg = event.data as any;
    console.log('\n📨 收到新消息:');
    console.log('  发送者:', msg.sender?.name || 'Unknown');
    console.log('  聊天:', msg.chat?.name || 'Unknown');
    console.log('  内容:', msg.content);
    console.log('  时间:', msg.timestamp);
    
    // 示例：自动回复
    if (msg.content && msg.content.includes('@机器人')) {
      console.log('  → 触发自动回复');
      // 这里可以调用 adapter.sendMessage 回复消息
    }
  });

  // 初始化适配器
  await adapter.initialize();

  // 启动事件监听
  await adapter.startEventListening();

  // 获取事件分发器
  const eventDispatcher = adapter.getEventDispatcher();
  if (!eventDispatcher) {
    console.error('错误: 事件分发器未创建');
    process.exit(1);
  }

  // 创建 HTTP 服务器
  const server = http.createServer();

  // 处理请求
  server.on('request', lark.adaptDefault(WEBHOOK_PATH, eventDispatcher));

  // 启动服务器
  server.listen(PORT, HOST, () => {
    console.log('\n==============================================');
    console.log('  飞书 Webhook 服务器已启动');
    console.log('==============================================');
    console.log();
    console.log(`监听地址: http://${HOST}:${PORT}${WEBHOOK_PATH}`);
    console.log();
    console.log('请将此地址配置到飞书开发者平台的事件订阅中');
    console.log();
    console.log('如需公网访问，可以使用 ngrok:');
    console.log(`  ngrok http ${PORT}`);
    console.log();
    console.log('按 Ctrl+C 停止服务器');
    console.log();
  });

  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\n正在关闭服务器...');
    await adapter.disconnect();
    server.close(() => {
      console.log('服务器已关闭');
      process.exit(0);
    });
  });
}

main().catch(console.error);
