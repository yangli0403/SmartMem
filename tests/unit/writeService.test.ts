/**
 * 写入/更新服务 (writeService) 单元测试
 *
 * 测试覆盖：
 * - 参数验证（必填字段、importance 范围）
 * - 时序有效性窗口解析与验证
 * - 嵌入向量生成（根据检索策略）
 * - 成功写入记忆
 */

import { writeMemory, WriteMemoryRequest } from '../../src/core/writeService';
import * as dal from '../../src/data/dal';
import * as orchestrator from '../../src/core/retrievalOrchestrator';

jest.mock('../../src/data/dal');
jest.mock('../../src/core/retrievalOrchestrator');

const mockedDal = dal as jest.Mocked<typeof dal>;
const mockedOrchestrator = orchestrator as jest.Mocked<typeof orchestrator>;

// ============================================================
// 参数验证测试
// ============================================================

describe('writeMemory - 参数验证', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MEMORY_RETRIEVAL_STRATEGY = 'simple';
  });

  test('缺少 userId 应抛出错误', async () => {
    const request = { content: '测试内容' } as WriteMemoryRequest;
    await expect(writeMemory(request)).rejects.toThrow('userId 和 content 为必填字段');
  });

  test('缺少 content 应抛出错误', async () => {
    const request = { userId: 1 } as WriteMemoryRequest;
    await expect(writeMemory(request)).rejects.toThrow('userId 和 content 为必填字段');
  });

  test('空 content 应抛出错误', async () => {
    const request: WriteMemoryRequest = { userId: 1, content: '' };
    await expect(writeMemory(request)).rejects.toThrow('userId 和 content 为必填字段');
  });

  test('importance 小于 0 应抛出错误', async () => {
    const request: WriteMemoryRequest = {
      userId: 1,
      content: '测试',
      importance: -0.1,
    };
    await expect(writeMemory(request)).rejects.toThrow('importance 必须在 0 到 1 之间');
  });

  test('importance 大于 1 应抛出错误', async () => {
    const request: WriteMemoryRequest = {
      userId: 1,
      content: '测试',
      importance: 1.5,
    };
    await expect(writeMemory(request)).rejects.toThrow('importance 必须在 0 到 1 之间');
  });
});

// ============================================================
// 时序有效性窗口测试
// ============================================================

describe('writeMemory - 时序有效性窗口', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MEMORY_RETRIEVAL_STRATEGY = 'simple';
    mockedDal.addMemory.mockResolvedValue(1);
  });

  test('validFrom 晚于 validUntil 应抛出错误', async () => {
    const request: WriteMemoryRequest = {
      userId: 1,
      content: '测试',
      validFrom: '2026-12-31 00:00:00',
      validUntil: '2026-01-01 00:00:00',
    };
    await expect(writeMemory(request)).rejects.toThrow('validFrom 必须早于 validUntil');
  });

  test('有效的时间窗口应正常写入', async () => {
    const request: WriteMemoryRequest = {
      userId: 1,
      content: '下周去北京出差',
      validFrom: '2026-03-20 00:00:00',
      validUntil: '2026-03-27 00:00:00',
    };
    const result = await writeMemory(request);
    expect(result.id).toBe(1);
    expect(result.message).toBe('记忆创建成功');
  });

  test('不设置时间窗口应正常写入', async () => {
    const request: WriteMemoryRequest = {
      userId: 1,
      content: '喜欢喝拿铁',
    };
    const result = await writeMemory(request);
    expect(result.id).toBe(1);
    expect(mockedDal.addMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        validFrom: null,
        validUntil: null,
      })
    );
  });
});

// ============================================================
// 嵌入向量生成测试
// ============================================================

describe('writeMemory - 嵌入向量生成', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDal.addMemory.mockResolvedValue(1);
  });

  test('simple 策略不应生成嵌入向量', async () => {
    process.env.MEMORY_RETRIEVAL_STRATEGY = 'simple';
    const request: WriteMemoryRequest = { userId: 1, content: '测试内容' };
    await writeMemory(request);
    expect(mockedOrchestrator.generateEmbedding).not.toHaveBeenCalled();
  });

  test('hybrid 策略应生成嵌入向量', async () => {
    process.env.MEMORY_RETRIEVAL_STRATEGY = 'hybrid';
    mockedOrchestrator.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

    const request: WriteMemoryRequest = { userId: 1, content: '测试内容' };
    await writeMemory(request);
    expect(mockedOrchestrator.generateEmbedding).toHaveBeenCalledWith('测试内容');
    expect(mockedDal.addMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        embedding: [0.1, 0.2, 0.3],
      })
    );
  });
});

// ============================================================
// 成功写入测试
// ============================================================

describe('writeMemory - 成功写入', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MEMORY_RETRIEVAL_STRATEGY = 'simple';
    mockedDal.addMemory.mockResolvedValue(42);
  });

  test('应使用默认值写入记忆', async () => {
    const request: WriteMemoryRequest = { userId: 1, content: '喜欢蓝色' };
    const result = await writeMemory(request);

    expect(result).toEqual({ id: 42, message: '记忆创建成功' });
    expect(mockedDal.addMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        content: '喜欢蓝色',
        importance: 0.5,
        kind: 'episodic',
        type: 'fact',
        source: 'conversation',
      })
    );
  });

  test('应使用自定义参数写入记忆', async () => {
    const request: WriteMemoryRequest = {
      userId: 1,
      content: '用户的妻子叫小红',
      importance: 0.9,
      kind: 'persona',
      type: 'fact',
    };
    const result = await writeMemory(request);
    expect(result.id).toBe(42);
    expect(mockedDal.addMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'persona',
        type: 'fact',
        importance: 0.9,
      })
    );
  });
});
