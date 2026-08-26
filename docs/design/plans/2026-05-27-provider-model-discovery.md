# Provider Model Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现三层 provider model 发现架构：更新静态 catalog、增强动态发现（codex debug models / opencode models / claude config）、支持用户自定义 model。

**Architecture:** 在 `packages/shared-types` 扩展类型与 catalog；在 `provider-runtime-service.ts` 重写 `listProviderModels` 函数，按 provider 分发到独立的 discovery 函数，加 5 分钟内存缓存；新增 `customModelsService` 管理用户自定义 model（存入 `app_settings` 表）；renderer 端 `shell-store.ts` 支持自定义 model 的增删；UI 增加分组展示和自定义入口。

**Tech Stack:** TypeScript + zod (类型校验) + better-sqlite3 + drizzle-orm (存储) + React (UI) + i18next (i18n) + vitest (测试)

**Spec:** `docs/design/specs/2026-05-27-provider-model-discovery-design.md`

---

## File Structure

### Modify
- `packages/shared-types/src/index.ts` — 扩展 `ProviderModelSource` 加 `user-custom`，扩展 `ProviderModelOption` 加 `addedAt` 字段，更新 `PROVIDER_MODEL_CATALOG` 为 2026-05 最新模型，新增 `customModelEntrySchema` / `addCustomModelInputSchema` / `removeCustomModelInputSchema`，并把对应 IPC command/result schema 加进去
- `apps/desktop/src/main/services/provider-runtime-service.ts` — 重写 `listProviderModels`，分离三个 provider 的 discovery 子函数，加 TTL 缓存
- `apps/desktop/src/main/desktop-router.ts` — 新增 `addCustomModel` / `removeCustomModel` IPC routes
- `apps/desktop/src/preload/index.ts`（或 preload 入口）— 暴露 `addCustomModel` / `removeCustomModel`
- `apps/desktop/src/renderer/app/shell/shell-store.ts` — 适配新返回结构，加 `addCustomModel` / `removeCustomModel` 方法
- `apps/desktop/src/renderer/app/shell/DesktopShell.tsx` — model 选择 UI 加自定义分组、添加入口、删除按钮、source badge
- `packages/i18n-resources/src/en/shell.json` 和 `packages/i18n-resources/src/zh/shell.json` — 新增自定义 model 相关文案

### Create
- `apps/desktop/src/main/services/custom-models-service.ts` — 自定义 model 持久化服务
- `apps/desktop/src/main/services/__tests__/custom-models-service.test.ts` — 单元测试
- `apps/desktop/src/main/services/__tests__/provider-runtime-service.list-models.test.ts` — `listProviderModels` 三层逻辑测试

---

## Task 1: 扩展共享类型与更新 Catalog

**Files:**
- Modify: `packages/shared-types/src/index.ts:11-39`

- [ ] **Step 1.1: 扩展 `providerModelSourceSchema` 加 `user-custom`**

修改 `packages/shared-types/src/index.ts:11`：

```typescript
export const providerModelSourceSchema = z.enum(["native-list", "config-derived", "fallback", "user-custom"])
export type ProviderModelSource = z.infer<typeof providerModelSourceSchema>
```

- [ ] **Step 1.2: 扩展 `providerModelOptionSchema` 加 `addedAt`**

修改 `packages/shared-types/src/index.ts:14-22`：

```typescript
export const providerModelOptionSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  detail: z.string().trim().min(1),
  source: providerModelSourceSchema.optional(),
  cliModel: z.string().trim().min(1).optional(),
  isDefault: z.boolean().optional(),
  addedAt: z.string().datetime().optional()
})
export type ProviderModelOption = z.infer<typeof providerModelOptionSchema>
```

- [ ] **Step 1.3: 更新 `PROVIDER_MODEL_CATALOG` 为 2026-05 最新模型**

替换 `packages/shared-types/src/index.ts:24-36`：

```typescript
export const PROVIDER_MODEL_CATALOG: Record<ProviderKind, ProviderModelOption[]> = {
  claude: [
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", detail: "日常编码推荐，快速高效。", cliModel: "sonnet", isDefault: true },
    { id: "claude-opus-4-7", label: "Opus 4.7", detail: "最强推理能力，适合复杂架构和实现。", cliModel: "opus" },
    { id: "claude-haiku-4-5", label: "Haiku 4.5", detail: "轻量快速，适合简单任务和高频调用。", cliModel: "haiku" }
  ],
  codex: [
    { id: "gpt-5.5", label: "GPT-5.5", detail: "最新旗舰模型，复杂编码与推理。", isDefault: true },
    { id: "gpt-5.4", label: "GPT-5.4", detail: "前旗舰，强推理与专业编码。" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", detail: "快速轻量，适合子代理和迭代。" },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", detail: "专业软件工程模型。" }
  ],
  opencode: [
    { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", detail: "Anthropic 日常编码模型。", isDefault: true },
    { id: "anthropic/claude-opus-4-7", label: "Claude Opus 4.7", detail: "Anthropic 最强推理模型。" },
    { id: "openai/gpt-4.1", label: "GPT-4.1", detail: "OpenAI 通用编码模型。" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", detail: "Google 推理模型。" }
  ]
}
```

- [ ] **Step 1.4: 新增 customModelEntrySchema 和 IPC schema**

在 `packages/shared-types/src/index.ts` 紧跟 `isValidModelForProvider` 之后追加：

```typescript
export const customModelEntrySchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  detail: z.string().trim().min(1).optional(),
  addedAt: z.string()
})
export type CustomModelEntry = z.infer<typeof customModelEntrySchema>

export const addCustomModelInputSchema = z.object({
  providerKind: providerKindSchema,
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(80).optional(),
  detail: z.string().trim().min(1).max(200).optional()
})
export type AddCustomModelInput = z.infer<typeof addCustomModelInputSchema>

export const removeCustomModelInputSchema = z.object({
  providerKind: providerKindSchema,
  id: z.string().trim().min(1)
})
export type RemoveCustomModelInput = z.infer<typeof removeCustomModelInputSchema>

export const customModelMutationResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    models: z.array(providerModelOptionSchema)
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type CustomModelMutationResult = z.infer<typeof customModelMutationResultSchema>
```

注意：`appErrorSchema` 定义在文件后面，所以 `customModelMutationResultSchema` 必须放在 `appErrorSchema` 之后；如果当前位置在前，先放 `customModelEntrySchema` / `addCustomModelInputSchema` / `removeCustomModelInputSchema`，把 `customModelMutationResultSchema` 放到 `appErrorSchema` 定义之后。

- [ ] **Step 1.5: 在 appErrorCodeSchema 中加新错误码**

修改 `packages/shared-types/src/index.ts:85-105`，在 enum 数组末尾（`INTERNAL_ERROR` 之前）加入：

```typescript
"CUSTOM_MODEL_DUPLICATE",
"CUSTOM_MODEL_NOT_FOUND",
"CUSTOM_MODEL_LIMIT_EXCEEDED",
```

