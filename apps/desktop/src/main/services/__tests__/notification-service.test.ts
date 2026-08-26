// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { createNotificationService } from "../notification-service"

const runNotification = {
  kind: "run-completed" as const,
  title: "Run completed",
  body: "Codex finished the task.",
  context: {
    projectName: "teamCow",
    conversationTitle: "Build updater",
    providerKind: "codex" as const,
    worktreeLabel: "main",
    runStatus: "completed" as const
  }
}

describe("createNotificationService", () => {
  it("returns unsupported without showing a notification when the host API is unavailable", () => {
    const show = vi.fn()
    const onFailure = vi.fn()
    const service = createNotificationService({
      isSupported: () => false,
      show
    }, {
      onFailure
    })

    expect(service.showHostNotification(runNotification)).toEqual({ status: "unsupported" })
    expect(show).not.toHaveBeenCalled()
    expect(onFailure).toHaveBeenCalledWith({ status: "unsupported" }, runNotification)
  })

  it("shows renderer-translated notification content through the host adapter", () => {
    const show = vi.fn()
    const service = createNotificationService({
      isSupported: () => true,
      show
    })

    expect(service.showHostNotification(runNotification)).toEqual({ status: "shown" })
    expect(show).toHaveBeenCalledWith({
      title: "Run completed",
      body: "Codex finished the task."
    })
  })

  it("returns a typed local integration error when notification dispatch fails", () => {
    const onFailure = vi.fn()
    const service = createNotificationService({
      isSupported: () => true,
      show: () => {
        throw new Error("notification permission denied")
      }
    }, {
      onFailure
    })

    const result = {
      status: "error",
      error: {
        code: "NOTIFICATION_SEND_FAILED",
        message: "notification permission denied",
        suggestion: null
      }
    } as const
    expect(service.showHostNotification(runNotification)).toEqual(result)
    expect(onFailure).toHaveBeenCalledWith(result, runNotification)
  })
})
