/**
 * 动态遗忘服务 (Forgetting Service)
 *
 * 基于艾宾浩斯遗忘曲线的指数衰减模型，替代原有的固定阈值删除策略。
 *
 * 核心公式：
 *   accessFactor = ln(accessCount + 1) + 1
 *   decayRate = 0.05 / (accessFactor * (importance + 0.1))
 *   newImportance = importance * exp(-decayRate * daysSinceLastAccess)
 *
 * 特点：
 * - 访问越频繁，衰减越慢（习惯记忆不易遗忘）
 * - 初始重要性越高，衰减越慢（关键记忆不易遗忘）
 * - persona 类型的记忆不参与遗忘（核心人格信息永久保留）
 */

import {
  getAllMemories,
  updateMemoryImportance,
  deleteMemory,
  Memory,
} from '../data/dal';

// ============================================================
// 类型定义
// ============================================================

/** 遗忘结果 */
export interface ForgettingResult {
  processedCount: number;
  decayedCount: number;
  deletedCount: number;
  message: string;
}

/** 遗忘配置 */
export interface ForgettingConfig {
  /** 硬删除阈值：重要性低于此值的记忆将被删除 */
  deleteThreshold: number;
  /** 基础衰减率 */
  baseDecayRate: number;
  /** 是否跳过 persona 类型的记忆 */
  skipPersona: boolean;
  /** 是否跳过 consolidation 来源的记忆 */
  skipConsolidated: boolean;
}

/** 默认遗忘配置 */
const DEFAULT_CONFIG: ForgettingConfig = {
  deleteThreshold: 0.1,
  baseDecayRate: 0.05,
  skipPersona: true,
  skipConsolidated: true,
};

// ============================================================
// 公共接口
// ============================================================

/**
 * 执行动态遗忘
 * 通常由定时任务（如每天凌晨）触发
 */
export async function runForgetting(
  userId: number,
  config: Partial<ForgettingConfig> = {}
): Promise<ForgettingResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  console.log(`[SmartMem] 开始为用户 ${userId} 执行动态遗忘...`);

  const result: ForgettingResult = {
    processedCount: 0,
    decayedCount: 0,
    deletedCount: 0,
    message: '',
  };

  // 获取用户所有记忆
  const allMemories = await getAllMemories(userId, 500);
  const now = new Date();

  for (const memory of allMemories) {
    // 跳过 persona 类型的记忆
    if (cfg.skipPersona && memory.kind === 'persona') continue;

    // 跳过巩固生成的记忆
    if (cfg.skipConsolidated && memory.source === 'consolidation') continue;

    result.processedCount++;

    // 计算自上次访问以来的天数
    const lastAccessed = new Date(memory.lastAccessedAt);
    const daysSinceLastAccess = (now.getTime() - lastAccessed.getTime()) / (1000 * 3600 * 24);

    // 如果最近访问过（1天内），跳过衰减
    if (daysSinceLastAccess < 1) continue;

    // 计算动态衰减
    const newImportance = calculateDecayedImportance(
      memory.importance,
      memory.accessCount,
      daysSinceLastAccess,
      cfg.baseDecayRate
    );

    // 决定更新还是删除
    if (newImportance < cfg.deleteThreshold) {
      await deleteMemory(memory.id);
      result.deletedCount++;
      console.log(`[SmartMem] 删除记忆 id=${memory.id}: 重要性衰减至 ${newImportance.toFixed(4)}`);
    } else if (Math.abs(newImportance - memory.importance) > 0.001) {
      await updateMemoryImportance(memory.id, newImportance);
      result.decayedCount++;
    }
  }

  result.message = `遗忘完成。处理 ${result.processedCount} 条，衰减 ${result.decayedCount} 条，删除 ${result.deletedCount} 条。`;
  console.log(`[SmartMem] ${result.message}`);
  return result;
}

// ============================================================
// 核心算法
// ============================================================

/**
 * 计算衰减后的重要性
 *
 * 基于艾宾浩斯遗忘曲线的指数衰减模型：
 * - accessFactor: 访问频率因子，访问越多衰减越慢
 * - decayRate: 动态衰减率，受访问频率和初始重要性影响
 * - newImportance: 衰减后的新重要性
 */
export function calculateDecayedImportance(
  currentImportance: number,
  accessCount: number,
  daysSinceLastAccess: number,
  baseDecayRate: number = 0.05
): number {
  // 访问频率因子：ln(accessCount + 1) + 1
  // accessCount=0 → factor=1, accessCount=10 → factor≈3.4
  const accessFactor = Math.log(accessCount + 1) + 1;

  // 动态衰减率：基础衰减率 / (访问因子 * (重要性 + 0.1))
  // 访问越多、重要性越高，衰减越慢
  const decayRate = baseDecayRate / (accessFactor * (currentImportance + 0.1));

  // 指数衰减
  const newImportance = currentImportance * Math.exp(-decayRate * daysSinceLastAccess);

  return Math.max(0, newImportance);
}
