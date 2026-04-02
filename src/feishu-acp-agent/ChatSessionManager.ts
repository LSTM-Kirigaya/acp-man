/**
 * 会话管理器
 * 管理飞书会话与 ACP 会话的映射，处理消息队列
 * 
 * 逻辑：
 * - 私聊：使用主 Agent，默认路径，不需要绑定
 * - 群聊：需要绑定路径，未绑定时需要提示绑定
 */

import type { 
  ChatSession, 
  QueuedMessage, 
  SenderInfo, 
  MessageContent,
  PendingMedia,
  FeishuAcpAgentConfig 
} from './types.js';
import { KimiAcpClient } from '../kimi-acp-client/index.js';
import { ConfigManager } from './ConfigManager.js';
import { EventEmitter } from 'node:events';

interface SessionManagerOptions {
  /** 会话超时时间（毫秒），默认 30 分钟 */
  sessionTimeout?: number;
  /** 最大队列长度 */
  maxQueueLength?: number;
  /** 媒体文件保存目录 */
  mediaDir?: string;
  /** 配置管理器 */
  configManager: ConfigManager;
}

export class ChatSessionManager extends EventEmitter {
  private sessions: Map<string, ChatSession> = new Map();
  private acpClient: KimiAcpClient;
  private config: FeishuAcpAgentConfig;
  private options: Required<SessionManagerOptions>;
  private configManager: ConfigManager;

  constructor(
    config: FeishuAcpAgentConfig,
    acpClient: KimiAcpClient,
    options: SessionManagerOptions
  ) {
    super();
    this.config = config;
    this.acpClient = acpClient;
    this.configManager = options.configManager;
    this.options = {
      sessionTimeout: options.sessionTimeout ?? 30 * 60 * 1000, // 30 分钟
      maxQueueLength: options.maxQueueLength ?? 100,
      mediaDir: options.mediaDir ?? './media',
      configManager: options.configManager,
    };

    // 启动清理定时器
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
  }

  /**
   * 获取或创建会话
   * 
   * 私聊：使用默认路径（主 Agent）
   * 群聊：使用绑定的路径（如果有）
   */
  getOrCreateSession(chatId: string, chatType: 'private' | 'group', name?: string): ChatSession {
    let session = this.sessions.get(chatId);
    
    if (!session) {
      // 确定绑定路径
      let bindPath: string | undefined;
      
      if (chatType === 'private') {
        // 私聊：使用默认路径（主 Agent）
        bindPath = this.configManager.getDefaultCwd();
        console.log(`[ChatSessionManager] Private chat ${chatId.substring(0, 16)}... using default path: ${bindPath}`);
      } else {
        // 群聊：使用配置中的绑定路径
        bindPath = this.configManager.getChatBinding(chatId);
        if (bindPath) {
          console.log(`[ChatSessionManager] Group chat ${chatId.substring(0, 16)}... bound to: ${bindPath}`);
        } else {
          console.log(`[ChatSessionManager] Group chat ${chatId.substring(0, 16)}... not bound yet`);
        }
      }
      
      session = {
        chatId,
        chatType,
        name,
        bindPath,
        messageQueue: [],
        isProcessing: false,
        pendingMedia: [],
        lastActivity: Date.now(),
      };
      
      this.sessions.set(chatId, session);
      this.emit('sessionCreated', session);
    } else {
      // 更新绑定路径（可能配置已更改）
      if (chatType === 'private') {
        session.bindPath = this.configManager.getDefaultCwd();
      } else {
        session.bindPath = this.configManager.getChatBinding(chatId);
      }
      session.lastActivity = Date.now();
    }

    return session;
  }

  /**
   * 获取会话
   */
  getSession(chatId: string): ChatSession | undefined {
    const session = this.sessions.get(chatId);
    if (session) {
      // 更新绑定路径
      if (session.chatType === 'private') {
        session.bindPath = this.configManager.getDefaultCwd();
      } else {
        session.bindPath = this.configManager.getChatBinding(chatId);
      }
    }
    return session;
  }

