// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { createBackgroundTaskSupervisor } from "../background-task-supervisor"

describe("createBackgroundTaskSupervisor", () => {
  it("waits for tracked work and rejects new work after shutdown starts", async () => {
    let finish: () => void = () => {}
    const task = new Promise<void>((resolve) => {
      finish = resolve
    })
    const onError = vi.fn()
    const supervisor = createBackgroundTaskSupervisor({ onError })

    expect(supervisor.start("run-1", () => task)).toBe(true)
    supervisor.stopAccepting()
    expect(supervisor.start("run-2", async () => undefined)).toBe(false)

    const idle = supervisor.awaitIdle(500)
    finish()
    await expect(idle).resolves.toEqual({ timedOut: false, pendingKeys: [] })
    expect(onError).not.toHaveBeenCalled()
  })

  it("reports task failures instead of creating unhandled rejections", async () => {
    const onError = vi.fn()
    const supervisor = createBackgroundTaskSupervisor({ onError })
    const error = new Error("provider failed outside its normal boundary")

    supervisor.start("run-failed", async () => {
      throw error
    })
    await supervisor.awaitIdle(500)

    expect(onError).toHaveBeenCalledWith("run-failed", error)
  })
})
