# TeamCow 架构概览

TeamCow 是一个本地优先、macOS 优先的 Electron 桌面应用。它把本机已有的 coding agent 连接到统一的项目、会话和审查工作流，但不重新实现 agent 或认证系统。

## 产品模型

```text
Project
├── Default worktree (项目主目录)
└── Conversation
    ├── Provider
    ├── Model
    ├── Access mode
    ├── Bound worktree
    ├── Messages / run events / artifacts
    └── Inspector state
```

每个 conversation 只绑定一个 provider、一个 model 和一个 worktree。切换 provider 或重置上下文会创建新 conversation。同一个 project 可以让多个 conversations 分别绑定不同 worktrees 并行工作。

## 进程边界

```text
React renderer
      │ window.teamcow (typed preload API)
      ▼
Preload / Zod validation
      │ teamcow:invoke + typed event channels
      ▼
Electron main router
      ├── Project / conversation service ── SQLite + Drizzle
      ├── Provider runtime adapters ─────── local provider processes
      ├── Git / worktree services ───────── local Git
      ├── File boundary services ────────── bound worktree only
      └── Terminal service ───────────────── PTY for manual takeover
```

Renderer 不直接访问文件系统、Git、PTY、子进程或 provider。所有跨进程数据都通过 `packages/shared-types` 中的共享契约校验。Provider 原始输出由 adapter/runtime 归一化为消息、运行事件和产物后再持久化与渲染。

## Workspace 划分

- `apps/desktop`：Electron main、preload、React renderer、原生辅助程序和桌面测试。
- `packages/shared-types`：桌面命令、IPC payload、provider 事件等跨层 Zod 契约。
- `packages/db`：SQLite schema 和 migration。
- `packages/i18n-resources`：中英文文案资源。
- `scripts`：仓库级 i18n、lint 配置和发布门禁。

## 数据和恢复

应用在 Electron `userData` 目录中创建 `teamcow.sqlite`，并保存会话附件和受控日志。运行失败、中断或异常退出时，已经接收的 provider 输出和 run events 会保留，遗留的 running 状态会在下次启动时恢复为 interrupted，便于用户继续审查。

## 安全边界

- 文件读取、写入、重命名和删除必须限制在 conversation 绑定的 worktree 内。
- Provider readiness 优先信任 CLI 原生版本与认证状态；辅助网络探测不能覆盖已确认的原生登录状态。
- 日志和持久化路径会对常见 token、认证字段和环境变量进行脱敏。
- Terminal 是人工接管入口，不会把终端原始流混入 provider chat 时间线。
- `full-access` 是显式高信任模式，最终权限语义仍由对应 provider 实现。

更细的实现约束见根目录 [AGENTS.md](../AGENTS.md)，历史设计和方案记录位于 `docs/design/`。
