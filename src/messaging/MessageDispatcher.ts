/**
 * 消息调度器
 * 中间层核心，管理适配器，分发消息
 */

import { IMessagingAdapter } from '../core/interfaces/IMessagingAdapter';
import { EventEmitter } from '../core/events/EventEmitter';
import {
  Message,
  Chat,
  User,
  SendMessageOptions,
  HistoryQueryOptions,
  PaginatedResult,
  EventCallback,
  EventType,
  ChatType,
} from '../core/types';

export interface DispatcherOptions {
  defaultAdapter?: string;
}

export class MessageDispatcher {
  private adapters: Map<string, IMessagingAdapter> = new Map();
  private eventEmitter: EventEmitter = new EventEmitter();
  private defaultAdapter: string | null = null;

  constructor(options: DispatcherOptions = {}) {
    if (options.defaultAdapter) {
      this.defaultAdapter = options.defaultAdapter;
    }
  }

  /**
   * 注册适配器
   */
  registerAdapter(adapter: IMessagingAdapter, setAsDefault: boolean = false): void {
    this.adapters.set(adapter.platform, adapter);
    console.log(`[MessageDispatcher] Registered adapter: ${adapter.platform}`);

    if (setAsDefault || !this.defaultAdapter) {
      this.defaultAdapter = adapter.platform;
      console.log(`[MessageDispatcher] Set default adapter: ${adapter.platform}`);
    }

    // 转发适配器的事件到调度器
    this.setupEventForwarding(adapter);
  }

  /**
   * 获取适配器
   */
  getAdapter(platform?: string): IMessagingAdapter | undefined {
    const key = platform || this.defaultAdapter;
    if (!key) {
      throw new Error('No adapter specified and no default adapter set');
    }
    return this.adapters.get(key);
  }

  /**
   * 获取所有适配器
   */
  getAllAdapters(): IMessagingAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * 获取适配器列表
   */
  getAdapterNames(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 设置默认适配器
   */
  setDefaultAdapter(platform: string): void {
    if (!this.adapters.has(platform)) {
      throw new Error(`Adapter ${platform} not found`);
    }
    this.defaultAdapter = platform;
    console.log(`[MessageDispatcher] Default adapter set to: ${platform}`);
  }

  /**
   * 初始化所有适配器
   */
  async initializeAll(): Promise<void> {
    for (const [platform, adapter] of this.adapters) {
      try {
        console.log(`[MessageDispatcher] Initializing adapter: ${platform}`);
        await adapter.initialize();
      } catch (error) {
        console.error(`[MessageDispatcher] Failed to initialize ${platform}:`, error);
        throw error;
      }
    }
  }

  /**
   * 断开所有适配器
   */
  async disconnectAll(): Promise<void> {
    for (const [platform, adapter] of this.adapters) {
      try {
        console.log(`[MessageDispatcher] Disconnecting adapter: ${platform}`);
        await adapter.disconnect();
      } catch (error) {
        console.error(`[MessageDispatcher] Error disconnecting ${platform}:`, error);
      }
    }
    this.adapters.clear();
    this.defaultAdapter = null;
  }

  // ==================== 统一消息操作 ====================

  /**
   * 发送消息（抽象接口）
   * 
   * 使用示例：
   * - 发送私聊: sendMessage({ chatType: 'private', chatId: 'user_open_id', content: 'Hello' })
   * - 发送群聊: sendMessage({ chatType: 'group', chatId: 'chat_id', content: 'Hello' })
   */
  async sendMessage(options: SendMessageOptions & { platform?: string }): Promise<Message> {
    const adapter = this.getAdapter(options.platform);
    if (!adapter) {
      throw new Error(`No adapter available${options.platform ? ` for platform: ${options.platform}` : ''}`);
    }

    console.log(`[MessageDispatcher] Sending message via ${adapter.platform}`);
    return adapter.sendMessage(options);
  }

  /**
   * 发送私聊消息（快捷方法）
   */
  async sendPrivateMessage(userId: string, content: string, platform?: string): Promise<Message> {
    return this.sendMessage({
      chatType: 'private',
      chatId: userId,
      content,
      platform,
    });
  }

  /**
   * 发送群聊消息（快捷方法）
   */
  async sendGroupMessage(groupId: string, content: string, platform?: string): Promise<Message> {
    return this.sendMessage({
      chatType: 'group',
      chatId: groupId,
      content,
      platform,
    });
  }

  /**
   * 回复消息
   */
  async replyMessage(messageId: string, content: string, type?: string, platform?: string): Promise<Message> {
    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new Error('No adapter available');
    }
    return adapter.replyMessage(messageId, content, type);
  }

