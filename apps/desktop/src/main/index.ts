import { app, BrowserWindow, Notification, dialog, net, protocol } from "electron"
import { pathToFileURL } from "node:url"
import { autoUpdater } from "electron-updater"
import { defaultLocale } from "@teamcow/i18n-resources"
import { worktreeGitChangedEventSchema } from "@shared/index"
import { createMainWindow } from "./windows/create-main-window"
import { tMain } from "./main-i18n"
import { CONVERSATION_ATTACHMENT_SCHEME, createProjectService } from "./project-service"
import { TEAMCOW_RUN_EVENT_CHANNEL, TEAMCOW_TERMINAL_OUTPUT_CHANNEL, TEAMCOW_UPDATE_STATE_CHANNEL, TEAMCOW_WORKTREE_GIT_CHANGED_CHANNEL } from "./desktop-channel"
import { registerDesktopRouter } from "./desktop-router"
import { createLoggingService } from "./services/logging-service"
import { createNotificationService } from "./services/notification-service"
import { createProviderRuntimeService } from "./services/provider-runtime-service"
import { createUpdateService } from "./services/update-service"

// eslint-disable-next-line i18next/no-literal-string -- Stable product name used by Electron for the macOS application menu.
app.setName("TeamCow")

protocol.registerSchemesAsPrivileged([{
  scheme: CONVERSATION_ATTACHMENT_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true
  }
}])

let projectService: ReturnType<typeof createProjectService> | null = null
let providerRuntimeService: ReturnType<typeof createProviderRuntimeService> | null = null
const loggingService = createLoggingService()
const notificationService = createNotificationService(
  {
    isSupported: () => Notification.isSupported(),
    show: ({ title, body }) => {
      new Notification({ title, body }).show()
    }
  },
  {
    onFailure: (result, payload) => {
      /* eslint-disable i18next/no-literal-string -- machine-readable diagnostic log values, not user-visible UI copy. */
      loggingService.warn("notification", "notification.send.unavailable", {
        kind: payload.kind,
        errorCode: result.status === "error" ? result.error.code : "NOTIFICATION_UNAVAILABLE",
        errorMessage: result.status === "error" ? result.error.message : "notifications-unsupported"
      })
      /* eslint-enable i18next/no-literal-string */
    }
  }
)
const updateAdapter = {
  checkForUpdates: () => autoUpdater.checkForUpdates(),
  quitAndInstall: () => autoUpdater.quitAndInstall(),
  on: (event: string, handler: (...args: unknown[]) => void) => {
    autoUpdater.on(event as never, handler as never)
  }
}
const updateService = createUpdateService({
  isPackaged: app.isPackaged,
  adapter: updateAdapter,
  log: loggingService,
  onStateChange: (state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(TEAMCOW_UPDATE_STATE_CHANNEL, state)
    }
  }
})

const createWindow = async () => {
  await createMainWindow()
}