- [ ] **Step 1.6: 运行 typecheck**

```bash
yarn typecheck
```

期望：通过。如果有 schema 引用顺序错误，调整定义顺序。

- [ ] **Step 1.7: 提交**

```bash
git add packages/shared-types/src/index.ts
git commit -m "feat(shared-types): extend provider model types with user-custom and refresh catalog"
```

---

## Task 2: 创建 customModelsService

**Files:**
- Create: `apps/desktop/src/main/services/custom-models-service.ts`
- Test: `apps/desktop/src/main/services/__tests__/custom-models-service.test.ts`

- [ ] **Step 2.1: 写失败测试**

创建 `apps/desktop/src/main/services/__tests__/custom-models-service.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { createCustomModelsService } from "../custom-models-service"

type StoredRow = { key: string; value: string; updatedAt: string }

const createInMemoryStore = () => {
  const rows = new Map<string, StoredRow>()
  return {
    rows,
    get: (key: string) => rows.get(key) ?? null,
    upsert: (key: string, value: string, updatedAt: string) => {
      rows.set(key, { key, value, updatedAt })
    },
    delete: (key: string) => {
      rows.delete(key)
    }
  }
}

describe("customModelsService", () => {
  let store: ReturnType<typeof createInMemoryStore>
  let service: ReturnType<typeof createCustomModelsService>

  beforeEach(() => {
    store = createInMemoryStore()
    service = createCustomModelsService({
      store,
      now: () => "2026-05-27T10:00:00.000Z"
    })
  })

  it("returns empty list when no custom models stored", () => {
    expect(service.list("codex")).toEqual([])
  })

  it("adds a custom model and returns the new list", () => {
    const result = service.add({
      providerKind: "codex",
      id: "gpt-5.3-codex-spark",
      label: "GPT-5.3 Codex Spark"
    })

    expect(result.status).toBe("ok")
    expect(service.list("codex")).toEqual([
      {
        id: "gpt-5.3-codex-spark",
        label: "GPT-5.3 Codex Spark",
        detail: "用户自定义模型。",
        addedAt: "2026-05-27T10:00:00.000Z"
      }
    ])
  })

  it("rejects duplicate IDs with CUSTOM_MODEL_DUPLICATE", () => {
    service.add({ providerKind: "codex", id: "model-a", label: "Model A" })
    const result = service.add({ providerKind: "codex", id: "model-a", label: "Model A2" })

    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.error.code).toBe("CUSTOM_MODEL_DUPLICATE")
    }
  })

  it("auto-derives label from id when not provided", () => {
    service.add({ providerKind: "opencode", id: "anthropic/claude-3-5-haiku" })
    expect(service.list("opencode")[0]?.label).toBe("claude-3-5-haiku")
  })

  it("removes a custom model by id", () => {
    service.add({ providerKind: "codex", id: "model-a", label: "Model A" })
    service.add({ providerKind: "codex", id: "model-b", label: "Model B" })

    const result = service.remove({ providerKind: "codex", id: "model-a" })
    expect(result.status).toBe("ok")
    expect(service.list("codex")).toHaveLength(1)
    expect(service.list("codex")[0]?.id).toBe("model-b")
  })

  it("returns CUSTOM_MODEL_NOT_FOUND when removing missing id", () => {
    const result = service.remove({ providerKind: "codex", id: "nope" })
    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.error.code).toBe("CUSTOM_MODEL_NOT_FOUND")
    }
  })

  it("rejects more than 50 custom models per provider with CUSTOM_MODEL_LIMIT_EXCEEDED", () => {
    for (let index = 0; index < 50; index += 1) {
      service.add({ providerKind: "codex", id: `model-${index}` })
    }
    const result = service.add({ providerKind: "codex", id: "model-overflow" })
    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.error.code).toBe("CUSTOM_MODEL_LIMIT_EXCEEDED")
    }
  })

  it("isolates custom models per provider", () => {
    service.add({ providerKind: "codex", id: "shared-id", label: "Codex" })
    service.add({ providerKind: "claude", id: "shared-id", label: "Claude" })
    expect(service.list("codex")).toHaveLength(1)
    expect(service.list("claude")).toHaveLength(1)
    expect(service.list("opencode")).toHaveLength(0)
  })

  it("recovers gracefully from corrupted JSON in store", () => {
    store.upsert("custom_models_codex", "{not json", "2026-05-27T00:00:00.000Z")
    expect(service.list("codex")).toEqual([])
  })
})
```

- [ ] **Step 2.2: 运行测试，确认失败**

```bash
yarn workspace @teamcow/desktop test -- custom-models-service
```

期望：FAIL（"createCustomModelsService is not a function" 之类）。

- [ ] **Step 2.3: 实现 customModelsService**

创建 `apps/desktop/src/main/services/custom-models-service.ts`：

