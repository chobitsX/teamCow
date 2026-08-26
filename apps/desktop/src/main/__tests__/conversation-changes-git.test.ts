// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  buildConversationChangeGroups,
  countConversationChangeTextLines,
  parseGitNumstat,
  parseGitPorcelainStatus,
  truncateUnifiedPatch
} from "../conversation-changes-git"

describe("conversation changes git normalization", () => {
  it("counts empty, LF, CRLF, and unterminated text without inventing lines", () => {
    expect(countConversationChangeTextLines(Buffer.from(""))).toBe(0)
    expect(countConversationChangeTextLines(Buffer.from("alpha\nbeta\n"))).toBe(2)
    expect(countConversationChangeTextLines(Buffer.from("alpha\r\nbeta\r\n"))).toBe(2)
    expect(countConversationChangeTextLines(Buffer.from("alpha\nbeta"))).toBe(2)
  })

  it("parses ordinary, binary, rename, and copy numstat records", () => {
    const stats = parseGitNumstat([
      "2\t1\tsrc/a.ts",
      "-\t-\tassets/logo.png",
      "4\t3\t",
      "src/old-name.ts",
      "src/new-name.ts",
      "1\t0\t",
      "src/copy-source.ts",
      "src/copy-target.ts",
      ""
    ].join("\0"))

    expect(stats).toEqual(new Map([
      ["src/a.ts", { additions: 2, deletions: 1, isBinary: false }],
      ["assets/logo.png", { additions: 0, deletions: 0, isBinary: true }],
      ["src/old-name.ts", { additions: 4, deletions: 3, isBinary: false }],
      ["src/new-name.ts", { additions: 4, deletions: 3, isBinary: false }],
      ["src/copy-source.ts", { additions: 1, deletions: 0, isBinary: false }],
      ["src/copy-target.ts", { additions: 1, deletions: 0, isBinary: false }]
    ]))
  })

  it("normalizes NUL-delimited porcelain without changing special path bytes", () => {
    const renamedPath = "docs/新 target -> name\t.md"
    const oldPath = "docs/旧 source\nname.md"
    const trailingSpacePath = "docs/trailing .md "
    const parsed = parseGitPorcelainStatus([
      `R  ${renamedPath}`,
      oldPath,
      ` M ${trailingSpacePath}`,
      "UU src/conflicted.ts",
      "?? src/untracked.ts",
      ""
    ].join("\0"))

    expect(parsed).toEqual({
      status: "ok",
      files: [
        {
          path: renamedPath,
          oldPath,
          indexStatus: "R",
          worktreeStatus: null,
          displayStatus: "renamed"
        },
        {
          path: trailingSpacePath,
          oldPath: null,
          indexStatus: null,
          worktreeStatus: "M",
          displayStatus: "modified"
        },
        {
          path: "src/conflicted.ts",
          oldPath: null,
          indexStatus: "U",
          worktreeStatus: "U",
          displayStatus: "conflicted"
        },
        {
          path: "src/untracked.ts",
          oldPath: null,
          indexStatus: "?",
          worktreeStatus: "?",
          displayStatus: "untracked"
        }
      ]
    })
  })

  it("rejects malformed porcelain records without throwing", () => {
    expect(parseGitPorcelainStatus("not porcelain\0")).toEqual({
      status: "error",
      invalidRecord: "not porcelain"
    })
  })

  it("accepts type-change porcelain codes and maps them to unknown", () => {
    const parsed = parseGitPorcelainStatus([
      "T  src/index-type-change",
      " T src/worktree-type-change",
      ""
    ].join("\0"))

    expect(parsed).toEqual({
      status: "ok",
      files: [
        {
          path: "src/index-type-change",
          oldPath: null,
          indexStatus: "T",
          worktreeStatus: null,
          displayStatus: "unknown"
        },
        {
          path: "src/worktree-type-change",
          oldPath: null,
          indexStatus: null,
          worktreeStatus: "T",
          displayStatus: "unknown"
        }
      ]
    })

    if (parsed.status !== "ok") {
      throw new Error("expected type-change status to parse")
    }
    expect(buildConversationChangeGroups({
      statusFiles: parsed.files,
      stagedStats: new Map(),
      unstagedStats: new Map()
    })).toMatchObject({
      staged: [{ path: "src/index-type-change", status: "unknown" }],
      unstaged: [{ path: "src/worktree-type-change", status: "unknown" }]
    })
  })

  it("builds independent staged and unstaged rows with conflict and copy mapping", () => {
    const groups = buildConversationChangeGroups({
      statusFiles: [
        {
          path: "src/both.ts",
          oldPath: null,
          indexStatus: "M",
          worktreeStatus: "M",
          displayStatus: "modified"
        },
        {
          path: "src/copied.ts",
          oldPath: "src/original.ts",
          indexStatus: "C",
          worktreeStatus: null,
          displayStatus: "copied"
        },
        {
          path: "src/conflicted.ts",
          oldPath: null,
          indexStatus: "U",
          worktreeStatus: "U",
          displayStatus: "conflicted"
        },
        {
          path: "src/untracked.ts",
          oldPath: null,
          indexStatus: "?",
          worktreeStatus: "?",
          displayStatus: "untracked"
        }
      ],
      stagedStats: new Map([
        ["src/both.ts", { additions: 1, deletions: 0, isBinary: false }],
        ["src/copied.ts", { additions: 3, deletions: 0, isBinary: false }]
      ]),
      unstagedStats: new Map([
        ["src/both.ts", { additions: 2, deletions: 1, isBinary: false }]
      ])
    })

    expect(groups).toEqual({
      staged: [
        {
          path: "src/both.ts",
          oldPath: null,
          status: "modified",
          additions: 1,
          deletions: 0,
          isBinary: false
        },
        {
          path: "src/copied.ts",
          oldPath: "src/original.ts",
          status: "copied",
          additions: 3,
          deletions: 0,
          isBinary: false
        },
        {
          path: "src/conflicted.ts",
          oldPath: null,
          status: "conflicted",
          additions: 0,
          deletions: 0,
          isBinary: false
        }
      ],
      unstaged: [
        {
          path: "src/both.ts",
          oldPath: null,
          status: "modified",
          additions: 2,
          deletions: 1,
          isBinary: false
        },
        {
          path: "src/conflicted.ts",
          oldPath: null,
          status: "conflicted",
          additions: 0,
          deletions: 0,
          isBinary: false
        },
        {
          path: "src/untracked.ts",
          oldPath: null,
          status: "untracked",
          additions: 0,
          deletions: 0,
          isBinary: false
        }
      ]
    })
  })

  it("retains rename origins only in the area whose status code is rename or copy", () => {
    expect(buildConversationChangeGroups({
      statusFiles: [
        {
          path: "src/renamed-then-modified.ts",
          oldPath: "src/rename-origin.ts",
          indexStatus: "R",
          worktreeStatus: "M",
          displayStatus: "renamed"
        },
        {
          path: "src/modified-then-renamed.ts",
          oldPath: "src/worktree-origin.ts",
          indexStatus: "M",
          worktreeStatus: "R",
          displayStatus: "renamed"
        }
      ],
      stagedStats: new Map(),
      unstagedStats: new Map()
    })).toMatchObject({
      staged: [
        { path: "src/renamed-then-modified.ts", oldPath: "src/rename-origin.ts", status: "renamed" },
        { path: "src/modified-then-renamed.ts", oldPath: null, status: "modified" }
      ],
      unstaged: [
        { path: "src/renamed-then-modified.ts", oldPath: null, status: "modified" },
        { path: "src/modified-then-renamed.ts", oldPath: "src/worktree-origin.ts", status: "renamed" }
      ]
    })
  })

  it("truncates only at complete UTF-8 line boundaries", () => {
    const patch = "first\n第二行\nthird\n"
    const maxBytes = Buffer.byteLength("first\n第二行\n", "utf8")

    expect(truncateUnifiedPatch(patch, maxBytes)).toEqual({
      patch: "first\n第二行",
      truncatedLineCount: 2
    })
    expect(Buffer.byteLength(truncateUnifiedPatch(patch, maxBytes).patch, "utf8")).toBeLessThanOrEqual(maxBytes)
  })
})
