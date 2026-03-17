# 变更日志

本文件记录 SmartMem 项目的所有重要变更。

## [0.1.0] - 2026-03-17

### 新增

- **可切换的混合检索**：支持 `simple`（SQL LIKE）和 `hybrid`（BM25 + 向量检索）两种策略
- **BM25 全文检索**：基于 `minisearch` 库实现的内存级 BM25 检索
- **向量检索**：基于 `transformers.js` 的向量嵌入生成和余弦相似度计算
- **时序有效性窗口**：记忆支持 `validFrom` / `validUntil` 时间窗口
- **动态遗忘机制**：基于艾宾浩斯遗忘曲线的指数衰减模型
- **LLM 驱动的记忆巩固**：使用 LLM 对情景记忆进行聚类分析和知识提炼
- **Reflect 综合推理**：对混合检索结果进行 LLM 二次分析和总结
- **RESTful API**：提供 `/health`、`/context`、`/memory`、`/consolidate`、`/forget` 五个端点
- **自动化测试套件**：104 个测试用例，覆盖率达 83.83%（语句）
- **完整项目文档**：包括产品规格、架构设计、接口定义、API 文档、部署说明等

### 技术栈

- TypeScript / Node.js
- Express（HTTP 服务器）
- Drizzle ORM（数据库访问）
- MySQL / TiDB（数据存储）
- minisearch（BM25 检索）
- transformers.js（向量嵌入）
- LangChain（LLM 交互）
- Jest（测试框架）