  /**
   * 获取历史消息
   */
  async getHistory(options: HistoryQueryOptions & { platform?: string }): Promise<PaginatedResult<Message>> {
    const adapter = this.getAdapter(options.platform);
    if (!adapter) {
      throw new Error('No adapter available');
    }
    return adapter.getHistory(options);
  }

  /**
   * 获取单条消息
   */
  async getMessage(messageId: string, platform?: string): Promise<Message | null> {
    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new Error('No adapter available');
    }
    return adapter.getMessage(messageId);
  }

  /**
   * 撤回消息
   */
  async recallMessage(messageId: string, platform?: string): Promise<boolean> {
    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new Error('No adapter available');
    }
    return adapter.recallMessage(messageId);
  }

  // ==================== 聊天操作 ====================

  /**
   * 获取聊天列表
   */
  async getChats(limit?: number, cursor?: string, platform?: string): Promise<PaginatedResult<Chat>> {
    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new Error('No adapter available');
    }
    return adapter.getChats(limit, cursor);
  }

  /**
   * 获取聊天详情
   */
  async getChat(chatId: string, chatType?: string, platform?: string): Promise<Chat | null> {
    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new Error('No adapter available');
    }
    return adapter.getChat(chatId, chatType);
  }

  /**
   * 获取群成员
   */
  async getChatMembers(chatId: string, limit?: number, cursor?: string, platform?: string): Promise<PaginatedResult<User>> {
    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new Error('No adapter available');
    }
    return adapter.getChatMembers(chatId, limit, cursor);
  }

  // ==================== 用户操作 ====================

  /**
   * 获取用户列表
   */
  async getUsers(limit?: number, cursor?: string, platform?: string): Promise<PaginatedResult<User>> {
    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new Error('No adapter available');
    }
    return adapter.getUsers(limit, cursor);
  }

  /**
   * 获取用户详情
   */
  async getUser(userId: string, platform?: string): Promise<User | null> {
    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new Error('No adapter available');
    }
    return adapter.getUser(userId);
  }

  /**
   * 查找用户
   */
  async findUser(identifier: string, type: 'email' | 'phone' | 'name', platform?: string): Promise<User | null> {
    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new Error('No adapter available');
    }
    return adapter.findUser(identifier, type);
  }

  // ==================== 组织操作 ====================

  /**
   * 获取组织信息
   */
  async getOrganization(platform?: string) {
    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new Error('No adapter available');
    }
    return adapter.getOrganization();
  }

  // ==================== 事件处理 ====================

  /**
   * 注册事件处理器
   */
  onEvent<T>(eventType: EventType, handler: (event: EventCallback<T>) => void): void {
    this.eventEmitter.on(eventType, handler);
  }

  /**
   * 移除事件处理器
   */
  offEvent(eventType: EventType, handler: Function): void {
    this.eventEmitter.off(eventType, handler as any);
  }

  /**
   * 启动所有适配器的事件监听
   */
  async startEventListening(platform?: string): Promise<void> {
    if (platform) {
      const adapter = this.getAdapter(platform);
      if (adapter) {
        await adapter.startEventListening();
      }
    } else {
      for (const adapter of this.adapters.values()) {
        await adapter.startEventListening();
      }
    }
  }

  /**
   * 停止所有适配器的事件监听
   */
  async stopEventListening(platform?: string): Promise<void> {
    if (platform) {
      const adapter = this.getAdapter(platform);
      if (adapter) {
        await adapter.stopEventListening();
      }
    } else {
      for (const adapter of this.adapters.values()) {
        await adapter.stopEventListening();
      }
    }
  }

  /**
   * 设置事件转发
   */
  private setupEventForwarding(adapter: IMessagingAdapter): void {
    const eventTypes: EventType[] = [
      'message.receive',
      'message.update',
      'message.delete',
      'chat.join',
      'chat.leave',
      'user.add',
      'user.remove',
    ];

    for (const eventType of eventTypes) {
      adapter.onEvent(eventType, (event: EventCallback) => {
        this.eventEmitter.emit(eventType, event);
      });
    }
  }
}

// 导出单例
export const dispatcher = new MessageDispatcher();
