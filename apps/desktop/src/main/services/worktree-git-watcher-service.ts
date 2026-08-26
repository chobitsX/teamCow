import { lstatSync, watch, type FSWatcher } from "node:fs"
import { resolve } from "node:path"
import { MAX_WORKTREE_GIT_CHANGED_PATHS, type WorktreeGitChangedEvent } from "@shared/index"
import type { LoggingService } from "./logging-service"
import { createGitProcessRunner } from "./git-process-runner"

export const WORKTREE_DEBOUNCE_MS = 300
export const GIT_DIR_DEBOUNCE_MS = 1_000

const IGNORED_GIT_DIR_TOP_LEVELS = new Set(["objects", "lfs", "logs"])
const IGNORED_GIT_DIR_FILES = new Set(["FETCH_HEAD"])

type WatchFactory = (
  path: string,
  options: { recursive: boolean },
  listener: (eventType: string, filename: string | Buffer | null) => void
) => FSWatcher

type PendingBatch = {
  hasGitDir: boolean
  hasUnknownWorktreePath: boolean
  paths: Set<string>
}

type WatchEntry = {
  rootPath: string
  rootIdentity: string
  gitMarkerIdentity: string
  gitDirs: string[]
  gitDirIdentities: string[]
  rootWatcher: FSWatcher
  gitWatchers: FSWatcher[]
  timer: ReturnType<typeof setTimeout> | null
  maxWaitTimer: ReturnType<typeof setTimeout> | null
  pending: PendingBatch | null
}

type WorktreeGitWatcherServiceDeps = {
  onChanged: (event: WorktreeGitChangedEvent) => void
  log?: Pick<LoggingService, "warn">
  watch?: WatchFactory
  resolveGitDirs?: (rootPath: string) => string[] | Promise<string[]>
  getPathIdentity?: (path: string, includeFileMetadata?: boolean) => string
}

export type WorktreeGitWatcher = {
  watchWorktree: (input: { worktreeId: string; rootPath: string }) => Promise<void>
  unwatchWorktree: (worktreeId: string) => void
  close: () => void
}

export const isStatusRelevantGitDirEvent = (filename: string | null | undefined) => {
  if (filename == null) return true
  const normalized = filename.replace(/\\/g, "/")
  if (!normalized) return true
  if (IGNORED_GIT_DIR_FILES.has(normalized)) return false
  const topLevel = normalized.split("/", 1)[0]
  return !IGNORED_GIT_DIR_TOP_LEVELS.has(topLevel)
}

const watcherGitProcessRunner = createGitProcessRunner({ maximumConcurrency: 2 })

export const resolveGitDirsFromHost = async (rootPath: string) => {
  const result = await watcherGitProcessRunner.run({
    worktreeRootPath: rootPath,
    args: [
    "rev-parse",
    "--path-format=absolute",
    "--git-dir",
    "--git-common-dir"
    ],
    timeoutMs: 5_000,
    maximumStdoutBytes: 1024 * 1024,
    cacheTtlMs: 1_000
  })
  if (result.error || result.exitCode !== 0) {
    throw result.error ?? new Error(result.stderr.toString("utf8").trim() || "git rev-parse failed")
  }
  const gitDirs = [...new Set(result.stdout.toString("utf8")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean))]
  if (gitDirs.length === 0) {
    throw new Error("git rev-parse returned no Git directories")
  }
  return gitDirs
}

const getPathIdentityFromHost = (path: string, includeFileMetadata = false) => {
  const stats = lstatSync(path)
  const base = `${stats.dev}:${stats.ino}:${stats.mode}`
  return includeFileMetadata && stats.isFile()
    ? `${base}:${stats.size}:${stats.mtimeMs}`
    : base
}

const normalizeWorktreePath = (filename: string | Buffer | null) => {
  if (filename == null) return null
  const normalized = filename.toString().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "")
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.includes("\0") ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null
  }
  return normalized
}

