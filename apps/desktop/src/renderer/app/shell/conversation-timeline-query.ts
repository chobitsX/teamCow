import type { ConversationTimeline } from "@shared/index"

export type ConversationTimelinePageInfo = {
  nextCursor: string | null
  hasMore: boolean
}

export const emptyConversationTimelinePageInfo = (): ConversationTimelinePageInfo => ({
  nextCursor: null,
  hasMore: false
})

const mergeById = <T extends { id: string }>(older: T[], newer: T[]): T[] => {
  const merged = new Map<string, T>()
  for (const item of older) merged.set(item.id, item)
  for (const item of newer) merged.set(item.id, item)
  return [...merged.values()]
}

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0

/**
 * Combines an older timeline page with a newer page. Newer records win so that
 * a latest-page reconcile can update a running run without discarding history
 * the user has already loaded.
 */
export const mergeTimelinePages = (
  older: ConversationTimeline,
  newer: ConversationTimeline
): ConversationTimeline => {
  if (older.conversationId !== newer.conversationId) return newer

  const runs = mergeById(older.runs, newer.runs).sort((left, right) =>
    compareText(left.startedAt, right.startedAt) ||
    compareText(left.createdAt, right.createdAt) ||
    compareText(left.id, right.id)
  )
  const runOrder = new Map(runs.map((run, index) => [run.id, index]))

  return {
    conversationId: newer.conversationId,
    messages: mergeById(older.messages, newer.messages).sort((left, right) =>
      compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id)
    ),
    queuedMessages: newer.queuedMessages ?? older.queuedMessages ?? [],
    runs,
    events: mergeById(older.events, newer.events).sort((left, right) =>
      (runOrder.get(left.runId) ?? Number.MAX_SAFE_INTEGER) -
        (runOrder.get(right.runId) ?? Number.MAX_SAFE_INTEGER) ||
      left.sequence - right.sequence ||
      compareText(left.createdAt, right.createdAt) ||
      compareText(left.id, right.id)
    ),
    artifacts: mergeById(older.artifacts, newer.artifacts).sort((left, right) =>
      compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id)
    )
  }
}
