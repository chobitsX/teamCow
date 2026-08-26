import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const styles = readFileSync(resolve(process.cwd(), "src/renderer/styles.css"), "utf8")

const extractRuleBody = (selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\n\\}`))

  if (!match?.groups?.body) {
    throw new Error(`CSS rule ${selector} was not found`)
  }

  return match.groups.body
}

describe("editor workspace chat layout", () => {
  it("uses a shared tab strip instead of splitting the chat and editor horizontally", () => {
    const workspace = extractRuleBody(".editor-workspace")
    const chatPane = extractRuleBody(".editor-workspace-chat")

    expect(workspace).toContain("display: flex;")
    expect(workspace).toContain("flex-direction: column;")
    expect(workspace).not.toContain("grid-template-columns")
    expect(chatPane).toContain("display: flex;")
    expect(chatPane).toContain("flex-direction: column;")
    expect(chatPane).toContain("height: 100%;")
    expect(chatPane).toContain("overflow: hidden;")
    expect(extractRuleBody(".editor-workspace-chat[hidden]")).toContain("display: none;")
    expect(extractRuleBody(".editor-workspace-editor[hidden]")).toContain("display: none;")
  })

  it("lets the merge view content grow inside its scrolling viewport", () => {
    const mergeView = extractRuleBody(".change-diff-code-view .cm-mergeView")
    const mergeEditors = extractRuleBody(".change-diff-code-view .cm-mergeViewEditors")
    const mergeEditor = extractRuleBody(".change-diff-code-view .cm-mergeViewEditor")

    expect(mergeView).toContain("overflow: auto;")
    expect(mergeEditors).toContain("min-height: 100%;")
    expect(mergeEditors).not.toMatch(/(?:^|\n)\s*height: 100%;/)
    expect(mergeEditor).not.toMatch(/(?:^|\n)\s*height: 100%;/)
  })
})
