/**
 * 简单的事件发射器实现
 */

export type EventHandler<T = any> = (data: T) => void;

export class EventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  /**
   * 注册事件处理器
   */
  on<T>(event: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  /**
   * 注册一次性事件处理器
   */
  once<T>(event: string, handler: EventHandler<T>): void {
    const onceHandler: EventHandler<T> = (data) => {
      this.off(event, onceHandler);
      handler(data);
    };
    this.on(event, onceHandler);
  }

  /**
   * 移除事件处理器
   */
  off<T>(event: string, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /**
   * 触发事件
   */
  emit<T>(event: string, data: T): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * 移除所有事件处理器
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * 获取事件处理器数量
   */
  listenerCount(event: string): number {
    return this.handlers.get(event)?.size || 0;
  }
}
