/* eslint-disable i18next/no-literal-string -- Theme tokens and color values are non-user-visible styling data. */
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import type { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { tags } from "@lezer/highlight"

export type EditorSyntaxTheme = "dark" | "light"

type EditorThemeChrome = {
  background: string
  foreground: string
  gutterBackground: string
  gutterForeground: string
  activeLine: string
  selection: string
  cursor: string
  border: string
  search: string
  searchActive: string
}

type EditorThemeSyntax = {
  plainText: string
  comment: string
  keyword: string
  string: string
  number: string
  functionCall: string
  variableName: string
  typeName: string
  className: string
  constant: string
  regexp: string
  tagName: string
  attributeName: string
  invalid: string
}

export type EditorThemePalette = {
  chrome: EditorThemeChrome
  syntax: EditorThemeSyntax
}

export const editorThemePalettes: Record<EditorSyntaxTheme, EditorThemePalette> = {
  dark: {
    chrome: {
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
    },
    syntax: {
      plainText: "#cad3f5",
      comment: "#6e738d",
      keyword: "#c6a0f6",
      string: "#a6da95",
      number: "#eed49f",
      functionCall: "#8aadf4",
      variableName: "#cad3f5",
      typeName: "#91d7e3",
      className: "#eed49f",
      constant: "#f5bde6",
      regexp: "#f5a97f",
      tagName: "#ed8796",
      attributeName: "#eed49f",
      invalid: "#ed8796"
    }
  },
  light: {
    chrome: {
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
    },
    syntax: {
      plainText: "#171717",
      comment: "#717171",
      keyword: "#7c3aed",
      string: "#2f7d32",
      number: "#b8791f",
      functionCall: "#2f6fbe",
      variableName: "#171717",
      typeName: "#147d8c",
      className: "#b8791f",
      constant: "#8a4fcf",
      regexp: "#a7652f",
      tagName: "#cc3333",
      attributeName: "#b8791f",
      invalid: "#cc3333"
    }
  }
}

const createChromeTheme = (palette: EditorThemePalette, dark: boolean): Extension =>
  EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: palette.chrome.background,
        color: palette.chrome.foreground
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)"
      },
      ".cm-content": {
        caretColor: palette.chrome.cursor
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: palette.chrome.cursor
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: palette.chrome.selection
      },
      ".cm-gutters": {
        backgroundColor: palette.chrome.gutterBackground,
        color: palette.chrome.gutterForeground,
        borderRightColor: palette.chrome.border
      },
      ".cm-activeLine": {
        backgroundColor: palette.chrome.activeLine
      },
      ".cm-activeLineGutter": {
        backgroundColor: palette.chrome.activeLine,
        color: palette.chrome.foreground
      },
      ".cm-searchMatch": {
        backgroundColor: palette.chrome.search,
        outline: "1px solid transparent"
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: palette.chrome.searchActive
      },
      ".cm-panels": {
        backgroundColor: palette.chrome.gutterBackground,
        color: palette.chrome.foreground,
        borderColor: palette.chrome.border
      }
    },
    { dark }
  )

const createHighlightStyle = (palette: EditorThemePalette): Extension =>
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.comment, color: palette.syntax.comment, fontStyle: "italic" },
      { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: palette.syntax.keyword },
      { tag: [tags.string, tags.special(tags.string)], color: palette.syntax.string },
      { tag: [tags.number, tags.integer, tags.float, tags.bool], color: palette.syntax.number },
      { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: palette.syntax.functionCall },
      { tag: [tags.variableName, tags.propertyName], color: palette.syntax.variableName },
      { tag: [tags.typeName, tags.namespace], color: palette.syntax.typeName },
      { tag: tags.className, color: palette.syntax.className },
      { tag: [tags.constant(tags.variableName), tags.standard(tags.variableName)], color: palette.syntax.constant },
      { tag: tags.regexp, color: palette.syntax.regexp },
      { tag: tags.tagName, color: palette.syntax.tagName },
      { tag: tags.attributeName, color: palette.syntax.attributeName },
      { tag: tags.invalid, color: palette.syntax.invalid }
    ]),
    { fallback: true }
  )

export const createEditorSyntaxThemeExtension = (theme: EditorSyntaxTheme): Extension => {
  const palette = editorThemePalettes[theme]

  return [createChromeTheme(palette, theme === "dark"), createHighlightStyle(palette)]
}
