import { spawn } from "node:child_process"

export type GitProcessResult = {
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: Buffer
  stderr: Buffer
  stdoutByteLength: number
  stdoutTruncated: boolean
  timedOut: boolean
  error?: NodeJS.ErrnoException
}

export type GitProcessRunInput = {
  worktreeRootPath: string
  args: string[]
  timeoutMs?: number
  maximumStdoutBytes?: number
  cacheTtlMs?: number
  mutation?: boolean
}

type QueueWaiter = () => void

const createSemaphore = (maximumConcurrency: number) => {
  let active = 0
  const queue: QueueWaiter[] = []

  const acquire = async () => {
    if (active >= maximumConcurrency) {
      await new Promise<void>((resolve) => queue.push(resolve))
    }
    active += 1
  }

  const release = () => {
    active -= 1
    queue.shift()?.()
  }

  return { acquire, release }
}

const appendBounded = (
  chunks: Buffer[],
  chunk: Buffer,
  currentLength: number,
  maximumLength: number
) => {
  const remaining = Math.max(0, maximumLength - currentLength)
  if (remaining > 0) {
    chunks.push(chunk.subarray(0, remaining))
  }
}

export const createGitProcessRunner = (options: {
  maximumConcurrency?: number
  defaultTimeoutMs?: number
  defaultMaximumStdoutBytes?: number
  now?: () => number
} = {}) => {
  const semaphore = createSemaphore(Math.max(1, options.maximumConcurrency ?? 4))
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000
  const defaultMaximumStdoutBytes = options.defaultMaximumStdoutBytes ?? 32 * 1024 * 1024
  const now = options.now ?? Date.now
  const inFlightReads = new Map<string, { generation: number; promise: Promise<GitProcessResult> }>()
  const readCache = new Map<string, { generation: number; expiresAt: number; result: GitProcessResult }>()
  const mutationTails = new Map<string, Promise<void>>()
  const generations = new Map<string, number>()

  const execute = async (input: GitProcessRunInput): Promise<GitProcessResult> => {
    await semaphore.acquire()
    try {
      return await new Promise<GitProcessResult>((resolve) => {
        const maximumStdoutBytes = input.maximumStdoutBytes ?? defaultMaximumStdoutBytes
        const stdoutChunks: Buffer[] = []
        const stderrChunks: Buffer[] = []
        let stdoutByteLength = 0
        let stderrByteLength = 0
        let timedOut = false
        let processError: NodeJS.ErrnoException | undefined
        let settled = false
        const child = spawn("git", ["-C", input.worktreeRootPath, ...input.args], {
          stdio: ["ignore", "pipe", "pipe"]
        })
        const timeout = setTimeout(() => {
          timedOut = true
          child.kill("SIGKILL")
        }, input.timeoutMs ?? defaultTimeoutMs)

        child.stdout?.on("data", (value: Buffer | string) => {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
          appendBounded(stdoutChunks, chunk, Math.min(stdoutByteLength, maximumStdoutBytes), maximumStdoutBytes)
          stdoutByteLength += chunk.length
        })
        child.stderr?.on("data", (value: Buffer | string) => {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
          appendBounded(stderrChunks, chunk, stderrByteLength, 4 * 1024 * 1024)
          stderrByteLength += chunk.length
        })
        child.once("error", (error: NodeJS.ErrnoException) => {
          processError = error
        })
        child.once("close", (exitCode, signal) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve({
            exitCode,
            signal,
            stdout: Buffer.concat(stdoutChunks),
            stderr: Buffer.concat(stderrChunks),
            stdoutByteLength,
            stdoutTruncated: stdoutByteLength > maximumStdoutBytes,
            timedOut,
            ...(processError ? { error: processError } : {})
          })
        })
      })
    } finally {
      semaphore.release()
    }
  }

  const cacheKey = (input: GitProcessRunInput) => JSON.stringify([
    input.worktreeRootPath,
    input.args,
    input.timeoutMs ?? defaultTimeoutMs,
    input.maximumStdoutBytes ?? defaultMaximumStdoutBytes
  ])

  const invalidate = (worktreeRootPath: string) => {
    generations.set(worktreeRootPath, (generations.get(worktreeRootPath) ?? 0) + 1)
    for (const key of readCache.keys()) {
      if (key.includes(JSON.stringify(worktreeRootPath))) {
        readCache.delete(key)
      }
    }
  }

  const runRead = async (input: GitProcessRunInput) => {
    // A read requested after a mutation has been queued must observe that
    // mutation. Reads already in progress may finish with the earlier snapshot,
    // but the generation guard prevents them from repopulating stale cache.
    const pendingMutation = mutationTails.get(input.worktreeRootPath)
    if (pendingMutation) await pendingMutation

    const generation = generations.get(input.worktreeRootPath) ?? 0
    const key = cacheKey(input)
    const cached = readCache.get(key)
    if (cached && cached.generation === generation && cached.expiresAt > now()) {
      return cached.result
    }
    const existing = inFlightReads.get(key)
    if (existing?.generation === generation) return existing.promise

    const pending = execute({ ...input, mutation: false }).then((result) => {
      const cacheTtlMs = input.cacheTtlMs ?? 0
      if (cacheTtlMs > 0 && (generations.get(input.worktreeRootPath) ?? 0) === generation) {
        readCache.set(key, { generation, expiresAt: now() + cacheTtlMs, result })
      }
      return result
    }).finally(() => {
      if (inFlightReads.get(key)?.promise === pending) inFlightReads.delete(key)
    })
    inFlightReads.set(key, { generation, promise: pending })
    return pending
  }

  const runMutation = async (input: GitProcessRunInput) => {
    invalidate(input.worktreeRootPath)
    const previous = mutationTails.get(input.worktreeRootPath) ?? Promise.resolve()
    let releaseTail!: () => void
    const current = new Promise<void>((resolve) => {
      releaseTail = resolve
    })
    const tail = previous.then(() => current)
    mutationTails.set(input.worktreeRootPath, tail)
    await previous
    try {
      return await execute({ ...input, mutation: true })
    } finally {
      releaseTail()
      if (mutationTails.get(input.worktreeRootPath) === tail) {
        mutationTails.delete(input.worktreeRootPath)
      }
    }
  }

  return {
    run: (input: GitProcessRunInput) => input.mutation ? runMutation(input) : runRead(input),
    invalidate,
    inspect: () => ({
      inFlightReads: inFlightReads.size,
      cachedReads: readCache.size,
      pendingMutationQueues: mutationTails.size
    })
  }
}

export type GitProcessRunner = ReturnType<typeof createGitProcessRunner>
