/**
 * 飞书连接诊断脚本
 * 检查配置、权限和连接状态
 */

import dotenv from 'dotenv';
import lark from '@larksuiteoapi/node-sdk';

dotenv.config();

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;

async function diagnose() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       飞书连接诊断                                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  if (!APP_ID || !APP_SECRET) {
    console.error('❌ 错误: 缺少飞书应用配置');
    console.error('   请设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    process.exit(1);
  }

  console.log('📋 配置信息:');
  console.log(`   App ID: ${APP_ID.slice(0, 8)}...`);
  console.log();

  // 创建飞书客户端
  const client = new lark.Client({
    appId: APP_ID,
    appSecret: APP_SECRET,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });

  // 测试 1: 连接测试
  console.log('【测试 1】飞书 API 连接');
  console.log('─────────────────────────────────────────────────────────');
  try {
    const tokenResult = await client.auth.tenantAccessToken.internal({
      data: { app_id: APP_ID, app_secret: APP_SECRET },
    });
    if (tokenResult.code === 0) {
      console.log('✅ 连接成功');
    } else {
      console.log('❌ 连接失败:', tokenResult.msg);
      process.exit(1);
    }
  } catch (error: any) {
    console.log('❌ 连接失败:', error.message);
    process.exit(1);
  }
  console.log();

  // 测试 2: 获取群聊列表
  console.log('【测试 2】获取群聊列表');
  console.log('─────────────────────────────────────────────────────────');
  try {
    const chatResult = await client.im.chat.list({
      params: { user_id_type: 'open_id', page_size: 10 },
    });
    if (chatResult.code === 0) {
      const chats = chatResult.data?.items || [];
      console.log(`✅ 获取成功，共 ${chats.length} 个群聊`);
      chats.forEach((chat: any, i: number) => {
        console.log(`   ${i + 1}. ${chat.name} (${chat.chat_id})`);
      });
    } else {
      console.log('⚠️  获取失败:', chatResult.msg);
      console.log('   可能需要 im:chat:readonly 权限');
    }
  } catch (error: any) {
    console.log('⚠️  获取失败:', error.message);
  }
  console.log();

  // 测试 3: WebSocket 连接
  console.log('【测试 3】WebSocket 连接');
  console.log('─────────────────────────────────────────────────────────');
  console.log('正在启动 WebSocket 连接（等待 10 秒接收消息）...');
  console.log('请在飞书私聊或群聊中发送一条测试消息');
  console.log();

  let messageReceived = false;

  const wsClient = new lark.WSClient({
    appId: APP_ID,
    appSecret: APP_SECRET,
    loggerLevel: lark.LoggerLevel.INFO,
  });

  const eventDispatcher = new lark.EventDispatcher({});

  eventDispatcher.register({
    'im.message.receive_v1': async (data: any) => {
      messageReceived = true;
      console.log('✅ 收到消息事件！');
      console.log('   消息类型:', data.message?.chat_type === 'p2p' ? '私聊' : '群聊');
      console.log('   发送者:', data.sender?.sender_id?.open_id?.substring(0, 16) + '...');
      
      try {
        const content = JSON.parse(data.message?.content || '{}');
        console.log('   内容:', content.text?.substring(0, 50) || '[非文本消息]');
      } catch {
        console.log('   内容:', data.message?.content?.substring(0, 50) || '[无法解析]');
      }
    },
  });

  await wsClient.start({ eventDispatcher });

  // 等待 10 秒
  await new Promise(resolve => setTimeout(resolve, 10000));

  await wsClient.stop();

  if (!messageReceived) {
    console.log();
    console.log('⚠️  10 秒内没有收到消息');
    console.log();
    console.log('💡 请检查以下配置：');
    console.log('   1. 飞书开放平台 → 事件订阅');
    console.log('      - 订阅方式：使用长连接接收事件');
    console.log('      - 订阅事件：im.message.receive_v1');
    console.log();
    console.log('   2. 飞书开放平台 → 权限管理');
    console.log('      - im:message');
    console.log('      - im:message:p2p_msg:readonly (私聊)');
    console.log('      - im:message:group_msg (群聊)');
    console.log();
    console.log('   3. 飞书开放平台 → 版本管理与发布');
    console.log('      - 应用已发布');
    console.log();
    console.log('   4. 机器人已在私聊/群聊中');
  }

  console.log();
  console.log('诊断完成');
}

diagnose().catch(console.error);
