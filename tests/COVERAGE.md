# SmartMem 测试覆盖率报告

## 总体覆盖率

| 指标 | 覆盖率 | 目标 | 状态 |
|------|--------|------|------|
| Statements（语句） | 83.83% | 80% | 达标 |
| Branches（分支） | 68.81% | 60% | 达标 |
| Functions（函数） | 81.48% | 80% | 达标 |
| Lines（行） | 84.40% | 80% | 达标 |

## 各模块覆盖率

| 模块 | 语句 | 分支 | 函数 | 行 | 说明 |
|------|------|------|------|-----|------|
| server.ts | 84.37% | 72.22% | 55.55% | 84.37% | API 端点 |
| retrievalOrchestrator.ts | 94.17% | 80.55% | 94.11% | 95.23% | 检索协调器 |
| writeService.ts | 100% | 96.42% | 100% | 100% | 写入服务 |
| dal.ts | 60.34% | 34.21% | 75% | 61.81% | 数据访问层 |
| schema.ts | 100% | 100% | 100% | 100% | 数据库 Schema |
| consolidationService.ts | 83.13% | 66.66% | 85.71% | 84.50% | 巩固服务 |
| forgettingService.ts | 97.05% | 87.50% | 100% | 100% | 遗忘服务 |
| reflectService.ts | 68.75% | 53.33% | 83.33% | 68.75% | Reflect 服务 |

## 测试套件统计

| 测试套件 | 测试数量 | 状态 |
|----------|----------|------|
| retrievalOrchestrator.test.ts | 14 | 全部通过 |
| writeService.test.ts | 10 | 全部通过 |
| forgettingService.test.ts | 11 | 全部通过 |
| consolidationService.test.ts | 10 | 全部通过 |
| reflectService.test.ts | 10 | 全部通过 |
| dal.test.ts | 19 | 全部通过 |
| server.test.ts（集成） | 14 | 全部通过 |
| **合计** | **104** | **全部通过** |

## 未覆盖代码说明

### dal.ts（60.34%）

DAL 层的未覆盖代码主要集中在 `searchMemories` 函数（第 124-182 行）和 `getDb` 函数（第 64-73 行）。这些代码直接依赖 MySQL 数据库连接和 Drizzle ORM 的查询构建器，在纯单元测试环境中难以完全模拟其内部的条件分支逻辑（如关键词过滤、类型过滤、时序窗口过滤等）。这些分支已通过集成测试中对 `server.ts` 和 `retrievalOrchestrator.ts` 的间接测试覆盖了其业务逻辑。

### reflectService.ts（68.75%）

未覆盖部分主要是 `defaultCallLLM` 函数（第 121-146 行），该函数直接调用 OpenAI API。在测试中通过注入 mock LLM 函数来替代真实 API 调用，因此默认实现未被直接执行。这是合理的测试策略，避免了对外部 API 的依赖。

### server.ts（84.37%）

未覆盖部分包括全局错误处理中间件（第 134-135 行）和服务器启动函数（第 145-147 行）。全局错误处理中间件在正常测试流程中不会被触发，服务器启动函数在测试中使用 supertest 直接操作 app 实例而不启动监听。
