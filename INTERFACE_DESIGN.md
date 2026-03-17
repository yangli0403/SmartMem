# 接口与数据结构定义

## 1. API 端点

### `GET /context`

- **描述**: 根据用户当前对话查询，检索并返回最相关的上下文信息。
- **查询参数**:
  - `userId` (number, required): 用户 ID。
  - `query` (string, required): 当前对话的查询内容。
- **成功响应 (200 OK)**:
  ```json
  {
    "context": "string"
  }
  ```

### `POST /memory`

- **描述**: 创建或更新一条记忆。
- **请求体**:
  ```json
  {
    "userId": "number",
    "content": "string",
    "importance": "number",
    "kind": "'episodic' | 'semantic' | 'persona'",
    "type": "'fact' | 'preference' | 'experience'",
    "validFrom": "string (YYYY-MM-DD HH:mm:ss)",
    "validUntil": "string (YYYY-MM-DD HH:mm:ss)"
  }
  ```
- **成功响应 (201 Created)**:
  ```json
  {
    "id": "number",
    "message": "Memory created/updated successfully"
  }
  ```

### `POST /consolidate`

- **描述**: 手动触发指定用户的记忆巩固任务。
- **请求体**:
  ```json
  {
    "userId": "number"
  }
  ```
- **成功响应 (202 Accepted)**:
  ```json
  {
    "message": "Consolidation task accepted and will run in the background."
  }
  ```

## 2. 数据库 Schema (Drizzle ORM)

```typescript
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
```

## 3. 初始代码框架

```bash
# 创建目录结构
mkdir -p src/api src/core src/services src/data

# 创建核心文件
touch src/api/server.ts
touch src/core/retrievalOrchestrator.ts
touch src/core/writeService.ts
touch src/services/consolidationService.ts
touch src/services/forgettingService.ts
touch src/data/schema.ts
touch src/data/dal.ts
touch .env.example
touch tsconfig.json
touch package.json
```
