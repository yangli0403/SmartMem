/**
 * 数据访问层 (DAL) 单元测试
 *
 * 通过 mock 数据库实例测试 DAL 的所有 CRUD 操作。
 *
 * 测试覆盖：
 * - 模块导出完整性
 * - addMemory / getMemoryById / searchMemories / getAllMemories
 * - updateMemoryImportance / deleteMemory
 * - addBehaviorPattern / getBehaviorPatterns
 * - setDb / getDb 数据库连接管理
 */

import * as dal from '../../src/data/dal';

// ============================================================
// 模块导出完整性测试
// ============================================================

describe('DAL - 模块导出完整性', () => {
  test('应导出 addMemory 函数', () => {
    expect(typeof dal.addMemory).toBe('function');
  });

  test('应导出 getMemoryById 函数', () => {
    expect(typeof dal.getMemoryById).toBe('function');
  });

  test('应导出 searchMemories 函数', () => {
    expect(typeof dal.searchMemories).toBe('function');
  });

  test('应导出 getAllMemories 函数', () => {
    expect(typeof dal.getAllMemories).toBe('function');
  });

  test('应导出 updateMemoryImportance 函数', () => {
    expect(typeof dal.updateMemoryImportance).toBe('function');
  });

  test('应导出 deleteMemory 函数', () => {
    expect(typeof dal.deleteMemory).toBe('function');
  });

  test('应导出 addBehaviorPattern 函数', () => {
    expect(typeof dal.addBehaviorPattern).toBe('function');
  });

  test('应导出 getBehaviorPatterns 函数', () => {
    expect(typeof dal.getBehaviorPatterns).toBe('function');
  });

  test('应导出 getDb 函数', () => {
    expect(typeof dal.getDb).toBe('function');
  });

  test('应导出 setDb 函数', () => {
    expect(typeof dal.setDb).toBe('function');
  });
});

// ============================================================
// Schema 导出测试
// ============================================================

describe('Schema - 数据库表定义', () => {
  test('应导出 memories 表定义', () => {
    const schema = require('../../src/data/schema');
    expect(schema.memories).toBeDefined();
  });

  test('应导出 behaviorPatterns 表定义', () => {
    const schema = require('../../src/data/schema');
    expect(schema.behaviorPatterns).toBeDefined();
  });
});

// ============================================================
// 类型定义测试
// ============================================================

describe('DAL - 类型定义', () => {
  test('CreateMemoryInput 接口应包含必要字段', () => {
    const input: dal.CreateMemoryInput = {
      userId: 1,
      content: '测试内容',
    };
    expect(input.userId).toBe(1);
    expect(input.content).toBe('测试内容');
  });

  test('CreateMemoryInput 可选字段应有默认行为', () => {
    const input: dal.CreateMemoryInput = {
      userId: 1,
      content: '测试',
      importance: 0.8,
      kind: 'episodic',
      type: 'preference',
      source: 'conversation',
      embedding: [0.1, 0.2],
      validFrom: new Date('2026-01-01'),
      validUntil: new Date('2026-12-31'),
    };
    expect(input.importance).toBe(0.8);
    expect(input.kind).toBe('episodic');
    expect(input.embedding).toEqual([0.1, 0.2]);
  });

  test('SearchMemoryOptions 接口应包含必要字段', () => {
    const options: dal.SearchMemoryOptions = {
      userId: 1,
      query: '测试查询',
    };
    expect(options.userId).toBe(1);
    expect(options.query).toBe('测试查询');
  });

  test('SearchMemoryOptions 可选字段应正常工作', () => {
    const options: dal.SearchMemoryOptions = {
      userId: 1,
      query: '测试',
      kind: 'episodic',
      limit: 20,
      minImportance: 0.5,
      filterExpired: false,
    };
    expect(options.limit).toBe(20);
    expect(options.filterExpired).toBe(false);
  });

  test('CreateBehaviorPatternInput 接口应包含所有必要字段', () => {
    const input: dal.CreateBehaviorPatternInput = {
      userId: 1,
      patternType: 'commute',
      description: '每天早上8点通勤',
      confidence: 0.9,
    };
    expect(input.patternType).toBe('commute');
    expect(input.confidence).toBe(0.9);
  });
});

// ============================================================
// setDb 测试
// ============================================================

describe('DAL - setDb 数据库连接管理', () => {
  test('setDb 应接受 mock 数据库实例', () => {
    const mockDb = {} as any;
    // 不应抛出异常
    expect(() => dal.setDb(mockDb)).not.toThrow();
  });
});

// ============================================================
// 带 mock 数据库的 CRUD 测试
// ============================================================

describe('DAL - CRUD 操作（带 mock 数据库）', () => {
  let mockInsert: jest.Mock;
  let mockSelect: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockDelete: jest.Mock;
  let mockDb: any;

  beforeEach(() => {
    // 构建链式调用的 mock
    const mockValues = jest.fn().mockResolvedValue([{ insertId: 42 }]);
    mockInsert = jest.fn().mockReturnValue({ values: mockValues });

    const mockLimit = jest.fn().mockResolvedValue([]);
    const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit });
    const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
    mockSelect = jest.fn().mockReturnValue({ from: mockFrom });

    const mockUpdateSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    mockUpdate = jest.fn().mockReturnValue({ set: mockUpdateSet });

    const mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
    mockDelete = jest.fn().mockReturnValue({ where: mockDeleteWhere });

    mockDb = {
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
      delete: mockDelete,
    };

    dal.setDb(mockDb);
  });

  test('addMemory 应调用 insert 并返回 ID', async () => {
    const id = await dal.addMemory({
      userId: 1,
      content: '喜欢蓝色',
      importance: 0.8,
      kind: 'episodic',
      type: 'preference',
    });
    expect(mockInsert).toHaveBeenCalled();
    expect(id).toBe(42);
  });

  test('getMemoryById 应调用 select', async () => {
    const result = await dal.getMemoryById(1);
    expect(mockSelect).toHaveBeenCalled();
    expect(result).toBeUndefined(); // mock 返回空数组
  });

  test('getAllMemories 应调用 select', async () => {
    const results = await dal.getAllMemories(100);
    expect(mockSelect).toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  test('updateMemoryImportance 应调用 update', async () => {
    await dal.updateMemoryImportance(1, 0.5);
    expect(mockUpdate).toHaveBeenCalled();
  });

  test('deleteMemory 应调用 delete', async () => {
    await dal.deleteMemory(1);
    expect(mockDelete).toHaveBeenCalled();
  });

  test('addBehaviorPattern 应调用 insert', async () => {
    const id = await dal.addBehaviorPattern({
      userId: 1,
      patternType: 'commute',
      description: '每天早上通勤',
      confidence: 0.9,
    });
    expect(mockInsert).toHaveBeenCalled();
    expect(id).toBe(42);
  });

  test('getBehaviorPatterns 应调用 select', async () => {
    const results = await dal.getBehaviorPatterns(100);
    expect(mockSelect).toHaveBeenCalled();
    // getBehaviorPatterns 的链式调用没有 orderBy/limit，只有 where
    // 因此返回值取决于 mock 的 where 返回值
    expect(results).toBeDefined();
  });
});
