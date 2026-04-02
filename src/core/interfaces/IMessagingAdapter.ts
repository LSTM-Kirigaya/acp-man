/**
 * 消息适配器接口
 * 所有平台适配器都需要实现此接口
 */

import {
  Message,
  Chat,
  User,
  Organization,
  SendMessageOptions,
  HistoryQueryOptions,
  PaginatedResult,
  EventCallback,
  EventType
} from '../types';

export interface IMessagingAdapter {
  /** 平台标识 */
  readonly platform: string;

  /** 适配器是否已连接 */
  readonly isConnected: boolean;

  /**
   * 初始化适配器
   */
  initialize(): Promise<void>;

  /**
   * 测试连接
   */
  testConnection(): Promise<boolean>;

  /**
   * 关闭连接
   */
  disconnect(): Promise<void>;

  // ==================== 消息操作 ====================

  /**
   * 发送消息
   */
  sendMessage(options: SendMessageOptions): Promise<Message>;

  /**
   * 回复消息
   */
  replyMessage(messageId: string, content: string, type?: string): Promise<Message>;

  /**
   * 获取历史消息
   */
  getHistory(options: HistoryQueryOptions): Promise<PaginatedResult<Message>>;

  /**
   * 获取单条消息
   */
  getMessage(messageId: string): Promise<Message | null>;

  /**
   * 撤回消息
   */
  recallMessage(messageId: string): Promise<boolean>;

  // ==================== 聊天/频道操作 ====================

  /**
   * 获取聊天列表
   */
  getChats(limit?: number, cursor?: string): Promise<PaginatedResult<Chat>>;

  /**
   * 获取聊天详情
   */
  getChat(chatId: string, chatType?: string): Promise<Chat | null>;

  /**
   * 获取群成员列表
   */
  getChatMembers(chatId: string, limit?: number, cursor?: string): Promise<PaginatedResult<User>>;

  // ==================== 用户操作 ====================

  /**
   * 获取用户列表
   */
  getUsers(limit?: number, cursor?: string): Promise<PaginatedResult<User>>;

  /**
   * 获取用户详情
   */
  getUser(userId: string): Promise<User | null>;

  /**
   * 通过邮箱/手机号查找用户
   */
  findUser(identifier: string, type: 'email' | 'phone' | 'name'): Promise<User | null>;

  // ==================== 组织操作 ====================

  /**
   * 获取组织信息
   */
  getOrganization(): Promise<Organization | null>;

  // ==================== 事件处理 ====================

  /**
   * 注册事件处理器
   */
  onEvent<T>(eventType: EventType, handler: (event: EventCallback<T>) => void): void;

  /**
   * 移除事件处理器
   */
  offEvent(eventType: EventType, handler: Function): void;

  /**
   * 启动事件监听（Webhook 或长连接）
   */
  startEventListening(): Promise<void>;

  /**
   * 停止事件监听
   */
  stopEventListening(): Promise<void>;
}
