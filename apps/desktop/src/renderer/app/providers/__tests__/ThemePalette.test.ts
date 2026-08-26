import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const styles = readFileSync(resolve(process.cwd(), "src/renderer/styles.css"), "utf8")

const parseVariables = (css: string) =>
  new Map(
    Array.from(css.matchAll(/(--[\w-]+):\s*([^;]+);/g), ([, name, value]) => [
      name,
      value.trim()
    ])
  )

const extractBlock = (selector: RegExp) => {
  const match = styles.match(selector)

  if (!match?.groups?.body) {
    throw new Error("Theme block was not found in styles.css")
  }

  return match.groups.body
}

const darkVariables = new Map([
  ...parseVariables(extractBlock(/:root\s*\{(?<body>[\s\S]*?)\n\}/)),
  ...parseVariables(extractBlock(/:root,\s*:root\[data-theme="dark"\]\s*\{(?<body>[\s\S]*?)\n\}/))
])

const lightVariables = new Map([
  ...darkVariables,
  ...parseVariables(extractBlock(/:root\[data-theme="light"\]\s*\{(?<body>[\s\S]*?)\n\}/))
])

const resolveVariableFrom = (source: Map<string, string>, name: string, seen = new Set<string>()): string => {
  if (seen.has(name)) {
    throw new Error(`Circular CSS variable reference: ${Array.from(seen).join(" -> ")} -> ${name}`)
  }

  const value = source.get(name)

  if (!value) {
    throw new Error(`CSS variable ${name} was not found`)
  }

  const reference = value.match(/^var\((--[\w-]+)\)$/)

  if (reference) {
    seen.add(name)
    return resolveVariableFrom(source, reference[1], seen)
  }

  return value.toUpperCase()
}

const resolveVariable = (name: string, seen = new Set<string>()): string =>
  resolveVariableFrom(darkVariables, name, seen)