  /**
   * 绑定群聊工作目录
   */
  async bindGroupPath(chatId: string, path: string): Promise<void> {
    await this.configManager.setChatBinding(chatId, path);
    
    const session = this.sessions.get(chatId);
    if (session) {
      session.bindPath = path;
      session.lastActivity = Date.now();
      this.emit('sessionBound', { session, path });
    }
  }

  /**
   * 检查群聊是否已绑定
   */
  isGroupBound(chatId: string): boolean {
    return this.configManager.isChatBound(chatId);
  }

  /**
   * 获取群聊绑定路径
   */
  getGroupBinding(chatId: string): string | undefined {
    return this.configManager.getChatBinding(chatId);
  }

  /**
   * 将消息加入队列
   * 
   * 私聊：直接处理
   * 群聊：如果未绑定，触发绑定请求事件
   */
  async enqueueMessage(
    chatId: string,
    chatType: 'private' | 'group',
    sender: SenderInfo,
    content: MessageContent,
    name?: string
  ): Promise<QueuedMessage | null> {
    const session = this.getOrCreateSession(chatId, chatType, name);

    // 群聊检查是否已绑定
    if (chatType === 'group' && !session.bindPath) {
      console.log(`[ChatSessionManager] Group ${chatId.substring(0, 16)}... not bound, requesting binding`);
      this.emit('bindingRequired', { chatId, chatType, name });
      return null;
    }

    const message: QueuedMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      sender,
      content,
      timestamp: Date.now(),
    };

    // 保存最后发送者信息（用于私聊回复）
    session.lastSender = sender;

    // 检查队列长度
    if (session.messageQueue.length >= this.options.maxQueueLength) {
      session.messageQueue.shift();
    }

    session.messageQueue.push(message);
    session.lastActivity = Date.now();

    this.emit('messageEnqueued', { session, message });

    // 触发处理
    this.processQueue(chatId);

