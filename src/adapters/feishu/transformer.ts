/**
 * 飞书消息转换器
 * 负责在飞书格式和抽象消息格式之间转换
 */

import * as lark from '@larksuiteoapi/node-sdk';
import {
  Message,
  Chat,
  User,
  Organization,
  ChatType,
  MessageType,
  SendMessageOptions,
  Attachment,
  MessageReference
} from '../../core/types';
import {
  FeishuMessage,
  FeishuUser,
  FeishuGroup,
  FeishuTenant,
  FeishuSendMessageParams
} from './types';

export class FeishuTransformer {
  /**
   * 将飞书用户转换为统一用户
   */
  static toUser(feishuUser: FeishuUser): User {
    return {
      id: feishuUser.open_id || feishuUser.union_id || feishuUser.user_id,
      platformId: feishuUser.open_id || feishuUser.union_id || feishuUser.user_id,
      name: feishuUser.name,
      email: feishuUser.email,
      phone: feishuUser.mobile,
      avatar: feishuUser.avatar?.avatar_origin,
    };
  }

  /**
   * 从飞书发送者信息转换为统一用户
   */
  static senderToUser(sender: FeishuMessage['sender']): User {
    return {
      id: sender.sender_id.open_id || sender.sender_id.union_id || sender.sender_id.user_id || 'unknown',
      platformId: sender.sender_id.open_id || sender.sender_id.union_id || sender.sender_id.user_id || 'unknown',
      name: 'Unknown', // 需要通过API获取详细信息
    };
  }

  /**
   * 将飞书群组转换为统一聊天
   */
  static toChat(group: FeishuGroup): Chat {
    return {
      id: group.chat_id,
      platformId: group.chat_id,
      type: 'group',
      name: group.name,
      description: group.description,
      avatar: group.avatar,
      memberCount: group.member_count,
    };
  }

  /**
   * 创建私聊聊天对象
   */
  static createPrivateChat(userId: string, userName?: string): Chat {
    return {
      id: userId,
      platformId: userId,
      type: 'private',
      name: userName || 'Private Chat',
    };
  }

  /**
   * 将飞书消息转换为统一消息
   */
  static toMessage(feishuMsg: FeishuMessage): Message {
    const chat: Chat = {
      id: feishuMsg.chat_id,
      platformId: feishuMsg.chat_id,
      type: 'group', // 默认群聊，需要通过其他方式判断私聊
      name: 'Unknown Chat',
    };

    const sender = this.senderToUser(feishuMsg.sender);
    const { content, type } = this.parseContent(feishuMsg.msg_type, feishuMsg.content);

    const message: Message = {
      id: feishuMsg.message_id,
      chat,
      sender,
      type,
      content,
      timestamp: new Date(parseInt(feishuMsg.create_time)),
      metadata: {
        feishuMsgType: feishuMsg.msg_type,
        rawContent: feishuMsg.content,
        tenantKey: feishuMsg.sender.tenant_key,
      },
    };

    // 处理@提及
    if (feishuMsg.mentions && feishuMsg.mentions.length > 0) {
      message.mentions = feishuMsg.mentions.map(m => ({
        id: m.id.open_id || m.id.union_id || m.id.user_id || m.key,
        platformId: m.id.open_id || m.id.union_id || m.id.user_id || m.key,
        name: m.name,
      }));
    }

    // 处理回复
    if (feishuMsg.parent_id) {
      message.reference = {
        messageId: feishuMsg.parent_id,
      };
    }

    return message;
  }

  /**
   * 解析飞书消息内容
   */
  private static parseContent(msgType: string, rawContent: string): { content: string; type: MessageType } {
    try {
      const parsed = JSON.parse(rawContent);
      
      switch (msgType) {
        case 'text':
          return { content: parsed.text || '', type: 'text' };
        case 'image':
          return { content: '[图片]', type: 'image' };
        case 'file':
          return { content: `[文件] ${parsed.file_name || ''}`, type: 'file' };
        case 'audio':
          return { content: '[语音]', type: 'audio' };
        case 'media':
          return { content: '[视频]', type: 'video' };
        case 'interactive':
          return { content: '[卡片消息]', type: 'card' };
        case 'post':
          // 富文本需要进一步解析
          return { content: this.parsePostContent(parsed), type: 'markdown' };
        case 'sticker':
          return { content: '[表情]', type: 'text' };
        default:
          return { content: `[未知消息类型: ${msgType}]`, type: 'text' };
      }
    } catch (error) {
      return { content: rawContent, type: 'text' };
    }
  }

  /**
   * 解析富文本内容
   */
  private static parsePostContent(post: any): string {
    if (!post || !post.content) return '[富文本]';
    
    // 简化处理，提取文本内容
    const content = post.content;
    let text = '';
    
    for (const [lang, elements] of Object.entries(content)) {
      if (Array.isArray(elements)) {
        for (const element of elements) {
          if (typeof element === 'string') {
            text += element;
          } else if (element.tag === 'text') {
            text += element.text || '';
          } else if (element.tag === 'a') {
            text += element.text || element.href || '';
          }
        }
      }
    }
    
    return text || '[富文本]';
  }

  /**
   * 将组织信息转换为统一格式
   */
  static toOrganization(tenant: FeishuTenant): Organization {
    return {
      id: tenant.tenant_key,
      name: tenant.display_name || tenant.name,
      tenantKey: tenant.tenant_key,
    };
  }

  /**
   * 构建飞书发送消息参数
   */
  static buildSendMessageParams(options: SendMessageOptions): FeishuSendMessageParams {
    const receiveIdType = options.chatType === 'private' ? 'open_id' : 'chat_id';
    
    let msgType: string;
    let content: string;

    switch (options.type) {
      case 'image':
        msgType = 'image';
        content = JSON.stringify({ image_key: options.content });
        break;
      case 'file':
        msgType = 'file';
        content = JSON.stringify({ file_key: options.content });
        break;
      case 'card':
        msgType = 'interactive';
        content = options.content; // 假设已经是JSON字符串
        break;
      case 'markdown':
        msgType = 'post';
        content = this.buildPostContent(options.content);
        break;
      case 'text':
      default:
        msgType = 'text';
        content = JSON.stringify({ text: options.content });
        break;
    }

    return {
      receive_id: options.chatId,
      receive_id_type: receiveIdType,
      content,
      msg_type: msgType,
    };
  }

  /**
   * 构建富文本内容
   */
  private static buildPostContent(text: string): string {
    const post = {
      zh_cn: {
        title: '',
        content: [
          [{ tag: 'text', text }]
        ]
      }
    };
    return JSON.stringify(post);
  }

  /**
   * 将统一消息类型转换为飞书消息类型
   */
  static convertMessageType(type: MessageType): string {
    const typeMap: Record<MessageType, string> = {
      'text': 'text',
      'image': 'image',
      'file': 'file',
      'audio': 'audio',
      'video': 'media',
      'card': 'interactive',
      'markdown': 'post',
      'mixed': 'post',
    };
    return typeMap[type] || 'text';
  }
}