```typescript
import {
  customModelEntrySchema,
  addCustomModelInputSchema,
  removeCustomModelInputSchema,
  type AddCustomModelInput,
  type AppError,
  type CustomModelEntry,
  type ProviderKind,
  type RemoveCustomModelInput
} from "@shared/index"

export type CustomModelMutationOutcome =
  | { status: "ok"; entries: CustomModelEntry[] }
  | { status: "error"; error: AppError }

export type CustomModelsStore = {
  get: (key: string) => { value: string } | null
  upsert: (key: string, value: string, updatedAt: string) => void
  delete: (key: string) => void
}

export type CustomModelsServiceDeps = {
  store: CustomModelsStore
  now?: () => string
  maxPerProvider?: number
}

const STORE_KEY_PREFIX = "custom_models_"
const DEFAULT_MAX_PER_PROVIDER = 50

const buildStoreKey = (providerKind: ProviderKind) => `${STORE_KEY_PREFIX}${providerKind}`

const deriveLabel = (id: string): string => {
  const trimmed = id.trim()
  const tail = trimmed.includes("/") ? trimmed.slice(trimmed.lastIndexOf("/") + 1) : trimmed
  return tail.length > 0 ? tail : trimmed
}

const parseStoredEntries = (raw: string | undefined): CustomModelEntry[] => {
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.flatMap((value) => {
      const result = customModelEntrySchema.safeParse(value)
      return result.success ? [result.data] : []
    })
  } catch {
    return []
  }
}

export const createCustomModelsService = ({
  store,
  now = () => new Date().toISOString(),
  maxPerProvider = DEFAULT_MAX_PER_PROVIDER
}: CustomModelsServiceDeps) => {
  const readEntries = (providerKind: ProviderKind): CustomModelEntry[] => {
    const row = store.get(buildStoreKey(providerKind))
    return parseStoredEntries(row?.value)
  }

  const writeEntries = (providerKind: ProviderKind, entries: CustomModelEntry[]) => {
    store.upsert(buildStoreKey(providerKind), JSON.stringify(entries), now())
  }

  const list = (providerKind: ProviderKind): CustomModelEntry[] => readEntries(providerKind)

  const add = (input: AddCustomModelInput): CustomModelMutationOutcome => {
    const validated = addCustomModelInputSchema.safeParse(input)
    if (!validated.success) {
      return {
        status: "error",
        error: {
          code: "INTERNAL_ERROR",
          message: validated.error.message,
          suggestion: null
        }
      }
    }

    const { providerKind, id, label, detail } = validated.data
    const entries = readEntries(providerKind)

    if (entries.some((entry) => entry.id === id)) {
      return {
        status: "error",
        error: {
          code: "CUSTOM_MODEL_DUPLICATE",
          message: `Custom model "${id}" already exists.`,
          suggestion: null
        }
      }
    }

    if (entries.length >= maxPerProvider) {
      return {
        status: "error",
        error: {
          code: "CUSTOM_MODEL_LIMIT_EXCEEDED",
          message: `Cannot exceed ${maxPerProvider} custom models per provider.`,
          suggestion: null
        }
      }
    }

    const newEntry: CustomModelEntry = {
      id,
      label: label?.trim() || deriveLabel(id),
      detail: detail?.trim() || "用户自定义模型。",
      addedAt: now()
    }

    const next = [...entries, newEntry]
    writeEntries(providerKind, next)
    return { status: "ok", entries: next }
  }

  const remove = (input: RemoveCustomModelInput): CustomModelMutationOutcome => {
    const validated = removeCustomModelInputSchema.safeParse(input)
    if (!validated.success) {
      return {
        status: "error",
        error: {
          code: "INTERNAL_ERROR",
          message: validated.error.message,
          suggestion: null
        }
      }
    }

    const { providerKind, id } = validated.data
    const entries = readEntries(providerKind)
    const next = entries.filter((entry) => entry.id !== id)

    if (next.length === entries.length) {
      return {
        status: "error",
        error: {
          code: "CUSTOM_MODEL_NOT_FOUND",
          message: `Custom model "${id}" not found.`,
          suggestion: null
        }
      }
    }

    if (next.length === 0) {
      store.delete(buildStoreKey(providerKind))
    } else {
      writeEntries(providerKind, next)
    }
    return { status: "ok", entries: next }
  }

  return { list, add, remove }
}

export type CustomModelsService = ReturnType<typeof createCustomModelsService>
```

- [ ] **Step 2.4: 测试中 store 的 get 返回值改为对象**

测试代码使用 `rows.get(key) ?? null` 直接返回 `StoredRow | null`，而服务期望 `{ value: string } | null`。修改测试 helper 以匹配实际接口（已在 Step 2.1 给出 `get` 返回 `StoredRow`，`StoredRow` 包含 `value` 字段，所以兼容）。确认无需调整。

- [ ] **Step 2.5: 运行测试，确认通过**

```bash
yarn workspace @teamcow/desktop test -- custom-models-service
```

期望：所有测试 PASS。

- [ ] **Step 2.6: 提交**

```bash
git add apps/desktop/src/main/services/custom-models-service.ts apps/desktop/src/main/services/__tests__/custom-models-service.test.ts
git commit -m "feat(desktop): add custom models service for user-defined provider models"
```

---

## Task 3: 集成 customModelsService 到 db/services 装配

**Files:**
- Modify: 服务装配入口（按现有项目结构定位，通常在 `apps/desktop/src/main/services/index.ts` 或 `apps/desktop/src/main/main.ts`）

- [ ] **Step 3.1: 定位服务装配位置**

```bash
grep -rn "providerRuntimeService\s*=\|createProviderRuntimeService" apps/desktop/src/main --include="*.ts" -l
```

记录每个文件路径。读取主装配文件以确认现有 `services` 对象的结构。

- [ ] **Step 3.2: 在装配处构造 store adapter 并实例化 service**

在装配入口加：

```typescript
import { eq } from "drizzle-orm"
import { appSettingsTable } from "@teamcow/db"
import { createCustomModelsService } from "./services/custom-models-service"

const customModelsStore = {
  get: (key: string) => {
    const row = db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).get()
    return row ? { value: row.value } : null
  },
  upsert: (key: string, value: string, updatedAt: string) => {
    db.insert(appSettingsTable)
      .values({ key, value, updatedAt })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value, updatedAt }
      })
      .run()
  },
  delete: (key: string) => {
    db.delete(appSettingsTable).where(eq(appSettingsTable.key, key)).run()
  }
}

const customModelsService = createCustomModelsService({ store: customModelsStore })
```

加入 `services` 对象：

```typescript
const services = {
  // ...existing
  customModelsService
}
```

注意：变量名 `db` 应替换为实际的 drizzle 实例引用（按当前文件命名）；`@teamcow/db` 应替换为该项目使用的 db 包导入路径（按文件中已有 import 形式）。

- [ ] **Step 3.3: typecheck**

```bash
yarn typecheck
```

期望：通过。

- [ ] **Step 3.4: 提交**

```bash
git add apps/desktop/src/main
git commit -m "feat(desktop): wire custom models service into main process composition"
```

---

## Task 4: 重写 listProviderModels 三层逻辑

**Files:**
- Modify: `apps/desktop/src/main/services/provider-runtime-service.ts:1545-1615`
- Test: `apps/desktop/src/main/services/__tests__/provider-runtime-service.list-models.test.ts`

- [ ] **Step 4.1: 写失败测试 — Codex `debug models` 解析**

创建 `apps/desktop/src/main/services/__tests__/provider-runtime-service.list-models.test.ts`：

