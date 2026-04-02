/**
 * 飞书特定类型定义
 */

// 飞书API响应类型
export interface FeishuUser {
  union_id: string;
  user_id: string;
  open_id: string;
  name: string;
  en_name?: string;
  email?: string;
  mobile?: string;
  avatar?: {
    avatar_origin: string;
  };
}

export interface FeishuGroup {
  chat_id: string;
  name: string;
  description?: string;
  avatar?: string;
  owner_id?: string;
  member_count?: number;
}

export interface FeishuMessageContent {
  text?: string;
  image_key?: string;
  file_key?: string;
}

export interface FeishuMessage {
  message_id: string;
  chat_id: string;
  sender: {
    sender_id: {
      union_id?: string;
      user_id?: string;
      open_id?: string;
    };
    sender_type: string;
    tenant_key: string;
  };
  create_time: string;
  msg_type: string;
  content: string; // JSON字符串
  mentions?: Array<{
    key: string;
    id: {
      union_id?: string;
      user_id?: string;
      open_id?: string;
    };
    name: string;
    tenant_key: string;
  }>;
  parent_id?: string; // 回复的消息ID
  update_time?: string;
  deleted?: boolean;
  updated?: boolean;
}

// 飞书租户信息
export interface FeishuTenant {
  name: string;
  display_name?: string;
  tenant_key: string;
}

// 飞书配置
export interface FeishuConfig {
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  webhookPort?: number;
  webhookPath?: string;
  webhookHost?: string;
}

// ID类型映射
export type FeishuIdType = 'open_id' | 'union_id' | 'user_id' | 'email' | 'chat_id';

// 发送消息参数
export interface FeishuSendMessageParams {
  receive_id: string;
  receive_id_type: FeishuIdType;
  content: string;
  msg_type: string;
  uuid?: string;
}

// 接收消息事件
export interface FeishuMessageEvent {
  sender: {
    sender_id: {
      open_id: string;
      union_id?: string;
      user_id?: string;
    };
    sender_type: 'user' | 'app';
    tenant_key: string;
  };
  message: FeishuMessage;
}
