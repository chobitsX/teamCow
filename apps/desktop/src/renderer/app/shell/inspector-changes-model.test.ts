import { describe, expect, it } from "vitest"
import type { ConversationChangesSnapshot } from "@shared/index"
import {
  getChangeRowKey,
  getChangesViewModel,
  parseConversationChangePatch,
  splitChangeDisplayPath
} from "./inspector-changes-model"

const snapshot: ConversationChangesSnapshot = {
  conversationId: "conversation-1",
  worktreeId: "worktree-1",
  worktreeRootPath: "/tmp/teamcow",
  revision: "revision-1",
  checkedAt: "2026-07-10T08:00:00.000Z",
  unstaged: [
    {
      path: "src/dual.ts",
      oldPath: null,
      status: "modified",
      additions: 3,
      deletions: 1,
      isBinary: false
    },
    {
      path: "文档/新 名称.md",
      oldPath: "文档/旧 名称.md",
      status: "renamed",
      additions: 2,
      deletions: 2,
      isBinary: false
    }
  ],
  staged: [
    {
      path: "src/dual.ts",
      oldPath: null,
      status: "modified",
      additions: 5,
      deletions: 0,
      isBinary: false
    }
  ]
}

describe("inspector changes model", () => {
  it("keeps staged and unstaged identities distinct while counting both rows", () => {
    const model = getChangesViewModel(snapshot)

    expect(model.unstaged.map((row) => row.key)).toEqual([
      "unstaged:src/dual.ts",
      "unstaged:文档/新 名称.md"
    ])
    expect(model.staged.map((row) => row.key)).toEqual(["staged:src/dual.ts"])
    expect(getChangeRowKey("unstaged", "src/dual.ts")).not.toBe(
      getChangeRowKey("staged", "src/dual.ts")
    )
    expect(model.summary).toEqual({
      rowCount: 3,
      additions: 10,
      deletions: 3
    })
  })

  it("splits display paths without losing Unicode, spaces, or rename origins", () => {
    expect(splitChangeDisplayPath("文档/新 名称.md")).toEqual({
      directory: "文档/",
      basename: "新 名称.md"
    })

    const renamed = getChangesViewModel(snapshot).unstaged[1]
    expect(renamed).toMatchObject({
      directory: "文档/",
      basename: "新 名称.md",
      oldPath: "文档/旧 名称.md",
      oldDirectory: "文档/",
      oldBasename: "旧 名称.md"
    })
  })

  it("classifies unified patch headers and metadata before +/- content", () => {
    const patch = [
      "diff --git a/src/雪.ts b/src/雪.ts",
      "index 1234567..89abcde 100644",
      "rename from src/old name.ts",
      "rename to src/雪.ts",
      "--- a/src/old name.ts",
      "+++ b/src/雪.ts",
      "@@ -1,2 +1,2 @@",
      " context",
      "-old value",
      "+new value",
      "\\ No newline at end of file"
    ].join("\n")

    const lines = parseConversationChangePatch(patch)

    expect(lines.map((line) => line.kind)).toEqual([
      "meta",
      "meta",
      "meta",
      "meta",
      "meta",
      "meta",
      "hunk",
      "context",
      "removed",
      "added",
      "meta"
    ])
    expect(lines[5]?.content).toBe("+++ b/src/雪.ts")
    expect(lines[9]?.content).toBe("+new value")
    expect(new Set(lines.map((line) => line.key)).size).toBe(lines.length)
  })

  it("treats copy/mode/binary patch markers as metadata", () => {
    const lines = parseConversationChangePatch([
      "---",
      "+++\tb/src/new.ts",
      "old mode 100644",
      "new mode 100755",
      "similarity index 100%",
      "copy from src/a.ts",
      "copy to src/b.ts",
      "Binary files a/logo.png and b/logo.png differ",
      "GIT binary patch"
    ].join("\n"))

    expect(lines.every((line) => line.kind === "meta")).toBe(true)
  })
})
