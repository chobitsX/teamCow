import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"
import {
  createAppDatabase,
  conversationMessageAttachmentsTable,
  queuedConversationMessageAttachmentsTable,
  queuedConversationMessagesTable,
  executionRunsTable,
  LATEST_DATABASE_VERSION,
  runEventsTable
} from "@db"

const temporaryDirectories: string[] = []

const createTemporaryDatabasePath = () => {
  const directory = mkdtempSync(join(tmpdir(), "teamcow-migration-test-"))
  temporaryDirectories.push(directory)
  return join(directory, "teamcow.sqlite")
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
  }
})

describe("database migrations", () => {
  it("upgrades a pre-migration database, backfills event sequence state, and is idempotent", () => {
    const databasePath = createTemporaryDatabasePath()
    const legacy = new Database(databasePath)
    legacy.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE worktrees (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        root_path TEXT NOT NULL,
        branch TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        worktree_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        run_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE execution_runs (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        worktree_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(id, conversation_id)
      );
      CREATE TABLE conversation_messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model TEXT,
        run_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE run_events (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(run_id, sequence)
      );
      INSERT INTO projects VALUES ('project-1', 'Legacy', '/tmp/legacy', 'ready', 't0', 't0');
      INSERT INTO worktrees VALUES ('worktree-1', 'project-1', 'default', '/tmp/legacy', 'main', 'ready', 't0', 't0');
      INSERT INTO conversations VALUES ('conversation-1', 'project-1', 'Legacy', 'worktree-1', 'codex', 'blocked', 't0', 't0');
      INSERT INTO execution_runs VALUES ('run-1', 'conversation-1', 'codex', 'gpt-5', 'worktree-1', 'running', 't0', NULL, 't0', 't0');
      INSERT INTO run_events VALUES ('event-1', 'conversation-1', 'run-1', 4, 'run.progress', '{}', 't0');
    `)
    legacy.close()

    const migrated = createAppDatabase(databasePath)
    expect(migrated.integrityCheck()).toEqual(["ok"])
    expect(migrated.db.select().from(executionRunsTable).get()?.lastSequence).toBe(4)
    expect(migrated.db.select().from(conversationMessageAttachmentsTable).all()).toEqual([])
    expect(migrated.db.select().from(queuedConversationMessagesTable).all()).toEqual([])
    expect(migrated.db.select().from(queuedConversationMessageAttachmentsTable).all()).toEqual([])
    migrated.close()

    const inspected = new Database(databasePath)
    expect(inspected.prepare("SELECT run_status FROM conversations").pluck().get()).toBe("unavailable")
    expect(inspected.prepare("SELECT COUNT(*) FROM schema_migrations").pluck().get()).toBe(
      LATEST_DATABASE_VERSION
    )
    expect(
      (inspected.prepare("PRAGMA table_info(run_events)").all() as Array<{ name: string }>).map(
        (column) => column.name
      )
    ).toEqual(expect.arrayContaining(["schema_version", "provider_event_id"]))
    inspected.close()

    const reopened = createAppDatabase(databasePath)
    expect(reopened.db.select().from(runEventsTable).all()).toHaveLength(1)
    expect(reopened.integrityCheck()).toEqual(["ok"])
    reopened.close()
  })

  it("advances the durable run sequence when an event is inserted outside the service", () => {
    const databasePath = createTemporaryDatabasePath()
    const database = createAppDatabase(databasePath)
    const now = "2026-08-17T00:00:00.000Z"

    const direct = new Database(databasePath)
    direct.pragma("foreign_keys = ON")
    direct.exec(`
      INSERT INTO projects VALUES ('project-1', 'Project', '/tmp/project', 'ready', '${now}', '${now}');
      INSERT INTO worktrees VALUES ('worktree-1', 'project-1', 'default', '/tmp/project', 'main', 'ready', '${now}', '${now}');
      INSERT INTO conversations VALUES ('conversation-1', 'project-1', 'Conversation', 'worktree-1', 'codex', 'gpt-5', 'worktree-write', 'running', '${now}', NULL, '${now}');
      INSERT INTO execution_runs VALUES ('run-1', 'conversation-1', 'codex', 'gpt-5', 'worktree-1', 'running', 0, '${now}', NULL, '${now}', '${now}');
      INSERT INTO run_events VALUES ('event-1', 'conversation-1', 'run-1', 7, 1, NULL, 'run.progress', '{}', '${now}');
    `)
    direct.close()

    expect(database.db.select().from(executionRunsTable).get()?.lastSequence).toBe(7)
    database.close()
  })
})
