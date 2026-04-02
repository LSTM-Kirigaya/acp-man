import * as lark from '@larksuiteoapi/node-sdk';
import dotenv from 'dotenv';

dotenv.config();

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;

console.log('App ID:', APP_ID?.slice(0, 8));
console.log('App Secret:', APP_SECRET ? '***' : 'missing');

async function main() {
  const client = new lark.Client({
    appId: APP_ID!,
    appSecret: APP_SECRET!,
  });

  const ws = new lark.WSClient({
    appId: APP_ID!,
    appSecret: APP_SECRET!,
  });

  const dispatcher = new lark.EventDispatcher({});
  
  dispatcher.register({
    'im.message.receive_v1': (data: any) => {
      console.log('\n>>> MESSAGE RECEIVED <<<');
      console.log('Chat type:', data.message?.chat_type);
      console.log('Content:', JSON.parse(data.message?.content || '{}').text);
    },
  });

  console.log('\nStarting... Send a message in Feishu now!');
  
  await ws.start({ eventDispatcher: dispatcher });
  
  // Keep running
  await new Promise(() => {});
}

main();
