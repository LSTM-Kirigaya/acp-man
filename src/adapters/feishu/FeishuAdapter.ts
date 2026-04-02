/**
 * 飞书适配器
 * 实现 IMessagingAdapter 接口，连接飞书平台
 */

import * as lark from '@larksuiteoapi/node-sdk';
import { IMessagingAdapter } from '../../core/interfaces/IMessagingAdapter';
import { EventEmitter } from '../../core/events/EventEmitter';
import {
  Message,
  Chat,
  User,
  Organization,
  SendMessageOptions,
  HistoryQueryOptions,
  PaginatedResult,
  EventCallback,
  EventType,
} from '../../core/types';
import { FeishuConfig, FeishuMessageEvent } from './types';
import { FeishuTransformer } from './transformer';

export class FeishuAdapter implements IMessagingAdapter {
  readonly platform = 'feishu';
  private _isConnected = false;
  
  private client: lark.Client;
  private eventDispatcher?: lark.EventDispatcher;
  private config: FeishuConfig;
  private eventEmitter: EventEmitter;

  // 用户信息缓存
  private userCache: Map<string, User> = new Map();

  constructor(config: FeishuConfig) {
    this.config = config;
    this.eventEmitter = new EventEmitter();
    
    // 初始化飞书客户端
    this.client = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * 初始化适配器
   */
  async initialize(): Promise<void> {
    console.log('[FeishuAdapter] Initializing...');
    
    // 测试连接
    const connected = await this.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Feishu API');
    }
    
    this._isConnected = true;
    console.log('[FeishuAdapter] Initialized successfully');
  }

