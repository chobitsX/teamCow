import { BrowserWindow, shell } from "electron"
import { join } from "node:path"

type ExternalNavigationInput = {
  url: string
  allowedAppOrigins: Set<string>
  preventDefault: () => void
  openExternal: (url: string) => unknown
}

const EXTERNAL_OPEN_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

export const isExternalOpenUrl = (url: string) => {
  try {
    return EXTERNAL_OPEN_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

const getOrigin = (url: string) => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export const handleExternalNavigation = ({
  url,
  allowedAppOrigins,
  preventDefault,
  openExternal
}: ExternalNavigationInput) => {
  if (allowedAppOrigins.has(getOrigin(url) ?? "")) {
    return
  }

  preventDefault()

  if (isExternalOpenUrl(url)) {
    openExternal(url)
  }
}

const getAllowedAppOrigins = () => {
  const origins = new Set<string>()
  if (process.env.ELECTRON_RENDERER_URL) {
    const origin = getOrigin(process.env.ELECTRON_RENDERER_URL)
    if (origin) {
      origins.add(origin)
    }
  }
  return origins
}

export const createMainWindow = async () => {
  const allowedAppOrigins = getAllowedAppOrigins()
  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: "#141416",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalOpenUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (event, url) => {
    handleExternalNavigation({
      url,
      allowedAppOrigins,
      preventDefault: () => event.preventDefault(),
      openExternal: (targetUrl) => void shell.openExternal(targetUrl)
    })
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"))
  }

  return window
}
