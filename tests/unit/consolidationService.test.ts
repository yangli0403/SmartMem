/**
 * 记忆巩固服务 (consolidationService) 单元测试
 *
 * 测试覆盖：
 * - 简单聚类算法
 * - 巩固任务执行逻辑
 * - LLM 响应解析（行为模式、核心事实）
 * - 边界条件处理
 */

import {
  runConsolidation,
  simpleClustering,
} from '../../src/services/consolidationService';
import * as dal from '../../src/data/dal';

jest.mock('../../src/data/dal');
const mockedDal = dal as jest.Mocked<typeof dal>;

// ============================================================
// 辅助函数
// ============================================================

function createMockMemory(overrides: Partial<dal.Memory> = {}): dal.Memory {
  return {
    id: 1,
    userId: 100,
    content: '测试记忆',
    importance: 0.5,
    kind: 'episodic',
    type: 'fact',
    source: 'conversation',
    embedding: null,
    accessCount: 1,
    createdAt: new Date('2026-01-01'),
    lastAccessedAt: new Date('2026-03-01'),
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

// ============================================================
// 聚类算法测试
// ============================================================

describe('simpleClustering - 简单聚类算法', () => {
  test('空列表应返回空数组', () => {
    expect(simpleClustering([])).toEqual([]);
  });

  test('单条记忆应返回包含一个聚类的数组', () => {
    const memories = [createMockMemory({ content: '喜欢蓝色' })];
    const clusters = simpleClustering(memories);
    expect(clusters.length).toBe(1);
    expect(clusters[0].length).toBe(1);
  });

  test('内容相似的记忆应被聚到同一组', () => {
    const memories = [
      createMockMemory({ id: 1, content: '早上 8 点 导航 去 公司' }),
      createMockMemory({ id: 2, content: '早上 8 点 导航 去 公司 上班' }),
      createMockMemory({ id: 3, content: '早上 导航 去 公司' }),
    ];
    const clusters = simpleClustering(memories, 0.3);
    // 这三条记忆内容高度相似，应该在同一个聚类中
    const maxClusterSize = Math.max(...clusters.map(c => c.length));
    expect(maxClusterSize).toBeGreaterThanOrEqual(2);
  });

  test('内容完全不同的记忆应被分到不同组', () => {
    const memories = [
      createMockMemory({ id: 1, content: '喜欢蓝色' }),
      createMockMemory({ id: 2, content: '生日是十月一日国庆节' }),
      createMockMemory({ id: 3, content: '妻子叫小红在北京工作' }),
    ];
    const clusters = simpleClustering(memories, 0.5);
    // 高阈值下，不相似的记忆应该各自一组
    expect(clusters.length).toBeGreaterThanOrEqual(2);
  });

  test('阈值为 0 时所有记忆应聚为一组', () => {
    const memories = [
      createMockMemory({ id: 1, content: 'abc' }),
      createMockMemory({ id: 2, content: 'xyz' }),
    ];
    const clusters = simpleClustering(memories, 0);
    expect(clusters.length).toBe(1);
    expect(clusters[0].length).toBe(2);
  });

  test('阈值为 1 时每条记忆应各自一组', () => {
    const memories = [
      createMockMemory({ id: 1, content: '喜欢蓝色' }),
      createMockMemory({ id: 2, content: '喜欢红色' }),
    ];
    const clusters = simpleClustering(memories, 1.0);
    expect(clusters.length).toBe(2);
  });
});

// ============================================================
// 巩固任务执行测试
// ============================================================

describe('runConsolidation - 巩固任务执行', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('情景记忆不足 5 条时应跳过巩固', async () => {
    const memories = [
      createMockMemory({ id: 1, kind: 'episodic' }),
      createMockMemory({ id: 2, kind: 'episodic' }),
    ];
    mockedDal.getAllMemories.mockResolvedValue(memories);

    const result = await runConsolidation(100);
    expect(result.message).toContain('不足');
    expect(result.newSemanticMemories).toBe(0);
    expect(result.newBehaviorPatterns).toBe(0);
  });

  test('应正确解析 LLM 返回的行为模式', async () => {
    const memories = Array.from({ length: 10 }, (_, i) =>
      createMockMemory({
        id: i + 1,
        kind: 'episodic',
        content: `早上 8 点 导航 去 公司 记录 ${i}`,
      })
    );
    mockedDal.getAllMemories.mockResolvedValue(memories);
    mockedDal.addMemory.mockResolvedValue(100);
    mockedDal.addBehaviorPattern.mockResolvedValue(200);

    const mockLLM = jest.fn().mockResolvedValue(
      '【行为模式】用户习惯在早上8点导航去公司通勤\n【核心事实】关于通勤的核心结论是用户每天早上8点开车上班'
    );

    const result = await runConsolidation(100, mockLLM);
    expect(result.newBehaviorPatterns).toBeGreaterThanOrEqual(1);
    expect(result.newSemanticMemories).toBeGreaterThanOrEqual(1);
    expect(mockedDal.addBehaviorPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 100,
        patternType: 'llm_discovered',
        confidence: 0.8,
      })
    );
  });

  test('LLM 返回"无有效模式"时不应创建新记录', async () => {
    const memories = Array.from({ length: 10 }, (_, i) =>
      createMockMemory({
        id: i + 1,
        kind: 'episodic',
        content: `完全不同的随机内容 ${i} ${Math.random()}`,
      })
    );
    mockedDal.getAllMemories.mockResolvedValue(memories);

    const mockLLM = jest.fn().mockResolvedValue('无有效模式');
    const result = await runConsolidation(100, mockLLM);
    expect(result.newSemanticMemories).toBe(0);
    expect(result.newBehaviorPatterns).toBe(0);
  });

  test('非情景记忆应被过滤', async () => {
    const memories = [
      createMockMemory({ id: 1, kind: 'semantic' }),
      createMockMemory({ id: 2, kind: 'semantic' }),
      createMockMemory({ id: 3, kind: 'persona' }),
      createMockMemory({ id: 4, kind: 'episodic' }),
      createMockMemory({ id: 5, kind: 'episodic' }),
    ];
    mockedDal.getAllMemories.mockResolvedValue(memories);

    const result = await runConsolidation(100);
    // 只有 2 条情景记忆，不足 5 条，应跳过
    expect(result.message).toContain('不足');
  });
});
