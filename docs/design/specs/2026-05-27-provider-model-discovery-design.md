# Provider Model Discovery 设计方案

## 概述

TeamCow 的 provider model 发现采用三层架构：静态 Catalog（兜底）+ 动态发现（运行时）+ 用户自定义（灵活性）。三层按优先级合并，确保用户始终能看到可用的模型列表。

## 目标

1. Catalog 准确反映 2026 年 5 月各 provider 的主流模型
2. 动态发现利用 CLI 工具的原生能力获取实时模型列表
3. 用户可手动输入任意 model ID 应对非标准场景
4. 发现失败不阻塞，静默降级到下一层

## 架构

```
┌─────────────────────────────────────────────────┐
│              Model Selection UI                  │
│  (下拉列表 + 自定义输入 + source badge)          │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│         Model Resolution Layer (main)            │
│  合并 + 去重 + 排序 + 缓存                       │
└──┬──────────────┬──────────────────┬────────────┘
   │              │                  │
   ▼              ▼                  ▼
┌────────┐  ┌───────────┐  ┌──────────────┐
│ Native │  │  Config   │  │   Static     │
│  List  │  │  Derived  │  │   Catalog    │
└────────┘  └───────────┘  └──────────────┘
 codex:       claude:        所有 provider:
 debug models env/settings   硬编码兜底
 opencode:
 models
```

### 优先级（高到低）

1. `user-custom` — 用户手动添加的模型
2. `native-list` — CLI 命令动态获取
3. `config-derived` — 从 config 文件/环境变量推断
4. `fallback` — 静态 catalog

同 ID 模型去重时保留高优先级来源。

## 静态 Catalog

```typescript
export const PROVIDER_MODEL_CATALOG: Record<ProviderKind, ProviderModelOption[]> = {
  claude: [
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", detail: "日常编码推荐，快速高效。", cliModel: "sonnet", isDefault: true },
    { id: "claude-opus-4-7", label: "Opus 4.7", detail: "最强推理能力，适合复杂架构和实现。", cliModel: "opus" },
    { id: "claude-haiku-4-5", label: "Haiku 4.5", detail: "轻量快速，适合简单任务和高频调用。", cliModel: "haiku" },
  ],
  codex: [
    { id: "gpt-5.5", label: "GPT-5.5", detail: "最新旗舰模型，复杂编码与推理。", isDefault: true },
    { id: "gpt-5.4", label: "GPT-5.4", detail: "前旗舰，强推理与专业编码。" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", detail: "快速轻量，适合子代理和迭代。" },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", detail: "专业软件工程模型。" },
  ],
  opencode: [
    { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", detail: "Anthropic 日常编码模型。", isDefault: true },
    { id: "anthropic/claude-opus-4-7", label: "Claude Opus 4.7", detail: "Anthropic 最强推理模型。" },
    { id: "openai/gpt-4.1", label: "GPT-4.1", detail: "OpenAI 通用编码模型。" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", detail: "Google 推理模型。" },
  ],
}
```

### Catalog 维护策略

- Catalog 只包含各 provider 最主流的 4-5 个模型
- 随 TeamCow 版本更新同步维护
- 不追求覆盖所有模型，动态发现和用户自定义补充长尾

## 动态发现

### Codex — `codex debug models`

最强发现能力。返回结构化 JSON：

```json
{
  "models": [
    {
      "slug": "gpt-5.5",
      "display_name": "GPT-5.5",
      "description": "Frontier model for complex coding...",
      "priority": 0,
      "visibility": "list",
      "supported_reasoning_levels": [...],
      "context_window": 200000,
      ...
    }
  ]
}
```

**解析规则：**
- 过滤 `visibility !== "list"` 的模型（如 `codex-auto-review`）
- 按 `priority` 升序排列，最小值为默认
- 提取 `slug` → id, `display_name` → label, `description` → detail
- 标注 `source: "native-list"`

**Zod schema 校验：**

```typescript
const CodexModelSchema = z.object({
  slug: z.string(),
  display_name: z.string(),
  description: z.string().optional(),
  priority: z.number(),
  visibility: z.string(),
})

const CodexModelsResponseSchema = z.object({
  models: z.array(CodexModelSchema),
})
```

校验失败时静默降级到 catalog。

### OpenCode — `opencode models`

返回纯文本，每行一个 model ID：

```
opencode/big-pickle
opencode/deepseek-v4-flash-free
opencode/nemotron-3-super-free
modelget/GPT-5.4
```

**解析规则：**
- 按行分割，过滤空行
- 每行作为 model ID，同时作为 label（取 `/` 后面部分作为 display label）
- 第一行标记为默认
- 标注 `source: "native-list"`

### Claude Code — Config 推断

Claude Code 没有 model list 命令，通过读取配置推断：

