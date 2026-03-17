/**
 * Reflect 综合推理服务 (Reflect Service)
 *
 * 在混合检索（BM25 + 向量）返回候选记忆列表后，
 * 使用 LLM 对候选记忆进行综合推理和二次筛选，
 * 生成一段精炼的、与当前查询高度相关的上下文摘要。
 *
 * 设计要点：
 * - 通过环境变量 MEMORY_REFLECT_ENABLED 控制是否启用（默认关闭）
 * - 仅在 hybrid 检索策略下生效
 * - 增加约 0.5-1.5 秒的额外延迟（取决于 LLM 响应速度）
 * - 如果 LLM 调用失败，优雅降级为直接格式化输出
 */

import { Memory } from '../data/dal';

// ============================================================
// Reflect Prompt
// ============================================================

const REFLECT_PROMPT = `你是一个智能记忆助手。你的任务是根据用户的当前查询，从一组候选记忆中筛选并综合出最相关的上下文信息。

**规则：**
1. 仔细阅读用户的查询意图。
2. 从候选记忆中挑选出与查询直接相关或间接有用的记忆。
3. 将挑选出的记忆整合为一段连贯、简洁的上下文描述（不超过 500 字）。
4. 如果候选记忆中没有与查询相关的内容，请回复"无相关记忆"。
5. 不要编造任何不在候选记忆中的信息。
6. 优先保留事实性信息（如姓名、日期、偏好），其次是行为模式和经历。

**用户查询：**
{query}

**候选记忆列表：**
{memories}

**请输出精炼后的上下文：**`;

// ============================================================
// 公共接口
// ============================================================

/**
 * 判断 Reflect 功能是否启用
 */
export function isReflectEnabled(): boolean {
  return process.env.MEMORY_REFLECT_ENABLED === 'true';
}

/**
 * 对候选记忆列表执行 Reflect 综合推理
 *
 * @param query 用户的当前查询
 * @param candidateMemories 混合检索返回的候选记忆列表
 * @param callLLM 可选的 LLM 调用函数（用于测试注入）
 * @returns 精炼后的上下文字符串
 */
export async function reflectOnMemories(
  query: string,
  candidateMemories: Memory[],
  callLLM?: (prompt: string) => Promise<string>
): Promise<string> {
  if (candidateMemories.length === 0) {
    return '';
  }

  // 构建候选记忆的文本表示
  const memoriesText = candidateMemories
    .map((m, idx) => `${idx + 1}. [${m.kind}/${m.type}] ${m.content}`)
    .join('\n');

  // 构建完整的 Prompt
  const prompt = REFLECT_PROMPT
    .replace('{query}', query)
    .replace('{memories}', memoriesText);

  console.log(`[SmartMem Reflect] 开始综合推理，候选记忆数: ${candidateMemories.length}`);

  try {
    let response: string;

    if (callLLM) {
      response = await callLLM(prompt);
    } else {
      response = await defaultCallLLM(prompt);
    }

    // 检查 LLM 是否返回了有效结果
    if (!response || response.trim() === '' || response.includes('无相关记忆')) {
      console.log('[SmartMem Reflect] LLM 未找到相关记忆，返回空上下文');
      return '';
    }

    console.log(`[SmartMem Reflect] 综合推理完成，输出长度: ${response.length}`);
    return response.trim();
  } catch (error) {
    // 优雅降级：如果 LLM 调用失败，回退到简单格式化
    console.error('[SmartMem Reflect] LLM 调用失败，降级为直接格式化:', error);
    return fallbackFormat(candidateMemories);
  }
}

// ============================================================
// 内部函数
// ============================================================

/**
 * 降级格式化：当 LLM 调用失败时，直接将候选记忆拼接为上下文
 */
function fallbackFormat(memoryList: Memory[]): string {
  return memoryList
    .map(m => `[${m.kind}/${m.type}] ${m.content}`)
    .join('\n');
}

/**
 * 默认的 LLM 调用实现
 * 使用 OpenAI 兼容的 API
 */
async function defaultCallLLM(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[SmartMem Reflect] 未配置 OPENAI_API_KEY，降级为直接格式化');
    throw new Error('OPENAI_API_KEY 未配置');
  }

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
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API 返回错误: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
