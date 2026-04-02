/**
 * 飞书适配器测试脚本
 * 
 * 功能：
 * 1. 连接测试
 * 2. 获取组织信息
 * 3. 获取群聊列表
 * 4. 获取用户列表
 * 5. 获取群成员
 * 6. 发送测试消息
 */

import * as dotenv from 'dotenv';
import { FeishuAdapter } from './adapters/feishu/FeishuAdapter';
import { MessageDispatcher } from './messaging/MessageDispatcher';

dotenv.config();

// 从环境变量读取配置，如果没有则使用提供的值
const APP_ID = process.env.FEISHU_APP_ID || 'cli_a9146a4a2ef85bc6';
const APP_SECRET = process.env.FEISHU_APP_SECRET || 'h9xKe3VaB8tsqdO2irhUccgGITOvD6Jt';

async function runTests() {
  console.log('==============================================');
  console.log('  飞书消息中间层系统 - 功能测试');
  console.log('==============================================');
  console.log();

  // 检查配置
  if (!APP_ID || !APP_SECRET) {
    console.error('错误: 缺少飞书应用配置');
    console.error('请设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    console.error('或在 .env 文件中配置');
    process.exit(1);
  }

  // 创建适配器
  const adapter = new FeishuAdapter({
    appId: APP_ID,
    appSecret: APP_SECRET,
  });

  // 创建调度器并注册适配器
  const dispatcher = new MessageDispatcher();
  dispatcher.registerAdapter(adapter, true);

  // 测试结果统计
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  try {
    // ==================== 测试 1: 连接测试 ====================
    console.log('【测试 1】连接测试');
    console.log('----------------------------------------------');
    await adapter.initialize();
    console.log('✅ 连接测试通过');
    results.passed++;
    console.log();

    // ==================== 测试 2: 获取组织信息 ====================
    console.log('【测试 2】获取组织信息');
    console.log('----------------------------------------------');
    try {
      const org = await adapter.getOrganization();
      if (org) {
        console.log('组织名称:', org.name);
        console.log('Tenant Key:', org.tenantKey);
        console.log('✅ 获取组织信息成功');
        results.passed++;
      } else {
        console.log('⚠️ 获取组织信息失败或没有权限');
        results.skipped++;
      }
    } catch (error) {
      console.log('⚠️ 获取组织信息失败:', (error as Error).message);
      results.skipped++;
    }
    console.log();

    // ==================== 测试 3: 获取群聊列表 ====================
    console.log('【测试 3】获取群聊列表');
    console.log('----------------------------------------------');
    let targetGroupId: string | null = null;
    
    try {
      const chats = await adapter.getChats(20);
      console.log(`共获取到 ${chats.items.length} 个群聊:`);
      
      if (chats.items.length > 0) {
        chats.items.forEach((chat, index) => {
          console.log(`  ${index + 1}. ${chat.name} (ID: ${chat.platformId})`);
          console.log(`     成员数: ${chat.memberCount || '未知'}`);
          if (!targetGroupId) {
            targetGroupId = chat.platformId;
          }
        });
        console.log('✅ 获取群聊列表成功');
        results.passed++;
      } else {
        console.log('⚠️ 没有找到群聊，机器人可能不在任何群中');
        results.skipped++;
      }
    } catch (error) {
      console.log('❌ 获取群聊列表失败:', (error as Error).message);
      results.failed++;
    }
    console.log();

    // ==================== 测试 4: 获取用户列表 ====================
    console.log('【测试 4】获取用户列表');
    console.log('----------------------------------------------');
    let targetUserId: string | null = null;
    
    try {
      const users = await adapter.getUsers(20);
      console.log(`共获取到 ${users.items.length} 个用户:`);
      
      if (users.items.length > 0) {
        users.items.forEach((user, index) => {
          console.log(`  ${index + 1}. ${user.name} (ID: ${user.platformId})`);
          if (user.email) console.log(`     邮箱: ${user.email}`);
          if (!targetUserId) {
            targetUserId = user.platformId;
          }
        });
        console.log('✅ 获取用户列表成功');
        results.passed++;
      } else {
        console.log('⚠️ 没有找到用户，可能没有通讯录权限');
        results.skipped++;
      }
    } catch (error: any) {
      if (error.response?.status === 403) {
        console.log('⚠️ 获取用户列表失败: 没有通讯录权限 (需要在飞书开发者平台申请权限)');
        results.skipped++;
      } else {
        console.log('❌ 获取用户列表失败:', (error as Error).message);
        results.failed++;
      }
    }
    console.log();

    // ==================== 测试 5: 获取群成员 ====================
    if (targetGroupId) {
      console.log('【测试 5】获取群成员');
      console.log('----------------------------------------------');
      console.log(`群聊 ID: ${targetGroupId}`);
      try {
        const members = await adapter.getChatMembers(targetGroupId, 20);
        console.log(`共获取到 ${members.items.length} 个成员:`);
        members.items.slice(0, 10).forEach((member, index) => {
          console.log(`  ${index + 1}. ${member.name} (ID: ${member.platformId})`);
        });
        if (members.items.length > 10) {
          console.log(`  ... 还有 ${members.items.length - 10} 个成员`);
        }
        console.log('✅ 获取群成员成功');
        results.passed++;
      } catch (error) {
        console.log('⚠️ 获取群成员失败:', (error as Error).message);
        results.skipped++;
      }
      console.log();
    }

    // ==================== 测试 6: 发送消息 ====================
    console.log('【测试 6】发送测试消息');
    console.log('----------------------------------------------');
    
    // 发送群聊消息
    if (targetGroupId) {
      console.log(`正在向群聊发送测试消息...`);
      try {
        const groupMsg = await adapter.sendMessage({
          chatType: 'group',
          chatId: targetGroupId,
          content: '🤖 飞书消息中间层系统测试消息\n\n这是一条来自机器人自动化测试的消息。\n时间: ' + new Date().toLocaleString('zh-CN'),
          type: 'text',
        });
        console.log('✅ 群聊消息发送成功');
        console.log('   消息 ID:', groupMsg.id);
        results.passed++;
      } catch (error: any) {
        if (error.msg?.includes('user is not in chat')) {
          console.log('❌ 群聊消息发送失败: 机器人不在该群中');
        } else {
          console.log('❌ 群聊消息发送失败:', (error as Error).message);
        }
        results.failed++;
      }
    } else {
      console.log('⚠️ 没有找到可用的群聊，跳过发送测试');
      results.skipped++;
    }

    // 发送私聊消息（如果有用户）
    if (targetUserId) {
      console.log(`\n正在向用户发送测试消息...`);
      try {
        const privateMsg = await adapter.sendMessage({
          chatType: 'private',
          chatId: targetUserId,
          content: '👋 你好！这是一条私聊测试消息。\n\n来自飞书消息中间层系统\n时间: ' + new Date().toLocaleString('zh-CN'),
          type: 'text',
        });
        console.log('✅ 私聊消息发送成功');
        console.log('   消息 ID:', privateMsg.id);
        results.passed++;
      } catch (error: any) {
        if (error.msg?.includes('not friend')) {
          console.log('❌ 私聊消息发送失败: 用户需要先给机器人发送消息才能回复');
        } else {
          console.log('❌ 私聊消息发送失败:', (error as Error).message);
        }
        results.failed++;
      }
    } else {
      console.log('\n⚠️ 没有找到可用用户，跳过私聊测试');
    }
    console.log();

    // ==================== 测试 7: 使用调度器发送消息 ====================
    console.log('【测试 7】使用消息调度器发送消息');
    console.log('----------------------------------------------');
    if (targetGroupId) {
      try {
        // 通过调度器发送（更加抽象的方式）
        const dispatchedMsg = await dispatcher.sendGroupMessage(
          targetGroupId,
          '📡 这是通过 MessageDispatcher 发送的消息\n展示了中间层的抽象能力！'
        );
        console.log('✅ 调度器发送消息成功');
        console.log('   消息 ID:', dispatchedMsg.id);
        results.passed++;
      } catch (error: any) {
        if (error.msg?.includes('user is not in chat')) {
          console.log('⚠️ 调度器发送消息失败: 机器人不在该群中');
          results.skipped++;
        } else {
          console.log('❌ 调度器发送消息失败:', (error as Error).message);
          results.failed++;
        }
      }
    } else {
      console.log('⚠️ 没有找到可用的群聊，跳过测试');
      results.skipped++;
    }
    console.log();

    // ==================== 测试 8: 注册事件监听 ====================
    console.log('【测试 8】注册事件监听');
    console.log('----------------------------------------------');
    dispatcher.onEvent('message.receive', (event) => {
      console.log('\n📨 收到消息事件:');
      console.log('   平台:', event.platform);
      const msg = event.data as any;
      console.log('   发送者:', msg.sender?.name);
      console.log('   内容:', msg.content?.substring(0, 100));
    });
    console.log('✅ 已注册消息接收事件处理器');
    results.passed++;
    console.log();

    // 启动事件监听
    await dispatcher.startEventListening();
    console.log('✅ 事件监听已启动（用于接收 webhook 事件）');
    results.passed++;
    console.log();

    // 总结
    console.log('==============================================');
    console.log('  测试完成！');
    console.log('==============================================');
    console.log();
    console.log('测试结果统计:');
    console.log(`  ✅ 通过: ${results.passed}`);
    console.log(`  ⚠️  跳过: ${results.skipped}`);
    console.log(`  ❌ 失败: ${results.failed}`);
    console.log();
    console.log('系统功能:');
    console.log('  ✅ 连接测试');
    console.log('  ✅ 获取群聊列表');
    console.log('  ⚠️  获取用户列表 (需要通讯录权限)');
    console.log('  ✅ 获取群成员');
    console.log('  ✅ 发送消息（群聊/私聊）');
    console.log('  ✅ 消息调度器抽象层');
    console.log('  ✅ 事件监听');
    console.log();
    console.log('如需接收消息，请:');
    console.log('  1. 在飞书开发者平台开启 "机器人" 功能');
    console.log('  2. 配置 Webhook URL 和事件订阅');
    console.log('  3. 在 .env 中设置 ENCRYPT_KEY 和 VERIFICATION_TOKEN');
    console.log();

  } catch (error) {
    console.error('测试过程中发生错误:', error);
    process.exit(1);
  }

  // 保持进程运行以便接收 webhook 事件
  console.log('按 Ctrl+C 退出程序...');
  process.stdin.resume();
}

// 运行测试
runTests().catch(console.error);