  /**
   * 测试连接并获取访问令牌
   */
  async testConnection(): Promise<boolean> {
    try {
      // 调用获取租户访问令牌接口来测试连接
      const result = await this.client.auth.tenantAccessToken.internal({
        data: {
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        },
      });

      if (result.code !== 0) {
        console.error('[FeishuAdapter] Connection test failed:', result.msg);
        return false;
      }

      console.log('[FeishuAdapter] Connection test successful');
      return true;
    } catch (error) {
      console.error('[FeishuAdapter] Connection test error:', error);
      return false;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this._isConnected = false;
    await this.stopEventListening();
    console.log('[FeishuAdapter] Disconnected');
  }

  // ==================== 消息操作 ====================

  /**
   * 发送消息
   */
  async sendMessage(options: SendMessageOptions): Promise<Message> {
    this.checkConnected();

    const params = FeishuTransformer.buildSendMessageParams(options);
    
    console.log(`[FeishuAdapter] Sending message to ${options.chatType} ${options.chatId}`);
    
    try {
      const result = await this.client.im.message.create({
        params: {
          receive_id_type: params.receive_id_type,
        },
        data: {
          receive_id: params.receive_id,
          content: params.content,
          msg_type: params.msg_type,
          uuid: params.uuid,
        },
      });

      if (result.code !== 0) {
        throw new Error(`Failed to send message: ${result.msg}`);
      }

      console.log('[FeishuAdapter] Message sent successfully:', result.data?.message_id);

      // 构建返回的消息对象
      const message: Message = {
        id: result.data?.message_id || `msg_${Date.now()}`,
        chat: {
          id: options.chatId,
          platformId: options.chatId,
          type: options.chatType,
          name: options.chatType === 'private' ? 'Private Chat' : 'Group Chat',
        },
        sender: {
          id: 'bot',
          platformId: 'bot',
          name: 'Bot',
        },
        type: options.type || 'text',
        content: options.content,
        timestamp: new Date(),
        metadata: {
          rawResponse: result.data,
        },
      };

      return message;
    } catch (error) {
      console.error('[FeishuAdapter] Failed to send message:', error);
      throw error;
    }
  }

  /**
   * 回复消息
   */
  async replyMessage(messageId: string, content: string, type?: string): Promise<Message> {
    this.checkConnected();

    console.log(`[FeishuAdapter] Replying to message ${messageId}`);

    try {
      const msgType = type || 'text';
      const contentObj = msgType === 'text' ? { text: content } : content;

      const result = await this.client.im.message.reply({
        path: {
          message_id: messageId,
        },
        data: {
          content: typeof contentObj === 'string' ? contentObj : JSON.stringify(contentObj),
          msg_type: msgType,
        },
      });

      if (result.code !== 0) {
        throw new Error(`Failed to reply message: ${result.msg}`);
      }

      const message: Message = {
        id: result.data?.message_id || `reply_${Date.now()}`,
        chat: {
          id: 'unknown',
          platformId: 'unknown',
          type: 'group',
          name: 'Unknown',
        },
        sender: {
          id: 'bot',
          platformId: 'bot',
          name: 'Bot',
        },
        type: (type as any) || 'text',
        content,
        timestamp: new Date(),
        metadata: {
          replyTo: messageId,
        },
      };

      return message;
    } catch (error) {
      console.error('[FeishuAdapter] Failed to reply message:', error);
      throw error;
    }
  }

  /**
   * 获取历史消息
   */
  async getHistory(options: HistoryQueryOptions): Promise<PaginatedResult<Message>> {
    this.checkConnected();

    console.log(`[FeishuAdapter] Getting history for ${options.chatType} ${options.chatId}`);

    // 飞书获取历史消息需要通过事件推送或特定接口
    // 这里返回空列表
    console.log('[FeishuAdapter] History API not fully implemented, returning empty list');
    
    return {
      items: [],
      hasMore: false,
    };
  }

  /**
   * 获取单条消息
   */
  async getMessage(messageId: string): Promise<Message | null> {
    this.checkConnected();

    try {
      // 飞书没有直接获取单条消息的接口
      console.log(`[FeishuAdapter] Getting message ${messageId} - not implemented`);
      return null;
    } catch (error) {
      console.error('[FeishuAdapter] Failed to get message:', error);
      return null;
    }
  }

  /**
   * 撤回消息
   */
  async recallMessage(messageId: string): Promise<boolean> {
    this.checkConnected();

    try {
      // 飞书撤回消息使用 delete 接口
      const result = await this.client.im.message.delete({
        path: {
          message_id: messageId,
        },
      });

      return result.code === 0;
    } catch (error) {
      console.error('[FeishuAdapter] Failed to recall message:', error);
      return false;
    }
  }

  // ==================== 聊天/频道操作 ====================

  /**
   * 获取聊天列表（群聊列表）
   */
  async getChats(limit: number = 100, cursor?: string): Promise<PaginatedResult<Chat>> {
    this.checkConnected();

    console.log('[FeishuAdapter] Getting chat list...');

    try {
      // 获取机器人所在的群列表
      const result = await this.client.im.chat.list({
        params: {
          user_id_type: 'open_id',
          page_size: limit,
        },
      });

      if (result.code !== 0) {
        throw new Error(`Failed to get chat list: ${result.msg}`);
      }

      const items = (result.data?.items || []).map(chat => FeishuTransformer.toChat({
        chat_id: chat.chat_id || '',
        name: chat.name || '',
        description: chat.description,
        avatar: chat.avatar,
        member_count: 0, // 列表接口不返回成员数
      }));

      return {
        items,
        hasMore: !!result.data?.has_more,
        nextCursor: result.data?.page_token,
      };
    } catch (error) {
      console.error('[FeishuAdapter] Failed to get chat list:', error);
      throw error;
    }
  }

  /**
   * 获取聊天详情
   */
  async getChat(chatId: string, chatType?: string): Promise<Chat | null> {
    this.checkConnected();

    try {
      const result = await this.client.im.chat.get({
        path: {
          chat_id: chatId,
        },
      });

      if (result.code !== 0) {
        console.error('[FeishuAdapter] Failed to get chat:', result.msg);
        return null;
      }

      const chatData = result.data;
      return FeishuTransformer.toChat({
        chat_id: chatId,
        name: chatData?.name || '',
        description: chatData?.description,
        avatar: chatData?.avatar,
        member_count: 0, // 详情接口可能需要单独获取成员数
      });
    } catch (error) {
      console.error('[FeishuAdapter] Failed to get chat:', error);
      return null;
    }
  }

  /**
   * 获取群成员列表
   */
  async getChatMembers(chatId: string, limit: number = 100, cursor?: string): Promise<PaginatedResult<User>> {
    this.checkConnected();

    try {
      const result = await this.client.im.chatMembers.get({
        path: {
          chat_id: chatId,
        },
        params: {
          member_id_type: 'open_id',
          page_size: limit,
        },
      });

      if (result.code !== 0) {
        throw new Error(`Failed to get chat members: ${result.msg}`);
      }

      const items = (result.data?.items || []).map((member: any) => ({
        id: member.member_id || '',
        platformId: member.member_id || '',
        name: member.name || '',
      }));

      return {
        items,
        hasMore: !!result.data?.has_more,
        nextCursor: result.data?.page_token,
      };
    } catch (error) {
      console.error('[FeishuAdapter] Failed to get chat members:', error);
      throw error;
    }
  }

  // ==================== 用户操作 ====================

  /**
   * 获取用户列表
   */
  async getUsers(limit: number = 100, cursor?: string): Promise<PaginatedResult<User>> {
    this.checkConnected();

    try {
      const result = await this.client.contact.user.list({
        params: {
          user_id_type: 'open_id',
          page_size: limit,
          department_id_type: 'open_department_id',
          department_id: '0', // 根部门
        },
      });

      if (result.code !== 0) {
        throw new Error(`Failed to get user list: ${result.msg}`);
      }

      const items = (result.data?.items || []).map((user: any) => FeishuTransformer.toUser({
        union_id: user.union_id || '',
        user_id: user.user_id || '',
        open_id: user.open_id || '',
        name: user.name || '',
        en_name: user.en_name,
        email: user.email,
        mobile: user.mobile,
        avatar: user.avatar ? { avatar_origin: user.avatar.avatar_origin || '' } : undefined,
      }));

      return {
        items,
        hasMore: !!result.data?.has_more,
        nextCursor: result.data?.page_token,
      };
    } catch (error) {
      console.error('[FeishuAdapter] Failed to get user list:', error);
      throw error;
    }
  }

  /**
   * 获取用户详情
   */
  async getUser(userId: string): Promise<User | null> {
    this.checkConnected();

    // 检查缓存
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId)!;
    }

