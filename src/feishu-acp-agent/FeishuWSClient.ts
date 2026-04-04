/**
 * 飞书 WebSocket 长连接客户端
 * 无需 Webhook，直接通过 WebSocket 接收消息
 */

import * as lark from '@larksuiteoapi/node-sdk';
import { EventEmitter } from 'node:events';
import type { FeishuMessageEvent } from './types.js';

interface WSClientOptions {
  appId: string;
  appSecret: string;
  /** 是否调试模式 */
  debug?: boolean;
}

export class FeishuWSClient extends EventEmitter {
  private options: WSClientOptions;
  private wsClient?: lark.WSClient;
  private eventDispatcher?: lark.EventDispatcher;
  private isRunning = false;

  constructor(options: WSClientOptions) {
    super();
    this.options = options;
  }

  /**
   * 启动 WebSocket 连接
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('WSClient is already running');
    }

    console.log('[FeishuWSClient] Starting WebSocket connection...');
    console.log('[FeishuWSClient] Make sure you have enabled these permissions:');
    console.log('  - im:message (receive messages)');
    console.log('  - im:message:p2p_msg:readonly (private chat)');
    console.log('  - im:message:group_msg (group chat)');
    console.log('[FeishuWSClient] And subscribed to event: im.message.receive_v1');

    // 创建事件分发器
    this.eventDispatcher = new lark.EventDispatcher({});

    // 注册事件处理器
    this.registerHandlers();

    // 创建 WebSocket 客户端
    // 强制开启 DEBUG 模式以查看所有消息
    this.wsClient = new lark.WSClient({
      appId: this.options.appId,
      appSecret: this.options.appSecret,
      loggerLevel: lark.LoggerLevel.DEBUG,  // 强制 DEBUG 模式
    });
    
    console.log('[FeishuWSClient] DEBUG mode enabled - all events will be logged');

    // 启动连接
    await this.wsClient.start({
      eventDispatcher: this.eventDispatcher,
    });
    
    this.isRunning = true;
    console.log('[FeishuWSClient] WebSocket connection started');
    console.log('[FeishuWSClient] Waiting for messages...');
  }

  /**
   * 停止 WebSocket 连接
   */
  async stop(): Promise<void> {
    if (!this.wsClient || !this.isRunning) {
      return;
    }

    console.log('[FeishuWSClient] Stopping WebSocket connection...');
    
    await this.wsClient.stop();
    this.isRunning = false;
    
    console.log('[FeishuWSClient] WebSocket connection stopped');
  }

  /**
   * 注册事件处理器
   */
  private registerHandlers(): void {
    if (!this.eventDispatcher) return;

    console.log('[FeishuWSClient] Registering event handlers...');

    // 处理消息接收事件（私聊和群聊）
    // 注意：飞书可能有不同的事件类型，我们监听所有可能的消息事件
    this.eventDispatcher.register({
      // 标准消息接收事件
      'im.message.receive_v1': async (data: any) => {
        console.log('[FeishuWSClient] 📨 Received im.message.receive_v1 event');
        console.log('[FeishuWSClient] Raw data:', JSON.stringify(data, null, 2).substring(0, 800));
        
        try {
          const event = this.parseMessageEvent(data);
          const chatType = event.event.message.chat_type;
          console.log(`[FeishuWSClient] Message type: ${chatType === 'p2p' ? 'private' : 'group'}`);
          this.emit('message', event);
        } catch (error) {
          console.error('[FeishuWSClient] Error parsing message event:', error);
          console.error('[FeishuWSClient] Raw data:', JSON.stringify(data, null, 2));
        }
      },

      // 私聊消息事件（备选）
      'im.message.p2p_msg': async (data: any) => {
        console.log('[FeishuWSClient] 📨 Received im.message.p2p_msg event');
        console.log('[FeishuWSClient] Raw data:', JSON.stringify(data, null, 2).substring(0, 800));
        this.emit('message', data);
      },

      // 群聊消息事件（备选）
      'im.message.group_msg': async (data: any) => {
        console.log('[FeishuWSClient] 📨 Received im.message.group_msg event');
        console.log('[FeishuWSClient] Raw data:', JSON.stringify(data, null, 2).substring(0, 800));
        
        try {
          const event = this.parseMessageEvent(data);
          const chatType = event.event.message.chat_type;
          console.log(`[FeishuWSClient] Message type: ${chatType === 'p2p' ? 'private' : 'group'}`);
          this.emit('message', event);
        } catch (error) {
          console.error('[FeishuWSClient] Error parsing message event:', error);
          console.error('[FeishuWSClient] Raw data:', JSON.stringify(data, null, 2));
        }
      },

      // 处理表情回复事件（用于调试）
      'im.message.reaction.created_v1': async (data: any) => {
        console.log('[FeishuWSClient] 😊 Reaction created:', JSON.stringify(data).substring(0, 200));
      },

      // 处理机器人被添加进群
      'im.chat.member.bot.added_v1': async (data: any) => {
        console.log('[FeishuWSClient] Bot added to chat');
        this.emit('botAdded', data);
      },

      // 处理机器人被移除群
      'im.chat.member.bot.deleted_v1': async (data: any) => {
        console.log('[FeishuWSClient] Bot removed from chat');
        this.emit('botRemoved', data);
      },

      // 处理消息已读事件（避免警告）
      'im.message.message_read_v1': async (data: any) => {
        // 消息已读事件，无需特殊处理
        if (this.options.debug) {
          console.log('[FeishuWSClient] Message read event:', JSON.stringify(data).substring(0, 200));
        }
      },
    });

    console.log('[FeishuWSClient] ✅ Event handlers registered:');
    console.log('  - im.message.receive_v1 (standard message)');
    console.log('  - im.message.p2p_msg (private message)');
    console.log('  - im.message.group_msg (group message)');
    console.log('  - im.message.reaction.created_v1 (reaction)');
    console.log('  - im.message.message_read_v1 (message read)');
    console.log('  - im.chat.member.bot.added_v1 (bot added)');
    console.log('  - im.chat.member.bot.deleted_v1 (bot removed)');
  }

  /**
   * 解析消息事件
   */
  private parseMessageEvent(data: any): FeishuMessageEvent {
    const event = data;
    const message = event.message;
    const sender = event.sender;

    if (!message || !sender) {
      throw new Error('Invalid message event data: missing message or sender');
    }

    return {
      eventType: 'im.message.receive_v1',
      event: {
        message: {
          message_id: message.message_id,
          message_type: message.message_type,
          chat_id: message.chat_id,
          chat_type: message.chat_type,
          sender: {
            sender_id: {
              open_id: sender.sender_id?.open_id || 'unknown',
            },
            sender_type: sender.sender_type,
          },
          content: message.content,
          create_time: message.create_time,
        },
      },
    };
  }

  /**
   * 获取运行状态
   */
  get isRunningStatus(): boolean {
    return this.isRunning;
  }
}

export default FeishuWSClient;