app.whenReady().then(async () => {
  try {
    projectService = createProjectService({
      userDataPath: app.getPath("userData"),
      getProviderReadinessSnapshot: () => providerRuntimeService?.getSnapshot() ?? {
        checkedAt: "",
        providers: []
      },
      listProviderModels: async (providerKind) =>
        providerRuntimeService?.listProviderModels(providerKind) ?? [],
      runProvider: async (input) => {
        if (!providerRuntimeService) {
          return {
            status: "unavailable",
            events: [
              {
                type: "run.status",
                status: "unavailable",
                payload: {
                  provider: input.provider,
                  conversationId: input.conversationId,
                  runId: input.runId,
                  worktreeId: input.worktreeId,
                  worktreeRootPath: input.worktreeRootPath,
                  // eslint-disable-next-line i18next/no-literal-string -- machine-readable runtime reason, translated in renderer if surfaced.
                  reason: "provider-runtime-not-initialized"
                }
              }
            ]
          }
        }

        return providerRuntimeService.runProvider(input)
      },
      cancelProviderRun: (conversationId) =>
        providerRuntimeService?.cancelRun(conversationId) ?? false,
      cancelProviderRunById: (runId) =>
        providerRuntimeService?.cancelRun(runId) ?? false,
      log: loggingService,
      onTerminalOutput: (event) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(TEAMCOW_TERMINAL_OUTPUT_CHANNEL, event)
        }
      },
      onRunEvent: (event) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(TEAMCOW_RUN_EVENT_CHANNEL, event)
        }
      },
      onWorktreeGitChanged: (rawEvent) => {
        const event = worktreeGitChangedEventSchema.parse(rawEvent)
        for (const window of BrowserWindow.getAllWindows()) {
          if (window.isDestroyed() || window.webContents.isDestroyed()) {
            continue
          }
          try {
            window.webContents.send(TEAMCOW_WORKTREE_GIT_CHANGED_CHANNEL, event)
          } catch (error) {
            // eslint-disable-next-line i18next/no-literal-string -- machine-readable diagnostic event and code, never rendered to users.
            loggingService.warn("git", "git.event.broadcast.failed", {
              worktreeId: event.worktreeId,
              errorCode: "GIT_WATCH_FAILED",
              errorMessage: error instanceof Error ? error.message : String(error)
            })
          }
        }
      },
      isAppFocused: () => BrowserWindow.getAllWindows().some((window) => window.isFocused()),
      onRunNotificationCandidate: (payload) => {
        const context = payload.context
        if (!context) {
          return
        }
        const locale = projectService?.getLocale() ?? defaultLocale
        notificationService.showHostNotification({
          ...payload,
          title: tMain(locale, "notifications", `run.${context.runStatus}.title`),
          body: tMain(locale, "notifications", `run.${context.runStatus}.body`, {
            projectName: context.projectName,
            conversationTitle: context.conversationTitle,
            providerKind: context.providerKind,
            worktreeLabel: context.worktreeLabel
          })
        })
      },
      pickProjectDirectory: async () => {
        const locale = projectService?.getLocale() ?? defaultLocale
        const result = await dialog.showOpenDialog({
          title: tMain(locale, "notifications", "dialog.import.title"),
          properties: ["openDirectory"]
        })

        if (result.canceled || result.filePaths.length === 0) {
          return null
        }

        return result.filePaths[0]
      },
      confirmGitInit: async ({ directoryPath, projectName }) => {
        const locale = projectService?.getLocale() ?? defaultLocale
        const result = await dialog.showMessageBox({
          type: "question",
          buttons: [
            tMain(locale, "notifications", "dialog.git-init.confirm"),
            tMain(locale, "common", "action.cancel")
          ],
          defaultId: 0,
          cancelId: 1,
          title: tMain(locale, "notifications", "dialog.git-init.title"),
          message: tMain(locale, "notifications", "dialog.git-init.message", { projectName }),
          detail: tMain(locale, "notifications", "dialog.git-init.detail", { directoryPath })
        })

        return result.response === 0
      }
    })
    protocol.handle(CONVERSATION_ATTACHMENT_SCHEME, async (request) => {
      const attachment = projectService?.resolveConversationAttachment(request.url)
      if (!attachment) {
        return new Response(null, { status: 404 })
      }

      const response = await net.fetch(pathToFileURL(attachment.path).toString())
      const headers = new Headers(response.headers)
      // eslint-disable-next-line i18next/no-literal-string -- HTTP header names and values are protocol metadata.
      headers.set("Content-Type", attachment.mimeType)
      // eslint-disable-next-line i18next/no-literal-string -- HTTP header names and values are protocol metadata.
      headers.set("X-Content-Type-Options", "nosniff")
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    /* eslint-disable i18next/no-literal-string -- machine-readable diagnostic log values, not user-visible UI copy. */
    loggingService.error("app-startup", "startup.init.failed", {
      errorCode: "INTERNAL_ERROR",
      errorMessage: message
    })
    /* eslint-enable i18next/no-literal-string */
    await dialog.showErrorBox(
      tMain(defaultLocale, "errors", "startup.init.title"),
      tMain(defaultLocale, "errors", "startup.init.detail", { message })
    )
    app.quit()
    return
  }

  providerRuntimeService = createProviderRuntimeService()
  registerDesktopRouter({
    projectService,
    providerRuntimeService,
    customModelsService: projectService.customModelsService,
    notificationService,
    updateService
  })
  await createWindow()

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

let shutdownPromise: Promise<void> | null = null
let allowQuit = false

const shutdownApplication = () => {
  shutdownPromise ??= (async () => {
    const runtimeResult = await providerRuntimeService?.stopAll()
    if (runtimeResult?.timedOut) {
      // eslint-disable-next-line i18next/no-literal-string -- structured log identifiers and error codes are machine values.
      loggingService.warn("provider", "provider.runtime.shutdown.timeout", {
        errorCode: "INTERNAL_ERROR",
        activeRuns: providerRuntimeService?.listActiveRuns().length ?? 0
      })
    }

    await projectService?.shutdown()
  })()
  return shutdownPromise
}

app.on("before-quit", (event) => {
  if (allowQuit) {
    return
  }

  event.preventDefault()
  void shutdownApplication()
    .catch((error: unknown) => {
      loggingService.error("app-startup", "shutdown.failed", {
        errorCode: "INTERNAL_ERROR",
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    })
    .finally(() => {
      allowQuit = true
      app.quit()
    })
})
