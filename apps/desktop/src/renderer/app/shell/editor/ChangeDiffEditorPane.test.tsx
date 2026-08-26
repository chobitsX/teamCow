// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GetConversationChangeDiffDocumentResult, TeamcowDesktopApi } from "@shared/index"
import { i18n } from "../../providers/I18nProvider"
import { ChangeDiffEditorPane } from "./ChangeDiffEditorPane"
import type { ConversationChangeDiffEditorTab } from "./conversation-file-editor-model"

vi.mock("./ChangeDiffCodeView", () => ({
  ChangeDiffCodeView: ({ original, modified }: { original: string; modified: string }) => (
    <div data-testid="mock-change-diff">{original}|{modified}</div>
  )
}))

const tab: ConversationChangeDiffEditorTab = {
  id: "diff-tab",
  conversationId: "conversation-1",
  worktreeId: "worktree-1",
  revision: "revision-1",
  area: "unstaged",
  filePath: "src/index.ts",
  title: "index.ts",
  pinned: false,
  dirty: false,
  resourceType: "change-diff"
}

const originalTeamcow = window.teamcow

beforeEach(async () => {
  await i18n.changeLanguage("en")
})

afterEach(() => {
  window.teamcow = originalTeamcow
})

describe("ChangeDiffEditorPane", () => {
  it("loads a fixed revision and renders both read-only sides", async () => {
    const getConversationChangeDiffDocument = vi.fn(async (): Promise<GetConversationChangeDiffDocumentResult> => ({
      status: "text",
      conversationId: tab.conversationId,
      worktreeId: tab.worktreeId,
      revision: tab.revision,
      area: tab.area,
      filePath: tab.filePath,
      oldPath: null,
      original: "before",
      modified: "after",
      originalMode: "100644",
      modifiedMode: "100644",
      originalByteLength: 6,
      modifiedByteLength: 5
    }))
    window.teamcow = { getConversationChangeDiffDocument } as unknown as TeamcowDesktopApi

    render(
      <I18nextProvider i18n={i18n}>
        <ChangeDiffEditorPane tab={tab} active={true} />
      </I18nextProvider>
    )

    await waitFor(() => expect(screen.getByTestId("mock-change-diff").textContent).toBe("before|after"))
    expect(getConversationChangeDiffDocument).toHaveBeenCalledWith({
      conversationId: tab.conversationId,
      worktreeId: tab.worktreeId,
      revision: tab.revision,
      area: tab.area,
      filePath: tab.filePath
    })
    expect(screen.getByText("Index")).toBeTruthy()
    expect(screen.getByText("Working tree")).toBeTruthy()
    expect(screen.getByText("Read-only diff")).toBeTruthy()
  })

  it("does not load an inactive diff until it becomes active", async () => {
    const getConversationChangeDiffDocument = vi.fn(async (): Promise<GetConversationChangeDiffDocumentResult> => ({
      status: "text",
      conversationId: tab.conversationId,
      worktreeId: tab.worktreeId,
      revision: tab.revision,
      area: tab.area,
      filePath: tab.filePath,
      oldPath: null,
      original: "before",
      modified: "after",
      originalMode: "100644",
      modifiedMode: "100644",
      originalByteLength: 6,
      modifiedByteLength: 5
    }))
    window.teamcow = { getConversationChangeDiffDocument } as unknown as TeamcowDesktopApi

    const view = render(
      <I18nextProvider i18n={i18n}>
        <ChangeDiffEditorPane tab={tab} active={false} />
      </I18nextProvider>
    )

    expect(getConversationChangeDiffDocument).not.toHaveBeenCalled()
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <ChangeDiffEditorPane tab={tab} active={true} />
      </I18nextProvider>
    )
    await waitFor(() => expect(getConversationChangeDiffDocument).toHaveBeenCalledOnce())
  })

  it("renders a localized error for a mismatched current response", async () => {
    window.teamcow = {
      getConversationChangeDiffDocument: vi.fn(async (): Promise<GetConversationChangeDiffDocumentResult> => ({
        status: "text",
        conversationId: tab.conversationId,
        worktreeId: tab.worktreeId,
        revision: "revision-2",
        area: tab.area,
        filePath: tab.filePath,
        oldPath: null,
        original: "wrong",
        modified: "wrong",
        originalMode: "100644",
        modifiedMode: "100644",
        originalByteLength: 5,
        modifiedByteLength: 5
      }))
    } as unknown as TeamcowDesktopApi

    render(
      <I18nextProvider i18n={i18n}>
        <ChangeDiffEditorPane tab={tab} active={true} />
      </I18nextProvider>
    )

    await waitFor(() => expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalled())
    expect(screen.queryByTestId("mock-change-diff")).toBeNull()
    expect(screen.getByText(/TeamCow could not read the current worktree changes/)).toBeTruthy()
    expect(screen.queryByText("Diff response identity did not match the requested resource")).toBeNull()
  })

  it("shows old and new paths and a mode-only change", async () => {
    window.teamcow = {
      getConversationChangeDiffDocument: vi.fn(async (): Promise<GetConversationChangeDiffDocumentResult> => ({
        status: "text",
        conversationId: tab.conversationId,
        worktreeId: tab.worktreeId,
        revision: tab.revision,
        area: tab.area,
        filePath: tab.filePath,
        oldPath: "src/legacy.js",
        original: "same\n",
        modified: "same\n",
        originalMode: "100644",
        modifiedMode: "100755",
        originalByteLength: 5,
        modifiedByteLength: 5
      }))
    } as unknown as TeamcowDesktopApi

    render(
      <I18nextProvider i18n={i18n}>
        <ChangeDiffEditorPane tab={tab} active={true} />
      </I18nextProvider>
    )

    await waitFor(() => expect(screen.getByTestId("mock-change-diff")).toBeTruthy())
    expect(screen.getByText("Index · src/legacy.js")).toBeTruthy()
    expect(screen.getByText("Working tree · src/index.ts")).toBeTruthy()
    expect(screen.getByText("Mode 100644 → 100755")).toBeTruthy()
  })
})
