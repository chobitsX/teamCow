# Chat Provider Output Assessment 设计方案

## 概述

本设计评估 TeamCow 中间栏 chat 与 Codex、Claude Code、OpenCode provider 的交互、模型选择、输出保真和默认展示策略。结论采用“事件事实源 + 简洁 Chat”的路线：`run_events` 保留 provider 输出事实，主 chat 只展示用户做判断所需的摘要、assistant 正文、关键状态和可操作结果；详细工具信息、raw payload 和长输出默认折叠或进入 inspector/debug 路径。

本方案不进入具体代码实施计划。后续如需要实现，应基于本文再拆 implementation plan。

## 当前判断

### 已经做对的部分

- Provider 主链路已经是 `renderer -> typed IPC -> ProjectService -> ProviderRuntimeService -> local CLI`，renderer 没有直接执行本地 CLI。
- Codex、Claude Code、OpenCode 都已经通过本地 CLI 接入，并把输出归一化为 `run.started`、`run.message.delta`、`run.progress`、`run.completed`、`run.error` 等事件。
- 数据层已经具备 `conversation_messages`、`execution_runs`、`run_events`、`artifacts` 四类核心记录，足以承载历史、流式事件和结果审查。
- Renderer 已经有 `buildChatRenderItems()`，能区分 user message、provider message、system summary、tool event 和 raw fallback。
- Model discovery 不是纯静态：Codex 使用 `codex debug models`，OpenCode 使用 `opencode models`，Claude Code 使用配置/环境变量推断并合并 fallback/user-custom。
- 并行 conversation、事件隔离、active timeline stale guard 和 stop run 的基础能力已经存在。

### 主要不合理点

1. **事实源边界不清。** 当前 `run_events` 存储流式事件，但 `conversation_messages` 仍保存 assistant 可读文本；两者之间缺少明确主从关系。
2. **assistant 历史缓存有缺失风险。** 在流式模式下，provider 事件可通过 `onEvent` 先写入 `run_events`，而 `ProviderRuntimeService.runProvider()` 可能在 final result 中清空已推送事件。`ProjectService.persistProviderRun()` 又从 final `providerRun.events` 拼 assistantText，可能导致历史 `conversation_messages` 没有 assistant 内容。
3. **事件分类过粗。** `run.progress` 同时承载普通进度、工具调用、权限、文件操作和 provider 原始语义。Renderer 目前默认把非 summary/prose 的 progress 映射成 tool event，容易把普通内部事件展示得像真实工具动作。
4. **主 chat 噪声偏大。** System summary 和 raw fallback 的入口存在是正确的，但默认展示策略还没有清楚区分“用户需要知道”和“调试时才需要看”。
5. **model 规则与项目规则有冲突。** 旧规则强调 conversation 创建后绑定单一 model，但当前产品期望和现有 composer 都支持 model selector。需要把锁点修正为 provider/worktree，而不是 model。
6. **模型来源可信度展示不够。** Fallback catalog 是兜底，不等于 provider 实时可用。Claude Code 没有稳定 native list 时，UI 必须明确来源为配置、内置或自定义。
7. **运行中控制态需要固化。** Provider 正在运行时，用户不能发送新消息，也不能切换 model；发送按钮应变成停止当前 run 的按钮。

## 产品规则

### Conversation 锁点

Conversation 创建后锁定：

- `provider`
- `worktree`

Conversation 不锁定：

- `model`

`currentModel` 表示下一轮默认模型。每次发送消息时，系统把当时选择的 model 固化到 `execution_runs.model` 和相关 `conversation_messages.model`。历史 UI 必须展示每轮实际使用的 model，避免用户误以为整条 conversation 都使用当前 selector 的模型。

### 运行中控制态

当 conversation `runStatus === "running"`：

- composer 不能发送新消息。
- model selector 禁用。
- send button 变成 stop button。
- stop 只取消当前 conversation 的 active run。
- 用户仍可以切换 conversation、查看历史、打开 inspector 和 terminal。

当 run 结束为 completed、failed 或 unavailable 后：

- composer 恢复可输入。
- model selector 恢复可切换。
- 下一条消息使用当前 selector 的 model。

