/**
 * 数据访问层 (DAL)
 * 提供对 memories 和 behaviorPatterns 表的类型安全 CRUD 操作。
 */

import { eq, and, sql, gte, like, or, desc } from 'drizzle-orm';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { memories, behaviorPatterns } from './schema';

// ============================================================
// 类型定义
// ============================================================

/** 记忆记录类型 (从数据库查询返回) */
export type Memory = typeof memories.$inferSelect;

/** 创建记忆时的输入类型 */
export interface CreateMemoryInput {
  userId: number;
  content: string;
  importance?: number;
  kind?: string;
  type?: string;
  source?: string;
  embedding?: number[];
  validFrom?: Date | null;
  validUntil?: Date | null;
}

/** 搜索记忆时的选项 */
export interface SearchMemoryOptions {
  userId: number;
  query?: string;
  kind?: string;
  limit?: number;
  minImportance?: number;
  filterExpired?: boolean;
}

/** 行为模式记录类型 */
export type BehaviorPattern = typeof behaviorPatterns.$inferSelect;

/** 创建行为模式时的输入类型 */
export interface CreateBehaviorPatternInput {
  userId: number;
  patternType: string;
  description: string;
  confidence: number;
}

// ============================================================
// 数据库连接
// ============================================================

let db: MySql2Database | null = null;

/**
 * 获取数据库连接实例（单例模式）
 */
export async function getDb(): Promise<MySql2Database> {
  if (db) return db;

  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'smartmem',
  });

  db = drizzle(pool);
  return db;
}

/**
 * 设置数据库实例（用于测试时注入 mock）
 */
export function setDb(instance: MySql2Database): void {
  db = instance;
}

// ============================================================
// 记忆 CRUD 操作
// ============================================================

/**
 * 添加一条新记忆
 */
export async function addMemory(input: CreateMemoryInput): Promise<number> {
  const database = await getDb();
  const result = await database.insert(memories).values({
    userId: input.userId,
    content: input.content,
    importance: input.importance ?? 0.5,
    kind: input.kind ?? 'episodic',
    type: input.type ?? 'fact',
    source: input.source ?? 'conversation',
    embedding: input.embedding ?? null,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
  });

  return (result as any)[0].insertId;
}

/**
 * 根据 ID 获取单条记忆
 */
export async function getMemoryById(id: number): Promise<Memory | undefined> {
  const database = await getDb();
  const results = await database
    .select()
    .from(memories)
    .where(eq(memories.id, id))
    .limit(1);
  return results[0];
}

/**
 * 搜索记忆（支持关键词匹配、类型过滤、时序过滤）
 */
export async function searchMemories(options: SearchMemoryOptions): Promise<Memory[]> {
  const database = await getDb();
  const {
    userId,
    query,
    kind,
    limit = 15,
    minImportance = 0.3,
    filterExpired = true,
  } = options;

  const now = new Date();
  const conditions: any[] = [
    eq(memories.userId, userId),
    gte(memories.importance, minImportance),
  ];

  // 关键词过滤
  if (query) {
    const keywords = query.split(/\s+/).filter(k => k.length > 0);
    if (keywords.length > 0) {
      const keywordConditions = keywords.map(kw => like(memories.content, `%${kw}%`));
      conditions.push(or(...keywordConditions)!);
    }
  }

  // 类型过滤
  if (kind) {
    conditions.push(eq(memories.kind, kind));
  }

  // 时序有效性窗口过滤
  if (filterExpired) {
    conditions.push(
      sql`(${memories.validFrom} IS NULL OR ${memories.validFrom} <= ${now})`
    );
    conditions.push(
      sql`(${memories.validUntil} IS NULL OR ${memories.validUntil} >= ${now})`
    );
  }

  const results = await database
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.importance))
    .limit(limit);

  // 更新访问计数和最后访问时间
  for (const mem of results) {
    await database
      .update(memories)
      .set({
        accessCount: mem.accessCount + 1,
        lastAccessedAt: now,
      })
      .where(eq(memories.id, mem.id));
  }

  return results;
}

/**
 * 获取用户的所有记忆（用于巩固和遗忘服务）
 */
export async function getAllMemories(userId: number, limit: number = 200): Promise<Memory[]> {
  const database = await getDb();
  return database
    .select()
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt))
    .limit(limit);
}

/**
 * 更新记忆的重要性
 */
export async function updateMemoryImportance(id: number, newImportance: number): Promise<void> {
  const database = await getDb();
  await database
    .update(memories)
    .set({ importance: newImportance })
    .where(eq(memories.id, id));
}

/**
 * 删除一条记忆
 */
export async function deleteMemory(id: number): Promise<void> {
  const database = await getDb();
  await database.delete(memories).where(eq(memories.id, id));
}

// ============================================================
// 行为模式 CRUD 操作
// ============================================================

/**
 * 添加一条行为模式
 */
export async function addBehaviorPattern(input: CreateBehaviorPatternInput): Promise<number> {
  const database = await getDb();
  const result = await database.insert(behaviorPatterns).values({
    userId: input.userId,
    patternType: input.patternType,
    description: input.description,
    confidence: input.confidence,
  });
  return (result as any)[0].insertId;
}

/**
 * 获取用户的所有行为模式
 */
export async function getBehaviorPatterns(userId: number): Promise<BehaviorPattern[]> {
  const database = await getDb();
  return database
    .select()
    .from(behaviorPatterns)
    .where(eq(behaviorPatterns.userId, userId));
}
