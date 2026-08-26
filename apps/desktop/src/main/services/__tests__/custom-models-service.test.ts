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
