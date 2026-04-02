/**
 * 消息类型定义
 * 抽象层，与具体平台无关
 */

// 聊天类型：私聊或群聊
export type ChatType = 'private' | 'group';

// 消息类型
export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'card' | 'markdown' | 'mixed';

// 用户/发送者信息
export interface User {
  id: string;           // 统一用户ID
  platformId: string;   // 平台原始ID
  name?: string;        // 用户名
  avatar?: string;      // 头像
  email?: string;       // 邮箱
  phone?: string;       // 电话
}

// 聊天/频道信息
export interface Chat {
  id: string;           // 统一聊天ID
  platformId: string;   // 平台原始ID
  type: ChatType;       // 聊天类型
  name?: string;        // 聊天名称（群名或对方用户名）
  description?: string; // 描述
  avatar?: string;      // 头像
  members?: User[];     // 成员列表（群聊）
  memberCount?: number; // 成员数量
}

// 消息附件
export interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  name: string;
  url?: string;
  size?: number;
  mimeType?: string;
  content?: Buffer;     // 二进制内容（可选）
}

// 消息引用/回复信息
export interface MessageReference {
  messageId: string;
  content?: string;
  sender?: User;
}

// 抽象消息结构
export interface Message {
  id: string;                   // 消息ID
  chat: Chat;                   // 所属聊天
  sender: User;                 // 发送者
  type: MessageType;            // 消息类型
  content: string;              // 文本内容
  attachments?: Attachment[];   // 附件
  mentions?: User[];            // @的用户
  reference?: MessageReference; // 回复的消息
  timestamp: Date;              // 发送时间
  metadata?: Record<string, any>; // 平台特定元数据
}

// 消息发送选项
export interface SendMessageOptions {
  chatType: ChatType;
  chatId: string;
  content: string;
  type?: MessageType;
  mentions?: string[];          // 要@的用户ID列表
  replyTo?: string;             // 回复的消息ID
  attachments?: Attachment[];   // 附件
  metadata?: Record<string, any>;
}

// 历史消息查询选项
export interface HistoryQueryOptions {
  chatType: ChatType;
  chatId: string;
  limit?: number;
  before?: Date;
  after?: Date;
  messageId?: string;           // 起始消息ID
}

// 组织信息
export interface Organization {
  id: string;
  name: string;
  description?: string;
  tenantKey?: string;
}

// 分页结果
export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor?: string;
}

// 事件类型
export type EventType = 
  | 'message.receive'
  | 'message.update'
  | 'message.delete'
  | 'chat.join'
  | 'chat.leave'
  | 'user.add'
  | 'user.remove';

// 事件回调
export interface EventCallback<T = any> {
  type: EventType;
  data: T;
  timestamp: Date;
  platform: string;
}
