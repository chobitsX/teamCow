import { describe, expect, it } from "vitest"
import {
  closeConversationFileTab,
  createChangeDiffEditorTabId,
  createEmptyConversationFileEditorState,
  createEditorTabId,
  markConversationFileTabDirty,
  openConversationChangeDiffTab,
  openConversationFileTab,
  pinConversationFileTab,
  resetConversationFileTabsForConversation
} from "./conversation-file-editor-model"

describe("conversation file editor model", () => {
  it("opens the first file as a preview tab", () => {
    const state = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })

    expect(state.activeTabId).toBe(createEditorTabId("conversation-1", "README.md"))
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0]).toMatchObject({ filePath: "README.md", pinned: false, dirty: false })
  })

  it("replaces a clean preview tab on single-click", () => {
    const first = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })
    const next = openConversationFileTab(first, {
      conversationId: "conversation-1",
      filePath: "src/index.ts",
      mode: "preview"
    })

    expect(next.tabs).toHaveLength(1)
    expect(next.tabs[0]).toMatchObject({ filePath: "src/index.ts", pinned: false })
  })

  it("keeps a clean preview when opening a different file in pinned mode", () => {
    const first = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })
    const next = openConversationFileTab(first, {
      conversationId: "conversation-1",
      filePath: "src/index.ts",
      mode: "pinned"
    })

    expect(next.tabs).toHaveLength(2)
    expect(next.tabs.find((tab) => tab.filePath === "README.md")).toMatchObject({
      pinned: false,
      dirty: false
    })
    expect(next.tabs.find((tab) => tab.filePath === "src/index.ts")).toMatchObject({
      pinned: true,
      dirty: false
    })
  })

  it("auto-pins a dirty preview before opening another preview", () => {
    const first = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })
    const dirty = markConversationFileTabDirty(first, createEditorTabId("conversation-1", "README.md"), true)
    const next = openConversationFileTab(dirty, {
      conversationId: "conversation-1",
      filePath: "src/index.ts",
      mode: "preview"
    })

    expect(next.tabs).toHaveLength(2)
    expect(next.tabs.find((tab) => tab.filePath === "README.md")).toMatchObject({ pinned: true, dirty: true })
    expect(next.tabs.find((tab) => tab.filePath === "src/index.ts")).toMatchObject({ pinned: false, dirty: false })
  })

  it("replaces a clean preview and pins a dirty preview in mixed state", () => {
    const state = {
      tabs: [
        {
          id: createEditorTabId("conversation-1", "README.md"),
          conversationId: "conversation-1",
          filePath: "README.md",
          title: "README.md",
          pinned: false,
          dirty: false
        },
        {
          id: createEditorTabId("conversation-1", "notes.md"),
          conversationId: "conversation-1",
          filePath: "notes.md",
          title: "notes.md",
          pinned: false,
          dirty: true
        }
      ],
      activeTabId: createEditorTabId("conversation-1", "README.md")
    }

    const next = openConversationFileTab(state, {
      conversationId: "conversation-1",
      filePath: "src/index.ts",
      mode: "preview"
    })

    expect(next.tabs).toHaveLength(2)
    expect(next.tabs.find((tab) => tab.filePath === "src/index.ts")).toMatchObject({
      pinned: false,
      dirty: false
    })
    expect(next.tabs.find((tab) => tab.filePath === "notes.md")).toMatchObject({
      pinned: true,
      dirty: true
    })
    expect(next.tabs.find((tab) => tab.filePath === "README.md")).toBeUndefined()
  })

  it("pins a tab explicitly and prevents duplicate tabs", () => {
    const opened = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })
    const pinned = pinConversationFileTab(opened, createEditorTabId("conversation-1", "README.md"))
    const reopened = openConversationFileTab(pinned, {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "pinned"
    })

    expect(reopened.tabs).toHaveLength(1)
    expect(reopened.tabs[0]).toMatchObject({ pinned: true })
  })

  it("keeps raw, staged, and unstaged resources independent for the same path", () => {
    const raw = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "src/index.ts",
      mode: "pinned"
    })
    const staged = openConversationChangeDiffTab(raw, {
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      revision: "revision-1",
      area: "staged",
      filePath: "src/index.ts",
      mode: "pinned"
    })
    const unstaged = openConversationChangeDiffTab(staged, {
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      revision: "revision-1",
      area: "unstaged",
      filePath: "src/index.ts",
      mode: "pinned"
    })

    expect(unstaged.tabs).toHaveLength(3)
    expect(unstaged.tabs.map((tab) => tab.resourceType ?? "file")).toEqual([
      "file",
      "change-diff",
      "change-diff"
    ])
    expect(unstaged.tabs.filter((tab) => tab.resourceType === "change-diff").map((tab) => tab.area)).toEqual([
      "staged",
      "unstaged"
    ])
  })

  it("uses collision-safe identities for raw paths that resemble diff resources", () => {
    const rawPath = "change-diff:worktree-1:revision-1:staged:src/index.ts"
    const rawId = createEditorTabId("conversation-1", rawPath)
    const diffId = createChangeDiffEditorTabId(
      "conversation-1",
      "worktree-1",
      "revision-1",
      "staged",
      "src/index.ts"
    )

    expect(rawId).not.toBe(diffId)
    expect(JSON.parse(diffId)).toEqual([
      "change-diff",
      "conversation-1",
      "worktree-1",
      "revision-1",
      "staged",
      "src/index.ts"
    ])
  })

  it("keeps a pinned fixed-revision diff when the active conversation changes", () => {
    const state = openConversationChangeDiffTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      revision: "revision-1",
      area: "unstaged",
      filePath: "src/index.ts",
      mode: "pinned"
    })

    const next = resetConversationFileTabsForConversation(state, "conversation-2")

    expect(next.tabs).toEqual([
      expect.objectContaining({
        conversationId: "conversation-1",
        revision: "revision-1",
        pinned: true,
        resourceType: "change-diff"
      })
    ])
    expect(next.activeTabId).toBe(state.activeTabId)
  })

  it("closes clean tabs and keeps dirty tabs blocked", () => {
    const opened = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })
    const dirty = markConversationFileTabDirty(opened, createEditorTabId("conversation-1", "README.md"), true)

    expect(closeConversationFileTab(dirty, createEditorTabId("conversation-1", "README.md"))).toMatchObject({
      status: "blocked-dirty"
    })
    expect(closeConversationFileTab(opened, createEditorTabId("conversation-1", "README.md"))).toMatchObject({
      status: "closed",
      state: { tabs: [], activeTabId: null }
    })
  })

  it("keeps dirty tabs and clears clean tabs when the active conversation changes", () => {
    const cleanTabId = createEditorTabId("conversation-2", "README.md")
    const dirtyTabId = createEditorTabId("conversation-1", "notes.md")
    const state = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-2",
      filePath: "README.md",
      mode: "preview"
    })
    const dirtyState = openConversationFileTab(state, {
      conversationId: "conversation-1",
      filePath: "notes.md",
      mode: "pinned"
    })
    const next = resetConversationFileTabsForConversation(
      markConversationFileTabDirty(dirtyState, dirtyTabId, true),
      "conversation-1"
    )

    expect(next.tabs).toEqual([
      expect.objectContaining({
        id: dirtyTabId,
        conversationId: "conversation-1",
        filePath: "notes.md",
        dirty: true,
        pinned: true
      })
    ])
    expect(next.tabs.find((tab) => tab.id === cleanTabId)).toBeUndefined()
    expect(next.activeTabId).toBe(dirtyTabId)
    expect(resetConversationFileTabsForConversation(next, "conversation-1")).toBe(next)
  })

  it("picks the last remaining tab when the active tab is filtered out", () => {
    const state = {
      tabs: [
        {
          id: createEditorTabId("conversation-2", "README.md"),
          conversationId: "conversation-2",
          filePath: "README.md",
          title: "README.md",
          pinned: false,
          dirty: false
        },
        {
          id: createEditorTabId("conversation-1", "notes.md"),
          conversationId: "conversation-1",
          filePath: "notes.md",
          title: "notes.md",
          pinned: true,
          dirty: true
        },
        {
          id: createEditorTabId("conversation-1", "src/index.ts"),
          conversationId: "conversation-1",
          filePath: "src/index.ts",
          title: "index.ts",
          pinned: true,
          dirty: false
        }
      ],
      activeTabId: createEditorTabId("conversation-2", "README.md")
    }

    expect(resetConversationFileTabsForConversation(state, "conversation-1")).toEqual({
      tabs: [
        {
          id: createEditorTabId("conversation-1", "notes.md"),
          conversationId: "conversation-1",
          filePath: "notes.md",
          title: "notes.md",
          pinned: true,
          dirty: true
        },
        {
          id: createEditorTabId("conversation-1", "src/index.ts"),
          conversationId: "conversation-1",
          filePath: "src/index.ts",
          title: "index.ts",
          pinned: true,
          dirty: false
        }
      ],
      activeTabId: createEditorTabId("conversation-1", "src/index.ts")
    })
  })
})
