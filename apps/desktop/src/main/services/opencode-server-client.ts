import { spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
import { z } from "zod"
import { buildOpenCodePromptParts, type ProviderInputAttachment } from "./provider-input"

type MaybePromise<T> = T | Promise<T>

const opencodeSessionSchema = z.object({
  id: z.string().min(1)
}).passthrough()

const opencodeEventSchema = z.object({
  type: z.string().min(1),
  properties: z.record(z.string(), z.unknown()).optional()
}).passthrough()

export type OpenCodeServerEvent = z.infer<typeof opencodeEventSchema>

export type OpenCodeServerControl = {
  child: ChildProcess
  abort: () => Promise<void>
}

export type OpenCodeServerRunInput = {
  command: string
  env?: NodeJS.ProcessEnv
  cwd: string
  prompt: string
  model?: string
  sessionId?: string
  agent?: string
  attachments?: ProviderInputAttachment[]
  permission?: Array<{ permission: string; pattern: string; action: "allow" | "ask" | "deny" }>
  onEvent?: (event: OpenCodeServerEvent) => MaybePromise<void>
  onControl?: (control: OpenCodeServerControl) => void
}

export type OpenCodeServerRunResult = {
  sessionId: string
  status: "completed" | "failed" | "interrupted"
  error?: unknown
  stderr: string
}

const SERVER_START_TIMEOUT_MS = 10_000
const MAX_STDERR_LENGTH = 32_768

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const reservePort = () => new Promise<number>((resolve, reject) => {
  const server = createServer()
  server.unref()
  server.once("error", reject)
  server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    const port = typeof address === "object" && address ? address.port : null
    server.close((error) => {
      if (error) {
        reject(error)
      } else if (port === null) {
        reject(new Error("OpenCode server did not allocate a port"))
      } else {
        resolve(port)
      }
    })
  })
})

const parseOpenCodeModel = (model: string | undefined) => {
  if (!model || model === "open-code-default") {
    return undefined
  }
  const separator = model.indexOf("/")
  if (separator <= 0 || separator === model.length - 1) {
    return undefined
  }
  return {
    providerID: model.slice(0, separator),
    modelID: model.slice(separator + 1)
  }
}

