import type { AppError, UpdateActionResult, UpdateState } from "@shared/index"
import type { LoggingService } from "./logging-service"

export type UpdateInfo = {
  version?: string
}

export type UpdateCheckResult = {
  isUpdateAvailable?: boolean
  updateInfo?: UpdateInfo | null
}

export type UpdateAdapter = {
  checkForUpdates: () => Promise<UpdateCheckResult | null>
  quitAndInstall: () => void
  on: (event: string, handler: (...args: unknown[]) => void) => void
}

type UpdateServiceDeps = {
  isPackaged: boolean
  adapter: UpdateAdapter
  onStateChange?: (state: UpdateState) => void
  log?: Pick<LoggingService, "error">
  now?: () => string
}

export type UpdateService = ReturnType<typeof createUpdateService>

const disabledState: UpdateState = {
  status: "disabled",
  message: "updates-disabled-in-development"
}

const idleState: UpdateState = {
  status: "idle"
}

const toErrorMessage = (err: unknown) => err instanceof Error ? err.message : String(err)

const buildUpdateError = (
  code: Extract<AppError["code"], "UPDATE_CHECK_FAILED" | "UPDATE_INSTALL_FAILED">,
  message: string,
  updateStatus: UpdateState["status"]
): AppError => ({
  code,
  message,
  suggestion: null,
  domain: "update",
  context: {
    updateStatus,
    errorCode: code
  }
})

export const createUpdateService = ({
  isPackaged,
  adapter,
  onStateChange,
  log,
  now = () => new Date().toISOString()
}: UpdateServiceDeps) => {
  let state: UpdateState = isPackaged ? idleState : disabledState

  const setState = (nextState: UpdateState) => {
    state = nextState
    onStateChange?.(state)
  }

  if (isPackaged) {
    adapter.on("update-downloaded", (info) => {
      const updateInfo = info as UpdateInfo | undefined
      setState({
        status: "downloaded",
        version: updateInfo?.version,
        downloadedAt: now()
      })
    })

    adapter.on("error", (err) => {
      const message = toErrorMessage(err)
      setState({
        status: "error",
        errorCode: "UPDATE_CHECK_FAILED",
        message
      })
      log?.error("update", "update.check.failed", {
        updateStatus: "error",
        errorCode: "UPDATE_CHECK_FAILED",
        errorMessage: message
      })
    })
  }

  const getState = () => state

  const checkForUpdates = async (): Promise<UpdateActionResult> => {
    if (!isPackaged) {
      setState(disabledState)
      return {
        status: "ok",
        state
      }
    }

    setState({
      status: "checking",
      checkedAt: now()
    })

    try {
      const result = await adapter.checkForUpdates()
      const version = result?.updateInfo?.version
      const isUpdateAvailable = result?.isUpdateAvailable ?? false
      setState(isUpdateAvailable
        ? {
            status: "available",
            version,
            checkedAt: now()
          }
        : {
            status: "not-available",
            version,
            checkedAt: now()
          })

      return {
        status: "ok",
        state
      }
    } catch (err) {
      const message = toErrorMessage(err)
      setState({
        status: "error",
        errorCode: "UPDATE_CHECK_FAILED",
        message
      })
      log?.error("update", "update.check.failed", {
        updateStatus: "error",
        errorCode: "UPDATE_CHECK_FAILED",
        errorMessage: message
      })
      return {
        status: "error",
        state,
        error: buildUpdateError("UPDATE_CHECK_FAILED", state.message ?? "update-check-failed", state.status)
      }
    }
  }

  const installUpdateAndRestart = (): UpdateActionResult => {
    if (state.status !== "downloaded") {
      return {
        status: "error",
        state,
        error: buildUpdateError("UPDATE_INSTALL_FAILED", "update-not-downloaded", state.status)
      }
    }

    try {
      adapter.quitAndInstall()
      return {
        status: "ok",
        state
      }
    } catch (err) {
      const message = toErrorMessage(err)
      setState({
        status: "error",
        errorCode: "UPDATE_INSTALL_FAILED",
        message
      })
      log?.error("update", "update.install.failed", {
        updateStatus: "error",
        errorCode: "UPDATE_INSTALL_FAILED",
        errorMessage: message
      })
      return {
        status: "error",
        state,
        error: buildUpdateError("UPDATE_INSTALL_FAILED", state.message ?? "update-install-failed", state.status)
      }
    }
  }

  return {
    getState,
    checkForUpdates,
    installUpdateAndRestart
  }
}
