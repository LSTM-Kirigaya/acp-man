/**
 * Kimi ACP 客户端
 * 
 * 用于连接 Kimi CLI 的 ACP 服务端 (kimi acp)
 * ACP (Agent Client Protocol) 是一种标准化协议，用于 IDE 和 AI Agent 之间的通信
 */

import { spawn, ChildProcess } from 'node:child_process';
import { Writable, Readable } from 'node:stream';
import { 
  ClientSideConnection, 
  ndJsonStream,
  PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk';
import type { 
  Client, 
  Stream,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  WriteTextFileRequest,
  WriteTextFileResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
} from '@agentclientprotocol/sdk';

/**
 * Kimi ACP 客户端配置
 */
export interface KimiAcpClientConfig {
  /** Kimi CLI 路径，默认使用系统 PATH 中的 kimi */
  kimiPath?: string;
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 是否显示调试日志 */
  debug?: boolean;
}

/**
 * Kimi ACP 客户端
 * 
 * 实现 ACP 协议的 Client 接口，连接到 Kimi CLI 的 ACP 服务端
 */
/**
 * ACP 流式消息回调
 */
export interface AcpStreamCallbacks {
  /** 收到消息片段时的回调 */
  onMessageChunk?: (chunk: string) => void;
  /** 收到思考片段时的回调 */
  onThoughtChunk?: (chunk: string) => void;
  /** 收到工具调用时的回调 */
  onToolCall?: (toolCall: unknown) => void;
  /** 流结束时调用 */
  onComplete?: () => void;
  /** 出错时调用 */
  onError?: (error: Error) => void;
}

export class KimiAcpClient implements Client {
  private config: KimiAcpClientConfig;
  private kimiProcess?: ChildProcess;
  private connection?: ClientSideConnection;
  private stream?: Stream;
  private debug: boolean;

  // 事件处理器
  public onSessionUpdate?: (update: SessionNotification) => void;
  public onPermissionRequest?: (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
  
  // 流式消息收集器（用于 sendMessageStream）
  private streamCollector?: {
    onMessageChunk: (chunk: string) => void;
    onThoughtChunk: (chunk: string) => void;
    onToolCall: (toolCall: unknown) => void;
  };
  
  // 按 sessionId 收集内容，用于控制台输出
  private sessionContentBuffer: Map<string, {
    message: string;
    thought: string;
    toolCalls: unknown[];
    lastUpdate: number;
  }> = new Map();

  constructor(config: KimiAcpClientConfig = {}) {
    this.config = config;
    this.debug = config.debug ?? false;
  }

  /**
   * 连接到 Kimi ACP 服务端
   */
  async connect(): Promise<void> {
    if (this.connection) {
      throw new Error('Already connected to Kimi ACP');
    }

    const kimiPath = this.config.kimiPath || 'kimi';
    const args = ['acp'];

    this.log('Starting Kimi ACP server:', kimiPath, args.join(' '));

    // 启动 Kimi ACP 进程
    this.kimiProcess = spawn(kimiPath, args, {
      cwd: this.config.cwd,
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 处理 stderr 输出（日志）
    this.kimiProcess.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        this.log('[Kimi STDERR]', message);
      }
    });

    // 处理进程错误
    this.kimiProcess.on('error', (error) => {
      console.error('Kimi process error:', error);
    });

    // 处理进程退出
    this.kimiProcess.on('exit', (code) => {
      this.log('Kimi process exited with code:', code);
    });

    if (!this.kimiProcess.stdin || !this.kimiProcess.stdout) {
      throw new Error('Failed to create stdio streams');
    }

    // 将 Node.js 流转换为 Web Streams
    const input = Writable.toWeb(this.kimiProcess.stdin);
    const output = Readable.toWeb(this.kimiProcess.stdout);

    // 创建 NDJSON 流
    this.stream = ndJsonStream(
      input as WritableStream<Uint8Array>,
      output as ReadableStream<Uint8Array>
    );

    // 创建 ClientSideConnection
    this.connection = new ClientSideConnection(
      () => this,
      this.stream
    );

    this.log('Connection established, initializing...');

    // 等待连接就绪
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000);

      this.connection!.signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Connection closed'));
      });

      // 初始化协议
      this.initialize().then(() => {
        clearTimeout(timeout);
        resolve();
      }).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    this.log('Connected to Kimi ACP successfully!');
  }

  /**
   * 初始化 ACP 协议
   */
  private async initialize(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    const initRequest: InitializeRequest = {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        // 客户端能力
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
        terminal: {
          create: true,
        },
      },
    };

    this.log('Sending initialize request:', JSON.stringify(initRequest, null, 2));

    const response: InitializeResponse = await this.connection.initialize(initRequest);

    this.log('Initialize response:', JSON.stringify(response, null, 2));

    if ('error' in response && response.error) {
      throw new Error(`Initialize failed: ${response.error.message}`);
    }

    // 检查协议版本兼容性
    if (response.protocolVersion !== PROTOCOL_VERSION) {
      console.warn(`Protocol version mismatch: expected ${PROTOCOL_VERSION}, got ${response.protocolVersion}`);
    }
  }

  /**
   * 创建新会话
   */
  async newSession(cwd: string, options: {
    sessionId?: string;
    additionalDirectories?: string[];
    mcpServers?: { name: string; command: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string>; sse?: boolean }[];
  } = {}): Promise<NewSessionResponse> {
    if (!this.connection) {
      throw new Error('Not connected to Kimi ACP');
    }

    // 构建请求（mcpServers 是必填字段）
    const request: NewSessionRequest = {
      cwd,
      mcpServers: options.mcpServers || [],  // 必填字段，默认为空数组
      ...(options.sessionId && { sessionId: options.sessionId }),
      ...(options.additionalDirectories && { additionalDirectories: options.additionalDirectories }),
    };

    console.log('[KimiACP] Sending newSession request:', JSON.stringify(request, null, 2));

    const response: NewSessionResponse = await this.connection.newSession(request);

    console.log('[KimiACP] newSession response:', JSON.stringify(response, null, 2));

    if ('error' in response && response.error) {
      const errorDetail = response.error as { message?: string; data?: unknown };
      throw new Error(`Failed to create session: ${errorDetail.message || 'Unknown error'}, data: ${JSON.stringify(errorDetail.data)}`);
    }

    console.log('[KimiACP] Session created successfully:', response.sessionId);
    return response;
  }

  /**
   * 发送消息到会话
   */
  async sendMessage(
    sessionId: string, 
    prompt: string,
    options: {
      mode?: string;
      contextFiles?: { path: string; content?: string }[];
    } = {}
  ): Promise<PromptResponse> {
    if (!this.connection) {
      throw new Error('Not connected to Kimi ACP');
    }

    const request: PromptRequest = {
      sessionId,
      prompt: [{ type: 'text', text: prompt }],
      mode: options.mode,
      contextFiles: options.contextFiles,
    };

    this.log('Sending message:', prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''));

    const response: PromptResponse = await this.connection.prompt(request);

    if ('error' in response && response.error) {
      throw new Error(`Prompt failed: ${(response.error as { message?: string }).message || 'Unknown error'}`);
    }

    return response;
  }

  /**
   * 发送消息到会话（流式）
   * 返回一个 Promise，在流结束时 resolve，同时通过 callbacks 提供实时更新
   */
  async sendMessageStream(
    sessionId: string,
    prompt: string,
    callbacks: AcpStreamCallbacks,
    options: {
      mode?: string;
      contextFiles?: { path: string; content?: string }[];
    } = {}
  ): Promise<{ message: string; thought?: string }> {
    if (!this.connection) {
      throw new Error('Not connected to Kimi ACP');
    }

    const request: PromptRequest = {
      sessionId,
      prompt: [{ type: 'text', text: prompt }],
      mode: options.mode,
      contextFiles: options.contextFiles,
    };

    this.log('Sending message (streaming):', prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''));

    // 收集消息的各部分
    let fullMessage = '';
    let fullThought = '';
    const toolCalls: unknown[] = [];

    // 设置流式收集器（在调用 prompt 前设置，确保不丢失任何消息）
    this.streamCollector = {
      onMessageChunk: (chunk: string) => {
        fullMessage += chunk;
        callbacks.onMessageChunk?.(chunk);
      },
      onThoughtChunk: (chunk: string) => {
        fullThought += chunk;
        callbacks.onThoughtChunk?.(chunk);
      },
      onToolCall: (toolCall: unknown) => {
        toolCalls.push(toolCall);
        callbacks.onToolCall?.(toolCall);
      },
    };

    try {
      const response: PromptResponse = await this.connection.prompt(request);

      if ('error' in response && response.error) {
        throw new Error(`Prompt failed: ${(response.error as { message?: string }).message || 'Unknown error'}`);
      }

      callbacks.onComplete?.();
      
      // 修复：先获取缓冲区内容，再刷新输出
      const bufferContent = this.sessionContentBuffer.get(sessionId);
      if (bufferContent && bufferContent.message.length > fullMessage.length) {
        console.log(`[KimiACP] Using buffer content (${bufferContent.message.length} chars) instead of collected (${fullMessage.length} chars)`);
        fullMessage = bufferContent.message;
        fullThought = bufferContent.thought || fullThought;
      }
      
      // 触发该 session 的内容输出
      this.flushSessionContent(sessionId);

      // 如果响应包含 message 字段且我们没有收集到消息，使用响应中的 message
      const responseWithMessage = response as unknown as { message?: string };
      const finalMessage = fullMessage || responseWithMessage.message || '';

      return {
        message: finalMessage,
        thought: fullThought,
      };
    } catch (error) {
      callbacks.onError?.(error as Error);
      throw error;
    } finally {
      // 清除流式收集器
      this.streamCollector = undefined;
    }
  }

  /**
   * 取消当前会话的提示
   */
  async cancelSession(sessionId: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to Kimi ACP');
    }

    this.log('Cancelling session:', sessionId);

    await this.connection.cancel({ sessionId });
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.log('Disconnecting...');

    if (this.kimiProcess) {
      this.kimiProcess.kill('SIGTERM');
      
      // 等待进程退出
      await new Promise<void>((resolve) => {
        if (this.kimiProcess?.killed) {
          resolve();
        } else {
          this.kimiProcess?.on('exit', () => resolve());
          // 超时强制结束
          setTimeout(() => {
            this.kimiProcess?.kill('SIGKILL');
            resolve();
          }, 5000);
        }
      });
    }

    this.connection = undefined;
    this.stream = undefined;
    this.kimiProcess = undefined;

    this.log('Disconnected');
  }

  /**
   * 检查是否已连接
   */
  get isConnected(): boolean {
    return !!this.connection && !this.connection.signal.aborted;
  }

  /**
   * 获取连接信号（用于监听连接关闭）
   */
  get signal(): AbortSignal | undefined {
    return this.connection?.signal;
  }

  // ============== Client 接口实现 ==============

  /**
   * 处理权限请求
   * 当 Agent 需要执行敏感操作时会调用此方法
   */
  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    this.log('Permission requested:', JSON.stringify(params, null, 2));

    if (this.onPermissionRequest) {
      try {
        return await this.onPermissionRequest(params);
      } catch (error) {
        console.error('[KimiACP] Error in custom permission handler:', error);
        // 出错时默认拒绝
        return {
          outcome: {
            outcome: 'cancelled',
          },
        };
      }
    }

    // 默认自动批准第一个选项（生产环境应该询问用户）
    const toolTitle = params.toolCall?.title || 'Unknown';
    console.log(`[Permission Request] ${toolTitle}`);
    
    if (params.options && params.options.length > 0) {
      console.log('Available options:', params.options.map(o => o.name).join(', '));
      
      // 选择第一个选项
      const firstOption = params.options[0];
      if (firstOption && firstOption.optionId) {
        console.log(`[Permission Request] Auto-selecting option: ${firstOption.name || firstOption.optionId}`);
        return {
          outcome: {
            outcome: 'selected',
            optionId: firstOption.optionId,
          },
        };
      }
    }
    
    console.log('[Permission Request] No options available or invalid params, cancelling');
    return {
      outcome: {
        outcome: 'cancelled',
      },
    };
  }

  /**
   * 处理会话更新通知
   * 接收 Agent 发送的实时更新（消息片段、工具调用等）
   */
  async sessionUpdate(params: SessionNotification): Promise<void> {
    this.log('Session update:', JSON.stringify(params, null, 2));

    // 解析 sessionUpdate 通知
    // 修复：实际通知结构是 { sessionId, update: { sessionUpdate, content } }
    const notification = params as SessionNotification & { 
      sessionId?: string;
      update?: {
        sessionUpdate?: string;
        content?: { text?: string; type?: string };
      };
      sessionUpdate?: string;
      content?: { text?: string; type?: string };
      stopReason?: string;
    };
    
    const sessionId = notification.sessionId;
    const updateData = notification.update || notification as unknown as { sessionUpdate?: string; content?: { text?: string } };
    const updateType = updateData.sessionUpdate;
    const content = updateData.content;
    
    // 按 sessionId 收集内容
    if (sessionId && updateType) {
      // 获取或创建该 session 的缓冲区
      let buffer = this.sessionContentBuffer.get(sessionId);
      if (!buffer) {
        buffer = { message: '', thought: '', toolCalls: [], lastUpdate: Date.now() };
        this.sessionContentBuffer.set(sessionId, buffer);
      }
      buffer.lastUpdate = Date.now();
      
      // 根据 update 类型收集内容
      switch (updateType) {
        case 'agent_message_chunk':
          if (content?.text !== undefined) {
            buffer.message += content.text;
          }
          break;
        case 'agent_thought_chunk':
          if (content?.text !== undefined) {
            buffer.thought += content.text;
          }
          break;
        case 'tool_call':
          buffer.toolCalls.push(notification);
          break;
        case 'stop':
        case 'complete':
          // 会话结束，但在 sendMessageStream 中统一处理输出
          // 避免重复清理缓冲区导致竞态条件
          break;
      }
    }

    // 如果有流式收集器，转发消息
    if (this.streamCollector) {
      if (updateType && content?.text !== undefined) {
        const text = content.text;
        switch (updateType) {
          case 'agent_message_chunk':
            this.streamCollector.onMessageChunk(text);
            break;
          case 'agent_thought_chunk':
            if (this.config.showThoughtProcess) {
              this.streamCollector.onThoughtChunk(text);
            }
            break;
          case 'tool_call':
            if (this.config.showThoughtProcess) {
              this.streamCollector.onToolCall(notification);
            }
            break;
        }
      }
    }

    // 调用外部处理器（如果有）
    if (this.onSessionUpdate) {
      this.onSessionUpdate(params);
    }
  }

  /**
   * 写入文本文件
   */
  async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    this.log('Writing file:', params.path);
    
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    
    const fullPath = path.resolve(params.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, params.content, 'utf-8');
    
    return {};
  }

  /**
   * 读取文本文件
   */
  async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    this.log('Reading file:', params.path);
    
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(params.path, 'utf-8');
    
    return { content };
  }

  // ============== 私有方法 ==============

  /**
   * 输出指定 session 收集的完整内容
   */
  private flushSessionContent(sessionId: string): void {
    const buffer = this.sessionContentBuffer.get(sessionId);
    if (!buffer) return;
    
    // 输出到控制台 - 修复：添加更明显的分隔和完整内容输出
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log(`║  📦 ACP Session 完整内容 [${sessionId.substring(0, 20)}...] ║`);
    console.log('╠══════════════════════════════════════════════════════════╣');
    
    // 思考过程
    if (buffer.thought) {
      console.log('║  💭 思考过程:');
      const thoughtLines = buffer.thought.split('\n');
      for (const line of thoughtLines.slice(0, 10)) {
        console.log(`║    ${line.substring(0, 50).padEnd(50)} ║`);
      }
      if (thoughtLines.length > 10) {
        console.log(`║    ... (${thoughtLines.length - 10} 行省略)`.padEnd(55) + ' ║');
      }
      console.log('╠══════════════════════════════════════════════════════════╣');
    }
    
    // 工具调用
    if (buffer.toolCalls.length > 0) {
      console.log(`║  🔧 工具调用 (${buffer.toolCalls.length} 个)`);
      console.log('╠══════════════════════════════════════════════════════════╣');
    }
    
    // 最终消息 - 修复：确保显示完整消息内容
    if (buffer.message) {
      console.log(`║  💬 最终消息 (${buffer.message.length} 字符):`);
      console.log('╠══════════════════════════════════════════════════════════╣');
      // 输出完整消息，不截断
      const msgLines = buffer.message.split('\n');
      for (const line of msgLines) {
        // 分行输出，每行最多 50 个字符
        for (let i = 0; i < line.length; i += 50) {
          const chunk = line.substring(i, i + 50);
          console.log(`║    ${chunk.padEnd(50)} ║`);
        }
      }
    } else {
      console.log('║  ⚠️ 无消息内容');
    }
    
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    // 清理缓冲区
    this.sessionContentBuffer.delete(sessionId);
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[KimiACP]', ...args);
    }
  }
}

export default KimiAcpClient;
