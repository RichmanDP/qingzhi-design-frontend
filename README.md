# QINGZHI Frontend

擎智（QINGZHI）的独立前端开源仓库：一个面向多行业 AI 工作流、结构化产物、人工审批与安全门禁的 React 管理界面。

This repository contains the standalone QINGZHI web client. It does **not** include the backend, local databases, credentials, provider integrations, or production infrastructure.

> 项目状态：开发候选版。界面中的模型、发布、计费和高风险签发入口依赖兼容后端的服务端校验；按钮或页面存在不代表外部能力已经启用。

## 功能范围

- 响应式应用壳、认证路由和移动端导航
- 任务、工作流节点、产物版本、审批与质量门禁界面
- AI 短剧工作台、发布证据和指标采集界面
- Agent、Prompt、Skill 与模型配置控制面
- 知识库、资产、会议、计划、通知、团队、连接器和成本视图
- Vitest + Testing Library 前端测试

## 技术栈

- React 18 + TypeScript
- Vite 6
- React Router 7
- Lucide React
- Vitest、Testing Library、jsdom

## 本地开发

要求 Node.js 20+ 和 pnpm 10+。

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

默认开发地址为 `http://127.0.0.1:5173`。若不设置 `VITE_API_BASE_URL`，Vite 会把 `/api` 和 `/healthz` 代理到 `http://127.0.0.1:8000`。

`VITE_API_BASE_URL` 必须是包含 `/api/v1` 的完整 API 根地址，例如：

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

所有 `VITE_*` 变量都会进入浏览器构建产物，绝不能用于保存 API Key、Token 或其他秘密。

## 后端兼容要求

本仓库是 API 客户端，不内置 Mock 数据层或默认账号。兼容服务至少需要提供：

- `/api/v1` HTTP API，以及 `{ data, meta }` / `{ error, meta }` 响应信封
- Bearer Session 认证
- 写操作所需的 `Idempotency-Key` 与版本字段
- 带鉴权及 `Last-Event-ID` 恢复语义的 Job SSE
- `/healthz` 健康检查
- 跨域部署时与前端 Origin 匹配的 CORS 配置

模型凭据、连接器秘密、授权、租户隔离和高风险门禁都必须由服务端实现并强制执行。不要把前端禁用状态当作安全边界，也不要把真实凭据提交给不受信任的 API。

## 验证

```bash
pnpm run lint
pnpm test
pnpm run build
```

这里的 `lint` 当前执行 TypeScript 静态检查（`tsc --noEmit`），不是 ESLint。

## 生产构建与托管

```bash
pnpm run build
pnpm preview
```

构建产物位于 `dist/`。项目使用 `BrowserRouter`；静态托管时必须把未知路径回退到 `index.html`。部署到子路径时还需要同步配置 Vite `base` 和路由 basename，当前仓库未预设 GitHub Pages 子路径。

## 仓库边界

公开仓库只包含前端源码、样式、测试和构建配置。原本地全栈工作区中的 FastAPI 后端、SQLite 数据、运行脚本、日志、截图、旧 HTML 原型和本地演示凭据均未包含。

## 许可证

项目代码采用 [MIT](./LICENSE) 许可证。运行时依赖的版权与许可证见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
