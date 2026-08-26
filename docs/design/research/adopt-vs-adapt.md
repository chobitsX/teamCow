# TeamCow 参考策略：Adopt vs Adapt

## 目的

这份文档用于明确 TeamCow 对上游参考仓库的吸收策略，避免后续实现时出现两种偏差：

1. 机械照搬上游实现，导致 TeamCow 丢失自己的产品定位
2. 完全不借鉴上游成熟经验，重复踩基础工程坑

## 核心原则

TeamCow 的参考策略不是“复刻”，而是：

- 以 `T3 Code` 作为交互主线参照
- 以 `Superset` 作为工作台与工程结构参照
- 以 TeamCow 自己的 `chat-first + conversation-bound worktree` 定位作为最终裁剪标准

## Adopt：直接采用

这些是已经足够贴合 TeamCow、应直接继承的方向。

### 来自 T3 Code

- `chat-first` 主入口
- 新会话时选择 provider
- 会话级 provider 绑定
- 保留 provider 原生能力与差异

### 来自 Superset

- `Electron + React + TypeScript` 桌面应用路线
- `typed RPC over IPC`
- 本地结构化数据层
- pane-based 工作台组织
- 本地系统能力收口到 host/main 层

## Adapt：适配吸收

这些方向对 TeamCow 很有价值，但必须按 TeamCow 自己的定位重组。

### 来自 T3 Code 的适配吸收

- provider readiness / initialization 体验
- chat 中对工具输出的承载方式
- 工具桥接的交互组织

适配原则：

- 不停留在轻量 chat app
- 要补齐项目、conversation-bound worktree、diff、history 等工作台能力

### 来自 Superset 的适配吸收

- `conversation-bound worktree`
- files / diff / git / terminal / editor integration
- 本地数据、路由、状态与 IPC 的工程化组织

适配原则：

- 不把 TeamCow 做成 `cli-first`
- 不牺牲 chat 主线去追求更宽的工作台边界
- 不照搬 `Project -> Workspace -> Chat` 用户层级；TeamCow 的用户层级应保持 `Project -> Conversation`，worktree 作为 conversation 的绑定执行环境

## Explicitly Not Adopt：明确不直接采用

### 不直接采用 T3 Code 的部分

- 过于轻量的功能边界
- 仅围绕 chat 的最小化产品结构

### 不直接采用 Superset 的部分

- 更大的产品范围
- 更偏工作台中心的交互路径
- 可能超出 TeamCow V1 的复杂系统

## TeamCow 自己新增的结构性改进

TeamCow 不是 `T3 Code + Superset` 的简单相加，而是做了新的结构重组：

### 1. 更明确的三层边界

- `renderer`
- `host/main`
- `provider runtime`

### 2. 更明确的事件与渲染分层

- provider raw output
- normalized events
- persisted run history
- render models
- chat UI

### 3. 更明确的产品中心

- chat 是唯一主入口
- `conversation-bound worktree` 是差异化能力
- inspector / terminal / files 是辅助工作台，而不是主入口

## 对后续 agent 的执行要求

后续实现 TeamCow 时，应遵守以下判断顺序：

1. 先判断这项能力更像 `T3 Code` 的交互问题，还是 `Superset` 的工作台问题
2. 再判断它是否符合 TeamCow 的 `chat-first` 主定位
3. 如果参考实现与 TeamCow 定位冲突，以 TeamCow 的产品边界优先
4. 如需偏离当前参考策略，应先更新 architecture 或 notes 文档，而不是私自“局部特判”

## 快速判断表

| 问题类型 | 首要参考 | 次要参考 | TeamCow 取舍 |
| --- | --- | --- | --- |
| chat 主入口 | T3 Code | Conductor 心智 | 直接采用 |
| provider 绑定 | T3 Code | - | 直接采用 |
| provider 输出展示 | T3 Code | Superset 工程分层 | 适配吸收 |
| conversation-bound worktree | Superset | Conductor 心智 | 适配吸收 |
| diff / git / files / terminal | Superset | - | 适配吸收 |
| typed IPC / 本地数据层 | Superset | - | 直接采用 |
| 产品边界 | TeamCow 自身 | 参考仓库仅辅助 | 不照搬 |

## 一句话结论

TeamCow 的参考策略是：

**借用 T3 Code 的交互骨架，吸收 Superset 的工程与工作台能力，再用 TeamCow 自己的 `chat-first + conversation-bound worktree` 产品边界重新裁剪。**
