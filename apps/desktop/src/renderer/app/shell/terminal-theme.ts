/* eslint-disable i18next/no-literal-string -- Theme tokens and color values are non-user-visible styling data. */
import type { ITheme } from "@xterm/xterm"

export const readCssThemeColor = (
  token: string,
  fallback: string,
  root: Element = document.documentElement
): string => {
  const value = getComputedStyle(root).getPropertyValue(token).trim()
  return value || fallback
}

export const readTerminalTheme = (root: Element = document.documentElement): ITheme => ({
  background: readCssThemeColor("--terminal-bg", "#24273a", root),
  foreground: readCssThemeColor("--terminal-fg", "#cad3f5", root),
  cursor: readCssThemeColor("--terminal-cursor", "#f4dbd6", root),
  cursorAccent: readCssThemeColor("--terminal-cursor-accent", "#24273a", root),
  selectionBackground: readCssThemeColor("--terminal-selection-bg", "#5b6078", root),
  black: readCssThemeColor("--terminal-black", "#494d64", root),
  red: readCssThemeColor("--terminal-red", "#ed8796", root),
  green: readCssThemeColor("--terminal-green", "#a6da95", root),
  yellow: readCssThemeColor("--terminal-yellow", "#eed49f", root),
  blue: readCssThemeColor("--terminal-blue", "#8aadf4", root),
  magenta: readCssThemeColor("--terminal-magenta", "#f5bde6", root),
  cyan: readCssThemeColor("--terminal-cyan", "#91d7e3", root),
  white: readCssThemeColor("--terminal-white", "#b8c0e0", root),
  brightBlack: readCssThemeColor("--terminal-bright-black", "#5b6078", root),
  brightRed: readCssThemeColor("--terminal-bright-red", "#ed8796", root),
  brightGreen: readCssThemeColor("--terminal-bright-green", "#a6da95", root),
  brightYellow: readCssThemeColor("--terminal-bright-yellow", "#eed49f", root),
  brightBlue: readCssThemeColor("--terminal-bright-blue", "#8aadf4", root),
  brightMagenta: readCssThemeColor("--terminal-bright-magenta", "#f5bde6", root),
  brightCyan: readCssThemeColor("--terminal-bright-cyan", "#91d7e3", root),
  brightWhite: readCssThemeColor("--terminal-bright-white", "#cad3f5", root)
})
