/**
 * 检索协调器 (retrievalOrchestrator) 单元测试
 *
 * 测试覆盖：
 * - 余弦相似度计算
 * - 嵌入向量生成（占位实现）
 * - 记忆格式化输出
 * - 简单检索策略
 * - 混合检索策略（BM25 + 向量）
 * - Reflect 综合推理集成
 */

import {
  cosineSimilarity,
  generateEmbedding,
  formatMemoriesForContext,
  getFormattedMemoryContext,
} from '../../src/core/retrievalOrchestrator';
import * as dal from '../../src/data/dal';
import * as reflectService from '../../src/services/reflectService';

// 模拟数据访问层
jest.mock('../../src/data/dal');
jest.mock('../../src/services/reflectService');

const mockedDal = dal as jest.Mocked<typeof dal>;
const mockedReflect = reflectService as jest.Mocked<typeof reflectService>;

// ============================================================
// 测试数据
// ============================================================

/** 构造测试用的记忆对象 */
function createMockMemory(overrides: Partial<dal.Memory> = {}): dal.Memory {
  return {
    id: 1,
    userId: 100,
    content: '用户喜欢喝拿铁',
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
// 余弦相似度测试
// ============================================================

describe('cosineSimilarity - 余弦相似度计算', () => {
  test('相同向量的相似度应为 1', () => {
    const vec = [1, 2, 3];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
  });

  test('正交向量的相似度应为 0', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  test('反向向量的相似度应为 -1', () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  test('零向量的相似度应为 0', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  test('不同长度的向量应正确处理', () => {
    const a = [1, 2, 3, 4];
    const b = [1, 2];
    // 应该不抛出异常，正常返回结果
    const result = cosineSimilarity(a, b);
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });

  test('空向量应返回 0', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

// ============================================================
// 嵌入向量生成测试
// ============================================================

describe('generateEmbedding - 嵌入向量生成', () => {
  test('应为非空文本生成非空向量', async () => {
    const embedding = await generateEmbedding('你好世界');
    expect(embedding).toBeDefined();
    expect(embedding.length).toBeGreaterThan(0);
  });

  test('生成的向量应已归一化（模长接近 1）', async () => {
    const embedding = await generateEmbedding('测试文本 嵌入向量');
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 3);
  });

  test('相同文本应生成相同向量', async () => {
    const e1 = await generateEmbedding('一致性测试');
    const e2 = await generateEmbedding('一致性测试');
    expect(e1).toEqual(e2);
  });

  test('不同文本应生成不同向量', async () => {
    // 占位实现基于空格分词，需要使用不同词数的文本
    const e1 = await generateEmbedding('apple orange banana');
    const e2 = await generateEmbedding('car plane train ship');
    // 不同词数的文本应产生不同维度的向量
    expect(e1.length).not.toEqual(e2.length);
  });
});

// ============================================================
// 记忆格式化测试
// ============================================================

describe('formatMemoriesForContext - 记忆格式化', () => {
  test('空列表应返回空字符串', () => {
    expect(formatMemoriesForContext([], 2000)).toBe('');
  });

  test('应正确格式化记忆列表', () => {
    const memories = [
      createMockMemory({ kind: 'episodic', type: 'preference', content: '喜欢蓝色' }),
      createMockMemory({ id: 2, kind: 'semantic', type: 'fact', content: '生日是10月1日' }),
    ];
    const result = formatMemoriesForContext(memories, 2000);
    expect(result).toContain('[episodic/preference] 喜欢蓝色');
    expect(result).toContain('[semantic/fact] 生日是10月1日');
  });

  test('应在超过 maxLength 时截断', () => {
    const memories = Array.from({ length: 50 }, (_, i) =>
      createMockMemory({ id: i, content: `这是一条很长的测试记忆内容，编号 ${i}` })
    );
    const result = formatMemoriesForContext(memories, 100);
    expect(result.length).toBeLessThanOrEqual(120); // 允许最后一行略超
  });
});

// ============================================================
// 简单检索策略测试
// ============================================================

describe('getFormattedMemoryContext - 简单检索策略', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, MEMORY_RETRIEVAL_STRATEGY: 'simple' };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('简单策略应调用 searchMemories', async () => {
    const mockMemories = [
      createMockMemory({ content: '喜欢喝拿铁' }),
    ];
    mockedDal.searchMemories.mockResolvedValue(mockMemories);

    const result = await getFormattedMemoryContext(100, '咖啡推荐');
    expect(mockedDal.searchMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 100,
        query: '咖啡推荐',
      })
    );
    expect(result).toContain('喜欢喝拿铁');
  });

  test('无记忆时应返回空字符串', async () => {
    mockedDal.searchMemories.mockResolvedValue([]);
    const result = await getFormattedMemoryContext(100, '任意查询');
    expect(result).toBe('');
  });
});

// ============================================================
// 混合检索策略测试
// ============================================================

describe('getFormattedMemoryContext - 混合检索策略', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      MEMORY_RETRIEVAL_STRATEGY: 'hybrid',
      MEMORY_REFLECT_ENABLED: 'false',
    };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('混合策略应调用 getAllMemories', async () => {
    const mockMemories = [
      createMockMemory({ content: '喜欢蓝色', embedding: [0.1, 0.2, 0.3] }),
      createMockMemory({ id: 2, content: '生日是10月1日', embedding: [0.4, 0.5, 0.6] }),
    ];
    mockedDal.getAllMemories.mockResolvedValue(mockMemories);
    mockedReflect.isReflectEnabled.mockReturnValue(false);

    const result = await getFormattedMemoryContext(100, '蓝色');
    expect(mockedDal.getAllMemories).toHaveBeenCalledWith(100, 200);
    expect(result.length).toBeGreaterThan(0);
  });

  test('无记忆时混合策略应返回空字符串', async () => {
    mockedDal.getAllMemories.mockResolvedValue([]);
    mockedReflect.isReflectEnabled.mockReturnValue(false);

    const result = await getFormattedMemoryContext(100, '任意查询');
    expect(result).toBe('');
  });

  test('启用 Reflect 时应调用 reflectOnMemories', async () => {
    const mockMemories = [
      createMockMemory({ content: '喜欢蓝色', embedding: [0.1, 0.2, 0.3] }),
    ];
    mockedDal.getAllMemories.mockResolvedValue(mockMemories);
    mockedReflect.isReflectEnabled.mockReturnValue(true);
    mockedReflect.reflectOnMemories.mockResolvedValue('用户偏好蓝色');

    process.env.MEMORY_REFLECT_ENABLED = 'true';
    const result = await getFormattedMemoryContext(100, '颜色偏好');
    expect(mockedReflect.reflectOnMemories).toHaveBeenCalled();
    expect(result).toBe('用户偏好蓝色');
  });

  test('Reflect 返回空时应降级为格式化输出', async () => {
    const mockMemories = [
      createMockMemory({ content: '喜欢蓝色', embedding: [0.1, 0.2, 0.3] }),
    ];
    mockedDal.getAllMemories.mockResolvedValue(mockMemories);
    mockedReflect.isReflectEnabled.mockReturnValue(true);
    mockedReflect.reflectOnMemories.mockResolvedValue('');

    const result = await getFormattedMemoryContext(100, '颜色');
    expect(result).toContain('喜欢蓝色');
  });
});
