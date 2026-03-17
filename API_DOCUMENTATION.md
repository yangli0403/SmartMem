# SmartMem API 接口文档

## 概述

SmartMem 提供 RESTful HTTP API，供 SmartAgent3 及其他客户端集成使用。默认监听端口为 `3100`，可通过环境变量 `PORT` 修改。

所有请求和响应均使用 JSON 格式，字符编码为 UTF-8。

## 基础信息

| 项目 | 值 |
|------|-----|
| 基础 URL | `http://localhost:3100` |
| 协议 | HTTP |
| 数据格式 | JSON |
| 字符编码 | UTF-8 |

---

## 端点列表

### GET /health — 健康检查

检查服务运行状态。

**请求参数**：无

**响应示例**（200 OK）：

```json
{
  "status": "ok",
  "service": "SmartMem",
  "version": "0.1.0",
  "strategy": "simple"
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 服务状态，正常时为 `"ok"` |
| `service` | string | 服务名称 |
| `version` | string | 服务版本号 |
| `strategy` | string | 当前检索策略（`simple` 或 `hybrid`） |

---

### GET /context — 检索记忆上下文

根据用户 ID 和查询文本，检索相关记忆并返回格式化的上下文字符串。该上下文可直接注入到 LLM 的 Prompt 中。

**请求参数**（Query String）：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userId` | number | 是 | 用户 ID |
| `query` | string | 是 | 当前对话查询文本 |

**请求示例**：

```
GET /context?userId=1&query=咖啡偏好
```

**响应示例**（200 OK）：

```json
{
  "context": "[episodic/preference] 喜欢喝拿铁\n[episodic/preference] 不喜欢加糖"
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `context` | string | 格式化的记忆上下文，每条记忆格式为 `[kind/type] content` |

**错误响应**：

| 状态码 | 条件 | 响应示例 |
|--------|------|----------|
| 400 | 缺少 `userId` 或非数字 | `{"error": "userId 为必填参数且必须为数字"}` |
| 400 | 缺少 `query` | `{"error": "query 为必填参数"}` |
| 500 | 内部错误 | `{"error": "错误详情"}` |

---

### POST /memory — 写入新记忆

将一条新记忆写入数据库。如果当前检索策略为 `hybrid`，会自动为记忆内容生成向量嵌入。

**请求体**（JSON）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userId` | number | 是 | 用户 ID |
| `content` | string | 是 | 记忆内容文本 |
| `importance` | number | 否 | 重要性评分，范围 0.0 - 1.0，默认 0.5 |
| `kind` | string | 否 | 记忆类别：`episodic`（情景）、`semantic`（语义）、`persona`（人格），默认 `episodic` |
| `type` | string | 否 | 记忆类型：`fact`（事实）、`preference`（偏好）、`event`（事件），默认 `fact` |
| `source` | string | 否 | 来源标识，默认 `conversation` |
| `validFrom` | string | 否 | 时序有效性开始时间（ISO 8601 格式） |
| `validUntil` | string | 否 | 时序有效性结束时间（ISO 8601 格式） |

**请求示例**：

```json
{
  "userId": 1,
  "content": "下周要去北京出差",
  "importance": 0.7,
  "kind": "episodic",
  "type": "event",
  "validFrom": "2026-03-20T00:00:00Z",
  "validUntil": "2026-03-27T00:00:00Z"
}
```

**响应示例**（201 Created）：

```json
{
  "id": 42,
  "message": "记忆创建成功"
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 新创建记忆的数据库 ID |
| `message` | string | 操作结果描述 |

**错误响应**：

| 状态码 | 条件 | 响应示例 |
|--------|------|----------|
| 400 | 缺少必填字段 | `{"error": "userId 和 content 为必填字段"}` |
| 400 | `importance` 超出范围 | `{"error": "importance 必须在 0 到 1 之间"}` |
| 500 | 内部错误 | `{"error": "错误详情"}` |

---

### POST /consolidate — 手动触发记忆巩固

触发指定用户的记忆巩固任务。巩固服务会扫描该用户的情景记忆，使用 LLM 进行聚类分析，提炼生成高阶语义记忆和行为模式。

该接口为异步操作，接收请求后立即返回 202，巩固任务在后台执行。

**请求体**（JSON）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userId` | number | 是 | 用户 ID |

