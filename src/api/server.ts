/**
 * SmartMem API 服务器
 *
 * 为 SmartAgent3 提供 HTTP 接口，包括：
 * - GET  /context     — 检索记忆上下文
 * - POST /memory      — 写入新记忆
 * - POST /consolidate — 手动触发记忆巩固
 * - POST /forget      — 手动触发动态遗忘
 * - GET  /health      — 健康检查
 */

import express, { Request, Response, NextFunction } from 'express';
import { getFormattedMemoryContext } from '../core/retrievalOrchestrator';
import { writeMemory, WriteMemoryRequest } from '../core/writeService';
import { runConsolidation } from '../services/consolidationService';
import { runForgetting } from '../services/forgettingService';

const app = express();
app.use(express.json());

// ============================================================
// 健康检查
// ============================================================

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'SmartMem',
    version: '0.1.0',
    strategy: process.env.MEMORY_RETRIEVAL_STRATEGY || 'simple',
  });
});

// ============================================================
// GET /context — 检索记忆上下文
// ============================================================

app.get('/context', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.query.userId);
    const query = String(req.query.query || '');

    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: 'userId 为必填参数且必须为数字' });
      return;
    }

    if (!query) {
      res.status(400).json({ error: 'query 为必填参数' });
      return;
    }

    const context = await getFormattedMemoryContext(userId, query);
    res.json({ context });
  } catch (error: any) {
    console.error('[SmartMem] GET /context 错误:', error);
    res.status(500).json({ error: error.message || '内部服务器错误' });
  }
});

// ============================================================
// POST /memory — 写入新记忆
// ============================================================

app.post('/memory', async (req: Request, res: Response) => {
  try {
    const request: WriteMemoryRequest = req.body;
    const result = await writeMemory(request);
    res.status(201).json(result);
  } catch (error: any) {
    console.error('[SmartMem] POST /memory 错误:', error);
    if (error.message.includes('必填') || error.message.includes('必须')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || '内部服务器错误' });
    }
  }
});

// ============================================================
// POST /consolidate — 手动触发记忆巩固
// ============================================================

app.post('/consolidate', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId || typeof userId !== 'number') {
      res.status(400).json({ error: 'userId 为必填参数且必须为数字' });
      return;
    }

    // 异步执行巩固任务，立即返回 202
    res.status(202).json({
      message: '巩固任务已接受，将在后台执行。',
    });

    // 后台执行
    runConsolidation(userId).catch(err => {
      console.error(`[SmartMem] 巩固任务失败 (userId=${userId}):`, err);
    });
  } catch (error: any) {
    console.error('[SmartMem] POST /consolidate 错误:', error);
    res.status(500).json({ error: error.message || '内部服务器错误' });
  }
});

// ============================================================
// POST /forget — 手动触发动态遗忘
// ============================================================

app.post('/forget', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId || typeof userId !== 'number') {
      res.status(400).json({ error: 'userId 为必填参数且必须为数字' });
      return;
    }

    const result = await runForgetting(userId);
    res.json(result);
  } catch (error: any) {
    console.error('[SmartMem] POST /forget 错误:', error);
    res.status(500).json({ error: error.message || '内部服务器错误' });
  }
});

// ============================================================
// 全局错误处理
// ============================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[SmartMem] 未捕获的错误:', err);
  res.status(500).json({ error: '内部服务器错误' });
});

// ============================================================
// 启动服务器
// ============================================================

const PORT = Number(process.env.PORT) || 3100;

export function startServer(): void {
  app.listen(PORT, () => {
    console.log(`[SmartMem] 服务器已启动，监听端口 ${PORT}`);
    console.log(`[SmartMem] 检索策略: ${process.env.MEMORY_RETRIEVAL_STRATEGY || 'simple'}`);
  });
}

// 如果直接运行此文件，则启动服务器
if (require.main === module) {
  startServer();
}

export { app };
