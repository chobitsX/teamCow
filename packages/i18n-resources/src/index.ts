import commonEn from "./common/en.json" with { type: "json" }
import commonZh from "./common/zh.json" with { type: "json" }
import shellEn from "./shell/en.json" with { type: "json" }
import shellZh from "./shell/zh.json" with { type: "json" }
import chatEn from "./chat/en.json" with { type: "json" }
import chatZh from "./chat/zh.json" with { type: "json" }
import inspectorEn from "./inspector/en.json" with { type: "json" }
import inspectorZh from "./inspector/zh.json" with { type: "json" }
import providerEn from "./provider/en.json" with { type: "json" }
import providerZh from "./provider/zh.json" with { type: "json" }
import errorsEn from "./errors/en.json" with { type: "json" }
import errorsZh from "./errors/zh.json" with { type: "json" }
import notificationsEn from "./notifications/en.json" with { type: "json" }
import notificationsZh from "./notifications/zh.json" with { type: "json" }
import settingsEn from "./settings/en.json" with { type: "json" }
import settingsZh from "./settings/zh.json" with { type: "json" }

export const resources = {
  en: {
    common: commonEn,
    shell: shellEn,
    chat: chatEn,
    inspector: inspectorEn,
    provider: providerEn,
    errors: errorsEn,
    notifications: notificationsEn,
    settings: settingsEn
  },
  zh: {
    common: commonZh,
    shell: shellZh,
    chat: chatZh,
    inspector: inspectorZh,
    provider: providerZh,
    errors: errorsZh,
    notifications: notificationsZh,
    settings: settingsZh
  }
} as const

export type SupportedLocale = keyof typeof resources
export type Namespace = keyof (typeof resources)["en"]

export const supportedLocales: SupportedLocale[] = ["en", "zh"]
export const defaultLocale: SupportedLocale = "en"
export const namespaces: Namespace[] = [
  "common",
  "shell",
  "chat",
  "inspector",
  "provider",
  "errors",
  "notifications",
  "settings"
]
