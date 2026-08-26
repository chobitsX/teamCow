// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  conversationsTable,
  createAppDatabase,
  executionRunsTable,
  projectsTable,
  runEventsTable,
  worktreesTable
} from "@db"
import { recoverInterruptedRuns } from "../run-recovery-service"

const tempPaths: string[] = []

const createTempDatabase = () => {
  const directory = mkdtempSync(join(tmpdir(), "teamcow-run-recovery-"))
  tempPaths.push(directory)
  return createAppDatabase(join(directory, "teamcow.sqlite"))
}

afterEach(() => {
  for (const path of tempPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

describe("recoverInterruptedRuns", () => {
  it("atomically marks orphaned runs interrupted and records a recovery event", () => {
    const database = createTempDatabase()
    const startedAt = "2026-08-17T01:00:00.000Z"
    const recoveredAt = "2026-08-17T01:05:00.000Z"

    database.db.insert(projectsTable).values({
      id: "project-1",
      name: "Project",
      rootPath: "/tmp/project",
      status: "ready",
      createdAt: startedAt,
      updatedAt: startedAt
    }).run()
    database.db.insert(worktreesTable).values({
      id: "worktree-1",
      projectId: "project-1",
      kind: "default",
      rootPath: "/tmp/project",
      branch: "main",
      status: "ready",
      createdAt: startedAt,
      updatedAt: startedAt
    }).run()
    database.db.insert(conversationsTable).values({
      id: "conversation-1",
      projectId: "project-1",
      title: "Recovery",
      worktreeId: "worktree-1",
      provider: "codex",
      currentModel: "gpt-5.5",
      accessMode: "worktree-write",
      runStatus: "running",
      createdAt: startedAt,
      updatedAt: startedAt
    }).run()
    database.db.insert(executionRunsTable).values({
      id: "run-1",
      conversationId: "conversation-1",
      provider: "codex",
      model: "gpt-5.5",
      worktreeId: "worktree-1",
      status: "running",
      startedAt,
      completedAt: null,
      createdAt: startedAt,
      updatedAt: startedAt
    }).run()
    database.db.insert(runEventsTable).values({
      id: "event-1",
      conversationId: "conversation-1",
      runId: "run-1",
      sequence: 1,
      type: "run.started",
      payload: JSON.stringify({ status: "running" }),
      createdAt: startedAt
    }).run()

    const result = recoverInterruptedRuns({
      database,
      now: () => recoveredAt,
      createId: () => "event-recovery"
    })

    expect(result).toEqual({
      recoveredRunIds: ["run-1"],
      recoveredConversationIds: ["conversation-1"]
    })
    expect(database.db.select().from(executionRunsTable).all()).toEqual([
      expect.objectContaining({ status: "interrupted", completedAt: recoveredAt, updatedAt: recoveredAt })
    ])
    expect(database.db.select().from(conversationsTable).all()).toEqual([
      expect.objectContaining({ runStatus: "interrupted", updatedAt: recoveredAt })
    ])
    expect(database.db.select().from(runEventsTable).all()).toEqual([
      expect.objectContaining({ id: "event-1", sequence: 1 }),
      expect.objectContaining({
        id: "event-recovery",
        sequence: 2,
        type: "run.interrupted",
        payload: JSON.stringify({ status: "interrupted", reason: "app-restarted", recovery: true })
      })
    ])

    expect(recoverInterruptedRuns({ database, now: () => recoveredAt })).toEqual({
      recoveredRunIds: [],
      recoveredConversationIds: []
    })
    database.close()
  })
})
