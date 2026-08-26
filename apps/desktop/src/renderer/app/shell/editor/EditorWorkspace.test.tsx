// @vitest-environment jsdom
import { fireEvent, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"
import type { ConversationSummary } from "@shared/index"
import { i18n } from "../../providers/I18nProvider"
import type { ConversationFileEditorState } from "./conversation-file-editor-model"
import { EditorWorkspace } from "./EditorWorkspace"

vi.mock("./FileEditorPane", () => ({
  FileEditorPane: () => <div data-testid="file-editor-pane" />
}))

const conversation: ConversationSummary = {
  id: "conversation-1",
  title: "Conversation",
  projectId: "project-1",
  worktreeId: "worktree-1",
  worktree: {
    id: "worktree-1",
    projectId: "project-1",
    kind: "default",
    rootPath: "/tmp/teamcow",
    branch: "main",
    status: "ready"
  },
  provider: {
    kind: "codex",
    label: "Codex",
    status: "ready"
  },
  currentModel: "gpt-5",
  runStatus: "completed",
  createdAt: "2026-07-08T08:00:00.000Z",
  updatedAt: "2026-07-08T08:00:00.000Z",
  isCurrent: true
}

const emptyEditorState: ConversationFileEditorState = {
  tabs: [],
  activeTabId: null
}

const activeEditorState: ConversationFileEditorState = {
  tabs: [
    {
      id: "conversation-1:README.md",
      conversationId: "conversation-1",
      filePath: "README.md",
      title: "README.md",
      pinned: false,
      dirty: false
    }
  ],
  activeTabId: "conversation-1:README.md"
}

describe("EditorWorkspace", () => {
  it("keeps Chat mounted while switching between the fixed Chat tab and editor tabs", async () => {
    await i18n.changeLanguage("en")
    const mountSpy = vi.fn()

    const ChatProbe = () => {
      useEffect(() => {
        mountSpy()
      }, [])

      return <div data-testid="chat-probe">Chat</div>
    }

    const renderWorkspace = (editorState: ConversationFileEditorState) => (
      <I18nextProvider i18n={i18n}>
        <EditorWorkspace
          resolveConversation={(conversationId) => conversationId === conversation.id ? conversation : null}
          editorState={editorState}
          onEditorStateChange={vi.fn()}
          onOpenExternalFile={vi.fn()}
        >
          <ChatProbe />
        </EditorWorkspace>
      </I18nextProvider>
    )

    const view = render(renderWorkspace(emptyEditorState))
    expect(mountSpy).toHaveBeenCalledTimes(1)
    const chatPane = view.container.querySelector(".editor-workspace-chat")
    expect(chatPane).toBeTruthy()
    expect(view.getByTestId("editor-tab-chat").getAttribute("aria-selected")).toBe("true")
    expect(view.getByTestId("editor-tab-chat").querySelector(".editor-tab-actions")).toBeNull()

    view.rerender(renderWorkspace(activeEditorState))
    expect(mountSpy).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector(".editor-workspace-chat")).toBe(chatPane)
    await waitFor(() => expect(view.getByTestId("editor-workspace")).toBeTruthy())
    expect(chatPane?.hasAttribute("hidden")).toBe(true)

    fireEvent.click(view.getByTestId("editor-tab-chat"))
    expect(chatPane?.hasAttribute("hidden")).toBe(false)
    expect(view.queryByTestId("editor-workspace")).toBeNull()

    fireEvent.click(view.getByTestId("editor-tab-README.md").querySelector(".editor-tab-select") as Element)
    await waitFor(() => expect(view.getByTestId("editor-workspace")).toBeTruthy())
    expect(chatPane?.hasAttribute("hidden")).toBe(true)

    view.rerender(renderWorkspace(emptyEditorState))
    expect(mountSpy).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector(".editor-workspace-chat")).toBe(chatPane)
    expect(chatPane?.hasAttribute("hidden")).toBe(false)
  })
})
