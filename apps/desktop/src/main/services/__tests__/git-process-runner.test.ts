import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { afterEach, describe, expect, it } from "vitest"
import { createGitProcessRunner } from "../git-process-runner"

const directories: string[] = []

const createRepository = () => {
  const root = mkdtempSync(join(tmpdir(), "teamcow-git-runner-"))
  directories.push(root)
  execFileSync("git", ["init", "-q", root])
  return root
}

afterEach(() => {
  while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true })
})

describe("git process runner", () => {
  it("runs Git without blocking APIs and bounds captured stdout", async () => {
    const root = createRepository()
    writeFileSync(join(root, "large.txt"), "x".repeat(4096))
    const runner = createGitProcessRunner({ maximumConcurrency: 2 })
    const result = await runner.run({
      worktreeRootPath: root,
      args: ["diff", "--no-index", "/dev/null", "large.txt"],
      maximumStdoutBytes: 128
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout.length).toBe(128)
    expect(result.stdoutByteLength).toBeGreaterThan(128)
    expect(result.stdoutTruncated).toBe(true)
  })

  it("deduplicates concurrent reads and serializes mutations per worktree", async () => {
    const root = createRepository()
    const runner = createGitProcessRunner({ maximumConcurrency: 4 })
    const first = runner.run({ worktreeRootPath: root, args: ["status", "--porcelain"], cacheTtlMs: 500 })
    const second = runner.run({ worktreeRootPath: root, args: ["status", "--porcelain"], cacheTtlMs: 500 })
    expect(await first).toEqual(await second)
    expect(runner.inspect().cachedReads).toBe(1)

    await Promise.all([
      runner.run({ worktreeRootPath: root, args: ["config", "teamcow.order", "first"], mutation: true }),
      runner.run({ worktreeRootPath: root, args: ["config", "teamcow.order", "second"], mutation: true })
    ])
    const value = await runner.run({ worktreeRootPath: root, args: ["config", "teamcow.order"] })
    expect(value.stdout.toString("utf8").trim()).toBe("second")
  })

  it("keeps the Node event loop responsive while Git is running", async () => {
    const root = createRepository()
    const runner = createGitProcessRunner({ maximumConcurrency: 1 })
    let timerFired = false
    const command = runner.run({
      worktreeRootPath: root,
      args: ["-c", "alias.teamcow-wait=!sleep 0.1", "teamcow-wait"]
    })
    setTimeout(() => {
      timerFired = true
    }, 0)

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(timerFired).toBe(true)
    expect((await command).exitCode).toBe(0)
  })

  it("makes reads queued after a mutation observe the serialized result", async () => {
    const root = createRepository()
    execFileSync("git", ["-C", root, "config", "teamcow.sequence", "before"])
    const runner = createGitProcessRunner({ maximumConcurrency: 2 })

    const mutation = runner.run({
      worktreeRootPath: root,
      args: [
        "-c",
        "alias.teamcow-mutate=!sleep 0.1 && git config teamcow.sequence after",
        "teamcow-mutate"
      ],
      mutation: true
    })
    const readAfterMutationWasQueued = runner.run({
      worktreeRootPath: root,
      args: ["config", "teamcow.sequence"],
      cacheTtlMs: 500
    })

    expect((await mutation).exitCode).toBe(0)
    expect((await readAfterMutationWasQueued).stdout.toString("utf8").trim()).toBe("after")
  })
})