```typescript
import { describe, it, expect, vi } from "vitest"
import { createProviderRuntimeService } from "../provider-runtime-service"

const codexDebugModelsResponse = JSON.stringify({
  models: [
    {
      slug: "gpt-5.5",
      display_name: "GPT-5.5",
      description: "Frontier model.",
      priority: 0,
      visibility: "list"
    },
    {
      slug: "gpt-5.4",
      display_name: "GPT-5.4",
      description: "Strong everyday coding.",
      priority: 2,
      visibility: "list"
    },
    {
      slug: "codex-auto-review",
      display_name: "Auto Review",
      description: "internal",
      priority: 29,
      visibility: "hide"
    }
  ]
})

const buildRunCommandStub = (responses: Record<string, { stdout: string; status: number }>) =>
  vi.fn(async (command: string, args: string[]) => {
    const key = `${command} ${args.join(" ")}`.trim()
    const response = responses[key]
    if (!response) {
      return { stdout: "", stderr: "not stubbed", status: 1 }
    }
    return { stdout: response.stdout, stderr: "", status: response.status }
  })

const buildCustomModelsServiceStub = () => ({
  list: vi.fn(() => []),
  add: vi.fn(),
  remove: vi.fn()
})

describe("listProviderModels", () => {
  it("parses codex debug models JSON, sorts by priority, hides non-list visibility", async () => {
    const runCommand = buildRunCommandStub({
      "codex --version": { stdout: "codex 1.0.0", status: 0 },
      "codex debug models": { stdout: codexDebugModelsResponse, status: 0 }
    })
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: {},
      customModelsService: buildCustomModelsServiceStub()
    })

    const models = await service.listProviderModels("codex")

    expect(models.map((m) => m.id)).toEqual(["gpt-5.5", "gpt-5.4"])
    expect(models[0]?.source).toBe("native-list")
    expect(models[0]?.isDefault).toBe(true)
    expect(models[0]?.label).toBe("GPT-5.5")
  })

  it("falls back to catalog when codex debug models returns invalid JSON", async () => {
    const runCommand = buildRunCommandStub({
      "codex debug models": { stdout: "not json", status: 0 }
    })
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: {},
      customModelsService: buildCustomModelsServiceStub()
    })

    const models = await service.listProviderModels("codex")
    const sources = new Set(models.map((m) => m.source))
    expect(sources.has("fallback")).toBe(true)
    expect(models.find((m) => m.id === "gpt-5.5")).toBeDefined()
  })

  it("parses opencode models output as native-list", async () => {
    const runCommand = buildRunCommandStub({
      "opencode models": {
        stdout: "opencode/big-pickle\nopencode/deepseek\nmodelget/gpt-5.4\n",
        status: 0
      }
    })
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: {},
      customModelsService: buildCustomModelsServiceStub()
    })

    const models = await service.listProviderModels("opencode")
    expect(models.map((m) => m.id)).toEqual([
      "opencode/big-pickle",
      "opencode/deepseek",
      "modelget/gpt-5.4"
    ])
    expect(models[0]?.isDefault).toBe(true)
    expect(models[0]?.source).toBe("native-list")
  })

  it("derives claude model from ANTHROPIC_MODEL env and merges with catalog", async () => {
    const runCommand = buildRunCommandStub({})
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: { ANTHROPIC_MODEL: "claude-sonnet-4-6" },
      customModelsService: buildCustomModelsServiceStub()
    })

    const models = await service.listProviderModels("claude")
    expect(models[0]?.id).toBe("claude-sonnet-4-6")
    expect(models[0]?.source).toBe("config-derived")
    expect(models.find((m) => m.id === "claude-opus-4-7")).toBeDefined()
  })

  it("appends user-custom models on top with source user-custom", async () => {
    const runCommand = buildRunCommandStub({
      "codex debug models": { stdout: codexDebugModelsResponse, status: 0 }
    })
    const customModelsServiceStub = buildCustomModelsServiceStub()
    customModelsServiceStub.list = vi.fn(() => [
      {
        id: "gpt-5.3-codex-spark",
        label: "GPT-5.3 Codex Spark",
        detail: "用户自定义模型。",
        addedAt: "2026-05-27T10:00:00.000Z"
      }
    ])
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: {},
      customModelsService: customModelsServiceStub
    })

    const models = await service.listProviderModels("codex")
    expect(models[0]?.id).toBe("gpt-5.3-codex-spark")
    expect(models[0]?.source).toBe("user-custom")
  })

  it("dedupes custom model that shadows native list entry, keeping user-custom source", async () => {
    const runCommand = buildRunCommandStub({
      "codex debug models": { stdout: codexDebugModelsResponse, status: 0 }
    })
    const customModelsServiceStub = buildCustomModelsServiceStub()
    customModelsServiceStub.list = vi.fn(() => [
      {
        id: "gpt-5.5",
        label: "Override",
        detail: "用户自定义模型。",
        addedAt: "2026-05-27T10:00:00.000Z"
      }
    ])
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: {},
      customModelsService: customModelsServiceStub
    })

    const models = await service.listProviderModels("codex")
    const ids = models.map((m) => m.id)
    expect(ids.filter((id) => id === "gpt-5.5")).toHaveLength(1)
    const fivePoint5 = models.find((m) => m.id === "gpt-5.5")
    expect(fivePoint5?.source).toBe("user-custom")
  })
})
```

- [ ] **Step 4.2: 运行测试，确认失败**

```bash
yarn workspace @teamcow/desktop test -- provider-runtime-service.list-models
```

期望：FAIL（部分原因是 `customModelsService` 还没在 deps 中接入）。

- [ ] **Step 4.3: 在 ProviderRuntimeServiceDeps 中加 customModelsService**

修改 `apps/desktop/src/main/services/provider-runtime-service.ts:77-86`，在 `ProviderRuntimeServiceDeps` 中加入：

```typescript
type ProviderRuntimeServiceDeps = {
  now?: TimestampFactory
  env?: NodeJS.ProcessEnv
  homeDir?: string
  providers?: ProviderRuntimeDefinition[]
  readFile?: (path: string) => string
  pathExists?: (path: string) => boolean
  runCommand?: (command: string, args: string[], options?: CommandOptions) => MaybePromise<CommandResult>
  fetchUrl?: (url: string) => Promise<void>
  customModelsService?: {
    list: (providerKind: ProviderKind) => Array<{
      id: string
      label: string
      detail?: string
      addedAt: string
    }>
  }
}
```

- [ ] **Step 4.4: 加 zod schema 校验 codex debug models 输出**

在 `provider-runtime-service.ts` 文件顶部 imports 之后追加：

```typescript
import { z } from "zod"

const codexDebugModelSchema = z.object({
  slug: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string().optional(),
  priority: z.number(),
  visibility: z.string()
})

const codexDebugModelsResponseSchema = z.object({
  models: z.array(codexDebugModelSchema)
})
```

- [ ] **Step 4.5: 实现三个 provider 的 discovery 子函数与缓存**

在 `provider-runtime-service.ts` 文件中，紧接 `appendFallbackModels` 之后追加（约 line 158 附近）：

