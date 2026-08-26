import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import {
  conversationsTable,
  executionRunsTable,
  runEventsTable,
  type AppDatabase
} from "@db"

type ExecutionRunRow = typeof executionRunsTable.$inferSelect
type ConversationRow = typeof conversationsTable.$inferSelect

export type RunRecoveryResult = {
  recoveredRunIds: string[]
  recoveredConversationIds: string[]
}

export const recoverInterruptedRuns = (input: {
  database: AppDatabase
  now: () => string
  createId?: () => string
}): RunRecoveryResult => {
  const runningRuns = input.database.db
    .select()
    .from(executionRunsTable)
    .where(eq(executionRunsTable.status, "running"))
    .all() as ExecutionRunRow[]

  if (runningRuns.length === 0) {
    return { recoveredRunIds: [], recoveredConversationIds: [] }
  }

  const timestamp = input.now()
  const createId = input.createId ?? randomUUID
  const recoveredConversationIds = new Set<string>()

  input.database.db.transaction((tx) => {
    for (const run of runningRuns) {
      const sequenceRow = tx
        .update(executionRunsTable)
        .set({
          status: "interrupted",
          lastSequence: sql`${executionRunsTable.lastSequence} + 1`,
          completedAt: run.completedAt ?? timestamp,
          updatedAt: timestamp
        })
        .where(eq(executionRunsTable.id, run.id))
        .returning({ sequence: executionRunsTable.lastSequence })
        .get()
      if (!sequenceRow) {
        continue
      }

      tx
        .insert(runEventsTable)
        .values({
          id: createId(),
          conversationId: run.conversationId,
          runId: run.id,
          sequence: sequenceRow.sequence,
          schemaVersion: 1,
          type: "run.interrupted",
          payload: JSON.stringify({
            status: "interrupted",
            reason: "app-restarted",
            recovery: true
          }),
          createdAt: timestamp
        })
        .run()

      recoveredConversationIds.add(run.conversationId)
    }

    for (const conversationId of recoveredConversationIds) {
      const conversation = tx
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.id, conversationId))
        .get() as ConversationRow | undefined
      if (!conversation || conversation.runStatus !== "running") {
        continue
      }

      tx
        .update(conversationsTable)
        .set({ runStatus: "interrupted", updatedAt: timestamp })
        .where(eq(conversationsTable.id, conversationId))
        .run()
    }
  })

  return {
    recoveredRunIds: runningRuns.map((run) => run.id),
    recoveredConversationIds: [...recoveredConversationIds]
  }
}
