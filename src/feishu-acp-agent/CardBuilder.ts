/**
 * 飞书交互式卡片构建器
 * 用于构建各种交互式卡片消息
 */

/**
 * 绑定路径卡片配置
 */
export interface BindPathCardConfig {
  /** 当前绑定的路径 */
  currentPath?: string;
  /** 回调 URL */
  callbackUrl?: string;
}

/**
 * 构建绑定路径表单卡片
 */
export function buildBindPathCard(config: BindPathCardConfig = {}): Record<string, unknown> {
  const { currentPath } = config;

  const elements: Record<string, unknown>[] = [
    // 说明文字
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '请填写要绑定的工作目录路径。绑定后，Kimi Agent 将在此目录下执行操作。',
      },
    },
  ];

  // 当前路径显示（如果有）
  if (currentPath) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**当前绑定路径:** \`${currentPath}\``,
      },
    });
  }

  // 分隔线和表单
  elements.push(
    { tag: 'hr' },
    // 表单容器
    {
      tag: 'form_container',
      elements: [
        // 路径输入框
        {
          tag: 'input',
          placeholder: {
            tag: 'plain_text',
            content: '请输入绝对路径，例如：/Users/username/project',
          },
          name: 'bind_path',
          required: true,
        },
      ],
    },
    // 操作按钮
    {
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '确认绑定',
          },
          type: 'primary',
          value: {
            action: 'bind_path_submit',
          },
        },
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '取消',
          },
          type: 'default',
          value: {
            action: 'bind_path_cancel',
          },
        },
      ],
    }
  );

  return {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '绑定工作目录',
      },
      subtitle: {
        tag: 'plain_text',
        content: '将当前会话绑定到 Kimi ACP 工作目录',
      },
    },
    elements,
  };
}

/**
 * 构建绑定成功卡片
 */
export function buildBindSuccessCard(path: string): Record<string, unknown> {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '绑定成功',
      },
      template: 'green',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `已成功绑定工作目录：\n\`\`\`\n${path}\n\`\`\``,
        },
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: '现在你可以直接发送消息与 Kimi Agent 对话了。',
        },
      },
    ],
  };
}

/**
 * 构建帮助信息卡片
 */
export function buildHelpCard(): Record<string, unknown> {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: 'Kimi ACP Agent 帮助',
      },
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: '**可用命令：**',
        },
      },
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: '`/bind`\n绑定工作目录',
            },
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: '`/status`\n查看当前状态',
            },
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: '`/clear`\n清空媒体缓存',
            },
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: '`/help`\n显示帮助信息',
            },
          },
        ],
      },
      {
        tag: 'hr',
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: '**使用说明：**\n\n1. 首先使用 `/bind` 命令绑定工作目录\n2. 发送文字消息与 Kimi 对话\n3. 可以发送图片、文件作为上下文\n4. 多条消息会自动排队处理',
        },
      },
    ],
  };
}

/**
 * 构建状态信息卡片
 */
export function buildStatusCard(data: {
  chatName?: string;
  bindPath?: string;
  queueLength: number;
  pendingMediaCount: number;
  isProcessing: boolean;
}): Record<string, unknown> {
  const { chatName, bindPath, queueLength, pendingMediaCount, isProcessing } = data;

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '当前状态',
      },
    },
    elements: [
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**会话名称**\n${chatName || '未命名'}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**处理状态**\n${isProcessing ? '处理中' : '空闲'}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**消息队列**\n${queueLength} 条待处理`,
            },
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**媒体缓存**\n${pendingMediaCount} 个文件`,
            },
          },
        ],
      },
      {
        tag: 'hr',
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: bindPath
            ? `**绑定路径：**\n\`\`\`\n${bindPath}\n\`\`\``
            : '**绑定路径：** 未绑定（使用 `/bind` 命令绑定）',
        },
      },
    ],
  };
}

/**
 * 构建错误提示卡片
 */
export function buildErrorCard(error: string): Record<string, unknown> {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '出错了',
      },
      template: 'red',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: error,
        },
      },
    ],
  };
}

/**
 * 构建等待提示卡片
 */
export function buildProcessingCard(queuePosition?: number): Record<string, unknown> {
  const content = queuePosition
    ? `你的消息已加入队列，当前排在第 ${queuePosition} 位，请稍候...`
    : '正在处理你的请求，请稍候...';

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '请稍候',
      },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content,
        },
      },
    ],
  };
}

export default {
  buildBindPathCard,
  buildBindSuccessCard,
  buildHelpCard,
  buildStatusCard,
  buildErrorCard,
  buildProcessingCard,
};