## 数据设计

### 事实源

`run_events` 是 provider 输出事实源。任何 provider 原始输出必须先通过 adapter normalizer 变成标准事件，再入库。Streaming、历史回看、inspector 摘要和 chat render 都应能从 `run_events + artifacts` 重建。

`conversation_messages` 是可读消息缓存。它保存：

- 用户输入消息。
- 从 provider text events 派生出的 assistant 可读消息。

`conversation_messages` 不能作为判断 provider 输出是否完整的唯一依据。assistant message 缓存缺失时，renderer 应仍能从 `run.message.delta` / `run.message.completed` / provider text events 重建显示。

### Run 记录

`execution_runs` 是每一轮执行的固定上下文：

- `conversationId`
- `provider`
- `model`
- `worktreeId`
- `status`
- timestamps

同一 conversation 内多轮可以使用不同 model，但每个 run 的 model 固定。

### Artifacts

`artifacts` 应承载可审查结果，而不是让 chat 消息承担所有细节：

- changed files
- diff summary
- generated files
- command/test summary
- reviewable references

Chat 中只显示短卡片和动作入口，例如 `3 files changed · Review diff`。

## 标准事件显示分类

当前可以先在 render assembler 中推导显示分类，后续再考虑固化为 shared schema。

| Display class | 典型来源 | 默认展示 |
| --- | --- | --- |
| `assistant_text` | `run.message.delta`、`run.message.completed`、provider text block | 主 chat assistant bubble，支持 markdown/code |
| `run_lifecycle` | `run.started`、`run.status`、`run.completed`、`run.error` | 短状态条；失败要可展开详情 |
| `tool_activity` | file/read/edit/search/command/permission/tool_use/tool_result | 默认折叠，按阶段或 run 聚合 |
| `artifact_reference` | changed files、diff summary、file reference、test summary | 可点击结果卡片，跳 inspector |
| `provider_notice` | model/session/context/auth/permission/provider capability notice | 只展示用户必须知道的短提示 |
| `debug_raw` | unknown event、malformed JSON、raw payload、长 stdout/stderr | 默认隐藏，通过 raw/debug 入口查看 |

保真原则：事件不能丢，但主 chat 不等于审计日志。

## Chat 默认 UI

中间栏默认是 coding conversation，而不是 terminal log。

默认展示：

- 用户消息。
- Assistant 正文。
- 简短生命周期状态。
- 聚合后的工具活动摘要。
- 可操作结果卡片。
- 简短错误摘要和修复入口。

默认折叠：

- 完整工具输入。
- 完整工具输出。
- provider raw JSON。
- 长 stdout/stderr。
- malformed payload。
- parser diagnostic。
- 内部推理/思考过程类信息。

推荐交互：

- 工具活动以一条折叠摘要展示，例如“读取 5 个文件 / 修改 2 个文件 / 运行 1 条命令”。
- 展开后显示较短结构化详情；更完整 raw 进入 debug/raw area。
- Diff、Files、Git、Terminal 等审查动作始终引导到右侧 inspector。
- 错误主文案说明 provider、run 状态和短原因；完整 envelope、stderr、raw payload 折叠。

## Provider Adapter 要求

每条 normalized event payload 至少包含：

- `provider`
- `conversationId`
- `runId`
- `worktreeId`
- `worktreeRootPath`
- `rawType`

如存在 provider 原始语义，应保留 `raw`，但必须经过脱敏和体积限制。

错误事件还应包含：

- `message`
- `stderr`，如果有
- `status`，如果有
- `code`，如果有
- `subtype`，如果有

Adapter 应尽量提取这些稳定字段：

- assistant text
- tool name/status/input/output summary
- file path
- command name/status
- changed files/diff summary
- usage/token summary
- provider session id/thread id
- permission/approval status

提取失败时不丢 raw，进入 `debug_raw`。

## Model 获取与展示

模型列表按来源优先级合并：

1. `user-custom`
2. `native-list`
3. `config-derived`
4. `fallback`

要求：

