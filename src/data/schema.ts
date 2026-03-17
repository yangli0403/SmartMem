import { mysqlTable, int, varchar, timestamp, json, float, text } from 'drizzle-orm/mysql-core';

export const memories = mysqlTable(
  "memories",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    content: text("content").notNull(),
    importance: float("importance").notNull().default(0.5),
    kind: varchar("kind", { length: 50 }).notNull().default('episodic'), // 'episodic', 'semantic', 'persona'
    type: varchar("type", { length: 50 }).notNull().default('fact'), // 'fact', 'preference', 'experience'
    source: varchar("source", { length: 100 }).default('conversation'), // 'conversation', 'consolidation'
    embedding: json("embedding").$type<number[]>(),
    accessCount: int("access_count").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastAccessedAt: timestamp("last_accessed_at").defaultNow().notNull(),
    validFrom: timestamp("valid_from"),
    validUntil: timestamp("valid_until"),
  }
);

export const behaviorPatterns = mysqlTable(
  "behavior_patterns",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    patternType: varchar("pattern_type", { length: 100 }).notNull(), // e.g., 'commute', 'morning_routine'
    description: text("description").notNull(),
    confidence: float("confidence").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }
);
