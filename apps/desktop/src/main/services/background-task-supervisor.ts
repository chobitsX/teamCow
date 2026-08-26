export type BackgroundTaskSupervisor = ReturnType<typeof createBackgroundTaskSupervisor>

export const createBackgroundTaskSupervisor = (deps: {
  onError: (key: string, error: unknown) => void
}) => {
  const tasks = new Map<string, Promise<void>>()
  let accepting = true

  const start = (key: string, task: () => Promise<void>) => {
    if (!accepting || tasks.has(key)) {
      return false
    }

    const promise = Promise.resolve()
      .then(task)
      .catch((error: unknown) => {
        deps.onError(key, error)
      })
      .finally(() => {
        if (tasks.get(key) === promise) {
          tasks.delete(key)
        }
      })
    tasks.set(key, promise)
    return true
  }

  const stopAccepting = () => {
    accepting = false
  }

  const awaitIdle = async (timeoutMs = 5_000) => {
    const pending = [...tasks.values()]
    if (pending.length === 0) {
      return { timedOut: false, pendingKeys: [] as string[] }
    }

    let timeout: ReturnType<typeof setTimeout> | undefined
    const timedOut = await Promise.race([
      Promise.allSettled(pending).then(() => false),
      new Promise<true>((resolve) => {
        timeout = setTimeout(() => resolve(true), timeoutMs)
      })
    ])
    if (timeout) {
      clearTimeout(timeout)
    }

    return { timedOut, pendingKeys: [...tasks.keys()] }
  }

  const listPendingKeys = () => [...tasks.keys()]

  return {
    start,
    stopAccepting,
    awaitIdle,
    listPendingKeys
  }
}
