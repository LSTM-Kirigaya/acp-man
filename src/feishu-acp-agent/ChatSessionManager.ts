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
  FeishuAcpAgentConfig,
  AcpProcessingProgress,
  ToolCallInfo,
  MessageHistory
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
  
  // chatId -> sessionId 的映射，确保同一聊天使用固定的 UUID
  private sessionIdMap: Map<string, string> = new Map();

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
        messageHistory: [], // 初始化消息历史
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
    console.log(`[ChatSessionManager] enqueueMessage: chatId=${chatId.substring(0, 16)}, existing=${this.sessions.has(chatId)}`);
    const session = this.getOrCreateSession(chatId, chatType, name);
    console.log(`[ChatSessionManager] session after getOrCreate: acpSessionId=${session.acpSessionId || 'undefined'}`);

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
    // 打印用户问题（最醒目的格式，确保无论发生什么都能看到）
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  👤 用户问题                                              ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  ${(message.content.text || '(无文本)').substring(0, 52).padEnd(52)} ║`);
    console.log('╚══════════════════════════════════════════════════════════╝');

    try {
      await this._handleMessageInternal(session, message);
    } catch (error) {
      console.error(`[ChatSessionManager] ❌ Error processing message: ${(error as Error).message}`);
      throw error;
    }
  }

  private async _handleMessageInternal(session: ChatSession, message: QueuedMessage): Promise<void> {
    // 私聊或已绑定的群聊，直接使用 bindPath
    const workPath = session.bindPath;

    console.log(`[ChatSessionManager] handleMessage: chatId=${session.chatId.substring(0, 16)}`);
    console.log(`[ChatSessionManager] 使用独立会话模式（每条消息新建会话，无历史累积）`);
    
    // 检查 workPath
    if (!workPath) {
      console.error(`[ChatSessionManager] ERROR: workPath is undefined! bindPath=${session.bindPath}, chatType=${session.chatType}`);
      throw new Error(`工作路径未设置，请检查配置`);
    }

    // === 关键改动1: 每条消息使用独立会话 ===
    // 生成唯一的 sessionId（基于消息ID），确保每条消息都是独立会话
    const messageSessionId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    let acpSessionId: string;
    
    try {
      console.log(`[ChatSessionManager] Creating isolated ACP session for this message:`);
      console.log(`  - sessionId: ${messageSessionId}`);
      console.log(`  - workPath: ${workPath}`);
      
      const acpResponse = await this.acpClient.newSession(workPath, { 
        sessionId: messageSessionId,
        mcpServers: [],  // 必填字段
      });
      acpSessionId = acpResponse.sessionId;
      console.log(`[ChatSessionManager] ✅ Isolated session created: ${acpSessionId}`);
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`[ChatSessionManager] ❌ Failed to create session: ${errorMsg}`);
      throw new Error(`创建 ACP 会话失败: ${errorMsg}`);
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

    // === 关键改动2: 初始化消息历史记录 ===
    if (!session.messageHistory) {
      session.messageHistory = [];
    }

    // 计算内容偏移量（历史内容总长度）
    const contentOffset = session.messageHistory.reduce((sum, h) => sum + h.contentLength, 0);
    console.log(`[ChatSessionManager] Content offset calculation:`);
    console.log(`  - History rounds: ${session.messageHistory.length}`);
    console.log(`  - Total offset: ${contentOffset} chars`);

    // === 关键改动3: 收集思考过程和工具调用 ===
    const progress: AcpProcessingProgress = {
      thought: '',
      toolCalls: [],
      message: '',
      isComplete: false,
      startTime: Date.now(),
    };

    // 发送消息到 ACP（流式）
    try {
      console.log('[ChatSessionManager] Starting sendMessageStream with progress tracking...');
      
      // 发送进度开始事件
      this.emit('progressStarted', { session, message, progress });
      
      const result = await this.acpClient.sendMessageStream(
        acpSessionId,
        prompt,
        {
          onMessageChunk: (chunk: string) => {
            progress.message += chunk;
            // 发送进度更新事件（包含当前思考过程和工具调用）
            this.emit('progressUpdated', { session, message, progress });
          },
          onThoughtChunk: (chunk: string) => {
            progress.thought += chunk;
            console.log(`[ChatSessionManager] 💭 Thought: ${chunk.substring(0, 100)}...`);
            this.emit('progressUpdated', { session, message, progress });
          },
          onToolCall: (toolCall: unknown) => {
            const toolCallInfo = this.parseToolCall(toolCall);
            progress.toolCalls.push(toolCallInfo);
            console.log(`[ChatSessionManager] 🔧 Tool call: ${toolCallInfo.name}`);
            this.emit('progressUpdated', { session, message, progress });
          },
          onComplete: () => {
            progress.isComplete = true;
            progress.endTime = Date.now();
            console.log('[ChatSessionManager] Stream complete');
          },
          onError: (error: Error) => {
            console.error('[ChatSessionManager] Stream error:', error);
          },
        },
        { contextFiles }
      );

      // 优先使用 result.message
      if (result.message && result.message.length > progress.message.length) {
        progress.message = result.message;
      }

      if (!progress.message) {
        progress.message = '✅ 处理完成（无文本回复）';
      }

      progress.isComplete = true;
      progress.endTime = Date.now();

      console.log(`[ChatSessionManager] Stream ended. Collected:`);
      console.log(`  - Thought: ${progress.thought.length} chars`);
      console.log(`  - Tool calls: ${progress.toolCalls.length}`);
      console.log(`  - Raw message: ${progress.message.length} chars`);

    } catch (error) {
      console.error('[ChatSessionManager] Error sending message:', error);
      progress.message = `❌ 处理失败: ${(error as Error).message}`;
      progress.isComplete = true;
      progress.endTime = Date.now();
    }

    // === 关键改动4: 通过偏移量截取本轮真实回复 ===
    let actualResponse = progress.message;
    
    if (contentOffset > 0 && progress.message.length > contentOffset) {
      // 如果总长度大于偏移量，截取新增内容
      actualResponse = progress.message.substring(contentOffset).trim();
      console.log(`[ChatSessionManager] Content sliced by offset:`);
      console.log(`  - Full length: ${progress.message.length}`);
      console.log(`  - Offset: ${contentOffset}`);
      console.log(`  - Actual response: ${actualResponse.length} chars`);
    } else if (session.messageHistory.length > 0) {
      // 尝试通过内容匹配来去重
      const lastResponse = session.messageHistory[session.messageHistory.length - 1]?.aiActualResponse;
      if (lastResponse && progress.message.startsWith(lastResponse)) {
        actualResponse = progress.message.substring(lastResponse.length).trim();
        console.log(`[ChatSessionManager] Content sliced by prefix matching:`);
        console.log(`  - Detected duplicate prefix: ${lastResponse.length} chars`);
        console.log(`  - Actual response: ${actualResponse.length} chars`);
      }
    }

    // 记录到消息历史
    const historyEntry = {
      messageId: message.id,
      userInput: message.content.text || '',
      aiFullResponse: progress.message,
      aiActualResponse: actualResponse,
      contentOffset,
      contentLength: actualResponse.length,
      timestamp: Date.now(),
    };
    session.messageHistory.push(historyEntry);

    // 打印 Kimi 的回复
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│  📥 Kimi ACP 回复                                       │');
    console.log('├─────────────────────────────────────────────────────────┤');
    if (progress.thought) {
      console.log(`│  💭 思考过程: ${progress.thought.substring(0, 40).padEnd(40)} │`);
    }
    if (progress.toolCalls.length > 0) {
      console.log(`│  🔧 工具调用: ${progress.toolCalls.length} 个`.padEnd(56) + '│');
    }
    console.log(`│  📊 历史轮次: ${session.messageHistory.length} 轮`.padEnd(56) + '│');
    console.log(`│  ✂️  截取后长度: ${actualResponse.length}/${progress.message.length} chars`.padEnd(56) + '│');
    const responseLines = actualResponse.split('\n').slice(0, 5);
    for (const line of responseLines) {
      console.log(`│  ${line.substring(0, 53).padEnd(53)} │`);
    }
    if (actualResponse.split('\n').length > 5) {
      console.log(`│  ... (${actualResponse.split('\n').length - 5} 行省略)`.padEnd(55) + '│');
    }
    console.log('└─────────────────────────────────────────────────────────┘\n');

    // === 关键改动5: 发送带进度的回复事件（使用截取后的内容） ===
    this.emit('replyWithProgress', {
      session,
      message: actualResponse, // 使用截取后的真实回复
      progress: {
        ...progress,
        message: actualResponse, // 确保进度中也使用截取后的内容
      },
    });

    // === 关键改动4: 关闭会话（确保每条消息独立）===
    try {
      console.log(`[ChatSessionManager] Closing isolated session: ${acpSessionId}`);
      await this.acpClient.cancelSession(acpSessionId);
      console.log(`[ChatSessionManager] ✅ Session closed`);
    } catch (error) {
      console.warn(`[ChatSessionManager] Warning: Failed to close session: ${(error as Error).message}`);
    }
  }

  /**
   * 解析工具调用信息
   */
  private parseToolCall(toolCall: unknown): ToolCallInfo {
    const tc = toolCall as Record<string, unknown>;
    return {
      name: (tc.toolCall as Record<string, string>)?.title || 
            (tc.toolCall as Record<string, string>)?.name || 
            'Unknown Tool',
      params: tc.params as Record<string, unknown> || tc.arguments as Record<string, unknown>,
      result: tc.result as string,
      timestamp: Date.now(),
      isComplete: !!tc.result,
    };
  }

  /**
   * 清理过期会话
   * 
   * 注意：这里只清理本地引用，不关闭 ACP 会话。
   * ACP 会话由 Agent 端管理，下次需要时可以重新连接或创建新的。
   * 私聊场景下，我们希望保持会话，所以延长超时时间或禁用清理。
   */
  private cleanupExpiredSessions(): void {
    // 私聊会话不应该被自动清理，保持长期连接
    // 如果需要清理，应该同时关闭 ACP 会话
    // 当前实现：只记录，不实际清理
    const now = Date.now();
    const idleSessions: string[] = [];

    for (const [chatId, session] of this.sessions) {
      const idleTime = now - session.lastActivity;
      if (idleTime > this.options.sessionTimeout) {
        idleSessions.push(`${chatId.substring(0, 16)}...(${Math.floor(idleTime / 60000)}min)`);
      }
    }

    if (idleSessions.length > 0) {
      console.log(`[ChatSessionManager] ${idleSessions.length} sessions idle: ${idleSessions.join(', ')}`);
      // 不实际删除，保持会话
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

  /**
   * 重置会话 - 清除 ACP 会话ID，下次会创建新会话
   * 用于解决消息累积问题
   */
  resetSession(chatId: string): boolean {
    const session = this.sessions.get(chatId);
    if (!session) return false;

    const oldSessionId = session.acpSessionId;
    session.acpSessionId = undefined;
    session.messageQueue = [];
    session.pendingMedia = [];
    session.messageHistory = []; // 清除消息历史
    session.lastActivity = Date.now();
    
    // 从 sessionIdMap 中删除，下次会生成新的 sessionId
    this.sessionIdMap.delete(chatId);
    
    console.log(`[ChatSessionManager] Session reset for ${chatId.substring(0, 16)}..., old sessionId: ${oldSessionId || 'none'}`);
    this.emit('sessionReset', { session, oldSessionId });
    return true;
  }

  /**
   * 重置所有会话
   */
  resetAllSessions(): void {
    for (const chatId of this.sessions.keys()) {
      this.resetSession(chatId);
    }
    console.log('[ChatSessionManager] All sessions reset');
  }

  /**
   * 获取稳定的 sessionId（UUID 格式）
   * 同一 chatId 始终返回相同的 UUID
   */
  private getStableSessionId(chatId: string): string {
    let sessionId = this.sessionIdMap.get(chatId);
    if (!sessionId) {
      // 生成 UUID v4 格式
      sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      this.sessionIdMap.set(chatId, sessionId);
      console.log(`[ChatSessionManager] Generated new sessionId for ${chatId.substring(0, 16)}: ${sessionId}`);
    }
    return sessionId;
  }
}

export default ChatSessionManager;
