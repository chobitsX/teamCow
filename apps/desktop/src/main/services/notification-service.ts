import type { HostNotificationPayload, HostNotificationResult } from "@shared/index"

type NotificationShowInput = {
  title: string
  body: string
}

type NotificationAdapter = {
  isSupported: () => boolean
  show: (input: NotificationShowInput) => void
}

type NotificationServiceOptions = {
  onFailure?: (result: Exclude<HostNotificationResult, { status: "shown" }>, payload: HostNotificationPayload) => void
}

export type NotificationService = ReturnType<typeof createNotificationService>

const toErrorMessage = (err: unknown) => err instanceof Error ? err.message : String(err)

export const createNotificationService = (adapter: NotificationAdapter, options: NotificationServiceOptions = {}) => {
  const showHostNotification = (payload: HostNotificationPayload): HostNotificationResult => {
    if (!adapter.isSupported()) {
      const result = { status: "unsupported" } as const
      options.onFailure?.(result, payload)
      return result
    }

    try {
      adapter.show({
        title: payload.title,
        body: payload.body
      })
      return { status: "shown" }
    } catch (err) {
      const result = {
        status: "error",
        error: {
          code: "NOTIFICATION_SEND_FAILED",
          message: toErrorMessage(err),
          suggestion: null
        }
      } as const
      options.onFailure?.(result, payload)
      return result
    }
  }

  return {
    showHostNotification
  }
}
