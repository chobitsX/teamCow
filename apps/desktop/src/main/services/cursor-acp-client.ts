import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { homedir, tmpdir } from "node:os"
import { Readable, Writable } from "node:stream"
import * as acp from "@agentclientprotocol/sdk"
import { z } from "zod"
import type { ProviderAccessMode, ProviderRunMode } from "@shared/index"
import { buildCursorPromptBlocks, type ProviderInputAttachment } from "./provider-input"

type MaybePromise<T> = T | Promise<T>

export type CursorAcpNotification = {
  method: string
  params: Record<string, unknown>
}

export type CursorAcpControl = {
  child: ChildProcess
  abort: () => Promise<void>
}

export type CursorAcpRunInput = {
  command: string
  env?: NodeJS.ProcessEnv
  cwd: string
  prompt: string
  attachments?: ProviderInputAttachment[]
  model?: string
  sessionId?: string
  accessMode: ProviderAccessMode
  mode?: ProviderRunMode
  onNotification?: (notification: CursorAcpNotification) => MaybePromise<void>
  onControl?: (control: CursorAcpControl) => void
}

export type CursorAcpRunResult = {
  sessionId?: string
  status: "completed" | "failed" | "interrupted"
  stopReason?: acp.StopReason
  error?: unknown
  stderr: string
}

type SessionSetup = Pick<acp.NewSessionResponse, "modes" | "configOptions">

const MAX_STDERR_LENGTH = 32_768
const extensionParamsSchema = z.record(z.string(), z.unknown())

const seatbeltQuote = (value: string) => {
  const escapedValue = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
  return `"${escapedValue}"`
}

const createCursorSeatbeltProfile = (cwd: string, accessMode: ProviderAccessMode) => {
  const cursorHome = resolveCanonicalPath(resolve(homedir(), ".cursor"))
  const cursorCompileCache = resolveCanonicalPath(resolve(homedir(), "Library", "Caches", "cursor-compile-cache"))
  const cursorLogDirectory = resolveCanonicalPath(join(tmpdir(), `cursor-agent-logs-${process.getuid?.() ?? 0}`))
  const writableSubpaths = [cursorHome, cursorCompileCache, cursorLogDirectory]
  if (accessMode === "worktree-write") {
    writableSubpaths.push(resolveCanonicalPath(cwd))
  }
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    ...writableSubpaths.map((path) => `(allow file-write* (subpath ${seatbeltQuote(path)}))`),
    '(allow file-write* (literal "/dev/null"))',
    '(allow file-write* (literal "/dev/tty"))'
  ].join("\n")
}

export const createCursorAcpSpawnSpec = (
  command: string,
  cwd: string,
  accessMode: ProviderAccessMode,
  platform = process.platform,
  seatbeltAvailable = existsSync("/usr/bin/sandbox-exec"),
  model?: string
) => {
  const sandboxMode = accessMode === "full-access" ? "disabled" : "enabled"
  const cursorArgs = [
    "--sandbox",
    sandboxMode,
    ...(model && model !== "auto" ? ["--model", model] : []),
    "acp"
  ]
  if (platform === "darwin" && accessMode !== "full-access" && seatbeltAvailable) {
    return {
      command: "/usr/bin/sandbox-exec",
      args: ["-p", createCursorSeatbeltProfile(cwd, accessMode), command, ...cursorArgs]
    }
  }
  return { command, args: cursorArgs }
}

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { value }

const resolveCanonicalPath = (path: string) => {
  let existingAncestor = resolve(path)
  const missingSegments: string[] = []
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor)
    if (parent === existingAncestor) {
      break
    }
    missingSegments.unshift(basename(existingAncestor))
    existingAncestor = parent
  }
  const canonicalAncestor = existsSync(existingAncestor) ? realpathSync(existingAncestor) : existingAncestor
  return resolve(canonicalAncestor, ...missingSegments)
}

const isPathInside = (rootPath: string, candidatePath: string) => {
  const normalizedRoot = resolveCanonicalPath(rootPath)
  const normalizedCandidate = resolveCanonicalPath(isAbsolute(candidatePath)
    ? resolve(candidatePath)
    : resolve(normalizedRoot, candidatePath))
  const relativePath = relative(normalizedRoot, normalizedCandidate)
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
}

const collectPathFields = (value: unknown, paths: string[], depth = 0): void => {
  if (depth > 8 || value === null || typeof value !== "object") {
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectPathFields(entry, paths, depth + 1))
    return
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string" && /(?:path|file|directory|cwd)/i.test(key)) {
      paths.push(entry)
    } else {
      collectPathFields(entry, paths, depth + 1)
    }
  }
}

