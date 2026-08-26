import type {
  ConversationFileMetadata,
  ConversationFileReadResult,
  ConversationFileWriteResult,
  TeamcowDesktopApi
} from "@shared/index"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ConversationFileEditorTab } from "./conversation-file-editor-model"
import { useConversationFileDocument } from "./use-conversation-file-document"

const tab: ConversationFileEditorTab = {
  id: "conversation-1:README.md",
  conversationId: "conversation-1",
  filePath: "README.md",
  title: "README.md",
  pinned: false,
  dirty: false
}

const metadata = (revision: string): ConversationFileMetadata => ({
  conversationId: "conversation-1",
  worktreeId: "worktree-1",
  filePath: "README.md",
  absolutePath: "/tmp/teamcow/README.md",
  byteLength: 9,
  modifiedAt: "2026-07-07T00:00:00.000Z",
  revision
})

const metadataFor = (
  conversationId: string,
  filePath: string,
  revision: string
): ConversationFileMetadata => ({
  conversationId,
  worktreeId: "worktree-1",
  filePath,
  absolutePath: `/tmp/teamcow/${filePath}`,
  byteLength: 9,
  modifiedAt: "2026-07-07T00:00:00.000Z",
  revision
})

const textResult = (
  content: string,
  revision = "rev-1",
  file: ConversationFileMetadata = metadata(revision)
): ConversationFileReadResult => ({
  status: "text",
  file,
  content,
  encoding: "utf-8"
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  ;(window as unknown as { teamcow: Partial<TeamcowDesktopApi> }).teamcow = {
    readConversationFile: vi.fn().mockResolvedValue(textResult("original")),
    writeConversationFile: vi.fn()
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useConversationFileDocument", () => {
  it("does not reload or reset draft when the same tab identity is rerendered as a new object", async () => {
    const { result, rerender } = renderHook(
      ({ currentTab, readOnly }) => useConversationFileDocument(currentTab, readOnly),
      { initialProps: { currentTab: tab, readOnly: false } }
    )

    await waitFor(() => expect(result.current.document.status).toBe("text"))

    act(() => {
      result.current.setDraft("edited locally")
    })

    rerender({ currentTab: { ...tab, dirty: true }, readOnly: false })

    expect(window.teamcow.readConversationFile).toHaveBeenCalledTimes(1)
    expect(result.current.document).toMatchObject({
      status: "text",
      draft: "edited locally",
      savedContent: "original"
    })
    expect(result.current.dirty).toBe(true)
  })

  it("reloadFromDisk maps non-text results out of loading", async () => {
    vi.mocked(window.teamcow.readConversationFile)
      .mockResolvedValueOnce(textResult("original"))
      .mockResolvedValueOnce({
        status: "not-found",
        conversationId: "conversation-1",
        filePath: "README.md"
      })

    const { result } = renderHook(() => useConversationFileDocument(tab, false))

    await waitFor(() => expect(result.current.document.status).toBe("text"))

    act(() => {
      result.current.reloadFromDisk()
    })

    await waitFor(() => expect(result.current.document.status).toBe("not-found"))
  })

  it("reopens a confirmed large file with the guarded maximum and enables large file mode", async () => {
    const largeFile = { ...metadata("rev-large"), byteLength: (2 * 1024 * 1024) + 1 }
    vi.mocked(window.teamcow.readConversationFile)
      .mockResolvedValueOnce({
        status: "too-large",
        file: largeFile,
        limitBytes: 2 * 1024 * 1024
      })
      .mockResolvedValueOnce(textResult("large file content", "rev-large", largeFile))

    const { result } = renderHook(() => useConversationFileDocument(tab, false))

    await waitFor(() => expect(result.current.document.status).toBe("too-large"))
    expect(result.current.canOpenLargeFile).toBe(true)

    act(() => {
      result.current.openLargeFile()
    })

    await waitFor(() => expect(result.current.document.status).toBe("text"))
    expect(window.teamcow.readConversationFile).toHaveBeenLastCalledWith({
      conversationId: "conversation-1",
      filePath: "README.md",
      maxBytes: 10 * 1024 * 1024
    })
    expect(result.current.largeFileMode).toBe(true)
  })

  it("preserves later edits when save succeeds after the draft changed in flight", async () => {
    const saveRequest = deferred<ConversationFileWriteResult>()
    vi.mocked(window.teamcow.writeConversationFile).mockReturnValue(saveRequest.promise)

    const { result } = renderHook(() => useConversationFileDocument(tab, false))

    await waitFor(() => expect(result.current.document.status).toBe("text"))

    act(() => {
      result.current.setDraft("draft at save")
    })

    let savePromise!: Promise<"saved" | "conflict" | "readonly" | "error" | "skipped">
    act(() => {
      savePromise = result.current.save()
    })

    act(() => {
      result.current.setDraft("draft after save started")
    })

    await act(async () => {
      saveRequest.resolve({ status: "saved", file: metadata("rev-2") })
      await savePromise
    })

    expect(window.teamcow.writeConversationFile).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      filePath: "README.md",
      content: "draft at save",
      precondition: { ifMatch: "rev-1" }
    })
    expect(result.current.document).toMatchObject({
      status: "text",
      content: "draft at save",
      draft: "draft after save started",
      savedContent: "draft at save"
    })
    expect(result.current.dirty).toBe(true)
  })

  it("ignores a save response when the active tab changed while the save was in flight", async () => {
    const tabB: ConversationFileEditorTab = {
      id: "conversation-2:NOTES.md",
      conversationId: "conversation-2",
      filePath: "NOTES.md",
      title: "NOTES.md",
      pinned: false,
      dirty: false
    }
    const tabBRead = deferred<ConversationFileReadResult>()
    const saveRequest = deferred<ConversationFileWriteResult>()
    vi.mocked(window.teamcow.readConversationFile)
      .mockResolvedValueOnce(textResult("A original"))
      .mockReturnValueOnce(tabBRead.promise)
    vi.mocked(window.teamcow.writeConversationFile).mockReturnValue(saveRequest.promise)

    const { result, rerender } = renderHook(
      ({ currentTab }) => useConversationFileDocument(currentTab, false),
      { initialProps: { currentTab: tab } }
    )

    await waitFor(() => expect(result.current.document.status).toBe("text"))

    act(() => {
      result.current.setDraft("A draft")
    })

    let savePromise!: Promise<"saved" | "conflict" | "readonly" | "error" | "skipped">
    act(() => {
      savePromise = result.current.save()
    })

    rerender({ currentTab: tabB })

    await act(async () => {
      tabBRead.resolve(textResult("B content", "rev-b", metadataFor("conversation-2", "NOTES.md", "rev-b")))
    })

    await waitFor(() => {
      expect(result.current.document).toMatchObject({
        status: "text",
        file: {
          conversationId: "conversation-2",
          filePath: "NOTES.md"
        },
        draft: "B content",
        savedContent: "B content"
      })
    })

    await act(async () => {
      saveRequest.resolve({ status: "saved", file: metadata("rev-a2") })
      await savePromise
    })

    expect(result.current.document).toMatchObject({
      status: "text",
      file: {
        conversationId: "conversation-2",
        filePath: "NOTES.md"
      },
      draft: "B content",
      savedContent: "B content"
    })
    expect(result.current.saveState.status).not.toBe("saved")
  })
})
