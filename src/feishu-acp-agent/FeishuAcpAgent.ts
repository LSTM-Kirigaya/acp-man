/**
 * 飞书 ACP Agent 主类
 * 
 * 逻辑：
 * - 私聊：主 Agent，使用默认路径，不需要绑定，直接回复
 * - 群聊：需要绑定路径，未绑定时提示绑定，绑定后处理消息
 * - 群聊不需要 @机器人，所有文字消息都处理
 */

import lark from '@larksuiteoapi/node-sdk';
import { KimiAcpClient } from '../kimi-acp-client/index.js';
import { ChatSessionManager } from './ChatSessionManager.js';
import { FeishuWSClient } from './FeishuWSClient.js';
import { MediaStorage } from './MediaStorage.js';
import { ReactionManager } from './ReactionManager.js';
import { ConfigManager } from './ConfigManager.js';
import * as CardBuilder from './CardBuilder.js';
import type { 
  FeishuAcpAgentConfig, 
  FeishuMessageEvent, 
  FeishuCardEvent 
} from './types.js';

export class FeishuAcpAgent {
  private config: FeishuAcpAgentConfig;
  private feishuClient: lark.Client;
  private acpClient: KimiAcpClient;
  private sessionManager: ChatSessionManager;
  private wsClient: FeishuWSClient;
  private mediaStorage: MediaStorage;
  private reactionManager: ReactionManager;
  private configManager: ConfigManager;
  private isRunning = false;
  private processingMessages: Set<string> = new Set();

  constructor(config: FeishuAcpAgentConfig) {
    this.config = config;

    // 初始化配置管理器
    this.configManager = new ConfigManager(
      './config/bindings.json',
      config.acp?.defaultCwd || process.cwd()
    );

    // 初始化飞书客户端
    this.feishuClient = new lark.Client({
      appId: config.feishu.appId,
      appSecret: config.feishu.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });

    // 初始化 ACP 客户端
    this.acpClient = new KimiAcpClient({
      kimiPath: config.acp?.kimiPath,
      cwd: config.acp?.defaultCwd,
      debug: config.acp?.debug ?? false,
    });

    // 初始化媒体存储
    this.mediaStorage = new MediaStorage({
      storageDir: './media_storage',
    });

    // 初始化会话管理器
    this.sessionManager = new ChatSessionManager(
      config,
      this.acpClient,
      { 
        mediaDir: './media_storage',
        configManager: this.configManager 
      }
    );

    // 初始化表情回复管理器
    this.reactionManager = new ReactionManager({
      appId: config.feishu.appId,
      appSecret: config.feishu.appSecret,
    });

    // 初始化 WebSocket 客户端
    this.wsClient = new FeishuWSClient({
      appId: config.feishu.appId,
      appSecret: config.feishu.appSecret,
      debug: config.acp?.debug ?? false,
    });

    this.setupEventListeners();
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    // 会话管理器事件
    this.sessionManager.on('replyNeeded', async ({ session, message }) => {
      // 私聊时使用 lastSender.userId，群聊时使用 chatId
      const receiveId = session.chatType === 'private' 
        ? (session.lastSender?.userId || session.chatId)
        : session.chatId;
      await this.sendTextMessage(receiveId, session.chatType, message);
    });

    this.sessionManager.on('processingStarted', ({ session, message }) => {
      console.log(`[Agent] Processing message in ${session.name || session.chatId}: ${message.content.text?.substring(0, 50)}...`);
    });

    this.sessionManager.on('processingError', async ({ session, error }) => {
      console.error(`[Agent] Processing error in ${session.name || session.chatId}:`, error);
      const receiveId = session.chatType === 'private' 
        ? (session.lastSender?.userId || session.chatId)
        : session.chatId;
      await this.sendTextMessage(receiveId, session.chatType, `❌ 处理失败: ${(error as Error).message}`);
    });

    // 需要绑定事件
    this.sessionManager.on('bindingRequired', async ({ chatId, chatType, name }) => {
      console.log(`[Agent] Binding required for group ${chatId.substring(0, 16)}...`);
      await this.sendBindingCard(chatId, chatType);
    });

    // WebSocket 客户端事件
    this.wsClient.on('message', (event) => {
      console.log('[Agent] WebSocket message event received, calling handleMessageEvent');
      this.handleMessageEvent(event).catch(error => {
        console.error('[Agent] Error in handleMessageEvent:', error);
      });
    });

    this.wsClient.on('botAdded', (data) => {
      console.log('[Agent] Bot added to chat:', data);
    });

    this.wsClient.on('botRemoved', (data) => {
      console.log('[Agent] Bot removed from chat:', data);
    });
  }

