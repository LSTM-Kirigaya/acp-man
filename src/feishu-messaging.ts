/**
 * 飞书消息工具模块 - 支持实时流式卡片
 */

import * as lark from '@larksuiteoapi/node-sdk';

let larkClient: lark.Client | null = null;

export function initFeishuClient(appId: string, appSecret: string): void {
    larkClient = new lark.Client({
        appId,
        appSecret,
        appType: lark.AppType.SelfBuild,
    });
}

export function getClient(): lark.Client {
    if (!larkClient) throw new Error('Feishu client not initialized');
    return larkClient;
}

// ============ 基础卡片发送 ============

/**
 * 发送简单的文本卡片（用于实时流中的独立消息）
 */
export async function sendTextCard(
    receiveId: string,
    title: string,
    content: string
): Promise<void> {
    const client = getClient();
    
    const card = {
        header: {
            template: 'green',
            title: { tag: 'plain_text', content: title }
        },
        elements: [{
            tag: 'div',
            text: { tag: 'lark_md', content: content || '*(无内容)*' }
        }]
    };

    try {
        const resp = await client.im.v1.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: receiveId,
                msg_type: 'interactive',
                content: JSON.stringify(card),
            } as any,
        });
        if (resp.code !== 0) {
            console.error('[Feishu] sendTextCard failed:', resp.msg);
        }
    } catch (e) {
        console.error('[Feishu] sendTextCard error:', e);
    }
}

/**
 * 发送结构化卡片（用于最终回复，包含思考、工具、回复等完整信息）
 */
export async function sendFinalCard(
    receiveId: string,
    title: string,
    content: string,
    options?: {
        thought?: string;
        toolCalls?: Array<{ name: string; params?: Record<string, unknown> }>;
    }
): Promise<void> {
    const client = getClient();
    const elements: any[] = [];

    // 思考过程（如果之前未发送）
    if (options?.thought && options.thought.trim()) {
        elements.push({
            tag: 'div',
            text: { tag: 'lark_md', content: `💭 **思考过程**\n> ${options.thought.substring(0, 1500)}` }
        });
    }

    // 工具调用记录
    if (options?.toolCalls && options.toolCalls.length > 0) {
        elements.push({
            tag: 'div',
            text: { tag: 'lark_md', content: `🔧 **已调用工具**\n${options.toolCalls.map(tc => `- ${tc.name}`).join('\n')}` }
        });
    }

    // 分隔线
    if (elements.length > 0) {
        elements.push({ tag: 'hr' });
    }

    // 最终回复内容
    elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: content || '*(无回复内容)*' }
    });

    const card = {
        header: {
            template: 'blue',
            title: { tag: 'plain_text', content: title }
        },
        elements
    };

    try {
        const resp = await client.im.v1.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: receiveId,
                msg_type: 'interactive',
                content: JSON.stringify(card),
            } as any,
        });
        if (resp.code !== 0) {
            console.error('[Feishu] sendFinalCard failed:', resp.msg);
        }
    } catch (e) {
        console.error('[Feishu] sendFinalCard error:', e);
    }
}

// ============ 流式卡片更新（进阶） ============

interface StreamCardState {
    messageId: string;
    thinking: string;
    toolCalls: Array<{ name: string; params?: any }>;
    message: string;
    thinkingSent: boolean;
}

const activeStreams = new Map<string, StreamCardState>();

/**
 * 创建一个新的流式卡片
 */
export async function createStreamCard(
    receiveId: string,
    title: string
): Promise<string | null> {
    const client = getClient();

    const card = {
        header: {
            template: 'grey',
            title: { tag: 'plain_text', content: title }
        },
        elements: [{
            tag: 'div',
            text: { tag: 'plain_text', content: '⏳ 处理中...' }
        }]
    };

    try {
        const resp = await client.im.v1.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: receiveId,
                msg_type: 'interactive',
                content: JSON.stringify(card),
            } as any,
        });

        if (resp.code === 0 && resp.data?.message_id) {
            activeStreams.set(resp.data.message_id, {
                messageId: resp.data.message_id,
                thinking: '',
                toolCalls: [],
                message: '',
                thinkingSent: false,
            });
            return resp.data.message_id;
        }
    } catch (e) {
        console.error('[Feishu] createStreamCard error:', e);
    }
    return null;
}

/**
 * 更新流式卡片（如果不支持，则发送新消息）
 */
export async function updateStreamCard(
    receiveId: string,
    state: {
        thinking?: string;
        toolCalls?: Array<{ name: string; params?: any }>;
        message?: string;
    },
    messageId?: string | null
): Promise<string | null> {
    const client = getClient();

    // 构造新卡片内容
    const elements: any[] = [];

    if (state.thinking && state.thinking.trim()) {
        elements.push({
            tag: 'div',
            text: { tag: 'lark_md', content: `💭 **思考**\n> ${state.thinking.substring(0, 1000)}` }
        });
    }

    if (state.toolCalls && state.toolCalls.length > 0) {
        elements.push({
            tag: 'div',
            text: { tag: 'lark_md', content: state.toolCalls.map(tc => `🔧 **${tc.name}**`).join('\n') }
        });
    }

    if (state.message && state.message.trim()) {
        elements.push({
            tag: 'div',
            text: { tag: 'lark_md', content: state.message.substring(0, 2000) }
        });
    }

    if (elements.length === 0) {
        elements.push({ tag: 'div', text: { tag: 'plain_text', content: '⏳ 处理中...' } });
    }

    const card = {
        header: {
            template: 'green',
            title: { tag: 'plain_text', content: '🤖 Kimi' }
        },
        elements
    };

    try {
        // 尝试更新现有消息
        if (messageId) {
            const resp = await client.im.v1.message.patch({
                data: { content: JSON.stringify(card) } as any,
                path: { message_id: messageId },
            });
            if (resp.code === 0) {
                return messageId;
            }
        }

        // 失败则发送新消息
        const resp = await client.im.v1.message.create({
            params: { receive_id_type: 'open_id' },
            data: {
                receive_id: receiveId,
                msg_type: 'interactive',
                content: JSON.stringify(card),
            } as any,
        });
        return resp.data?.message_id || null;
    } catch (e) {
        console.error('[Feishu] updateStreamCard error:', e);
        return null;
    }
}

// ============ 兼容旧接口 ============

export async function sendStructuredCard(
    _client: lark.Client,
    receiveId: string,
    title: string,
    content: string,
    thinking?: string
): Promise<string | null> {
    console.warn('[deprecated] sendStructuredCard is deprecated, use sendFinalCard instead');
    await sendFinalCard(receiveId, title, content, { thought: thinking });
    return null;
}