const fetchJson = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenCode server ${init?.method ?? "GET"} ${url} failed (${response.status}): ${body}`)
  }
  if (response.status === 204) {
    return null
  }
  return response.json() as Promise<unknown>
}

const waitUntilHealthy = async (baseUrl: string, child: ChildProcess) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("OpenCode server exited during startup")
    }
    try {
      await fetchJson(`${baseUrl}/global/health`)
      return
    } catch {
      await delay(100)
    }
  }
  throw new Error("OpenCode server startup timed out")
}

export const runOpenCodeServerTurn = async (input: OpenCodeServerRunInput): Promise<OpenCodeServerRunResult> => {
  const port = await reservePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const directory = encodeURIComponent(input.cwd)
  const childEnv = { ...(input.env ?? process.env) }
  delete childEnv.OPENCODE_SERVER_PASSWORD
  delete childEnv.OPENCODE_SERVER_USERNAME
  const child = spawn(input.command, ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: input.cwd,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stderr = ""
  let sessionId = input.sessionId
  let promptAccepted = false
  let interrupted = false
  let settled = false
  let resolveCompleted: ((value: OpenCodeServerRunResult) => void) | undefined
  let rejectCompleted: ((error: Error) => void) | undefined
  let eventQueue = Promise.resolve()
  const eventController = new AbortController()

  const completed = new Promise<OpenCodeServerRunResult>((resolve, reject) => {
    resolveCompleted = resolve
    rejectCompleted = reject
  })

  const settle = (result: OpenCodeServerRunResult) => {
    if (settled) {
      return
    }
    settled = true
    resolveCompleted?.(result)
  }

  const fail = (error: Error) => {
    if (settled) {
      return
    }
    settled = true
    rejectCompleted?.(error)
  }

  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-MAX_STDERR_LENGTH)
  })
  child.stdout?.resume()
  child.on("error", fail)
  child.on("exit", (code, signal) => {
    if (!settled) {
      fail(new Error(`OpenCode server exited before session completion (${code ?? signal ?? "unknown"})${stderr.trim() ? `: ${stderr.trim()}` : ""}`))
    }
  })

  const abort = async () => {
    interrupted = true
    if (!sessionId || settled) {
      return
    }
    await fetchJson(`${baseUrl}/session/${encodeURIComponent(sessionId)}/abort?directory=${directory}`, {
      method: "POST"
    })
  }
  input.onControl?.({ child, abort })

  const dispatchEvent = (raw: unknown) => {
    const parsed = opencodeEventSchema.safeParse(raw)
    if (!parsed.success) {
      return
    }
    const event = parsed.data
    eventQueue = eventQueue.then(() => input.onEvent?.(event)).catch(fail)
    const properties = event.properties ?? {}
    const eventSessionId = typeof properties.sessionID === "string" ? properties.sessionID : null
    if (!promptAccepted || eventSessionId !== sessionId) {
      return
    }

    if (event.type === "session.error") {
      eventQueue.then(() => settle({
        sessionId: sessionId as string,
        status: "failed",
        error: properties.error,
        stderr
      })).catch(fail)
    } else if (event.type === "session.idle") {
      eventQueue.then(() => settle({
        sessionId: sessionId as string,
        status: interrupted ? "interrupted" : "completed",
        stderr
      })).catch(fail)
    }
  }

  const consumeEventStream = async (response: Response) => {
    if (!response.body) {
      throw new Error("OpenCode event stream has no response body")
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (!settled) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ""
      for (const frame of frames) {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
        if (!data) {
          continue
        }
        try {
          dispatchEvent(JSON.parse(data))
        } catch {
          // Ignore keepalive or malformed frames; typed provider events remain authoritative.
        }
      }
    }

    if (!settled && !eventController.signal.aborted) {
      throw new Error("OpenCode event stream ended before session completion")
    }
  }

  try {
    await waitUntilHealthy(baseUrl, child)

    if (!sessionId) {
      const created = await fetchJson(`${baseUrl}/session?directory=${directory}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "TeamCow conversation",
          ...(input.permission ? { permission: input.permission } : {})
        })
      })
      sessionId = opencodeSessionSchema.parse(created).id
    }

    if (input.permission) {
      await fetchJson(`${baseUrl}/session/${encodeURIComponent(sessionId)}?directory=${directory}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permission: input.permission })
      })
    }

    const eventResponse = await fetch(`${baseUrl}/event?directory=${directory}`, {
      signal: eventController.signal,
      headers: { accept: "text/event-stream" }
    })
    if (!eventResponse.ok) {
      throw new Error(`OpenCode event subscription failed (${eventResponse.status})`)
    }
    const eventStreamPromise = consumeEventStream(eventResponse).catch((error: unknown) => {
      if (!settled && !eventController.signal.aborted) {
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    })

    promptAccepted = true
    await fetchJson(`${baseUrl}/session/${encodeURIComponent(sessionId)}/prompt_async?directory=${directory}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parts: buildOpenCodePromptParts(input.prompt, input.attachments),
        ...(input.agent ? { agent: input.agent } : {}),
        ...(parseOpenCodeModel(input.model) ? { model: parseOpenCodeModel(input.model) } : {})
      })
    })
    if (interrupted) {
      await abort()
    }

    const result = await completed
    eventController.abort()
    await eventStreamPromise
    return result
  } catch (error) {
    fail(error instanceof Error ? error : new Error(String(error)))
    return await completed
  } finally {
    eventController.abort()
    if (!child.killed) {
      child.kill("SIGTERM")
    }
  }
}