  /**
   * 启动 Agent
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Agent is already running');
    }

    console.log('[Agent] Starting Feishu ACP Agent...');

    // 加载配置
    await this.configManager.load();

    // 连接 ACP
    try {
      await this.acpClient.connect();
      console.log('[Agent] Connected to Kimi ACP');
      console.log(`[Agent] Default workspace: ${this.configManager.getDefaultCwd()}`);
    } catch (error) {
      console.error('[Agent] Failed to connect to Kimi ACP:', error);
      throw error;
    }

    // 启动 WebSocket 连接
    try {
      await this.wsClient.start();
    } catch (error) {
      console.error('[Agent] Failed to start WebSocket client:', error);
      await this.acpClient.disconnect();
      throw error;
    }

    this.isRunning = true;
    console.log('[Agent] Agent started successfully');

    // 启动清理定时器
    this.startCleanupTimer();
  }

  /**
   * 停止 Agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[Agent] Stopping Feishu ACP Agent...');

    await this.reactionManager.clearAllReactions();
    await this.wsClient.stop();
    await this.acpClient.disconnect();

    this.isRunning = false;
    console.log('[Agent] Agent stopped');
  }

  /**
   * 处理消息事件
   */
  private async handleMessageEvent(event: FeishuMessageEvent): Promise<void> {
    console.log('[Agent] handleMessageEvent called!');
    
    const { message } = event.event;
    const chatId = message.chat_id;
    const chatType = message.chat_type === 'p2p' ? 'private' : 'group';
    const senderId = message.sender.sender_id.open_id;
    const messageType = message.message_type;
    const messageId = message.message_id;
    
    console.log(`[Agent] Message received: type=${chatType}, msg_type=${messageType}, chat_id=${chatId.substring(0, 16)}...`);

    // 获取聊天信息
    let chatName: string | undefined;
    try {
      if (chatType === 'group') {
        const chatInfo = await this.feishuClient.im.chat.get({
          path: { chat_id: chatId },
        });
        if (chatInfo.code === 0) {
          chatName = chatInfo.data?.name;
        }
      }
    } catch (error) {
      console.error('[Agent] Failed to get chat info:', error);
    }

    // 获取发送者信息
    let senderName: string | undefined;
    try {
      const userInfo = await this.feishuClient.contact.user.get({
        path: { user_id: senderId },
        params: { user_id_type: 'open_id' },
      });
      if (userInfo.code === 0) {
        senderName = userInfo.data?.user?.name;
      }
    } catch (error) {
      console.error('[Agent] Failed to get user info:', error);
    }

    // 解析消息内容
    let contentText = '';
    try {
      if (messageType === 'text') {
        const parsed = JSON.parse(message.content);
        contentText = parsed.text || '';
      }
    } catch {
      contentText = message.content;
    }

    // 打印接收到的消息
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log(`║  📨 收到飞书消息 [${chatType === 'private' ? '私聊' : '群聊'}]`);
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  类型: ${messageType.padEnd(46)} ║`);
    console.log(`║  发送者: ${(senderName || senderId.substring(0, 20)).padEnd(44)} ║`);
    console.log(`║  聊天: ${(chatName || chatId.substring(0, 16)).padEnd(46)} ║`);
    if (chatType === 'group') {
      const isBound = this.configManager.isChatBound(chatId);
      console.log(`║  绑定状态: ${(isBound ? '已绑定' : '未绑定').padEnd(42)} ║`);
    } else {
      console.log(`║  绑定状态: 主 Agent (无需绑定)`.padEnd(46) + '║');
    }
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log('║  内容:');
    const lines = contentText.split('\n');
    for (const line of lines.slice(0, 3)) {
      const truncated = line.substring(0, 50);
      console.log(`║    ${truncated.padEnd(54)} ║`);
    }
    if (lines.length > 3) {
      console.log(`║    ... (${lines.length - 3} 行省略)`.padEnd(58) + ' ║');
    }
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // 添加"正在输入"表情
    await this.reactionManager.addTypingReaction(messageId);
    await this.reactionManager.setTypingStatus(messageId, true);
    this.processingMessages.add(messageId);

    try {
      // 处理消息
      await this.processMessage(
        chatId,
        chatType,
        senderId,
        senderName,
        messageType,
        contentText,
        message.content,
        chatName
      );
    } finally {
      this.processingMessages.delete(messageId);
      await this.reactionManager.removeTypingReaction(messageId);
      await this.reactionManager.setTypingStatus(messageId, false);
    }
  }

  /**
   * 处理消息
   */
  private async processMessage(
    chatId: string,
    chatType: 'private' | 'group',
    senderId: string,
    senderName: string | undefined,
    messageType: string,
    contentText: string,
    rawContent: string,
    chatName?: string
  ): Promise<void> {
    // 私聊：直接处理（主 Agent）
    if (chatType === 'private') {
      await this.handlePrivateMessage(
        chatId,
        senderId,
        senderName,
        messageType,
        contentText,
        rawContent
      );
      return;
    }

    // 群聊：检查是否已绑定
    const isBound = this.configManager.isChatBound(chatId);
    
    if (!isBound) {
      // 未绑定：检查是否是绑定命令
      const trimmedContent = contentText.trim();
      
      if (trimmedContent.startsWith('/bind ')) {
        // 绑定命令
        const path = trimmedContent.substring(6).trim();
        if (path && path.startsWith('/')) {
          await this.sessionManager.bindGroupPath(chatId, path);
          await this.sendTextMessage(chatId, chatType, 
            `✅ 绑定成功！\n\n工作目录：\`\`\`\n${path}\n\`\`\`\n\n现在可以开始对话了。`
          );
        } else {
          await this.sendTextMessage(chatId, chatType, 
            '❌ 路径格式错误。请使用绝对路径，例如：`/bind /Users/username/project`'
          );
        }
      } else {
        // 未绑定，发送绑定提示
        await this.sendBindingCard(chatId, chatType);
      }
      return;
    }

    // 已绑定：正常处理消息
    await this.handleGroupMessage(
      chatId,
      senderId,
      senderName,
      messageType,
      contentText,
      rawContent,
      chatName
    );
  }

  /**
   * 处理私聊消息
   */
  private async handlePrivateMessage(
    chatId: string,
    senderId: string,
    senderName: string | undefined,
    messageType: string,
    contentText: string,
    rawContent: string
  ): Promise<void> {
    // 去除 @机器人的标记
    contentText = contentText.replace(/@_user_\d+/g, '').trim();

    // 检查是否是命令
    if (contentText.startsWith('/')) {
      await this.handlePrivateCommand(chatId, senderId, contentText);
      return;
    }

    // 普通消息，加入队列处理
    if (messageType === 'text' && contentText) {
      this.sessionManager.enqueueMessage(
        chatId,
        'private',
        { userId: senderId, name: senderName },
        { type: 'text', text: contentText },
        '私聊'
      );
    }
  }

  /**
   * 处理群聊消息
   */
  private async handleGroupMessage(
    chatId: string,
    senderId: string,
    senderName: string | undefined,
    messageType: string,
    contentText: string,
    rawContent: string,
    chatName?: string
  ): Promise<void> {
    // 群聊不需要 @机器人，所有文字消息都处理
    // 但如果是命令，需要特殊处理
    const trimmedContent = contentText.trim();

    if (trimmedContent.startsWith('/')) {
      await this.handleGroupCommand(chatId, senderId, trimmedContent, chatName);
      return;
    }

    // 普通消息，加入队列处理
    if (messageType === 'text' && contentText) {
      const result = await this.sessionManager.enqueueMessage(
        chatId,
        'group',
        { userId: senderId, name: senderName },
        { type: 'text', text: contentText },
        chatName
      );

      // 如果返回 null，说明需要绑定
      if (result === null) {
        await this.sendBindingCard(chatId, 'group');
      }
    }
  }

  /**
   * 处理私聊命令
   */
  private async handlePrivateCommand(
    chatId: string,
    senderId: string,
    command: string
  ): Promise<void> {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();

    console.log(`[Agent] Private command: ${cmd} from ${senderId}`);

    // 私聊时使用 senderId（用户的 open_id）作为接收者
    const receiveId = senderId;

    switch (cmd) {
      case '/help':
      case '/start':
        await this.sendTextMessage(receiveId, 'private', 
          '🤖 **主 Agent 帮助**\n\n' +
          '我是 Kimi 主 Agent，可以直接对话，无需绑定路径。\n\n' +
          '**可用命令：**\n' +
          '`/help` - 显示帮助\n' +
          '`/status` - 查看当前状态'
        );
        break;

      case '/status':
        await this.sendTextMessage(receiveId, 'private', 
          '📊 **主 Agent 状态**\n\n' +
          `当前工作目录：\`\`\`\n${this.configManager.getDefaultCwd()}\n\`\`\``
        );
        break;

      default:
        // 未知命令也转发给 Kimi 处理
        this.sessionManager.enqueueMessage(
          chatId,
          'private',
          { userId: senderId, name: undefined },
          { type: 'text', text: command },
          '私聊'
        );
    }
  }

  /**
   * 处理群聊命令
   */
  private async handleGroupCommand(
    chatId: string,
    senderId: string,
    command: string,
    chatName?: string
  ): Promise<void> {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();

    console.log(`[Agent] Group command: ${cmd} from ${senderId}`);

    switch (cmd) {
      case '/bind':
        if (parts.length >= 2) {
          const path = parts.slice(1).join(' ').trim();
          if (path.startsWith('/')) {
            await this.sessionManager.bindGroupPath(chatId, path);
            await this.sendTextMessage(chatId, 'group', 
              `✅ 绑定成功！\n\n工作目录：\`\`\`\n${path}\n\`\`\``
            );
          } else {
            await this.sendTextMessage(chatId, 'group', 
              '❌ 路径必须是绝对路径，以 / 开头'
            );
          }
        } else {
          // 显示当前绑定状态
          const currentPath = this.configManager.getChatBinding(chatId);
          if (currentPath) {
            await this.sendTextMessage(chatId, 'group', 
              `🔗 当前绑定路径：\`\`\`\n${currentPath}\n\`\`\`\n\n要更改路径，请发送：\`/bind /新路径\``
            );
          } else {
            await this.sendBindingCard(chatId, 'group');
          }
        }
        break;

      case '/status':
        const bindPath = this.configManager.getChatBinding(chatId);
        const session = this.sessionManager.getSession(chatId);
        await this.sendTextMessage(chatId, 'group', 
          `📊 **群聊状态**\n\n` +
          `绑定路径：${bindPath ? '`' + bindPath + '`' : '未绑定'}\n` +
          `消息队列：${session?.messageQueue.length || 0} 条待处理\n` +
          `媒体缓存：${session?.pendingMedia.length || 0} 个文件`
        );
        break;

      case '/help':
        await this.sendTextMessage(chatId, 'group', 
          '🤖 **群聊 Agent 帮助**\n\n' +
          '**可用命令：**\n' +
          '`/bind /path` - 绑定工作目录\n' +
          '`/bind` - 查看当前绑定\n' +
          '`/status` - 查看状态\n' +
          '`/help` - 显示帮助\n\n' +
          '**使用说明：**\n' +
          '1. 首次使用需要绑定工作目录\n' +
          '2. 绑定后直接发送消息即可对话\n' +
          '3. 不需要 @机器人'
        );
        break;

      default:
        // 未知命令转发给 Kimi
        this.sessionManager.enqueueMessage(
          chatId,
          'group',
          { userId: senderId, name: undefined },
          { type: 'text', text: command },
          chatName
        );
    }
  }

  /**
   * 发送绑定提示卡片
   */
  private async sendBindingCard(
    chatId: string,
    chatType: 'private' | 'group'
  ): Promise<void> {
    const message = 
      '⚠️ **此群聊尚未绑定工作目录**\n\n' +
      '请发送以下命令绑定路径：\n' +
      '`/bind /Users/username/project`\n\n' +
      '绑定后，Kimi Agent 将在此目录下执行操作。';

    await this.sendTextMessage(chatId, chatType, message);
  }

  /**
   * 发送文本消息
   * 
   * @param receiveId 接收者ID（私聊是用户的 open_id，群聊是 chat_id）
   * @param chatType 聊天类型
   * @param text 消息内容
   */
  private async sendTextMessage(
    receiveId: string,
    chatType: 'private' | 'group',
    text: string
  ): Promise<void> {
    try {
      const receiveIdType = chatType === 'private' ? 'open_id' : 'chat_id';

      console.log(`[Agent] Sending message to ${chatType}: ${receiveIdType}=${receiveId.substring(0, 16)}...`);

      await this.feishuClient.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: {
          receive_id: receiveId,
          content: JSON.stringify({ text }),
          msg_type: 'text',
        },
      });
      console.log(`[Agent] Message sent successfully`);
    } catch (error) {
      console.error('[Agent] Failed to send text message:', error);
    }
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    setInterval(async () => {
      try {
        // 清理过期媒体文件
        // ...
      } catch (error) {
        console.error('[Agent] Cleanup error:', error);
      }
    }, 30 * 60 * 1000);
  }

  /**
   * 获取运行状态
   */
  get status(): { 
    isRunning: boolean; 
    sessions: number;
    bindings: number;
  } {
    return {
      isRunning: this.isRunning,
      sessions: this.sessionManager.getAllSessions().length,
      bindings: Object.keys(this.configManager.getAllBindings()).length,
    };
  }
}

export default FeishuAcpAgent;