**来源（按优先级）：**
1. `ANTHROPIC_MODEL` 环境变量
2. `~/.claude/settings.json` → `model` 字段
3. `ANTHROPIC_DEFAULT_OPUS_MODEL` / `ANTHROPIC_DEFAULT_SONNET_MODEL` / `ANTHROPIC_DEFAULT_HAIKU_MODEL` 环境变量

**处理逻辑：**
- 发现的 model 如果是 alias（`sonnet`/`opus`/`haiku`），映射到 catalog 中对应的完整 ID
- 如果是未知 ID，作为新条目加入列表
- 标注 `source: "config-derived"`
- 与 catalog 合并时，config-derived 的模型排在前面（用户明确配置的优先展示）

## 用户自定义 Model

### 存储

在 `app_settings` 表中存储，key 为 `custom_models_{providerKind}`，value 为 JSON 数组：

```json
[
  { "id": "gpt-5.3-codex-spark", "label": "GPT-5.3 Codex Spark", "addedAt": "2026-05-27T10:00:00Z" }
]
```

### UI 交互

- Model 下拉列表底部显示分隔线 + "添加自定义模型..." 入口
- 点击后弹出输入框，输入 model ID
- label 自动从 ID 生成（去前缀、首字母大写），用户可编辑
- 已添加的自定义模型在列表中显示，hover 时出现删除按钮
- 自定义模型标注 `source: "user-custom"` badge

### 约束

- 自定义模型不做可用性校验（用户自行负责）
- 运行时如果 provider 报错 model 不存在，在 UI 上展示错误但不自动删除

## 缓存策略

- 动态发现结果在 main 进程内存缓存
- 默认 TTL：5 分钟
- 用户点击 refresh 按钮强制刷新（清除缓存 + 重新发现）
- App 启动时触发一次发现
- Provider readiness 变化时（如从 unavailable → ready）自动触发对应 provider 的发现

## UI 展示

### Model 列表分组

```
── 动态发现 ──────────────────
  ● GPT-5.5          [默认]
    GPT-5.4
    GPT-5.4 Mini
    GPT-5.3 Codex
── 自定义 ────────────────────
    GPT-5.3 Codex Spark    ✕
── ───────────────────────────
  + 添加自定义模型...
```

- 如果动态发现成功，只显示发现结果（不重复显示 catalog）
- 如果动态发现失败，显示 catalog 兜底列表
- 自定义模型始终显示在独立分组
- 每个模型可选显示 source badge（subtle，不喧宾夺主）

### Source Badge

| Source | Badge | 含义 |
|--------|-------|------|
| native-list | 无 | 来自 CLI 工具的实时列表 |
| config-derived | `配置` | 从用户 config 文件推断 |
| fallback | `内置` | 静态 catalog 兜底 |
| user-custom | `自定义` | 用户手动添加 |

## 类型变更

### ProviderModelSource 扩展

```typescript
// 现有
export type ProviderModelSource = "native-list" | "config-derived" | "fallback"

// 新增
export type ProviderModelSource = "native-list" | "config-derived" | "fallback" | "user-custom"
```

### ProviderModelOption 扩展

```typescript
export interface ProviderModelOption {
  id: string
  label: string
  detail?: string
  source?: ProviderModelSource
  cliModel?: string    // CLI 实际使用的 model 标识（如 claude 的 alias）
  isDefault?: boolean
  addedAt?: string     // user-custom 专用，ISO 时间戳
}
```

## 错误处理

| 场景 | 行为 |
|------|------|
| `codex debug models` 超时（>5s） | 降级到 catalog |
| `codex debug models` JSON 解析失败 | 降级到 catalog |
| `opencode models` 返回空 | 降级到 catalog |
| Claude config 文件不存在 | 只用 catalog |
| 用户自定义 model 运行时报错 | 展示错误，不删除 |
| Provider 本身 unavailable | 不触发发现，列表显示 catalog（灰色） |

## 影响范围

### 需要修改的文件

1. `packages/shared-types/src/index.ts` — 更新 catalog、扩展类型
2. `apps/desktop/src/main/services/provider-runtime-service.ts` — 重写 `listProviderModels`
3. `apps/desktop/src/renderer/domains/providers/provider-store.ts` — 适配新的 model 列表结构
4. `apps/desktop/src/renderer/components/DesktopShell.tsx` — model 选择 UI 增加自定义入口和分组
5. `packages/db/src/schema.ts` — 可能需要加 custom_models 相关存储（或复用 app_settings）

### 不需要改动的

- Provider readiness 检测逻辑（独立于 model 发现）
- Conversation/run 的 model 字段存储方式（仍然是 text）
- IPC channel 结构（`listProviderModels` 接口不变，只是返回内容更丰富）
