import { sql } from "drizzle-orm"
import { foreignKey, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const projectsTable = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    rootPath: text("root_path").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    rootPathUnique: uniqueIndex("projects_root_path_unique").on(table.rootPath)
  })
)

export const worktreesTable = sqliteTable(
  "worktrees",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    kind: text("kind").notNull(),
    rootPath: text("root_path").notNull(),
    branch: text("branch"),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    defaultWorktreeRootUnique: uniqueIndex("worktrees_project_root_path_unique").on(table.projectId, table.rootPath)
  })
)

export const conversationsTable = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    title: text("title").notNull(),
    worktreeId: text("worktree_id").notNull(),
    provider: text("provider").notNull(),
    currentModel: text("current_model"),
    accessMode: text("access_mode").notNull().default("worktree-write"),
    runStatus: text("run_status").notNull(),
    createdAt: text("created_at").notNull(),
    providerSessionId: text("provider_session_id"),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    projectIndex: index("conversations_project_id_idx").on(table.projectId)
  })
)

export const conversationMessagesTable = sqliteTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    model: text("model"),
    runId: text("run_id"),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    conversationCreatedIndex: index("conversation_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
    runIndex: index("conversation_messages_run_id_idx").on(table.runId)
  })
)

export const conversationMessageAttachmentsTable = sqliteTable(
  "conversation_message_attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    position: integer("position").notNull(),
    storagePath: text("storage_path").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    messageIndex: index("conversation_message_attachments_message_id_idx").on(table.messageId),
    conversationCreatedIndex: index("conversation_message_attachments_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    )
  })
)

export const queuedConversationMessagesTable = sqliteTable(
  "queued_conversation_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    content: text("content").notNull(),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    conversationPositionUnique: uniqueIndex("queued_conversation_messages_conversation_position_unique").on(
      table.conversationId,
      table.position
    ),
    conversationCreatedIndex: index("queued_conversation_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
    conversationReference: foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversationsTable.id]
    }).onDelete("cascade")
  })
)

export const queuedConversationMessageAttachmentsTable = sqliteTable(
  "queued_conversation_message_attachments",
  {
    id: text("id").primaryKey(),
    queuedMessageId: text("queued_message_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    position: integer("position").notNull(),
    storagePath: text("storage_path").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    queuedMessageIndex: index("queued_conversation_message_attachments_message_id_idx").on(table.queuedMessageId),
    conversationCreatedIndex: index("queued_conversation_message_attachments_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
    queuedMessageReference: foreignKey({
      columns: [table.queuedMessageId],
      foreignColumns: [queuedConversationMessagesTable.id]
    }).onDelete("cascade"),
    conversationReference: foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversationsTable.id]
    }).onDelete("cascade")
  })
)

export const executionRunsTable = sqliteTable(
  "execution_runs",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    worktreeId: text("worktree_id").notNull(),
    status: text("status").notNull(),
    lastSequence: integer("last_sequence").notNull().default(0),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    conversationStartedIndex: index("execution_runs_conversation_started_idx").on(
      table.conversationId,
      table.startedAt
    ),
    statusIndex: index("execution_runs_status_idx").on(table.status),
    runConversationUnique: uniqueIndex("execution_runs_id_conversation_unique").on(table.id, table.conversationId)
  })
)

export const runEventsTable = sqliteTable(
  "run_events",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    runId: text("run_id").notNull(),
    sequence: integer("sequence").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    providerEventId: text("provider_event_id"),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    runSequenceIndex: uniqueIndex("run_events_run_sequence_unique").on(table.runId, table.sequence),
    providerEventUnique: uniqueIndex("run_events_provider_event_unique")
      .on(table.runId, table.providerEventId)
      .where(sql`${table.providerEventId} IS NOT NULL`),
    conversationCreatedIndex: index("run_events_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
    runConversationReference: foreignKey({
      columns: [table.runId, table.conversationId],
      foreignColumns: [executionRunsTable.id, executionRunsTable.conversationId]
    }).onDelete("cascade")
  })
)

export const artifactsTable = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    runId: text("run_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title"),
    uri: text("uri"),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    conversationCreatedIndex: index("artifacts_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
    runIndex: index("artifacts_run_id_idx").on(table.runId),
    runConversationReference: foreignKey({
      columns: [table.runId, table.conversationId],
      foreignColumns: [executionRunsTable.id, executionRunsTable.conversationId]
    }).onDelete("cascade")
  })
)

export const appSettingsTable = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull()
})