```typescript
const MODEL_DISCOVERY_TTL_MS = 5 * 60 * 1000
const MODEL_DISCOVERY_TIMEOUT_MS = 5000

type ModelCacheEntry = {
  models: ProviderModelOption[]
  expiresAt: number
}

const dedupeModels = (lists: ProviderModelOption[][]): ProviderModelOption[] => {
  const seen = new Map<string, ProviderModelOption>()
  for (const list of lists) {
    for (const model of list) {
      if (!seen.has(model.id)) {
        seen.set(model.id, model)
      }
    }
  }
  return Array.from(seen.values())
}

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T | null> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), ms)
      })
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

const discoverCodexModels = async (
  runCommand: NonNullable<ProviderRuntimeServiceDeps["runCommand"]>,
  command: string,
  configFilePaths: string[],
  pathExists: (path: string) => boolean,
  readFile: (path: string) => string
): Promise<ProviderModelOption[]> => {
  const result = await withTimeout(runCommand(command, ["debug", "models"]), MODEL_DISCOVERY_TIMEOUT_MS)
  if (result && !result.error && result.status === 0) {
    try {
      const parsed = codexDebugModelsResponseSchema.parse(JSON.parse(result.stdout))
      const visible = parsed.models
        .filter((model) => model.visibility === "list")
        .sort((left, right) => left.priority - right.priority)
      if (visible.length > 0) {
        return visible.map((model, index) =>
          providerModelOptionSchema.parse({
            id: model.slug,
            label: model.display_name || model.slug,
            detail: model.description?.trim() || "Codex model.",
            source: "native-list",
            isDefault: index === 0
          })
        )
      }
    } catch {
      // fall through to config-derived
    }
  }

  for (const configPath of configFilePaths) {
    if (!pathExists(configPath)) {
      continue
    }
    const content = readFile(configPath)
    const configuredModel = parseModelFromConfigContent(content)
    if (configuredModel) {
      return appendFallbackModels("codex", [
        createModelOption(configuredModel, "Configured Codex model.", "config-derived", true)
      ])
    }
  }

  return toFallbackModelOptions("codex")
}

const discoverOpencodeModels = async (
  runCommand: NonNullable<ProviderRuntimeServiceDeps["runCommand"]>,
  command: string
): Promise<ProviderModelOption[]> => {
  const result = await withTimeout(runCommand(command, ["models"]), MODEL_DISCOVERY_TIMEOUT_MS)
  if (!result || result.error || result.status !== 0) {
    return toFallbackModelOptions("opencode")
  }

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return toFallbackModelOptions("opencode")
  }

  return lines.map((id, index) => {
    const tail = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id
    return providerModelOptionSchema.parse({
      id,
      label: tail || id,
      detail: "Available from opencode models.",
      source: "native-list",
      isDefault: index === 0
    })
  })
}

const discoverClaudeModels = (
  env: NodeJS.ProcessEnv,
  configFilePaths: string[],
  pathExists: (path: string) => boolean,
  readFile: (path: string) => string
): ProviderModelOption[] => {
  const configuredFromEnv =
    env.ANTHROPIC_MODEL?.trim() ||
    env.CLAUDE_MODEL?.trim() ||
    null

  const configuredFromFile = configFilePaths.reduce<string | null>((found, configPath) => {
    if (found || !pathExists(configPath)) {
      return found
    }
    const content = readFile(configPath)
    return parseModelFromConfigContent(content)
  }, null)

  const aliasOverrides = [
    { id: env.ANTHROPIC_DEFAULT_OPUS_MODEL?.trim(), aliasFor: "claude-opus-4-7" },
    { id: env.ANTHROPIC_DEFAULT_SONNET_MODEL?.trim(), aliasFor: "claude-sonnet-4-6" },
    { id: env.ANTHROPIC_DEFAULT_HAIKU_MODEL?.trim(), aliasFor: "claude-haiku-4-5" }
  ].filter((entry): entry is { id: string; aliasFor: string } => Boolean(entry.id))

  const configured = configuredFromEnv || configuredFromFile
  const configDerived: ProviderModelOption[] = []

  if (configured) {
    configDerived.push(
      providerModelOptionSchema.parse({
        id: configured,
        label: configured,
        detail: "Configured Claude Code model.",
        source: "config-derived",
        isDefault: true
      })
    )
  }

  for (const override of aliasOverrides) {
    if (configDerived.some((entry) => entry.id === override.id)) {
      continue
    }
    configDerived.push(
      providerModelOptionSchema.parse({
        id: override.id,
        label: override.id,
        detail: `Pinned alias for ${override.aliasFor}.`,
        source: "config-derived",
        isDefault: false
      })
    )
  }

  return dedupeModels([configDerived, toFallbackModelOptions("claude")])
}
```

- [ ] **Step 4.6: 重写 listProviderModels 主函数（替换 line 1545-1615）**

替换 `listProviderModels` 整个函数体：

```typescript
const modelDiscoveryCache = new Map<ProviderKind, ModelCacheEntry>()

const listProviderModels = async (providerKind: ProviderKind): Promise<ProviderModelOption[]> => {
  const provider = providers.find((candidate) => candidate.kind === providerKind)
  if (!provider) {
    return toFallbackModelOptions(providerKind)
  }

  const cached = modelDiscoveryCache.get(providerKind)
  let baseModels: ProviderModelOption[]
  if (cached && cached.expiresAt > Date.now()) {
    baseModels = cached.models
  } else {
    if (providerKind === "codex") {
      baseModels = await discoverCodexModels(
        runCommand,
        provider.command,
        provider.configFilePaths ?? [],
        pathExists,
        readFile
      )
    } else if (providerKind === "opencode") {
      baseModels = await discoverOpencodeModels(runCommand, provider.command)
    } else {
      baseModels = discoverClaudeModels(env, provider.configFilePaths ?? [], pathExists, readFile)
    }
    modelDiscoveryCache.set(providerKind, {
      models: baseModels,
      expiresAt: Date.now() + MODEL_DISCOVERY_TTL_MS
    })
  }

  const customEntries = customModelsService?.list(providerKind) ?? []
  const customModels: ProviderModelOption[] = customEntries.map((entry) =>
    providerModelOptionSchema.parse({
      id: entry.id,
      label: entry.label,
      detail: entry.detail || "用户自定义模型。",
      source: "user-custom",
      addedAt: entry.addedAt
    })
  )

  return dedupeModels([customModels, baseModels])
}

const invalidateModelDiscoveryCache = (providerKind?: ProviderKind) => {
  if (providerKind) {
    modelDiscoveryCache.delete(providerKind)
  } else {
    modelDiscoveryCache.clear()
  }
}
```

- [ ] **Step 4.7: 在 createProviderRuntimeService 解构 deps 时增加 customModelsService**

定位 `createProviderRuntimeService` 函数顶部（搜索 `export const createProviderRuntimeService`），在解构 deps 时加入 `customModelsService`：

```typescript
const customModelsService = deps.customModelsService
```

如果当前用 `const { runCommand, pathExists, readFile, env, ... } = deps`，则在解构里追加 `customModelsService`。

- [ ] **Step 4.8: 在返回对象中导出 invalidateModelDiscoveryCache**

修改 `provider-runtime-service.ts:1791` 附近的 return 对象，加入：

```typescript
return {
  // ...existing
  listProviderModels,
  invalidateModelDiscoveryCache
}
```

- [ ] **Step 4.9: 运行测试**

```bash
yarn workspace @teamcow/desktop test -- provider-runtime-service.list-models
```

期望：所有测试 PASS。

- [ ] **Step 4.10: 运行全部相关测试**

```bash
yarn typecheck
yarn workspace @teamcow/desktop test
```

期望：无回归。

- [ ] **Step 4.11: 提交**

```bash
git add apps/desktop/src/main/services/provider-runtime-service.ts apps/desktop/src/main/services/__tests__/provider-runtime-service.list-models.test.ts
git commit -m "feat(desktop): rewrite listProviderModels with three-layer discovery and TTL cache"
```

---

