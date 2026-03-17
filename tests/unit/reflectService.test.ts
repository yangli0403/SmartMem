/**
 * Reflect 综合推理服务 (reflectService) 单元测试
 *
 * 测试覆盖：
 * - isReflectEnabled 开关判断
 * - reflectOnMemories 综合推理逻辑
 * - LLM 调用失败时的降级处理
 * - 空输入处理
 */

import {
  isReflectEnabled,
  reflectOnMemories,
} from '../../src/services/reflectService';
import { Memory } from '../../src/data/dal';

// ============================================================
// 辅助函数
// ============================================================

function createMockMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 1,
    userId: 100,
    content: '测试记忆',
    importance: 0.8,
    kind: 'episodic',
    type: 'preference',
    source: 'conversation',
    embedding: null,
    accessCount: 3,
    createdAt: new Date('2026-01-01'),
    lastAccessedAt: new Date('2026-03-01'),
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

// ============================================================
// isReflectEnabled 测试
// ============================================================

describe('isReflectEnabled - Reflect 开关判断', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  test('MEMORY_REFLECT_ENABLED=true 时应返回 true', () => {
    process.env = { ...originalEnv, MEMORY_REFLECT_ENABLED: 'true' };
    expect(isReflectEnabled()).toBe(true);
  });

  test('MEMORY_REFLECT_ENABLED=false 时应返回 false', () => {
    process.env = { ...originalEnv, MEMORY_REFLECT_ENABLED: 'false' };
    expect(isReflectEnabled()).toBe(false);
  });

  test('未设置 MEMORY_REFLECT_ENABLED 时应返回 false', () => {
    process.env = { ...originalEnv };
    delete process.env.MEMORY_REFLECT_ENABLED;
    expect(isReflectEnabled()).toBe(false);
  });

  test('MEMORY_REFLECT_ENABLED=True（大写）时应返回 false', () => {
    process.env = { ...originalEnv, MEMORY_REFLECT_ENABLED: 'True' };
    expect(isReflectEnabled()).toBe(false);
  });
});

// ============================================================
// reflectOnMemories 测试
// ============================================================

describe('reflectOnMemories - 综合推理', () => {
  test('空候选记忆列表应返回空字符串', async () => {
    const result = await reflectOnMemories('任意查询', []);
    expect(result).toBe('');
  });

  test('应将候选记忆和查询传递给 LLM', async () => {
    const memories = [
      createMockMemory({ kind: 'episodic', type: 'preference', content: '喜欢蓝色' }),
      createMockMemory({ id: 2, kind: 'semantic', type: 'fact', content: '生日是10月1日' }),
    ];

    const mockLLM = jest.fn().mockResolvedValue('用户喜欢蓝色，生日是10月1日');
    const result = await reflectOnMemories('告诉我用户信息', memories, mockLLM);

    expect(mockLLM).toHaveBeenCalledTimes(1);
    const promptArg = mockLLM.mock.calls[0][0];
    expect(promptArg).toContain('告诉我用户信息');
    expect(promptArg).toContain('喜欢蓝色');
    expect(promptArg).toContain('生日是10月1日');
    expect(result).toBe('用户喜欢蓝色，生日是10月1日');
  });

  test('LLM 返回"无相关记忆"时应返回空字符串', async () => {
    const memories = [createMockMemory({ content: '喜欢蓝色' })];
    const mockLLM = jest.fn().mockResolvedValue('无相关记忆');

    const result = await reflectOnMemories('天气如何', memories, mockLLM);
    expect(result).toBe('');
  });

  test('LLM 返回空字符串时应返回空字符串', async () => {
    const memories = [createMockMemory({ content: '喜欢蓝色' })];
    const mockLLM = jest.fn().mockResolvedValue('');

    const result = await reflectOnMemories('查询', memories, mockLLM);
    expect(result).toBe('');
  });

  test('LLM 调用失败时应降级为直接格式化', async () => {
    const memories = [
      createMockMemory({ kind: 'episodic', type: 'preference', content: '喜欢蓝色' }),
    ];
    const mockLLM = jest.fn().mockRejectedValue(new Error('API 超时'));

    const result = await reflectOnMemories('颜色偏好', memories, mockLLM);
    // 降级输出应包含记忆内容
    expect(result).toContain('[episodic/preference] 喜欢蓝色');
  });

  test('应正确格式化候选记忆的序号和类型', async () => {
    const memories = [
      createMockMemory({ kind: 'episodic', type: 'preference', content: '喜欢蓝色' }),
      createMockMemory({ id: 2, kind: 'persona', type: 'fact', content: '妻子叫小红' }),
    ];

    const mockLLM = jest.fn().mockResolvedValue('综合推理结果');
    await reflectOnMemories('用户信息', memories, mockLLM);

    const promptArg = mockLLM.mock.calls[0][0];
    expect(promptArg).toContain('1. [episodic/preference] 喜欢蓝色');
    expect(promptArg).toContain('2. [persona/fact] 妻子叫小红');
  });
});
