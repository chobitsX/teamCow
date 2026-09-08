# Provider 模型目录

核对日期：2026-09-07。`packages/shared-types/src/index.ts` 中的 `PROVIDER_MODEL_CATALOG` 是原生发现失败时使用的精选内置目录，不代表用户账户一定有权使用所有模型。

## 当前内置模型

| Provider | 内置目录 | 默认项 |
| --- | --- | --- |
| Codex | GPT-6 Astra、GPT-5.6 Sol / Terra / Luna、GPT-5.5、GPT-5.3 Codex Spark | GPT-6 Astra |
| Claude Code | Auto、Fable 5.1 / 5、Opus 5 / 4.8、Sonnet 5、Haiku 4.5 | Auto，跟随 CLI 账户默认值 |
| OpenCode | Anthropic Fable 5.1 / Opus 5 / Sonnet 5 / Haiku 4.5；OpenAI GPT-6 Astra / GPT-5.6 Sol / Terra / Luna；Google Gemini 3.8 Flash / 3.1 Pro Preview | Claude Sonnet 5 |
| Cursor | Auto、Cursor Grok 4.6、Composer 2.5 | Auto，跟随 CLI 账户默认值 |

## 发现与退役规则

- Codex 优先使用 `codex debug models` 的可见列表及原生顺序。GPT-5.4 和 GPT-5.4 Mini 于 2026-08-31 从 ChatGPT 登录方式的 Codex 退役，GPT-5.2 和 GPT-5.3 Codex 此前已被弃用。这四个 ID 不进入内置推荐；当原生列表或配置仍带有它们，且 `codex login status` 明确确认 ChatGPT 登录时，从选择器发现结果中移除，并重选默认项。
- 上述 Codex 退役规则不套用于 API Key、自定义网关、OpenCode 或 Cursor。认证状态未知或检查失败时保留原生结果。明确添加的自定义模型仍保留；不会改写旧 conversation 的 model、CLI 配置或数据库记录。
- OpenCode 在应用的五分钟模型缓存失效后通过 `opencode models --refresh` 刷新 models.dev 缓存；刷新失败时尝试 `opencode models` 本地列表，最后使用内置目录。仅解析 `provider/model` 行，忽略刷新状态和 ANSI 颜色码。账户已配置的原生 provider 和自定义模型保持优先。
- OpenCode 的旧 Sonnet 4.6 / Opus 4.7 / GPT-4.1 / Gemini 2.5 Pro 由当前系列替换为精选推荐，不把“从内置推荐移除”等同于上游正式退役。上游仍返回的可用旧模型会保留。
- Claude 使用精确模型 ID；Fable 5、Opus 4.8 和 Haiku 4.5 仍为 Active，保留兼容选择。Fable 5.1 要求 Claude Code 2.1.255+，模型说明中标明此条件；账户权限由 Claude Code 处理。
- Cursor 优先使用 `cursor-agent --list-models` 返回的精确 ID，包括模型专属的 effort / fast 后缀；不借用其他 provider 的退役规则。

## 官方依据

- [OpenAI：Codex 模型与退役范围](https://learn.chatgpt.com/docs/models)
- [OpenAI：API 模型弃用公告](https://developers.openai.com/api/docs/deprecations)
- [Anthropic：当前模型及精确 ID](https://platform.claude.com/docs/en/models/overview)
- [Anthropic：模型生命周期](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- [Claude Code：模型配置和别名](https://code.claude.com/docs/en/model-config)
- [OpenCode：模型来源](https://opencode.ai/docs/models/)、[CLI 模型缓存刷新](https://opencode.ai/docs/cli/)
- [Google：Gemini 模型](https://ai.google.dev/gemini-api/docs/models)、[退役日期](https://ai.google.dev/gemini-api/docs/deprecations)
- [Cursor：当前模型](https://prod.cursor.com/docs/models-and-pricing)

本次还用本地 OpenCode 1.17.11 刷新后的 models.dev 目录核对了新增 OpenCode ID，并用 Cursor CLI 的原生列表核对了 `cursor-grok-4.6-high`。
