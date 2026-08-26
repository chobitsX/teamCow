import { describe, expect, it } from "vitest"
import type { ConversationTimeline } from "@shared/index"
import { mergeTimelinePages } from "./conversation-timeline-query"

const timeline = (
  conversationId: string,
  runId: string,
  runStatus: "running" | "completed"
): ConversationTimeline => ({
  conversationId,
  messages: [],
  runs: [{
    id: runId,
    conversationId,
    provider: "codex",
    model: "gpt-5",
    worktreeId: "worktree-1",
    status: runStatus,
    startedAt: runId === "run-old" ? "2026-08-17T00:00:00.000Z" : "2026-08-17T00:01:00.000Z",
    completedAt: runStatus === "completed" ? "2026-08-17T00:01:00.000Z" : null,
    createdAt: runId === "run-old" ? "2026-08-17T00:00:00.000Z" : "2026-08-17T00:01:00.000Z",
    updatedAt: "2026-08-17T00:01:00.000Z"
  }],
  events: [],
  artifacts: []
})

describe("mergeTimelinePages", () => {
  it("keeps loaded history while allowing the latest page to refresh existing records", () => {
    const older = timeline("conversation-1", "run-old", "completed")
    const current = mergeTimelinePages(older, timeline("conversation-1", "run-current", "running"))
    const reconciled = mergeTimelinePages(current, timeline("conversation-1", "run-current", "completed"))

    expect(reconciled.runs.map((run) => run.id)).toEqual(["run-old", "run-current"])
    expect(reconciled.runs.at(-1)?.status).toBe("completed")
  })

  it("does not merge pages from different conversations", () => {
    const replacement = timeline("conversation-2", "run-2", "completed")
    expect(mergeTimelinePages(timeline("conversation-1", "run-1", "completed"), replacement)).toEqual(replacement)
  })
})
