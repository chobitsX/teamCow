import { describe, expect, it, vi } from "vitest"
import { providerModelOptionSchema, providerReadinessSchema } from "@shared/index"
import { createProviderCatalogService } from "../provider-catalog-service"

describe("provider catalog service", () => {
  it("owns readiness snapshots and cached model discovery independently from runtime execution", async () => {
    let clock = 0
    const discoverModels = vi.fn(async () => [providerModelOptionSchema.parse({
      id: "native-model",
      label: "Native",
      detail: "Native model",
      source: "native-list"
    })])
    const service = createProviderCatalogService({
      providers: [{ kind: "codex" as const }],
      now: () => "2026-08-17T00:00:00.000Z",
      clock: () => clock,
      modelCacheTtlMs: 100,
      createUnknownReadiness: (kind) => providerReadinessSchema.parse({
        kind,
        availability: "unknown",
        badge: { kind, label: kind, status: "unknown" },
        issues: []
      }),
      probe: async ({ kind }) => providerReadinessSchema.parse({
        kind,
        availability: "ready",
        badge: { kind, label: kind, status: "ready" },
        issues: []
      }),
      discoverModels,
      fallbackModels: () => [],
      customModels: () => [providerModelOptionSchema.parse({
        id: "custom-model",
        label: "Custom",
        detail: "Custom model",
        source: "user-custom",
        addedAt: "2026-08-17T00:00:00.000Z"
      })]
    })

    expect((await service.refreshSnapshot()).providers[0].availability).toBe("ready")
    expect((await service.listProviderModels("codex")).map((model) => model.id)).toEqual([
      "custom-model",
      "native-model"
    ])
    await service.listProviderModels("codex")
    expect(discoverModels).toHaveBeenCalledOnce()
    service.invalidateModelDiscoveryCache("codex")
    await Promise.all([
      service.listProviderModels("codex"),
      service.listProviderModels("codex")
    ])
    expect(discoverModels).toHaveBeenCalledTimes(2)
    clock = 101
    await service.listProviderModels("codex")
    expect(discoverModels).toHaveBeenCalledTimes(3)
  })
})
