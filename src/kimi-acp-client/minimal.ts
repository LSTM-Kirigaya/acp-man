/**
 * Kimi ACP 客户端最小案例
 * 
 * 最简单的连接 Kimi ACP 服务端示例
 * 
 * 前置要求:
 * 1. 安装 Kimi CLI: npm install -g @anthropic-ai/kimi-cli
 * 2. 登录: kimi login
 * 
 * 使用方法:
 * npx ts-node src/kimi-acp-client/minimal.ts
 */

import { KimiAcpClient } from './index';

async function minimalExample() {
  // 1. 创建客户端
  const client = new KimiAcpClient({ debug: true });

  try {
    // 2. 连接服务端
    console.log('Connecting to Kimi ACP...');
    await client.connect();
    console.log('Connected!\n');

    // 3. 创建会话
    const session = await client.newSession(process.cwd());
    console.log('Session created:', session.sessionId, '\n');

    // 4. 发送消息
    console.log('User: 你好，请写一个 Hello World 程序');
    const response = await client.sendMessage(
      session.sessionId, 
      '你好，请写一个 Hello World 程序'
    );
    
    // 5. 打印响应
    console.log('\nKimi:', response.content?.[0]?.text || 'No response');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // 6. 断开连接
    await client.disconnect();
    console.log('\nDisconnected');
  }
}

minimalExample();