    try {
      const result = await this.client.contact.user.get({
        path: {
          user_id: userId,
        },
        params: {
          user_id_type: 'open_id',
        },
      });

      if (result.code !== 0) {
        console.error('[FeishuAdapter] Failed to get user:', result.msg);
        return null;
      }

      const userData = result.data?.user;
      const user = FeishuTransformer.toUser({
        union_id: userData?.union_id || '',
        user_id: userData?.user_id || '',
        open_id: userData?.open_id || '',
        name: userData?.name || '',
        en_name: userData?.en_name,
        email: userData?.email,
        mobile: userData?.mobile,
        avatar: userData?.avatar ? { avatar_origin: userData.avatar.avatar_origin || '' } : undefined,
      });

      // 缓存用户
      this.userCache.set(userId, user);

      return user;
    } catch (error) {
      console.error('[FeishuAdapter] Failed to get user:', error);
      return null;
    }
  }

  /**
   * 通过邮箱/手机号查找用户
   */
  async findUser(identifier: string, type: 'email' | 'phone' | 'name'): Promise<User | null> {
    this.checkConnected();

    try {
      // 飞书没有直接查找用户的接口，需要获取列表后筛选
      const users = await this.getUsers(500);
      
      const found = users.items.find(user => {
        if (type === 'email' && user.email === identifier) return true;
        if (type === 'phone' && user.phone === identifier) return true;
        if (type === 'name' && user.name === identifier) return true;
        return false;
      });

      return found || null;
    } catch (error) {
      console.error('[FeishuAdapter] Failed to find user:', error);
      return null;
    }
  }

  // ==================== 组织操作 ====================

  /**
   * 获取组织信息
   */
  async getOrganization(): Promise<Organization | null> {
    this.checkConnected();

    try {
      // 通过获取当前租户信息
      // 飞书 API 返回结构可能不同，使用 any 类型处理
      const result = await ((this.client.contact as any).tenant.get)();

      if (result.code !== 0) {
        console.error('[FeishuAdapter] Failed to get organization:', result.msg);
        return null;
      }

      // 结果格式可能不同，根据实际返回调整
      const tenantData = result.data as any;
      return {
        id: tenantData?.tenant?.tenant_key || 'unknown',
        name: tenantData?.tenant?.name || tenantData?.tenant?.display_name || 'Unknown',
        tenantKey: tenantData?.tenant?.tenant_key,
      };
    } catch (error) {
      console.error('[FeishuAdapter] Failed to get organization:', error);
      return null;
    }
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
   * 启动事件监听（Webhook 模式）
   */
  async startEventListening(): Promise<void> {
    console.log('[FeishuAdapter] Starting event listening...');

    // 创建事件分发器
    this.eventDispatcher = new lark.EventDispatcher({
      encryptKey: this.config.encryptKey,
      verificationToken: this.config.verificationToken,
    });

    // 注册消息接收事件
    this.eventDispatcher.register({
      'im.message.receive_v1': async (data: any) => {
        console.log('[FeishuAdapter] Received message event');
        
        const msgData = data as FeishuMessageEvent;
        const message = FeishuTransformer.toMessage(msgData.message);
        
        // 获取发送者详情
        const senderId = msgData.message.sender.sender_id.open_id;
        if (senderId) {
          const senderInfo = await this.getUser(senderId);
          if (senderInfo) {
            message.sender = senderInfo;
          }
        }

        // 获取聊天详情
        const chatInfo = await this.getChat(msgData.message.chat_id);
        if (chatInfo) {
          message.chat = chatInfo;
        }

        this.eventEmitter.emit('message.receive', {
          type: 'message.receive',
          data: message,
          timestamp: new Date(),
          platform: this.platform,
        } as EventCallback<Message>);
      },
    });

    console.log('[FeishuAdapter] Event listening started (use getEventDispatcher() for webhook setup)');
  }

  /**
   * 停止事件监听
   */
  async stopEventListening(): Promise<void> {
    this.eventDispatcher = undefined;
    console.log('[FeishuAdapter] Event listening stopped');
  }

  /**
   * 获取事件分发器（用于 webhook 设置）
   */
  getEventDispatcher(): lark.EventDispatcher | undefined {
    return this.eventDispatcher;
  }

  // ==================== 私有方法 ====================

  private checkConnected(): void {
    if (!this._isConnected) {
      throw new Error('FeishuAdapter is not connected');
    }
  }
}
