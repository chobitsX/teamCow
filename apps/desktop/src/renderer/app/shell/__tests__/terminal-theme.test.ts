import { afterEach, describe, expect, it } from "vitest"
import { readCssThemeColor, readTerminalTheme } from "../terminal-theme"

const root = document.documentElement

afterEach(() => {
  root.removeAttribute("style")
})

describe("terminal-theme", () => {
  it("maps CSS terminal tokens to an xterm theme object", () => {
    root.style.setProperty("--terminal-bg", "#24273a")
    root.style.setProperty("--terminal-fg", "#cad3f5")
    root.style.setProperty("--terminal-cursor", "#f4dbd6")
    root.style.setProperty("--terminal-cursor-accent", "#24273a")
    root.style.setProperty("--terminal-selection-bg", "#5b6078")
    root.style.setProperty("--terminal-black", "#494d64")
    root.style.setProperty("--terminal-red", "#ed8796")
    root.style.setProperty("--terminal-green", "#a6da95")
    root.style.setProperty("--terminal-yellow", "#eed49f")
    root.style.setProperty("--terminal-blue", "#8aadf4")
    root.style.setProperty("--terminal-magenta", "#f5bde6")
    root.style.setProperty("--terminal-cyan", "#91d7e3")
    root.style.setProperty("--terminal-white", "#b8c0e0")
    root.style.setProperty("--terminal-bright-black", "#5b6078")
    root.style.setProperty("--terminal-bright-red", "#ed8796")
    root.style.setProperty("--terminal-bright-green", "#a6da95")
    root.style.setProperty("--terminal-bright-yellow", "#eed49f")
    root.style.setProperty("--terminal-bright-blue", "#8aadf4")
    root.style.setProperty("--terminal-bright-magenta", "#f5bde6")
    root.style.setProperty("--terminal-bright-cyan", "#91d7e3")
    root.style.setProperty("--terminal-bright-white", "#cad3f5")

    expect(readTerminalTheme()).toEqual({
      background: "#24273a",
      foreground: "#cad3f5",
      cursor: "#f4dbd6",
      cursorAccent: "#24273a",
      selectionBackground: "#5b6078",
      black: "#494d64",
      red: "#ed8796",
      green: "#a6da95",
      yellow: "#eed49f",
      blue: "#8aadf4",
      magenta: "#f5bde6",
      cyan: "#91d7e3",
      white: "#b8c0e0",
      brightBlack: "#5b6078",
      brightRed: "#ed8796",
      brightGreen: "#a6da95",
      brightYellow: "#eed49f",
      brightBlue: "#8aadf4",
      brightMagenta: "#f5bde6",
      brightCyan: "#91d7e3",
      brightWhite: "#cad3f5"
    })
  })

  it("falls back when a CSS token is missing", () => {
    expect(readCssThemeColor("--missing-token", "#fallback")).toBe("#fallback")
    expect(readTerminalTheme().background).toBe("#24273a")
    expect(readTerminalTheme().foreground).toBe("#cad3f5")
  })
})
