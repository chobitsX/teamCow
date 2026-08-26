import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { runDatabaseMigrations } from "./migrations"
import {
  appSettingsTable,
  artifactsTable,
  conversationMessageAttachmentsTable,
  conversationMessagesTable,
  conversationsTable,
  executionRunsTable,
  projectsTable,
  queuedConversationMessageAttachmentsTable,
  queuedConversationMessagesTable,
  runEventsTable,
  worktreesTable
} from "./schema"

type SqliteDatabase = import("better-sqlite3").Database

const databaseSchema = {
  projectsTable,
  worktreesTable,
  conversationsTable,
  conversationMessageAttachmentsTable,
  conversationMessagesTable,
  queuedConversationMessagesTable,
  queuedConversationMessageAttachmentsTable,
  executionRunsTable,
  runEventsTable,
  artifactsTable,
  appSettingsTable
}

export type TeamCowDatabase = BetterSQLite3Database<typeof databaseSchema>

export type AppDatabase = {
  db: TeamCowDatabase
  integrityCheck: () => string[]
  close: () => void
}

export const createAppDatabase = (dbFilePath: string): AppDatabase => {
  try {
    mkdirSync(dirname(dbFilePath), { recursive: true })
  } catch (err) {
    throw new Error(
      `TeamCow: failed to create data directory at ${dirname(dbFilePath)}: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  let sqlite: SqliteDatabase
  try {
    sqlite = new Database(dbFilePath)
  } catch (err) {
    throw new Error(
      `TeamCow: failed to open database at ${dbFilePath}: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  try {
    sqlite.pragma("journal_mode = WAL")
    sqlite.pragma("foreign_keys = ON")
    runDatabaseMigrations(sqlite)
    // A downgraded/legacy writer can still leave this retired value behind after
    // the one-time migration has run. Keep the read boundary self-healing.
    sqlite.exec("UPDATE conversations SET run_status = 'unavailable' WHERE run_status = 'blocked'")

    const quickCheck = (sqlite.pragma("quick_check") as Array<{ quick_check: string }>)
      .map((entry) => entry.quick_check)
    if (quickCheck.length !== 1 || quickCheck[0] !== "ok") {
      throw new Error(`TeamCow database quick check failed: ${quickCheck.join("; ") || "no result"}`)
    }
  } catch (error) {
    sqlite.close()
    throw error
  }

  const db = drizzle(sqlite, { schema: databaseSchema })

  return {
    db,
    integrityCheck: () =>
      (sqlite.pragma("integrity_check") as Array<{ integrity_check: string }>)
        .map((entry) => entry.integrity_check),
    close: () => {
      sqlite.pragma("wal_checkpoint(TRUNCATE)")
      sqlite.close()
    }
  }
}

export {
  appSettingsTable,
  artifactsTable,
  conversationMessageAttachmentsTable,
  conversationMessagesTable,
  conversationsTable,
  executionRunsTable,
  projectsTable,
  queuedConversationMessageAttachmentsTable,
  queuedConversationMessagesTable,
  runEventsTable,
  worktreesTable
}
export { LATEST_DATABASE_VERSION } from "./migrations"
