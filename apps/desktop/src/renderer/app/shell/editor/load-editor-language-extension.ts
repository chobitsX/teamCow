/* eslint-disable i18next/no-literal-string -- CodeMirror package names and legacy mode export keys are machine identifiers, not user-visible UI copy. */

import { StreamLanguage, type StreamParser } from "@codemirror/language"
import type { Extension } from "@codemirror/state"

import type { EditorLanguage } from "./language"

const loadLegacyLanguage = async (
  loader: () => Promise<Record<string, unknown>>,
  key: string
): Promise<Extension> => {
  const languageModule = await loader()
  return StreamLanguage.define(languageModule[key] as StreamParser<unknown>)
}

export const loadEditorLanguageExtension = async (language: EditorLanguage): Promise<Extension> => {
  switch (language) {
    case "css": {
      const { css } = await import("@codemirror/lang-css")
      return css()
    }
    case "html": {
      const { html } = await import("@codemirror/lang-html")
      return html()
    }
    case "javascript": {
      const { javascript } = await import("@codemirror/lang-javascript")
      return javascript({ jsx: true, typescript: true })
    }
    case "json": {
      const { json } = await import("@codemirror/lang-json")
      return json()
    }
    case "markdown": {
      const { markdown } = await import("@codemirror/lang-markdown")
      return markdown()
    }
    case "python": {
      const { python } = await import("@codemirror/lang-python")
      return python()
    }
    case "sql": {
      const { sql } = await import("@codemirror/lang-sql")
      return sql()
    }
    case "yaml": {
      const { yaml } = await import("@codemirror/lang-yaml")
      return yaml()
    }
    case "xml": {
      const { xml } = await import("@codemirror/lang-xml")
      return xml()
    }
    case "java": {
      const { java } = await import("@codemirror/lang-java")
      return java()
    }
    case "cpp": {
      const { cpp } = await import("@codemirror/lang-cpp")
      return cpp()
    }
    case "go": {
      const { go } = await import("@codemirror/lang-go")
      return go()
    }
    case "rust": {
      const { rust } = await import("@codemirror/lang-rust")
      return rust()
    }
    case "php": {
      const { php } = await import("@codemirror/lang-php")
      return php()
    }
    case "shell":
      return loadLegacyLanguage(
        () => import("@codemirror/legacy-modes/mode/shell"),
        "shell"
      )
    case "dockerfile":
      return loadLegacyLanguage(
        () => import("@codemirror/legacy-modes/mode/dockerfile"),
        "dockerFile"
      )
    case "toml":
      return loadLegacyLanguage(
        () => import("@codemirror/legacy-modes/mode/toml"),
        "toml"
      )
    case "csharp":
      return loadLegacyLanguage(
        () => import("@codemirror/legacy-modes/mode/clike"),
        "csharp"
      )
    default:
      return []
  }
}
