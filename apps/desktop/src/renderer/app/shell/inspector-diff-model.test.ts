import { describe, expect, it } from "vitest"
import type { ArtifactSummary, ConversationTimeline } from "@shared/index"
import { getInspectorDiffBlocks, getReviewableDiffBlockForRun } from "./inspector-diff-model"

const artifact = (
  overrides: Partial<ArtifactSummary> & Pick<ArtifactSummary, "id" | "kind" | "payload">
): ArtifactSummary => ({
  conversationId: "conversation-1",
  runId: "run-1",
  title: null,
  uri: null,
  createdAt: "2026-05-28T10:00:00.000Z",
  ...overrides
})

const timeline = (artifacts: ArtifactSummary[]): ConversationTimeline => ({
  conversationId: "conversation-1",
  messages: [],
  runs: [],
  events: [],
  artifacts
})

describe("inspector diff model", () => {
  it("preserves deleted file paths from the removed side of unified diffs", () => {
    const blocks = getInspectorDiffBlocks(timeline([
      artifact({
        id: "deleted-artifact",
        kind: "diff",
        payload: {
          diff: [
            "diff --git a/src/obsolete.ts b/src/obsolete.ts",
            "deleted file mode 100644",
            "--- a/src/obsolete.ts",
            "+++ /dev/null",
            "@@ -1 +0,0 @@",
            "-export const obsolete = true"
          ].join("\n")
        }
      })
    ]))

    expect(blocks[0]).toMatchObject({
      filePath: "src/obsolete.ts",
      displayName: "obsolete.ts"
    })
  })

  it("renders row-level diff and patch payloads from changed file rows", () => {
    const blocks = getInspectorDiffBlocks(timeline([
      artifact({
        id: "row-patches",
        kind: "changed-files",
        payload: {
          changedFiles: [
            {
              path: "src/one.ts",
              status: "modified",
              patch: "@@ -1 +1 @@\n-old\n+new"
            },
            {
              path: "src/two.ts",
              status: "added",
              diff: "@@ -0,0 +1 @@\n+export const two = true"
            }
          ]
        }
      })
    ]))

    expect(blocks).toHaveLength(2)
    expect(blocks[0].lines.map((line) => line.content)).toContain("+new")
    expect(blocks[1].lines.map((line) => line.content)).toContain("+export const two = true")
  })

  it("chooses the most reviewable same-run block before lower fidelity summaries", () => {
    const blocks = getInspectorDiffBlocks(timeline([
      artifact({
        id: "summary-first",
        kind: "summary",
        payload: {
          diffSummary: "A summary came first"
        }
      }),
      artifact({
        id: "changed-files-second",
        kind: "changed-files",
        payload: {
          changedFiles: [{ path: "src/summary-only.ts", status: "modified" }]
        }
      }),
      artifact({
        id: "diff-third",
        kind: "diff",
        payload: {
          diff: "diff --git a/src/full.ts b/src/full.ts\n--- a/src/full.ts\n+++ b/src/full.ts\n@@ -1 +1 @@\n-old\n+new"
        }
      })
    ]))

    expect(getReviewableDiffBlockForRun(blocks, "run-1")?.artifactId).toBe("diff-third")
  })

  it("does not treat generic summary payloads as diff review targets", () => {
    const blocks = getInspectorDiffBlocks(timeline([
      artifact({
        id: "plain-summary",
        kind: "summary",
        payload: {
          summary: "Provider finished successfully",
          preview: "No patch content here"
        }
      })
    ]))

    expect(blocks).toEqual([])
  })

  it("keeps parsed diff headers authoritative when row order disagrees with patch order", () => {
    const blocks = getInspectorDiffBlocks(timeline([
      artifact({
        id: "misordered-rows",
        kind: "diff",
        payload: {
          diff: [
            "diff --git a/src/first.ts b/src/first.ts",
            "--- a/src/first.ts",
            "+++ b/src/first.ts",
            "@@ -1 +1 @@",
            "-one",
            "+two",
            "diff --git a/src/second.ts b/src/second.ts",
            "--- a/src/second.ts",
            "+++ b/src/second.ts",
            "@@ -1 +1 @@",
            "-three",
            "+four"
          ].join("\n"),
          files: [
            { path: "src/second.ts", status: "modified" },
            { path: "src/first.ts", status: "modified" }
          ]
        }
      })
    ]))

    expect(blocks.map((block) => block.filePath)).toEqual(["src/first.ts", "src/second.ts"])
  })

  it("caps generated blocks for oversized diffs before rendering every file chunk", () => {
    const diff = Array.from({ length: 80 }, (_, index) => [
      `diff --git a/src/file-${index}.ts b/src/file-${index}.ts`,
      `--- a/src/file-${index}.ts`,
      `+++ b/src/file-${index}.ts`,
      "@@ -1 +1 @@",
      "-old",
      "+new"
    ].join("\n")).join("\n")

    const blocks = getInspectorDiffBlocks(timeline([
      artifact({
        id: "large-diff",
        kind: "diff",
        payload: { diff }
      })
    ]))

    expect(blocks.length).toBeLessThan(80)
    expect(blocks.at(-1)?.truncatedLineCount).toBeGreaterThan(0)
  })
})
