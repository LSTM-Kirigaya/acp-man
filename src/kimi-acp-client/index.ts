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
export class KimiAcpClient implements Client {
  private config: KimiAcpClientConfig;
  private kimiProcess?: ChildProcess;
  private connection?: ClientSideConnection;
  private stream?: Stream;
  private debug: boolean;

  // 事件处理器
  public onSessionUpdate?: (update: SessionNotification) => void;
  public onPermissionRequest?: (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;

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

    const request: NewSessionRequest = {
      cwd,
      sessionId: options.sessionId,
      additionalDirectories: options.additionalDirectories,
      mcpServers: options.mcpServers,
    };

    this.log('Creating new session:', JSON.stringify(request, null, 2));

    const response: NewSessionResponse = await this.connection.newSession(request);

    if ('error' in response && response.error) {
      throw new Error(`Failed to create session: ${(response.error as { message?: string }).message || 'Unknown error'}`);
    }

    this.log('Session created:', response.sessionId);
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
      return await this.onPermissionRequest(params);
    }

    // 默认自动批准第一个选项（生产环境应该询问用户）
    console.log(`[Permission Request] ${params.toolCall.title || 'Unknown'}`);
    console.log('Available options:', params.options.map(o => o.name).join(', '));
    
    // 选择第一个选项
    const firstOption = params.options[0];
    if (firstOption) {
      return {
        outcome: {
          outcome: 'selected',
          optionId: firstOption.optionId,
        },
      };
    }
    
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

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[KimiACP]', ...args);
    }
  }
}

export default KimiAcpClient;