describe("dark theme palette", () => {
  it("uses the Superset-inspired Catppuccin Macchiato workbench tokens", () => {
    const expectedTokens = {
      "--bg-canvas": "#24273A",
      "--bg-surface": "#1E2030",
      "--bg-raised": "#2B2F46",
      "--bg-inset": "#181825",
      "--border-default": "#363A4F",
      "--accent": "#8AADF4",
      "--accent-hover": "#9BBCF8",
      "--text-primary": "#CAD3F5",
      "--text-secondary": "#A5ADCB",
      "--text-muted": "#6E738D",
      "--status-success": "#A6DA95",
      "--status-warning": "#EED49F",
      "--status-error": "#ED8796",
      "--status-info": "#8AADF4"
    }

    expect(
      Object.fromEntries(
        Object.keys(expectedTokens).map((name) => [name, resolveVariable(name)])
      )
    ).toEqual(expectedTokens)
  })

  it("uses Superset Light neutral workbench tokens in light theme", () => {
    const expectedTokens = {
      "--bg-canvas": "#FFFFFF",
      "--bg-surface": "#F7F7F7",
      "--bg-raised": "#FFFFFF",
      "--bg-inset": "#EFEEEC",
      "--text-primary": "#171717",
      "--text-secondary": "#4F4F4F",
      "--text-muted": "#8A8A8A",
      "--border-subtle": "RGBA(23, 23, 23, 0.08)",
      "--border-default": "RGBA(23, 23, 23, 0.14)",
      "--border-strong": "RGBA(23, 23, 23, 0.22)",
      "--surface-hover": "RGBA(23, 23, 23, 0.045)",
      "--surface-active": "RGBA(23, 23, 23, 0.075)",
      "--terminal-bg": "#FFFFFF"
    }

    expect(
      Object.fromEntries(
        Object.keys(expectedTokens).map((name) => [name, resolveVariableFrom(lightVariables, name)])
      )
    ).toEqual(expectedTokens)
  })

  it("defines complete xterm terminal palettes for both themes", () => {
    const expectedDarkTokens = {
      "--terminal-bg": "#24273A",
      "--terminal-fg": "#CAD3F5",
      "--terminal-cursor": "#F4DBD6",
      "--terminal-cursor-accent": "#24273A",
      "--terminal-selection-bg": "#5B6078",
      "--terminal-black": "#494D64",
      "--terminal-red": "#ED8796",
      "--terminal-green": "#A6DA95",
      "--terminal-yellow": "#EED49F",
      "--terminal-blue": "#8AADF4",
      "--terminal-magenta": "#F5BDE6",
      "--terminal-cyan": "#91D7E3",
      "--terminal-white": "#B8C0E0",
      "--terminal-bright-black": "#5B6078",
      "--terminal-bright-red": "#ED8796",
      "--terminal-bright-green": "#A6DA95",
      "--terminal-bright-yellow": "#EED49F",
      "--terminal-bright-blue": "#8AADF4",
      "--terminal-bright-magenta": "#F5BDE6",
      "--terminal-bright-cyan": "#91D7E3",
      "--terminal-bright-white": "#CAD3F5"
    }

    const expectedLightTokens = {
      "--terminal-bg": "#FFFFFF",
      "--terminal-fg": "#000000",
      "--terminal-cursor": "#000000",
      "--terminal-cursor-accent": "#FFFFFF",
      "--terminal-selection-bg": "#ADD6FF",
      "--terminal-black": "#2E3436",
      "--terminal-red": "#CC0000",
      "--terminal-green": "#4E9A06",
      "--terminal-yellow": "#C4A000",
      "--terminal-blue": "#3465A4",
      "--terminal-magenta": "#75507B",
      "--terminal-cyan": "#06989A",
      "--terminal-white": "#555753",
      "--terminal-bright-black": "#555753",
      "--terminal-bright-red": "#EF2929",
      "--terminal-bright-green": "#8AE234",
      "--terminal-bright-yellow": "#FCE94F",
      "--terminal-bright-blue": "#729FCF",
      "--terminal-bright-magenta": "#AD7FA8",
      "--terminal-bright-cyan": "#34E2E2",
      "--terminal-bright-white": "#2E3436"
    }

    expect(
      Object.fromEntries(
        Object.keys(expectedDarkTokens).map((name) => [name, resolveVariableFrom(darkVariables, name)])
      )
    ).toEqual(expectedDarkTokens)

    expect(
      Object.fromEntries(
        Object.keys(expectedLightTokens).map((name) => [name, resolveVariableFrom(lightVariables, name)])
      )
    ).toEqual(expectedLightTokens)
  })

  it("uses distinct clipped text gradients for provider tags", () => {
    const expectedDarkTokens = {
      "--provider-codex": "#F5BDE6",
      "--provider-codex-gradient": "LINEAR-GRADIENT(90DEG, #F5BDE6 0%, #C6A0F6 100%)",
      "--provider-codex-bg": "RGBA(245, 189, 230, 0.1)",
      "--provider-codex-border": "RGBA(198, 160, 246, 0.3)",
      "--provider-claude": "#F5A97F",
      "--provider-claude-gradient": "LINEAR-GRADIENT(90DEG, #F5A97F 0%, #EED49F 100%)",
      "--provider-claude-bg": "RGBA(245, 169, 127, 0.1)",
      "--provider-claude-border": "RGBA(238, 212, 159, 0.3)",
      "--provider-opencode": "#8BD5CA",
      "--provider-opencode-gradient": "LINEAR-GRADIENT(90DEG, #A6DA95 0%, #91D7E3 100%)",
      "--provider-opencode-bg": "RGBA(139, 213, 202, 0.1)",
      "--provider-opencode-border": "RGBA(145, 215, 227, 0.3)"
    }

    const expectedLightTokens = {
      "--provider-codex": "#8A4FCF",
      "--provider-codex-gradient": "LINEAR-GRADIENT(90DEG, #B63E91 0%, #6F5BC7 100%)",
      "--provider-codex-bg": "RGBA(138, 79, 207, 0.07)",
      "--provider-codex-border": "RGBA(111, 91, 199, 0.22)",
      "--provider-claude": "#A7652F",
      "--provider-claude-gradient": "LINEAR-GRADIENT(90DEG, #B8791F 0%, #A7652F 100%)",
      "--provider-claude-bg": "RGBA(167, 101, 47, 0.08)",
      "--provider-claude-border": "RGBA(167, 101, 47, 0.22)",
      "--provider-opencode": "#287A5D",
      "--provider-opencode-gradient": "LINEAR-GRADIENT(90DEG, #2F7D32 0%, #147D8C 100%)",
      "--provider-opencode-bg": "RGBA(40, 122, 93, 0.08)",
      "--provider-opencode-border": "RGBA(20, 125, 140, 0.22)"
    }

    expect(
      Object.fromEntries(
        Object.keys(expectedDarkTokens).map((name) => [name, resolveVariableFrom(darkVariables, name)])
      )
    ).toEqual(expectedDarkTokens)

    expect(
      Object.fromEntries(
        Object.keys(expectedLightTokens).map((name) => [name, resolveVariableFrom(lightVariables, name)])
      )
    ).toEqual(expectedLightTokens)

    expect(styles).toContain(".ttag.provider-tag.codex .provider-tag-label")
    expect(styles).toContain(".ttag.provider-tag.claude .provider-tag-label")
    expect(styles).toContain(".ttag.provider-tag.opencode .provider-tag-label")
    expect(styles).toContain("-webkit-background-clip: text")
    expect(styles).toContain("background-clip: text")
  })

  it("does not keep old hard-coded blue accent shadows", () => {
    expect(styles).not.toContain("rgba(91, 124, 250")
    expect(styles).not.toContain("#5b7cfa")
    expect(styles).not.toContain("#7592ff")
  })
})
