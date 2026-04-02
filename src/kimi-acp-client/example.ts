/**
 * Kimi ACP 客户端使用示例
 * 
 * 演示如何连接到 Kimi CLI 的 ACP 服务端并进行通信
 * 
 * 使用方法:
 * 1. 确保已安装 Kimi CLI: npm install -g @anthropic-ai/kimi-cli
 * 2. 确保已登录: kimi login
 * 3. 运行示例: npx ts-node src/kimi-acp-client/example.ts
 */

import { KimiAcpClient } from './index';
import * as path from 'path';

async function main() {
  console.log('==============================================');
  console.log('  Kimi ACP 客户端示例');
  console.log('==============================================');
  console.log();

  // 创建客户端实例
  const client = new KimiAcpClient({
    // 如果需要指定 Kimi CLI 路径，取消下面注释
    // kimiPath: '/path/to/kimi',
    
    // 启用调试日志
    debug: true,
    
    // 设置工作目录
    cwd: process.cwd(),
  });

  // 设置会话更新处理器（接收流式响应）
  client.onSessionUpdate = (update) => {
    console.log('\n[会话更新]');
    console.log('类型:', update.update.type);
    
    // 根据更新类型处理
    switch (update.update.type) {
      case 'text_delta':
        // 文本增量更新
        process.stdout.write(update.update.delta || '');
        break;
      case 'thinking_delta':
        // 思考过程更新
        console.log('[思考]', update.update.delta);
        break;
      case 'tool_call_start':
        // 工具调用开始
        console.log('[工具调用]', update.update.title || 'Unknown tool');
        break;
      case 'tool_call_update':
        // 工具调用进度更新
        break;
      case 'tool_call_result':
        // 工具调用结果
        console.log('[工具结果]', update.update.status);
        break;
      default:
        console.log('更新内容:', JSON.stringify(update.update, null, 2));
    }
  };

  // 设置权限请求处理器
  client.onPermissionRequest = async (request) => {
    console.log('\n[权限请求]');
    console.log('标题:', request.title);
    console.log('描述:', request.description);
    console.log('工具:', request.toolName);
    
    // 这里可以询问用户是否批准
    // 示例中自动批准
    return { outcome: 'approved' };
  };

  try {
    // 连接到 Kimi ACP 服务端
    console.log('正在连接到 Kimi ACP 服务端...');
    await client.connect();
    console.log('✅ 连接成功!\n');

    // 创建新会话
    const workDir = path.resolve(__dirname, '../../');
    console.log('创建工作目录:', workDir);
    
    const session = await client.newSession(workDir, {
      // 可选：指定会话 ID
      // sessionId: 'my-session-id',
      
      // 可选：添加 MCP 服务器
      // mcpServers: [
      //   {
      //     name: 'filesystem',
      //     command: 'npx',
      //     args: ['-y', '@modelcontextprotocol/server-filesystem', workDir],
      //   },
      // ],
    });

    console.log('✅ 会话创建成功!');
    console.log('会话 ID:', session.sessionId);
    console.log('当前模式:', session.modes?.currentModeId);
    console.log();

    // 发送消息
    const prompt = '你好，请介绍一下 ACP (Agent Client Protocol) 是什么？';
    console.log('发送消息:', prompt);
    console.log('等待响应...\n');

    const response = await client.sendMessage(session.sessionId, prompt);

    console.log('\n[响应完成]');
    console.log('停止原因:', response.stopReason);
    
    if (response.content) {
      console.log('\n响应内容:');
      for (const content of response.content) {
        if (content.type === 'text') {
          console.log(content.text);
        }
      }
    }

    // 继续对话
    console.log('\n---\n');
    const followUpPrompt = '那它和 MCP (Model Context Protocol) 有什么区别？';
    console.log('发送消息:', followUpPrompt);
    
    const followUpResponse = await client.sendMessage(session.sessionId, followUpPrompt);
    
    console.log('\n[响应完成]');
    if (followUpResponse.content) {
      for (const content of followUpResponse.content) {
        if (content.type === 'text') {
          console.log(content.text);
        }
      }
    }

    // 断开连接
    console.log('\n断开连接...');
    await client.disconnect();
    console.log('✅ 已断开连接');

  } catch (error) {
    console.error('❌ 错误:', error);
    
    // 确保断开连接
    try {
      await client.disconnect();
    } catch {
      // 忽略
    }
    
    process.exit(1);
  }
}

// 运行示例
main().catch(console.error);
