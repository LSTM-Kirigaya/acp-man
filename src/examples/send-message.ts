/**
 * 发送消息示例
 * 
 * 使用方法:
 * npx ts-node src/examples/send-message.ts <group-id> <message>
 * 
 * 示例:
 * npx ts-node src/examples/send-message.ts oc_xxxxxx "Hello everyone!"
 */

import * as dotenv from 'dotenv';
import { FeishuAdapter } from '../adapters/feishu/FeishuAdapter';
import { MessageDispatcher } from '../messaging/MessageDispatcher';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('用法: npx ts-node src/examples/send-message.ts <chat-id> <message>');
    console.log();
    console.log('参数:');
    console.log('  chat-id    群聊ID (oc_xxx) 或用户ID (ou_xxx)');
    console.log('  message    要发送的消息内容');
    console.log();
    console.log('示例:');
    console.log('  npx ts-node src/examples/send-message.ts oc_xxxxxx "大家好！"');
    process.exit(1);
  }

  const [chatId, ...messageParts] = args;
  const message = messageParts.join(' ');
  
  // 判断是群聊还是私聊
  const chatType = chatId.startsWith('oc_') ? 'group' : 'private';

  const APP_ID = process.env.FEISHU_APP_ID || '';
  const APP_SECRET = process.env.FEISHU_APP_SECRET || '';

  if (!APP_ID || !APP_SECRET) {
    console.error('错误: 缺少飞书应用配置');
    console.error('请设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    process.exit(1);
  }

  // 创建适配器
  const adapter = new FeishuAdapter({
    appId: APP_ID,
    appSecret: APP_SECRET,
  });

  // 创建调度器
  const dispatcher = new MessageDispatcher();
  dispatcher.registerAdapter(adapter, true);

  try {
    // 初始化
    await adapter.initialize();

    console.log(`正在发送${chatType === 'group' ? '群聊' : '私聊'}消息...`);
    console.log(`目标: ${chatId}`);
    console.log(`内容: ${message}`);
    console.log();

    // 发送消息
    const result = await dispatcher.sendMessage({
      chatType,
      chatId,
      content: message,
    });

    console.log('✅ 消息发送成功！');
    console.log('消息 ID:', result.id);
    console.log('发送时间:', result.timestamp);

  } catch (error: any) {
    console.error('❌ 消息发送失败:', error.message);
    if (error.msg) {
      console.error('飞书错误:', error.msg);
    }
    process.exit(1);
  } finally {
    await adapter.disconnect();
  }
}

main();
