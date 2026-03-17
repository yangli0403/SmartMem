/**
 * SmartMem API 服务器集成测试
 *
 * 使用 supertest 对 Express 应用进行 HTTP 级别的集成测试。
 * 测试覆盖：
 * - GET /health 健康检查
 * - GET /context 记忆上下文检索
 * - POST /memory 记忆写入
 * - POST /consolidate 记忆巩固触发
 * - POST /forget 动态遗忘触发
 * - 参数验证和错误处理
 */

import request from 'supertest';
import { app } from '../../src/api/server';
import * as dal from '../../src/data/dal';
import * as orchestrator from '../../src/core/retrievalOrchestrator';
import * as consolidationService from '../../src/services/consolidationService';
import * as forgettingService from '../../src/services/forgettingService';

jest.mock('../../src/data/dal');
jest.mock('../../src/core/retrievalOrchestrator', () => {
  const actual = jest.requireActual('../../src/core/retrievalOrchestrator');
  return {
    ...actual,
    getFormattedMemoryContext: jest.fn(),
  };
});
jest.mock('../../src/services/consolidationService');
jest.mock('../../src/services/forgettingService');

const mockedDal = dal as jest.Mocked<typeof dal>;
const mockedOrchestrator = orchestrator as jest.Mocked<typeof orchestrator>;
const mockedConsolidation = consolidationService as jest.Mocked<typeof consolidationService>;
const mockedForgetting = forgettingService as jest.Mocked<typeof forgettingService>;

// ============================================================
// GET /health 测试
// ============================================================

describe('GET /health - 健康检查', () => {
  test('应返回 200 和服务状态', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('SmartMem');
    expect(res.body.version).toBe('0.1.0');
  });
});

// ============================================================
// GET /context 测试
// ============================================================

describe('GET /context - 记忆上下文检索', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('正常请求应返回 200 和上下文', async () => {
    mockedOrchestrator.getFormattedMemoryContext.mockResolvedValue(
      '[episodic/preference] 喜欢蓝色'
    );

    const res = await request(app)
      .get('/context')
      .query({ userId: 100, query: '颜色偏好' });

    expect(res.status).toBe(200);
    expect(res.body.context).toContain('喜欢蓝色');
    expect(mockedOrchestrator.getFormattedMemoryContext).toHaveBeenCalledWith(100, '颜色偏好');
  });

  test('缺少 userId 应返回 400', async () => {
    const res = await request(app)
      .get('/context')
      .query({ query: '测试' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('userId');
  });

  test('缺少 query 应返回 400', async () => {
    const res = await request(app)
      .get('/context')
      .query({ userId: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('query');
  });

  test('userId 非数字应返回 400', async () => {
    const res = await request(app)
      .get('/context')
      .query({ userId: 'abc', query: '测试' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('userId');
  });

  test('内部错误应返回 500', async () => {
    mockedOrchestrator.getFormattedMemoryContext.mockRejectedValue(
      new Error('数据库连接失败')
    );

    const res = await request(app)
      .get('/context')
      .query({ userId: 100, query: '测试' });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('数据库连接失败');
  });
});

// ============================================================
// POST /memory 测试
// ============================================================

describe('POST /memory - 记忆写入', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MEMORY_RETRIEVAL_STRATEGY = 'simple';
  });

  test('正常请求应返回 201', async () => {
    mockedDal.addMemory.mockResolvedValue(42);

    const res = await request(app)
      .post('/memory')
      .send({
        userId: 1,
        content: '喜欢喝拿铁',
        importance: 0.8,
        kind: 'episodic',
        type: 'preference',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(42);
    expect(res.body.message).toBe('记忆创建成功');
  });

  test('缺少必填字段应返回 400', async () => {
    const res = await request(app)
      .post('/memory')
      .send({ userId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('必填');
  });

  test('importance 超出范围应返回 400', async () => {
    const res = await request(app)
      .post('/memory')
      .send({
        userId: 1,
        content: '测试',
        importance: 2.0,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('importance');
  });

  test('包含时序有效性窗口的请求应正常处理', async () => {
    mockedDal.addMemory.mockResolvedValue(43);

    const res = await request(app)
      .post('/memory')
      .send({
        userId: 1,
        content: '下周去北京出差',
        validFrom: '2026-03-20 00:00:00',
        validUntil: '2026-03-27 00:00:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(43);
  });
});

// ============================================================
// POST /consolidate 测试
// ============================================================

describe('POST /consolidate - 记忆巩固', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('正常请求应返回 202', async () => {
    mockedConsolidation.runConsolidation.mockResolvedValue({
      newSemanticMemories: 2,
      newBehaviorPatterns: 1,
      message: '巩固完成',
    });

    const res = await request(app)
      .post('/consolidate')
      .send({ userId: 100 });

    expect(res.status).toBe(202);
    expect(res.body.message).toContain('巩固任务已接受');
  });

  test('缺少 userId 应返回 400', async () => {
    const res = await request(app)
      .post('/consolidate')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('userId');
  });

  test('userId 非数字应返回 400', async () => {
    const res = await request(app)
      .post('/consolidate')
      .send({ userId: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('userId');
  });
});

// ============================================================
// POST /forget 测试
// ============================================================

describe('POST /forget - 动态遗忘', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('正常请求应返回 200 和遗忘结果', async () => {
    mockedForgetting.runForgetting.mockResolvedValue({
      processedCount: 10,
      decayedCount: 3,
      deletedCount: 1,
      message: '遗忘完成。处理 10 条，衰减 3 条，删除 1 条。',
    });

    const res = await request(app)
      .post('/forget')
      .send({ userId: 100 });

    expect(res.status).toBe(200);
    expect(res.body.processedCount).toBe(10);
    expect(res.body.decayedCount).toBe(3);
    expect(res.body.deletedCount).toBe(1);
  });

  test('缺少 userId 应返回 400', async () => {
    const res = await request(app)
      .post('/forget')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('userId');
  });

  test('内部错误应返回 500', async () => {
    mockedForgetting.runForgetting.mockRejectedValue(
      new Error('数据库连接失败')
    );

    const res = await request(app)
      .post('/forget')
      .send({ userId: 100 });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('数据库连接失败');
  });
});
