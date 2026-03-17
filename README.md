# SmartMem — 高级记忆系统

SmartMem 是为 AI 智能体（尤其是 AI 陪伴和车载助手场景）设计的高级长期记忆系统。它通过多策略检索、时序有效性窗口、基于艾宾浩斯遗忘曲线的动态遗忘机制，以及 LLM 驱动的知识巩固能力，使智能体能够建立更深层次、更个性化、更具智慧的用户理解。

## 功能特性

- **可切换的混合检索**：支持 `simple`（SQL LIKE）和 `hybrid`（BM25 + 向量检索）两种策略，通过环境变量一键切换
- **时序有效性窗口**：记忆支持 `validFrom` / `validUntil` 时间窗口，检索时自动过滤过期记忆
- **动态遗忘机制**：基于艾宾浩斯遗忘曲线的指数衰减模型，根据访问频率和重要性动态调整记忆新鲜度
- **LLM 驱动的记忆巩固**：后台服务定期扫描零散的情景记忆，利用 LLM 提炼生成高阶语义记忆和行为模式
- **Reflect 综合推理**：在混合检索模式中对多路召回结果进行 LLM 二次分析和总结，输出最相关的核心信息
- **分层上下文管理**：建立"核心记忆"层，将巩固生成的用户画像摘要常驻于 Prompt

## 环境要求

- Node.js >= 18.0
- MySQL 5.7+ 或 TiDB
- npm 或 pnpm

## 安装说明

```bash
# 克隆仓库
git clone https://github.com/yangli0403/SmartMem.git
cd SmartMem

# 安装依赖
npm install

# 复制环境变量模板并配置
cp .env.example .env
# 编辑 .env 文件，填入数据库连接信息和 OpenAI API Key
```

## 快速开始

### 1. 配置环境变量

编辑 `.env` 文件：

```bash
# 数据库连接信息
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=smartmem

# OpenAI API Key（用于巩固和 Reflect 功能）
OPENAI_API_KEY=your_openai_api_key

# 记忆检索策略: simple（默认）或 hybrid
MEMORY_RETRIEVAL_STRATEGY=simple

# Reflect 综合推理开关（仅 hybrid 模式下生效）
MEMORY_REFLECT_ENABLED=false
```

### 2. 启动服务

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm run build
npm start
```

### 3. 调用 API

```bash
# 健康检查
curl http://localhost:3100/health

# 写入记忆
curl -X POST http://localhost:3100/memory \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "content": "喜欢喝拿铁", "importance": 0.8, "kind": "episodic", "type": "preference"}'

# 检索记忆上下文
curl "http://localhost:3100/context?userId=1&query=咖啡偏好"

# 手动触发记忆巩固
curl -X POST http://localhost:3100/consolidate \
  -H "Content-Type: application/json" \
  -d '{"userId": 1}'

# 手动触发动态遗忘
curl -X POST http://localhost:3100/forget \
  -H "Content-Type: application/json" \
  -d '{"userId": 1}'
```

## 配置说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_HOST` | 数据库主机地址 | `127.0.0.1` |
| `DB_PORT` | 数据库端口 | `3306` |
| `DB_USER` | 数据库用户名 | `root` |
| `DB_PASSWORD` | 数据库密码 | - |
| `DB_NAME` | 数据库名称 | `smartmem` |
| `OPENAI_API_KEY` | OpenAI API 密钥 | - |
| `MEMORY_RETRIEVAL_STRATEGY` | 检索策略（`simple` / `hybrid`） | `simple` |
| `MEMORY_REFLECT_ENABLED` | Reflect 综合推理开关 | `false` |
| `PORT` | 服务监听端口 | `3100` |

## 项目结构

```
SmartMem/
├── src/
│   ├── api/
│   │   └── server.ts              # Express HTTP 服务器和路由
│   ├── core/
│   │   ├── retrievalOrchestrator.ts  # 检索协调器（简单/混合策略）
│   │   └── writeService.ts           # 记忆写入服务
│   ├── data/
│   │   ├── dal.ts                    # 数据访问层（CRUD 操作）
│   │   └── schema.ts                # Drizzle ORM 数据库 Schema
│   └── services/
│       ├── consolidationService.ts   # LLM 驱动的记忆巩固服务
│       ├── forgettingService.ts      # 艾宾浩斯遗忘曲线衰减服务
│       └── reflectService.ts         # Reflect 综合推理服务
├── tests/
│   ├── unit/                         # 单元测试
│   │   ├── retrievalOrchestrator.test.ts
│   │   ├── writeService.test.ts
│   │   ├── forgettingService.test.ts
│   │   ├── consolidationService.test.ts
│   │   ├── reflectService.test.ts
│   │   └── dal.test.ts
│   ├── integration/                  # 集成测试
│   │   └── server.test.ts
│   └── COVERAGE.md                   # 测试覆盖率报告
├── diagrams/
│   └── architecture.mmd             # 架构图源文件
├── ARCHITECTURE.md                   # 系统架构文档
├── PRODUCT_SPEC.md                   # 产品规格说明书
├── INTERFACE_DESIGN.md               # 接口与数据结构定义
├── REQUIREMENTS_REFLECTION.md        # 需求反思报告
└── .env.example                      # 环境变量模板
```

## 运行测试

```bash
# 运行所有测试
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage
```

当前测试覆盖率：

| 指标 | 覆盖率 |
|------|--------|
| 语句覆盖率 | 83.83% |
| 分支覆盖率 | 68.81% |
| 函数覆盖率 | 81.48% |
| 行覆盖率 | 84.40% |

## 架构设计

详见 [ARCHITECTURE.md](ARCHITECTURE.md) 了解系统设计详情。

## API 文档

详见 [API_DOCUMENTATION.md](API_DOCUMENTATION.md) 了解完整的 API 接口文档。

## 许可证

MIT License
