/**
 * 记忆巩固服务 (Consolidation Service)
 *
 * 支持两种触发方式：
 * 1. 定期扫描（后台定时任务）
 * 2. 手动触发（通过 API 调用 /consolidate）
 *
 * 核心逻辑：
 * - 扫描用户的零散情景记忆
 * - 使用 LLM 分析并提炼高阶的语义记忆和行为模式
 * - 将结果写入 memories 表（语义记忆）和 behaviorPatterns 表（行为模式）
 */

import {
  getAllMemories,
  addMemory,
  addBehaviorPattern,
  Memory,
} from '../data/dal';
import { cosineSimilarity, generateEmbedding } from '../core/retrievalOrchestrator';

// ============================================================
// 巩固 Prompt
// ============================================================

const CONSOLIDATION_PROMPT = `你是一个顶级的行为分析师和信息总结专家。请分析以下用户在过去一段时间内的零散记忆记录，并尝试从中提炼出更高层次的、持久的"行为模式"或"核心事实总结"。

分析规则：
1. **识别行为模式**：如果多条记录描述了在特定时间、特定条件下发生的重复行为（如通勤、购物、娱乐习惯），请总结为一条"行为模式"记录。格式：【行为模式】用户习惯在[时间/条件]做[事情]。
2. **总结核心事实**：如果多条记录围绕同一个主题（如对某个项目、人物、地点的看法），请总结为一条"核心事实"记录。格式：【核心事实】关于[主题]的核心结论是[结论]。
3. **无法总结**：如果这些记录过于零散，无法提炼出有价值的模式或事实，请回复"无有效模式"。

请一次性输出所有发现的模式和事实，每条占一行。

待分析的记忆记录：
{memory_context}`;

// ============================================================
// 公共接口
// ============================================================

/** 巩固结果 */
export interface ConsolidationResult {
  newSemanticMemories: number;
  newBehaviorPatterns: number;
  message: string;
}

/**
 * 执行记忆巩固
 * 可由定时任务或 API 手动触发
 */
export async function runConsolidation(
  userId: number,
  callLLM?: (prompt: string) => Promise<string>
): Promise<ConsolidationResult> {
  console.log(`[SmartMem] 开始为用户 ${userId} 执行记忆巩固...`);

  const result: ConsolidationResult = {
    newSemanticMemories: 0,
    newBehaviorPatterns: 0,
    message: '',
  };

  // 1. 获取用户的情景记忆
  const allMemories = await getAllMemories(userId, 200);
  const episodicMemories = allMemories.filter(m => m.kind === 'episodic');

  if (episodicMemories.length < 5) {
    result.message = '情景记忆数量不足（少于5条），暂不进行巩固。';
    console.log(`[SmartMem] ${result.message}`);
    return result;
  }

  // 2. 按内容相似度进行简单聚类
  const clusters = simpleClustering(episodicMemories, 0.3);

  // 3. 对每个有效聚类调用 LLM 进行提炼
  for (const cluster of clusters) {
    if (cluster.length < 3) continue; // 少于3条相似记忆，不巩固

    const context = cluster.map(m => `- [${m.type}] ${m.content}`).join('\n');
    const prompt = CONSOLIDATION_PROMPT.replace('{memory_context}', context);

    let llmResponse: string;
    if (callLLM) {
      llmResponse = await callLLM(prompt);
    } else {
      // 默认使用内置的 LLM 调用（需要配置 OPENAI_API_KEY）
      llmResponse = await defaultCallLLM(prompt);
    }

    // 4. 解析 LLM 的响应
    const lines = llmResponse.split('\n').filter(l => l.trim().length > 0);

    for (const line of lines) {
      if (line.includes('无有效模式')) continue;

      if (line.includes('【行为模式】')) {
        const description = line.replace(/.*【行为模式】/, '').trim();
        if (description.length > 0) {
          await addBehaviorPattern({
            userId,
            patternType: 'llm_discovered',
            description,
            confidence: 0.8,
          });
          result.newBehaviorPatterns++;
          console.log(`[SmartMem] 新行为模式: ${description}`);
        }
      } else if (line.includes('【核心事实】')) {
        const content = line.replace(/.*【核心事实】/, '').trim();
        if (content.length > 0) {
          await addMemory({
            userId,
            kind: 'semantic',
            type: 'fact',
            content,
            importance: 0.9,
            source: 'consolidation',
          });
          result.newSemanticMemories++;
          console.log(`[SmartMem] 新语义记忆: ${content}`);
        }
      }
    }
  }

  result.message = `巩固完成。新增 ${result.newSemanticMemories} 条语义记忆，${result.newBehaviorPatterns} 条行为模式。`;
  console.log(`[SmartMem] ${result.message}`);
  return result;
}

// ============================================================
// 简单聚类算法
// ============================================================

/**
 * 基于内容相似度的简单聚类
 * 使用贪心算法将相似的记忆分到同一组
 */
export function simpleClustering(
  memoryList: Memory[],
  similarityThreshold: number = 0.3
): Memory[][] {
  if (memoryList.length === 0) return [];

  const clusters: Memory[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < memoryList.length; i++) {
    if (assigned.has(i)) continue;

    const cluster: Memory[] = [memoryList[i]];
    assigned.add(i);

    for (let j = i + 1; j < memoryList.length; j++) {
      if (assigned.has(j)) continue;

      // 使用简单的词重叠度作为相似度度量
      const similarity = wordOverlapSimilarity(
        memoryList[i].content,
        memoryList[j].content
      );

      if (similarity >= similarityThreshold) {
        cluster.push(memoryList[j]);
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * 计算两段文本的词重叠相似度
 */
function wordOverlapSimilarity(textA: string, textB: string): number {
  const wordsA = new Set(textA.toLowerCase().split(/\s+/));
  const wordsB = new Set(textB.toLowerCase().split(/\s+/));

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

// ============================================================
// 默认 LLM 调用
// ============================================================

/**
 * 默认的 LLM 调用实现
 * 使用 OpenAI 兼容的 API
 */
async function defaultCallLLM(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[SmartMem] 未配置 OPENAI_API_KEY，返回空结果');
    return '无有效模式';
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '无有效模式';
  } catch (error) {
    console.error('[SmartMem] LLM 调用失败:', error);
    return '无有效模式';
  }
}
