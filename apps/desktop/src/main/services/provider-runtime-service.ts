import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { spawn, type ChildProcess } from "node:child_process"
import { z } from "zod"
import {
  runCodexAppServerTurn,
  type CodexAppServerNotification,
  type CodexAppServerSandboxPolicy,
  type CodexAppServerRunInput
} from "./codex-app-server-client"
import {
  runOpenCodeServerTurn,
  type OpenCodeServerEvent,
  type OpenCodeServerRunInput
} from "./opencode-server-client"
import {
  runCursorAcpTurn,
  type CursorAcpNotification,
  type CursorAcpRunInput
} from "./cursor-acp-client"
import { createProviderRuntimeSupervisor } from "./provider-runtime-supervisor"
import { createProviderCatalogService } from "./provider-catalog-service"
import {
  buildPromptWithAttachmentReferences,
  getAttachmentDirectories,
  getImageAttachmentPaths,
  type ProviderInputAttachment
} from "./provider-input"
import {
  DEFAULT_PROVIDER_ACCESS_MODE,
  PROVIDER_MODEL_CATALOG,
  canonicalRunEventSchema,
  conversationRunStatusSchema,
  providerAccessModeSchema,
  providerModelOptionSchema,
  providerReadinessSchema,
  type ConversationRunStatus,
  type CanonicalRunEvent,
  type ProviderAccessMode,
  type ProviderAvailability,
  type ProviderBadge,
  type ProviderKind,
  type ProviderModelOption,
  type ProviderRunOptions,
  type ProviderReadiness,
  type ReadinessIssue
} from "@shared/index"

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

type TimestampFactory = () => string

type CommandResult = {
  stdout: string
  stderr: string
  status: number | null
  error?: Error
}

type CommandOptions = {
  cwd?: string
  stdin?: string
  onStdout?: (chunk: string) => MaybePromise<void>
  onStderr?: (chunk: string) => MaybePromise<void>
  onChild?: (child: ChildProcess) => void
}

type MaybePromise<T> = T | Promise<T>

type ProviderDetectionResult = {
  availability: ProviderAvailability
  version?: string
  issues?: ReadinessIssue[]
}

export type ProviderRunInput = {
  provider: ProviderKind
  model: string
  accessMode?: ProviderAccessMode
  prompt: string
  attachments?: ProviderInputAttachment[]
  worktreeRootPath: string
  worktreeId: string
  conversationId: string
  runId: string
  sessionId?: string
  options?: ProviderRunOptions
  allowedTools?: string[]
  onEvent?: (event: ProviderRunEvent) => MaybePromise<void>
}

export type ProviderRunEvent = CanonicalRunEvent

export type ProviderRunResult = {
  status: ConversationRunStatus
  events: ProviderRunEvent[]
  sessionId?: string
}

type ProviderRuntimeDefinition = {
  kind: ProviderKind
  command: string
  minimumVersion: string
  authStatusArgs?: string[]
  networkProbeUrls?: string[]
  authEnvKeys?: string[]
  authFilePaths?: string[]
  configFilePaths?: string[]
  capabilityProbe?: {
    args: string[]
    name: string
  }
  detect?: () => Promise<ProviderDetectionResult>
}

type ProviderRuntimeServiceDeps = {
  now?: TimestampFactory
  env?: NodeJS.ProcessEnv
  homeDir?: string
  providers?: ProviderRuntimeDefinition[]
  readFile?: (path: string) => string
  pathExists?: (path: string) => boolean
  runCommand?: (command: string, args: string[], options?: CommandOptions) => MaybePromise<CommandResult>
  runCodexAppServer?: (input: CodexAppServerRunInput) => Promise<{
    threadId: string
    turnId: string
    status: "completed" | "interrupted" | "failed"
    error?: unknown
    stderr: string
  }>
  runOpenCodeServer?: (input: OpenCodeServerRunInput) => Promise<{
    sessionId: string
    status: "completed" | "failed" | "interrupted"
    error?: unknown
    stderr: string
  }>
  runCursorAcp?: (input: CursorAcpRunInput) => Promise<{
    sessionId?: string
    status: "completed" | "failed" | "interrupted"
    stopReason?: string
    error?: unknown
    stderr: string
  }>
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

const DEFAULT_MINIMUM_VERSION = "0.0.0"
const MAX_PROVIDER_PAYLOAD_STRING_LENGTH = 512
const LOGIN_SHELL_DISCOVERY_TIMEOUT_MS = 5_000
const MAX_LOGIN_SHELL_OUTPUT_LENGTH = 1024 * 1024

const buildProviderBadge = (kind: ProviderKind, availability: ProviderAvailability): ProviderBadge => ({
  kind,
  label: kind,
  status: availability
})

const createUnknownReadiness = (kind: ProviderKind): ProviderReadiness =>
  providerReadinessSchema.parse({
    kind,
    availability: "unknown",
    badge: buildProviderBadge(kind, "unknown"),
    issues: []
  })

const parseVersion = (rawOutput: string) => {
  const match = rawOutput.match(/(\d+)\.(\d+)\.(\d+)/)
  return match ? match[0] : null
}

const compareVersions = (left: string, right: string) => {
  const leftParts = left.split(".").map((value) => Number.parseInt(value, 10))
  const rightParts = right.split(".").map((value) => Number.parseInt(value, 10))
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0

    if (leftValue !== rightValue) {
      return leftValue - rightValue
    }
  }

  return 0
}

const mergePathValues = (...pathValues: Array<string | undefined>) =>
  Array.from(new Set(pathValues.flatMap((value) => value?.split(delimiter) ?? []).filter(Boolean))).join(delimiter)

const buildProviderPath = (envPath: string | undefined, homeDir: string, loginShellPath?: string) => {
  const pathEntries = [
    loginShellPath,
    join(homeDir, ".local", "bin"),
    join(homeDir, ".opencode", "bin"),
    join(homeDir, ".yarn", "bin"),
    join(homeDir, ".bun", "bin"),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    envPath
  ]

  return mergePathValues(...pathEntries)
}

const toFallbackModelOptions = (providerKind: ProviderKind): ProviderModelOption[] =>
  (PROVIDER_MODEL_CATALOG[providerKind] ?? []).map((option) =>
    providerModelOptionSchema.parse({
      ...option,
      source: "fallback"
    })
  )

const appendFallbackModels = (providerKind: ProviderKind, models: ProviderModelOption[]) => {
  const seen = new Set(models.map((model) => model.id))
  return [
    ...models,
    ...toFallbackModelOptions(providerKind).filter((model) => !seen.has(model.id))
  ]
}

const MODEL_DISCOVERY_TTL_MS = 5 * 60 * 1000
const MODEL_DISCOVERY_TIMEOUT_MS = 5000

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
  const result = await withTimeout(
    Promise.resolve(runCommand(command, ["debug", "models"])),
    MODEL_DISCOVERY_TIMEOUT_MS
  )
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
      const configuredProvider = parseModelProviderFromConfigContent(content)
      const detail = configuredProvider
        ? `Configured Codex model via ${configuredProvider}.`
        : "Configured Codex model."
      return appendFallbackModels("codex", [
        createModelOption(configuredModel, detail, "config-derived", true)
      ])
    }
  }

  return toFallbackModelOptions("codex")
}

const discoverOpencodeModels = async (
  runCommand: NonNullable<ProviderRuntimeServiceDeps["runCommand"]>,
  command: string
): Promise<ProviderModelOption[]> => {
  const result = await withTimeout(
    Promise.resolve(runCommand(command, ["models"])),
    MODEL_DISCOVERY_TIMEOUT_MS
  )
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

export const parseCursorModelList = (output: string): ProviderModelOption[] => {
  const models: ProviderModelOption[] = []
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim()
    const match = line.match(/^(\S+)\s+-\s+(.+)$/)
    if (!match) {
      continue
    }
    const [, id, rawLabel] = match
    const isDefault = /\((?:current,\s*)?default\)\s*$/i.test(rawLabel)
    const label = rawLabel.replace(/\s+\((?:current,\s*)?default\)\s*$/i, "").trim()
    models.push(providerModelOptionSchema.parse({
      id,
      label: label || id,
      detail: "Available from cursor-agent --list-models.",
      source: "native-list",
      isDefault: isDefault || id === "auto"
    }))
  }
  return models
}

const discoverCursorModels = async (
  runCommand: NonNullable<ProviderRuntimeServiceDeps["runCommand"]>,
  command: string
): Promise<ProviderModelOption[]> => {
  const result = await withTimeout(
    Promise.resolve(runCommand(command, ["--list-models"])),
    MODEL_DISCOVERY_TIMEOUT_MS
  )
  if (!result || result.error || result.status !== 0) {
    return toFallbackModelOptions("cursor")
  }
  const models = parseCursorModelList(result.stdout)
  return models.length > 0 ? models : toFallbackModelOptions("cursor")
}

const discoverClaudeModels = (
  env: NodeJS.ProcessEnv,
  configFilePaths: string[],
  pathExists: (path: string) => boolean,
  readFile: (path: string) => string
): ProviderModelOption[] => {
  const configured =
    env.ANTHROPIC_MODEL?.trim() ||
    env.CLAUDE_MODEL?.trim() ||
    configFilePaths.reduce<string | null>((found, configPath) => {
      if (found || !pathExists(configPath)) return found
      return parseModelFromConfigContent(readFile(configPath))
    }, null)

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

  return dedupeModels([configDerived, toFallbackModelOptions("claude")])
}

const createModelOption = (
  id: string,
  detail: string,
  source: ProviderModelOption["source"],
  isDefault = false
): ProviderModelOption =>
  providerModelOptionSchema.parse({
    id,
    label: id,
    detail,
    source,
    isDefault
  })

