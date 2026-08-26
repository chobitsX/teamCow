# Superset 参考发现

## 定位判断

`superset-sh/superset` 更像一个面向本地开发工作流的完整桌面工作台。  
相较 `T3 Code`，它的强项不在于极简 chat 主入口，而在于：

- `workspace / worktree`
- diff / files / git / terminal
- 本地状态、路由、IPC、数据层的工程化组织

对 TeamCow 而言，`Superset` 最值得借鉴的是“桌面工作台如何工程化”，而不是它完整的产品边界。

## 主要借鉴点

### 1. 工作台能力拆分

`Superset` 明显把本地工作区、终端、文件、变更、编辑器联动等能力当成正式子系统，而不是零散工具。  
这对 TeamCow 很重要，因为 TeamCow 虽然是 `chat-first`，但不能缺少真实开发工作台的支撑能力。

### 2. Electron + typed IPC 路线

从实际代码可以看到：

- `Electron`
- `preload + contextBridge`
- `trpc-electron`
- `TanStack Router / Query`
- `Zustand`

这说明它在“本地桌面 + 类型安全通信 + 多 pane renderer”上已经走出了一条成熟路线。  
TeamCow 当前 architecture 明确吸收了这一点。

### 3. 本地数据与状态层

`Superset` 对本地数据的处理比一般桌面壳更完整，包含：

- `better-sqlite3`
- `drizzle-orm`
- 本地状态存储与 workspace 数据组织

这与 TeamCow 的需求非常贴近，尤其适合：

- 项目记录
- 会话历史
- run 事件
- provider 状态
- settings

### 4. Pane-based 工作台形态

`Superset` 的 UI 工程更像一个 pane/workspace 系统，而不是单页聊天界面。  
这给 TeamCow 一个很好的借鉴点：

- sidebar
- chat pane
- inspector
- terminal pane

这些区域应该是清晰子系统，而不是临时拼起来的布局块。

## 不足与局限

### 1. 交互主线偏工作台，不够 chat-first

对 TeamCow 来说，`Superset` 的工作台很有价值，但它不是最好的 chat 主交互参照。  
如果直接照搬，TeamCow 很容易滑向 `cli-first` 或“面板优先”，这与你的产品核心不一致。

### 2. 产品边界更宽

`Superset` 的功能面更大，工程复杂度也更高。  
TeamCow 不能在 V1 直接复制这套宽边界，否则会把产品重心从 provider bridge 和 chat 体验稀释掉。

## 对 TeamCow 的采用建议

### 直接采用

- `Electron + React` 桌面工作台路线
- 本地数据层：`SQLite + better-sqlite3 + drizzle-orm`
- typed IPC / `tRPC-style` 通信
- pane-based renderer 组织

### 适配吸收

- `workspace / worktree`
- diff / files / git / terminal 的工作台能力
- 本地状态与历史记录工程化组织

### 不直接采用

- 更宽的产品边界
- 可能偏 `cli-first` 的使用心智
- 过早扩展到太重的功能面

## 对应 TeamCow 模块映射

- `packages/workspace-core`
- `packages/git-core`
- `packages/filesystem-core`
- `packages/terminal-core`
- `packages/db`
- `apps/desktop/src/main/routers/*`
- `apps/desktop/src/renderer/panes/inspector`

## 一句话结论

`Superset` 是 TeamCow 的“工程与工作台参照物”，主要回答：  
**一个本地 AI coding 工作台，如何在桌面端被拆成可维护的工程结构。**
