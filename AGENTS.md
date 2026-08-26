# TeamCow 项目协作规则

## 首要准则

- 与用户交互时优先使用中文。
- 这是一个本地优先、macOS 优先的 `chat-first` AI coding workspace。不要把它理解成自研 AI agent 或通用 IDE。
- 产品主心智固定为 `Project -> Conversation`。`Worktree` 是 conversation 绑定的执行环境与隔离边界，不是用户侧主导航层级。
- 任何实现都应服务于核心闭环：导入项目、创建 conversation、选择 provider、绑定执行目标、在 chat 中观察输出、在 inspector 中审查结果。

## 技术栈与运行方式

- 包管理器使用 `yarn`，项目为 Yarn workspaces。不要引入 npm lockfile 或 pnpm lockfile。
- Node 版本固定为 `22.22.2`，见 `.node-version` 和 `.nvmrc`。
- 桌面应用位于 `apps/desktop`，技术栈为 `Electron + React + TypeScript + electron-vite`。
- 本地数据层使用 `SQLite + better-sqlite3 + drizzle-orm`，schema 在 `packages/db/src/schema.ts`。
- 共享类型、zod schema 与跨层契约集中在 `packages/shared-types/src/index.ts`。
- i18n 资源集中在 `packages/i18n-resources/src`，支持 `en` 和 `zh`。

常用命令：

```bash
yarn dev
yarn build
yarn typecheck
yarn lint
yarn test
yarn i18n:check
yarn workspace @teamcow/desktop test
yarn workspace @teamcow/desktop smoke
```

如果 Electron 在开发环境中表现得像 Node 进程，先查看 `docs/desktop-dev-troubleshooting.md`，重点检查 `ELECTRON_RUN_AS_NODE` 是否从父进程泄漏。

## 架构边界

- `renderer` 不能直接访问 `fs`、`git`、`pty`、`child_process` 或本地 provider 进程。
- `renderer -> main` 必须通过 preload 暴露的 `window.teamcow` API，并走统一 IPC channel：`teamcow:invoke`。
- 新增桌面能力时，优先扩展 `DesktopCommand`、zod schema、preload API、`desktop-router.ts` 和对应 service；不要随手新增分散的 `ipcMain.handle`。
- 所有跨 IPC、provider 输出和入库结构都应使用 zod schema 校验。
- provider 原始输出必须先经过 adapter/runtime 归一化为 run events、messages 或 artifacts，再进入持久化与 chat 渲染；不要把终端原始流直接塞进 chat。
- 内置 terminal 是人工接管工具，不承担 provider chat event stream 的日志同步职责。

## 数据与产品模型

- 核心实体包括 `projects`、`worktrees`、`conversations`、`conversation_messages`、`execution_runs`、`run_events`、`artifacts`、`app_settings`。
- 每个 project 必须有代表项目主目录的 default worktree 记录。
- 每个 conversation 创建后绑定单一 provider、单一 model、单一 worktree。切换 provider 或重置上下文时，应创建新 conversation，而不是在原 conversation 内热切换。
- UI 中的当前 worktree 应从 active conversation 派生；没有 active conversation 时再回退到 project default worktree。
- 并行能力表达为同一 project 下多个 conversations 分别绑定不同 worktrees 并行运行和比较结果。

## 前端与 UX 约定

- 主界面保持三栏工作台心智：左侧 project/conversation 导航，中间 chat 主线，右侧 inspector 审查。
- Chat 必须区分用户消息、provider 输出、系统摘要、工具事件和状态事件。
- Inspector 是结果审查主路径，围绕 Files、Diff、Git、Terminal 等能力组织。
- 重要状态不能只靠颜色表达，必须结合标签、图标、文案或结构差异。
- 默认视觉气质遵循 `graphite + warm cream + low-saturation workbench blue` 的专业工作台风格，避免紫色 SaaS 感、玩具感和纯营销式布局。
- 用户可见文本必须进入 i18n 资源；新增中文和英文键值后运行 `yarn i18n:check`。确实是机器值或技术值时，才用局部 ESLint 例外并说明原因。
- 遇到「局部交互导致大块 UI 闪刷 / 不必要的全局重渲染」时，先查看 `docs/renderer-rerender-troubleshooting.md`，重点排查事件处理里整体替换 context 对象引用、以及 `isBusy` 这类被大范围消费的全局 flag。

## Provider 约定

- V1 provider 为 `codex`、`claude`、`opencode`。
- TeamCow 桥接本地成熟工具，不替代它们的认证、模型能力、slash commands 或原生确认流。
- provider readiness 必须明确区分 `ready`、`unavailable`、`unknown`，并给出不可用原因，例如 binary 缺失、版本不支持、认证缺失、网络不可达或配置无效。
- 判断 provider 是否可用时，必须优先信任本地 CLI 的原生状态。尤其是 `codex login status` 或 `claude auth status` 已明确返回已登录时，不要因为 TeamCow 自己用 Node `fetch` 直连官方 API endpoint 超时，就把 Codex 或 Claude Code 标记为 `unavailable`；这种 endpoint 探测只能作为辅助诊断，不能覆盖 provider-native auth/readiness 结果。
- 排查 Codex / Claude Code 显示不可用时，先记录并核对：CLI 是否存在、`--version` 是否正常、原生 auth status 是否已登录、配置文件是否有明确错误；不要直接从网络探测失败推断 provider 不可用。
- provider 运行失败、中断或输出异常时，必须保留已接收输出、run event 和 conversation 状态，方便用户人工判断和恢复。

## 测试与验证

- 代码变更完成前至少运行与改动范围匹配的检查。跨层或共享契约变更优先运行：

```bash
yarn typecheck
yarn lint
yarn test
```

- i18n 或用户可见文案变更必须运行：

```bash
yarn i18n:check
```

- Electron 启动、打包、原生模块、provider 或桌面集成相关变更，视风险运行：

```bash
yarn build
yarn workspace @teamcow/desktop smoke
```

- 新增行为优先补充邻近测试。已有测试位置包括 `apps/desktop/src/main/__tests__`、`apps/desktop/src/renderer/**/__tests__`、`packages/**` 和 `scripts/__tests__`。

## 开发习惯

- 优先保持小步、可验证、贴近现有结构的修改。
- 不要重构无关模块，不要把规划文档里的 deferred/post-MVP 能力提前塞进当前故事。
- 不要破坏用户或其他 agent 已经产生的工作区改动；修改前先查看 `git status --short`。
- 删除、覆盖、重建 worktree、数据库或用户目录内容前必须有明确需求和确认逻辑。
- macOS 是 V1 优先平台。跨平台适配不要牺牲当前 macOS 开发者工作流的可靠性。