    return message;
  }

  /**
   * 暂存媒体文件
   */
  async storeMedia(
    chatId: string,
    chatType: 'private' | 'group',
    media: Omit<PendingMedia, 'storedAt'>,
    name?: string
  ): Promise<void> {
    const session = this.getOrCreateSession(chatId, chatType, name);
    
    const pendingMedia: PendingMedia = {
      ...media,
      storedAt: Date.now(),
    };

    session.pendingMedia.push(pendingMedia);
    session.lastActivity = Date.now();

    this.emit('mediaStored', { session, media: pendingMedia });
  }

  /**
   * 清空并获取暂存的媒体文件
   */
  clearPendingMedia(chatId: string): PendingMedia[] {
    const session = this.sessions.get(chatId);
    if (!session) return [];

    const media = [...session.pendingMedia];
    session.pendingMedia = [];
    session.lastActivity = Date.now();

    return media;
  }

  /**
   * 获取暂存的媒体文件（不清空）
   */
  getPendingMedia(chatId: string): PendingMedia[] {
    const session = this.sessions.get(chatId);
    return session ? [...session.pendingMedia] : [];
  }

  /**
   * 处理消息队列
   */
  private async processQueue(chatId: string): Promise<void> {
    const session = this.sessions.get(chatId);
    if (!session || session.isProcessing) return;

    const message = session.messageQueue.shift();
    if (!message) return;

    session.isProcessing = true;
    session.lastActivity = Date.now();

    this.emit('processingStarted', { session, message });

    try {
      await this.handleMessage(session, message);
    } catch (error) {
      this.emit('processingError', { session, message, error });
    } finally {
      session.isProcessing = false;
      session.lastActivity = Date.now();
      this.emit('processingCompleted', { session, message });

      // 继续处理队列中的下一条消息
      if (session.messageQueue.length > 0) {
        setImmediate(() => this.processQueue(chatId));
      }
    }
  }

  /**
   * 处理单条消息
   */
  private async handleMessage(session: ChatSession, message: QueuedMessage): Promise<void> {
    // 私聊或已绑定的群聊，直接使用 bindPath
    const workPath = session.bindPath!;

    // 准备 ACP 会话
    if (!session.acpSessionId) {
      try {
        const acpResponse = await this.acpClient.newSession(workPath, {
          sessionId: `feishu_${session.chatType}_${session.chatId}_${Date.now()}`,
        });
        session.acpSessionId = acpResponse.sessionId;
      } catch (error) {
        throw new Error(`创建 ACP 会话失败: ${(error as Error).message}`);
      }
    }

    // 收集上下文
    const contextFiles: { path: string; content?: string }[] = [];
    const pendingMedia = this.clearPendingMedia(session.chatId);
    
    for (const media of pendingMedia) {
      if (media.content) {
        if (media.type === 'image') {
          const base64 = media.content.toString('base64');
          contextFiles.push({
            path: media.localPath,
            content: `[图片: ${media.name}]\n![${media.name}](data:image/png;base64,${base64})`,
          });
        } else {
          contextFiles.push({
            path: media.localPath,
            content: media.content.toString('utf-8'),
          });
        }
      }
    }

    // 构建 prompt
    let prompt = '';
    
    if (pendingMedia.length > 0) {
      const mediaDesc = pendingMedia.map(m => 
        m.type === 'image' ? `图片: ${m.name}` : `文件: ${m.name}`
      ).join(', ');
      prompt += `[用户之前发送了 ${mediaDesc}，现在提问如下]\n\n`;
    }

    if (message.content.text) {
      prompt += message.content.text;
    }

    // 打印发送给 Kimi 的消息
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log(`│  📤 发送给 Kimi ACP [${session.chatType === 'private' ? '私聊' : '群聊'}]`);
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│  工作目录: ${workPath.substring(0, 45).padEnd(45)} │`);
    const promptLines = prompt.split('\n').slice(0, 3);
    for (const line of promptLines) {
      console.log(`│  ${line.substring(0, 53).padEnd(53)} │`);
    }
    if (prompt.split('\n').length > 3) {
      console.log(`│  ... (${prompt.split('\n').length - 3} 行省略)`.padEnd(55) + '│');
    }
    console.log('└─────────────────────────────────────────────────────────┘');

    // 发送消息到 ACP
    let responseText = '';

    const response = await this.acpClient.sendMessage(
      session.acpSessionId!,
      prompt,
      { contextFiles }
    );

    if ('message' in response && typeof response.message === 'string') {
      responseText = response.message;
    } else {
      responseText = '✅ 处理完成（无文本回复）';
    }

    // 打印 Kimi 的回复
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│  📥 Kimi ACP 回复                                       │');
    console.log('├─────────────────────────────────────────────────────────┤');
    const responseLines = responseText.split('\n').slice(0, 5);
    for (const line of responseLines) {
      console.log(`│  ${line.substring(0, 53).padEnd(53)} │`);
    }
    if (responseText.split('\n').length > 5) {
      console.log(`│  ... (${responseText.split('\n').length - 5} 行省略)`.padEnd(55) + '│');
    }
    console.log('└─────────────────────────────────────────────────────────┘\n');

    this.emit('replyNeeded', {
      session,
      message: responseText,
    });
  }

  /**
   * 清理过期会话
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [chatId, session] of this.sessions) {
      if (now - session.lastActivity > this.options.sessionTimeout) {
        expiredSessions.push(chatId);
      }
    }

    for (const chatId of expiredSessions) {
      const session = this.sessions.get(chatId);
      if (session) {
        this.sessions.delete(chatId);
        this.emit('sessionExpired', session);
      }
    }

    if (expiredSessions.length > 0) {
      console.log(`[ChatSessionManager] Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * 获取所有会话
   */
  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 删除会话
   */
  deleteSession(chatId: string): boolean {
    const session = this.sessions.get(chatId);
    if (!session) return false;

    this.sessions.delete(chatId);
    this.emit('sessionDeleted', session);
    return true;
  }
}

export default ChatSessionManager;
