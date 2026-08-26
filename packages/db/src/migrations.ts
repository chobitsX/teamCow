import type Database from "better-sqlite3"

type SqliteDatabase = Database.Database

type DatabaseMigration = {
  version: number
  name: string
  up: (sqlite: SqliteDatabase) => void
}

const hasColumn = (sqlite: SqliteDatabase, table: string, column: string) =>
  (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .some((entry) => entry.name === column)

const addColumnIfMissing = (
  sqlite: SqliteDatabase,
  table: string,
  column: string,
  definition: string
) => {
  if (!hasColumn(sqlite, table, column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

const createLatestSchema = (sqlite: SqliteDatabase) => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS projects_root_path_unique ON projects(root_path);

    CREATE TABLE IF NOT EXISTS worktrees (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      root_path TEXT NOT NULL,
      branch TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    DROP INDEX IF EXISTS worktrees_project_kind_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS worktrees_project_root_path_unique ON worktrees(project_id, root_path);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      worktree_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      current_model TEXT,
      access_mode TEXT NOT NULL DEFAULT 'worktree-write',
      run_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      provider_session_id TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS conversations_project_id_idx ON conversations(project_id);

    CREATE TABLE IF NOT EXISTS execution_runs (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      worktree_id TEXT NOT NULL,
      status TEXT NOT NULL,
      last_sequence INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE,
      UNIQUE(id, conversation_id)
    );
    CREATE INDEX IF NOT EXISTS execution_runs_conversation_started_idx ON execution_runs(conversation_id, started_at);
    CREATE INDEX IF NOT EXISTS execution_runs_status_idx ON execution_runs(status);
    CREATE UNIQUE INDEX IF NOT EXISTS execution_runs_id_conversation_unique ON execution_runs(id, conversation_id);

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      run_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES execution_runs(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS conversation_messages_conversation_created_idx ON conversation_messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS conversation_messages_run_id_idx ON conversation_messages(run_id);

    CREATE TABLE IF NOT EXISTS conversation_message_attachments (
      id TEXT PRIMARY KEY NOT NULL,
      message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      position INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS conversation_message_attachments_message_id_idx
      ON conversation_message_attachments(message_id);
    CREATE INDEX IF NOT EXISTS conversation_message_attachments_conversation_created_idx
      ON conversation_message_attachments(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS queued_conversation_messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      content TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS queued_conversation_messages_conversation_position_unique
      ON queued_conversation_messages(conversation_id, position);
    CREATE INDEX IF NOT EXISTS queued_conversation_messages_conversation_created_idx
      ON queued_conversation_messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS queued_conversation_message_attachments (
      id TEXT PRIMARY KEY NOT NULL,
      queued_message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      position INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(queued_message_id) REFERENCES queued_conversation_messages(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS queued_conversation_message_attachments_message_id_idx
      ON queued_conversation_message_attachments(queued_message_id);
    CREATE INDEX IF NOT EXISTS queued_conversation_message_attachments_conversation_created_idx
      ON queued_conversation_message_attachments(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      provider_event_id TEXT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES execution_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(run_id, conversation_id) REFERENCES execution_runs(id, conversation_id) ON DELETE CASCADE,
      UNIQUE(run_id, sequence)
    );
    DROP INDEX IF EXISTS run_events_run_sequence_idx;
    CREATE UNIQUE INDEX IF NOT EXISTS run_events_run_sequence_unique ON run_events(run_id, sequence);
    CREATE INDEX IF NOT EXISTS run_events_conversation_created_idx ON run_events(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT,
      uri TEXT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES execution_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(run_id, conversation_id) REFERENCES execution_runs(id, conversation_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS artifacts_conversation_created_idx ON artifacts(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS artifacts_run_id_idx ON artifacts(run_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  // Databases created before migrations were introduced may already have the
  // table but not these later conversation columns. CREATE TABLE IF NOT EXISTS
  // intentionally does not alter an existing table, so keep the upgrade here.
  addColumnIfMissing(sqlite, "conversations", "current_model", "TEXT")
  addColumnIfMissing(sqlite, "conversations", "provider_session_id", "TEXT")
  addColumnIfMissing(
    sqlite,
    "conversations",
    "access_mode",
    "TEXT NOT NULL DEFAULT 'worktree-write'"
  )
}

const ensureRunEventEnvelope = (sqlite: SqliteDatabase) => {
  addColumnIfMissing(sqlite, "execution_runs", "last_sequence", "INTEGER NOT NULL DEFAULT 0")
  addColumnIfMissing(sqlite, "run_events", "schema_version", "INTEGER NOT NULL DEFAULT 1")
  addColumnIfMissing(sqlite, "run_events", "provider_event_id", "TEXT")

  sqlite.exec(`
    UPDATE execution_runs
    SET last_sequence = COALESCE((
      SELECT MAX(run_events.sequence)
      FROM run_events
      WHERE run_events.run_id = execution_runs.id
    ), 0);
    UPDATE run_events SET schema_version = 1 WHERE schema_version IS NULL OR schema_version < 1;
    CREATE INDEX IF NOT EXISTS execution_runs_status_idx ON execution_runs(status);
    CREATE INDEX IF NOT EXISTS conversation_messages_run_id_idx ON conversation_messages(run_id);
    CREATE UNIQUE INDEX IF NOT EXISTS run_events_provider_event_unique
      ON run_events(run_id, provider_event_id) WHERE provider_event_id IS NOT NULL;
    CREATE TRIGGER IF NOT EXISTS run_events_advance_sequence
    AFTER INSERT ON run_events
    BEGIN
      UPDATE execution_runs
      SET last_sequence = MAX(last_sequence, NEW.sequence)
      WHERE id = NEW.run_id;
    END;
  `)
}

const ensureConversationMessageAttachments = (sqlite: SqliteDatabase) => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversation_message_attachments (
      id TEXT PRIMARY KEY NOT NULL,
      message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      position INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS conversation_message_attachments_message_id_idx
      ON conversation_message_attachments(message_id);
    CREATE INDEX IF NOT EXISTS conversation_message_attachments_conversation_created_idx
      ON conversation_message_attachments(conversation_id, created_at);
  `)
}

const ensureQueuedConversationMessages = (sqlite: SqliteDatabase) => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS queued_conversation_messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      content TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS queued_conversation_messages_conversation_position_unique
      ON queued_conversation_messages(conversation_id, position);
    CREATE INDEX IF NOT EXISTS queued_conversation_messages_conversation_created_idx
      ON queued_conversation_messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS queued_conversation_message_attachments (
      id TEXT PRIMARY KEY NOT NULL,
      queued_message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      position INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(queued_message_id) REFERENCES queued_conversation_messages(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS queued_conversation_message_attachments_message_id_idx
      ON queued_conversation_message_attachments(queued_message_id);
    CREATE INDEX IF NOT EXISTS queued_conversation_message_attachments_conversation_created_idx
      ON queued_conversation_message_attachments(conversation_id, created_at);
  `)
}

const migrations: DatabaseMigration[] = [
  { version: 1, name: "initial-schema", up: createLatestSchema },
  { version: 2, name: "run-event-envelope-and-sequence", up: ensureRunEventEnvelope },
  {
    version: 3,
    name: "normalize-legacy-conversation-status",
    up: (sqlite) => {
      sqlite.exec("UPDATE conversations SET run_status = 'unavailable' WHERE run_status = 'blocked'")
    }
  },
  { version: 4, name: "conversation-message-attachments", up: ensureConversationMessageAttachments },
  { version: 5, name: "queued-conversation-messages", up: ensureQueuedConversationMessages }
]

export const LATEST_DATABASE_VERSION = migrations.at(-1)?.version ?? 0

export const runDatabaseMigrations = (
  sqlite: SqliteDatabase,
  now: () => string = () => new Date().toISOString()
) => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(
    (sqlite.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>)
      .map((entry) => entry.version)
  )
  const insertMigration = sqlite.prepare(
    "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)"
  )

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue
    }

    sqlite.exec("BEGIN IMMEDIATE")
    try {
      migration.up(sqlite)
      insertMigration.run(migration.version, migration.name, now())
      sqlite.exec("COMMIT")
    } catch (error) {
      sqlite.exec("ROLLBACK")
      throw new Error(
        `TeamCow database migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return LATEST_DATABASE_VERSION
}
