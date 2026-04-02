/**
 * Feishu ACP Agent 功能测试脚本
 * 
 * 测试内容：
 * 1. 飞书 API 连接
 * 2. Kimi ACP 连接
 * 3. 发送测试消息
 * 4. 发送交互式卡片
 */

import dotenv from 'dotenv';
import lark from '@larksuiteoapi/node-sdk';
import { KimiAcpClient } from '../kimi-acp-client/index.js';
import * as CardBuilder from '../feishu-acp-agent/CardBuilder.js';

dotenv.config();

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Feishu ACP Agent - 功能测试                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  if (!APP_ID || !APP_SECRET) {
    console.error('❌ 错误: 缺少飞书应用配置');
    process.exit(1);
  }

  // 创建飞书客户端
  const feishuClient = new lark.Client({
    appId: APP_ID,
    appSecret: APP_SECRET,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });

  const results: { name: string; status: 'pass' | 'fail' | 'skip'; error?: string }[] = [];

  // 测试 1: 飞书连接
  console.log('【测试 1】飞书 API 连接');
  console.log('─────────────────────────────────────────────────────────');
  try {
    const tokenResult = await feishuClient.auth.tenantAccessToken.internal({
      data: { app_id: APP_ID, app_secret: APP_SECRET },
    });
    if (tokenResult.code === 0) {
      console.log('✅ 飞书连接成功');
      results.push({ name: '飞书连接', status: 'pass' });
    } else {
      throw new Error(tokenResult.msg);
    }
  } catch (error: any) {
    console.log('❌ 飞书连接失败:', error.message);
    results.push({ name: '飞书连接', status: 'fail', error: error.message });
  }
  console.log();

  // 测试 2: 获取群聊列表
  console.log('【测试 2】获取群聊列表');
  console.log('─────────────────────────────────────────────────────────');
  let testChatId: string | null = null;
  let testChatName: string | null = null;
  try {
    const chatResult = await feishuClient.im.chat.list({
      params: { user_id_type: 'open_id', page_size: 10 },
    });
    if (chatResult.code === 0) {
      const chats = chatResult.data?.items || [];
      console.log(`✅ 获取成功，共 ${chats.length} 个群聊`);
      if (chats.length > 0) {
        chats.forEach((chat: any, i: number) => {
          console.log(`   ${i + 1}. ${chat.name} (${chat.chat_id})`);
        });
        testChatId = chats[0].chat_id;
        testChatName = chats[0].name;
      }
      results.push({ name: '获取群聊列表', status: 'pass' });
    } else {
      throw new Error(chatResult.msg);
    }
  } catch (error: any) {
    console.log('❌ 获取群聊列表失败:', error.message);
    results.push({ name: '获取群聊列表', status: 'fail', error: error.message });
  }
  console.log();

  // 测试 3: 发送文本消息
  if (testChatId) {
    console.log(`【测试 3】发送文本消息到 "${testChatName}"`);
    console.log('─────────────────────────────────────────────────────────');
    try {
      await feishuClient.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: testChatId,
          content: JSON.stringify({
            text: '🤖 Feishu ACP Agent 测试消息\n\n这是一条来自测试脚本的消息。',
          }),
          msg_type: 'text',
        },
      });
      console.log('✅ 文本消息发送成功');
      results.push({ name: '发送文本消息', status: 'pass' });
    } catch (error: any) {
      console.log('❌ 发送失败:', error.message);
      results.push({ name: '发送文本消息', status: 'fail', error: error.message });
    }
    console.log();

    // 测试 4: 发送交互式卡片
    console.log(`【测试 4】发送交互式卡片到 "${testChatName}"`);
    console.log('─────────────────────────────────────────────────────────');
    try {
      const card = CardBuilder.buildHelpCard();
      await feishuClient.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: testChatId,
          content: JSON.stringify(card),
          msg_type: 'interactive',
        },
      });
      console.log('✅ 交互式卡片发送成功');
      results.push({ name: '发送交互式卡片', status: 'pass' });
    } catch (error: any) {
      console.log('❌ 发送失败:', error.message);
      results.push({ name: '发送交互式卡片', status: 'fail', error: error.message });
    }
    console.log();
  } else {
    console.log('⚠️  跳过消息发送测试（没有可用的群聊）');
    console.log();
    results.push({ name: '发送文本消息', status: 'skip' });
    results.push({ name: '发送交互式卡片', status: 'skip' });
  }

  // 测试 5: Kimi ACP 连接
  console.log('【测试 5】Kimi ACP 连接');
  console.log('─────────────────────────────────────────────────────────');
  let acpClient: KimiAcpClient | null = null;
  let acpConnected = false;
  try {
    acpClient = new KimiAcpClient({
      debug: false, // 关闭调试输出，减少噪音
    });
    await acpClient.connect();
    console.log('✅ Kimi ACP 连接成功');
    results.push({ name: 'Kimi ACP 连接', status: 'pass' });
    acpConnected = true;
  } catch (error: any) {
    console.log('❌ Kimi ACP 连接失败:', error.message);
    console.log('   请确保 kimi 命令可用，并且支持 acp 功能');
    results.push({ name: 'Kimi ACP 连接', status: 'fail', error: error.message });
  }
  console.log();

  // 测试 6: ACP 会话创建和对话
  if (acpConnected && acpClient) {
    console.log('【测试 6】ACP 会话创建和对话');
    console.log('─────────────────────────────────────────────────────────');
    try {
      const session = await acpClient.newSession(process.cwd(), {
        sessionId: `test_${Date.now()}`,
      });
      console.log('✅ ACP 会话创建成功:', session.sessionId);

      // 发送测试消息
      console.log('   发送测试消息: "你好，请介绍一下自己"');
      const response = await acpClient.sendMessage(
        session.sessionId,
        '你好，请简短介绍一下自己'
      );
      
      if ('message' in response && typeof response.message === 'string') {
        console.log('✅ ACP 响应接收成功');
        console.log('   响应预览:', response.message.substring(0, 100) + '...');
        results.push({ name: 'ACP 对话', status: 'pass' });
      } else {
        throw new Error('响应格式异常');
      }
    } catch (error: any) {
      if (error.message?.includes('Invalid params') || error.message?.includes('login')) {
        console.log('⚠️  ACP 对话需要登录:');
        console.log('   请先运行: kimi login');
        console.log('   登录完成后再运行此测试');
        results.push({ name: 'ACP 对话', status: 'fail', error: '需要登录 Kimi' });
      } else {
        console.log('❌ ACP 对话失败:', error.message);
        results.push({ name: 'ACP 对话', status: 'fail', error: error.message });
      }
    }
    console.log();

    // 断开 ACP 连接
    await acpClient.disconnect();
  } else {
    console.log('【测试 6】ACP 会话创建和对话');
    console.log('─────────────────────────────────────────────────────────');
    console.log('⚠️  跳过（ACP 未连接）');
    results.push({ name: 'ACP 会话创建', status: 'skip' });
    results.push({ name: 'ACP 对话', status: 'skip' });
    console.log();
  }

  // 测试总结
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                      测试总结                            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const skipCount = results.filter(r => r.status === 'skip').length;

  results.forEach(r => {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
    console.log(`${icon} ${r.name}`);
    if (r.error) {
      console.log(`   错误: ${r.error}`);
    }
  });

  console.log();
  console.log(`总计: ${passCount} 通过, ${failCount} 失败, ${skipCount} 跳过`);
  console.log();

  if (failCount > 0) {
    console.log('💡 提示:');
    console.log('   1. 如果飞书连接失败，请检查 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    console.log('   2. 如果消息发送失败，请确保机器人在群聊中');
    console.log('   3. 如果 ACP 连接失败，请确保 kimi 命令可用');
    console.log('   4. 如果 ACP 对话需要登录，请运行: kimi login');
    console.log('   5. 如果卡片发送失败，请检查是否具有 im:chat.interactive 权限');
    console.log();
  }

  // 下一步指引
  if (passCount >= 4) {
    console.log('🎉 基础功能测试通过！');
    console.log();
    console.log('下一步：');
    console.log('   1. 确保 Kimi 已登录: kimi login');
    console.log('   2. 配置飞书事件订阅: http://your-server:3000/webhook/feishu');
    console.log('   3. 启动 Agent: npm run agent');
    console.log();
  }
}

runTests().catch(console.error);