**请求示例**：

```json
{
  "userId": 1
}
```

**响应示例**（202 Accepted）：

```json
{
  "message": "巩固任务已接受，将在后台执行。"
}
```

**错误响应**：

| 状态码 | 条件 | 响应示例 |
|--------|------|----------|
| 400 | 缺少 `userId` 或非数字 | `{"error": "userId 为必填参数且必须为数字"}` |
| 500 | 内部错误 | `{"error": "错误详情"}` |

**巩固逻辑说明**：

1. 获取用户所有情景记忆（`kind = 'episodic'`）
2. 若情景记忆不足 5 条，跳过巩固
3. 使用简单聚类算法对记忆进行分组
4. 对每个聚类调用 LLM 分析，提取行为模式和核心事实
5. 将发现的行为模式写入 `behaviorPatterns` 表
6. 将核心事实作为语义记忆写入 `memories` 表

---

### POST /forget — 手动触发动态遗忘

触发指定用户的动态遗忘任务。遗忘服务基于艾宾浩斯遗忘曲线对记忆进行衰减处理。

**请求体**（JSON）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userId` | number | 是 | 用户 ID |

**请求示例**：

```json
{
  "userId": 1
}
```

**响应示例**（200 OK）：

```json
{
  "processedCount": 10,
  "decayedCount": 3,
  "deletedCount": 1,
  "message": "遗忘完成。处理 10 条，衰减 3 条，删除 1 条。"
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `processedCount` | number | 本次处理的记忆总数 |
| `decayedCount` | number | 重要性被衰减的记忆数 |
| `deletedCount` | number | 因重要性过低被硬删除的记忆数 |
| `message` | string | 操作结果描述 |

**遗忘算法说明**：

核心衰减公式：

```
accessFactor = ln(accessCount + 1) + 1
decayRate = 0.05 / (accessFactor * (importance + 0.1))
newImportance = importance * exp(-decayRate * daysSinceLastAccess)
```

处理规则：
- `persona` 类型的记忆不参与遗忘（核心人格信息永久保留）
- 巩固生成的记忆（`source = 'consolidation'`）不参与遗忘
- 最近 1 天内访问过的记忆跳过衰减
- 重要性低于 0.1 的记忆将被硬删除

**错误响应**：

| 状态码 | 条件 | 响应示例 |
|--------|------|----------|
| 400 | 缺少 `userId` 或非数字 | `{"error": "userId 为必填参数且必须为数字"}` |
| 500 | 内部错误 | `{"error": "错误详情"}` |

---

## 通用错误格式

所有错误响应均使用以下统一格式：

```json
{
  "error": "错误描述信息"
}
```

## 数据库 Schema

### memories 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT (自增主键) | 记忆唯一标识 |
| `userId` | INT | 用户 ID |
| `content` | TEXT | 记忆内容 |
| `importance` | FLOAT | 重要性评分 (0.0 - 1.0) |
| `kind` | VARCHAR | 记忆类别 (episodic/semantic/persona) |
| `type` | VARCHAR | 记忆类型 (fact/preference/event) |
| `source` | VARCHAR | 来源标识 |
| `embedding` | JSON | 向量嵌入（JSON 数组） |
| `accessCount` | INT | 访问次数 |
| `createdAt` | DATETIME | 创建时间 |
| `lastAccessedAt` | DATETIME | 最后访问时间 |
| `validFrom` | DATETIME | 时序有效性开始时间 |
| `validUntil` | DATETIME | 时序有效性结束时间 |

### behaviorPatterns 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT (自增主键) | 模式唯一标识 |
| `userId` | INT | 用户 ID |
| `patternType` | VARCHAR | 模式类型 |
| `description` | TEXT | 模式描述 |
| `confidence` | FLOAT | 置信度 (0.0 - 1.0) |
| `createdAt` | DATETIME | 创建时间 |
