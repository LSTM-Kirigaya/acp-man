/**
 * 最简版本 - 仅用于测试消息接收
 */

import * as lark from '@larksuiteoapi/node-sdk';
import dotenv from 'dotenv';

dotenv.config();

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;

async function main() {
  if (!APP_ID || !APP_SECRET) {
    console.error('Missing env vars');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  最简测试版本 - 仅接收消息                               ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const wsClient = new lark.WSClient({
    appId: APP_ID,
    appSecret: APP_SECRET,
    loggerLevel: lark.LoggerLevel.INFO,
  });

  const eventDispatcher = new lark.EventDispatcher({});

  eventDispatcher.register({
    'im.message.receive_v1': async (data: any) => {
      console.log('\n╔══════════════════════════════════════════════════════════╗');
      console.log('║  📨 收到消息！                                           ║');
      console.log('╠══════════════════════════════════════════════════════════╣');
      
      try {
        const msg = data.message;
        const sender = data.sender;
        const content = JSON.parse(msg.content);
        
        console.log(`║  类型: ${msg.chat_type === 'p2p' ? '私聊' : '群聊'}`);
        console.log(`║  发送者: ${sender.sender_id?.open_id?.substring(0, 20)}...`);
        console.log(`║  内容: ${content.text?.substring(0, 40)}`);
      } catch (e) {
        console.log(`║  原始数据: ${JSON.stringify(data).substring(0, 100)}...`);
      }
      
      console.log('╚══════════════════════════════════════════════════════════╝\n');
    },
  });

  console.log('正在启动 WebSocket...');
  await wsClient.start({ eventDispatcher });
  console.log('✅ 已启动！请在飞书发送消息...\n');
  console.log('按 Ctrl+C 退出\n');

  // 保持运行
  process.stdin.resume();
}

main().catch(console.error);
