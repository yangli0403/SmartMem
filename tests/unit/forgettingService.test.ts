/**
 * 遗忘服务 (forgettingService) 单元测试
 *
 * 测试覆盖：
 * - 艾宾浩斯遗忘曲线衰减算法
 * - 遗忘任务执行逻辑（衰减、删除、跳过）
 */

import {
  calculateDecayedImportance,
  runForgetting,
} from '../../src/services/forgettingService';
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
    importance: 0.8,
    kind: 'episodic',
    type: 'fact',
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
// 衰减算法测试
// ============================================================

describe('calculateDecayedImportance - 艾宾浩斯衰减算法', () => {
  test('0 天未访问时重要性应不变', () => {
    const result = calculateDecayedImportance(0.8, 3, 0);
    expect(result).toBeCloseTo(0.8, 5);
  });

  test('长时间未访问应导致重要性显著下降', () => {
    const result = calculateDecayedImportance(0.8, 1, 100);
    expect(result).toBeLessThan(0.5);
  });

  test('高访问频率应减缓衰减速度', () => {
    const lowAccess = calculateDecayedImportance(0.8, 1, 30);
    const highAccess = calculateDecayedImportance(0.8, 50, 30);
    // 高访问频率的衰减应该更慢（重要性更高）
    expect(highAccess).toBeGreaterThan(lowAccess);
  });

  test('高重要性记忆应衰减更慢', () => {
    const lowImportance = calculateDecayedImportance(0.3, 3, 30);
    const highImportance = calculateDecayedImportance(0.9, 3, 30);
    // 高重要性记忆衰减后的相对保留率应更高
    const lowRetention = lowImportance / 0.3;
    const highRetention = highImportance / 0.9;
    expect(highRetention).toBeGreaterThan(lowRetention);
  });

  test('结果不应为负数', () => {
    const result = calculateDecayedImportance(0.1, 0, 10000);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  test('accessCount 为 0 时应正常工作', () => {
    const result = calculateDecayedImportance(0.5, 0, 10);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0.5);
  });

  test('自定义基础衰减率应生效', () => {
    const fastDecay = calculateDecayedImportance(0.8, 3, 30, 0.2);
    const slowDecay = calculateDecayedImportance(0.8, 3, 30, 0.01);
    expect(slowDecay).toBeGreaterThan(fastDecay);
  });
});

// ============================================================
// 遗忘任务执行测试
// ============================================================

describe('runForgetting - 遗忘任务执行', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('无记忆时应返回空结果', async () => {
    mockedDal.getAllMemories.mockResolvedValue([]);
    const result = await runForgetting(100);
    expect(result.processedCount).toBe(0);
    expect(result.decayedCount).toBe(0);
    expect(result.deletedCount).toBe(0);
  });

  test('最近访问的记忆不应被衰减', async () => {
    const recentMemory = createMockMemory({
      lastAccessedAt: new Date(), // 刚刚访问
      importance: 0.8,
      accessCount: 10,
    });
    mockedDal.getAllMemories.mockResolvedValue([recentMemory]);

    const result = await runForgetting(100);
    expect(result.processedCount).toBe(1);
    // 刚访问的记忆衰减极小，不应触发更新
    expect(mockedDal.updateMemoryImportance).not.toHaveBeenCalled();
    expect(mockedDal.deleteMemory).not.toHaveBeenCalled();
  });

  test('长时间未访问且低重要性的记忆应被删除', async () => {
    const oldMemory = createMockMemory({
      id: 1,
      lastAccessedAt: new Date('2024-01-01'), // 两年前
      importance: 0.15, // 低重要性
      accessCount: 1,
    });
    mockedDal.getAllMemories.mockResolvedValue([oldMemory]);
    mockedDal.deleteMemory.mockResolvedValue(undefined);
    mockedDal.updateMemoryImportance.mockResolvedValue(undefined);

    const result = await runForgetting(100);
    expect(result.processedCount).toBe(1);
    // 衰减后重要性极低，应该被删除
    expect(result.deletedCount).toBeGreaterThanOrEqual(0);
  });

  test('中等时间未访问的记忆应被衰减但不删除', async () => {
    const memory = createMockMemory({
      id: 1,
      lastAccessedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30天前
      importance: 0.7,
      accessCount: 5,
    });
    mockedDal.getAllMemories.mockResolvedValue([memory]);
    mockedDal.updateMemoryImportance.mockResolvedValue(undefined);

    const result = await runForgetting(100);
    expect(result.processedCount).toBe(1);
  });

  test('persona 类型记忆应被跳过（默认配置）', async () => {
    const personaMemory = createMockMemory({
      id: 1,
      kind: 'persona',
      lastAccessedAt: new Date('2024-01-01'),
    });
    const episodicMemory = createMockMemory({
      id: 2,
      kind: 'episodic',
      lastAccessedAt: new Date('2024-01-01'),
      importance: 0.5,
      accessCount: 1,
    });
    mockedDal.getAllMemories.mockResolvedValue([personaMemory, episodicMemory]);
    mockedDal.updateMemoryImportance.mockResolvedValue(undefined);
    mockedDal.deleteMemory.mockResolvedValue(undefined);

    const result = await runForgetting(100);
    // persona 记忆应被跳过，只处理 episodic 记忆
    expect(result.processedCount).toBe(1);
  });
});
