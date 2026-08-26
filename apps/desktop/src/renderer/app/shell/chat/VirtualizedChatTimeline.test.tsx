// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import type { ChatRenderItem } from "../chat-render-model"
import { VirtualizedChatTimeline } from "./VirtualizedChatTimeline"

const items: ChatRenderItem[] = [
  {
    id: "message-1",
    kind: "user-message",
    runId: "run-1",
    createdAt: "2026-08-17T00:00:00.000Z",
    content: "Visible message",
    model: "gpt-5"
  },
  {
    id: "permission-1",
    kind: "permission-request",
    runId: "run-1",
    createdAt: "2026-08-17T00:00:01.000Z",
    eventId: "event-1",
    allowedTools: ["shell"],
    denials: []
  }
]

describe("VirtualizedChatTimeline", () => {
  it("renders only visible items and requests an older page on demand", () => {
    const onLoadOlder = vi.fn()
    render(
      <VirtualizedChatTimeline
        items={items}
        dismissedPermissionRequestIds={new Set(["permission-1"])}
        hasMore
        isLoadingOlder={false}
        loadOlderLabel="Load earlier"
        loadingOlderLabel="Loading"
        emptyState={<span>Empty</span>}
        anchorRef={createRef<HTMLDivElement>()}
        onLoadOlder={onLoadOlder}
        renderItem={(item) => <span>{item.id}</span>}
      />
    )

    expect(screen.getByText("message-1")).toBeTruthy()
    expect(screen.queryByText("permission-1")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Load earlier" }))
    expect(onLoadOlder).toHaveBeenCalledOnce()
  })
})
