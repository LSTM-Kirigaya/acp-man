/**
 * 飞书 ACP Agent 类型定义
 */

import type { SessionNotification } from '@agentclientprotocol/sdk';

/** 会话类型 */
export type ChatType = 'private' | 'group';

/** 消息类型 */
export type MessageContentType = 'text' | 'image' | 'file' | 'post' | 'interactive';

/** 会话信息 */
export interface ChatSession {
  /** 会话 ID（飞书的 chat_id 或 open_id） */
  chatId: string;
  /** 会话类型 */
  chatType: ChatType;
  /** 会话名称 */
  name?: string;
  /** 绑定的 ACP 工作目录 */
  bindPath?: string;
  /** ACP 会话 ID */
  acpSessionId?: string;
  /** 消息队列 */
  messageQueue: QueuedMessage[];
  /** 是否正在处理中 */
  isProcessing: boolean;
  /** 暂存的媒体文件 */
  pendingMedia: PendingMedia[];
  /** 最后活动时间 */
  lastActivity: number;
  /** 最后发送者信息（用于私聊回复） */
  lastSender?: SenderInfo;
  /** 消息历史记录（用于计算内容偏移量） */
  messageHistory?: MessageHistory[];
}

/** 消息历史记录（用于追踪每轮对话的内容偏移） */
export interface MessageHistory {
  /** 消息 ID */
  messageId: string;
  /** 用户输入内容 */
  userInput: string;
  /** AI 完整回复内容（包含可能的累积内容） */
  aiFullResponse: string;
  /** AI 本轮真实回复（通过偏移量截取） */
  aiActualResponse: string;
  /** 内容偏移量（起始位置） */
  contentOffset: number;
  /** 内容长度 */
  contentLength: number;
  /** 时间戳 */
  timestamp: number;
}

/** 队列中的消息 */
export interface QueuedMessage {
  /** 消息 ID */
  id: string;
  /** 发送者信息 */
  sender: SenderInfo;
  /** 消息内容 */
  content: MessageContent;
  /** 入队时间 */
  timestamp: number;
}

/** 发送者信息 */
export interface SenderInfo {
  /** 用户 ID */
  userId: string;
  /** 用户名 */
  name?: string;
  /** 头像 */
  avatar?: string;
}

/** 消息内容 */
export interface MessageContent {
  /** 内容类型 */
  type: MessageContentType;
  /** 文本内容 */
  text?: string;
  /** 文件/图片信息 */
  file?: FileInfo;
}

/** 文件信息 */
export interface FileInfo {
  /** 文件类型 */
  fileType: 'image' | 'file';
  /** 文件名 */
  name: string;
  /** 文件 URL 或 key */
  url?: string;
  /** 文件大小 */
  size?: number;
  /** 本地缓存路径 */
  localPath?: string;
  /** 文件内容（已读取） */
  content?: Buffer;
}

/** 暂存的媒体文件 */
export interface PendingMedia {
  /** 媒体类型 */
  type: 'image' | 'file';
  /** 文件名 */
  name: string;
  /** 本地路径 */
  localPath: string;
  /** 文件内容 */
  content?: Buffer;
  /** 存储时间 */
  storedAt: number;
}

/** ACP Agent 配置 */
export interface FeishuAcpAgentConfig {
  /** 飞书配置 */
  feishu: {
    appId: string;
    appSecret: string;
    encryptKey?: string;
    verificationToken?: string;
  };
  /** Webhook 服务器配置 */
  server: {
    port: number;
    host: string;
    path: string;
  };
  /** ACP 配置 */
  acp?: {
    /** 默认工作目录 */
    defaultCwd?: string;
    /** Kimi CLI 路径 */
    kimiPath?: string;
    /** 是否显示调试日志 */
    debug?: boolean;
  };
}

/** 飞书消息事件 */
export interface FeishuMessageEvent {
  /** 事件类型 */
  eventType: string;
  /** 事件数据 */
  event: {
    /** 消息信息 */
    message: {
      /** 消息 ID */
      message_id: string;
      /** 消息类型 */
      message_type: string;
      /** 聊天信息 */
      chat_id: string;
      chat_type: string;
      /** 发送者 */
      sender: {
        sender_id: {
          open_id: string;
        };
        sender_type: string;
      };
      /** 消息内容 */
      content: string;
      /** 创建时间 */
      create_time: string;
    };
  };
}

/** 飞书卡片回调事件 */
export interface FeishuCardEvent {
  /** 事件类型 */
  eventType: 'interactive';
  /** 事件数据 */
  event: {
    /** 用户点击的按钮或提交的表单 */
    action?: {
      /** 标签 */
      tag: string;
      /** 值 */
      value?: Record<string, unknown>;
      /** 表单值 */
      form_value?: Record<string, string>;
      /** 选项值 */
      option?: string;
    };
    /** 会话信息 */
    open_id?: string;
    open_message_id?: string;
    chat_id?: string;
    user_id?: string;
  };
}

/** ACP 响应处理器 */
export interface AcpResponseHandler {
  /** 处理会话更新 */
  onUpdate: (update: SessionNotification) => void;
  /** 处理完成 */
  onComplete: (response: string) => void;
  /** 处理错误 */
  onError: (error: Error) => void;
}

/** ACP 处理进度（用于显示思考过程和工具调用） */
export interface AcpProcessingProgress {
  /** 思考过程 */
  thought: string;
  /** 工具调用列表 */
  toolCalls: ToolCallInfo[];
  /** 最终回复 */
  message: string;
  /** 是否已完成 */
  isComplete: boolean;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 内部使用：飞书消息ID（用于更新卡片） */
  _feishuMessageId?: string;
  /** 内部使用：飞书接收者ID */
  _feishuReceiveId?: string;
  /** 内部使用：飞书聊天类型 */
  _feishuChatType?: 'private' | 'group';
}

/** 工具调用信息 */
export interface ToolCallInfo {
  /** 工具名称 */
  name: string;
  /** 调用参数 */
  params?: Record<string, unknown>;
  /** 调用结果 */
  result?: string;
  /** 调用时间 */
  timestamp: number;
  /** 是否完成 */
  isComplete: boolean;
}
