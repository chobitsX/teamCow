// @vitest-environment node
import { execFileSync } from "node:child_process"
import { EventEmitter } from "node:events"
import { mkdtempSync, realpathSync, rmSync, writeFileSync, type FSWatcher } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createWorktreeGitWatcherService,
  GIT_DIR_DEBOUNCE_MS,
  resolveGitDirsFromHost,
  WORKTREE_DEBOUNCE_MS
} from "../worktree-git-watcher-service"

class FakeWatcher extends EventEmitter {
  close = vi.fn()
}

describe("createWorktreeGitWatcherService", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const createFixture = () => {
    const watchers: Array<{
      path: string
      watcher: FakeWatcher
      listener: (eventType: string, filename: string | Buffer | null) => void
    }> = []
    const watch = vi.fn((
      path: string,
      _options: { recursive: boolean },
      listener: (eventType: string, filename: string | Buffer | null) => void
    ) => {
      const watcher = new FakeWatcher()
      watchers.push({ path, watcher, listener })
      return watcher as unknown as FSWatcher
    })
    const onChanged = vi.fn()
    const log = { warn: vi.fn() }
    const resolveGitDirs = vi.fn(() => ["/repo/.git/worktrees/feature"])
    const getPathIdentity = vi.fn((path: string) => `identity:${path}`)
    const service = createWorktreeGitWatcherService({
      watch,
      resolveGitDirs,
      getPathIdentity,
      onChanged,
      log
    })
    return { getPathIdentity, log, onChanged, resolveGitDirs, service, watch, watchers }
  }

  it("resolves both private and common Git directories for a real linked worktree", async () => {
    const parent = mkdtempSync(join(tmpdir(), "teamcow-git-watch-"))
    const repoRoot = join(parent, "repo")
    const worktreeRoot = join(parent, "feature")
    try {
      execFileSync("git", ["init", "-b", "main", repoRoot])
      writeFileSync(join(repoRoot, "README.md"), "base\n")
      execFileSync("git", ["-C", repoRoot, "add", "README.md"])
      execFileSync("git", [
        "-C",
        repoRoot,
        "-c",
        "user.name=TeamCow Test",
        "-c",
        "user.email=teamcow@example.test",
        "commit",
        "-m",
        "base"
      ])
      execFileSync("git", ["-C", repoRoot, "worktree", "add", "-b", "feature", worktreeRoot])

      const gitDirs = await resolveGitDirsFromHost(worktreeRoot)
      expect(gitDirs).toHaveLength(2)
      expect(gitDirs[0]).toContain("/.git/worktrees/")
      expect(gitDirs[1]).toBe(realpathSync(join(repoRoot, ".git")))
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it("shares one watcher pair per worktree and coalesces worktree paths", async () => {
    const fixture = createFixture()

    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })
    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })

    expect(fixture.watch).toHaveBeenCalledTimes(2)
    expect(fixture.watchers.map((entry) => entry.path)).toEqual([
      "/repo",
      "/repo/.git/worktrees/feature"
    ])

    fixture.watchers[0].listener("change", "src/app.ts")
    vi.advanceTimersByTime(100)
    fixture.watchers[0].listener("rename", Buffer.from("README.md"))
    vi.advanceTimersByTime(WORKTREE_DEBOUNCE_MS - 1)
    expect(fixture.onChanged).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(fixture.onChanged).toHaveBeenCalledTimes(1)
    expect(fixture.onChanged).toHaveBeenCalledWith({
      worktreeId: "worktree-1",
      paths: ["README.md", "src/app.ts"]
    })
  })

  it("watches linked-worktree and common Git directories without duplicates", async () => {
    const fixture = createFixture()
    fixture.resolveGitDirs.mockReturnValue([
      "/repo/.git/worktrees/feature",
      "/repo/.git",
      "/repo/.git"
    ])

    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })

    expect(fixture.watchers.map((entry) => entry.path)).toEqual([
      "/repo",
      "/repo/.git/worktrees/feature",
      "/repo/.git"
    ])
    fixture.watchers[2].listener("change", "refs/heads/feature")
    vi.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS)
    expect(fixture.onChanged).toHaveBeenCalledWith({ worktreeId: "worktree-1" })
  })

  it("caps sustained worktree debounce latency and oversized path batches", async () => {
    const fixture = createFixture()
    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })

    fixture.watchers[0].listener("change", "src/file-0.ts")
    for (let index = 1; index <= 4; index += 1) {
      vi.advanceTimersByTime(200)
      fixture.watchers[0].listener("change", `src/file-${index}.ts`)
    }
    vi.advanceTimersByTime(199)
    expect(fixture.onChanged).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fixture.onChanged).toHaveBeenCalledOnce()

    fixture.onChanged.mockClear()
    for (let index = 0; index <= 256; index += 1) {
      fixture.watchers[0].listener("change", `generated/file-${index}.txt`)
    }
    vi.advanceTimersByTime(WORKTREE_DEBOUNCE_MS)
    expect(fixture.onChanged).toHaveBeenCalledWith({ worktreeId: "worktree-1" })
  })

  it("filters git noise and keeps git-only debounce leading-anchored", async () => {
    const fixture = createFixture()
    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })
    const gitListener = fixture.watchers[1].listener

    gitListener("change", "objects/pack/pack-a")
    gitListener("change", "logs/HEAD")
    gitListener("change", "lfs/objects/a")
    gitListener("change", "FETCH_HEAD")
    vi.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS)
    expect(fixture.onChanged).not.toHaveBeenCalled()

    gitListener("change", "index")
    vi.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS - 100)
    gitListener("change", "refs/heads/main")
    vi.advanceTimersByTime(99)
    expect(fixture.onChanged).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(fixture.onChanged).toHaveBeenCalledOnce()
    expect(fixture.onChanged).toHaveBeenCalledWith({ worktreeId: "worktree-1" })
  })

  it("shortens a pending git-only batch when a worktree edit joins it", async () => {
    const fixture = createFixture()
    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })

    fixture.watchers[1].listener("change", "index")
    vi.advanceTimersByTime(100)
    fixture.watchers[0].listener("change", "src/app.ts")
    vi.advanceTimersByTime(WORKTREE_DEBOUNCE_MS)

    expect(fixture.onChanged).toHaveBeenCalledWith({ worktreeId: "worktree-1" })
    expect(fixture.onChanged).toHaveBeenCalledOnce()
  })

  it("ignores duplicate git coverage from the root watcher and fails open on unknown paths", async () => {
    const fixture = createFixture()
    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })

    fixture.watchers[0].listener("change", ".git/index")
    vi.advanceTimersByTime(WORKTREE_DEBOUNCE_MS)
    expect(fixture.onChanged).not.toHaveBeenCalled()

    fixture.watchers[0].listener("change", null)
    vi.advanceTimersByTime(WORKTREE_DEBOUNCE_MS)
    expect(fixture.onChanged).toHaveBeenCalledWith({ worktreeId: "worktree-1" })
  })

  it("drops failed entries so the next read can register them again", async () => {
    const fixture = createFixture()
    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })

    fixture.watchers[0].watcher.emit("error", new Error("root watch failed"))
    expect(fixture.watchers[0].watcher.close).toHaveBeenCalledOnce()
    expect(fixture.watchers[1].watcher.close).toHaveBeenCalledOnce()
    expect(fixture.log.warn).toHaveBeenCalled()

    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })
    expect(fixture.watch).toHaveBeenCalledTimes(4)
  })

  it("drops unexpectedly closed entries and replaces changed watch identities", async () => {
    const fixture = createFixture()
    let rootIdentity = "root-v1"
    fixture.getPathIdentity.mockImplementation((path) =>
      path === "/repo" ? rootIdentity : `identity:${path}`
    )
    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })

    fixture.watchers[1].watcher.emit("close")
    expect(fixture.watchers[0].watcher.close).toHaveBeenCalledOnce()
    expect(fixture.log.warn).toHaveBeenCalledWith(
      "git",
      "git.watch.runtime.closed",
      expect.objectContaining({ worktreeId: "worktree-1" })
    )

    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })
    expect(fixture.watch).toHaveBeenCalledTimes(4)
    rootIdentity = "root-v2"
    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })
    expect(fixture.watch).toHaveBeenCalledTimes(6)
    expect(fixture.watchers[2].watcher.close).toHaveBeenCalledOnce()
    expect(fixture.watchers[3].watcher.close).toHaveBeenCalledOnce()
  })

  it("replaces changed roots and closes individual or all watcher entries idempotently", async () => {
    const fixture = createFixture()
    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })
    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo-next" })

    expect(fixture.watchers[0].watcher.close).toHaveBeenCalledOnce()
    expect(fixture.watchers[1].watcher.close).toHaveBeenCalledOnce()
    expect(fixture.watch).toHaveBeenCalledTimes(4)

    fixture.service.unwatchWorktree("worktree-1")
    fixture.service.unwatchWorktree("worktree-1")
    expect(fixture.watchers[2].watcher.close).toHaveBeenCalledOnce()
    expect(fixture.watchers[3].watcher.close).toHaveBeenCalledOnce()

    await fixture.service.watchWorktree({ worktreeId: "worktree-2", rootPath: "/repo-2" })
    fixture.service.close()
    fixture.service.close()
    expect(fixture.watchers[4].watcher.close).toHaveBeenCalledOnce()
    expect(fixture.watchers[5].watcher.close).toHaveBeenCalledOnce()
    await expect(fixture.service.watchWorktree({ worktreeId: "worktree-3", rootPath: "/repo-3" })).resolves.toBeUndefined()
    expect(fixture.watch).toHaveBeenCalledTimes(6)
  })

  it("leaves no partial entry when watcher setup fails", async () => {
    const fixture = createFixture()
    fixture.watch.mockImplementationOnce((
      path: string,
      _options: { recursive: boolean },
      listener: (eventType: string, filename: string | Buffer | null) => void
    ) => {
      const watcher = new FakeWatcher()
      fixture.watchers.push({ path, watcher, listener })
      return watcher as unknown as FSWatcher
    }).mockImplementationOnce(() => {
      throw new Error("git watch failed")
    })

    await expect(fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })).resolves.toBeUndefined()
    expect(fixture.watchers[0].watcher.close).toHaveBeenCalledOnce()
    expect(fixture.log.warn).toHaveBeenCalled()

    await fixture.service.watchWorktree({ worktreeId: "worktree-1", rootPath: "/repo" })
    expect(fixture.watch).toHaveBeenCalledTimes(4)
  })
})
