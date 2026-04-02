/**
 * 飞书消息中间层系统
 * 提供统一的抽象消息接口，支持多平台适配
 */

// 导出核心类型和接口
export * from './core/types';
export { IMessagingAdapter } from './core/interfaces/IMessagingAdapter';
export { EventEmitter } from './core/events/EventEmitter';

// 导出飞书适配器
export * from './adapters/feishu';

// 导出消息调度器
export { MessageDispatcher, dispatcher } from './messaging/MessageDispatcher';

// 版本信息
export const VERSION = '1.0.0';
