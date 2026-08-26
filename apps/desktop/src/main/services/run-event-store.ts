import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import {
  conversationsTable,
  executionRunsTable,
  runEventsTable,
  type AppDatabase
} from "@db"
import {
  canonicalRunEventSchema,
  conversationRunStatusSchema,
  providerKindSchema,
  RUN_EVENT_SCHEMA_VERSION,
  type CanonicalRunEventType,
  type ConversationRunStatus,
  type ProviderKind
} from "@shared/index"

type ExecutionRunRow = typeof executionRunsTable.$inferSelect
export type PersistedRunEventRow = typeof runEventsTable.$inferSelect

export type AppendPersistedRunEventInput = {
  conversationId: string
  runId: string
  type: CanonicalRunEventType
  payload: Record<string, unknown>
  status?: ConversationRunStatus
  providerEventId?: string
}

export type AppendPersistedRunEventResult = {
  event: PersistedRunEventRow
  inserted: boolean
  provider: ProviderKind
  previousStatus: ConversationRunStatus
  nextStatus: ConversationRunStatus | null
}

const isTerminalRunStatus = (status: ConversationRunStatus) =>
  status === "completed" ||
  status === "failed" ||
  status === "interrupted" ||
  status === "unavailable"

export const createRunEventStore = (input: {
  database: AppDatabase
  now: () => string
  createId?: () => string
}) => {
  const createId = input.createId ?? randomUUID

  const append = (eventInput: AppendPersistedRunEventInput): AppendPersistedRunEventResult => {
    const nextStatus = eventInput.status
      ? conversationRunStatusSchema.parse(eventInput.status)
      : null
    const canonicalEvent = canonicalRunEventSchema.parse({
      type: eventInput.type,
      payload: eventInput.payload,
      ...(nextStatus ? { status: nextStatus } : {})
    })
    const providerEventId = eventInput.providerEventId?.trim() || null
    const timestamp = input.now()

    return input.database.db.transaction((tx) => {
      const run = tx
        .select()
        .from(executionRunsTable)
        .where(eq(executionRunsTable.id, eventInput.runId))
        .get() as ExecutionRunRow | undefined
      if (!run || run.conversationId !== eventInput.conversationId) {
        throw new Error(
          `Run ${eventInput.runId} was not found for conversation ${eventInput.conversationId}`
        )
      }

      const previousStatus = conversationRunStatusSchema.parse(run.status)
      const provider = providerKindSchema.parse(run.provider)
      if (providerEventId) {
        const existing = tx
          .select()
          .from(runEventsTable)
          .where(and(
            eq(runEventsTable.runId, eventInput.runId),
            eq(runEventsTable.providerEventId, providerEventId)
          ))
          .get() as PersistedRunEventRow | undefined
        if (existing) {
          return {
            event: existing,
            inserted: false,
            provider,
            previousStatus,
            nextStatus
          }
        }
      }

      const sequenceRow = tx
        .update(executionRunsTable)
        .set({ lastSequence: sql`${executionRunsTable.lastSequence} + 1` })
        .where(eq(executionRunsTable.id, eventInput.runId))
        .returning({ value: executionRunsTable.lastSequence })
        .get()
      if (!sequenceRow) {
        throw new Error(`Run ${eventInput.runId} disappeared while appending an event`)
      }

      const eventId = createId()
      tx.insert(runEventsTable).values({
        id: eventId,
        conversationId: eventInput.conversationId,
        runId: eventInput.runId,
        sequence: sequenceRow.value,
        schemaVersion: RUN_EVENT_SCHEMA_VERSION,
        providerEventId,
        type: canonicalEvent.type,
        payload: JSON.stringify(canonicalEvent.payload),
        createdAt: timestamp
      }).run()

      if (nextStatus) {
        const nextIsTerminal = isTerminalRunStatus(nextStatus)
        tx.update(executionRunsTable).set({
          status: nextStatus,
          completedAt: nextIsTerminal ? run.completedAt ?? timestamp : null,
          updatedAt: timestamp
        }).where(eq(executionRunsTable.id, eventInput.runId)).run()

        tx.update(conversationsTable).set({
          runStatus: nextStatus,
          updatedAt: timestamp
        }).where(eq(conversationsTable.id, eventInput.conversationId)).run()
      }

      const event = tx
        .select()
        .from(runEventsTable)
        .where(eq(runEventsTable.id, eventId))
        .get() as PersistedRunEventRow
      return { event, inserted: true, provider, previousStatus, nextStatus }
    })
  }

  return { append }
}

export type RunEventStore = ReturnType<typeof createRunEventStore>