const containsExplicitOutsidePath = (value: unknown, rootPath: string) => {
  const structuredPaths: string[] = []
  collectPathFields(value, structuredPaths)
  if (structuredPaths.some((path) => !isPathInside(rootPath, path))) {
    return true
  }

  const text = typeof value === "string" ? value : JSON.stringify(value ?? "")
  if (/(?:^|[\s"'])~(?:\/|$)|\$(?:\{)?HOME(?:\})?/i.test(text) || /(?:^|[\s"'])\.\.\//.test(text)) {
    return true
  }
  const absolutePaths = [...text.matchAll(/(?:^|[\s"'=([{])((?:\/[\w.@%+,:=-]+)+\/?)/g)]
    .map((match) => match[1])
  return absolutePaths.some((path) => !isPathInside(rootPath, path))
}

const selectPermissionOption = (
  input: CursorAcpRunInput,
  request: acp.RequestPermissionRequest
): acp.PermissionOption | undefined => {
  const allowOnce = request.options.find((option) => option.kind === "allow_once")
  const rejectOnce = request.options.find((option) => option.kind === "reject_once")
    ?? request.options.find((option) => option.kind === "reject_always")

  if (input.accessMode === "full-access") {
    return allowOnce
  }
  if (input.accessMode === "read-only") {
    return rejectOnce
  }

  const toolCall = request.toolCall
  const locations = toolCall.locations ?? []
  const outsideLocation = locations.some((location) => !isPathInside(input.cwd, location.path))
  const mutatingKind = toolCall.kind === "edit" || toolCall.kind === "delete" || toolCall.kind === "move"
  const unsafeInput = containsExplicitOutsidePath(toolCall.rawInput, input.cwd)
  const missingMutationTarget = mutatingKind && locations.length === 0 && toolCall.rawInput == null

  return outsideLocation || unsafeInput || missingMutationTarget ? rejectOnce : allowOnce
}

const flattenSelectOptions = (option: acp.SessionConfigOption): acp.SessionConfigSelectOption[] => {
  if (option.type !== "select") {
    return []
  }
  return option.options.flatMap((entry) => "value" in entry ? [entry] : entry.options)
}

export const resolveCursorAcpModelValue = (
  model: string | undefined,
  configOptions: SessionSetup["configOptions"]
) => {
  if (!model) {
    return null
  }
  const modelConfig = configOptions?.find((option) => option.category === "model" || option.id === "model")
  if (!modelConfig || modelConfig.type !== "select") {
    return null
  }
  const options = flattenSelectOptions(modelConfig)
  if (model === "auto") {
    return options.find((option) => option.value === "default[]" || option.value === "default")?.value
      ?? modelConfig.currentValue
  }
  const normalizedModel = model.toLowerCase()
  return options.find((option) =>
    option.value === model
    || option.name.toLowerCase() === normalizedModel
    || option.value.slice(0, option.value.indexOf("[") === -1 ? undefined : option.value.indexOf("[")).toLowerCase() === normalizedModel
  )?.value ?? null
}

export const runCursorAcpTurn = async (input: CursorAcpRunInput): Promise<CursorAcpRunResult> => {
  const spawnSpec = createCursorAcpSpawnSpec(
    input.command,
    input.cwd,
    input.accessMode,
    process.platform,
    existsSync("/usr/bin/sandbox-exec"),
    // Pin new sessions at process startup. Existing sessions must load first; Cursor can reset
    // the ACP connection when a root --model flag is combined with session/load.
    input.sessionId ? undefined : input.model
  )
  const child = spawn(spawnSpec.command, spawnSpec.args, {
    cwd: input.cwd,
    env: { ...(input.env ?? process.env) },
    stdio: ["pipe", "pipe", "pipe"]
  })
  let stderr = ""
  let spawnError: Error | undefined
  let activeSessionId = input.sessionId
  let activeContext: acp.ClientContext | null = null
  let interrupted = false
  let replayingLoadedSession = Boolean(input.sessionId)
  let sessionReady = false
  const pendingSessionNotifications: acp.SessionNotification[] = []
  let notificationQueue = Promise.resolve()

  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-MAX_STDERR_LENGTH)
  })
  child.on("error", (error) => {
    spawnError = error
  })

  const emitNotification = (method: string, params: unknown) => {
    const notification: CursorAcpNotification = { method, params: toRecord(params) }
    notificationQueue = notificationQueue.then(() => input.onNotification?.(notification))
  }

  const abort = async () => {
    interrupted = true
    if (activeContext && activeSessionId) {
      await activeContext.notify(acp.methods.agent.session.cancel, { sessionId: activeSessionId })
    }
  }
  input.onControl?.({ child, abort })

  const app = acp.client({ name: "TeamCow" })
    .onNotification(acp.methods.client.session.update, ({ params }) => {
      if (replayingLoadedSession || (activeSessionId && params.sessionId !== activeSessionId)) {
        return
      }
      if (!sessionReady) {
        pendingSessionNotifications.push(params)
      } else {
        emitNotification(acp.methods.client.session.update, params)
      }
    })
    .onRequest(acp.methods.client.session.requestPermission, async ({ params }) => {
      emitNotification(acp.methods.client.session.requestPermission, params)
      const option = selectPermissionOption(input, params)
      const outcome: acp.RequestPermissionResponse["outcome"] = option
        ? { outcome: "selected", optionId: option.optionId }
        : { outcome: "cancelled" }
      emitNotification("teamcow/permission_resolved", {
        sessionId: params.sessionId,
        toolCallId: params.toolCall.toolCallId,
        accessMode: input.accessMode,
        selectedOptionId: option?.optionId,
        selectedOptionKind: option?.kind,
        outcome
      })
      await notificationQueue
      return { outcome }
    })
    .onRequest("cursor/ask_question", extensionParamsSchema, async ({ params }) => {
      emitNotification("cursor/ask_question", params)
      await notificationQueue
      return {
        outcome: {
          outcome: "skipped",
          reason: "TeamCow does not yet support answering live Cursor questions during a run."
        }
      }
    })
    .onRequest("cursor/create_plan", extensionParamsSchema, async ({ params }) => {
      emitNotification("cursor/create_plan", params)
      await notificationQueue
      return input.accessMode === "read-only"
        ? { outcome: { outcome: "rejected", reason: "The conversation is in read-only mode." } }
        : { outcome: { outcome: "accepted" } }
    })

  for (const method of ["cursor/update_todos", "cursor/task", "cursor/generate_image"] as const) {
    app.onNotification(method, extensionParamsSchema, ({ params }) => {
      emitNotification(method, params)
    })
  }

  try {
    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>
    )
    const result = await app.connectWith(stream, async (context) => {
      activeContext = context
      const initialized = await context.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
          plan: {}
        },
        clientInfo: { name: "TeamCow", version: "0.1.0" }
      })

      if (initialized.authMethods?.some((method) => method.id === "cursor_login")) {
        await context.request(acp.methods.agent.authenticate, { methodId: "cursor_login" })
      }

      let setup: SessionSetup
      if (activeSessionId) {
        if (!initialized.agentCapabilities?.loadSession) {
          throw new Error("Cursor ACP does not support loading an existing session")
        }
        setup = await context.request(acp.methods.agent.session.load, {
          cwd: input.cwd,
          mcpServers: [],
          sessionId: activeSessionId
        }) ?? {}
        replayingLoadedSession = false
      } else {
        const created = await context.request(acp.methods.agent.session.new, {
          cwd: input.cwd,
          mcpServers: []
        })
        activeSessionId = created.sessionId
        setup = created
      }

      if (!activeSessionId) {
        throw new Error("Cursor ACP did not return a session ID")
      }

      const desiredMode = input.mode ?? (input.accessMode === "read-only" ? "ask" : "agent")
      const supportsDesiredMode = setup.modes?.availableModes.some((mode) => mode.id === desiredMode) ?? false
      if (input.mode && !supportsDesiredMode) {
        throw new Error(`Cursor ACP does not support the requested ${input.mode} mode`)
      }
      if (supportsDesiredMode && setup.modes?.currentModeId !== desiredMode) {
        await context.request(acp.methods.agent.session.setMode, {
          sessionId: activeSessionId,
          modeId: desiredMode
        })
      }

      const modelValue = resolveCursorAcpModelValue(input.model, setup.configOptions)
      const modelConfig = setup.configOptions?.find((option) => option.category === "model" || option.id === "model")
      if (modelValue && modelConfig?.type === "select" && modelConfig.currentValue !== modelValue) {
        await context.request(acp.methods.agent.session.setConfigOption, {
          sessionId: activeSessionId,
          configId: modelConfig.id,
          value: modelValue
        })
      }

      emitNotification("teamcow/session_ready", {
        sessionId: activeSessionId,
        resumed: Boolean(input.sessionId),
        mode: desiredMode,
        model: input.model,
        modelValue
      })
      sessionReady = true
      for (const notification of pendingSessionNotifications) {
        if (notification.sessionId === activeSessionId) {
          emitNotification(acp.methods.client.session.update, notification)
        }
      }
      pendingSessionNotifications.length = 0
      await notificationQueue

      if (interrupted) {
        await context.notify(acp.methods.agent.session.cancel, { sessionId: activeSessionId })
        return { stopReason: "cancelled" as const }
      }

      return context.request(acp.methods.agent.session.prompt, {
        sessionId: activeSessionId,
        prompt: buildCursorPromptBlocks(
          input.prompt,
          input.attachments,
          initialized.agentCapabilities?.promptCapabilities?.image
        ) as acp.ContentBlock[]
      })
    })
    await notificationQueue
    return {
      sessionId: activeSessionId,
      status: interrupted || result.stopReason === "cancelled" ? "interrupted" : "completed",
      stopReason: result.stopReason,
      stderr
    }
  } catch (error) {
    await notificationQueue.catch(() => undefined)
    return {
      sessionId: activeSessionId ?? input.sessionId,
      status: interrupted ? "interrupted" : "failed",
      error: spawnError ?? error,
      stderr
    }
  } finally {
    activeContext = null
    if (!child.stdin.destroyed) {
      child.stdin.end()
    }
    if (!child.killed) {
      child.kill("SIGTERM")
    }
  }
}
