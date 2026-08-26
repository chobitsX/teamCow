// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ConversationChangesSnapshot,
  ConversationChangesMutationScope
} from "@shared/index"
import { i18n } from "../../providers/I18nProvider"
import {
  InspectorChangesPanel,
  type InspectorChangesPanelProps
} from "../InspectorChangesPanel"

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
      path: "docs/new name.md",
      oldPath: "docs/old name.md",
      status: "renamed",
      additions: 2,
      deletions: 2,
      isBinary: false
    },
    {
      path: "src/conflict.ts",
      oldPath: null,
      status: "conflicted",
      additions: 0,
      deletions: 0,
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

const makeProps = (
  overrides: Partial<InspectorChangesPanelProps> = {}
): InspectorChangesPanelProps => ({
  snapshot,
  selected: null,
  listLoading: false,
  stale: false,
  listError: null,
  listUnavailable: false,
  readOnly: false,
  pendingMutation: false,
  commitMessage: "",
  onRefresh: vi.fn(),
  onSelect: vi.fn(),
  onStage: vi.fn(),
  onUnstage: vi.fn(),
  onDiscard: vi.fn(),
  onCommit: vi.fn(),
  onCommitMessageChange: vi.fn(),
  onOpenEditor: vi.fn(),
  ...overrides
})

const renderPanel = (props: InspectorChangesPanelProps) => render(
  <I18nextProvider i18n={i18n}>
    <InspectorChangesPanel {...props} />
  </I18nextProvider>
)

beforeEach(async () => {
  await i18n.changeLanguage("en")
})

describe("InspectorChangesPanel", () => {
  it("renders localized summary and staged before unstaged", () => {
    const view = renderPanel(makeProps())

    expect(screen.getByRole("heading", { name: "Changes" })).toBeTruthy()
    expect(view.container.querySelector(".changes-summary-count")?.textContent).toBe("4")
    expect(view.container.querySelector(".changes-summary-additions")?.textContent).toBe("+10")
    expect(view.container.querySelector(".changes-summary-deletions")?.textContent).toBe("-3")
    const unstaged = screen.getByRole("button", { name: /Unstaged, 3 changes/ })
    const staged = screen.getByRole("button", { name: /Staged, 1 change/ })
    expect(staged.compareDocumentPosition(unstaged) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByTitle("src/dual.ts")).toHaveLength(2)
    expect(screen.getByText("docs/old name.md")).toBeTruthy()
    const renamedStatus = view.container.querySelector(".changes-file-status-renamed")
    expect(renamedStatus?.textContent).toBe("R")
    expect(renamedStatus?.getAttribute("title")).toBe("renamed")
  })

  it("renders Chinese core states from the real resources", async () => {
    await act(async () => {
      await i18n.changeLanguage("zh")
    })
    renderPanel(makeProps({ snapshot: { ...snapshot, staged: [], unstaged: [] } }))

    expect(screen.getByRole("heading", { name: "变更" })).toBeTruthy()
    expect(screen.getByText("当前 worktree 没有未提交变更。")).toBeTruthy()
    expect(screen.getByRole("button", { name: "刷新变更" })).toBeTruthy()
    expect(screen.getByLabelText("提交信息")).toBeTruthy()
  })

  it("localizes file-action titles and uses the standard undo arrow icon", async () => {
    const view = renderPanel(makeProps())

    const stage = screen.getByRole("button", { name: "Stage src/dual.ts" })
    const unstage = screen.getByRole("button", { name: "Unstage src/dual.ts" })
    const discard = screen.getByRole("button", { name: "Discard changes for src/dual.ts" })
    const open = screen.getAllByRole("button", { name: "Open src/dual.ts in editor" })[0]!
    expect(stage.getAttribute("title")).toBe("Add to this commit")
    expect(stage.getAttribute("data-tooltip")).toBe("Add to this commit")
    expect(unstage.getAttribute("title")).toBe("Remove from this commit")
    expect(unstage.getAttribute("data-tooltip")).toBe("Remove from this commit")
    expect(discard.getAttribute("title")).toBe("Discard unstaged changes")
    expect(discard.getAttribute("data-tooltip")).toBe("Discard unstaged changes")
    expect(open.getAttribute("title")).toBe("Open in editor")
    expect(open.getAttribute("data-tooltip")).toBe("Open in editor")
    expect(discard.querySelector('svg[data-icon="arrow-rotate-left"]')).toBeTruthy()
    expect(discard.querySelector('svg[data-icon="rotate-left"]')).toBeNull()

    await act(async () => {
      await i18n.changeLanguage("zh")
    })
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <InspectorChangesPanel {...makeProps()} />
      </I18nextProvider>
    )
    expect(screen.getByRole("button", { name: "暂存 src/dual.ts" }).getAttribute("title"))
      .toBe("加入本次 Commit")
    expect(screen.getByRole("button", { name: "取消暂存 src/dual.ts" }).getAttribute("title"))
      .toBe("移出本次 Commit")
    expect(screen.getByRole("button", { name: "丢弃 src/dual.ts 的变更" }).getAttribute("title"))
      .toBe("撤销未暂存更改")
    expect(screen.getAllByRole("button", { name: "用编辑器打开 src/dual.ts" })[0]?.getAttribute("title"))
      .toBe("在编辑器中打开")
  })

  it("renders no-conversation, loading, stale, and list-error states without losing a snapshot", () => {
    const view = renderPanel(makeProps({ snapshot: null }))
    expect(screen.getByText("Select a conversation to inspect its changes.")).toBeTruthy()

    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      snapshot: null,
      listLoading: true
    })} /></I18nextProvider>)
    expect(screen.getByText("Loading changes...")).toBeTruthy()

    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      stale: true,
      listError: "read failed"
    })} /></I18nextProvider>)
    expect(screen.getByText("Showing the last known changes. Refresh to try again.")).toBeTruthy()
    expect(screen.getByText("Changes are unavailable right now.")).toBeTruthy()
    expect(screen.getByText("read failed")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Review changes for src/dual.ts (unstaged)" })).toBeTruthy()

    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      snapshot: null,
      listUnavailable: true,
      listError: "Git is not installed"
    })} /></I18nextProvider>)
    expect(screen.getByText("Changes are unavailable for this worktree.")).toBeTruthy()
    expect(screen.getByText("Git is not installed")).toBeTruthy()
  })

  it("collapses and expands each change section accessibly", () => {
    renderPanel(makeProps())
    const toggle = screen.getByRole("button", { name: "Unstaged, 3 changes" })

    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("button", { name: "Review changes for src/dual.ts (unstaged)" })).toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: "Review changes for src/dual.ts (unstaged)" })).toBeTruthy()
  })

  it("opens exact staged/unstaged identities in the central change editor", () => {
    const onSelect = vi.fn()
    const onOpenChange = vi.fn()
    const view = renderPanel(makeProps({ onSelect, onOpenChange }))

    fireEvent.click(screen.getByRole("button", { name: "Review changes for src/dual.ts (unstaged)" }))
    expect(onSelect).toHaveBeenLastCalledWith({ area: "unstaged", filePath: "src/dual.ts" })
    expect(onOpenChange).toHaveBeenLastCalledWith(
      { area: "unstaged", filePath: "src/dual.ts" },
      "preview"
    )

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <InspectorChangesPanel
          {...makeProps({
            onSelect,
            onOpenChange,
            selected: { area: "unstaged", filePath: "src/dual.ts" }
          })}
        />
      </I18nextProvider>
    )
    expect(view.container.querySelector(".changes-inline-diff")).toBeNull()

    const staged = screen.getByRole("button", { name: "Review changes for src/dual.ts (staged)" })
    fireEvent.doubleClick(staged)
    expect(onOpenChange).toHaveBeenLastCalledWith(
      { area: "staged", filePath: "src/dual.ts" },
      "pinned"
    )
  })

  it("places commit controls before compact directory-grouped rows", () => {
    const view = renderPanel(makeProps())
    const commit = view.container.querySelector(".changes-commit-area")
    const sections = view.container.querySelector(".changes-sections-scroll")
    expect(commit && sections
      ? commit.compareDocumentPosition(sections) & Node.DOCUMENT_POSITION_FOLLOWING
      : 0).toBeTruthy()
    expect(view.container.querySelectorAll(".changes-directory-group")).toHaveLength(3)
    expect(screen.getAllByText("src/").length).toBeGreaterThan(0)
    expect(screen.getAllByText("docs/").length).toBeGreaterThan(0)
    expect(commit?.querySelector("label")?.classList.contains("visually-hidden")).toBe(true)
    expect(commit?.querySelector('button[type="submit"] svg')).toBeTruthy()

    const review = screen.getByRole("button", { name: "Review changes for src/dual.ts (unstaged)" })
    expect(review.querySelector(".changes-file-inline-stats")?.textContent).toBe("+3-1")
    expect(view.container.ownerDocument.getElementById(review.getAttribute("aria-describedby") ?? "")?.textContent)
      .toContain("modified, +3, -1")
    expect(review.closest(".changes-file-row")?.querySelector(".changes-file-status")?.textContent).toBe("M")
    expect(review.querySelector(".changes-file-inline-stats")?.parentElement?.classList.contains("changes-file-paths")).toBe(true)
  })

  it("collapses and expands files within one directory independently", () => {
    const view = renderPanel(makeProps())
    const unstagedReview = screen.getByRole("button", {
      name: "Review changes for src/dual.ts (unstaged)"
    })
    const unstagedDirectory = unstagedReview.closest(".changes-directory-group")
    expect(unstagedDirectory).toBeTruthy()

    const collapse = within(unstagedDirectory as HTMLElement).getByRole("button", {
      name: "Collapse src/"
    })
    expect(collapse.getAttribute("aria-expanded")).toBe("true")
    fireEvent.click(collapse)

    const expand = within(unstagedDirectory as HTMLElement).getByRole("button", {
      name: "Expand src/"
    })
    expect(expand.getAttribute("aria-expanded")).toBe("false")
    expect(unstagedDirectory?.querySelector(".changes-file-list")?.hasAttribute("hidden")).toBe(true)
    expect(within(unstagedDirectory as HTMLElement).queryByRole("button", {
      name: "Review changes for src/dual.ts (unstaged)"
    })).toBeNull()
    expect(screen.getByRole("button", {
      name: "Review changes for src/dual.ts (staged)"
    })).toBeTruthy()

    fireEvent.click(expand)
    expect(within(unstagedDirectory as HTMLElement).getByRole("button", {
      name: "Review changes for src/dual.ts (unstaged)"
    })).toBeTruthy()
    expect(view.container.querySelectorAll(".changes-directory-header[aria-expanded=false]")).toHaveLength(0)
  })

  it("shows binary and untracked state inline without a second metadata row", () => {
    const view = renderPanel(makeProps({
      snapshot: {
        ...snapshot,
        staged: [],
        unstaged: [{
          path: "assets/archive.rpks",
          oldPath: null,
          status: "untracked",
          additions: 0,
          deletions: 0,
          isBinary: true
        }]
      }
    }))

    const review = screen.getByRole("button", { name: "Review changes for assets/archive.rpks (unstaged)" })
    expect(within(review).getByText("binary")).toBeTruthy()
    expect(view.container.ownerDocument.getElementById(review.getAttribute("aria-describedby") ?? "")?.textContent)
      .toContain("untracked, binary")
    expect(review.closest(".changes-file-row")?.querySelector(".changes-file-status")?.textContent).toBe("U")
    expect(view.container.querySelector(".changes-file-metadata")).toBeNull()
  })

  it("blocks conflicted bulk discard and confirms file/all destructive scopes", () => {
    const onDiscard = vi.fn<(scope: ConversationChangesMutationScope) => void>()
    const view = renderPanel(makeProps({ onDiscard }))

    expect((screen.getByRole("button", { name: "Discard all unstaged changes" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Discard changes for src/dual.ts" }))
    const fileDialog = screen.getByRole("dialog", { name: "Discard changes to src/dual.ts?" })
    fireEvent.click(within(fileDialog).getByRole("button", { name: "Cancel" }))
    expect(onDiscard).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Discard changes for src/dual.ts" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard" }))
    expect(onDiscard).toHaveBeenLastCalledWith({ type: "file", filePath: "src/dual.ts" })

    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      snapshot: { ...snapshot, unstaged: snapshot.unstaged.filter((file) => file.status !== "conflicted") },
      onDiscard
    })} /></I18nextProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Discard all unstaged changes" }))
    const allDialog = screen.getByRole("dialog", { name: "Discard all unstaged changes?" })
    fireEvent.click(within(allDialog).getByRole("button", { name: "Discard" }))
    expect(onDiscard).toHaveBeenLastCalledWith({ type: "all" })
  })

  it("keeps an open discard confirmation across refreshes while revalidating mutation safety", () => {
    const onDiscard = vi.fn()
    const safeSnapshot = {
      ...snapshot,
      unstaged: snapshot.unstaged.filter((file) => file.status !== "conflicted")
    }
    const view = renderPanel(makeProps({ snapshot: safeSnapshot, onDiscard }))

    fireEvent.click(screen.getByRole("button", { name: "Discard all unstaged changes" }))
    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      snapshot: safeSnapshot,
      readOnly: true,
      onDiscard
    })} /></I18nextProvider>)
    const dialog = screen.getByRole("dialog", { name: "Discard all unstaged changes?" })
    const confirm = within(dialog).getByRole("button", { name: "Discard" }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(onDiscard).not.toHaveBeenCalled()

    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      snapshot: { ...safeSnapshot, checkedAt: "2026-07-10T08:00:02.500Z" },
      listLoading: true,
      onDiscard
    })} /></I18nextProvider>)
    const refreshingDialog = screen.getByRole("dialog", { name: "Discard all unstaged changes?" })
    expect((within(refreshingDialog).getByRole("button", { name: "Discard" }) as HTMLButtonElement).disabled).toBe(true)

    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      snapshot: { ...safeSnapshot, checkedAt: "2026-07-10T08:00:05.000Z" },
      stale: true,
      listError: "refresh failed",
      onDiscard
    })} /></I18nextProvider>)
    const staleDialog = screen.getByRole("dialog", { name: "Discard all unstaged changes?" })
    expect((within(staleDialog).getByRole("button", { name: "Discard" }) as HTMLButtonElement).disabled).toBe(true)
    const stageAll = view.container.querySelector('button[aria-label="Stage all unstaged changes"]') as HTMLButtonElement | null
    expect(stageAll?.disabled).toBe(true)
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it("retains discard confirmation for the same revision and closes it on revision or context replacement", () => {
    const onDiscard = vi.fn()
    const safeSnapshot = {
      ...snapshot,
      unstaged: snapshot.unstaged.filter((file) => file.status !== "conflicted")
    }
    const refreshedSnapshot = {
      ...safeSnapshot,
      checkedAt: "2026-07-10T08:00:02.500Z"
    }
    const view = renderPanel(makeProps({ snapshot: safeSnapshot, onDiscard }))

    fireEvent.click(screen.getByRole("button", { name: "Discard changes for src/dual.ts" }))
    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      snapshot: refreshedSnapshot,
      onDiscard
    })} /></I18nextProvider>)
    const dialog = screen.getByRole("dialog", { name: "Discard changes to src/dual.ts?" })
    expect((within(dialog).getByRole("button", { name: "Discard" }) as HTMLButtonElement).disabled).toBe(false)

    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      snapshot: { ...refreshedSnapshot, revision: "revision-2" },
      onDiscard
    })} /></I18nextProvider>)
    expect(screen.queryByRole("dialog")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Discard changes for src/dual.ts" }))
    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      snapshot: {
        ...refreshedSnapshot,
        revision: "revision-2",
        conversationId: "conversation-2",
        worktreeId: "worktree-2"
      },
      onDiscard
    })} /></I18nextProvider>)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it("traps modal focus, blocks background actions, and restores the discard opener", () => {
    const onDiscard = vi.fn()
    const onRefresh = vi.fn()
    renderPanel(makeProps({ onDiscard, onRefresh }))
    const background = screen.getByRole("group", { name: "Worktree changes" })
    const refresh = screen.getByRole("button", { name: "Refresh changes" })
    const opener = screen.getByRole("button", { name: "Discard changes for src/dual.ts" })

    opener.focus()
    fireEvent.click(opener)
    let dialog = screen.getByRole("dialog", { name: "Discard changes to src/dual.ts?" })
    let cancel = within(dialog).getByRole("button", { name: "Cancel" })
    let confirm = within(dialog).getByRole("button", { name: "Discard" })
    expect(document.activeElement).toBe(cancel)
    expect(background.getAttribute("aria-hidden")).toBe("true")
    expect(background.hasAttribute("inert")).toBe(true)

    fireEvent.click(refresh)
    expect(onRefresh).not.toHaveBeenCalled()
    fireEvent.keyDown(dialog, { key: "Tab" })
    expect(document.activeElement).toBe(confirm)
    fireEvent.keyDown(dialog, { key: "Tab" })
    expect(document.activeElement).toBe(cancel)
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(confirm)
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(opener)

    fireEvent.click(opener)
    dialog = screen.getByRole("dialog", { name: "Discard changes to src/dual.ts?" })
    cancel = within(dialog).getByRole("button", { name: "Cancel" })
    fireEvent.click(cancel)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(opener)

    fireEvent.click(opener)
    dialog = screen.getByRole("dialog", { name: "Discard changes to src/dual.ts?" })
    confirm = within(dialog).getByRole("button", { name: "Discard" })
    fireEvent.click(confirm)
    expect(onDiscard).toHaveBeenCalledWith({ type: "file", filePath: "src/dual.ts" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it("keeps review and editor handoff enabled in pinned read-only mode", () => {
    const onSelect = vi.fn()
    const onOpenEditor = vi.fn()
    const onCommitMessageChange = vi.fn()
    renderPanel(makeProps({ readOnly: true, commitMessage: "Ship", onSelect, onOpenEditor, onCommitMessageChange }))

    expect(screen.getByText("Pinned snapshot · Git actions are read-only.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Stage all unstaged changes" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Stage src/dual.ts" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Discard changes for src/dual.ts" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Unstage src/dual.ts" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Commit staged changes" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Refresh changes" }) as HTMLButtonElement).disabled).toBe(true)
    const commitMessage = screen.getByLabelText("Commit message") as HTMLTextAreaElement
    expect(commitMessage.readOnly).toBe(true)
    fireEvent.change(commitMessage, { target: { value: "Changed while pinned" } })
    expect(onCommitMessageChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Review changes for src/dual.ts (unstaged)" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Open src/dual.ts in editor" })[0]!)
    expect(onSelect).toHaveBeenCalledWith({ area: "unstaged", filePath: "src/dual.ts" })
    expect(onOpenEditor).toHaveBeenCalledWith("src/dual.ts")
  })

  it("gates commit and reports controlled message edits", () => {
    const onCommit = vi.fn()
    const onCommitMessageChange = vi.fn()
    const view = renderPanel(makeProps({ onCommit, onCommitMessageChange }))
    const input = screen.getByLabelText("Commit message")
    expect((input as HTMLTextAreaElement).maxLength).toBe(16_384)

    expect((screen.getByRole("button", { name: "Commit staged changes" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: "Ship changes" } })
    expect(onCommitMessageChange).toHaveBeenCalledWith("Ship changes")

    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      commitMessage: "  Ship changes  ",
      onCommit,
      onCommitMessageChange
    })} /></I18nextProvider>)
    const commit = screen.getByRole("button", { name: "Commit staged changes" })
    expect((commit as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(commit)
    expect(onCommit).toHaveBeenCalledWith("  Ship changes  ")

    view.rerender(<I18nextProvider i18n={i18n}><InspectorChangesPanel {...makeProps({
      commitMessage: "Ship changes",
      pendingMutation: true,
      onCommit
    })} /></I18nextProvider>)
    expect((screen.getByRole("button", { name: "Committing staged changes..." }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("does not offer editor handoff for deleted targets", () => {
    renderPanel(makeProps({
      snapshot: {
        ...snapshot,
        unstaged: [{ ...snapshot.unstaged[0]!, status: "deleted" }],
        staged: []
      }
    }))

    expect(screen.queryByRole("button", { name: "Open src/dual.ts in editor" })).toBeNull()
  })

  it("passes exact bulk and per-file stage scopes", () => {
    const onStage = vi.fn()
    const onUnstage = vi.fn()
    renderPanel(makeProps({ onStage, onUnstage }))

    fireEvent.click(screen.getByRole("button", { name: "Stage all unstaged changes" }))
    fireEvent.click(screen.getByRole("button", { name: "Stage src/dual.ts" }))
    fireEvent.click(screen.getByRole("button", { name: "Unstage all staged changes" }))
    fireEvent.click(screen.getByRole("button", { name: "Unstage src/dual.ts" }))

    expect(onStage).toHaveBeenNthCalledWith(1, { type: "all" })
    expect(onStage).toHaveBeenNthCalledWith(2, { type: "file", filePath: "src/dual.ts" })
    expect(onUnstage).toHaveBeenNthCalledWith(1, { type: "all" })
    expect(onUnstage).toHaveBeenNthCalledWith(2, { type: "file", filePath: "src/dual.ts" })
  })

  it("routes the first direct file-action click without selecting the review row or crossing callbacks", () => {
    const onSelect = vi.fn()
    const onStage = vi.fn()
    const onUnstage = vi.fn()
    const onDiscard = vi.fn()
    const onOpenEditor = vi.fn()
    renderPanel(makeProps({ onSelect, onStage, onUnstage, onDiscard, onOpenEditor }))

    fireEvent.click(screen.getByRole("button", { name: "Stage src/dual.ts" }))
    expect(onStage).toHaveBeenCalledOnce()
    expect(onStage).toHaveBeenLastCalledWith({ type: "file", filePath: "src/dual.ts" })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onUnstage).not.toHaveBeenCalled()
    expect(onDiscard).not.toHaveBeenCalled()
    expect(onOpenEditor).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Discard changes for src/dual.ts" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard" }))
    expect(onDiscard).toHaveBeenCalledOnce()
    expect(onDiscard).toHaveBeenLastCalledWith({ type: "file", filePath: "src/dual.ts" })
    expect(onStage).toHaveBeenCalledOnce()
    expect(onOpenEditor).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole("button", { name: "Open src/dual.ts in editor" })[0]!)
    expect(onOpenEditor).toHaveBeenCalledOnce()
    expect(onOpenEditor).toHaveBeenLastCalledWith("src/dual.ts")
    expect(onSelect).not.toHaveBeenCalled()
    expect(onUnstage).not.toHaveBeenCalled()
    expect(onStage).toHaveBeenCalledOnce()
    expect(onDiscard).toHaveBeenCalledOnce()
  })
})