## Task 5: 加 IPC routes（addCustomModel / removeCustomModel）

**Files:**
- Modify: `apps/desktop/src/main/desktop-router.ts`
- Modify: preload 入口（搜 `listProviderModels` 以定位）
- Modify: `packages/shared-types/src/index.ts`（DesktopCommand union 添加）

- [ ] **Step 5.1: 定位 DesktopCommand schema 与 router 文件**

```bash
grep -rn "listProviderModels" packages/shared-types apps/desktop/src/preload apps/desktop/src/main/desktop-router.ts
```

- [ ] **Step 5.2: 在 DesktopCommand union 中加新 command 类型**

在 `packages/shared-types/src/index.ts` 找到 `DesktopCommand` 或 `desktopCommandSchema`（搜 `listProviderModels`），在已有 commands 之后追加：

```typescript
{
  type: z.literal("addCustomModel"),
  input: addCustomModelInputSchema
},
{
  type: z.literal("removeCustomModel"),
  input: removeCustomModelInputSchema
}
```

- [ ] **Step 5.3: 在 desktop-router 中加 case 分支**

修改 `apps/desktop/src/main/desktop-router.ts:49` 附近，在 `listProviderModels` case 之后追加：

```typescript
case "addCustomModel": {
  const result = services.customModelsService.add(command.input)
  if (result.status === "error") {
    return { status: "error" as const, error: result.error }
  }
  services.providerRuntimeService.invalidateModelDiscoveryCache(command.input.providerKind)
  const models = await services.providerRuntimeService.listProviderModels(command.input.providerKind)
  return { status: "ok" as const, models }
}

case "removeCustomModel": {
  const result = services.customModelsService.remove(command.input)
  if (result.status === "error") {
    return { status: "error" as const, error: result.error }
  }
  services.providerRuntimeService.invalidateModelDiscoveryCache(command.input.providerKind)
  const models = await services.providerRuntimeService.listProviderModels(command.input.providerKind)
  return { status: "ok" as const, models }
}
```

如果 router 在 `case "listProviderModels"` 之后还有 `command.type === "listProviderModels" || ...` 判定（line 115 附近），把两个新类型加进去。

- [ ] **Step 5.4: 在 preload 中暴露新方法**

定位 preload 文件（搜 `listProviderModels: ` 找暴露位置），追加：

```typescript
addCustomModel: (input: AddCustomModelInput) =>
  invoke({ type: "addCustomModel", input }) as Promise<CustomModelMutationResult>,
removeCustomModel: (input: RemoveCustomModelInput) =>
  invoke({ type: "removeCustomModel", input }) as Promise<CustomModelMutationResult>,
```

注意 `invoke` 函数名按照该文件实际使用。`as Promise<...>` 转换形式按照已有模式（如 `listProviderModels` 的写法）。

- [ ] **Step 5.5: 在 window.teamcow 类型声明中加这两个方法**

定位 `window.teamcow` 类型声明（通常在 preload 或 renderer 类型文件中），加入：

```typescript
addCustomModel?: (input: AddCustomModelInput) => Promise<CustomModelMutationResult>
removeCustomModel?: (input: RemoveCustomModelInput) => Promise<CustomModelMutationResult>
```

- [ ] **Step 5.6: typecheck 与 lint**

```bash
yarn typecheck
yarn lint
```

期望：通过。

- [ ] **Step 5.7: 提交**

```bash
git add packages/shared-types apps/desktop/src/main/desktop-router.ts apps/desktop/src/preload
git commit -m "feat(desktop): expose addCustomModel/removeCustomModel IPC routes"
```

---

## Task 6: shell-store 适配自定义 model

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/shell-store.ts`

- [ ] **Step 6.1: 在 shell-store 中加 addCustomModel 与 removeCustomModel**

在 `shell-store.ts` 中 `loadProviderModels`（line 405）之后追加：

```typescript
const addCustomModel = useCallback(async (input: AddCustomModelInput): Promise<ProviderModelOption[] | null> => {
  if (!window.teamcow?.addCustomModel) {
    setNotice({ tone: "error", messageKey: "api.unavailable" })
    return null
  }

  try {
    const result = await window.teamcow.addCustomModel(input)
    if (result.status === "error") {
      setNotice(renderErrorNotice(result.error))
      return null
    }

    setProviderModelsByKind((current) => ({
      ...current,
      [input.providerKind]: {
        status: "ready",
        models: result.models,
        source: "host"
      }
    }))
    return result.models
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
    return null
  }
}, [t, tErrors])

const removeCustomModel = useCallback(async (input: RemoveCustomModelInput): Promise<ProviderModelOption[] | null> => {
  if (!window.teamcow?.removeCustomModel) {
    setNotice({ tone: "error", messageKey: "api.unavailable" })
    return null
  }

  try {
    const result = await window.teamcow.removeCustomModel(input)
    if (result.status === "error") {
      setNotice(renderErrorNotice(result.error))
      return null
    }

    setProviderModelsByKind((current) => ({
      ...current,
      [input.providerKind]: {
        status: "ready",
        models: result.models,
        source: "host"
      }
    }))
    return result.models
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
    return null
  }
}, [t, tErrors])
```

并在文件头部 import 中加：

```typescript
import type { AddCustomModelInput, RemoveCustomModelInput } from "@shared/index"
```

- [ ] **Step 6.2: 在 hook 返回对象中暴露新方法**

修改 `shell-store.ts:605-624`，在 return 对象中加入 `addCustomModel,` 和 `removeCustomModel,`。

- [ ] **Step 6.3: typecheck**

```bash
yarn typecheck
```

期望：通过。

- [ ] **Step 6.4: 提交**

```bash
git add apps/desktop/src/renderer/app/shell/shell-store.ts
git commit -m "feat(renderer): expose addCustomModel/removeCustomModel from shell store"
```

---

## Task 7: i18n 文案

**Files:**
- Modify: `packages/i18n-resources/src/en/shell.json`
- Modify: `packages/i18n-resources/src/zh/shell.json`
- 错误码： `packages/i18n-resources/src/en/errors.json` 和 `zh/errors.json`

- [ ] **Step 7.1: 加自定义 model 相关的 UI 文案**

在 `packages/i18n-resources/src/zh/shell.json` 加：

```json
{
  "modelPicker.section.discovered": "动态发现",
  "modelPicker.section.custom": "自定义",
  "modelPicker.addCustom": "添加自定义模型",
  "modelPicker.removeCustom": "移除",
  "modelPicker.badge.configDerived": "配置",
  "modelPicker.badge.fallback": "内置",
  "modelPicker.badge.userCustom": "自定义",
  "modelPicker.dialog.title": "添加自定义模型",
  "modelPicker.dialog.idLabel": "模型 ID",
  "modelPicker.dialog.idPlaceholder": "例如 gpt-5.3-codex-spark",
  "modelPicker.dialog.labelLabel": "显示名（可选）",
  "modelPicker.dialog.detailLabel": "说明（可选）",
  "modelPicker.dialog.confirm": "添加",
  "modelPicker.dialog.cancel": "取消"
}
```

在 `packages/i18n-resources/src/en/shell.json` 加对应英文：

```json
{
  "modelPicker.section.discovered": "Discovered",
  "modelPicker.section.custom": "Custom",
  "modelPicker.addCustom": "Add custom model",
  "modelPicker.removeCustom": "Remove",
  "modelPicker.badge.configDerived": "Config",
  "modelPicker.badge.fallback": "Built-in",
  "modelPicker.badge.userCustom": "Custom",
  "modelPicker.dialog.title": "Add custom model",
  "modelPicker.dialog.idLabel": "Model ID",
  "modelPicker.dialog.idPlaceholder": "e.g. gpt-5.3-codex-spark",
  "modelPicker.dialog.labelLabel": "Display label (optional)",
  "modelPicker.dialog.detailLabel": "Description (optional)",
  "modelPicker.dialog.confirm": "Add",
  "modelPicker.dialog.cancel": "Cancel"
}
```

- [ ] **Step 7.2: 加错误码翻译**

在 `packages/i18n-resources/src/zh/errors.json` 加：

```json
{
  "CUSTOM_MODEL_DUPLICATE": "该模型 ID 已存在。",
  "CUSTOM_MODEL_NOT_FOUND": "未找到对应的自定义模型。",
  "CUSTOM_MODEL_LIMIT_EXCEEDED": "自定义模型数量已达上限（50 个）。"
}
```

在 `packages/i18n-resources/src/en/errors.json` 加：

```json
{
  "CUSTOM_MODEL_DUPLICATE": "This model ID already exists.",
  "CUSTOM_MODEL_NOT_FOUND": "Custom model not found.",
  "CUSTOM_MODEL_LIMIT_EXCEEDED": "Custom model limit reached (50 maximum)."
}
```

- [ ] **Step 7.3: 运行 i18n check**

```bash
yarn i18n:check
```

期望：通过，无 missing key。

- [ ] **Step 7.4: 提交**

```bash
git add packages/i18n-resources
git commit -m "i18n: add strings for custom model picker and errors"
```

---

## Task 8: UI — model 选择器分组与自定义入口

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`（搜 `loadProviderModels` 找到 model 选择器位置）

