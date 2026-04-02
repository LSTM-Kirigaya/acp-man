/**
 * 飞书 Webhook 服务器
 * 接收飞书消息事件和卡片回调
 */

import http from 'node:http';
import type { FeishuAcpAgentConfig, FeishuMessageEvent, FeishuCardEvent } from './types.js';
import { EventEmitter } from 'node:events';
import * as crypto from 'node:crypto';

interface WebhookServerOptions {
  /** 飞书配置 */
  config: FeishuAcpAgentConfig['feishu'];
  /** 服务器配置 */
  server: FeishuAcpAgentConfig['server'];
}

export class FeishuWebhookServer extends EventEmitter {
  private server?: http.Server;
  private options: WebhookServerOptions;
  private isRunning = false;

  constructor(options: WebhookServerOptions) {
    super();
    this.options = options;
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      const { host, port } = this.options.server;

      this.server.listen(port, host, () => {
        this.isRunning = true;
        console.log(`[FeishuWebhookServer] Server started at http://${host}:${port}`);
        console.log(`[FeishuWebhookServer] Webhook path: ${this.options.server.path}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('[FeishuWebhookServer] Server error:', error);
        reject(error);
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    if (!this.server || !this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        console.log('[FeishuWebhookServer] Server stopped');
        resolve();
      });
    });
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { path } = this.options.server;
    const requestPath = req.url?.split('?')[0];

    // 只允许 POST 请求到指定路径
    if (req.method !== 'POST' || requestPath !== path) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      const body = await this.readBody(req);
      const data = JSON.parse(body);

      // 处理 URL 验证（首次配置 webhook 时）
      if (data.type === 'url_verification') {
        this.handleUrlVerification(data, res);
        return;
      }

      // 验证签名
      if (!this.verifySignature(body, req.headers)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid signature' }));
        return;
      }

      // 解密（如果配置了加密密钥）
      let eventData = data;
      if (this.options.config.encryptKey && data.encrypt) {
        eventData = this.decrypt(data.encrypt);
      }

      // 处理事件
      await this.handleEvent(eventData, res);

    } catch (error) {
      console.error('[FeishuWebhookServer] Request handling error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * 读取请求体
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', reject);
    });
  }

  /**
   * 处理 URL 验证
   */
  private handleUrlVerification(data: { challenge: string }, res: http.ServerResponse): void {
    console.log('[FeishuWebhookServer] URL verification received');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ challenge: data.challenge }));
  }

  /**
   * 验证签名
   */
  private verifySignature(body: string, headers: http.IncomingHttpHeaders): boolean {
    const { verificationToken } = this.options.config;
    
    // 如果没有配置验证令牌，跳过验证
    if (!verificationToken) {
      return true;
    }

    const signature = headers['x-lark-signature'] as string;
    if (!signature) {
      return false;
    }

    // 计算签名
    const hmac = crypto.createHmac('sha256', verificationToken);
    hmac.update(body);
    const computedSignature = hmac.digest('base64');

    return signature === computedSignature;
  }

  /**
   * 解密消息
   */
  private decrypt(encrypted: string): any {
    const { encryptKey } = this.options.config;
    if (!encryptKey) {
      throw new Error('Encrypt key not configured');
    }

    // 飞书使用 AES-256-CBC 加密
    const key = crypto.createHash('sha256').update(encryptKey).digest();
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    
    // 前 16 字节是 IV
    const iv = encryptedBuffer.slice(0, 16);
    const data = encryptedBuffer.slice(16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(data);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    // 移除填充
    const paddingLength = decrypted[decrypted.length - 1];
    const result = decrypted.slice(0, decrypted.length - paddingLength);

    return JSON.parse(result.toString('utf-8'));
  }

  /**
   * 处理事件
   */
  private async handleEvent(data: any, res: http.ServerResponse): Promise<void> {
    const eventType = data.header?.event_type || data.type;

    console.log(`[FeishuWebhookServer] Received event: ${eventType}`);

    // 立即返回成功响应
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, msg: 'success' }));

    // 异步处理事件
    switch (eventType) {
      // 消息事件
      case 'im.message.receive_v1':
        this.emit('message', this.parseMessageEvent(data));
        break;

      // 卡片回调事件
      case 'interactive':
      case 'card.action.trigger':
        this.emit('cardAction', this.parseCardEvent(data));
        break;

      // 机器人加入群聊
      case 'im.chat.member.bot.added_v1':
        this.emit('botAdded', data);
        break;

      // 机器人被移除群聊
      case 'im.chat.member.bot.deleted_v1':
        this.emit('botRemoved', data);
        break;

      default:
        console.log(`[FeishuWebhookServer] Unhandled event type: ${eventType}`);
        this.emit('unknownEvent', data);
    }
  }

  /**
   * 解析消息事件
   */
  private parseMessageEvent(data: any): FeishuMessageEvent {
    const event = data.event;
    const message = event.message;
    const sender = event.sender;

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
              open_id: sender.sender_id.open_id,
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
   * 解析卡片事件
   */
  private parseCardEvent(data: any): FeishuCardEvent {
    return {
      eventType: 'interactive',
      event: {
        action: data.action,
        open_id: data.open_id,
        open_message_id: data.open_message_id,
        chat_id: data.chat_id,
        user_id: data.user_id,
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

export default FeishuWebhookServer;
