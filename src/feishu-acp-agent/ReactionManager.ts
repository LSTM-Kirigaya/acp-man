/**
 * 飞书消息表情回复管理器
 * 用于实现"正在输入"的视觉效果
 */

import type { FeishuAcpAgentConfig } from './types.js';

interface ReactionManagerOptions {
  appId: string;
  appSecret: string;
}

/**
 * 飞书支持的 emoji 类型
 * 常用：THUMBSUP(👍), SMILE(😊), LAUGH(😄), HEART(❤️), 
 *       MUSCLE(💪), FINGERHEART(🫰), OK(🆗), JIAYI(🙆)
 */
type EmojiType = 
  | 'THUMBSUP' | 'THUMBSDOWN' | 'SMILE' | 'LAUGH' | 'HEART' 
  | 'MUSCLE' | 'FINGERHEART' | 'OK' | 'JIAYI' | 'FIRE'
  | 'SAD' | 'ANGRY' | 'WOW' | 'CONFUSED' | 'THINKING';

/**
 * 正在输入的表情配置
 */
const TYPING_EMOJI: EmojiType = 'THINKING'; // 🤔 思考中，表示正在处理

export class ReactionManager {
  private options: ReactionManagerOptions;
  private activeReactions: Map<string, string> = new Map(); // message_id -> reaction_id

  constructor(options: ReactionManagerOptions) {
    this.options = options;
  }

  /**
   * 添加"正在输入"的表情回复
   * @param messageId 消息ID
   * @returns reaction_id，用于后续删除
   */
  async addTypingReaction(messageId: string): Promise<string | null> {
    try {
      const token = await this.getTenantAccessToken();
      
      const response = await fetch(
        `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reactions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reaction_type: {
              emoji_type: TYPING_EMOJI,
            },
          }),
        }
      );

      const data = await response.json();

      if (data.code !== 0) {
        console.error('[ReactionManager] Failed to add reaction:', data.msg);
        return null;
      }

      const reactionId = data.data?.reaction_id;
      if (reactionId) {
        this.activeReactions.set(messageId, reactionId);
        console.log(`[ReactionManager] Added typing reaction 🤔 to message ${messageId.substring(0, 16)}...`);
      }

      return reactionId;
    } catch (error) {
      console.error('[ReactionManager] Error adding reaction:', error);
      return null;
    }
  }

  /**
   * 移除"正在输入"的表情回复
   * @param messageId 消息ID
   */
  async removeTypingReaction(messageId: string): Promise<void> {
    const reactionId = this.activeReactions.get(messageId);
    
    if (!reactionId) {
      console.log(`[ReactionManager] No active reaction found for message ${messageId.substring(0, 16)}...`);
      return;
    }

    try {
      const token = await this.getTenantAccessToken();

      const response = await fetch(
        `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reactions/${reactionId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (data.code !== 0) {
        console.error('[ReactionManager] Failed to remove reaction:', data.msg);
        return;
      }

      this.activeReactions.delete(messageId);
      console.log(`[ReactionManager] Removed typing reaction from message ${messageId.substring(0, 16)}...`);
    } catch (error) {
      console.error('[ReactionManager] Error removing reaction:', error);
    }
  }

  /**
   * 设置 typing 状态（另一种"正在输入"提示）
   * @param messageId 消息ID
   * @param typing 是否正在输入
   */
  async setTypingStatus(messageId: string, typing: boolean): Promise<void> {
    // 暂时禁用 typing status，因为 API 可能返回非 JSON 响应
    // 只使用表情回复作为"正在输入"提示
    console.log(`[ReactionManager] Typing status ${typing ? 'set' : 'cleared'} (emoji only)`);
    return;
    
    /* 以下是原代码，暂时注释掉
    try {
      const token = await this.getTenantAccessToken();

      const response = await fetch(
        `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/typing`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            typing_status: typing ? 1 : 0,
          }),
        }
      );

      // 检查响应状态
      if (!response.ok) {
        const text = await response.text();
        console.error('[ReactionManager] Failed to set typing status:', text);
        return;
      }

      // 尝试解析 JSON，但可能返回空响应
      const text = await response.text();
      if (!text) {
        console.log(`[ReactionManager] ${typing ? 'Set' : 'Cleared'} typing status (empty response)`);
        return;
      }

      const data = JSON.parse(text);
      if (data.code !== 0) {
        console.error('[ReactionManager] Failed to set typing status:', data.msg);
        return;
      }

      console.log(`[ReactionManager] ${typing ? 'Set' : 'Cleared'} typing status for message ${messageId.substring(0, 16)}...`);
    } catch (error) {
      console.error('[ReactionManager] Error setting typing status:', error);
    }
    */
  }

  /**
   * 清理所有活跃的表情回复
   */
  async clearAllReactions(): Promise<void> {
    const entries = Array.from(this.activeReactions.entries());
    console.log(`[ReactionManager] Clearing ${entries.length} active reactions...`);
    
    for (const [messageId] of entries) {
      await this.removeTypingReaction(messageId);
    }
  }

  /**
   * 获取租户访问令牌
   */
  private async getTenantAccessToken(): Promise<string> {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: this.options.appId,
        app_secret: this.options.appSecret,
      }),
    });

    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`Failed to get token: ${data.msg}`);
    }

    return data.tenant_access_token;
  }

  /**
   * 获取活跃反应数量
   */
  getActiveReactionCount(): number {
    return this.activeReactions.size;
  }
}

export default ReactionManager;
