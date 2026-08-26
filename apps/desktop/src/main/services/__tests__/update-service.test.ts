// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { createUpdateService, type UpdateAdapter } from "../update-service"

const createAdapter = (overrides: Partial<UpdateAdapter> = {}): UpdateAdapter => ({
  checkForUpdates: vi.fn(async () => null),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
  ...overrides
})

describe("createUpdateService", () => {
  it("returns a disabled state in development without touching the updater", async () => {
    const adapter = createAdapter()
    const service = createUpdateService({
      isPackaged: false,
      adapter,
      now: () => "2026-06-07T14:44:00.000Z"
    })

    expect(service.getState()).toEqual({
      status: "disabled",
      message: "updates-disabled-in-development"
    })
    await expect(service.checkForUpdates()).resolves.toEqual({
      status: "ok",
      state: {
        status: "disabled",
        message: "updates-disabled-in-development"
      }
    })
    expect(adapter.checkForUpdates).not.toHaveBeenCalled()
  })

  it("maps update checks with isUpdateAvailable into an available update state", async () => {
    const adapter = createAdapter({
      checkForUpdates: vi.fn(async () => ({
        isUpdateAvailable: true,
        updateInfo: {
          version: "1.2.3"
        }
      }))
    })
    const service = createUpdateService({
      isPackaged: true,
      adapter,
      now: () => "2026-06-07T14:45:00.000Z"
    })

    await expect(service.checkForUpdates()).resolves.toEqual({
      status: "ok",
      state: {
        status: "available",
        version: "1.2.3",
        checkedAt: "2026-06-07T14:45:00.000Z"
      }
    })
  })

  it("does not report an available update when update metadata exists but isUpdateAvailable is false", async () => {
    const adapter = createAdapter({
      checkForUpdates: vi.fn(async () => ({
        isUpdateAvailable: false,
        updateInfo: {
          version: "1.2.3"
        }
      }))
    })
    const service = createUpdateService({
      isPackaged: true,
      adapter,
      now: () => "2026-06-07T14:45:00.000Z"
    })

    await expect(service.checkForUpdates()).resolves.toEqual({
      status: "ok",
      state: {
        status: "not-available",
        version: "1.2.3",
        checkedAt: "2026-06-07T14:45:00.000Z"
      }
    })
  })

  it("notifies listeners when updater state changes asynchronously", async () => {
    let downloadedHandler: ((info: { version: string }) => void) | undefined
    const onStateChange = vi.fn()
    const adapter = createAdapter({
      on: vi.fn((event, handler) => {
        if (event === "update-downloaded") {
          downloadedHandler = handler as (info: { version: string }) => void
        }
      })
    })
    createUpdateService({
      isPackaged: true,
      adapter,
      now: () => "2026-06-07T14:46:00.000Z",
      onStateChange
    })

    const handler = downloadedHandler
    if (!handler) {
      throw new Error("missing update-downloaded handler")
    }
    handler({ version: "1.2.4" })

    expect(onStateChange).toHaveBeenCalledWith({
      status: "downloaded",
      version: "1.2.4",
      downloadedAt: "2026-06-07T14:46:00.000Z"
    })
  })

  it("tracks downloaded update events and allows restart installation", async () => {
    let downloadedHandler: ((info: { version: string }) => void) | undefined
    const adapter = createAdapter({
      on: vi.fn((event, handler) => {
        if (event === "update-downloaded") {
          downloadedHandler = handler as (info: { version: string }) => void
        }
      })
    })
    const service = createUpdateService({
      isPackaged: true,
      adapter,
      now: () => "2026-06-07T14:46:00.000Z"
    })

    const handler = downloadedHandler
    if (!handler) {
      throw new Error("missing update-downloaded handler")
    }
    handler({ version: "1.2.4" })

    expect(service.getState()).toEqual({
      status: "downloaded",
      version: "1.2.4",
      downloadedAt: "2026-06-07T14:46:00.000Z"
    })
    expect(service.installUpdateAndRestart()).toEqual({
      status: "ok",
      state: {
        status: "downloaded",
        version: "1.2.4",
        downloadedAt: "2026-06-07T14:46:00.000Z"
      }
    })
    expect(adapter.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it("returns a typed error when restart is requested before an update is downloaded", () => {
    const adapter = createAdapter()
    const service = createUpdateService({
      isPackaged: true,
      adapter,
      now: () => "2026-06-07T14:47:00.000Z"
    })

    expect(service.installUpdateAndRestart()).toEqual({
      status: "error",
      state: {
        status: "idle"
      },
      error: {
        code: "UPDATE_INSTALL_FAILED",
        message: "update-not-downloaded",
        suggestion: null,
        domain: "update",
        context: {
          updateStatus: "idle",
          errorCode: "UPDATE_INSTALL_FAILED"
        }
      }
    })
    expect(adapter.quitAndInstall).not.toHaveBeenCalled()
  })

  it("logs update check failures with structured context", async () => {
    const log = {
      error: vi.fn()
    }
    const adapter = createAdapter({
      checkForUpdates: vi.fn(async () => {
        throw new Error("release metadata unavailable")
      })
    })
    const service = createUpdateService({
      isPackaged: true,
      adapter,
      now: () => "2026-06-07T14:48:00.000Z",
      log: log as never
    })

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: "error",
      error: {
        code: "UPDATE_CHECK_FAILED",
        domain: "update",
        context: {
          updateStatus: "error",
          errorCode: "UPDATE_CHECK_FAILED"
        }
      }
    })

    expect(log.error).toHaveBeenCalledWith("update", "update.check.failed", {
      updateStatus: "error",
      errorCode: "UPDATE_CHECK_FAILED",
      errorMessage: "release metadata unavailable"
    })
  })
})
