# SmartMem 贡献指南

感谢您对 SmartMem 项目的关注。本文档将帮助您了解如何参与项目开发。

## 1. 开发环境搭建

### 1.1 前置要求

- Node.js >= 18.0
- MySQL 5.7+ 或 TiDB
- Git

### 1.2 本地开发

```bash
# 克隆仓库
git clone https://github.com/yangli0403/SmartMem.git
cd SmartMem

# 安装所有依赖（包括开发依赖）
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入本地开发配置

# 启动开发服务器（热重载）
npm run dev
```

### 1.3 运行测试

```bash
# 运行所有测试
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage
```

## 2. 项目结构

```
src/
├── api/           # HTTP 服务器和路由定义
├── core/          # 核心业务逻辑（检索协调、写入服务）
├── data/          # 数据访问层和数据库 Schema
└── services/      # 后台服务（巩固、遗忘、Reflect）

tests/
├── unit/          # 单元测试
└── integration/   # 集成测试
```

## 3. 编码规范

### 3.1 语言规范

- 所有文档、注释和 Git 提交信息使用**简体中文**
- 代码中的变量名、函数名使用英文驼峰命名
- 技术术语首次出现时可附英文原文

### 3.2 代码风格

- 使用 TypeScript 严格模式（`strict: true`）
- 函数和类必须添加 JSDoc 注释
- 每个模块文件顶部添加模块说明注释
- 使用 `async/await` 处理异步操作，避免回调嵌套

### 3.3 测试要求

- 新功能必须附带对应的单元测试
- 测试覆盖率要求：语句 >= 80%，行 >= 80%，函数 >= 80%
- 测试文件命名格式：`{moduleName}.test.ts`
- 测试描述使用中文

## 4. 提交规范

### 4.1 分支命名

| 类型 | 格式 | 示例 |
|------|------|------|
| 功能开发 | `feature/功能描述` | `feature/vector-search` |
| 缺陷修复 | `fix/问题描述` | `fix/memory-leak` |
| 文档更新 | `docs/文档描述` | `docs/api-documentation` |

### 4.2 提交信息格式

```
<类型>: <简短描述>

<详细说明（可选）>
```

类型包括：

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档更新 |
| `test` | 测试相关 |
| `refactor` | 代码重构 |
| `perf` | 性能优化 |

### 4.3 提交示例

```
feat: 添加向量检索的余弦相似度计算

实现了基于内存的暴力余弦相似度搜索，作为 MVP 阶段的向量检索方案。
后续可升级为 pgvector 等专用向量数据库方案。
```

## 5. Pull Request 流程

1. 从 `main` 分支创建功能分支
2. 在功能分支上完成开发和测试
3. 确保所有测试通过：`npm test`
4. 确保代码可以正常编译：`npm run build`
5. 提交 Pull Request，描述变更内容和测试情况
6. 等待代码审查和合并
