/**
 * 写入/更新服务 (Write/Update Service)
 *
 * 负责接收新记忆数据，生成嵌入向量，并持久化到数据库。
 */

import { addMemory, CreateMemoryInput } from '../data/dal';
import { generateEmbedding } from './retrievalOrchestrator';

// ============================================================
// 类型定义
// ============================================================

/** 写入记忆的请求参数 */
export interface WriteMemoryRequest {
  userId: number;
  content: string;
  importance?: number;
  kind?: string;
  type?: string;
  validFrom?: string | null;   // YYYY-MM-DD HH:mm:ss
  validUntil?: string | null;  // YYYY-MM-DD HH:mm:ss
}

/** 写入记忆的响应 */
export interface WriteMemoryResponse {
  id: number;
  message: string;
}

// ============================================================
// 核心逻辑
// ============================================================

/**
 * 处理记忆写入请求
 *
 * 1. 验证输入参数
 * 2. 生成嵌入向量（如果启用了混合检索策略）
 * 3. 解析时序有效性窗口
 * 4. 持久化到数据库
 */
export async function writeMemory(request: WriteMemoryRequest): Promise<WriteMemoryResponse> {
  // 1. 参数验证
  if (!request.userId || !request.content) {
    throw new Error('userId 和 content 为必填字段');
  }

  if (request.importance !== undefined && (request.importance < 0 || request.importance > 1)) {
    throw new Error('importance 必须在 0 到 1 之间');
  }

  // 2. 根据检索策略决定是否生成嵌入向量
  let embedding: number[] | undefined;
  const strategy = process.env.MEMORY_RETRIEVAL_STRATEGY || 'simple';

  if (strategy === 'hybrid') {
    console.log('[SmartMem] 混合模式已启用，为新记忆生成嵌入向量...');
    embedding = await generateEmbedding(request.content);
  }

  // 3. 解析时序有效性窗口
  const validFrom = request.validFrom ? new Date(request.validFrom) : null;
  const validUntil = request.validUntil ? new Date(request.validUntil) : null;

  // 验证时间窗口的合理性
  if (validFrom && validUntil && validFrom >= validUntil) {
    throw new Error('validFrom 必须早于 validUntil');
  }

  // 4. 构建输入并持久化
  const input: CreateMemoryInput = {
    userId: request.userId,
    content: request.content,
    importance: request.importance ?? 0.5,
    kind: request.kind ?? 'episodic',
    type: request.type ?? 'fact',
    source: 'conversation',
    embedding,
    validFrom,
    validUntil,
  };

  const id = await addMemory(input);

  console.log(`[SmartMem] 新记忆已创建: id=${id}, userId=${request.userId}, kind=${input.kind}, type=${input.type}`);

  return {
    id,
    message: '记忆创建成功',
  };
}
