// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TEAMCOW_WORKTREE_GIT_CHANGED_CHANNEL } from "../desktop-channel"

const ipcRenderer = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock("electron", () => ({ ipcRenderer }))

import { desktopApi } from "./api"

describe("desktop preload worktree git events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("parses events and removes the exact listener on unsubscribe", () => {
    const callback = vi.fn()
    const unsubscribe = desktopApi.onWorktreeGitChanged(callback)
    const listener = ipcRenderer.on.mock.calls[0]?.[1] as ((_event: unknown, payload: unknown) => void) | undefined

    expect(ipcRenderer.on).toHaveBeenCalledWith(TEAMCOW_WORKTREE_GIT_CHANGED_CHANNEL, expect.any(Function))
    expect(listener).toBeDefined()
    listener?.({}, { worktreeId: "worktree-1", paths: ["src/app.ts"] })
    expect(callback).toHaveBeenCalledWith({ worktreeId: "worktree-1", paths: ["src/app.ts"] })

    expect(() => listener?.({}, { worktreeId: "worktree-1", paths: ["/tmp/private.ts"] })).toThrow()
    expect(callback).toHaveBeenCalledOnce()

    unsubscribe()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      TEAMCOW_WORKTREE_GIT_CHANGED_CHANNEL,
      listener
    )
  })

  it("invokes the typed paged timeline command", async () => {
    ipcRenderer.invoke.mockResolvedValueOnce({
      status: "ok",
      timeline: { conversationId: "conversation-1", messages: [], runs: [], events: [], artifacts: [] },
      pageInfo: { nextCursor: null, hasMore: false }
    })

    await desktopApi.getConversationTimelinePage({
      conversationId: "conversation-1",
      beforeRunId: "run-20",
      limit: 20
    })

    expect(ipcRenderer.invoke).toHaveBeenCalledWith("teamcow:invoke", {
      type: "getConversationTimelinePage",
      input: { conversationId: "conversation-1", beforeRunId: "run-20", limit: 20 }
    })
  })
})
