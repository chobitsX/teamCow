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
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
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
      return { status: "error", error: { code: "INTERNAL_ERROR", message: validated.error.message, suggestion: null } }
    }

    const { providerKind, id, label, detail } = validated.data
    const entries = readEntries(providerKind)

    if (entries.some((entry) => entry.id === id)) {
      return { status: "error", error: { code: "CUSTOM_MODEL_DUPLICATE", message: `Custom model "${id}" already exists.`, suggestion: null } }
    }

    if (entries.length >= maxPerProvider) {
      return { status: "error", error: { code: "CUSTOM_MODEL_LIMIT_EXCEEDED", message: `Cannot exceed ${maxPerProvider} custom models per provider.`, suggestion: null } }
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
      return { status: "error", error: { code: "INTERNAL_ERROR", message: validated.error.message, suggestion: null } }
    }

    const { providerKind, id } = validated.data
    const entries = readEntries(providerKind)
    const next = entries.filter((entry) => entry.id !== id)

    if (next.length === entries.length) {
      return { status: "error", error: { code: "CUSTOM_MODEL_NOT_FOUND", message: `Custom model "${id}" not found.`, suggestion: null } }
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