- Codex 优先 `codex debug models`。
- OpenCode 优先 `opencode models`。
- Claude Code 若没有稳定 native list，则明确显示配置推断、内置 fallback 或用户自定义。
- Fallback catalog 只表示 TeamCow 内置兜底，不表示当前账号或 provider 一定可用。
- 用户选择 custom model 后不做预先可用性保证；运行失败时保留 run 输出和错误。
- Model source badge 要弱提示，不喧宾夺主，但必须可被用户理解。

Codex 参考心智：官方 Codex 文档中，CLI active thread 支持通过 `/model` 临时切换模型，IDE extension 在输入框下方提供 model selector。TeamCow 采用类似心智，但按本产品规则限制为非 running 状态可切换。

## 错误与恢复

Provider 失败时：

- 保留已收到的 `run_events`。
- 最终追加 failed/unavailable terminal event。
- conversation 状态更新为 failed 或 unavailable。
- chat 显示短错误摘要。
- raw/debug 入口可查看脱敏后的详细 payload。
- 用户可以调整 model 后继续同一 conversation，也可以新建 conversation 换 provider 或 worktree。

取消 run 时：

- stop 只作用于当前 active run。
- 追加 `run.status` 或 `run.error`，reason 为 cancelled-by-user 或等价结构。
- 不删除已接收输出。
- composer 恢复可输入和可切换 model。

## 测试验收

### Provider Runtime

每个 provider 至少覆盖：

- assistant text 被提取为 text event。
- tool activity 被保留为结构化摘要和 raw。
- malformed JSON / unknown event 不丢失。
- non-zero exit / auth failure / no terminal event 产生 failed/unavailable。
- envelope 字段完整。
- secrets 和超长 payload 被脱敏/截断。

### Persistence And Assembly

必须覆盖：

- streaming `onEvent` 写入后，final result 不会重复写入同一事件。
- streaming `onEvent` 写入后，即使 final result 清空 events，assistant 可读内容仍能从 `run_events` 重建。
- `conversation_messages` 的 assistant 缓存缺失不影响 chat 历史显示。
- 多 run、多 conversation 的 delta 不串线。
- 每个 run 的 model 是发送时的 model。

### Renderer

必须覆盖：

- running 时 send button 变 stop。
- running 时 composer 不允许发送新消息。
- running 时 model selector 禁用。
- non-running 时 model selector 可切换，且只影响下一轮。
- tool/raw 默认折叠。
- assistant text 默认展开。
- diff/files result card 可跳 inspector。
- failed event 显示短摘要，详情折叠。

## 建议优先级

1. 修正事实源边界：让 chat render 以 events 为主，assistant message 作为派生缓存。
2. 修正 streaming assistant 缓存缺失风险。
3. 为 render assembler 增加 display classification。
4. 调整 chat 默认折叠策略，降低 `run.progress` 噪声。
5. 固化 running composer control：禁发、禁 model switch、显示 stop。
6. 为模型来源增加可信度提示，尤其是 Claude fallback/config-derived。
7. 为 artifacts 到 inspector 的结果卡片补齐一致交互。

## 不在本方案范围

- 不拆 `packages/provider-*` 新包。
- 不新增 provider 专用 DB 表。
- 不重做三栏布局。
- 不实现复杂 permission approval UI。
- 不实现 compare 视图重设计。
- 不把 terminal 变成 provider stdout/stderr 主展示通道。
- 不进入具体实施计划或代码修改。

## 参考

- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/ux-implementation-constraints.md`
- `_bmad-output/implementation-artifacts/2-4-打通-codex-cli-的首条端到端运行链路.md`
- `_bmad-output/implementation-artifacts/2-5-结构化渲染-chat-核心流并提供最小原始兜底.md`
- `_bmad-output/implementation-artifacts/3-3-接入-claude-code-adapter.md`
- `_bmad-output/implementation-artifacts/3-4-接入-opencode-adapter.md`
- `_bmad-output/implementation-artifacts/3-5-支持多-conversation-并行运行与事件隔离.md`
- `docs/design/research/t3code-findings.md`
- `docs/design/research/superset-findings.md`
- OpenAI Codex manual, Model selection and Codex app features sections, fetched 2026-06-17
