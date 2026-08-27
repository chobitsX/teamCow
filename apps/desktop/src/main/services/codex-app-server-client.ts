import { spawn, type ChildProcess } from "node:child_process"
import { createInterface } from "node:readline"
import { z } from "zod"
import type { ProviderRunOptions } from "@shared/index"
import { buildCodexUserInput, type ProviderInputAttachment } from "./provider-input"

type MaybePromise<T> = T | Promise<T>

const jsonRpcEnvelopeSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number().optional(),
    message: z.string(),
    data: z.unknown().optional()
  }).passthrough().optional()
}).passthrough()

const threadResponseSchema = z.object({
  thread: z.object({
    id: z.string().min(1)
  }).passthrough()
}).passthrough()

const turnStartResponseSchema = z.object({
  turn: z.object({
    id: z.string().min(1),
    status: z.string()
  }).passthrough()
}).passthrough()

const turnCompletedParamsSchema = z.object({
  threadId: z.string().min(1),
  turn: z.object({
    id: z.string().min(1),
    status: z.enum(["completed", "interrupted", "failed"]),
    error: z.unknown().optional()
  }).passthrough()
}).passthrough()

export type CodexAppServerNotification = {
  method: string
  params: Record<string, unknown>
}

export type CodexAppServerSandboxPolicy =
  | { type: "readOnly"; networkAccess: boolean }
  | { type: "workspaceWrite"; writableRoots: string[]; networkAccess: boolean }
  | { type: "dangerFullAccess" }

export type CodexAppServerControl = {
  child: ChildProcess
  interrupt: () => Promise<void>
}

export type CodexAppServerRunInput = {
  command: string
  env?: NodeJS.ProcessEnv
  appServerArgs?: string[]
  cwd: string
  model: string
  prompt: string
  attachments?: ProviderInputAttachment[]
  sessionId?: string
  options?: ProviderRunOptions
  sandboxPolicy: CodexAppServerSandboxPolicy
  onNotification?: (notification: CodexAppServerNotification) => MaybePromise<void>
  onControl?: (control: CodexAppServerControl) => void
}