- [ ] **Step 8.1: 定位 model 选择 UI 代码**

```bash
grep -n "providerModelsByKind\|CommandSelect\|loadProviderModels\|setConversationModel" apps/desktop/src/renderer/app/shell/DesktopShell.tsx | head -30
```

记录两个 model 选择器的位置（launcher 模态、composer 切换）。

- [ ] **Step 8.2: 写一个 model 选择器辅助函数 `groupModelsForPicker`**

在文件顶部 helpers 区追加：

```typescript
type ModelPickerGroup = {
  key: "discovered" | "custom"
  models: ProviderModelOption[]
}

const groupModelsForPicker = (models: ProviderModelOption[]): ModelPickerGroup[] => {
  const custom = models.filter((m) => m.source === "user-custom")
  const discovered = models.filter((m) => m.source !== "user-custom")
  const groups: ModelPickerGroup[] = []
  if (discovered.length > 0) {
    groups.push({ key: "discovered", models: discovered })
  }
  if (custom.length > 0) {
    groups.push({ key: "custom", models: custom })
  }
  return groups
}

const sourceBadgeKeyFor = (source: ProviderModelOption["source"]): string | null => {
  if (source === "config-derived") return "modelPicker.badge.configDerived"
  if (source === "fallback") return "modelPicker.badge.fallback"
  if (source === "user-custom") return "modelPicker.badge.userCustom"
  return null
}
```

- [ ] **Step 8.3: 改造 launcher 中的 model 选择器渲染**

在 launcher 模态的 model `CommandSelect` 处，把单一 options 列表改为按 group 渲染（按现有 `CommandSelect` 是否原生支持分组判断；不支持则手动渲染 section header + items + 在底部展示一个 "添加自定义模型..." 按钮）：

```tsx
{groupModelsForPicker(providerModels).map((group) => (
  <div key={group.key} className="model-picker__section">
    <div className="model-picker__section-title">
      {t(`modelPicker.section.${group.key}`)}
    </div>
    {group.models.map((model) => {
      const badgeKey = sourceBadgeKeyFor(model.source)
      return (
        <button
          key={model.id}
          type="button"
          className="model-picker__option"
          onClick={() => handleSelectModel(model.id)}
        >
          <span className="model-picker__label">{model.label}</span>
          {badgeKey && <span className="model-picker__badge">{t(badgeKey)}</span>}
          {model.source === "user-custom" && (
            <button
              type="button"
              className="model-picker__remove"
              onClick={(event) => {
                event.stopPropagation()
                void removeCustomModel({ providerKind: selectedProviderKind, id: model.id })
              }}
              aria-label={t("modelPicker.removeCustom")}
            >
              ✕
            </button>
          )}
        </button>
      )
    })}
  </div>
))}
<button
  type="button"
  className="model-picker__add-custom"
  onClick={() => setIsCustomModelDialogOpen(true)}
>
  + {t("modelPicker.addCustom")}
</button>
```

具体变量名（`providerModels`、`selectedProviderKind`、`handleSelectModel`）按当前 DesktopShell 中的实际命名替换。

- [ ] **Step 8.4: 加 AddCustomModelDialog 子组件**

在 `DesktopShell.tsx` 内追加一个轻量 dialog 组件（也可以提取为独立文件 `apps/desktop/src/renderer/app/shell/AddCustomModelDialog.tsx`，按当前项目偏好）：

```tsx
type AddCustomModelDialogProps = {
  open: boolean
  providerKind: ProviderKind
  onClose: () => void
  onSubmit: (input: AddCustomModelInput) => Promise<void>
}

const AddCustomModelDialog = ({ open, providerKind, onClose, onSubmit }: AddCustomModelDialogProps) => {
  const { t } = useTranslation("shell")
  const [id, setId] = useState("")
  const [label, setLabel] = useState("")
  const [detail, setDetail] = useState("")
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const handleConfirm = async () => {
    const trimmedId = id.trim()
    if (!trimmedId) return
    setBusy(true)
    try {
      await onSubmit({
        providerKind,
        id: trimmedId,
        label: label.trim() || undefined,
        detail: detail.trim() || undefined
      })
      setId("")
      setLabel("")
      setDetail("")
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="model-picker__dialog" role="dialog" aria-modal="true">
      <h3>{t("modelPicker.dialog.title")}</h3>
      <label>
        {t("modelPicker.dialog.idLabel")}
        <input
          type="text"
          value={id}
          placeholder={t("modelPicker.dialog.idPlaceholder")}
          onChange={(event) => setId(event.target.value)}
          autoFocus
        />
      </label>
      <label>
        {t("modelPicker.dialog.labelLabel")}
        <input type="text" value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label>
        {t("modelPicker.dialog.detailLabel")}
        <input type="text" value={detail} onChange={(event) => setDetail(event.target.value)} />
      </label>
      <div className="model-picker__dialog-actions">
        <button type="button" onClick={onClose} disabled={busy}>
          {t("modelPicker.dialog.cancel")}
        </button>
        <button type="button" onClick={handleConfirm} disabled={busy || !id.trim()}>
          {t("modelPicker.dialog.confirm")}
        </button>
      </div>
    </div>
  )
}
```

