# SmartMem 部署说明

## 1. 部署前提

### 1.1 系统要求

| 项目 | 最低要求 | 推荐配置 |
|------|----------|----------|
| 操作系统 | Linux / macOS / Windows | Ubuntu 22.04 LTS |
| Node.js | >= 18.0 | 20.x LTS |
| 内存 | >= 512 MB | >= 1 GB |
| 磁盘空间 | >= 200 MB | >= 500 MB |

### 1.2 外部依赖

| 服务 | 版本要求 | 说明 |
|------|----------|------|
| MySQL | >= 5.7 | 或 TiDB 兼容版本 |
| OpenAI API | - | 巩固和 Reflect 功能需要 |

## 2. 数据库准备

### 2.1 创建数据库

```sql
CREATE DATABASE IF NOT EXISTS smartmem
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
```

### 2.2 创建表结构

```sql
-- 记忆表
CREATE TABLE IF NOT EXISTS memories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  content TEXT NOT NULL,
  importance FLOAT DEFAULT 0.5,
  kind VARCHAR(50) DEFAULT 'episodic',
  type VARCHAR(50) DEFAULT 'fact',
  source VARCHAR(100) DEFAULT 'conversation',
  embedding JSON DEFAULT NULL,
  accessCount INT DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  lastAccessedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  validFrom DATETIME DEFAULT NULL,
  validUntil DATETIME DEFAULT NULL,
  INDEX idx_userId (userId),
  INDEX idx_kind (kind),
  INDEX idx_importance (importance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 行为模式表
CREATE TABLE IF NOT EXISTS behavior_patterns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  patternType VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_userId (userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 3. 应用部署

### 3.1 源码部署

```bash
# 1. 克隆仓库
git clone https://github.com/yangli0403/SmartMem.git
cd SmartMem

# 2. 安装依赖
npm install --production

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入实际的数据库连接信息和 API Key

# 4. 编译 TypeScript
npm run build

# 5. 启动服务
npm start
```

### 3.2 使用 Docker 部署

项目根目录下提供了 Dockerfile：

```bash
# 构建镜像
docker build -t smartmem:latest .

# 运行容器
docker run -d \
  --name smartmem \
  -p 3100:3100 \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=3306 \
  -e DB_USER=root \
  -e DB_PASSWORD=your_password \
  -e DB_NAME=smartmem \
  -e OPENAI_API_KEY=your_api_key \
  -e MEMORY_RETRIEVAL_STRATEGY=simple \
  smartmem:latest
```

### 3.3 使用 PM2 进程管理

推荐在生产环境中使用 PM2 管理 Node.js 进程：

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start dist/api/server.js --name smartmem

# 查看状态
pm2 status smartmem

# 查看日志
pm2 logs smartmem

# 设置开机自启
pm2 startup
pm2 save
```

## 4. 环境变量配置

| 变量 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `DB_HOST` | 是 | 数据库主机 | `127.0.0.1` |
| `DB_PORT` | 否 | 数据库端口 | `3306` |
| `DB_USER` | 是 | 数据库用户名 | `root` |
| `DB_PASSWORD` | 是 | 数据库密码 | - |
| `DB_NAME` | 是 | 数据库名称 | `smartmem` |
| `OPENAI_API_KEY` | 否 | OpenAI API 密钥（巩固/Reflect 功能需要） | - |
| `MEMORY_RETRIEVAL_STRATEGY` | 否 | 检索策略 | `simple` |
| `MEMORY_REFLECT_ENABLED` | 否 | Reflect 开关 | `false` |
| `PORT` | 否 | 服务监听端口 | `3100` |

## 5. 健康检查

服务启动后，可通过健康检查端点验证运行状态：

```bash
curl http://localhost:3100/health
```

预期响应：

```json
{
  "status": "ok",
  "service": "SmartMem",
  "version": "0.1.0",
  "strategy": "simple"
}
```

## 6. 日志说明

SmartMem 使用 `console.log` 和 `console.error` 输出日志，所有日志均以 `[SmartMem]` 前缀标识。在生产环境中，建议通过 PM2 或 Docker 的日志管理功能收集和归档日志。

主要日志标签：

| 标签 | 说明 |
|------|------|
| `[SmartMem]` | 通用信息日志 |
| `[SmartMem Reflect]` | Reflect 综合推理相关日志 |
| `[SmartMem] POST /memory 错误:` | 记忆写入错误 |
| `[SmartMem] GET /context 错误:` | 上下文检索错误 |

## 7. 性能调优建议

### 7.1 检索策略选择

| 策略 | 延迟 | 准确性 | 适用场景 |
|------|------|--------|----------|
| `simple` | 低（< 50ms） | 中 | 数据量小、对延迟敏感的场景 |
| `hybrid` | 中（100-300ms） | 高 | 数据量大、需要高准确性的场景 |
| `hybrid` + Reflect | 高（500-1500ms） | 最高 | 对质量要求极高、可接受延迟的场景 |

### 7.2 数据库优化

对于大数据量场景，建议为 `memories` 表添加以下索引：

```sql
ALTER TABLE memories ADD INDEX idx_userId_kind (userId, kind);
ALTER TABLE memories ADD INDEX idx_userId_importance (userId, importance);
ALTER TABLE memories ADD INDEX idx_validUntil (validUntil);
```

### 7.3 定时任务配置

建议配置以下定时任务：

| 任务 | 频率 | 说明 |
|------|------|------|
| 动态遗忘 | 每天凌晨 2:00 | 清理过期和低重要性记忆 |
| 记忆巩固 | 每天凌晨 3:00 | 提炼高阶语义记忆 |

可使用 cron 或系统调度器调用对应的 API 端点。
