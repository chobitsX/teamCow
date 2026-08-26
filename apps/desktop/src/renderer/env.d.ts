import type { TeamcowDesktopApi } from "@shared/index"

declare global {
  interface Window {
    teamcow: TeamcowDesktopApi
  }
}

export {}

