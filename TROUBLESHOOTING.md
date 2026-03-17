# SmartMem 常见问题与故障排查

## 1. 安装与启动问题

### 1.1 npm install 失败

**现象**：执行 `npm install` 时报错，提示依赖安装失败。

**可能原因与解决方案**：

| 原因 | 解决方案 |
|------|----------|
| Node.js 版本过低 | 确保 Node.js >= 18.0，使用 `node -v` 检查版本 |
| 网络问题 | 配置 npm 镜像源：`npm config set registry https://registry.npmmirror.com` |
| `@xenova/transformers` 下载慢 | 该包较大（约 50MB），耐心等待或使用代理 |

### 1.2 TypeScript 编译失败

**现象**：执行 `npm run build` 时报类型错误。

**解决方案**：

```bash
# 确保 TypeScript 版本正确
npx tsc --version

# 清理并重新编译
rm -rf dist/
npm run build
```

### 1.3 服务启动后无法连接

**现象**：服务启动成功但 `curl http://localhost:3100/health` 无响应。

**排查步骤**：

1. 检查端口是否被占用：`lsof -i :3100`
2. 检查环境变量 `PORT` 是否被设置为其他值
3. 检查防火墙设置是否阻止了端口访问

## 2. 数据库连接问题

### 2.1 数据库连接失败

**现象**：启动时报错 `Error: connect ECONNREFUSED`。

**排查步骤**：

1. 确认 MySQL 服务正在运行：`systemctl status mysql`
2. 确认 `.env` 中的数据库连接信息正确
3. 确认数据库用户有远程连接权限
4. 测试连接：`mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p`

### 2.2 表不存在错误

**现象**：API 调用时报错 `Table 'smartmem.memories' doesn't exist`。

**解决方案**：参照 [DEPLOYMENT.md](DEPLOYMENT.md) 中的数据库准备章节，执行建表 SQL。

### 2.3 字符编码问题

**现象**：中文记忆内容写入后出现乱码。

**解决方案**：确保数据库和表使用 `utf8mb4` 编码：

```sql
ALTER DATABASE smartmem CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE memories CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 3. API 调用问题

### 3.1 POST /memory 返回 400

**现象**：写入记忆时返回 400 错误。

**常见原因**：

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `userId 和 content 为必填字段` | 请求体缺少必填字段 | 确保请求体包含 `userId` 和 `content` |
| `importance 必须在 0 到 1 之间` | importance 值超出范围 | 将 importance 设置为 0.0 到 1.0 之间的浮点数 |
| `validFrom 必须早于 validUntil` | 时间窗口设置错误 | 确保开始时间早于结束时间 |

### 3.2 GET /context 返回空上下文

**现象**：检索记忆上下文时返回空字符串。

**排查步骤**：

1. 确认该用户是否有记忆数据：直接查询数据库 `SELECT * FROM memories WHERE userId = ?`
2. 检查记忆是否已过期（`validUntil` 早于当前时间）
3. 检查检索策略是否正确设置
4. 如果使用 `hybrid` 策略，确认记忆是否有向量嵌入

### 3.3 POST /consolidate 无效果

**现象**：触发巩固后没有生成新的语义记忆或行为模式。

**可能原因**：

| 原因 | 说明 |
|------|------|
| 情景记忆不足 5 条 | 巩固服务要求至少 5 条情景记忆才会执行 |
| OpenAI API Key 未配置 | 巩固功能依赖 LLM，需要有效的 API Key |
| 记忆内容过于分散 | 聚类算法无法找到有意义的模式 |

## 4. 性能问题

### 4.1 检索响应缓慢

**现象**：`GET /context` 响应时间超过 1 秒。

**优化建议**：

| 策略 | 预期效果 |
|------|----------|
| 切换为 `simple` 策略 | 显著降低延迟（< 50ms） |
| 关闭 Reflect 功能 | 减少 500-1500ms 的 LLM 调用延迟 |
| 添加数据库索引 | 参照 DEPLOYMENT.md 中的索引建议 |
| 限制记忆数量 | 定期执行遗忘任务清理低价值记忆 |

### 4.2 内存占用过高

**现象**：Node.js 进程内存占用持续增长。

**可能原因**：

1. `hybrid` 模式下，BM25 索引在内存中构建，记忆数量过多时占用较大
2. `transformers.js` 模型加载占用内存

**解决方案**：

```bash
# 增加 Node.js 内存限制
node --max-old-space-size=2048 dist/api/server.js
```

## 5. Reflect 功能问题

### 5.1 Reflect 未生效

**现象**：启用 Reflect 后，检索结果与未启用时相同。

**排查步骤**：

1. 确认环境变量设置正确：`MEMORY_REFLECT_ENABLED=true`（注意必须是小写 `true`）
2. 确认检索策略为 `hybrid`：`MEMORY_RETRIEVAL_STRATEGY=hybrid`
3. 确认 `OPENAI_API_KEY` 已正确配置
4. 查看日志中是否有 `[SmartMem Reflect]` 相关输出

### 5.2 Reflect 降级为直接格式化

**现象**：日志中出现 `[SmartMem Reflect] LLM 调用失败，降级为直接格式化`。

**可能原因**：

| 原因 | 解决方案 |
|------|----------|
| OpenAI API 超时 | 检查网络连接，考虑使用代理 |
| API Key 无效或额度不足 | 更换有效的 API Key |
| API 速率限制 | 降低请求频率或升级 API 套餐 |

## 6. 遗忘机制问题

### 6.1 重要记忆被意外删除

**现象**：高重要性的记忆在遗忘任务后消失。

**说明**：遗忘机制默认不会处理以下记忆：

- `persona` 类型的记忆（核心人格信息永久保留）
- 巩固生成的记忆（`source = 'consolidation'`）
- 最近 1 天内访问过的记忆

如果重要记忆被误删，可能是因为：

1. 记忆的 `importance` 初始值设置过低
2. 记忆长时间未被访问导致衰减至删除阈值（0.1）

**预防措施**：

- 对关键记忆设置较高的 `importance` 值（>= 0.8）
- 将核心信息标记为 `persona` 类型
- 定期通过检索触发记忆的访问计数更新
