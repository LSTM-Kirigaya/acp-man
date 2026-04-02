/**
 * 飞书基础功能测试脚本（独立版本）
 * 
 * 测试内容：
 * 1. 获取组织名称
 * 2. 获取群聊列表
 * 3. 发送测试消息
 */

import dotenv from 'dotenv';
import lark from '@larksuiteoapi/node-sdk';

// 加载环境变量
dotenv.config();

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;

async function runBasicTests() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         飞书基础功能测试 - 组织、群聊、消息发送           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // 检查配置
  if (!APP_ID || !APP_SECRET) {
    console.error('❌ 错误: 缺少飞书应用配置');
    console.error('   请设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    console.error('   或在 .env 文件中配置');
    process.exit(1);
  }

  console.log('📋 配置信息:');
  console.log(`   App ID: ${APP_ID.slice(0, 8)}...`);
  console.log(`   App Secret: ${APP_SECRET.slice(0, 8)}...`);
  console.log();

  // 创建飞书客户端
  const client = new lark.Client({
    appId: APP_ID,
    appSecret: APP_SECRET,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });

  try {
    // ==================== 步骤 1: 连接测试 ====================
    console.log('【步骤 1】连接飞书 API');
    console.log('─────────────────────────────────────────────────────────');
    const tokenResult = await client.auth.tenantAccessToken.internal({
      data: {
        app_id: APP_ID,
        app_secret: APP_SECRET,
      },
    });
    if (tokenResult.code !== 0) {
      throw new Error(`连接失败: ${tokenResult.msg}`);
    }
    console.log('✅ 连接成功');
    console.log();

    // ==================== 步骤 2: 获取组织信息 ====================
    console.log('【步骤 2】获取组织信息');
    console.log('─────────────────────────────────────────────────────────');
    let orgName = null;
    try {
      // 飞书没有直接的租户信息接口，我们尝试通过部门列表获取
      const deptResult = await client.contact.department.list({
        params: {
          user_id_type: 'open_id',
          department_id_type: 'open_department_id',
          parent_department_id: '0',
        },
      });
      if (deptResult.code === 0 && deptResult.data?.items && deptResult.data.items.length > 0) {
        // 尝试从第一个部门的名称推断组织名称
        const firstDept = deptResult.data.items[0];
        console.log('✅ 获取成功');
        console.log(`   根部门: ${firstDept.name}`);
        orgName = firstDept.name;
      } else {
        console.log('⚠️  无法获取组织信息（可能没有权限）');
      }
    } catch (error: any) {
      console.log('⚠️  获取组织信息失败:', error.message);
    }
    console.log();

    // ==================== 步骤 3: 获取群聊列表 ====================
    console.log('【步骤 3】获取群聊列表');
    console.log('─────────────────────────────────────────────────────────');
    const chatResult = await client.im.chat.list({
      params: {
        user_id_type: 'open_id',
        page_size: 20,
      },
    });

    if (chatResult.code !== 0) {
      throw new Error(`获取群聊列表失败: ${chatResult.msg}`);
    }

    const chats = chatResult.data?.items || [];
    console.log(`✅ 获取成功，共 ${chats.length} 个群聊`);
    console.log();

    if (chats.length === 0) {
      console.log('⚠️  没有找到群聊，请先将机器人添加到群聊中');
      console.log();
    } else {
      console.log('   群聊列表:');
      chats.forEach((chat: any, index: number) => {
        console.log(`   ${index + 1}. ${chat.name}`);
        console.log(`      ID: ${chat.chat_id}`);
        if (chat.description) {
          console.log(`      描述: ${chat.description}`);
        }
      });
      console.log();

      // 选择第一个群聊进行消息发送测试
      const targetChat = chats[0];
      console.log(`【步骤 4】发送测试消息到群聊: ${targetChat.name}`);
      console.log('─────────────────────────────────────────────────────────');
      
      try {
        const msgResult = await client.im.message.create({
          params: {
            receive_id_type: 'chat_id',
          },
          data: {
            receive_id: targetChat.chat_id,
            content: JSON.stringify({
              text: `🤖 测试消息\n\n这是一条来自自动化测试脚本的消息。\n时间: ${new Date().toLocaleString('zh-CN')}`,
            }),
            msg_type: 'text',
          },
        });

        if (msgResult.code !== 0) {
          throw new Error(msgResult.msg);
        }
        
        console.log('✅ 消息发送成功');
        console.log(`   消息 ID: ${msgResult.data?.message_id}`);
      } catch (sendError: any) {
        if (sendError.message?.includes('user is not in chat')) {
          console.log('❌ 发送失败: 机器人不在该群中');
        } else {
          console.log('❌ 发送失败:', sendError.message);
        }
      }
      console.log();
    }

    // ==================== 测试完成 ====================
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                     测试完成                             ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log();
    console.log('📊 测试结果:');
    console.log('   ✅ 连接 API: 通过');
    console.log(`   ${orgName ? '✅' : '⚠️ '} 获取组织: ${orgName || '失败/无权限'}`);
    console.log(`   ${chats.length > 0 ? '✅' : '⚠️ '} 获取群聊: ${chats.length} 个群聊`);
    console.log();

  } catch (error: any) {
    console.error('\n❌ 测试过程中发生错误:');
    console.error('   ', error.message);
    
    if (error.message?.includes('app_id')) {
      console.error('\n💡 提示: 请检查 FEISHU_APP_ID 和 FEISHU_APP_SECRET 是否正确');
    }
    
    process.exit(1);
  }
}

// 运行测试
runBasicTests();
