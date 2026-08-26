import {
  providerReadinessSnapshotSchema,
  type ProviderKind,
  type ProviderModelOption,
  type ProviderReadiness
} from "@shared/index"

type ProviderDefinition = { kind: ProviderKind }

const dedupeModels = (lists: ProviderModelOption[][]) => {
  const seen = new Map<string, ProviderModelOption>()
  for (const list of lists) {
    for (const model of list) {
      if (!seen.has(model.id)) seen.set(model.id, model)
    }
  }
  return [...seen.values()]
}

export const createProviderCatalogService = <Definition extends ProviderDefinition>(input: {
  providers: Definition[]
  now: () => string
  clock?: () => number
  modelCacheTtlMs?: number
  createUnknownReadiness: (kind: ProviderKind) => ProviderReadiness
  probe: (provider: Definition) => Promise<ProviderReadiness>
  discoverModels: (provider: Definition) => Promise<ProviderModelOption[]>
  fallbackModels: (kind: ProviderKind) => ProviderModelOption[]
  customModels?: (kind: ProviderKind) => ProviderModelOption[]
}) => {
  const clock = input.clock ?? Date.now
  const modelCacheTtlMs = input.modelCacheTtlMs ?? 5 * 60 * 1000
  const providerByKind = new Map(input.providers.map((provider) => [provider.kind, provider]))
  const modelCache = new Map<ProviderKind, { models: ProviderModelOption[]; expiresAt: number }>()
  const modelDiscoveryInFlight = new Map<ProviderKind, {
    generation: number
    promise: Promise<ProviderModelOption[]>
  }>()
  const modelCacheGenerations = new Map<ProviderKind, number>()
  let snapshot = providerReadinessSnapshotSchema.parse({
    checkedAt: "",
    providers: input.providers.map((provider) => input.createUnknownReadiness(provider.kind))
  })

  const refreshSnapshot = async () => {
    snapshot = providerReadinessSnapshotSchema.parse({
      checkedAt: input.now(),
      providers: await Promise.all(input.providers.map(input.probe))
    })
    return snapshot
  }

  const listProviderModels = async (kind: ProviderKind) => {
    const provider = providerByKind.get(kind)
    if (!provider) return input.fallbackModels(kind)

    const cached = modelCache.get(kind)
    let discovered: ProviderModelOption[]
    if (cached && cached.expiresAt > clock()) {
      discovered = cached.models
    } else {
      const generation = modelCacheGenerations.get(kind) ?? 0
      const inFlight = modelDiscoveryInFlight.get(kind)
      if (inFlight?.generation === generation) {
        discovered = await inFlight.promise
      } else {
        const promise = input.discoverModels(provider).then((models) => {
          if ((modelCacheGenerations.get(kind) ?? 0) === generation) {
            modelCache.set(kind, { models, expiresAt: clock() + modelCacheTtlMs })
          }
          return models
        }).finally(() => {
          if (modelDiscoveryInFlight.get(kind)?.promise === promise) {
            modelDiscoveryInFlight.delete(kind)
          }
        })
        modelDiscoveryInFlight.set(kind, { generation, promise })
        discovered = await promise
      }
    }
    return dedupeModels([input.customModels?.(kind) ?? [], discovered])
  }

  const invalidateModelDiscoveryCache = (kind?: ProviderKind) => {
    if (kind) {
      modelCache.delete(kind)
      modelCacheGenerations.set(kind, (modelCacheGenerations.get(kind) ?? 0) + 1)
      return
    }

    modelCache.clear()
    for (const providerKind of providerByKind.keys()) {
      modelCacheGenerations.set(providerKind, (modelCacheGenerations.get(providerKind) ?? 0) + 1)
    }
  }

  return {
    getSnapshot: () => snapshot,
    refreshSnapshot,
    listProviderModels,
    invalidateModelDiscoveryCache
  }
}

export type ProviderCatalogService = ReturnType<typeof createProviderCatalogService>