export const createWorktreeGitWatcherService = (
  deps: WorktreeGitWatcherServiceDeps
): WorktreeGitWatcher => {
  const watchPath = deps.watch ?? (watch as WatchFactory)
  const resolveGitDirs = deps.resolveGitDirs ?? resolveGitDirsFromHost
  const getPathIdentity = deps.getPathIdentity ?? getPathIdentityFromHost
  const getGitMarkerIdentity = (rootPath: string) =>
    getPathIdentity(resolve(rootPath, ".git"), true)
  const entries = new Map<string, WatchEntry>()
  let closed = false

  const logFailure = (event: string, worktreeId: string, rootPath: string, error: unknown) => {
    deps.log?.warn("git", event, {
      worktreeId,
      worktreeRootPath: rootPath,
      errorCode: "GIT_WATCH_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error)
    })
  }

  const closeWatcher = (watcher: FSWatcher, worktreeId: string, rootPath: string) => {
    try {
      watcher.close()
    } catch (error) {
      logFailure("git.watch.close.failed", worktreeId, rootPath, error)
    }
  }

  const closeEntry = (worktreeId: string, entry: WatchEntry) => {
    if (entries.get(worktreeId) === entry) {
      entries.delete(worktreeId)
    }
    if (entry.timer) {
      clearTimeout(entry.timer)
      entry.timer = null
    }
    if (entry.maxWaitTimer) {
      clearTimeout(entry.maxWaitTimer)
      entry.maxWaitTimer = null
    }
    entry.pending = null
    closeWatcher(entry.rootWatcher, worktreeId, entry.rootPath)
    for (const gitWatcher of entry.gitWatchers) {
      closeWatcher(gitWatcher, worktreeId, entry.rootPath)
    }
  }

  const flush = (worktreeId: string, entry: WatchEntry) => {
    if (closed || entries.get(worktreeId) !== entry) return
    const pending = entry.pending
    entry.pending = null
    if (entry.timer) {
      clearTimeout(entry.timer)
      entry.timer = null
    }
    if (entry.maxWaitTimer) {
      clearTimeout(entry.maxWaitTimer)
      entry.maxWaitTimer = null
    }
    if (!pending) return

    const event: WorktreeGitChangedEvent = pending.hasGitDir || pending.hasUnknownWorktreePath || pending.paths.size === 0
      ? { worktreeId }
      : { worktreeId, paths: [...pending.paths].sort() }
    try {
      deps.onChanged(event)
    } catch (error) {
      logFailure("git.watch.listener.failed", worktreeId, entry.rootPath, error)
    }
  }

  const scheduleFlush = (worktreeId: string, entry: WatchEntry) => {
    if (!entry.pending || entries.get(worktreeId) !== entry) return
    const gitOnly = entry.pending.hasGitDir &&
      !entry.pending.hasUnknownWorktreePath &&
      entry.pending.paths.size === 0
    if (gitOnly && entry.timer) return
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(
      () => flush(worktreeId, entry),
      gitOnly ? GIT_DIR_DEBOUNCE_MS : WORKTREE_DEBOUNCE_MS
    )
    if (!gitOnly && !entry.maxWaitTimer) {
      entry.maxWaitTimer = setTimeout(
        () => flush(worktreeId, entry),
        GIT_DIR_DEBOUNCE_MS
      )
    }
  }

  const getPending = (entry: WatchEntry) => {
    entry.pending ??= {
      hasGitDir: false,
      hasUnknownWorktreePath: false,
      paths: new Set()
    }
    return entry.pending
  }

  const handleRootEvent = (worktreeId: string, entry: WatchEntry, filename: string | Buffer | null) => {
    if (entries.get(worktreeId) !== entry) return
    const relativePath = normalizeWorktreePath(filename)
    if (relativePath?.startsWith(".git/")) return
    const pending = getPending(entry)
    if (!relativePath || relativePath === ".git" || pending.paths.size >= MAX_WORKTREE_GIT_CHANGED_PATHS) {
      pending.hasUnknownWorktreePath = true
      pending.paths.clear()
    } else if (!pending.hasUnknownWorktreePath) {
      pending.paths.add(relativePath)
    }
    scheduleFlush(worktreeId, entry)
  }

  const handleGitEvent = (worktreeId: string, entry: WatchEntry, filename: string | Buffer | null) => {
    const normalized = filename?.toString() ?? null
    if (entries.get(worktreeId) !== entry || !isStatusRelevantGitDirEvent(normalized)) return
    getPending(entry).hasGitDir = true
    scheduleFlush(worktreeId, entry)
  }

  const entryStillWatchesCurrentTargets = (entry: WatchEntry, rootPath: string) => {
    if (entry.rootPath !== rootPath) return false
    try {
      return entry.rootIdentity === getPathIdentity(rootPath) &&
        entry.gitMarkerIdentity === getGitMarkerIdentity(rootPath) &&
        entry.gitDirs.every((gitDir, index) =>
          entry.gitDirIdentities[index] === getPathIdentity(gitDir)
        )
    } catch {
      return false
    }
  }

  const watchWorktree: WorktreeGitWatcher["watchWorktree"] = async ({ worktreeId, rootPath }) => {
    if (closed) return
    const existing = entries.get(worktreeId)
    if (existing && entryStillWatchesCurrentTargets(existing, rootPath)) return
    if (existing) closeEntry(worktreeId, existing)

    let rootWatcher: FSWatcher | null = null
    const gitWatchers: FSWatcher[] = []
    try {
      const gitDirs = [...new Set(await resolveGitDirs(rootPath))]
      if (gitDirs.length === 0) {
        throw new Error("Git directory resolver returned no paths")
      }
      const rootIdentity = getPathIdentity(rootPath)
      const gitMarkerIdentity = getGitMarkerIdentity(rootPath)
      const gitDirIdentities = gitDirs.map((gitDir) => getPathIdentity(gitDir))
      const entryRef: { current: WatchEntry | null } = { current: null }
      rootWatcher = watchPath(rootPath, { recursive: true }, (_eventType, filename) => {
        if (entryRef.current) handleRootEvent(worktreeId, entryRef.current, filename)
      })
      for (const gitDir of gitDirs) {
        gitWatchers.push(watchPath(gitDir, { recursive: true }, (_eventType, filename) => {
          if (entryRef.current) handleGitEvent(worktreeId, entryRef.current, filename)
        }))
      }
      const entry: WatchEntry = {
        rootPath,
        rootIdentity,
        gitMarkerIdentity,
        gitDirs,
        gitDirIdentities,
        rootWatcher,
        gitWatchers,
        timer: null,
        maxWaitTimer: null,
        pending: null
      }
      entryRef.current = entry
      const handleError = (error: Error) => {
        if (entries.get(worktreeId) !== entry) return
        logFailure("git.watch.runtime.failed", worktreeId, rootPath, error)
        closeEntry(worktreeId, entry)
      }
      const handleUnexpectedClose = () => {
        if (entries.get(worktreeId) !== entry) return
        logFailure(
          "git.watch.runtime.closed",
          worktreeId,
          rootPath,
          new Error("A filesystem watcher closed unexpectedly")
        )
        closeEntry(worktreeId, entry)
      }
      rootWatcher.on("error", handleError)
      rootWatcher.on("close", handleUnexpectedClose)
      for (const gitWatcher of gitWatchers) {
        gitWatcher.on("error", handleError)
        gitWatcher.on("close", handleUnexpectedClose)
      }
      entries.set(worktreeId, entry)
    } catch (error) {
      if (rootWatcher) closeWatcher(rootWatcher, worktreeId, rootPath)
      for (const gitWatcher of gitWatchers) {
        closeWatcher(gitWatcher, worktreeId, rootPath)
      }
      logFailure("git.watch.start.failed", worktreeId, rootPath, error)
    }
  }

  const unwatchWorktree = (worktreeId: string) => {
    const entry = entries.get(worktreeId)
    if (entry) closeEntry(worktreeId, entry)
  }

  const close = () => {
    if (closed) return
    closed = true
    for (const [worktreeId, entry] of [...entries]) {
      closeEntry(worktreeId, entry)
    }
  }

  return { watchWorktree, unwatchWorktree, close }
}
