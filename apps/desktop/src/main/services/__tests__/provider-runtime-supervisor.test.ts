// @vitest-environment node
import type { ChildProcess } from "node:child_process"
import { describe, expect, it, vi } from "vitest"
import { createProviderRuntimeSupervisor } from "../provider-runtime-supervisor"

const createChild = () => ({ kill: vi.fn(() => true) }) as unknown as ChildProcess

describe("createProviderRuntimeSupervisor", () => {
  it("owns active runs by run id while enforcing one run per conversation", () => {
    const supervisor = createProviderRuntimeSupervisor()
    const child = createChild()
    const cancel = vi.fn(async () => undefined)

    expect(supervisor.reserve({ runId: "run-1", conversationId: "conversation-1" })).toBe(true)
    expect(supervisor.reserve({ runId: "run-2", conversationId: "conversation-1" })).toBe(false)
    expect(supervisor.attachControl("run-1", { child, cancel })).toBe(true)
    expect(supervisor.cancel("run-1")).toBe(true)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(supervisor.listActive()).toEqual([
      { runId: "run-1", conversationId: "conversation-1", cancelRequested: true }
    ])

    supervisor.release("run-1")
    expect(supervisor.listActive()).toEqual([])
  })

  it("preserves an early cancellation request until provider control is attached", () => {
    const supervisor = createProviderRuntimeSupervisor()
    const child = createChild()

    supervisor.reserve({ runId: "run-early", conversationId: "conversation-early" })
    expect(supervisor.cancel("conversation-early")).toBe(true)
    supervisor.attachControl("run-early", { child })

    expect(child.kill).toHaveBeenCalledWith("SIGTERM")
    supervisor.release("run-early")
  })

  it("cancels and waits for all active runs during shutdown", async () => {
    const supervisor = createProviderRuntimeSupervisor()
    const cancel = vi.fn(async () => undefined)

    supervisor.reserve({ runId: "run-stop", conversationId: "conversation-stop" })
    supervisor.attachControl("run-stop", { child: createChild(), cancel })

    const stopping = supervisor.stopAll(500)
    expect(cancel).toHaveBeenCalledTimes(1)
    supervisor.release("run-stop")

    await expect(stopping).resolves.toEqual({ stopped: 1, timedOut: false })
  })
})
