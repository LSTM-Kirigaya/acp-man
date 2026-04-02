/**
 * Feishu ACP Agent - 主入口
 * 
 * 基于 ACP 协议的飞书 Agent，使用 WebSocket 长连接（无需 Webhook）
 * 
 * 逻辑：
 * - 私聊：主 Agent，使用默认路径，不需要绑定
 * - 群聊：需要绑定路径，绑定信息保存在配置文件
 */

import { FeishuAcpAgent } from './FeishuAcpAgent.js';
import { ConfigManager } from './ConfigManager.js';
import type { FeishuAcpAgentConfig } from './types.js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 从环境变量加载配置
 */
function loadConfig(): FeishuAcpAgentConfig {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    console.error('❌ 错误: 缺少飞书应用配置');
    console.error('   请设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    console.error('   或在 .env 文件中配置');
    process.exit(1);
  }

  return {
    feishu: {
      appId,
      appSecret,
    },
    // WebSocket 模式不需要 server 配置
    server: {
      port: 0,
      host: '0.0.0.0',
      path: '',
    },
    acp: {
      defaultCwd: process.env.ACP_DEFAULT_CWD || process.cwd(),
      kimiPath: process.env.KIMI_PATH || 'kimi',
      debug: process.env.DEBUG === 'true',
    },
  };
}

/**
 * 启动 Agent
 */
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          Feishu ACP Agent - 启动中...                    ║');
  console.log('║          使用 WebSocket 长连接（无需 Webhook）           ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  私聊：主 Agent，无需绑定，直接对话                      ║');
  console.log('║  群聊：需要绑定路径，绑定信息持久化保存                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  const config = loadConfig();

  console.log('📋 配置信息:');
  console.log(`   飞书 App ID: ${config.feishu.appId.slice(0, 8)}...`);
  console.log(`   连接方式: WebSocket 长连接`);
  console.log(`   私聊默认目录: ${config.acp?.defaultCwd || process.cwd()}`);
  console.log(`   绑定配置: ./config/bindings.json`);
  console.log(`   调试模式: ${config.acp?.debug ? '开启' : '关闭'}`);
  console.log();

  const agent = new FeishuAcpAgent(config);

  // 处理进程信号
  process.on('SIGINT', async () => {
    console.log('\n\n[Main] Received SIGINT, shutting down...');
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\n[Main] Received SIGTERM, shutting down...');
    await agent.stop();
    process.exit(0);
  });

  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    console.error('[Main] Uncaught exception:', error);
    agent.stop().then(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Main] Unhandled rejection:', reason);
  });

  // 启动 Agent
  try {
    await agent.start();
    console.log();
    console.log('✅ Agent 启动成功！');
    console.log();
    console.log('📖 私聊使用：');
    console.log('   • 直接发送消息，无需绑定');
    console.log('   • 主 Agent 使用默认工作目录');
    console.log();
    console.log('📖 群聊使用：');
    console.log('   1. 首次使用发送 `/bind /路径` 绑定工作目录');
    console.log('   2. 绑定后直接发送消息即可（无需 @机器人）');
    console.log('   3. 发送 `/status` 查看绑定状态');
    console.log();
    console.log('📝 可用命令：');
    console.log('   /bind /path  - 绑定工作目录（群聊）');
    console.log('   /bind        - 查看当前绑定');
    console.log('   /status      - 查看状态');
    console.log('   /help        - 显示帮助');
    console.log();
    console.log('按 Ctrl+C 退出程序...');
    console.log();
  } catch (error) {
    console.error('[Main] Failed to start agent:', error);
    process.exit(1);
  }
}

// 启动
main();

export { FeishuAcpAgent, ConfigManager };
export * from './types.js';
export * as CardBuilder from './CardBuilder.js';