并在 DesktopShell 主组件中加入状态：

```tsx
const [isCustomModelDialogOpen, setIsCustomModelDialogOpen] = useState(false)
```

并在 launcher 模态内挂载：

```tsx
<AddCustomModelDialog
  open={isCustomModelDialogOpen}
  providerKind={selectedProviderKind}
  onClose={() => setIsCustomModelDialogOpen(false)}
  onSubmit={async (input) => { await addCustomModel(input) }}
/>
```

注意：composer 内的 model 切换器也复用同一 dialog 状态或新增独立 state，按 UI 一致性决定。MVP 实现仅覆盖 launcher 即可，composer 留 TODO 跟随后续 UX 迭代（如需也覆盖，复制相同 dialog 挂载即可）。

- [ ] **Step 8.5: 应用样式（最小可用）**

在对应样式文件加最小样式（按项目当前 CSS module / styled-components 习惯）。如果项目用 Tailwind，则替换为合适 className；如果是 vanilla CSS，新增以下到现有 stylesheet：

```css
.model-picker__section { padding: 4px 0; }
.model-picker__section-title { font-size: 11px; opacity: 0.6; padding: 4px 8px; text-transform: uppercase; }
.model-picker__option { display: flex; align-items: center; gap: 8px; }
.model-picker__badge { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: rgba(0,0,0,0.06); }
.model-picker__remove { margin-left: auto; opacity: 0; }
.model-picker__option:hover .model-picker__remove { opacity: 0.7; }
.model-picker__add-custom { width: 100%; padding: 8px; text-align: left; border-top: 1px solid rgba(0,0,0,0.08); }
.model-picker__dialog { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); z-index: 100; }
.model-picker__dialog > * { background: var(--surface, white); padding: 16px; border-radius: 8px; min-width: 320px; }
.model-picker__dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
```

- [ ] **Step 8.6: typecheck + lint + i18n check**

```bash
yarn typecheck
yarn lint
yarn i18n:check
```

期望：通过。

- [ ] **Step 8.7: 启动 dev 验证 UI**

```bash
yarn dev
```

手动验证：
1. 打开 launcher 创建 conversation，选择各 provider 看到 catalog 模型
2. 点 "添加自定义模型" 输入 ID，确认进入列表 + 带"自定义"badge
3. hover 自定义 model 出现 ✕，点击删除消失
4. 重启 app 后自定义 model 仍存在
5. provider 实际可用时（如 codex 已认证），能看到动态发现的最新模型

如果有空白或样式异常，调整对应样式。如果 dev 无法启动，先排查 main 进程错误。

- [ ] **Step 8.8: 提交**

```bash
git add apps/desktop/src/renderer/app/shell
git commit -m "feat(renderer): group model picker with custom model add/remove flow"
```

---

## Task 9: 全量验证

**Files:** 无新增

- [ ] **Step 9.1: 跨包 typecheck**

```bash
yarn typecheck
```

期望：通过。

- [ ] **Step 9.2: lint**

```bash
yarn lint
```

期望：通过。

- [ ] **Step 9.3: 单元测试**

```bash
yarn test
```

期望：通过，无回归。

- [ ] **Step 9.4: i18n check**

```bash
yarn i18n:check
```

期望：通过。

- [ ] **Step 9.5: desktop smoke test**

```bash
yarn workspace @teamcow/desktop smoke
```

期望：通过。

- [ ] **Step 9.6: 启动 dev，跑完整 e2e 走查**

```bash
yarn dev
```

走完整闭环：
1. 应用启动 → provider readiness 正常显示
2. 创建 conversation：codex provider，选 model（应是动态发现的 GPT-5.5 等）
3. 添加自定义 model `gpt-5.3-codex-spark`，选中并发送一条消息
4. 切到 claude provider，验证 catalog + 配置推断
5. 切到 opencode，验证 `opencode models` 输出展示
6. 删除自定义 model
7. 重启验证持久化

如果有问题逐个修复并补测试。

- [ ] **Step 9.7: 提交修复（如有）**

```bash
git add -A
git commit -m "fix: address issues found during e2e walkthrough"
```

---

## Self-Review Notes

**Spec coverage 检查：**

| Spec 要求 | 对应 Task |
|---|---|
| 三层架构（catalog + 动态发现 + 自定义） | Task 1, 2, 4 |
| 优先级 user-custom > native-list > config-derived > fallback | Task 4 (`dedupeModels`) |
| 静态 catalog 更新到 2026-05 | Task 1 Step 1.3 |
| Codex `debug models` JSON 解析、过滤 visibility、按 priority 排序 | Task 4 Step 4.4-4.5 |
| OpenCode `opencode models` 文本解析 | Task 4 Step 4.5 |
| Claude config 推断（env + 文件 + alias 环境变量） | Task 4 Step 4.5 |
| 用户自定义 model 存 `app_settings`，最多 50 个/provider | Task 2 |
| 5 分钟内存缓存 + 强制刷新 | Task 4 (`MODEL_DISCOVERY_TTL_MS` + `invalidateModelDiscoveryCache`) |
| UI 分组 + source badge + 添加 + 删除入口 | Task 8 |
| i18n 中英文 | Task 7 |
| 错误处理：超时/解析失败降级 | Task 4 (`withTimeout` + `try/catch`) |
| 类型扩展（user-custom + addedAt） | Task 1 Step 1.1-1.2 |

**Placeholder 检查：** 所有代码块给出完整实现，无 TBD/TODO（仅 Step 8.4 末尾对 composer 是否复用 dialog 留可选 follow-up，已说明 MVP 范围）。

**类型一致性：** `customModelEntrySchema` / `addCustomModelInputSchema` / `removeCustomModelInputSchema` / `customModelMutationResultSchema` 在 Task 1 定义，在 Task 2-6 一致使用。`invalidateModelDiscoveryCache(providerKind)` 在 Task 4 定义、Task 5 调用。`dedupeModels` 在 Task 4 内部使用，未跨 task 暴露。

---

## Execution Handoff

**Plan complete and saved to `docs/design/plans/2026-05-27-provider-model-discovery.md`.** 两种执行方式：

**1. Subagent-Driven（推荐）** — 每个 task 派一个新 subagent，task 之间快速 review、迭代。
**2. Inline Execution** — 在当前会话里按计划批量执行，关键节点 checkpoint 检查。

要哪种方式？
