# Recallo 本地后端环境

## 环境边界

这套配置只用于本地开发：

- 后端监听 `127.0.0.1:5173`；
- PostgreSQL 使用项目内的 `.runtime/postgres-data`；
- 数据库监听 `127.0.0.1:55432`，不占用系统默认 5432；
- 本地 PostgreSQL 使用 trust 鉴权，不允许暴露到局域网或公网；
- `.runtime/` 和 `backend/.env` 均被 Git 忽略；
- 默认不启动生成 Worker，也不需要模型 Key 完成健康检查；
- 不修改 Railway 或其他线上服务。

## 一次性安装

在项目根目录运行：

```bash
npm run setup:local
```

该命令会：

1. 按 `backend/package-lock.json` 安装依赖；
2. 初始化项目专用 PostgreSQL；
3. 创建 `recallo_dev` 数据库；
4. 运行本地环境诊断。

## 启动

```bash
npm run dev:local
```

健康检查：

```bash
curl http://127.0.0.1:5173/api/health
```

预期至少满足：

- `ok` 为 `true`；
- `storage` 为 `postgres`；
- `database.ok` 为 `true`。

也可以运行一次会自动启动和关闭临时服务的完整冒烟检查：

```bash
npm run smoke:local
```

该命令使用 5174 端口，验证 PostgreSQL 健康状态、版本接口、来源能力接口和两个匿名设备的数据列表。

## 数据库控制

```bash
npm run db:start
npm run db:status
npm run db:stop
```

## 环境诊断

```bash
npm run doctor:local
```

## 启用 AI 生成

在 `backend/.env` 中只配置一种服务商的真实 Key。该文件已被 Git 忽略，不要把 Key 写入 `.env.example`、文档或提交记录。

DeepSeek：

```text
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=...
```

OpenAI：

```text
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

需要测试数据库异步生成队列时，再把：

```text
GENERATION_WORKER_DISABLED=0
```

开发早期保持 `1`，可以避免未配置模型时启动 Worker。

## Playwright 浏览器

`npm ci` 只安装 Node 依赖。只有测试公众号浏览器降级抓取时，才额外安装 Chromium：

```bash
npx playwright install chromium
```

不要为普通 API 开发运行带系统依赖安装的生产构建命令。
