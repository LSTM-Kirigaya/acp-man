/**
 * 配置管理器
 * 管理群聊绑定路径的持久化存储
 */

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

interface BindingConfig {
  /** 群聊ID -> 绑定路径 */
  chatBindings: Record<string, string>;
  /** 最后更新时间 */
  lastUpdated: number;
}

export class ConfigManager {
  private configPath: string;
  private config: BindingConfig;
  private defaultCwd: string;

  constructor(configPath: string = './config/bindings.json', defaultCwd: string = process.cwd()) {
    this.configPath = configPath;
    this.defaultCwd = defaultCwd;
    this.config = {
      chatBindings: {},
      lastUpdated: Date.now(),
    };
  }

  /**
   * 加载配置
   */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(data);
      
      // 合并配置，确保字段存在
      this.config = {
        chatBindings: parsed.chatBindings || {},
        lastUpdated: parsed.lastUpdated || Date.now(),
      };
      
      console.log(`[ConfigManager] Loaded config from ${this.configPath}`);
      console.log(`[ConfigManager] ${Object.keys(this.config.chatBindings).length} chat bindings found`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`[ConfigManager] Config file not found, creating new one`);
        await this.save();
      } else {
        console.error('[ConfigManager] Failed to load config:', error);
        // 使用默认配置
        this.config = {
          chatBindings: {},
          lastUpdated: Date.now(),
        };
      }
    }
  }

  /**
   * 保存配置
   */
  async save(): Promise<void> {
    try {
      this.config.lastUpdated = Date.now();
      
      // 确保目录存在
      const dir = dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      console.log(`[ConfigManager] Saved config to ${this.configPath}`);
    } catch (error) {
      console.error('[ConfigManager] Failed to save config:', error);
    }
  }

  /**
   * 获取群聊绑定路径
   */
  getChatBinding(chatId: string): string | undefined {
    return this.config.chatBindings[chatId];
  }

  /**
   * 设置群聊绑定路径
   */
  async setChatBinding(chatId: string, path: string): Promise<void> {
    this.config.chatBindings[chatId] = path;
    await this.save();
    console.log(`[ConfigManager] Bound chat ${chatId.substring(0, 16)}... to ${path}`);
  }

  /**
   * 移除群聊绑定
   */
  async removeChatBinding(chatId: string): Promise<void> {
    delete this.config.chatBindings[chatId];
    await this.save();
    console.log(`[ConfigManager] Removed binding for chat ${chatId.substring(0, 16)}...`);
  }

  /**
   * 检查群聊是否已绑定
   */
  isChatBound(chatId: string): boolean {
    return !!this.config.chatBindings[chatId];
  }

  /**
   * 获取所有绑定
   */
  getAllBindings(): Record<string, string> {
    return { ...this.config.chatBindings };
  }

  /**
   * 获取主 Agent 的默认路径（用于私聊）
   */
  getDefaultCwd(): string {
    return this.defaultCwd;
  }

  /**
   * 设置默认路径
   */
  setDefaultCwd(path: string): void {
    this.defaultCwd = path;
  }
}

export default ConfigManager;
