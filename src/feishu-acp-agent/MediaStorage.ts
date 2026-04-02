/**
 * 媒体文件存储管理器
 * 处理图片、文件等媒体的下载和缓存
 */

import { promises as fs } from 'node:fs';
import { dirname, join, basename, extname } from 'node:path';
import type { FileInfo, PendingMedia } from './types.js';

interface MediaStorageOptions {
  /** 存储目录 */
  storageDir: string;
  /** 最大文件大小（字节），默认 10MB */
  maxFileSize?: number;
  /** 文件过期时间（毫秒），默认 24 小时 */
  fileExpiration?: number;
}

export class MediaStorage {
  private options: Required<MediaStorageOptions>;

  constructor(options: MediaStorageOptions) {
    this.options = {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      fileExpiration: 24 * 60 * 60 * 1000, // 24 小时
      ...options,
    };

    // 确保存储目录存在
    this.ensureDirectory();
  }

  /**
   * 确保存储目录存在
   */
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.options.storageDir, { recursive: true });
    } catch (error) {
      console.error('[MediaStorage] Failed to create directory:', error);
      throw error;
    }
  }

  /**
   * 生成安全的文件名
   */
  private generateSafeFileName(originalName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = extname(originalName) || '.bin';
    const base = basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    return `${timestamp}_${random}_${base}${ext}`;
  }

  /**
   * 保存文件内容
   */
  async saveFile(
    chatId: string,
    fileInfo: FileInfo,
    content: Buffer
  ): Promise<PendingMedia> {
    // 检查文件大小
    if (content.length > this.options.maxFileSize) {
      throw new Error(`File too large: ${content.length} bytes (max: ${this.options.maxFileSize})`);
    }

    // 生成文件路径
    const fileName = this.generateSafeFileName(fileInfo.name);
    const chatDir = join(this.options.storageDir, chatId.replace(/[^a-zA-Z0-9_-]/g, '_'));
    const filePath = join(chatDir, fileName);

    // 确保聊天目录存在
    await fs.mkdir(chatDir, { recursive: true });

    // 写入文件
    await fs.writeFile(filePath, content);

    return {
      type: fileInfo.fileType,
      name: fileInfo.name,
      localPath: filePath,
      content,
      storedAt: Date.now(),
    };
  }

  /**
   * 保存图片
   */
  async saveImage(
    chatId: string,
    imageKey: string,
    imageContent: Buffer
  ): Promise<PendingMedia> {
    const fileInfo: FileInfo = {
      fileType: 'image',
      name: `image_${imageKey}.png`,
    };

    return this.saveFile(chatId, fileInfo, imageContent);
  }

  /**
   * 读取文件内容
   */
  async readFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  /**
   * 删除文件
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // 文件可能不存在，忽略错误
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[MediaStorage] Failed to delete file:', error);
      }
    }
  }

  /**
   * 清理过期文件
   */
  async cleanupExpiredFiles(): Promise<number> {
    let deletedCount = 0;
    const now = Date.now();

    try {
      const entries = await fs.readdir(this.options.storageDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const chatDir = join(this.options.storageDir, entry.name);
        const files = await fs.readdir(chatDir, { withFileTypes: true });

        for (const file of files) {
          if (!file.isFile()) continue;

          const filePath = join(chatDir, file.name);
          const stats = await fs.stat(filePath);

          if (now - stats.mtime.getTime() > this.options.fileExpiration) {
            await this.deleteFile(filePath);
            deletedCount++;
          }
        }

        // 如果目录为空，删除目录
        const remainingFiles = await fs.readdir(chatDir);
        if (remainingFiles.length === 0) {
          await fs.rmdir(chatDir);
        }
      }
    } catch (error) {
      console.error('[MediaStorage] Cleanup error:', error);
    }

    return deletedCount;
  }

  /**
   * 清理指定聊天的所有文件
   */
  async cleanupChatFiles(chatId: string): Promise<number> {
    let deletedCount = 0;
    const chatDir = join(this.options.storageDir, chatId.replace(/[^a-zA-Z0-9_-]/g, '_'));

    try {
      const files = await fs.readdir(chatDir, { withFileTypes: true });

      for (const file of files) {
        if (!file.isFile()) continue;

        const filePath = join(chatDir, file.name);
        await this.deleteFile(filePath);
        deletedCount++;
      }

      // 删除空目录
      await fs.rmdir(chatDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[MediaStorage] Cleanup chat files error:', error);
      }
    }

    return deletedCount;
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(filePath: string): Promise<{ size: number; mtime: Date } | null> {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        mtime: stats.mtime,
      };
    } catch {
      return null;
    }
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export default MediaStorage;
