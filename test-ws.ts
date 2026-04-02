import * as lark from '@larksuiteoapi/node-sdk';
import dotenv from 'dotenv';

dotenv.config();

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;

async function test() {
  console.log('Testing WebSocket connection...');
  console.log('App ID:', APP_ID?.substring(0, 8) + '...');

  if (!APP_ID || !APP_SECRET) {
    console.error('Missing credentials');
    process.exit(1);
  }

  const wsClient = new lark.WSClient({
    appId: APP_ID,
    appSecret: APP_SECRET,
    loggerLevel: lark.LoggerLevel.DEBUG,
  });

  const eventDispatcher = new lark.EventDispatcher({});

  // 注册所有可能的事件
  eventDispatcher.register({
    'im.message.receive_v1': async (data: any) => {
      console.log('\n✅ RECEIVED: im.message.receive_v1');
      console.log('Data:', JSON.stringify(data, null, 2));
    },
    'im.chat.member.bot.added_v1': async (data: any) => {
      console.log('\n✅ RECEIVED: im.chat.member.bot.added_v1');
    },
    'im.chat.member.bot.deleted_v1': async (data: any) => {
      console.log('\n✅ RECEIVED: im.chat.member.bot.deleted_v1');
    },
  });

  // 监听原始消息
  (wsClient as any).on?.('message', (data: any) => {
    console.log('\n📨 Raw message received:', data);
  });

  console.log('\n⏳ Starting WebSocket...');
  console.log('Please send a message in Feishu within 15 seconds...\n');

  await wsClient.start({ eventDispatcher });

  // 等待 15 秒
  await new Promise(resolve => setTimeout(resolve, 15000));

  console.log('\n⏹️  Stopping...');
  await wsClient.stop();
  console.log('Test complete');
}

test().catch(console.error);
