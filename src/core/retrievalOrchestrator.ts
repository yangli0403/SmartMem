/**
 * 检索协调器 (Retrieval Orchestrator)
 *
 * 根据环境变量 MEMORY_RETRIEVAL_STRATEGY 选择检索策略：
 * - 'simple' (默认): 使用 SQL LIKE 关键词匹配
 * - 'hybrid': 使用 BM25 + 向量检索 + 可选的 Reflect 综合推理
 */

import MiniSearch from 'mini-search';
import {
  searchMemories,
  getAllMemories,
  Memory,
} from '../data/dal';
import { isReflectEnabled, reflectOnMemories } from '../services/reflectService';

// ============================================================
// 公共接口
// ============================================================

/**
 * 获取格式化的记忆上下文
 * 这是外部调用的唯一入口。
 */
export async function getFormattedMemoryContext(
  userId: number,
  query: string,
  maxLength: number = 2000
): Promise<string> {
  const strategy = process.env.MEMORY_RETRIEVAL_STRATEGY || 'simple';

  if (strategy === 'hybrid') {
    console.log('[SmartMem] 使用混合检索策略');
    return hybridRetrieval(userId, query, maxLength);
  } else {
    console.log('[SmartMem] 使用简单检索策略');
    return simpleRetrieval(userId, query, maxLength);
  }
}

// ============================================================
// 简单检索 (Simple Retrieval)
// ============================================================

/**
 * 简单检索：直接使用 SQL LIKE 查询
 */
async function simpleRetrieval(
  userId: number,
  query: string,
  maxLength: number
): Promise<string> {
  const relevantMemories = await searchMemories({
    userId,
    query,
    limit: 15,
    minImportance: 0.3,
  });

  return formatMemoriesForContext(relevantMemories, maxLength);
}

// ============================================================
// 混合检索 (Hybrid Retrieval)
// ============================================================

/**
 * 混合检索：BM25 + 向量检索，合并去重后可选 Reflect 综合推理
 *
 * 流程：
 * 1. 获取用户所有有效记忆
 * 2. 并行执行 BM25 和向量检索
 * 3. 合并去重
 * 4. 如果 Reflect 已启用，调用 LLM 进行综合推理
 * 5. 否则直接格式化输出
 */
async function hybridRetrieval(
  userId: number,
  query: string,
  maxLength: number
): Promise<string> {
  // 1. 获取用户所有有效记忆
  const allMemories = await getAllMemories(userId, 200);
  if (allMemories.length === 0) return '';

  // 2. 并行执行 BM25 和向量检索
  const [bm25Results, vectorResults] = await Promise.all([
    bm25Search(allMemories, query, 10),
    vectorSearch(allMemories, query, 10),
  ]);

  // 3. 合并去重（按 ID 去重，保留两路结果中较高的排名）
  const mergedMap = new Map<number, Memory>();
  for (const mem of [...bm25Results, ...vectorResults]) {
    if (!mergedMap.has(mem.id)) {
      mergedMap.set(mem.id, mem);
    }
  }
  const mergedResults = Array.from(mergedMap.values());

  // 4. 按重要性排序
  mergedResults.sort((a, b) => b.importance - a.importance);

  // 5. 如果 Reflect 已启用，调用 LLM 进行综合推理
  if (isReflectEnabled()) {
    console.log('[SmartMem] Reflect 综合推理已启用，调用 LLM...');
    const reflectedContext = await reflectOnMemories(query, mergedResults);
    if (reflectedContext && reflectedContext.length > 0) {
      return reflectedContext;
    }
    // 如果 Reflect 返回空结果，降级为直接格式化
    console.log('[SmartMem] Reflect 返回空结果，降级为直接格式化');
  }

  return formatMemoriesForContext(mergedResults, maxLength);
}

// ============================================================
// BM25 检索器
// ============================================================

/**
 * 使用 mini-search 进行 BM25 全文搜索
 */
async function bm25Search(
  allMemories: Memory[],
  query: string,
  topK: number
): Promise<Memory[]> {
  if (allMemories.length === 0) return [];

  const miniSearch = new MiniSearch({
    fields: ['content'],
    storeFields: ['id'],
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
    },
  });

  // 构建索引
  const docs = allMemories.map(m => ({
    id: m.id,
    content: m.content,
  }));
  miniSearch.addAll(docs);

  // 执行搜索
  const searchResults = miniSearch.search(query);
  const resultIds = new Set(searchResults.slice(0, topK).map(r => r.id));

  return allMemories.filter(m => resultIds.has(m.id));
}

// ============================================================
// 向量检索器
// ============================================================

/**
 * 向量检索：基于余弦相似度的内存暴力搜索
 * MVP 阶段使用内存计算，后续可升级为 pgvector 等方案。
 */
async function vectorSearch(
  allMemories: Memory[],
  query: string,
  topK: number
): Promise<Memory[]> {
  // 过滤出有嵌入向量的记忆
  const memoriesWithEmbedding = allMemories.filter(
    m => m.embedding && Array.isArray(m.embedding) && m.embedding.length > 0
  );

  if (memoriesWithEmbedding.length === 0) {
    console.log('[SmartMem] 没有带嵌入向量的记忆，跳过向量检索');
    return [];
  }

  // 生成查询向量
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding || queryEmbedding.length === 0) {
    console.log('[SmartMem] 无法生成查询嵌入向量，跳过向量检索');
    return [];
  }

  // 计算余弦相似度并排序
  const scored = memoriesWithEmbedding.map(mem => ({
    memory: mem,
    similarity: cosineSimilarity(queryEmbedding, mem.embedding!),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, topK).map(s => s.memory);
}

// ============================================================
// 嵌入向量生成
// ============================================================

/**
 * 生成文本的嵌入向量
 * MVP 阶段使用简单的词频向量作为占位实现。
 * 生产环境应替换为 transformers.js 或 OpenAI Embedding API。
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // 简单的词频向量实现（占位）
  // 生产环境中应替换为：
  // import { pipeline } from '@xenova/transformers';
  // const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  // const output = await extractor(text, { pooling: 'mean', normalize: true });
  // return Array.from(output.data);

  const words = text.toLowerCase().split(/\s+/);
  const vocab = new Map<string, number>();
  let idx = 0;
  for (const w of words) {
    if (!vocab.has(w)) {
      vocab.set(w, idx++);
    }
  }
  const vector = new Array(Math.max(idx, 1)).fill(0);
  for (const w of words) {
    vector[vocab.get(w)!] += 1;
  }
  // 归一化
  const norm = Math.sqrt(vector.reduce((sum: number, v: number) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }
  }
  return vector;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 计算两个向量的余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const minLen = Math.min(a.length, b.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < minLen; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  // 处理长度不一致的情况
  for (let i = minLen; i < a.length; i++) normA += a[i] * a[i];
  for (let i = minLen; i < b.length; i++) normB += b[i] * b[i];

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * 将记忆列表格式化为上下文字符串
 */
export function formatMemoriesForContext(
  memoryList: Memory[],
  maxLength: number
): string {
  if (memoryList.length === 0) return '';

  let context = '';
  for (const mem of memoryList) {
    const line = `[${mem.kind}/${mem.type}] ${mem.content}\n`;
    if (context.length + line.length > maxLength) break;
    context += line;
  }

  return context.trim();
}
