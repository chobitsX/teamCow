import { syntaxTree } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import { loadEditorLanguageExtension } from "./load-editor-language-extension"

describe("loadEditorLanguageExtension", () => {
  it.each([
    ["python", "def greet():\n    return 'hello'"],
    ["yaml", "name: teamcow\nfeatures:\n  - files"],
    ["shell", "echo \"hello\""],
    ["dockerfile", "FROM node:22\nRUN yarn install"]
  ] as const)("loads %s language support", async (language, doc) => {
    const extension = await loadEditorLanguageExtension(language)
    const state = EditorState.create({ doc, extensions: [extension] })

    expect(syntaxTree(state).length).toBeGreaterThan(0)
  })
})
