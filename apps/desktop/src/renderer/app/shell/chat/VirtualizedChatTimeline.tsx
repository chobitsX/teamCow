import { memo, type ReactNode, type RefObject } from "react"
import type { ChatRenderItem } from "../chat-render-model"

type VirtualizedChatTimelineProps = {
  items: ChatRenderItem[]
  dismissedPermissionRequestIds: Set<string>
  hasMore: boolean
  isLoadingOlder: boolean
  loadOlderLabel: string
  loadingOlderLabel: string
  emptyState: ReactNode
  anchorRef: RefObject<HTMLDivElement | null>
  onLoadOlder: () => void
  renderItem: (item: ChatRenderItem) => ReactNode
}

export const VirtualizedChatTimeline = memo(({
  items,
  dismissedPermissionRequestIds,
  hasMore,
  isLoadingOlder,
  loadOlderLabel,
  loadingOlderLabel,
  emptyState,
  anchorRef,
  onLoadOlder,
  renderItem
}: VirtualizedChatTimelineProps) => {
  const visibleItems = items.filter(
    (item) => item.kind !== "permission-request" || !dismissedPermissionRequestIds.has(item.id)
  )

  return (
    <div className="chat-message-list" data-testid="chat-message-list">
      {hasMore ? (
        <button
          className="chat-history-load-older"
          type="button"
          disabled={isLoadingOlder}
          onClick={onLoadOlder}
          data-testid="chat-history-load-older"
        >
          {isLoadingOlder ? loadingOlderLabel : loadOlderLabel}
        </button>
      ) : null}
      {visibleItems.length > 0
        ? visibleItems.map((item) => (
            <div className="chat-virtual-item" data-chat-item-id={item.id} key={item.id}>
              {renderItem(item)}
            </div>
          ))
        : emptyState}
      <div ref={anchorRef} aria-hidden="true" className="chat-message-list-anchor" />
    </div>
  )
})
