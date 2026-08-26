import { describe, expect, it } from "vitest"

import { createEditorSyntaxThemeExtension, editorThemePalettes } from "../editor-syntax-theme"

describe("editor-syntax-theme", () => {
  it("defines a Macchiato-inspired dark editor palette", () => {
    expect(editorThemePalettes.dark.chrome).toEqual({
      background: "#181825",
      foreground: "#cad3f5",
      gutterBackground: "#1e2030",
      gutterForeground: "#6e738d",
      activeLine: "rgba(138, 173, 244, 0.10)",
      selection: "rgba(138, 173, 244, 0.24)",
      cursor: "#f4dbd6",
      border: "#363a4f",
      search: "rgba(198, 160, 246, 0.24)",
      searchActive: "rgba(198, 160, 246, 0.42)"
    })
    expect(editorThemePalettes.dark.syntax.keyword).toBe("#c6a0f6")
    expect(editorThemePalettes.dark.syntax.string).toBe("#a6da95")
    expect(editorThemePalettes.dark.syntax.functionCall).toBe("#8aadf4")
  })

  it("defines a Superset-Light-inspired editor palette", () => {
    expect(editorThemePalettes.light.chrome).toEqual({
      background: "#ffffff",
      foreground: "#171717",
      gutterBackground: "#f7f7f7",
      gutterForeground: "#8a8a8a",
      activeLine: "rgba(47, 111, 190, 0.08)",
      selection: "rgba(47, 111, 190, 0.18)",
      cursor: "#171717",
      border: "rgba(23, 23, 23, 0.14)",
      search: "rgba(255, 211, 61, 0.35)",
      searchActive: "rgba(255, 150, 50, 0.55)"
    })
    expect(editorThemePalettes.light.syntax.keyword).toBe("#7c3aed")
    expect(editorThemePalettes.light.syntax.string).toBe("#2f7d32")
    expect(editorThemePalettes.light.syntax.functionCall).toBe("#2f6fbe")
  })

  it("returns CodeMirror extensions for both themes", () => {
    expect(Array.isArray(createEditorSyntaxThemeExtension("dark"))).toBe(true)
    expect(Array.isArray(createEditorSyntaxThemeExtension("light"))).toBe(true)
  })
})
