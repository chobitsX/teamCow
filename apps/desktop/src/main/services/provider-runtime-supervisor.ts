import type { ChildProcess } from "node:child_process"

type ActiveProviderRun = {
  runId: string
  conversationId: string
  child?: ChildProcess
  cancel?: () => Promise<void>
  cancelRequested: boolean
  settled: Promise<void>
  resolveSettled: () => void
}

export type ProviderRuntimeControl = {
  child: ChildProcess
  cancel?: () => Promise<void>
}

export type ProviderRuntimeSupervisor = ReturnType<typeof createProviderRuntimeSupervisor>

const createDeferred = () => {
  let resolveSettled: () => void = () => {}
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve
  })
  return { settled, resolveSettled }
}

const cancelActiveRun = (activeRun: ActiveProviderRun) => {
  activeRun.cancelRequested = true

  if (activeRun.cancel) {
    void activeRun.cancel().catch(() => {
      activeRun.child?.kill("SIGTERM")
    })
    return
  }

  activeRun.child?.kill("SIGTERM")
}

export const createProviderRuntimeSupervisor = () => {
  const activeByRunId = new Map<string, ActiveProviderRun>()
  const runIdByConversationId = new Map<string, string>()

  const reserve = (input: { runId: string; conversationId: string }) => {
    if (activeByRunId.has(input.runId) || runIdByConversationId.has(input.conversationId)) {
      return false
    }

    const deferred = createDeferred()
    activeByRunId.set(input.runId, {
      ...input,
      cancelRequested: false,
      ...deferred
    })
    runIdByConversationId.set(input.conversationId, input.runId)
    return true
  }

  const attachControl = (runId: string, control: ProviderRuntimeControl) => {
    const activeRun = activeByRunId.get(runId)
    if (!activeRun) {
      control.child.kill("SIGTERM")
      return false
    }

    activeRun.child = control.child
    activeRun.cancel = control.cancel
    if (activeRun.cancelRequested) {
      cancelActiveRun(activeRun)
    }
    return true
  }

  const release = (runId: string) => {
    const activeRun = activeByRunId.get(runId)
    if (!activeRun) {
      return
    }

    activeByRunId.delete(runId)
    if (runIdByConversationId.get(activeRun.conversationId) === runId) {
      runIdByConversationId.delete(activeRun.conversationId)
    }
    activeRun.resolveSettled()
  }

  const resolveRunId = (identifier: string) => {
    if (activeByRunId.has(identifier)) {
      return identifier
    }
    return runIdByConversationId.get(identifier) ?? null
  }

  const cancel = (identifier: string) => {
    const runId = resolveRunId(identifier)
    if (!runId) {
      return false
    }

    const activeRun = activeByRunId.get(runId)
    if (!activeRun) {
      return false
    }
    cancelActiveRun(activeRun)
    return true
  }

  const stopAll = async (timeoutMs = 5_000) => {
    const activeRuns = [...activeByRunId.values()]
    if (activeRuns.length === 0) {
      return { stopped: 0, timedOut: false }
    }

    for (const activeRun of activeRuns) {
      cancelActiveRun(activeRun)
    }

    let timeout: ReturnType<typeof setTimeout> | undefined
    const timedOut = await Promise.race([
      Promise.all(activeRuns.map((activeRun) => activeRun.settled)).then(() => false),
      new Promise<true>((resolve) => {
        timeout = setTimeout(() => resolve(true), timeoutMs)
      })
    ])
    if (timeout) {
      clearTimeout(timeout)
    }

    return { stopped: activeRuns.length, timedOut }
  }

  const listActive = () => [...activeByRunId.values()].map(({ runId, conversationId, cancelRequested }) => ({
    runId,
    conversationId,
    cancelRequested
  }))

  return {
    reserve,
    attachControl,
    release,
    cancel,
    stopAll,
    listActive
  }
}