export type CodexAppServerRunResult = {
  threadId: string
  turnId: string
  status: "completed" | "interrupted" | "failed"
  error?: unknown
  stderr: string
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

const REQUEST_TIMEOUT_MS = 30_000
const MAX_STDERR_LENGTH = 32_768

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

const createRpcError = (method: string, error: { code?: number; message: string; data?: unknown }) => {
  const suffix = error.code === undefined ? "" : ` (${error.code})`
  const rpcError = new Error(`Codex App Server ${method} failed${suffix}: ${error.message}`)
  Object.assign(rpcError, { cause: error.data })
  return rpcError
}

export const runCodexAppServerTurn = async (input: CodexAppServerRunInput): Promise<CodexAppServerRunResult> => {
  const child = spawn(input.command, input.appServerArgs ?? ["app-server"], {
    cwd: input.cwd,
    env: input.env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"]
  })
  const lineReader = createInterface({ input: child.stdout })
  const pendingRequests = new Map<string | number, PendingRequest>()
  let nextRequestId = 1
  let stderr = ""
  let threadId: string | undefined
  let turnId: string | undefined
  let cancelRequested = false
  let settled = false
  let notificationQueue = Promise.resolve()
  let resolveCompleted: ((value: CodexAppServerRunResult) => void) | undefined
  let rejectCompleted: ((error: Error) => void) | undefined

  const completed = new Promise<CodexAppServerRunResult>((resolve, reject) => {
    resolveCompleted = resolve
    rejectCompleted = reject
  })

  const send = (message: Record<string, unknown>) => {
    if (!child.stdin.writable) {
      throw new Error("Codex App Server stdin is not writable")
    }
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  const request = (method: string, params: Record<string, unknown>) => {
    const id = nextRequestId
    nextRequestId += 1

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id)
        reject(new Error(`Codex App Server ${method} timed out`))
      }, REQUEST_TIMEOUT_MS)
      pendingRequests.set(id, { resolve, reject, timeout })
      send({ id, method, params })
    })
  }

  const interrupt = async () => {
    cancelRequested = true
    if (!threadId || !turnId || settled) {
      return
    }
    await request("turn/interrupt", { threadId, turnId })
  }

  input.onControl?.({ child, interrupt })

  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-MAX_STDERR_LENGTH)
  })

  const settleWithError = (error: Error) => {
    if (settled) {
      return
    }
    settled = true
    rejectCompleted?.(error)
  }
  const handleNotificationError = (error: unknown) => {
    settleWithError(error instanceof Error ? error : new Error(String(error)))
  }

  child.on("error", settleWithError)
  child.on("exit", (code, signal) => {
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(`Codex App Server exited before response ${String(id)} (${code ?? signal ?? "unknown"})`))
    }
    pendingRequests.clear()

    if (!settled) {
      settleWithError(new Error(`Codex App Server exited before turn completion (${code ?? signal ?? "unknown"})${stderr.trim() ? `: ${stderr.trim()}` : ""}`))
    }
  })

  lineReader.on("line", (line) => {
    let rawMessage: unknown
    try {
      rawMessage = JSON.parse(line)
    } catch {
      notificationQueue = notificationQueue.then(() => input.onNotification?.({
        method: "app-server/raw",
        params: { line, parseError: "invalid-json" }
      })).catch(handleNotificationError)
      return
    }

    const parsed = jsonRpcEnvelopeSchema.safeParse(rawMessage)
    if (!parsed.success) {
      notificationQueue = notificationQueue.then(() => input.onNotification?.({
        method: "app-server/raw",
        params: { raw: rawMessage, parseError: "invalid-envelope" }
      })).catch(handleNotificationError)
      return
    }

    const message = parsed.data
    if (message.id !== undefined && !message.method) {
      const pending = pendingRequests.get(message.id)
      if (!pending) {
        return
      }
      pendingRequests.delete(message.id)
      clearTimeout(pending.timeout)
      if (message.error) {
        pending.reject(createRpcError("request", message.error))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (!message.method) {
      return
    }

    const params = toRecord(message.params)
    notificationQueue = notificationQueue.then(() => input.onNotification?.({
      method: message.method as string,
      params
    })).catch(handleNotificationError)

    if (message.method === "turn/completed") {
      const terminal = turnCompletedParamsSchema.safeParse(params)
      if (!terminal.success || terminal.data.threadId !== threadId || terminal.data.turn.id !== turnId) {
        return
      }

      notificationQueue.then(() => {
        if (settled) {
          return
        }
        settled = true
        resolveCompleted?.({
          threadId: terminal.data.threadId,
          turnId: terminal.data.turn.id,
          status: terminal.data.turn.status,
          error: terminal.data.turn.error,
          stderr
        })
      }).catch(settleWithError)
    }
  })

  try {
    await request("initialize", {
      clientInfo: {
        name: "teamcow",
        title: "TeamCow",
        version: "0.0.2"
      },
      capabilities: {
        experimentalApi: true
      }
    })
    send({ method: "initialized", params: {} })

    const threadResult = input.sessionId
      ? await request("thread/resume", {
          threadId: input.sessionId,
          cwd: input.cwd,
          model: input.model,
          approvalPolicy: "never",
          sandbox: input.sandboxPolicy.type === "workspaceWrite" ? "workspace-write" : input.sandboxPolicy.type === "readOnly" ? "read-only" : "danger-full-access"
        })
      : await request("thread/start", {
          cwd: input.cwd,
          model: input.model,
          approvalPolicy: "never",
          sandbox: input.sandboxPolicy.type === "workspaceWrite" ? "workspace-write" : input.sandboxPolicy.type === "readOnly" ? "read-only" : "danger-full-access"
        })
    threadId = threadResponseSchema.parse(threadResult).thread.id

    const turnResult = await request("turn/start", {
      threadId,
      input: buildCodexUserInput(input.prompt, input.attachments),
      cwd: input.cwd,
      model: input.model,
      ...(input.options?.reasoningEffort ? { effort: input.options.reasoningEffort } : {}),
      ...(input.options?.mode === "plan"
        ? {
            collaborationMode: {
              mode: "plan",
              settings: {
                model: input.model,
                reasoning_effort: input.options.reasoningEffort ?? null,
                developer_instructions: null
              }
            }
          }
        : {}),
      summary: "concise",
      approvalPolicy: "never",
      sandboxPolicy: input.sandboxPolicy
    })
    turnId = turnStartResponseSchema.parse(turnResult).turn.id

    if (cancelRequested) {
      await interrupt()
    }

    return await completed
  } catch (error) {
    settleWithError(error instanceof Error ? error : new Error(String(error)))
    return await completed
  } finally {
    lineReader.close()
    if (child.stdin.writable) {
      child.stdin.end()
    }
    if (!child.killed) {
      child.kill("SIGTERM")
    }
  }
}