const parseTomlStringValue = (content: string, key: string) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = content.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*["']([^"']+)["']`, "m"))
  return match?.[1]?.trim() || null
}

const parseJsonStringValue = (content: string, keys: string[]) => {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    for (const key of keys) {
      const value = parsed[key]
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim()
      }
    }
  } catch {
    return null
  }

  return null
}

const parseModelFromConfigContent = (content: string) =>
  parseJsonStringValue(content, ["model", "defaultModel", "currentModel"]) ??
  parseTomlStringValue(content, "model") ??
  parseTomlStringValue(content, "default_model")

const parseModelProviderFromConfigContent = (content: string) =>
  parseJsonStringValue(content, ["model_provider", "modelProvider", "provider"]) ??
  parseTomlStringValue(content, "model_provider") ??
  parseTomlStringValue(content, "provider")

const parseLoginShellPath = (output: string) => {
  for (const field of output.split("\0").reverse()) {
    for (const line of field.split(/\r?\n/).reverse()) {
      if (line.startsWith("PATH=")) {
        return line.slice("PATH=".length)
      }
    }
  }

  return null
}

const isExecutableFile = (path: string) => {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

const selectLoginShell = (env: NodeJS.ProcessEnv) => {
  const configuredShell = env.SHELL ?? process.env.SHELL
  if (configuredShell && configuredShell.includes("/") && isExecutableFile(configuredShell)) {
    return configuredShell
  }

  return "/bin/zsh"
}

const discoverLoginShellPath = (
  env: NodeJS.ProcessEnv,
  homeDir: string
): Promise<string> => {
  const fallbackPath = buildProviderPath(env.PATH, homeDir)

  return new Promise((resolve) => {
    let stdout = ""
    let settled = false
    const child = spawn(selectLoginShell(env), ["-lic", "/usr/bin/env -0"], {
      env: {
        ...process.env,
        ...env,
        HOME: homeDir,
        PATH: fallbackPath
      },
      stdio: ["ignore", "pipe", "ignore"]
    })

    const timeout = setTimeout(() => {
      child.kill()
      settle(fallbackPath)
    }, LOGIN_SHELL_DISCOVERY_TIMEOUT_MS)
    timeout.unref()

    const settle = (resolvedPath: string) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(resolvedPath)
    }

    child.stdout?.setEncoding("utf8")
    child.stdout?.on("data", (chunk: string) => {
      if (stdout.length < MAX_LOGIN_SHELL_OUTPUT_LENGTH) {
        stdout += chunk.slice(0, MAX_LOGIN_SHELL_OUTPUT_LENGTH - stdout.length)
      }
    })

    child.on("error", () => settle(fallbackPath))
    child.on("close", (status) => {
      const loginShellPath = status === 0 ? parseLoginShellPath(stdout) : null
      settle(buildProviderPath(env.PATH, homeDir, loginShellPath ?? undefined))
    })
  })
}

const findExecutableOnPath = (command: string, pathValue: string) => {
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    const candidate = join(directory, command)
    if (isExecutableFile(candidate)) {
      return candidate
    }
  }

  return null
}

const createDefaultCommandRunner = (env: NodeJS.ProcessEnv, homeDir: string) => {
  let loginShellPathPromise: Promise<string> | null = null
  const commandResolutionCache = new Map<string, Promise<{ command: string; path: string }>>()

  const getLoginShellPath = () => {
    loginShellPathPromise ??= discoverLoginShellPath(env, homeDir)
    return loginShellPathPromise
  }

  const resolveCommand = (command: string) => {
    const cached = commandResolutionCache.get(command)
    if (cached) {
      return cached
    }

    const resolution = getLoginShellPath().then((loginShellPath) => {
      if (command.includes("/")) {
        return {
          command,
          path: mergePathValues(dirname(command), loginShellPath)
        }
      }

      return {
        command: findExecutableOnPath(command, loginShellPath) ?? command,
        path: loginShellPath
      }
    })
    commandResolutionCache.set(command, resolution)
    return resolution
  }

  const runCommand = async (command: string, args: string[], options?: CommandOptions): Promise<CommandResult> => {
    const resolution = await resolveCommand(command)

    return new Promise((resolve) => {
      let stdout = ""
      let stderr = ""
      let settled = false
      let callbackError: Error | null = null
      const pendingCallbacks: Array<Promise<void>> = []
      const child = spawn(resolution.command, args, {
        cwd: options?.cwd,
        env: {
          ...process.env,
          ...env,
          HOME: homeDir,
          PATH: resolution.path
        },
        stdio: [options?.stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"]
      })

      options?.onChild?.(child)
      if (options?.stdin !== undefined) {
        child.stdin?.on("error", (error) => {
          callbackError ??= error
        })
        child.stdin?.end(options.stdin, "utf8")
      }

      const settle = (result: CommandResult) => {
        if (settled) {
          return
        }
        settled = true
        void Promise.allSettled(pendingCallbacks).then(() => {
          resolve(callbackError ? { ...result, status: null, error: callbackError } : result)
        })
      }

      const dispatchChunk = (handler: ((chunk: string) => MaybePromise<void>) | undefined, chunk: string) => {
        if (!handler) {
          return
        }

        pendingCallbacks.push(
          Promise.resolve(handler(chunk)).catch((error: unknown) => {
            callbackError = error instanceof Error ? error : new Error(String(error))
          })
        )
      }

      child.stdout?.setEncoding("utf8")
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk
        dispatchChunk(options?.onStdout, chunk)
      })

      child.stderr?.setEncoding("utf8")
      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk
        dispatchChunk(options?.onStderr, chunk)
      })

      child.on("error", (error) => {
        settle({
          stdout,
          stderr,
          status: null,
          error
        })
      })

      child.on("close", (status) => {
        settle({
          stdout,
          stderr,
          status
        })
      })
    })
  }

  return {
    runCommand,
    resolveCommand,
    invalidateResolutionCache: () => {
      loginShellPathPromise = null
      commandResolutionCache.clear()
    }
  }
}

const parseJsonLine = (line: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(line) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Keep malformed provider output as raw progress so the run remains inspectable.
  }

  return {
    type: "raw",
    line
  }
}

const readString = (value: unknown) => (typeof value === "string" ? value : null)

const readBoolean = (value: unknown) => (typeof value === "boolean" ? value : null)

const readRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null

const readNumber = (value: unknown) => (typeof value === "number" ? value : null)

const isTerminalRunStatus = (status: ConversationRunStatus) =>
  status === "completed" || status === "failed" || status === "interrupted" || status === "unavailable"

const containsClaudeAuthFailure = (output: string) =>
  /(auth|login|logged in|unauthori[sz]ed|forbidden|expired|api key|\b401\b|\b403\b)/i.test(output)

const containsOpenCodeAuthFailure = (output: string) =>
  /(auth|login|credential|unauthori[sz]ed|forbidden|expired|api key|\b401\b|\b403\b)/i.test(output)

const MAX_TOOL_PAYLOAD_STRING_LENGTH = 500

const redactProviderString = (value: string, maxLength = MAX_PROVIDER_PAYLOAD_STRING_LENGTH) => {
  const redacted = value
    .replace(/((?:[A-Z0-9_]*API_KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION)\s*=\s*)[^\s"',}]+/gi, "$1[REDACTED]")
    .replace(/(["']?(?:api[_-]?key|token|secret|password|credential|authorization)["']?\s*[:=]\s*["']?)([^"',}\s]+)/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED]")

  if (redacted.length <= maxLength) {
    return redacted
  }

  return `${redacted.slice(0, maxLength)}...[TRUNCATED ${redacted.length - maxLength} chars]`
}

const isSensitivePayloadKey = (key: string) =>
  /(api[_-]?key|token|secret|password|credential|authorization|auth[_-]?header)/i.test(key)

const isToolPayloadKey = (key: string) =>
  /\b(input|output|content|result)\b/i.test(key)

const sanitizeProviderPayload = (value: unknown, depth = 0, parentKey?: string): unknown => {
  if (typeof value === "string") {
    const maxLength = parentKey && isToolPayloadKey(parentKey) ? MAX_TOOL_PAYLOAD_STRING_LENGTH : undefined
    return redactProviderString(value, maxLength)
  }

  if (typeof value !== "object" || value === null) {
    return value
  }

  if (depth >= 6) {
    return "[TRUNCATED depth]"
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeProviderPayload(item, depth + 1, parentKey))
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      isSensitivePayloadKey(key) ? "[REDACTED]" : sanitizeProviderPayload(entry, depth + 1, key)
    ])
  )
}

const normalizeCodexEvent = (rawEvent: Record<string, unknown>, context: ProviderRunInput): ProviderRunEvent | null => {
  const rawType = readString(rawEvent.type) ?? "unknown"
  const nativeEventId = readString(rawEvent.event_id) ?? readString(rawEvent.eventId)
  const basePayload = {
    provider: context.provider,
    conversationId: context.conversationId,
    runId: context.runId,
    worktreeId: context.worktreeId,
    worktreeRootPath: context.worktreeRootPath,
    rawType,
    ...(nativeEventId ? { providerEventId: `${rawType}:${nativeEventId}` } : {}),
    raw: sanitizeProviderPayload(rawEvent)
  }

  if (rawType === "thread.started") {
    return {
      type: "run.started",
      status: "running",
      payload: {
        ...basePayload,
        threadId: readString(rawEvent.thread_id) ?? readString(rawEvent.threadId)
      }
    }
  }

  if (rawType === "turn.started") {
    return {
      type: "run.progress",
      payload: basePayload
    }
  }

  if (rawType === "agent_message_delta" || rawType === "message.delta") {
    return {
      type: "run.message.delta",
      payload: {
        ...basePayload,
        text: readString(rawEvent.delta) ?? readString(rawEvent.text) ?? ""
      }
    }
  }

  if (rawType === "agent_message" || rawType === "message.completed") {
    return {
      type: "run.message.completed",
      payload: {
        ...basePayload,
        text: readString(rawEvent.message) ?? readString(rawEvent.text) ?? ""
      }
    }
  }

  if (rawType === "item.completed") {
    const item = readRecord(rawEvent.item)
    const itemType = readString(item?.type)
    if (itemType === "agent_message") {
      return {
        type: "run.message.completed",
        payload: {
          ...basePayload,
          itemType,
          text: readString(item?.text) ?? readString(item?.message) ?? ""
        }
      }
    }
  }

  if (rawType === "error") {
    return {
      type: "run.status",
      payload: {
        ...basePayload,
        message: readString(rawEvent.message) ?? "provider-error"
      }
    }
  }

  if (rawType === "turn.failed") {
    const rawError = rawEvent.error
    const errorMessage = rawError && typeof rawError === "object"
      ? readString((rawError as Record<string, unknown>).message)
      : null

    return {
      type: "run.error",
      status: "failed",
      payload: {
        ...basePayload,
        message: errorMessage ?? readString(rawEvent.message) ?? "provider-run-failed"
      }
    }
  }

  if (rawType === "turn.completed") {
    return {
      type: "run.completed",
      status: "completed",
      payload: basePayload
    }
  }

  return {
    type: "run.progress",
    payload: basePayload
  }
}

const normalizeCodexJsonl = (output: string, context: ProviderRunInput): ProviderRunEvent[] =>
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map(parseJsonLine)
    .map((event) => normalizeCodexEvent(event, context))
    .filter((event): event is ProviderRunEvent => event !== null)

type CodexAppServerNormalizationState = {
  itemPhases: Map<string, "commentary" | "final">
}

const readCodexMessagePhase = (value: unknown): "commentary" | "final" | null => {
  if (value === "commentary") {
    return "commentary"
  }
  if (value === "final_answer" || value === "final") {
    return "final"
  }
  return null
}

const readCodexReasoningText = (value: unknown) => {
  if (!Array.isArray(value)) {
    return readString(value) ?? ""
  }

  return value.map((entry) => {
    if (typeof entry === "string") {
      return entry
    }
    const record = readRecord(entry)
    return readString(record?.text) ?? ""
  }).filter(Boolean).join("\n")
}

const normalizeCodexAppServerNotification = (
  notification: CodexAppServerNotification,
  context: ProviderRunInput,
  state: CodexAppServerNormalizationState
): ProviderRunEvent | null => {
  const rawType = notification.method
  const params = notification.params
  const basePayload = {
    provider: context.provider,
    conversationId: context.conversationId,
    runId: context.runId,
    worktreeId: context.worktreeId,
    worktreeRootPath: context.worktreeRootPath,
    rawType,
    transport: "app-server",
    raw: sanitizeProviderPayload(params)
  }

  if (rawType === "thread/started") {
    const thread = readRecord(params.thread)
    return {
      type: "run.started",
      status: "running",
      payload: {
        ...basePayload,
        threadId: readString(thread?.id) ?? readString(params.threadId)
      }
    }
  }

  if (rawType === "turn/started") {
    const turn = readRecord(params.turn)
    return {
      type: "run.progress",
      payload: {
        ...basePayload,
        turnId: readString(turn?.id) ?? readString(params.turnId),
        contentType: "turn"
      }
    }
  }

  if (rawType === "item/agentMessage/delta") {
    const messageId = readString(params.itemId)
    const phase = messageId ? state.itemPhases.get(messageId) : undefined
    return {
      type: "run.message.delta",
      payload: {
        ...basePayload,
        messageId,
        phase: phase ?? "commentary",
        text: readString(params.delta) ?? ""
      }
    }
  }

  if (rawType === "item/reasoning/summaryTextDelta") {
    return {
      type: "run.reasoning.delta",
      payload: {
        ...basePayload,
        messageId: readString(params.itemId),
        summaryIndex: typeof params.summaryIndex === "number" ? params.summaryIndex : null,
        text: readString(params.delta) ?? "",
        visibility: "summary"
      }
    }
  }

  if (rawType === "item/reasoning/textDelta") {
    // Raw chain-of-thought is intentionally neither persisted nor rendered. The public
    // reasoning summary stream above is the supported user-facing process signal.
    return null
  }

  if (rawType === "item/started" || rawType === "item/completed") {
    const item = readRecord(params.item)
    const itemType = readString(item?.type) ?? "unknown"
    const itemId = readString(item?.id)
    const phase = readCodexMessagePhase(item?.phase)
    if (itemId && phase) {
      state.itemPhases.set(itemId, phase)
    }

    if (rawType === "item/completed" && itemType === "agentMessage") {
      const resolvedPhase = phase ?? (itemId ? state.itemPhases.get(itemId) : undefined) ?? "commentary"
      return {
        type: "run.message.completed",
        payload: {
          ...basePayload,
          ...(itemId ? { providerEventId: `${rawType}:${itemId}` } : {}),
          messageId: itemId,
          phase: resolvedPhase,
          authoritative: resolvedPhase === "final",
          text: readString(item?.text) ?? ""
        }
      }
    }

    if (rawType === "item/completed" && itemType === "reasoning") {
      return {
        type: "run.reasoning.completed",
        payload: {
          ...basePayload,
          ...(itemId ? { providerEventId: `${rawType}:${itemId}` } : {}),
          messageId: itemId,
          text: readCodexReasoningText(item?.summary),
          visibility: "summary"
        }
      }
    }

    return {
      type: "run.progress",
      payload: {
        ...basePayload,
        contentType: itemType,
        itemId,
        phase: rawType === "item/completed" ? "completed" : "running",
        item: sanitizeProviderPayload(item)
      }
    }
  }

  if (rawType === "turn/plan/updated" || rawType === "turn/diff/updated") {
    return {
      type: "run.progress",
      payload: {
        ...basePayload,
        contentType: rawType === "turn/plan/updated" ? "plan" : "diff",
        plan: sanitizeProviderPayload(params.plan),
        diff: typeof params.diff === "string" ? params.diff : undefined
      }
    }
  }

  if (rawType === "turn/completed") {
    const turn = readRecord(params.turn)
    const turnStatus = readString(turn?.status)
    const turnId = readString(turn?.id)
    if (turnStatus === "failed") {
      const error = readRecord(turn?.error)
      return {
        type: "run.error",
        status: "failed",
        payload: {
          ...basePayload,
          ...(turnId ? { providerEventId: `${rawType}:${turnId}` } : {}),
          message: readString(error?.message) ?? "codex-turn-failed",
          turnId
        }
      }
    }
    if (turnStatus === "interrupted") {
      return {
        type: "run.interrupted",
        status: "interrupted",
        payload: {
          ...basePayload,
          ...(turnId ? { providerEventId: `${rawType}:${turnId}` } : {}),
          message: "cancelled-by-user",
          reason: "cancelled-by-user",
          turnId
        }
      }
    }
    return {
      type: "run.completed",
      status: "completed",
      payload: {
        ...basePayload,
        ...(turnId ? { providerEventId: `${rawType}:${turnId}` } : {}),
        turnId
      }
    }
  }

  if (rawType === "error") {
    const error = readRecord(params.error)
    return {
      type: "run.status",
      payload: {
        ...basePayload,
        message: readString(error?.message) ?? readString(params.message) ?? "codex-provider-error"
      }
    }
  }

  if (rawType === "app-server/raw") {
    return {
      type: "provider.raw",
      payload: basePayload
    }
  }

  return {
    type: "run.progress",
    payload: basePayload
  }
}

type CursorAcpNormalizationState = {
  assistantText: string
  assistantMessageId: string | null
  reasoningText: string
  reasoningMessageId: string | null
  toolTitles: Map<string, string>
}

const readAcpTextContent = (value: unknown) => {
  const content = readRecord(value)
  return content?.type === "text" ? readString(content.text) ?? "" : ""
}

export const normalizeCursorAcpNotification = (
  notification: CursorAcpNotification,
  context: ProviderRunInput,
  state: CursorAcpNormalizationState
): ProviderRunEvent | null => {
  const rawType = notification.method
  const params = notification.params
  const sessionId = readString(params.sessionId)
  const basePayload = {
    provider: context.provider,
    conversationId: context.conversationId,
    runId: context.runId,
    worktreeId: context.worktreeId,
    worktreeRootPath: context.worktreeRootPath,
    rawType,
    transport: "acp",
    sessionId,
    raw: sanitizeProviderPayload(params)
  }

  if (rawType === "teamcow/session_ready") {
    return {
      type: "run.started",
      status: "running",
      payload: {
        ...basePayload,
        resumed: readBoolean(params.resumed),
        mode: readString(params.mode),
        model: readString(params.model),
        modelValue: readString(params.modelValue)
      }
    }
  }

  if (rawType === "session/request_permission") {
    const toolCall = readRecord(params.toolCall)
    const requestId = readString(toolCall?.toolCallId) ?? "cursor-permission"
    return {
      type: "run.approval.requested",
      payload: {
        ...basePayload,
        requestId,
        approvalId: requestId,
        toolCallId: requestId,
        title: readString(toolCall?.title),
        toolKind: readString(toolCall?.kind),
        options: sanitizeProviderPayload(params.options),
        locations: sanitizeProviderPayload(toolCall?.locations)
      }
    }
  }

  if (rawType === "teamcow/permission_resolved") {
    const requestId = readString(params.toolCallId) ?? "cursor-permission"
    return {
      type: "run.approval.resolved",
      payload: {
        ...basePayload,
        requestId,
        approvalId: requestId,
        toolCallId: requestId,
        decision: readString(params.selectedOptionKind) ?? undefined,
        accessMode: readString(params.accessMode),
        selectedOptionId: readString(params.selectedOptionId),
        selectedOptionKind: readString(params.selectedOptionKind),
        outcome: sanitizeProviderPayload(params.outcome)
      }
    }
  }

  if (rawType === "cursor/ask_question") {
    return {
      type: "provider.notice",
      payload: {
        ...basePayload,
        contentType: "question",
        title: readString(params.title),
        questions: sanitizeProviderPayload(params.questions),
        reason: "live-question-skipped"
      }
    }
  }

  if (rawType === "cursor/create_plan" || rawType === "cursor/update_todos") {
    return {
      type: "run.progress",
      payload: {
        ...basePayload,
        contentType: "plan",
        title: readString(params.name),
        overview: readString(params.overview),
        plan: readString(params.plan),
        todos: sanitizeProviderPayload(params.todos),
        phases: sanitizeProviderPayload(params.phases),
        merge: readBoolean(params.merge)
      }
    }
  }

  if (rawType === "cursor/task") {
    return {
      type: "run.progress",
      payload: {
        ...basePayload,
        contentType: "subagent-task",
        toolCallId: readString(params.toolCallId),
        description: readString(params.description),
        subagentType: sanitizeProviderPayload(params.subagentType),
        agentId: readString(params.agentId),
        durationMs: readNumber(params.durationMs)
      }
    }
  }

  if (rawType === "cursor/generate_image") {
    return {
      type: "run.artifact.changed",
      payload: {
        ...basePayload,
        contentType: "image",
        toolCallId: readString(params.toolCallId),
        description: readString(params.description),
        path: readString(params.filePath),
        referenceImagePaths: sanitizeProviderPayload(params.referenceImagePaths)
      }
    }
  }

  if (rawType !== "session/update") {
    return {
      type: "provider.raw",
      payload: basePayload
    }
  }

  const update = readRecord(params.update)
  const updateType = readString(update?.sessionUpdate) ?? "unknown"
  const messageId = readString(update?.messageId)
  const updatePayload = {
    ...basePayload,
    rawType: updateType,
    providerEventId: messageId ? `${updateType}:${messageId}` : undefined
  }

  if (updateType === "agent_message_chunk") {
    const text = readAcpTextContent(update?.content)
    state.assistantText += text
    state.assistantMessageId = messageId ?? state.assistantMessageId
    return {
      type: "run.message.delta",
      payload: {
        ...updatePayload,
        messageId,
        phase: "final",
        authoritative: false,
        text
      }
    }
  }

  if (updateType === "agent_thought_chunk") {
    const text = readAcpTextContent(update?.content)
    state.reasoningText += text
    state.reasoningMessageId = messageId ?? state.reasoningMessageId
    return {
      type: "run.reasoning.delta",
      payload: {
        ...updatePayload,
        messageId,
        text,
        visibility: "summary"
      }
    }
  }

  if (updateType === "tool_call" || updateType === "tool_call_update") {
    const toolCallId = readString(update?.toolCallId)
    const title = readString(update?.title)
      ?? (toolCallId ? state.toolTitles.get(toolCallId) : null)
      ?? "Cursor tool"
    if (toolCallId && readString(update?.title)) {
      state.toolTitles.set(toolCallId, title)
    }
    const status = readString(update?.status)
    const payload = {
      ...updatePayload,
      toolCallId,
      toolName: readString(update?.name) ?? readString(update?.kind) ?? undefined,
      title,
      toolKind: readString(update?.kind),
      toolStatus: status,
      locations: sanitizeProviderPayload(update?.locations),
      content: sanitizeProviderPayload(update?.content),
      input: sanitizeProviderPayload(update?.rawInput),
      output: sanitizeProviderPayload(update?.rawOutput)
    }
    if (status === "completed") {
      return { type: "run.tool.completed", payload }
    }
    if (status === "failed") {
      return { type: "run.tool.failed", payload }
    }
    return updateType === "tool_call"
      ? { type: "run.tool.started", payload }
      : { type: "run.progress", payload: { ...payload, contentType: "tool" } }
  }

  if (updateType === "plan" || updateType === "plan_update" || updateType === "plan_removed") {
    return {
      type: "run.progress",
      payload: {
        ...updatePayload,
        contentType: "plan",
        entries: sanitizeProviderPayload(update?.entries),
        plan: sanitizeProviderPayload(update)
      }
    }
  }

  if (updateType === "user_message_chunk") {
    return null
  }

  if (
    updateType === "usage_update"
    || updateType === "current_mode_update"
    || updateType === "config_option_update"
    || updateType === "session_info_update"
    || updateType === "available_commands_update"
  ) {
    return {
      type: "run.progress",
      payload: {
        ...updatePayload,
        contentType: updateType.replace(/_update$/, "").replaceAll("_", "-"),
        update: sanitizeProviderPayload(update)
      }
    }
  }

  return {
    type: "provider.raw",
    payload: updatePayload
  }
}

const parseClaudeJsonLine = (line: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(line) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }

    return {
      type: "raw",
      line,
      raw: parsed,
      parseError: "non-object-json"
    }
  } catch {
    return {
      type: "raw",
      line,
      parseError: "invalid-json"
    }
  }
}

const buildProviderEventPayload = (
  rawEvent: Record<string, unknown>,
  context: ProviderRunInput,
  rawType: string
) => ({
  provider: context.provider,
  conversationId: context.conversationId,
  runId: context.runId,
  worktreeId: context.worktreeId,
  worktreeRootPath: context.worktreeRootPath,
  rawType,
  raw: sanitizeProviderPayload(rawEvent)
})

const buildCommandResultRawPayload = (result: CommandResult): Record<string, unknown> => ({
  status: result.status,
  ...(result.stdout.trim().length > 0 ? { stdout: redactProviderString(result.stdout) } : {}),
  ...(result.stderr.trim().length > 0 ? { stderr: redactProviderString(result.stderr) } : {}),
  ...(result.error
    ? { error: sanitizeProviderPayload({ name: result.error.name, message: result.error.message }) }
    : {})
})

const buildProviderDiagnosticEvent = (
  context: ProviderRunInput,
  rawType: string,
  message: string,
  raw: Record<string, unknown>,
  extras: Record<string, unknown> = {}
): ProviderRunEvent => ({
  type: "run.error",
  status: "failed",
  payload: {
    provider: context.provider,
    conversationId: context.conversationId,
    runId: context.runId,
    worktreeId: context.worktreeId,
    worktreeRootPath: context.worktreeRootPath,
    rawType,
    raw: sanitizeProviderPayload(raw),
    message: redactProviderString(message),
    ...(sanitizeProviderPayload(extras) as Record<string, unknown>)
  }
})

type ClaudeNormalizationState = {
  activeBlockIndexesByScope: Map<string, number>
  activeMessageIdsByScope: Map<string, string>
  messageSequencesByScope: Map<string, number>
}

const createClaudeNormalizationState = (): ClaudeNormalizationState => ({
  activeBlockIndexesByScope: new Map(),
  activeMessageIdsByScope: new Map(),
  messageSequencesByScope: new Map()
})

const getClaudeStreamScope = (rawEvent: Record<string, unknown>, context: ProviderRunInput) => [
  readString(rawEvent.session_id) ?? readString(rawEvent.sessionId) ?? context.runId,
  readString(rawEvent.parent_tool_use_id) ?? readString(rawEvent.parentToolUseId) ?? "root"
].join(":")

const startClaudeStreamMessage = (
  state: ClaudeNormalizationState,
  scope: string,
  streamEvent: Record<string, unknown>,
  context: ProviderRunInput
) => {
  const nextSequence = (state.messageSequencesByScope.get(scope) ?? 0) + 1
  state.messageSequencesByScope.set(scope, nextSequence)
  const message = readRecord(streamEvent.message)
  const messageId = readString(message?.id) ?? `${context.runId}:${scope}:message-${nextSequence}`
  state.activeMessageIdsByScope.set(scope, messageId)
  state.activeBlockIndexesByScope.delete(scope)
  return messageId
}

const normalizeClaudeContentBlock = (
  block: Record<string, unknown>,
  blockIndex: number,
  context: ProviderRunInput,
  basePayload: ReturnType<typeof buildProviderEventPayload> & {
    providerMessageId?: string | null
    sessionId?: string | null
  }
): ProviderRunEvent | null => {
  const blockType = readString(block.type) ?? "unknown"
  const providerMessageId = readString(basePayload.providerMessageId) ?? readString(basePayload.sessionId) ?? "assistant"
  const messageId = `${providerMessageId}:${blockIndex}`

  if (blockType === "text") {
    return {
      type: "run.message.completed",
      payload: {
        ...basePayload,
        messageId,
        phase: "commentary",
        authoritative: false,
        text: readString(block.text) ?? "",
        contentType: blockType
      }
    }
  }

  if (blockType === "thinking") {
    return {
      type: "run.reasoning.completed",
      payload: {
        ...basePayload,
        messageId,
        text: readString(block.thinking) ?? readString(block.text) ?? "",
        contentType: blockType,
        visibility: "summary"
      }
    }
  }

  if (blockType === "tool_use") {
    return {
      type: "run.progress",
      payload: {
        ...basePayload,
        contentType: blockType,
        toolUse: {
          id: readString(block.id),
          name: readString(block.name),
          input: sanitizeProviderPayload(readRecord(block.input))
        },
        rawBlock: sanitizeProviderPayload(block)
      }
    }
  }

  if (blockType === "tool_result") {
    return {
      type: "run.progress",
      payload: {
        ...basePayload,
        contentType: blockType,
        toolResult: {
          toolUseId: readString(block.tool_use_id) ?? readString(block.toolUseId),
          isError: readBoolean(block.is_error) ?? readBoolean(block.isError),
          content: sanitizeProviderPayload(block.content)
        },
        rawBlock: sanitizeProviderPayload(block)
      }
    }
  }

  return {
    type: "run.progress",
    payload: {
      ...basePayload,
      contentType: blockType,
      rawBlock: sanitizeProviderPayload(block)
    }
  }
}

const normalizeClaudeContentEvent = (
  rawEvent: Record<string, unknown>,
  context: ProviderRunInput,
  basePayload: ReturnType<typeof buildProviderEventPayload> & {
    providerMessageId?: string | null
    sessionId?: string | null
  },
  state: ClaudeNormalizationState
): ProviderRunEvent[] => {
  const message = readRecord(rawEvent.message)
  const content = message?.content
  if (!Array.isArray(content)) {
    return [
      {
        type: "run.progress",
        payload: basePayload
      }
    ]
  }

  if (content.length === 0) {
    return [
      {
        type: "provider.raw",
        payload: {
          ...basePayload,
          parseError: "empty-content"
        }
      }
    ]
  }

  const scope = getClaudeStreamScope(rawEvent, context)
  const activeBlockIndex = state.activeBlockIndexesByScope.get(scope)
  const providerMessageId = readString(message?.id) ?? readString(basePayload.providerMessageId)
  const contentBasePayload = {
    ...basePayload,
    providerMessageId
  }

  return content.map((block, blockIndex) => {
    const record = readRecord(block)
    if (!record) {
      return {
        type: "provider.raw",
        payload: {
          ...contentBasePayload,
          parseError: "invalid-content-block",
          rawBlock: sanitizeProviderPayload(block)
        }
      }
    }

    const resolvedBlockIndex = content.length === 1 && activeBlockIndex !== undefined
      ? activeBlockIndex
      : blockIndex
    return normalizeClaudeContentBlock(record, resolvedBlockIndex, context, contentBasePayload)
  }).filter((event): event is ProviderRunEvent => event !== null)
}

const normalizeClaudeEvent = (
  rawEvent: Record<string, unknown>,
  context: ProviderRunInput,
  state: ClaudeNormalizationState
): ProviderRunEvent[] => {
  const rawType = readString(rawEvent.type) ?? "unknown"
  const basePayload = {
    ...buildProviderEventPayload(rawEvent, context, rawType),
    providerMessageId: readString(rawEvent.uuid) ?? readString(rawEvent.message_id) ?? readString(rawEvent.messageId),
    sessionId: readString(rawEvent.session_id) ?? readString(rawEvent.sessionId)
  }

  if (rawType === "raw") {
    return [
      {
        type: "provider.raw",
        payload: {
          ...basePayload,
          line: redactProviderString(readString(rawEvent.line) ?? ""),
          parseError: readString(rawEvent.parseError) ?? "unknown-raw-output"
        }
      }
    ]
  }

  if (rawType === "system") {
    const subtype = readString(rawEvent.subtype)
    if (subtype === "init") {
      return [
        {
          type: "run.started",
          status: "running",
          payload: {
            ...basePayload,
            subtype,
            sessionId: readString(rawEvent.session_id) ?? readString(rawEvent.sessionId),
            model: readString(rawEvent.model)
          }
        }
      ]
    }

    return [
      {
        type: "run.progress",
        payload: {
          ...basePayload,
          subtype
        }
      }
    ]
  }

  if (rawType === "stream_event") {
    const streamEvent = readRecord(rawEvent.event)
    const streamEventType = readString(streamEvent?.type) ?? "unknown"
    const delta = readRecord(streamEvent?.delta)
    const deltaType = readString(delta?.type)
    const blockIndex = typeof streamEvent?.index === "number" ? streamEvent.index : 0
    const scope = getClaudeStreamScope(rawEvent, context)
    let providerMessageId = state.activeMessageIdsByScope.get(scope)

    if (streamEventType === "message_start" && streamEvent) {
      providerMessageId = startClaudeStreamMessage(state, scope, streamEvent, context)
    } else if (streamEventType === "content_block_start") {
      state.activeBlockIndexesByScope.set(scope, blockIndex)
    }

    providerMessageId ??= `${context.runId}:${scope}:message-0`
    const messageId = `${providerMessageId}:${blockIndex}`
    const streamPayload = {
      ...basePayload,
      providerMessageId
    }

    if (streamEventType === "content_block_delta" && deltaType === "text_delta") {
      return [
        {
          type: "run.message.delta",
          payload: {
            ...streamPayload,
            rawStreamType: streamEventType,
            messageId,
            phase: "commentary",
            authoritative: false,
            text: readString(delta?.text) ?? ""
          }
        }
      ]
    }

    if (streamEventType === "content_block_delta" && deltaType === "thinking_delta") {
      return [
        {
          type: "run.reasoning.delta",
          payload: {
            ...streamPayload,
            rawStreamType: streamEventType,
            messageId,
            text: readString(delta?.thinking) ?? readString(delta?.text) ?? "",
            visibility: "summary"
          }
        }
      ]
    }

    if (streamEventType === "content_block_stop") {
      state.activeBlockIndexesByScope.delete(scope)
    } else if (streamEventType === "message_stop") {
      state.activeBlockIndexesByScope.delete(scope)
      state.activeMessageIdsByScope.delete(scope)
    }

    return [
      {
        type: "run.progress",
        payload: {
          ...streamPayload,
          rawStreamType: streamEventType,
          contentType: deltaType ?? readString(readRecord(streamEvent?.content_block)?.type)
        }
      }
    ]
  }

  if (rawType === "assistant" || rawType === "user") {
    return normalizeClaudeContentEvent(rawEvent, context, basePayload, state)
  }

  if (rawType === "result") {
    const isError = readBoolean(rawEvent.is_error) ?? readBoolean(rawEvent.isError) ?? false
    const subtype = readString(rawEvent.subtype)
    const resultId = readString(rawEvent.uuid) ?? readString(rawEvent.session_id) ?? context.runId
    const message = readString(rawEvent.result) ?? readString(rawEvent.message) ?? subtype ?? "claude-result"
    if (isError || subtype === "error" || subtype === "failed") {
      return [
        {
          type: "run.error",
          status: "failed",
          payload: {
            ...basePayload,
            providerEventId: `result:error:${resultId}`,
            subtype,
            message
          }
        }
      ]
    }

    const resultEvents: ProviderRunEvent[] = []
    if (message.trim().length > 0) {
      resultEvents.push({
        type: "run.message.completed",
        payload: {
          ...basePayload,
          providerEventId: `result:message:${resultId}`,
          subtype,
          messageId: readString(rawEvent.uuid) ?? `result:${readString(rawEvent.session_id) ?? context.runId}`,
          phase: "final",
          authoritative: true,
          text: message
        }
      })
    }
    resultEvents.push({
      type: "run.completed",
      status: "completed",
      payload: {
        ...basePayload,
        providerEventId: `result:completed:${resultId}`,
        subtype,
        message,
        sessionId: readString(rawEvent.session_id) ?? readString(rawEvent.sessionId),
        usage: sanitizeProviderPayload(rawEvent.usage),
        costUsd: typeof rawEvent.total_cost_usd === "number" ? rawEvent.total_cost_usd : undefined
      }
    })
    return resultEvents
  }

  if (rawType === "error") {
    return [
      {
        type: "run.error",
        status: "failed",
        payload: {
          ...basePayload,
          message: readString(rawEvent.message) ?? "claude-provider-error"
        }
      }
    ]
  }

  return [
    {
      type: "run.progress",
      payload: basePayload
    }
  ]
}

const normalizeClaudeJsonl = (output: string, context: ProviderRunInput): ProviderRunEvent[] => {
  const state = createClaudeNormalizationState()
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseClaudeJsonLine)
    .flatMap((event) => normalizeClaudeEvent(event, context, state))
}

const eventHasAssistantText = (event: ProviderRunEvent) => {
  if (event.type !== "run.message.delta" && event.type !== "run.message.completed") {
    return false
  }

  const text = readString(event.payload.text) ?? readString(event.payload.delta)
  return Boolean(text?.trim())
}

const eventHasMalformedClaudeAssistantContent = (event: ProviderRunEvent) =>
  event.type === "provider.raw" &&
  event.payload.rawType === "assistant" &&
  Boolean(readString(event.payload.parseError))

const promoteClaudeResultTextFallback = (events: ProviderRunEvent[]): ProviderRunEvent[] => {
  if (events.some(eventHasMalformedClaudeAssistantContent)) {
    return events
  }

  let hasAssistantText = events.some(eventHasAssistantText)

  return events.flatMap((event) => {
    if (event.type !== "run.completed" || event.payload.rawType !== "result" || hasAssistantText) {
      return [event]
    }

    const message = readString(event.payload.message)
    if (!message?.trim()) {
      return [event]
    }

    hasAssistantText = true
    const completedPayload = { ...event.payload }
    delete completedPayload.message

    return [
      {
        type: "run.message.delta",
        payload: {
          ...completedPayload,
          text: message,
          contentType: "text",
          promotedFromResult: true
        }
      },
      {
        ...event,
        payload: completedPayload
      }
    ]
  })
}

const parseOpenCodeJsonLine = (line: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(line) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }

    return {
      type: "raw",
      line,
      raw: parsed,
      parseError: "non-object-json"
    }
  } catch {
    return {
      type: "raw",
      line,
      parseError: "invalid-json"
    }
  }
}

const readSessionId = (rawEvent: Record<string, unknown>) =>
  readString(rawEvent.sessionID) ?? readString(rawEvent.sessionId) ?? readString(rawEvent.session_id)

const readTextPayload = (rawEvent: Record<string, unknown>) => {
  const message = readRecord(rawEvent.message)
  const part = readRecord(rawEvent.part)
  return readString(rawEvent.text) ??
    readString(rawEvent.delta) ??
    readString(rawEvent.content) ??
    readString(part?.text) ??
    readString(message?.text) ??
    readString(message?.content) ??
    ""
}

const readOpenCodeUsage = (rawEvent: Record<string, unknown>) => {
  const usage = readRecord(rawEvent.usage)
  if (usage) {
    return usage
  }

  const part = readRecord(rawEvent.part)
  return readRecord(part?.tokens)
}

const readOpenCodeStatus = (rawEvent: Record<string, unknown>) =>
  readString(rawEvent.status) ?? readNumber(rawEvent.status)

const buildOpenCodeErrorPayload = (
  rawEvent: Record<string, unknown>,
  basePayload: ReturnType<typeof buildProviderEventPayload>,
  sessionId: string | null | undefined,
  fallbackMessage: string
) => ({
  ...basePayload,
  sessionId,
  message: redactProviderString(readString(rawEvent.message) ??
    readString(rawEvent.error) ??
    readString(rawEvent.reason) ??
    fallbackMessage),
  ...(readOpenCodeStatus(rawEvent) !== null ? { status: readOpenCodeStatus(rawEvent) } : {}),
  ...(readString(rawEvent.code) ? { code: readString(rawEvent.code) } : {}),
  ...(readString(rawEvent.subtype) ? { subtype: readString(rawEvent.subtype) } : {}),
  ...(readString(rawEvent.stderr) ? { stderr: redactProviderString(readString(rawEvent.stderr) ?? "") } : {})
})

const normalizeOpenCodeEvent = (rawEvent: Record<string, unknown>, context: ProviderRunInput): ProviderRunEvent[] => {
  const rawType = readString(rawEvent.type) ?? "unknown"
  const normalizedType = rawType.replace(/[.-]/g, "_")
  const basePayload = buildProviderEventPayload(rawEvent, context, rawType)
  const sessionId = readSessionId(rawEvent)

  if (rawType === "raw") {
    return [
      {
        type: "provider.raw",
        payload: {
          ...basePayload,
          line: redactProviderString(readString(rawEvent.line) ?? ""),
          parseError: readString(rawEvent.parseError) ?? "unknown-raw-output"
        }
      }
    ]
  }

  if (
    normalizedType === "step_start" ||
    normalizedType === "run_started" ||
    normalizedType === "session_started" ||
    normalizedType === "session_start"
  ) {
    return [
      {
        type: "run.started",
        status: "running",
        payload: {
          ...basePayload,
          sessionId,
          part: sanitizeProviderPayload(readRecord(rawEvent.part))
        }
      }
    ]
  }

  if (
    normalizedType === "text" ||
    normalizedType === "message" ||
    normalizedType === "message_delta" ||
    normalizedType === "assistant" ||
    normalizedType === "assistant_message"
  ) {
    return [
      {
        type: "run.message.completed",
        payload: {
          ...basePayload,
          sessionId,
          messageId: readString(readRecord(rawEvent.part)?.id) ?? readString(rawEvent.messageID) ?? readString(rawEvent.messageId),
          phase: "commentary",
          authoritative: false,
          text: readTextPayload(rawEvent)
        }
      }
    ]
  }

  if (normalizedType === "reasoning" || normalizedType === "thinking") {
    return [
      {
        type: "run.reasoning.completed",
        payload: {
          ...basePayload,
          sessionId,
          messageId: readString(readRecord(rawEvent.part)?.id) ?? readString(rawEvent.messageID) ?? readString(rawEvent.messageId),
          text: readTextPayload(rawEvent),
          visibility: "summary"
        }
      }
    ]
  }

  if (
    normalizedType.includes("tool") ||
    normalizedType.includes("permission") ||
    normalizedType.includes("file") ||
    normalizedType.includes("edit")
  ) {
    return [
      {
        type: "run.progress",
        payload: {
          ...basePayload,
          sessionId,
          toolUse: {
            name: readString(rawEvent.tool) ?? readString(rawEvent.name),
            status: readString(rawEvent.status),
            input: sanitizeProviderPayload(readRecord(rawEvent.input)),
            output: sanitizeProviderPayload(rawEvent.output)
          },
          part: sanitizeProviderPayload(readRecord(rawEvent.part))
        }
      }
    ]
  }

  if (
    normalizedType === "step_finish" ||
    normalizedType === "run_completed" ||
    normalizedType === "session_completed" ||
    normalizedType === "result" ||
    normalizedType === "done" ||
    normalizedType === "finish"
  ) {
    const isError = readBoolean(rawEvent.is_error) ??
      readBoolean(rawEvent.isError) ??
      (typeof readOpenCodeStatus(rawEvent) === "string" &&
        !["completed", "success", "ok"].includes(readOpenCodeStatus(rawEvent) as string))
    const message = readString(rawEvent.message) ?? readString(rawEvent.error) ?? readString(rawEvent.reason)
    if (isError) {
      return [
        {
          type: "run.error",
          status: "failed",
          payload: buildOpenCodeErrorPayload(rawEvent, basePayload, sessionId, message ?? "opencode-provider-error")
        }
      ]
    }

    return [
      {
        type: "run.completed",
        status: "completed",
        payload: {
          ...basePayload,
          sessionId,
          reason: readString(rawEvent.reason),
          usage: sanitizeProviderPayload(readOpenCodeUsage(rawEvent))
        }
      }
    ]
  }

  if (normalizedType.includes("error") || rawEvent.error) {
    return [
      {
        type: "run.error",
        status: "failed",
        payload: buildOpenCodeErrorPayload(rawEvent, basePayload, sessionId, "opencode-provider-error")
      }
    ]
  }

  return [
    {
      type: "run.progress",
      payload: {
        ...basePayload,
        sessionId
      }
    }
  ]
}

type OpenCodeServerNormalizationState = {
  partKinds: Map<string, string>
}

const normalizeOpenCodeServerEvent = (
  event: OpenCodeServerEvent,
  context: ProviderRunInput,
  state: OpenCodeServerNormalizationState
): ProviderRunEvent | null => {
  const rawType = event.type
  const properties = event.properties ?? {}
  const sessionId = readString(properties.sessionID)
  const basePayload = {
    provider: context.provider,
    conversationId: context.conversationId,
    runId: context.runId,
    worktreeId: context.worktreeId,
    worktreeRootPath: context.worktreeRootPath,
    rawType,
    transport: "server-sse",
    sessionId,
    raw: sanitizeProviderPayload(properties)
  }

  if (rawType === "message.part.updated") {
    const part = readRecord(properties.part)
    const partId = readString(part?.id)
    const partType = readString(part?.type) ?? "unknown"
    if (partId) {
      state.partKinds.set(partId, partType)
    }

    if (partType === "step-start") {
      return {
        type: "run.started",
        status: "running",
        payload: {
          ...basePayload,
          messageId: readString(part?.messageID),
          partId
        }
      }
    }

    const time = readRecord(part?.time)
    const isCompleted = typeof time?.end === "number"
    if (partType === "text" && isCompleted) {
      return {
        type: "run.message.completed",
        payload: {
          ...basePayload,
          ...(partId ? { providerEventId: `${rawType}:completed:${partId}` } : {}),
          messageId: partId,
          providerMessageId: readString(part?.messageID),
          phase: "commentary",
          authoritative: false,
          text: readString(part?.text) ?? ""
        }
      }
    }
    if (partType === "reasoning" && isCompleted) {
      return {
        type: "run.reasoning.completed",
        payload: {
          ...basePayload,
          ...(partId ? { providerEventId: `${rawType}:completed:${partId}` } : {}),
          messageId: partId,
          providerMessageId: readString(part?.messageID),
          text: readString(part?.text) ?? "",
          visibility: "summary"
        }
      }
    }

    return {
      type: "run.progress",
      payload: {
        ...basePayload,
        contentType: partType,
        partId,
        part: sanitizeProviderPayload(part)
      }
    }
  }

  if (rawType === "message.part.delta") {
    const partId = readString(properties.partID)
    const partType = partId ? state.partKinds.get(partId) : undefined
    const text = readString(properties.delta) ?? ""
    if (partType === "reasoning") {
      return {
        type: "run.reasoning.delta",
        payload: {
          ...basePayload,
          messageId: partId,
          providerMessageId: readString(properties.messageID),
          text,
          visibility: "summary"
        }
      }
    }
    return {
      type: "run.message.delta",
      payload: {
        ...basePayload,
        messageId: partId,
        providerMessageId: readString(properties.messageID),
        phase: "commentary",
        authoritative: false,
        text
      }
    }
  }

  if (rawType === "message.updated") {
    const info = readRecord(properties.info)
    return {
      type: "run.progress",
      payload: {
        ...basePayload,
        contentType: "message",
        providerMessageId: readString(info?.id),
        model: readString(info?.modelID),
        providerId: readString(info?.providerID),
        usage: sanitizeProviderPayload({
          tokens: info?.tokens,
          cost: info?.cost
        })
      }
    }
  }

  if (rawType === "session.idle") {
    return {
      type: "run.completed",
      status: "completed",
      payload: {
        ...basePayload,
        ...(sessionId ? { providerEventId: `${rawType}:${sessionId}` } : {})
      }
    }
  }

  if (rawType === "session.error") {
    const error = readRecord(properties.error)
    return {
      type: "run.error",
      status: "failed",
      payload: {
        ...basePayload,
        message: readString(error?.message) ?? readString(properties.message) ?? "opencode-session-error",
        error: sanitizeProviderPayload(properties.error)
      }
    }
  }

  return {
    type: "run.progress",
    payload: {
      ...basePayload,
      contentType: rawType === "session.status" ? "session-status" : "provider-event"
    }
  }
}

const normalizeOpenCodeJsonl = (output: string, context: ProviderRunInput): ProviderRunEvent[] =>
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseOpenCodeJsonLine)
    .flatMap((event) => normalizeOpenCodeEvent(event, context))

const promoteOpenCodeFinalMessage = (events: ProviderRunEvent[]): ProviderRunEvent[] => {
  let lastMessageIndex = -1
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.type === "run.message.completed" && (readString(event.payload.text) ?? "").trim().length > 0) {
      lastMessageIndex = index
      break
    }
  }
  if (lastMessageIndex < 0) {
    return events
  }

  return events.map((event, index) => index === lastMessageIndex
    ? {
        ...event,
        payload: {
          ...event.payload,
          phase: "final",
          authoritative: true
        }
      }
    : event)
}

const normalizeProviderJsonl = (provider: ProviderKind, stdout: string, stderr: string, context: ProviderRunInput) => {
  if (provider === "codex") {
    return normalizeCodexJsonl(`${stdout}\n${stderr}`.trim(), context)
  }

  if (provider === "claude") {
    return normalizeClaudeJsonl(stdout.trim(), context)
  }

  return normalizeOpenCodeJsonl(stdout.trim(), context)
}

const normalizeProviderJsonLine = (
  provider: ProviderKind,
  line: string,
  context: ProviderRunInput,
  claudeState: ClaudeNormalizationState
): ProviderRunEvent[] => {
  const trimmed = line.trim()
  if (trimmed.length === 0) {
    return []
  }

  if (provider === "codex") {
    if (!trimmed.startsWith("{")) {
      return []
    }

    const event = normalizeCodexEvent(parseJsonLine(trimmed), context)
    return event ? [event] : []
  }

  if (provider === "claude") {
    return normalizeClaudeEvent(parseClaudeJsonLine(trimmed), context, claudeState)
  }

  return normalizeOpenCodeEvent(parseOpenCodeJsonLine(trimmed), context)
}

const createProviderRunEventKey = (event: ProviderRunEvent) =>
  JSON.stringify({
    type: event.type,
    status: event.status ?? null,
    payload: event.payload
  })

const createProviderStreamHandlers = (
  input: ProviderRunInput,
  emitEvent: (event: ProviderRunEvent) => MaybePromise<void>
): Pick<CommandOptions, "onStdout" | "onStderr"> => {
  let stdoutBuffer = ""
  let stderrBuffer = ""
  const claudeState = createClaudeNormalizationState()

  const handleLine = async (line: string) => {
    const events = normalizeProviderJsonLine(input.provider, line, input, claudeState)
    for (const event of events) {
      if (event.status === "completed") {
        continue
      }

      await emitEvent(event)
    }
  }

  const handleChunk = async (chunk: string, source: "stdout" | "stderr") => {
    const output = source === "stdout" ? stdoutBuffer + chunk : stderrBuffer + chunk
    const lines = output.split(/\r?\n/)
    const nextBuffer = lines.pop() ?? ""

    if (source === "stdout") {
      stdoutBuffer = nextBuffer
    } else {
      stderrBuffer = nextBuffer
    }

    for (const line of lines) {
      await handleLine(line)
    }
  }

  return {
    onStdout: (chunk) => handleChunk(chunk, "stdout"),
    onStderr: input.provider === "codex" ? (chunk) => handleChunk(chunk, "stderr") : undefined
  }
}

// Claude Code accepts exact model IDs as well as aliases. Preserve the stored value so current
// catalog entries stay pinned while aliases saved by older conversations remain compatible.
const resolveClaudeCliModel = (model: string) => model

const resolveOpenCodeCliModel = (model: string) => model === "open-code-default" ? null : model

const normalizeProviderAccessMode = (accessMode: ProviderRunInput["accessMode"]): ProviderAccessMode => {
  const parsed = providerAccessModeSchema.safeParse(accessMode)
  return parsed.success ? parsed.data : DEFAULT_PROVIDER_ACCESS_MODE
}

const codexSandboxModeByAccessMode = {
  "read-only": "read-only",
  "worktree-write": "workspace-write",
  "full-access": "danger-full-access"
} satisfies Record<ProviderAccessMode, "read-only" | "workspace-write" | "danger-full-access">

const createCodexAccessArgs = (accessMode: ProviderRunInput["accessMode"], isResume: boolean): string[] => {
  const resolvedAccessMode = normalizeProviderAccessMode(accessMode)
  if (resolvedAccessMode === "full-access") {
    return ["--dangerously-bypass-approvals-and-sandbox"]
  }

  const sandboxMode = codexSandboxModeByAccessMode[resolvedAccessMode]
  return isResume
    ? ["-c", `sandbox_mode="${sandboxMode}"`, "-c", 'approval_policy="never"']
    : ["--sandbox", sandboxMode, "-c", 'approval_policy="never"']
}

const createCodexAppServerSandboxPolicy = (
  accessMode: ProviderRunInput["accessMode"],
  worktreeRootPath: string
): CodexAppServerSandboxPolicy => {
  const resolvedAccessMode = normalizeProviderAccessMode(accessMode)
  if (resolvedAccessMode === "full-access") {
    return { type: "dangerFullAccess" }
  }
  if (resolvedAccessMode === "read-only") {
    return { type: "readOnly", networkAccess: false }
  }
  return {
    type: "workspaceWrite",
    writableRoots: [worktreeRootPath],
    networkAccess: false
  }
}

const claudePermissionModeByAccessMode = {
  "read-only": "plan",
  "worktree-write": "acceptEdits",
  "full-access": "bypassPermissions"
} satisfies Record<ProviderAccessMode, "plan" | "acceptEdits" | "bypassPermissions">

const createClaudeAccessArgs = (accessMode: ProviderRunInput["accessMode"]): string[] => [
  "--permission-mode",
  claudePermissionModeByAccessMode[normalizeProviderAccessMode(accessMode)]
]

const expandClaudeAllowedTool = (tool: string): string[] => {
  if (tool === "WebFetch" || tool === "mcp__web-reader__webReader" || tool.includes("__web-reader__")) {
    return [tool, "WebFetch", "mcp__web-reader__webReader"]
  }

  if (tool === "WebSearch" || tool === "mcp__web-search-prime__web_search_prime" || tool.includes("__web-search")) {
    return [tool, "WebSearch", "mcp__web-search-prime__web_search_prime"]
  }

  return [tool]
}

const expandClaudeAllowedTools = (allowedTools: ProviderRunInput["allowedTools"]): string[] => {
  const expanded: string[] = []
  const seen = new Set<string>()

  for (const rawTool of allowedTools ?? []) {
    const tool = rawTool.trim()
    if (!tool) {
      continue
    }

    for (const candidate of expandClaudeAllowedTool(tool)) {
      if (!seen.has(candidate)) {
        seen.add(candidate)
        expanded.push(candidate)
      }
    }
  }

  return expanded
}

const createClaudeAllowedToolsArgs = (allowedTools: ProviderRunInput["allowedTools"]): string[] => {
  const tools = expandClaudeAllowedTools(allowedTools)
  return tools.length > 0 ? ["--allowedTools", tools.join(",")] : []
}

const createOpenCodeAccessArgs = (accessMode: ProviderRunInput["accessMode"]): string[] =>
  normalizeProviderAccessMode(accessMode) === "full-access" ? ["--dangerously-skip-permissions"] : []

const createOpenCodeServerPermissions = (
  accessMode: ProviderRunInput["accessMode"]
): OpenCodeServerRunInput["permission"] => {
  const resolvedAccessMode = normalizeProviderAccessMode(accessMode)
  if (resolvedAccessMode === "full-access") {
    return [{ permission: "*", pattern: "*", action: "allow" }]
  }

  const rules: NonNullable<OpenCodeServerRunInput["permission"]> = [
    { permission: "*", pattern: "*", action: "allow" },
    { permission: "external_directory", pattern: "*", action: "deny" }
  ]
  if (resolvedAccessMode === "read-only") {
    rules.push(
      { permission: "edit", pattern: "*", action: "deny" },
      { permission: "bash", pattern: "*", action: "deny" },
      { permission: "task", pattern: "*", action: "deny" }
    )
  }
  return rules
}

const withoutSuccessfulTerminalEvents = (events: ProviderRunEvent[]) =>
  events.filter((event) => event.status !== "completed")

const defaultReadFile = (path: string) => readFileSync(path, "utf8")

const defaultFetchUrl = async (url: string) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3000)

  try {
    await fetch(url, {
      method: "GET",
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

const isJsonConfigPath = (path: string) => /\.json$/i.test(path)

const detectInvalidConfig = (
  configPaths: string[],
  pathExists: (path: string) => boolean,
  readFile: (path: string) => string
) => {
  for (const configPath of configPaths) {
    if (!pathExists(configPath) || !isJsonConfigPath(configPath)) {
      continue
    }

    try {
      JSON.parse(readFile(configPath))
    } catch {
      return {
        kind: "config-invalid" as const,
        params: {
          detail: "malformed-json"
        }
      }
    }
  }

  return null
}

const objectHasConfiguredSecret = (value: unknown, depth = 0): boolean => {
  if (depth > 8 || value === null || typeof value !== "object") {
    return false
  }

  if (Array.isArray(value)) {
    return value.some((item) => objectHasConfiguredSecret(item, depth + 1))
  }

  return Object.entries(value as Record<string, unknown>).some(([key, entry]) => {
    if (isSensitivePayloadKey(key)) {
      return typeof entry === "string" ? entry.trim().length > 0 : Boolean(entry)
    }

    return objectHasConfiguredSecret(entry, depth + 1)
  })
}

const textHasConfiguredSecret = (value: string) =>
  /^\s*[\w.-]*(?:api[_-]?key|token|secret|password|credential|authorization)\s*=\s*["'][^"']+["']/im.test(value)

const hasConfigAuthSignal = (
  configPaths: string[],
  pathExists: (path: string) => boolean,
  readFile: (path: string) => string
) => {
  for (const configPath of configPaths) {
    if (!pathExists(configPath)) {
      continue
    }

    try {
      const configContent = readFile(configPath)
      if (isJsonConfigPath(configPath)) {
        const parsed = JSON.parse(configContent) as unknown
        if (objectHasConfiguredSecret(parsed)) {
          return true
        }
      } else if (textHasConfiguredSecret(configContent)) {
        return true
      }
    } catch {
      // Invalid config is reported separately by detectInvalidConfig.
    }
  }

  return false
}

const hasAuthSignal = (
  env: NodeJS.ProcessEnv,
  authEnvKeys: string[],
  authFilePaths: string[],
  pathExists: (path: string) => boolean,
  configPaths: string[] = [],
  readFile: (path: string) => string = defaultReadFile
) =>
  authEnvKeys.some((key) => {
    const value = env[key]
    return typeof value === "string" && value.trim().length > 0
  }) ||
  authFilePaths.some((path) => pathExists(path)) ||
  hasConfigAuthSignal(configPaths, pathExists, readFile)

const objectHasCustomEndpoint = (value: unknown, depth = 0): boolean => {
  if (depth > 8 || value === null || typeof value !== "object") {
    return false
  }

  if (Array.isArray(value)) {
    return value.some((item) => objectHasCustomEndpoint(item, depth + 1))
  }

  return Object.entries(value as Record<string, unknown>).some(([key, entry]) => {
    if (/(?:base[_-]?url|api[_-]?(?:base|url)|endpoint)/i.test(key)) {
      return typeof entry === "string" && /^https?:\/\//i.test(entry.trim())
    }

    return objectHasCustomEndpoint(entry, depth + 1)
  })
}

const textHasCustomEndpoint = (value: string) =>
  /^\s*(?:base[_-]?url|api[_-]?(?:base|url)|endpoint)\s*=\s*["']https?:\/\//im.test(value)

const hasConfigEndpointSignal = (
  configPaths: string[],
  pathExists: (path: string) => boolean,
  readFile: (path: string) => string
) => {
  for (const configPath of configPaths) {
    if (!pathExists(configPath)) {
      continue
    }

    try {
      const configContent = readFile(configPath)
      if (isJsonConfigPath(configPath)) {
        const parsed = JSON.parse(configContent) as unknown
        if (objectHasCustomEndpoint(parsed)) {
          return true
        }
      } else if (textHasCustomEndpoint(configContent)) {
        return true
      }
    } catch {
      // Invalid config is reported separately by detectInvalidConfig.
    }
  }

  return false
}

const containsNetworkFailure = (output: string) =>
  /(network|timed? out|timeout|offline|enotfound|econnrefused|ehostunreach|unreachable|fetch failed|aborterror)/i.test(output)

const getErrorText = (error: unknown): string => {
  if (error instanceof Error) {
    const causeText = "cause" in error ? getErrorText((error as Error & { cause?: unknown }).cause) : ""
    return [error.name, error.message, causeText].filter(Boolean).join(" ")
  }

  return typeof error === "string" ? error : String(error ?? "")
}

const isCommandNotFoundError = (error: unknown) => {
  const errorCode = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : ""
  return errorCode === "ENOENT" || /\bENOENT\b/.test(getErrorText(error))
}

const getVersionCheckFailureDetail = (result: CommandResult) => {
  const output = result.stderr.trim() || result.stdout.trim() || getErrorText(result.error).trim()
  if (output.length > 0) {
    return redactProviderString(output, 240).replace(/\s+/g, " ")
  }

  return result.status === null ? "process could not be started" : `exit status ${result.status}`
}

const containsAuthSuccess = (provider: ProviderKind, output: string) => {
  switch (provider) {
    case "codex":
      return /logged in using|^logged in\b/i.test(output) && !/not logged in/i.test(output)
    case "claude":
      return /"loggedIn"\s*:\s*true/i.test(output)
    case "opencode":
      return /(?:^|\n)\s*(anthropic|openai|github-copilot|google|groq|azure|amazon-bedrock|openrouter|ollama|xai|deepseek|mistral|cohere|together|fireworks|perplexity|vercel)\b/im.test(output) &&
        !containsAuthMissing(provider, output)
    case "cursor":
      return /\blogged in(?:\s+as)?\b/i.test(output) && !containsAuthMissing(provider, output)
  }
}

const containsAuthMissing = (provider: ProviderKind, output: string) => {
  switch (provider) {
    case "codex":
      return /not logged in|log in|login required/i.test(output)
    case "claude":
      return /"loggedIn"\s*:\s*false/i.test(output)
    case "opencode":
      return /\b0 credentials?\b|no credentials|not authenticated|unauthenticated|no authenticated|not logged in|please log ?in|missing credentials|no providers/i.test(output)
    case "cursor":
      return /not logged in|please log ?in|login required|authentication required/i.test(output)
  }
}

const probeProvider = async (
  provider: ProviderRuntimeDefinition,
  deps: Required<Pick<ProviderRuntimeServiceDeps, "env" | "homeDir" | "pathExists" | "readFile" | "runCommand" | "fetchUrl">>
): Promise<ProviderDetectionResult> => {
  if (provider.detect) {
    return provider.detect()
  }

  const versionCommand = await deps.runCommand(provider.command, ["--version"])
  if (versionCommand.error || versionCommand.status !== 0) {
    const binaryNotFound = isCommandNotFoundError(versionCommand.error)
    return {
      availability: "unavailable",
      issues: [
        binaryNotFound
          ? {
              kind: "binary-not-found",
              params: {
                command: provider.command
              }
            }
          : {
              kind: "version-check-failed",
              params: {
                command: provider.command,
                detail: getVersionCheckFailureDetail(versionCommand)
              }
            }
      ]
    }
  }

  const versionOutput = `${versionCommand.stdout}\n${versionCommand.stderr}`.trim()
  const parsedVersion = parseVersion(versionOutput)
  if (parsedVersion && compareVersions(parsedVersion, provider.minimumVersion) < 0) {
    return {
      availability: "unavailable",
      version: parsedVersion,
      issues: [
        {
          kind: "version-unsupported",
          params: {
            version: parsedVersion,
            minimum: provider.minimumVersion
          }
        }
      ]
    }
  }

  if (provider.capabilityProbe) {
    const capabilityCommand = await deps.runCommand(provider.command, provider.capabilityProbe.args)
    if (capabilityCommand.error || capabilityCommand.status !== 0) {
      return {
        availability: "unavailable",
        version: parsedVersion ?? undefined,
        issues: [{
          kind: "capability-missing",
          params: { capability: provider.capabilityProbe.name }
        }]
      }
    }
  }

  const configPaths = (provider.configFilePaths ?? []).map((path) => path.replace(/^~\//, `${deps.homeDir}/`))
  const invalidConfig = detectInvalidConfig(configPaths, deps.pathExists, deps.readFile)
  if (invalidConfig) {
    return {
      availability: "unavailable",
      version: parsedVersion ?? undefined,
      issues: [invalidConfig]
    }
  }

  const authStatusArgs = provider.authStatusArgs ?? []
  const authFilePaths = (provider.authFilePaths ?? []).map((path) => path.replace(/^~\//, `${deps.homeDir}/`))
  const hasConfiguredProviderAuth = hasConfigAuthSignal(configPaths, deps.pathExists, deps.readFile)
  const hasConfiguredProviderEndpoint = hasConfigEndpointSignal(configPaths, deps.pathExists, deps.readFile)
  const hasStaticAuthSignal = hasAuthSignal(
    deps.env,
    provider.authEnvKeys ?? [],
    authFilePaths,
    deps.pathExists,
    configPaths,
    deps.readFile
  )
  let hasAuthenticatedSignal = false
  let authProbeFailed = false

  if (authStatusArgs.length > 0) {
    const authStatusCommand = await deps.runCommand(provider.command, authStatusArgs)
    const authOutput = `${authStatusCommand.stdout}\n${authStatusCommand.stderr}`.trim()
    authProbeFailed = Boolean(authStatusCommand.error) || authStatusCommand.status !== 0

    if (!authProbeFailed && containsAuthSuccess(provider.kind, authOutput)) {
      hasAuthenticatedSignal = true
    }

    if (!hasAuthenticatedSignal && !hasConfiguredProviderAuth && containsAuthMissing(provider.kind, authOutput)) {
      return {
        availability: "unavailable",
        version: parsedVersion ?? undefined,
        issues: [
          {
            kind: "auth-missing"
          }
        ]
      }
    }

    if (containsNetworkFailure(authOutput) || containsNetworkFailure(getErrorText(authStatusCommand.error))) {
      return {
        availability: "unavailable",
        version: parsedVersion ?? undefined,
        issues: [
          {
            kind: "network-unreachable",
            params: {
              command: provider.command
            }
          }
        ]
      }
    }
  }

  const hasAuth = hasAuthenticatedSignal || (!authProbeFailed && hasStaticAuthSignal)
  if (!hasAuth) {
    return {
      availability: "unknown",
      version: parsedVersion ?? undefined,
      issues: []
    }
  }

  if (hasAuthenticatedSignal) {
    return {
      availability: "ready",
      version: parsedVersion ?? undefined,
      issues: []
    }
  }

  const networkProbeUrls = provider.networkProbeUrls ?? []
  if (networkProbeUrls.length > 0) {
    if (hasConfiguredProviderAuth || hasConfiguredProviderEndpoint) {
      return {
        availability: "ready",
        version: parsedVersion ?? undefined,
        issues: []
      }
    }

    let sawIndeterminateFailure = false

    for (const url of networkProbeUrls) {
      try {
        await deps.fetchUrl(url)
        return {
          availability: "ready",
          version: parsedVersion ?? undefined,
          issues: []
        }
      } catch (error) {
        const errorText = getErrorText(error)
        if (containsNetworkFailure(errorText)) {
          continue
        }

        sawIndeterminateFailure = true
      }
    }

    if (!sawIndeterminateFailure) {
      return {
        availability: "unavailable",
        version: parsedVersion ?? undefined,
        issues: [
          {
            kind: "network-unreachable",
            params: {
              command: provider.command
            }
          }
        ]
      }
    }

    return {
      availability: "unknown",
      version: parsedVersion ?? undefined,
      issues: []
    }
  }

  return {
    availability: "ready",
    version: parsedVersion ?? undefined,
    issues: []
  }
}

const defaultProviders = (homeDir: string): ProviderRuntimeDefinition[] => [
  {
    kind: "codex",
    command: "codex",
    minimumVersion: DEFAULT_MINIMUM_VERSION,
    authStatusArgs: ["login", "status"],
    networkProbeUrls: ["https://api.openai.com/"],
    authEnvKeys: ["OPENAI_API_KEY"],
    authFilePaths: [join(homeDir, ".codex", "auth.json")],
    configFilePaths: [join(homeDir, ".codex", "config.json"), join(homeDir, ".codex", "config.toml")]
  },
  {
    kind: "claude",
    command: "claude",
    minimumVersion: DEFAULT_MINIMUM_VERSION,
    authStatusArgs: ["auth", "status"],
    networkProbeUrls: ["https://api.anthropic.com/"],
    authEnvKeys: ["ANTHROPIC_API_KEY"],
    authFilePaths: [join(homeDir, ".claude.json"), join(homeDir, ".config", "claude", "auth.json")],
    configFilePaths: [join(homeDir, ".config", "claude", "config.json"), join(homeDir, ".claude", "config.json")]
  },
  {
    kind: "opencode",
    command: "opencode",
    minimumVersion: DEFAULT_MINIMUM_VERSION,
    authStatusArgs: ["auth", "list"],
    authEnvKeys: ["OPENCODE_API_KEY"],
    authFilePaths: [join(homeDir, ".local", "share", "opencode", "auth.json")],
    configFilePaths: [
      join(homeDir, ".config", "opencode", "config.json"),
      join(homeDir, ".config", "opencode", "opencode.json")
    ]
  },
  {
    kind: "cursor",
    command: "cursor-agent",
    minimumVersion: DEFAULT_MINIMUM_VERSION,
    authStatusArgs: ["status"],
    authEnvKeys: ["CURSOR_API_KEY", "CURSOR_AUTH_TOKEN"],
    authFilePaths: [join(homeDir, ".cursor", "cli-config.json")],
    configFilePaths: [join(homeDir, ".cursor", "cli-config.json")],
    capabilityProbe: {
      args: ["--sandbox", "enabled", "acp", "--help"],
      name: "ACP sandbox"
    }
  }
]

export type ProviderRuntimeService = ReturnType<typeof createProviderRuntimeService>

export const createProviderRuntimeService = (deps: ProviderRuntimeServiceDeps = {}) => {
  const now = deps.now ?? (() => new Date().toISOString())
  const env = deps.env ?? process.env
  const homeDir = deps.homeDir ?? homedir()
  const pathExists = deps.pathExists ?? existsSync
  const readFile = deps.readFile ?? defaultReadFile
  const defaultCommandRunner = deps.runCommand ? null : createDefaultCommandRunner(env, homeDir)
  const runCommand = deps.runCommand ?? defaultCommandRunner!.runCommand
  const runCodexAppServer = deps.runCodexAppServer ?? runCodexAppServerTurn
  const runOpenCodeServer = deps.runOpenCodeServer ?? runOpenCodeServerTurn
  const runCursorAcp = deps.runCursorAcp ?? runCursorAcpTurn
  const useLegacyCodexTestTransport = Boolean(deps.runCommand && !deps.runCodexAppServer)
  const useLegacyOpenCodeTestTransport = Boolean(deps.runCommand && !deps.runOpenCodeServer)
  const fetchUrl = deps.fetchUrl ?? defaultFetchUrl
  const providers = deps.providers ?? defaultProviders(homeDir)
  const customModelsService = deps.customModelsService
  const providerCommandByKind = new Map(providers.map((provider) => [provider.kind, provider.command] as const))
  const runtimeSupervisor = createProviderRuntimeSupervisor()

  const resolveProviderCommand = async (command: string) => {
    const resolution = defaultCommandRunner
      ? await defaultCommandRunner.resolveCommand(command)
      : {
          command,
          path: buildProviderPath(env.PATH, homeDir)
        }

    return {
      command: resolution.command,
      env: {
        ...process.env,
        ...env,
        HOME: homeDir,
        PATH: resolution.path
      }
    }
  }

  const providerCatalog = createProviderCatalogService({
    providers,
    now,
    modelCacheTtlMs: MODEL_DISCOVERY_TTL_MS,
    createUnknownReadiness,
    probe: async (provider) => {
      const detection = await probeProvider(provider, {
          env,
          homeDir,
          pathExists,
          readFile,
          runCommand,
          fetchUrl
      })

      return providerReadinessSchema.parse({
        kind: provider.kind,
        availability: detection.availability,
        badge: buildProviderBadge(provider.kind, detection.availability),
        version: detection.version,
        issues: detection.issues ?? []
      })
    },
    discoverModels: async (provider) => {
      if (provider.kind === "codex") {
        return discoverCodexModels(
          runCommand,
          provider.command,
          provider.configFilePaths ?? [],
          pathExists,
          readFile
        )
      }
      if (provider.kind === "opencode") {
        return discoverOpencodeModels(runCommand, provider.command)
      }
      if (provider.kind === "cursor") {
        return discoverCursorModels(runCommand, provider.command)
      }
      return discoverClaudeModels(env, provider.configFilePaths ?? [], pathExists, readFile)
    },
    fallbackModels: toFallbackModelOptions,
    customModels: (providerKind) => (customModelsService?.list(providerKind) ?? []).map((entry) =>
      providerModelOptionSchema.parse({
        id: entry.id,
        label: entry.label,
        detail: entry.detail || "用户自定义模型。",
        source: "user-custom",
        addedAt: entry.addedAt
      })
    )
  })

  const runProvider = async (input: ProviderRunInput): Promise<ProviderRunResult> => {
    const streamedEvents: ProviderRunEvent[] = []
    const emitProviderEvent = async (rawEvent: ProviderRunEvent) => {
      canonicalRunEventSchema.parse(rawEvent)
      const event = rawEvent
      if (!input.onEvent) {
        return
      }

      await input.onEvent(event)
      streamedEvents.push(event)
    }
    const finalizeProviderRun = async (result: ProviderRunResult): Promise<ProviderRunResult> => {
      if (!input.onEvent) {
        return result
      }

      let replayStart = 0
      while (
        replayStart < streamedEvents.length &&
        replayStart < result.events.length &&
        createProviderRunEventKey(streamedEvents[replayStart]) === createProviderRunEventKey(result.events[replayStart])
      ) {
        replayStart += 1
      }

      for (const event of result.events.slice(replayStart)) {
        await emitProviderEvent(event)
      }

      return {
        ...result,
        events: []
      }
    }

    if (input.provider !== "codex" && input.provider !== "claude" && input.provider !== "opencode" && input.provider !== "cursor") {
      return finalizeProviderRun({
        status: "unavailable",
        events: [
          {
            type: "run.status",
            status: "unavailable",
            payload: {
              provider: input.provider,
              conversationId: input.conversationId,
              runId: input.runId,
              worktreeId: input.worktreeId,
              worktreeRootPath: input.worktreeRootPath,
              reason: "provider-runtime-not-connected"
            }
          }
        ]
      })
    }

    const opencodeCliModel = input.provider === "opencode" ? resolveOpenCodeCliModel(input.model) : null
    const providerCommand = providerCommandByKind.get(input.provider) ?? input.provider
    const streamHandlers = input.onEvent ? createProviderStreamHandlers(input, emitProviderEvent) : null
    const registerChild = (child: ChildProcess, cancel?: () => Promise<void>) => {
      runtimeSupervisor.attachControl(input.runId, { child, cancel })
    }
    const withStreamHandlers = (options?: CommandOptions): CommandOptions =>
      ({ ...options, ...streamHandlers, onChild: registerChild })
    if (!runtimeSupervisor.reserve({ runId: input.runId, conversationId: input.conversationId })) {
      return finalizeProviderRun({
        status: "failed",
        events: [
          buildProviderDiagnosticEvent(
            input,
            "provider-runtime.already-running",
            `Conversation ${input.conversationId} already has a running provider process`,
            { conversationId: input.conversationId },
            {
              code: "conversation-run-already-running",
              subtype: "conversation-run-already-running"
            }
          )
        ]
      })
    }

    if (input.provider === "codex" && !useLegacyCodexTestTransport) {
      const normalizationState: CodexAppServerNormalizationState = {
        itemPhases: new Map()
      }
      const codexEvents: ProviderRunEvent[] = []
      try {
        const resolvedCommand = await resolveProviderCommand(providerCommand)
        const appServerResult = await runCodexAppServer({
          command: resolvedCommand.command,
          env: resolvedCommand.env,
          cwd: input.worktreeRootPath,
          model: input.model,
          prompt: input.prompt,
          attachments: input.attachments,
          sessionId: input.sessionId,
          options: input.options,
          sandboxPolicy: createCodexAppServerSandboxPolicy(input.accessMode, input.worktreeRootPath),
          onControl: ({ child, interrupt }) => registerChild(child, interrupt),
          onNotification: async (notification) => {
            const event = normalizeCodexAppServerNotification(notification, input, normalizationState)
            if (!event) {
              return
            }
            codexEvents.push(event)
            await emitProviderEvent(event)
          }
        })

        const expectedStatus: ConversationRunStatus = appServerResult.status === "completed"
          ? "completed"
          : appServerResult.status === "interrupted"
            ? "interrupted"
            : "failed"
        const terminalEvent = [...codexEvents].reverse().find((event) => event.status && isTerminalRunStatus(event.status))
        if (!terminalEvent) {
          const fallbackTerminalEvent: ProviderRunEvent = appServerResult.status === "completed"
            ? {
                type: "run.completed",
                status: "completed",
                payload: {
                  provider: input.provider,
                  conversationId: input.conversationId,
                  runId: input.runId,
                  worktreeId: input.worktreeId,
                  worktreeRootPath: input.worktreeRootPath,
                  rawType: "turn/completed",
                  transport: "app-server",
                  threadId: appServerResult.threadId,
                  turnId: appServerResult.turnId
                }
              }
            : {
                ...buildProviderDiagnosticEvent(
                  input,
                  "turn/completed",
                  appServerResult.status === "interrupted" ? "cancelled-by-user" : "codex-turn-failed",
                  {
                    transport: "app-server",
                    threadId: appServerResult.threadId,
                    turnId: appServerResult.turnId,
                    error: sanitizeProviderPayload(appServerResult.error)
                  },
                  {
                    code: appServerResult.status === "interrupted" ? "cancelled-by-user" : "turn-failed",
                    subtype: appServerResult.status
                  }
                ),
                ...(appServerResult.status === "interrupted"
                  ? { type: "run.interrupted", status: "interrupted" as const }
                  : {})
              }
          codexEvents.push(fallbackTerminalEvent)
          await emitProviderEvent(fallbackTerminalEvent)
        }

        return finalizeProviderRun({
          status: expectedStatus,
          events: codexEvents,
          sessionId: appServerResult.threadId
        })
      } catch (error) {
        const diagnostic = buildProviderDiagnosticEvent(
          input,
          "app-server.error",
          error instanceof Error ? error.message : String(error),
          {
            transport: "app-server",
            error: sanitizeProviderPayload(error instanceof Error ? { name: error.name, message: error.message } : error)
          },
          {
            code: "app-server-error",
            subtype: "app-server-error"
          }
        )
        codexEvents.push(diagnostic)
        await emitProviderEvent(diagnostic)
        return finalizeProviderRun({
          status: "failed",
          events: codexEvents,
          sessionId: input.sessionId
        })
      } finally {
        runtimeSupervisor.release(input.runId)
      }
    }

    if (input.provider === "cursor") {
      const normalizationState: CursorAcpNormalizationState = {
        assistantText: "",
        assistantMessageId: null,
        reasoningText: "",
        reasoningMessageId: null,
        toolTitles: new Map()
      }
      const cursorEvents: ProviderRunEvent[] = []
      try {
        const resolvedCommand = await resolveProviderCommand(providerCommand)
        const acpResult = await runCursorAcp({
          command: resolvedCommand.command,
          env: resolvedCommand.env,
          cwd: input.worktreeRootPath,
          prompt: input.prompt,
          attachments: input.attachments,
          model: input.model,
          sessionId: input.sessionId,
          accessMode: normalizeProviderAccessMode(input.accessMode),
          mode: input.options?.mode,
          onControl: ({ child, abort }) => registerChild(child, abort),
          onNotification: async (notification) => {
            const event = normalizeCursorAcpNotification(notification, input, normalizationState)
            if (!event) {
              return
            }
            cursorEvents.push(event)
            await emitProviderEvent(event)
          }
        })

        if (normalizationState.reasoningText.length > 0) {
          const reasoningEvent: ProviderRunEvent = {
            type: "run.reasoning.completed",
            payload: {
              provider: input.provider,
              conversationId: input.conversationId,
              runId: input.runId,
              worktreeId: input.worktreeId,
              worktreeRootPath: input.worktreeRootPath,
              rawType: "session/prompt",
              providerEventId: `session/prompt:reasoning:${acpResult.sessionId ?? input.runId}`,
              transport: "acp",
              sessionId: acpResult.sessionId,
              messageId: normalizationState.reasoningMessageId,
              text: normalizationState.reasoningText,
              visibility: "summary"
            }
          }
          cursorEvents.push(reasoningEvent)
          await emitProviderEvent(reasoningEvent)
        }

        if (normalizationState.assistantText.length > 0) {
          const messageEvent: ProviderRunEvent = {
            type: "run.message.completed",
            payload: {
              provider: input.provider,
              conversationId: input.conversationId,
              runId: input.runId,
              worktreeId: input.worktreeId,
              worktreeRootPath: input.worktreeRootPath,
              rawType: "session/prompt",
              providerEventId: `session/prompt:${acpResult.sessionId ?? input.runId}`,
              transport: "acp",
              sessionId: acpResult.sessionId,
              messageId: normalizationState.assistantMessageId,
              phase: "final",
              authoritative: acpResult.status === "completed",
              text: normalizationState.assistantText
            }
          }
          cursorEvents.push(messageEvent)
          await emitProviderEvent(messageEvent)
        }

        const terminalEvent: ProviderRunEvent = acpResult.status === "completed"
          ? {
              type: "run.completed",
              status: "completed",
              payload: {
                provider: input.provider,
                conversationId: input.conversationId,
                runId: input.runId,
                worktreeId: input.worktreeId,
                worktreeRootPath: input.worktreeRootPath,
                rawType: "session/prompt",
                transport: "acp",
                sessionId: acpResult.sessionId,
                stopReason: acpResult.stopReason
              }
            }
          : {
              ...buildProviderDiagnosticEvent(
                input,
                "session/prompt",
                acpResult.status === "interrupted" ? "cancelled-by-user" : "cursor-acp-session-failed",
                {
                  transport: "acp",
                  sessionId: acpResult.sessionId,
                  stopReason: acpResult.stopReason,
                  error: sanitizeProviderPayload(acpResult.error),
                  stderr: redactProviderString(acpResult.stderr)
                },
                {
                  code: acpResult.status === "interrupted" ? "cancelled-by-user" : "session-failed",
                  subtype: acpResult.status
                }
              ),
              ...(acpResult.status === "interrupted"
                ? { type: "run.interrupted", status: "interrupted" as const }
                : {})
            }
        cursorEvents.push(terminalEvent)
        await emitProviderEvent(terminalEvent)

        return finalizeProviderRun({
          status: acpResult.status === "completed"
            ? "completed"
            : acpResult.status === "interrupted"
              ? "interrupted"
              : "failed",
          events: cursorEvents,
          sessionId: acpResult.sessionId ?? input.sessionId
        })
      } catch (error) {
        const diagnostic = buildProviderDiagnosticEvent(
          input,
          "acp.error",
          error instanceof Error ? error.message : String(error),
          {
            transport: "acp",
            error: sanitizeProviderPayload(error instanceof Error ? { name: error.name, message: error.message } : error)
          },
          {
            code: "acp-error",
            subtype: "acp-error"
          }
        )
        cursorEvents.push(diagnostic)
        await emitProviderEvent(diagnostic)
        return finalizeProviderRun({
          status: "failed",
          events: cursorEvents,
          sessionId: input.sessionId
        })
      } finally {
        runtimeSupervisor.release(input.runId)
      }
    }

    if (input.provider === "opencode" && !useLegacyOpenCodeTestTransport) {
      const normalizationState: OpenCodeServerNormalizationState = {
        partKinds: new Map()
      }
      let openCodeEvents: ProviderRunEvent[] = []
      try {
        const resolvedCommand = await resolveProviderCommand(providerCommand)
        const serverResult = await runOpenCodeServer({
          command: resolvedCommand.command,
          env: resolvedCommand.env,
          cwd: input.worktreeRootPath,
          model: input.model,
          prompt: input.prompt,
          attachments: input.attachments,
          sessionId: input.sessionId,
          agent: input.options?.agent,
          permission: createOpenCodeServerPermissions(input.accessMode),
          onControl: ({ child, abort }) => registerChild(child, abort),
          onEvent: async (serverEvent) => {
            const event = normalizeOpenCodeServerEvent(serverEvent, input, normalizationState)
            if (!event) {
              return
            }
            openCodeEvents.push(event)
            if (!event.status || !isTerminalRunStatus(event.status)) {
              await emitProviderEvent(event)
            }
          }
        })

        if (serverResult.status !== "completed") {
          openCodeEvents = withoutSuccessfulTerminalEvents(openCodeEvents)
          let failureEvent = [...openCodeEvents].reverse().find(
            (event) => event.status === "failed" || event.status === "interrupted"
          )
          if (!failureEvent) {
            failureEvent = buildProviderDiagnosticEvent(
              input,
              "session.completed",
              serverResult.status === "interrupted" ? "cancelled-by-user" : "opencode-session-failed",
              {
                transport: "server-sse",
                sessionId: serverResult.sessionId,
                error: sanitizeProviderPayload(serverResult.error),
                stderr: redactProviderString(serverResult.stderr)
              },
              {
                code: serverResult.status === "interrupted" ? "cancelled-by-user" : "session-failed",
                subtype: serverResult.status
              }
            )
            if (serverResult.status === "interrupted") {
              failureEvent = {
                ...failureEvent,
                type: "run.interrupted",
                status: "interrupted"
              }
            }
            openCodeEvents.push(failureEvent)
          }
        } else if (!openCodeEvents.some((event) => event.status === "completed")) {
          const terminalEvent: ProviderRunEvent = {
            type: "run.completed",
            status: "completed",
            payload: {
              provider: input.provider,
              conversationId: input.conversationId,
              runId: input.runId,
              worktreeId: input.worktreeId,
              worktreeRootPath: input.worktreeRootPath,
              rawType: "session.idle",
              transport: "server-sse",
              sessionId: serverResult.sessionId
            }
          }
          openCodeEvents.push(terminalEvent)
          await emitProviderEvent(terminalEvent)
        }

        const promotedEvents = serverResult.status === "completed"
          ? promoteOpenCodeFinalMessage(openCodeEvents)
          : openCodeEvents
        if (input.onEvent) {
          const authoritativeFinal = [...promotedEvents].reverse().find(
            (event) => event.type === "run.message.completed" && event.payload.authoritative === true
          )
          if (authoritativeFinal) {
            await emitProviderEvent(authoritativeFinal)
          }
          const terminalEvent = [...promotedEvents].reverse().find(
            (event) => event.status && isTerminalRunStatus(event.status)
          )
          if (terminalEvent) {
            await emitProviderEvent(terminalEvent)
          }
          return {
            status: serverResult.status === "completed"
              ? "completed"
              : serverResult.status === "interrupted"
                ? "interrupted"
                : "failed",
            events: [],
            sessionId: serverResult.sessionId
          }
        }

        return {
          status: serverResult.status === "completed"
            ? "completed"
            : serverResult.status === "interrupted"
              ? "interrupted"
              : "failed",
          events: promotedEvents,
          sessionId: serverResult.sessionId
        }
      } catch (error) {
        const diagnostic = buildProviderDiagnosticEvent(
          input,
          "server.error",
          error instanceof Error ? error.message : String(error),
          {
            transport: "server-sse",
            error: sanitizeProviderPayload(error instanceof Error ? { name: error.name, message: error.message } : error)
          },
          {
            code: "server-error",
            subtype: "server-error"
          }
        )
        openCodeEvents.push(diagnostic)
        await emitProviderEvent(diagnostic)
        if (input.onEvent) {
          return {
            status: "failed",
            events: [],
            sessionId: input.sessionId
          }
        }
        return {
          status: "failed",
          events: openCodeEvents,
          sessionId: input.sessionId
        }
      } finally {
        runtimeSupervisor.release(input.runId)
      }
    }

    let result: CommandResult
    const referencedPrompt = buildPromptWithAttachmentReferences(input.prompt, input.attachments)
    const imageArgs = getImageAttachmentPaths(input.attachments)
      .flatMap((path) => ["--image", path])
    const attachmentDirectoryArgs = getAttachmentDirectories(input.attachments)
      .flatMap((path) => ["--add-dir", path])
    try {
      result = await (input.provider === "codex"
        ? input.sessionId
          ? runCommand(providerCommand, [
              "exec",
              "resume",
              ...createCodexAccessArgs(input.accessMode, true),
              ...imageArgs,
              input.sessionId,
              "--json",
              "--model",
              input.model,
              "-"
            ], withStreamHandlers({ cwd: input.worktreeRootPath, stdin: referencedPrompt }))
          : runCommand(providerCommand, [
              "exec",
              ...createCodexAccessArgs(input.accessMode, false),
              ...imageArgs,
              "--json",
              "--cd",
              input.worktreeRootPath,
              "--model",
              input.model,
              "-"
            ], withStreamHandlers({ stdin: referencedPrompt }))
        : input.provider === "claude"
          ? runCommand(providerCommand, [
              "--print",
              "--verbose",
              ...(input.options?.mode === "plan"
                ? ["--permission-mode", "plan"]
                : createClaudeAccessArgs(input.accessMode)),
              ...attachmentDirectoryArgs,
              "--output-format",
              "stream-json",
              "--include-partial-messages",
              ...(input.options?.reasoningEffort ? ["--effort", input.options.reasoningEffort] : []),
              ...(input.options?.maxBudgetUsd ? ["--max-budget-usd", String(input.options.maxBudgetUsd)] : []),
              ...(input.options?.agent ? ["--agent", input.options.agent] : []),
              ...createClaudeAllowedToolsArgs(input.allowedTools),
              ...(input.sessionId ? ["--resume", input.sessionId] : []),
              "--model",
              resolveClaudeCliModel(input.model),
              "--",
              referencedPrompt
            ], withStreamHandlers({ cwd: input.worktreeRootPath }))
          : runCommand(providerCommand, [
              "run",
              "--format",
              "json",
              "--thinking",
              "--dir",
              input.worktreeRootPath,
              ...(opencodeCliModel ? ["--model", opencodeCliModel] : []),
              ...(input.options?.agent ? ["--agent", input.options.agent] : []),
              ...createOpenCodeAccessArgs(input.accessMode),
              ...(input.sessionId ? ["--session", input.sessionId] : []),
              "--",
              referencedPrompt
            ], withStreamHandlers({ cwd: input.worktreeRootPath })))
    } finally {
      runtimeSupervisor.release(input.runId)
    }
    const parsedEvents = normalizeProviderJsonl(input.provider, result.stdout, result.stderr, input)
    const commandLabel = input.provider === "codex"
      ? "codex exec"
      : input.provider === "claude"
        ? "claude --print"
        : "opencode run"

    const extractSessionId = (eventList: ProviderRunEvent[]): string | undefined => {
      const payload = eventList.find((e) => e.type === "run.started")?.payload
      return (payload?.sessionId ?? payload?.threadId) as string | undefined
    }

    if (result.error || result.status !== 0) {
      const raw = buildCommandResultRawPayload(result)
      const authFailure = input.provider === "claude"
        ? containsClaudeAuthFailure(`${result.stdout}\n${result.stderr}`)
        : input.provider === "opencode" && containsOpenCodeAuthFailure(`${result.stdout}\n${result.stderr}`)
      const failureCode = authFailure ? "auth-missing" : "process-exit"
      const failureSubtype = authFailure ? "auth-missing" : "non-zero-exit"

      return finalizeProviderRun({
        status: "failed",
        events: [
          ...withoutSuccessfulTerminalEvents(parsedEvents),
          buildProviderDiagnosticEvent(
            input,
            result.error ? "process.error" : "process.exit",
            result.error?.message ?? `${commandLabel} exited with status ${result.status ?? "unknown"}`,
            raw,
            {
              status: result.status,
              ...(result.stderr.trim().length > 0 ? { stderr: result.stderr } : {}),
              code: result.error ? "process-error" : failureCode,
              subtype: result.error ? "process-error" : failureSubtype
            }
          )
        ],
        sessionId: extractSessionId(parsedEvents)
      })
    }

    const events = input.provider === "claude"
      ? promoteClaudeResultTextFallback(parsedEvents)
      : input.provider === "opencode"
        ? promoteOpenCodeFinalMessage(parsedEvents)
        : parsedEvents

    if (events.length === 0) {
      return finalizeProviderRun({
        status: "failed",
        events: [
          buildProviderDiagnosticEvent(
            input,
            "jsonl.empty",
            `${commandLabel} produced no JSONL events`,
            buildCommandResultRawPayload(result),
            {
              status: result.status,
              code: "jsonl-empty",
              subtype: "jsonl-empty"
            }
          )
        ]
      })
    }

    const terminalEvent = [...events]
      .reverse()
      .find((event) => event.status && isTerminalRunStatus(event.status))
    const status = terminalEvent?.status ? conversationRunStatusSchema.parse(terminalEvent.status) : null

    if (!status) {
      return finalizeProviderRun({
        status: "failed",
        events: [
          ...events,
          buildProviderDiagnosticEvent(
            input,
            "terminal.missing",
            `${commandLabel} exited without a terminal JSONL event`,
            buildCommandResultRawPayload(result),
            {
              status: result.status,
              code: "terminal-missing",
              subtype: "terminal-missing"
            }
          )
        ]
      })
    }

    const sessionId = extractSessionId(events)

    return finalizeProviderRun({
      status,
      events,
      sessionId
    })
  }

  const cancelRun = (runOrConversationId: string): boolean => runtimeSupervisor.cancel(runOrConversationId)

  const refreshSnapshot = async () => {
    defaultCommandRunner?.invalidateResolutionCache()
    return providerCatalog.refreshSnapshot()
  }

  return {
    getSnapshot: providerCatalog.getSnapshot,
    refreshSnapshot,
    listProviderModels: providerCatalog.listProviderModels,
    invalidateModelDiscoveryCache: providerCatalog.invalidateModelDiscoveryCache,
    runProvider,
    cancelRun,
    stopAll: runtimeSupervisor.stopAll,
    listActiveRuns: runtimeSupervisor.listActive
  }
}
