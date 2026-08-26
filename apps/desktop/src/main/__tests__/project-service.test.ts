// @vitest-environment node
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { mkdtempSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { describe, expect, it, vi } from "vitest"
import {
  artifactsTable,
  conversationMessagesTable,
  conversationsTable,
  createAppDatabase,
  executionRunsTable,
  runEventsTable,
  worktreesTable
} from "@db"
import { createProjectService } from "../project-service"
import type { ProviderModelOption, TerminalOutputEvent } from "@shared/index"
import type { ProviderRunInput, ProviderRunResult } from "../services/provider-runtime-service"

const createTempDir = (prefix: string) => mkdtempSync(join(tmpdir(), prefix))

const makeGitRepo = (rootPath: string) => {
  mkdirSync(join(rootPath, ".git"), { recursive: true })
  writeFileSync(join(rootPath, ".git", "HEAD"), "ref: refs/heads/main\n")
}

const makeGitWorktreeRepo = (rootPath: string, gitDirPath: string) => {
  mkdirSync(gitDirPath, { recursive: true })
  writeFileSync(join(gitDirPath, "HEAD"), "ref: refs/heads/main\n")
  writeFileSync(join(rootPath, ".git"), `gitdir: ${gitDirPath}\n`)
}

const makeProjectedWorktreePath = (projectRootPath: string, branch: string) => {
  const safeBranch = branch
    .trim()
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/[\\/]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return join(dirname(projectRootPath), `${basename(projectRootPath)}-${safeBranch || "worktree"}`)
}

const waitForConversationRunStatus = async (
  service: ReturnType<typeof createProjectService>,
  conversationId: string,
  expectedStatus: string
) => {
  const deadline = Date.now() + 1000

  while (Date.now() < deadline) {
    const timeline = service.getConversationTimeline(conversationId)
    if (timeline.status === "ok" && timeline.timeline.runs[0]?.status === expectedStatus) {
      return timeline
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  throw new Error(`Timed out waiting for conversation ${conversationId} run status ${expectedStatus}`)
}

const countRows = (userDataPath: string, table: typeof conversationMessagesTable | typeof runEventsTable) => {
  const db = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
  const count = db.db.select().from(table).all().length
  db.close()
  return count
}

const closeService = (service: ReturnType<typeof createProjectService> | null) => {
  service?.close()
}

const seedConversation = (
  userDataPath: string,
  conversation: {
    id: string
    projectId: string
    title: string
    worktreeId: string
    provider: string
    currentModel?: string | null
    runStatus: string
    createdAt: string
    updatedAt: string
  }
) => {
  const db = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
  db.db.insert(conversationsTable).values(conversation).run()
  db.close()
}

const seedWorktree = (
  userDataPath: string,
  worktree: {
    id: string
    projectId: string
    kind: string
    rootPath: string
    branch: string | null
    status: string
    createdAt: string
    updatedAt: string
  }
) => {
  const db = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
  db.db.insert(worktreesTable).values(worktree).run()
  db.close()
}

const seedExecutionRun = (
  userDataPath: string,
  executionRun: {
    id: string
    conversationId: string
    provider: string
    model: string
    worktreeId: string
    status: string
    startedAt: string
    completedAt: string | null
    createdAt: string
    updatedAt: string
  }
) => {
  const db = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
  db.db.insert(executionRunsTable).values(executionRun).run()
  db.close()
}

const createConversationFileFixture = async (input?: {
  runStatus?: string
  executionRunStatus?: string
  now?: string
  serviceDeps?: Partial<Parameters<typeof createProjectService>[0]>
}) => {
  const userDataPath = createTempDir("teamcow-conversation-file-")
  const repoRoot = createTempDir("teamcow-conversation-file-repo-")
  makeGitRepo(repoRoot)

  const service = createProjectService({
    userDataPath,
    pickProjectDirectory: async () => null,
    confirmGitInit: async () => false,
    gitBinaryAvailable: () => false,
    initializeGit: () => null,
    now: () => input?.now ?? "2026-07-07T00:00:00.000Z",
    ...(input?.serviceDeps ?? {})
  } as never)

  const imported = await service.importProject({ directoryPath: repoRoot })
  if (imported.status !== "imported") {
    throw new Error("expected imported project")
  }

  seedConversation(userDataPath, {
    id: "conversation-file-editor",
    projectId: imported.project.id,
    title: "File editor",
    worktreeId: imported.project.defaultWorktree.id,
    provider: "codex",
    currentModel: "gpt-5.5",
    runStatus: input?.runStatus ?? "completed",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z"
  })

  if (input?.executionRunStatus) {
    seedExecutionRun(userDataPath, {
      id: "conversation-file-run",
      conversationId: "conversation-file-editor",
      provider: "codex",
      model: "gpt-5.5",
      worktreeId: imported.project.defaultWorktree.id,
      status: input.executionRunStatus,
      startedAt: "2026-07-07T00:00:00.000Z",
      completedAt: input.executionRunStatus === "running" ? null : "2026-07-07T00:01:00.000Z",
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:00.000Z"
    })
  }

  return {
    service,
    userDataPath,
    repoRoot,
    imported,
    conversation: {
      id: "conversation-file-editor",
      worktreeId: imported.project.defaultWorktree.id
    }
  }
}

const runGit = (rootPath: string, args: string[]) =>
  execFileSync("git", ["-C", rootPath, ...args], { encoding: "utf8" })

const createRecordingGitCommandRunner = (commands: string[][]) => (rootPath: string, args: string[]) => {
  commands.push([...args])
  try {
    return { status: "ok" as const, stdout: runGit(rootPath, args), stderr: "" }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      status: "error" as const,
      error: {
        code: "GIT_STATUS_FAILED" as const,
        message: `git ${args[0] ?? "command"} failed for ${rootPath}`,
        suggestion: message,
        domain: "git" as const
      }
    }
  }
}

const createConversationChangesMutationFixture = async (input?: {
  unborn?: boolean
  serviceDeps?: Partial<Parameters<typeof createProjectService>[0]>
}) => {
  const userDataPath = createTempDir("teamcow-conversation-changes-mutation-")
  const repoRoot = createTempDir("teamcow-conversation-changes-mutation-repo-")
  runGit(repoRoot, ["init"])
  runGit(repoRoot, ["checkout", "-b", "main"])
  runGit(repoRoot, ["config", "user.name", "Team Cow Tests"])
  runGit(repoRoot, ["config", "user.email", "teamcow-tests@example.com"])
  mkdirSync(join(repoRoot, "src"), { recursive: true })

  if (!input?.unborn) {
    writeFileSync(join(repoRoot, ".gitignore"), "ignored.txt\n")
    writeFileSync(join(repoRoot, ":!literal.ts"), "literal base\n")
    writeFileSync(join(repoRoot, ":(glob)*.ts"), "glob literal base\n")
    writeFileSync(join(repoRoot, "other-root.ts"), "other root base\n")
    writeFileSync(join(repoRoot, "src", "one.ts"), "one base\n")
    writeFileSync(join(repoRoot, "src", "two -> 新.ts"), "two base\n")
    writeFileSync(join(repoRoot, "src", "dual.ts"), "dual base\n")
    writeFileSync(join(repoRoot, "src", "unstaged-only.ts"), "unstaged base\n")
    runGit(repoRoot, ["--literal-pathspecs", "add", "--", ".gitignore", ":!literal.ts", ":(glob)*.ts", "other-root.ts", "src"])
    runGit(repoRoot, ["commit", "-m", "initial"])
  }

  const service = createProjectService({
    userDataPath,
    pickProjectDirectory: async () => null,
    confirmGitInit: async () => false,
    gitBinaryAvailable: () => false,
    initializeGit: () => null,
    now: () => "2026-07-10T04:00:00.000Z",
    ...(input?.serviceDeps ?? {})
  } as never)
  const imported = await service.importProject({ directoryPath: repoRoot })
  if (imported.status !== "imported") {
    throw new Error("expected imported project")
  }

  seedConversation(userDataPath, {
    id: "conversation-changes-mutation",
    projectId: imported.project.id,
    title: "Conversation changes mutation",
    worktreeId: imported.project.defaultWorktree.id,
    provider: "codex",
    runStatus: "idle",
    createdAt: "2026-07-10T03:00:00.000Z",
    updatedAt: "2026-07-10T03:00:00.000Z"
  })

  return {
    imported,
    repoRoot,
    service,
    userDataPath
  }
}

const discardConversationChangesAtCurrentRevision = async (
  service: ReturnType<typeof createProjectService>,
  input: { conversationId: string; scope: { type: "all" } | { type: "file"; filePath: string } }
) => {
  const current = await service.getConversationChanges({ conversationId: input.conversationId })
  if (current.status !== "ok") throw new Error("expected current conversation changes")
  return service.discardConversationChanges({ ...input, expectedRevision: current.changes.revision })
}

const createConversationChangesFixture = async (input?: {
  serviceDeps?: Partial<Parameters<typeof createProjectService>[0]>
}) => {
  const userDataPath = createTempDir("teamcow-conversation-changes-")
  const repoRoot = createTempDir("teamcow-conversation-changes-repo-")
  mkdirSync(join(repoRoot, "src"), { recursive: true })
  runGit(repoRoot, ["init"])
  runGit(repoRoot, ["checkout", "-b", "main"])
  runGit(repoRoot, ["config", "user.name", "Team Cow Tests"])
  runGit(repoRoot, ["config", "user.email", "teamcow-tests@example.com"])
  runGit(repoRoot, ["config", "status.renames", "copies"])

  writeFileSync(join(repoRoot, "src", "both.ts"), "base\n")
  writeFileSync(join(repoRoot, "src", "unstaged.ts"), "base\n")
  writeFileSync(join(repoRoot, "src", "deleted.ts"), "delete me\n")
  writeFileSync(join(repoRoot, "src", "rename-source.ts"), "rename me\n")
  writeFileSync(join(repoRoot, "src", "copy-source.ts"), "copy me\n")
  writeFileSync(join(repoRoot, "src", "binary.dat"), Buffer.from([0, 1, 2, 3]))
  writeFileSync(join(repoRoot, "src", "large.ts"), "base\n")
  writeFileSync(join(repoRoot, "src", "conflicted.ts"), "base\n")
  writeFileSync(join(repoRoot, "src", "mode-only.sh"), "#!/bin/sh\necho mode\n")
  writeFileSync(join(repoRoot, "src", "[literal].ts"), "literal base\n")
  runGit(repoRoot, ["add", "--", "src"])
  runGit(repoRoot, ["commit", "-m", "initial"])

  runGit(repoRoot, ["checkout", "-b", "conflict-side"])
  writeFileSync(join(repoRoot, "src", "conflicted.ts"), "side\n")
  runGit(repoRoot, ["add", "--", "src/conflicted.ts"])
  runGit(repoRoot, ["commit", "-m", "side conflict"])
  runGit(repoRoot, ["checkout", "main"])
  writeFileSync(join(repoRoot, "src", "conflicted.ts"), "main\n")
  runGit(repoRoot, ["add", "--", "src/conflicted.ts"])
  runGit(repoRoot, ["commit", "-m", "main conflict"])
  try {
    runGit(repoRoot, ["merge", "conflict-side"])
  } catch {
    // The unresolved merge is the fixture state under test.
  }

  writeFileSync(join(repoRoot, "src", "both.ts"), "staged\n")
  runGit(repoRoot, ["add", "--", "src/both.ts"])
  writeFileSync(join(repoRoot, "src", "both.ts"), "staged\nworktree\n")
  writeFileSync(join(repoRoot, "src", "unstaged.ts"), "unstaged\n")
  rmSync(join(repoRoot, "src", "deleted.ts"))
  runGit(repoRoot, ["mv", "--", "src/rename-source.ts", "src/renamed -> 新.ts"])
  writeFileSync(join(repoRoot, "src", "copy-target.ts"), "copy me\n")
  writeFileSync(join(repoRoot, "src", "copy-source.ts"), "copy source changed\n")
  runGit(repoRoot, ["add", "--", "src/copy-source.ts", "src/copy-target.ts"])
  writeFileSync(join(repoRoot, "src", "binary.dat"), Buffer.from([0, 9, 8, 7, 6]))
  writeFileSync(join(repoRoot, "src", "large.ts"), `${"expanded line content\n".repeat(35_000)}tail without newline`)
  chmodSync(join(repoRoot, "src", "mode-only.sh"), 0o755)
  writeFileSync(join(repoRoot, "src", "[literal].ts"), "literal changed\n")

  const untrackedTextPath = "src/untracked -> 新\tname.ts"
  const untrackedBinaryPath = "src/untracked-binary.dat"
  const untrackedLargeBinaryPath = "src/untracked-large-binary.dat"
  const untrackedLargePath = "src/untracked-large.ts"
  writeFileSync(join(repoRoot, untrackedTextPath), "alpha\nbeta\n")
  writeFileSync(join(repoRoot, untrackedBinaryPath), Buffer.from([0, 4, 5, 6]))
  writeFileSync(join(repoRoot, untrackedLargeBinaryPath), Buffer.concat([
    Buffer.from([0, 4, 5, 6]),
    Buffer.alloc((512 * 1024) + 1, 7)
  ]))
  writeFileSync(join(repoRoot, untrackedLargePath), "large untracked line\n".repeat(30_000))

  const service = createProjectService({
    userDataPath,
    pickProjectDirectory: async () => null,
    confirmGitInit: async () => false,
    gitBinaryAvailable: () => false,
    initializeGit: () => null,
    now: () => "2026-07-10T04:00:00.000Z",
    ...(input?.serviceDeps ?? {})
  } as never)
  const imported = await service.importProject({ directoryPath: repoRoot })
  if (imported.status !== "imported") {
    throw new Error("expected imported project")
  }

  seedConversation(userDataPath, {
    id: "conversation-changes",
    projectId: imported.project.id,
    title: "Conversation changes",
    worktreeId: imported.project.defaultWorktree.id,
    provider: "codex",
    runStatus: "idle",
    createdAt: "2026-07-10T03:00:00.000Z",
    updatedAt: "2026-07-10T03:00:00.000Z"
  })

  return {
    imported,
    repoRoot,
    service,
    untrackedBinaryPath,
    untrackedLargeBinaryPath,
    untrackedLargePath,
    untrackedTextPath,
    userDataPath
  }
}

describe("createProjectService", () => {
  it("imports an existing git repo, persists the default worktree, and survives restart", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoot = createTempDir("teamcow-repo-")
    const canonicalRepoRoot = realpathSync(repoRoot)
    const nestedPath = join(repoRoot, "packages", "desktop")
    mkdirSync(nestedPath, { recursive: true })
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const firstImport = await service.importProject({ directoryPath: nestedPath })
    expect(firstImport.status).toBe("imported")
    if (firstImport.status !== "imported") {
      throw new Error("expected imported project")
    }

    expect(firstImport.initializedGit).toBe(false)
    expect(firstImport.project.rootPath).toBe(canonicalRepoRoot)
    expect(firstImport.project.defaultWorktree.rootPath).toBe(canonicalRepoRoot)
    expect(firstImport.project.defaultWorktree.branch).toBe("main")
    expect(firstImport.context.selectedProjectId).toBe(firstImport.project.id)
    expect(firstImport.context.shell.projectName).toBe(firstImport.project.name)
    expect(service.listProjects()).toHaveLength(1)

    const duplicateImport = await service.importProject({ directoryPath: nestedPath })
    expect(duplicateImport.status).toBe("existing")
    if (duplicateImport.status !== "existing") {
      throw new Error("expected existing project")
    }
    expect(duplicateImport.context.projects).toHaveLength(1)

    service.close()

    const restartedService = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const restartedContext = restartedService.getAppContext()
    expect(restartedContext.projects).toHaveLength(1)
    expect(restartedContext.selectedProjectId).toBe(firstImport.project.id)
    expect(restartedContext.shell.projectName).toBe(firstImport.project.name)
    restartedService.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("prompts to initialize git for non-git projects when git is available", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const projectRoot = createTempDir("teamcow-plain-")
    const canonicalProjectRoot = realpathSync(projectRoot)
    const initSpy = vi.fn((directoryPath: string) => {
      makeGitRepo(directoryPath)
      return null
    })

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => true,
      gitBinaryAvailable: () => true,
      initializeGit: initSpy
    })

    const result = await service.importProject({ directoryPath: projectRoot })
    expect(result.status).toBe("imported")
    if (result.status !== "imported") {
      throw new Error("expected imported project")
    }

    expect(result.initializedGit).toBe(true)
    expect(initSpy).toHaveBeenCalledWith(canonicalProjectRoot)
    expect(result.project.defaultWorktree.rootPath).toBe(canonicalProjectRoot)
    expect(result.project.defaultWorktree.branch).toBe("main")
    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(projectRoot, { recursive: true, force: true })
  })

  it("blocks non-git projects when git is unavailable", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const projectRoot = createTempDir("teamcow-no-git-")

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const result = await service.importProject({ directoryPath: projectRoot })
    expect(result.status).toBe("error")
    if (result.status !== "error") {
      throw new Error("expected error result")
    }

    expect(result.error.code).toBe("GIT_NOT_INSTALLED")
    expect(result.error.message).toContain("git --version probe failed")
    expect(service.listProjects()).toHaveLength(0)
    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(projectRoot, { recursive: true, force: true })
  })

  it("preserves diagnostic details when git initialization fails", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const projectRoot = createTempDir("teamcow-git-init-fail-")

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => true,
      gitBinaryAvailable: () => true,
      initializeGit: () => ({
        code: "GIT_INIT_FAILED",
        message: "git init failed in test fixture",
        suggestion: "fatal: unable to write new index file"
      })
    })

    const result = await service.importProject({ directoryPath: projectRoot })
    expect(result.status).toBe("error")
    if (result.status !== "error") {
      throw new Error("expected error result")
    }

    expect(result.error.code).toBe("GIT_INIT_FAILED")
    expect(result.error.message).toContain("git init failed")
    expect(result.error.suggestion).toContain("fatal:")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(projectRoot, { recursive: true, force: true })
  })

  it("rolls back the transaction when default worktree creation fails", () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoot = createTempDir("teamcow-rollback-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    expect(() =>
      service.persistImportedProject(repoRoot, false, {
        afterProjectInsert: () => {
          throw new Error("boom")
        }
      })
    ).toThrow("boom")

    expect(service.listProjects()).toHaveLength(0)
    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("switches the selected project without changing the persisted project list", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoOne = createTempDir("teamcow-repo-one-")
    const repoTwo = createTempDir("teamcow-repo-two-")
    makeGitRepo(repoOne)
    makeGitRepo(repoTwo)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const first = await service.importProject({ directoryPath: repoOne })
    const second = await service.importProject({ directoryPath: repoTwo })

    if (first.status !== "imported" || second.status !== "imported") {
      throw new Error("expected imported projects")
    }

    const switched = await service.selectProject(first.project.id)
    expect(switched.status).toBe("ok")
    if (switched.status !== "ok") {
      throw new Error("expected ok result")
    }

    expect(switched.context.projects).toHaveLength(2)
    expect(switched.context.selectedProjectId).toBe(first.project.id)
    expect(switched.context.shell.projectName).toBe(first.project.name)
    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoOne, { recursive: true, force: true })
    rmSync(repoTwo, { recursive: true, force: true })
  })

  it("removes a project from the workspace and restores its conversations when the same path is imported again", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoot = createTempDir("teamcow-restorable-project-")
    makeGitRepo(repoRoot)

    const createService = () => createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    let service = createService()
    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-restored",
      projectId: imported.project.id,
      title: "Preserved conversation",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "completed",
      createdAt: "2026-08-26T01:00:00.000Z",
      updatedAt: "2026-08-26T01:00:00.000Z"
    })

    const removed = service.removeProject(imported.project.id)
    expect(removed.status).toBe("ok")
    expect(service.listProjects()).toEqual([])
    expect(service.listConversationsByProject(imported.project.id).map((conversation) => conversation.title))
      .toEqual(["Preserved conversation"])

    service.close()
    service = createService()
    expect(service.getAppContext().projects).toEqual([])

    const restored = await service.importProject({ directoryPath: repoRoot })
    expect(restored.status).toBe("restored")
    if (restored.status !== "restored") {
      throw new Error("expected restored project")
    }
    expect(restored.project.id).toBe(imported.project.id)
    expect(restored.project.conversations.map((conversation) => conversation.title))
      .toEqual(["Preserved conversation"])
    expect(restored.context.selectedProjectId).toBe(imported.project.id)

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("persists project top and bottom ordering", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoots = [
      createTempDir("teamcow-order-one-"),
      createTempDir("teamcow-order-two-"),
      createTempDir("teamcow-order-three-")
    ]
    repoRoots.forEach(makeGitRepo)

    const createService = () => createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    let service = createService()
    const imported = []
    for (const directoryPath of repoRoots) {
      imported.push(await service.importProject({ directoryPath }))
    }
    if (imported.some((result) => result.status !== "imported")) {
      throw new Error("expected imported projects")
    }
    const projectIds = imported.map((result) => result.status === "imported" ? result.project.id : "")

    expect(service.moveProject({ projectId: projectIds[0], position: "bottom" }).status).toBe("ok")
    expect(service.listProjects().map((project) => project.id)).toEqual([projectIds[1], projectIds[2], projectIds[0]])

    expect(service.moveProject({ projectId: projectIds[2], position: "top" }).status).toBe("ok")
    expect(service.listProjects().map((project) => project.id)).toEqual([projectIds[2], projectIds[1], projectIds[0]])

    service.close()
    service = createService()
    expect(service.listProjects().map((project) => project.id)).toEqual([projectIds[2], projectIds[1], projectIds[0]])

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    repoRoots.forEach((repoRoot) => rmSync(repoRoot, { recursive: true, force: true }))
  })

  it("reveals a project root in Finder", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoot = createTempDir("teamcow-reveal-project-")
    makeGitRepo(repoRoot)
    const openExternalAppPath = vi.fn(async () => "")

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      openExternalAppPath
    })
    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const revealed = await service.revealProjectInFinder(imported.project.id)
    expect(revealed).toEqual({
      status: "opened",
      projectId: imported.project.id,
      targetPath: realpathSync(repoRoot)
    })
    expect(openExternalAppPath).toHaveBeenCalledWith({
      appId: "finder",
      appName: "Finder",
      bundleId: "com.apple.finder",
      targetPath: realpathSync(repoRoot)
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("lists conversations for a project and selects one as the active conversation", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoot = createTempDir("teamcow-conversations-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-1",
      projectId: imported.project.id,
      title: "Navigation cleanup",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-05-09T08:00:00.000Z",
      updatedAt: "2026-05-09T08:00:00.000Z"
    })
    seedConversation(userDataPath, {
      id: "conversation-2",
      projectId: imported.project.id,
      title: "Inspector polish",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "claude",
      runStatus: "running",
      createdAt: "2026-05-09T09:00:00.000Z",
      updatedAt: "2026-05-09T09:05:00.000Z"
    })

    const contextBeforeSelection = service.getAppContext()
    expect(contextBeforeSelection.shell.conversationTitle).toBeNull()
    expect(contextBeforeSelection.selectedConversationId).toBeNull()

    const conversations = service.listConversationsByProject(imported.project.id)
    expect(conversations).toHaveLength(2)
    expect(conversations.map((conversation) => conversation.title)).toEqual([
      "Inspector polish",
      "Navigation cleanup"
    ])

    const selected = await service.selectConversation("conversation-2")
    expect(selected.status).toBe("ok")
    if (selected.status !== "ok") {
      throw new Error("expected ok result")
    }

    expect(selected.context.selectedProjectId).toBe(imported.project.id)
    expect(selected.context.selectedConversationId).toBe("conversation-2")
    expect(selected.context.shell.conversationTitle).toBe("Inspector polish")
    expect(selected.context.shell.providerKind).toBe("claude")
    expect(selected.context.shell.runStatus).toBe("running")
    expect(service.getCurrentConversation()?.id).toBe("conversation-2")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("maps legacy blocked conversation status to unavailable on database open", async () => {
    const userDataPath = createTempDir("teamcow-legacy-status-")
    const repoRoot = createTempDir("teamcow-legacy-status-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    service.close()

    seedConversation(userDataPath, {
      id: "conversation-legacy",
      projectId: imported.project.id,
      title: "Legacy status",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "blocked",
      createdAt: "2026-05-09T08:00:00.000Z",
      updatedAt: "2026-05-09T08:00:00.000Z"
    })

    const restartedService = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    expect(restartedService.listConversationsByProject(imported.project.id)[0].runStatus).toBe("unavailable")

    restartedService.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("reads branches from absolute gitdir pointers used by worktrees", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoot = createTempDir("teamcow-worktree-")
    const gitDirPath = createTempDir("teamcow-gitdir-")
    makeGitWorktreeRepo(repoRoot, gitDirPath)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    expect(imported.status).toBe("imported")
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    expect(imported.project.defaultWorktree.branch).toBe("main")
    expect(imported.context.shell.worktreeBranch).toBe("main")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(gitDirPath, { recursive: true, force: true })
  })

  it("defaults locale to 'en' on first access and persists locale changes across restarts", () => {
    const userDataPath = createTempDir("teamcow-db-")

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    expect(service.getLocale()).toBe("en")

    service.setLocale("zh")
    expect(service.getLocale()).toBe("zh")

    service.close()

    const restartedService = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    expect(restartedService.getLocale()).toBe("zh")

    restartedService.setLocale("en")
    expect(restartedService.getLocale()).toBe("en")

    restartedService.close()
    rmSync(userDataPath, { recursive: true, force: true })
  })

  it("defaults app theme to dark and persists updates", () => {
    const userDataPath = createTempDir("teamcow-db-")

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    expect(service.getAppTheme()).toBe("dark")
    service.setAppTheme("light")
    expect(service.getAppTheme()).toBe("light")
    service.setAppTheme("system")
    expect(service.getAppTheme()).toBe("system")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
  })

  it("lists default and git worktrees for a project in execution-target order", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoot = createTempDir("teamcow-list-worktrees-")
    const altWorktreeRoot = createTempDir("teamcow-list-worktrees-alt-")
    makeGitRepo(repoRoot)
    makeGitRepo(altWorktreeRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedWorktree(userDataPath, {
      id: "worktree-2",
      projectId: imported.project.id,
      kind: "git_worktree",
      rootPath: altWorktreeRoot,
      branch: "feat/new-conversation",
      status: "ready",
      createdAt: "2026-05-16T10:00:00.000Z",
      updatedAt: "2026-05-16T10:00:00.000Z"
    })

    const worktrees = service.listWorktreesByProject(imported.project.id)
    expect(worktrees).toHaveLength(2)
    expect(worktrees[0].kind).toBe("default")
    expect(worktrees[1]).toMatchObject({
      kind: "git_worktree",
      branch: "feat/new-conversation",
      rootPath: altWorktreeRoot
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(altWorktreeRoot, { recursive: true, force: true })
  })

  it("creates a new conversation bound to the default worktree and marks it current", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoot = createTempDir("teamcow-create-conversation-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-05-16T10:00:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: {
        type: "default"
      }
    })

    expect(created.status).toBe("created")
    if (created.status !== "created") {
      throw new Error("expected created result")
    }

    expect(created.conversation.projectId).toBe(imported.project.id)
    expect(created.conversation.worktreeId).toBe(imported.project.defaultWorktree.id)
    expect(created.conversation.provider.kind).toBe("codex")
    expect(created.conversation.accessMode).toBe("worktree-write")
    expect(created.context.selectedConversationId).toBe(created.conversation.id)
    expect(created.context.shell.providerKind).toBe("codex")
    expect(created.context.shell.runStatus).toBe("idle")
    expect(service.getCurrentConversation()?.id).toBe(created.conversation.id)

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("opens the conversation-bound worktree directory through the injected system opener", async () => {
    const userDataPath = createTempDir("teamcow-handoff-")
    const repoRoot = createTempDir("teamcow-handoff-repo-")
    const openedPaths: Array<{ editorId: string; appName: string; bundleId?: string | null; targetPath: string }> = []
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      listInstalledEditors: () => ["cursor"],
      openEditorPath: async (input: { editorId: string; appName: string; bundleId?: string | null; targetPath: string }) => {
        openedPaths.push(input)
        return ""
      },
      now: () => "2026-06-02T06:50:00.000Z"
    } as never)

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }
    await (service as unknown as { setSelectedEditor: (input: { editorId: string }) => Promise<unknown> })
      .setSelectedEditor({ editorId: "cursor" })

    const result = await (service as unknown as {
      openConversationHandoff: (input: { conversationId: string; target: "worktree" }) => Promise<unknown>
    }).openConversationHandoff({
      conversationId: created.conversation.id,
      target: "worktree"
    })

    expect(result).toEqual({
      status: "opened",
      conversationId: created.conversation.id,
      worktreeId: imported.project.defaultWorktree.id,
      targetKind: "worktree",
      targetPath: realpathSync(repoRoot)
    })
    expect(openedPaths).toEqual([{
      editorId: "cursor",
      appName: "Cursor",
      bundleId: "com.todesktop.230313mzl4w4u92",
      targetPath: realpathSync(repoRoot)
    }])

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("defaults conversation handoff to the first available coding editor", async () => {
    const userDataPath = createTempDir("teamcow-handoff-default-editor-")
    const repoRoot = createTempDir("teamcow-handoff-default-editor-repo-")
    const openedPaths: Array<{ editorId: string; appName: string; bundleId?: string | null; targetPath: string }> = []
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      listInstalledEditors: () => ["antigravity-ide", "cursor"],
      openEditorPath: async (input: { editorId: string; appName: string; bundleId?: string | null; targetPath: string }) => {
        openedPaths.push(input)
        return ""
      },
      now: () => "2026-06-02T06:50:30.000Z"
    } as never)

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const selectedEditor = (service as unknown as { getSelectedEditor: () => unknown }).getSelectedEditor()
    expect(selectedEditor).toMatchObject({ status: "ok", selectedEditorId: "cursor" })

    const result = await (service as unknown as {
      openConversationHandoff: (input: { conversationId: string; target: "worktree" }) => Promise<unknown>
    }).openConversationHandoff({
      conversationId: created.conversation.id,
      target: "worktree"
    })

    expect(result).toMatchObject({
      status: "opened",
      conversationId: created.conversation.id,
      worktreeId: imported.project.defaultWorktree.id,
      targetKind: "worktree",
      targetPath: realpathSync(repoRoot)
    })
    expect(openedPaths).toEqual([{
      editorId: "cursor",
      appName: "Cursor",
      bundleId: "com.todesktop.230313mzl4w4u92",
      targetPath: realpathSync(repoRoot)
    }])

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("lists available external open apps and opens the conversation worktree with the selected app", async () => {
    const userDataPath = createTempDir("teamcow-external-open-")
    const repoRoot = createTempDir("teamcow-external-open-repo-")
    const openedPaths: Array<{
      appId: string
      appName: string
      bundleId?: string | null
      targetPath: string
    }> = []
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      listInstalledExternalOpenApps: () => ["cmux", "cursor", "antigravity-ide"],
      getExternalAppIconDataUrl: ({ appId }: { appId: string }) =>
        `data:image/png;base64,${Buffer.from(`${appId}-icon`).toString("base64")}`,
      openExternalAppPath: async (input: {
        appId: string
        appName: string
        bundleId?: string | null
        targetPath: string
      }) => {
        openedPaths.push(input)
        return ""
      },
      now: () => "2026-07-01T10:55:00.000Z"
    } as never)

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const externalService = service as unknown as {
      listExternalOpenOptions: () => Array<{ id: string; isAvailable: boolean; iconDataUrl?: string }>
      openConversationExternal: (input: { conversationId: string; appId: string }) => Promise<{
        status: string
        appId?: string
        appLabel?: string
        targetPath?: string
        error?: { code: string }
      }>
    }

    expect(externalService.listExternalOpenOptions().filter((option) => option.isAvailable).map((option) => option.id))
      .toEqual(expect.arrayContaining(["finder", "terminal", "cmux", "cursor", "antigravity-ide"]))
    expect(externalService.listExternalOpenOptions().find((option) => option.id === "cursor")?.iconDataUrl)
      .toBe("data:image/png;base64,Y3Vyc29yLWljb24=")

    const opened = await externalService.openConversationExternal({
      conversationId: created.conversation.id,
      appId: "cursor"
    })
    expect(opened).toMatchObject({
      status: "opened",
      appId: "cursor",
      appLabel: "Cursor",
      targetPath: realpathSync(repoRoot)
    })
    expect(openedPaths).toEqual([{
      appId: "cursor",
      appName: "Cursor",
      bundleId: "com.todesktop.230313mzl4w4u92",
      targetPath: realpathSync(repoRoot)
    }])

    const openedAntigravity = await externalService.openConversationExternal({
      conversationId: created.conversation.id,
      appId: "antigravity-ide"
    })
    expect(openedAntigravity).toMatchObject({
      status: "opened",
      appId: "antigravity-ide",
      appLabel: "Antigravity IDE",
      targetPath: realpathSync(repoRoot)
    })
    expect(openedPaths.at(-1)).toEqual({
      appId: "antigravity-ide",
      appName: "Antigravity IDE",
      bundleId: "com.google.antigravity-ide",
      targetPath: realpathSync(repoRoot)
    })

    const openedCmux = await externalService.openConversationExternal({
      conversationId: created.conversation.id,
      appId: "cmux"
    })
    expect(openedCmux).toMatchObject({
      status: "opened",
      appId: "cmux",
      appLabel: "cmux",
      targetPath: realpathSync(repoRoot)
    })
    expect(openedPaths.at(-1)).toEqual({
      appId: "cmux",
      appName: "cmux",
      bundleId: "com.cmuxterm.app",
      targetPath: realpathSync(repoRoot)
    })

    const unavailable = await externalService.openConversationExternal({
      conversationId: created.conversation.id,
      appId: "warp"
    })
    expect(unavailable).toMatchObject({
      status: "error",
      error: {
        code: "EXTERNAL_OPEN_APP_UNAVAILABLE"
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("opens relative files inside the bound worktree and rejects traversal targets", async () => {
    const userDataPath = createTempDir("teamcow-handoff-file-")
    const repoRoot = createTempDir("teamcow-handoff-file-repo-")
    const openedPaths: Array<{ editorId: string; appName: string; bundleId?: string | null; targetPath: string }> = []
    makeGitRepo(repoRoot)
    mkdirSync(join(repoRoot, "apps", "desktop"), { recursive: true })
    writeFileSync(join(repoRoot, "apps", "desktop", "index.ts"), "export const ok = true\n")
    writeFileSync(join(repoRoot, "..draft.ts"), "export const dotted = true\n")
    writeFileSync(join(dirname(repoRoot), "outside.ts"), "export const unsafe = true\n")
    symlinkSync(join(dirname(repoRoot), "outside.ts"), join(repoRoot, "linked-outside.ts"))

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      listInstalledEditors: () => ["cursor"],
      openEditorPath: async (input: { editorId: string; appName: string; bundleId?: string | null; targetPath: string }) => {
        openedPaths.push(input)
        return ""
      },
      now: () => "2026-06-02T06:51:00.000Z"
    } as never)

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }
    const selectedEditor = await (service as unknown as {
      setSelectedEditor: (input: { editorId: string }) => Promise<unknown>
    }).setSelectedEditor({ editorId: "cursor" })
    expect(selectedEditor).toMatchObject({ status: "ok", selectedEditorId: "cursor" })

    const handoff = (service as unknown as {
      openConversationHandoff: (input: { conversationId: string; target: "file"; filePath: string }) => Promise<{
        status: string
        error?: { code: string }
      }>
    }).openConversationHandoff

    const opened = await handoff({
      conversationId: created.conversation.id,
      target: "file",
      filePath: "apps/desktop/index.ts"
    })
    const openedDotted = await handoff({
      conversationId: created.conversation.id,
      target: "file",
      filePath: "..draft.ts"
    })
    const rejected = await handoff({
      conversationId: created.conversation.id,
      target: "file",
      filePath: "../outside.ts"
    })
    const rejectedAbsolute = await handoff({
      conversationId: created.conversation.id,
      target: "file",
      filePath: join(repoRoot, "apps", "desktop", "index.ts")
    })
    const rejectedSymlinkEscape = await handoff({
      conversationId: created.conversation.id,
      target: "file",
      filePath: "linked-outside.ts"
    })

    expect(opened).toMatchObject({
      status: "opened",
      conversationId: created.conversation.id,
      worktreeId: imported.project.defaultWorktree.id,
      targetKind: "file",
      targetPath: join(realpathSync(repoRoot), "apps", "desktop", "index.ts")
    })
    expect(openedDotted).toMatchObject({
      status: "opened",
      targetPath: join(realpathSync(repoRoot), "..draft.ts")
    })
    expect(rejected).toMatchObject({
      status: "error",
      error: {
        code: "HANDOFF_PATH_OUTSIDE_WORKTREE"
      }
    })
    expect(rejectedAbsolute).toMatchObject({
      status: "error",
      error: {
        code: "HANDOFF_PATH_OUTSIDE_WORKTREE"
      }
    })
    expect(rejectedSymlinkEscape).toMatchObject({
      status: "error",
      error: {
        code: "HANDOFF_PATH_OUTSIDE_WORKTREE"
      }
    })
    expect(openedPaths).toEqual([
      {
        editorId: "cursor",
        appName: "Cursor",
        bundleId: "com.todesktop.230313mzl4w4u92",
        targetPath: join(realpathSync(repoRoot), "apps", "desktop", "index.ts")
      },
      {
        editorId: "cursor",
        appName: "Cursor",
        bundleId: "com.todesktop.230313mzl4w4u92",
        targetPath: join(realpathSync(repoRoot), "..draft.ts")
      }
    ])

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("requires a selected coding editor for file handoff and rejects directory targets", async () => {
    const userDataPath = createTempDir("teamcow-handoff-file-kind-")
    const repoRoot = createTempDir("teamcow-handoff-file-kind-repo-")
    const openedPaths: string[] = []
    let installedEditorIds: string[] = []
    makeGitRepo(repoRoot)
    mkdirSync(join(repoRoot, "apps", "desktop"), { recursive: true })
    writeFileSync(join(repoRoot, "apps", "desktop", "index.ts"), "export const ok = true\n")

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      listInstalledEditors: () => installedEditorIds,
      openEditorPath: async ({ targetPath }: { targetPath: string }) => {
        openedPaths.push(targetPath)
        return ""
      },
      now: () => "2026-06-02T06:51:30.000Z"
    } as never)

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const handoff = (service as unknown as {
      openConversationHandoff: (input: { conversationId: string; target: "file"; filePath: string }) => Promise<{
        status: string
        error?: { code: string }
      }>
      setSelectedEditor: (input: { editorId: string }) => Promise<unknown>
    }).openConversationHandoff

    await expect(handoff({
      conversationId: created.conversation.id,
      target: "file",
      filePath: "apps/desktop/index.ts"
    })).resolves.toMatchObject({
      status: "error",
      error: { code: "HANDOFF_EDITOR_NOT_SELECTED" }
    })

    installedEditorIds = ["cursor"]
    await (service as unknown as { setSelectedEditor: (input: { editorId: string }) => Promise<unknown> })
      .setSelectedEditor({ editorId: "cursor" })

    await expect(handoff({
      conversationId: created.conversation.id,
      target: "file",
      filePath: "apps/desktop"
    })).resolves.toMatchObject({
      status: "error",
      error: { code: "HANDOFF_TARGET_NOT_FILE" }
    })
    installedEditorIds = []
    await expect(handoff({
      conversationId: created.conversation.id,
      target: "file",
      filePath: "apps/desktop/index.ts"
    })).resolves.toMatchObject({
      status: "error",
      error: { code: "HANDOFF_EDITOR_UNAVAILABLE" }
    })
    expect(openedPaths).toEqual([])

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("returns structured errors when handoff targets are missing or the system opener fails", async () => {
    const userDataPath = createTempDir("teamcow-handoff-error-")
    const repoRoot = createTempDir("teamcow-handoff-error-repo-")
    makeGitRepo(repoRoot)
    writeFileSync(join(repoRoot, "README.md"), "# handoff\n")
    const log = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    }

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      listInstalledEditors: () => ["cursor"],
      openEditorPath: async () => "No editor is registered for this path",
      log,
      now: () => "2026-06-02T06:52:00.000Z"
    } as never)

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }
    await (service as unknown as { setSelectedEditor: (input: { editorId: string }) => Promise<unknown> })
      .setSelectedEditor({ editorId: "cursor" })

    const handoff = (service as unknown as {
      openConversationHandoff: (input: { conversationId: string; target: "file"; filePath: string }) => Promise<{
        status: string
        error?: { code: string; suggestion?: string | null }
      }>
    }).openConversationHandoff

    const missing = await handoff({
      conversationId: created.conversation.id,
      target: "file",
      filePath: "missing.ts"
    })
    const failedOpen = await handoff({
      conversationId: created.conversation.id,
      target: "file",
      filePath: "README.md"
    })

    expect(missing).toMatchObject({
      status: "error",
      error: {
        code: "PATH_NOT_FOUND"
      }
    })
    expect(failedOpen).toMatchObject({
      status: "error",
      error: {
        code: "HANDOFF_OPEN_FAILED",
        suggestion: null
      }
    })
    expect(log.error).toHaveBeenCalledWith("handoff", "handoff.resolve.failed", expect.objectContaining({
      conversationId: created.conversation.id,
      errorCode: "PATH_NOT_FOUND"
    }))
    expect(log.error).toHaveBeenCalledWith("handoff", "handoff.open.failed", expect.objectContaining({
      conversationId: created.conversation.id,
      worktreeId: imported.project.defaultWorktree.id,
      worktreeRootPath: realpathSync(repoRoot),
      errorCode: "HANDOFF_OPEN_FAILED"
    }))

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("opens a terminal session in the conversation-bound worktree without writing chat or run events", async () => {
    const userDataPath = createTempDir("teamcow-terminal-")
    const repoRoot = createTempDir("teamcow-terminal-repo-")
    makeGitRepo(repoRoot)

    const writes: string[] = []
    const resizes: Array<{ cols: number; rows: number }> = []
    const killed: string[] = []
    const spawnTerminalPty = vi.fn((input: { shell: string; cwd: string; cols: number; rows: number }) => ({
      status: "ok" as const,
      pty: {
        write: (data: string) => writes.push(data),
        resize: (cols: number, rows: number) => resizes.push({ cols, rows }),
        kill: () => killed.push(input.cwd),
        onData: (callback: (data: string) => void) => {
          callback("terminal ready\n")
          return { dispose: vi.fn() }
        },
        onExit: () => ({ dispose: vi.fn() })
      }
    }))
    const terminalOutputEvents: Array<{ conversationId: string; data: string }> = []
    const log = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    }
    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      spawnTerminalPty,
      onTerminalOutput: (event: TerminalOutputEvent) => {
        terminalOutputEvents.push({
          conversationId: event.conversationId,
          data: event.data
        })
      },
      getTerminalShell: () => "/bin/zsh",
      log,
      now: () => "2026-06-05T09:54:19.000Z"
    } as never)

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    seedConversation(userDataPath, {
      id: "conversation-terminal",
      projectId: imported.project.id,
      title: "Terminal",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "idle",
      createdAt: "2026-06-05T09:50:00.000Z",
      updatedAt: "2026-06-05T09:50:00.000Z"
    })

    const opened = await service.openConversationTerminal({ conversationId: "conversation-terminal" })

    expect(opened).toMatchObject({
      status: "ok",
      initialOutput: "terminal ready\n",
      session: {
        conversationId: "conversation-terminal",
        worktreeId: imported.project.defaultWorktree.id,
        cwd: realpathSync(repoRoot),
        shell: "/bin/zsh",
        status: "running",
        startedAt: "2026-06-05T09:54:19.000Z"
      }
    })
    if (opened.status !== "ok") {
      throw new Error("expected terminal session")
    }
    expect(spawnTerminalPty).toHaveBeenCalledWith({
      shell: "/bin/zsh",
      cwd: realpathSync(repoRoot),
      cols: 80,
      rows: 24
    })
    expect(terminalOutputEvents).toEqual([])
    expect(countRows(userDataPath, conversationMessagesTable)).toBe(0)
    expect(countRows(userDataPath, runEventsTable)).toBe(0)

    expect(service.writeTerminalInput({ sessionId: opened.session.sessionId, data: "pwd\n" })).toEqual({
      status: "ok",
      sessionId: opened.session.sessionId
    })
    expect(service.resizeTerminal({ sessionId: opened.session.sessionId, cols: 120, rows: 30 })).toEqual({
      status: "ok",
      sessionId: opened.session.sessionId
    })
    expect(service.closeTerminal({ sessionId: opened.session.sessionId })).toEqual({
      status: "ok",
      sessionId: opened.session.sessionId
    })
    expect(writes).toEqual(["pwd\n"])
    expect(resizes).toEqual([{ cols: 120, rows: 30 }])
    expect(killed).toEqual([realpathSync(repoRoot)])
    expect(log.info).toHaveBeenCalledWith("terminal", "terminal.opened", expect.objectContaining({
      conversationId: "conversation-terminal",
      worktreeId: imported.project.defaultWorktree.id,
      worktreeRootPath: realpathSync(repoRoot),
      terminalSessionId: opened.session.sessionId
    }))
    expect(log.info).toHaveBeenCalledWith("terminal", "terminal.closed", expect.objectContaining({
      conversationId: "conversation-terminal",
      worktreeId: imported.project.defaultWorktree.id,
      terminalSessionId: opened.session.sessionId
    }))

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("cleans up terminal sessions on PTY exit and reports exit status to the renderer", async () => {
    const userDataPath = createTempDir("teamcow-terminal-exit-")
    const repoRoot = createTempDir("teamcow-terminal-exit-repo-")
    makeGitRepo(repoRoot)

    let exitCallback: ((event: { exitCode: number }) => void) | null = null
    const disposed: string[] = []
    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      getTerminalShell: () => "/bin/zsh",
      spawnTerminalPty: vi.fn(() => ({
        status: "ok" as const,
        pty: {
          write: vi.fn(),
          resize: vi.fn(),
          kill: vi.fn(),
          onData: () => ({ dispose: () => disposed.push("data") }),
          onExit: (callback: (event: { exitCode: number }) => void) => {
            exitCallback = callback
            return { dispose: () => disposed.push("exit") }
          }
        }
      })),
      onTerminalOutput: vi.fn(),
      now: () => "2026-06-05T09:54:19.000Z"
    } as never)

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    seedConversation(userDataPath, {
      id: "conversation-terminal-exit",
      projectId: imported.project.id,
      title: "Terminal exit",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "idle",
      createdAt: "2026-06-05T09:50:00.000Z",
      updatedAt: "2026-06-05T09:50:00.000Z"
    })

    const opened = await service.openConversationTerminal({ conversationId: "conversation-terminal-exit" })
    if (opened.status !== "ok") {
      throw new Error("expected terminal session")
    }

    expect(exitCallback).not.toBeNull()
    const triggerExit = exitCallback as unknown as (event: { exitCode: number }) => void
    triggerExit({ exitCode: 7 })

    expect(disposed).toEqual(["data", "exit"])
    expect(service.writeTerminalInput({ sessionId: opened.session.sessionId, data: "pwd\n" })).toMatchObject({
      status: "error",
      error: {
        code: "TERMINAL_SESSION_NOT_FOUND"
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("returns initial terminal output with the open result so startup output is not dropped", async () => {
    const userDataPath = createTempDir("teamcow-terminal-initial-output-")
    const repoRoot = createTempDir("teamcow-terminal-initial-output-repo-")
    makeGitRepo(repoRoot)
    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      getTerminalShell: () => "/bin/zsh",
      spawnTerminalPty: vi.fn(() => ({
        status: "ok" as const,
        pty: {
          write: vi.fn(),
          resize: vi.fn(),
          kill: vi.fn(),
          onData: (callback: (data: string) => void) => {
            callback("ready before open resolves\n")
            return { dispose: vi.fn() }
          },
          onExit: () => ({ dispose: vi.fn() })
        }
      }))
    } as never)

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    seedConversation(userDataPath, {
      id: "conversation-terminal-initial-output",
      projectId: imported.project.id,
      title: "Terminal initial output",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "idle",
      createdAt: "2026-06-05T09:50:00.000Z",
      updatedAt: "2026-06-05T09:50:00.000Z"
    })

    await expect(service.openConversationTerminal({
      conversationId: "conversation-terminal-initial-output"
    })).resolves.toMatchObject({
      status: "ok",
      initialOutput: "ready before open resolves\n"
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("removes terminal sessions even when PTY cleanup throws", async () => {
    const userDataPath = createTempDir("teamcow-terminal-cleanup-")
    const repoRoot = createTempDir("teamcow-terminal-cleanup-repo-")
    makeGitRepo(repoRoot)
    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      getTerminalShell: () => "/bin/zsh",
      spawnTerminalPty: vi.fn(() => ({
        status: "ok" as const,
        pty: {
          write: vi.fn(),
          resize: vi.fn(),
          kill: () => {
            throw new Error("kill failed")
          },
          onData: () => ({ dispose: vi.fn() }),
          onExit: () => ({ dispose: vi.fn() })
        }
      }))
    } as never)

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    seedConversation(userDataPath, {
      id: "conversation-terminal-cleanup",
      projectId: imported.project.id,
      title: "Terminal cleanup",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "idle",
      createdAt: "2026-06-05T09:50:00.000Z",
      updatedAt: "2026-06-05T09:50:00.000Z"
    })

    const opened = await service.openConversationTerminal({ conversationId: "conversation-terminal-cleanup" })
    if (opened.status !== "ok") {
      throw new Error("expected terminal session")
    }

    expect(service.closeTerminal({ sessionId: opened.session.sessionId })).toMatchObject({
      status: "error",
      error: {
        code: "INTERNAL_ERROR"
      }
    })
    expect(service.closeTerminal({ sessionId: opened.session.sessionId })).toMatchObject({
      status: "error",
      error: {
        code: "TERMINAL_SESSION_NOT_FOUND"
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("returns structured terminal errors for missing conversations, missing worktrees, and unavailable shells", async () => {
    const userDataPath = createTempDir("teamcow-terminal-errors-")
    const repoRoot = createTempDir("teamcow-terminal-errors-repo-")
    const missingWorktreeRoot = createTempDir("teamcow-terminal-missing-worktree-")
    makeGitRepo(repoRoot)
    rmSync(missingWorktreeRoot, { recursive: true, force: true })
    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      getTerminalShell: () => "/does/not/exist"
    } as never)
    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    seedWorktree(userDataPath, {
      id: "worktree-missing-path",
      projectId: imported.project.id,
      kind: "default",
      rootPath: missingWorktreeRoot,
      branch: "main",
      status: "ready",
      createdAt: "2026-06-05T09:50:00.000Z",
      updatedAt: "2026-06-05T09:50:00.000Z"
    })
    seedConversation(userDataPath, {
      id: "conversation-terminal-missing-worktree",
      projectId: imported.project.id,
      title: "Terminal missing worktree",
      worktreeId: "worktree-missing-path",
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "idle",
      createdAt: "2026-06-05T09:50:00.000Z",
      updatedAt: "2026-06-05T09:50:00.000Z"
    })

    const missingConversation = await service.openConversationTerminal({ conversationId: "missing-conversation" })
    expect(missingConversation.status).toBe("error")
    if (missingConversation.status !== "error") {
      throw new Error("expected missing conversation error")
    }
    expect(missingConversation.error.code).toBe("CONVERSATION_NOT_FOUND")

    const missingWorktree = await service.openConversationTerminal({
      conversationId: "conversation-terminal-missing-worktree"
    })
    expect(missingWorktree.status).toBe("error")
    if (missingWorktree.status !== "error") {
      throw new Error("expected missing worktree error")
    }
    expect(missingWorktree.error.code).toBe("WORKTREE_NOT_FOUND")

    mkdirSync(missingWorktreeRoot, { recursive: true })
    const unavailableShell = await service.openConversationTerminal({
      conversationId: "conversation-terminal-missing-worktree"
    })
    expect(unavailableShell.status).toBe("error")
    if (unavailableShell.status !== "error") {
      throw new Error("expected unavailable shell error")
    }
    expect(unavailableShell.error.code).toBe("TERMINAL_SHELL_UNAVAILABLE")
    expect(service.writeTerminalInput({ sessionId: "missing-session", data: "pwd\n" })).toMatchObject({
      status: "error",
      error: {
        code: "TERMINAL_SESSION_NOT_FOUND"
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(missingWorktreeRoot, { recursive: true, force: true })
  })

  it("distinguishes non-executable shells and PTY spawn failures from native module failures", async () => {
    const userDataPath = createTempDir("teamcow-terminal-spawn-errors-")
    const repoRoot = createTempDir("teamcow-terminal-spawn-errors-repo-")
    const fakeShell = join(repoRoot, "fake-shell")
    makeGitRepo(repoRoot)
    writeFileSync(fakeShell, "#!/bin/sh\n")
    chmodSync(fakeShell, 0o644)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      getTerminalShell: () => fakeShell,
      spawnTerminalPty: vi.fn()
    } as never)
    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    seedConversation(userDataPath, {
      id: "conversation-terminal-spawn-errors",
      projectId: imported.project.id,
      title: "Terminal spawn errors",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "idle",
      createdAt: "2026-06-05T09:50:00.000Z",
      updatedAt: "2026-06-05T09:50:00.000Z"
    })

    const nonExecutableShell = await service.openConversationTerminal({
      conversationId: "conversation-terminal-spawn-errors"
    })
    expect(nonExecutableShell.status).toBe("error")
    if (nonExecutableShell.status !== "error") {
      throw new Error("expected non-executable shell error")
    }
    expect(nonExecutableShell.error.code).toBe("TERMINAL_SHELL_UNAVAILABLE")

    chmodSync(fakeShell, 0o755)
    const spawnFailingUserDataPath = createTempDir("teamcow-terminal-spawn-failed-")
    const failingLog = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    }
    const spawnFailingService = createProjectService({
      userDataPath: spawnFailingUserDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      getTerminalShell: () => fakeShell,
      spawnTerminalPty: vi.fn(() => ({
        status: "error" as const,
        error: {
          code: "TERMINAL_START_FAILED" as const,
          message: "spawn failed",
          suggestion: "permission denied"
        }
      })),
      log: failingLog
    } as never)
    const secondImport = await spawnFailingService.importProject({ directoryPath: repoRoot })
    if (secondImport.status !== "imported") {
      throw new Error("expected imported project")
    }
    seedConversation(spawnFailingUserDataPath, {
      id: "conversation-terminal-start-failed",
      projectId: secondImport.project.id,
      title: "Terminal start failed",
      worktreeId: secondImport.project.defaultWorktree.id,
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "idle",
      createdAt: "2026-06-05T09:50:00.000Z",
      updatedAt: "2026-06-05T09:50:00.000Z"
    })

    const spawnFailed = await spawnFailingService.openConversationTerminal({
      conversationId: "conversation-terminal-start-failed"
    })
    expect(spawnFailed.status).toBe("error")
    if (spawnFailed.status !== "error") {
      throw new Error("expected terminal start error")
    }
    expect(spawnFailed.error.code).toBe("TERMINAL_START_FAILED")
    expect(spawnFailed.error.suggestion).toBe("permission denied")
    expect(failingLog.error).toHaveBeenCalledWith("terminal", "terminal.start.failed", expect.objectContaining({
      conversationId: "conversation-terminal-start-failed",
      worktreeId: secondImport.project.defaultWorktree.id,
      worktreeRootPath: realpathSync(repoRoot),
      errorCode: "TERMINAL_START_FAILED",
      errorMessage: "spawn failed"
    }))

    service.close()
    spawnFailingService.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(spawnFailingUserDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("creates a new git worktree conversation and marks it current", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoot = createTempDir("teamcow-create-new-worktree-")
    const gitDirs: string[] = []
    makeGitRepo(repoRoot)
    const log = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    }

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => true,
      createGitWorktree: (_projectRootPath, branch, targetPath) => {
        const gitDirPath = createTempDir("teamcow-worktree-gitdir-")
        gitDirs.push(gitDirPath)
        mkdirSync(targetPath, { recursive: true })
        makeGitWorktreeRepo(targetPath, gitDirPath)
        writeFileSync(join(gitDirPath, "HEAD"), `ref: refs/heads/${branch}\n`)
        return null
      },
      initializeGit: () => null,
      log,
      now: () => "2026-05-16T10:00:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: {
        type: "new-worktree",
        branch: "feat/parallel-experiment"
      }
    })

    expect(created.status).toBe("created")
    if (created.status !== "created") {
      throw new Error("expected created result")
    }

    expect(created.conversation.provider.kind).toBe("codex")
    expect(created.conversation.worktree.kind).toBe("git_worktree")
    expect(created.conversation.worktree.branch).toBe("feat/parallel-experiment")
    expect(created.context.selectedConversationId).toBe(created.conversation.id)
    expect(created.context.shell.worktreeBranch).toBe("feat/parallel-experiment")
    expect(created.context.shell.runStatus).toBe("idle")
    expect(created.context.shell.worktreePath).toBe(
      realpathSync(makeProjectedWorktreePath(repoRoot, "feat/parallel-experiment"))
    )
    expect(log.info).toHaveBeenCalledWith("worktree", "worktree.create.completed", expect.objectContaining({
      projectId: imported.project.id,
      projectName: imported.project.name,
      worktreeId: created.conversation.worktree.id,
      worktreeRootPath: realpathSync(makeProjectedWorktreePath(repoRoot, "feat/parallel-experiment")),
      worktreeLabel: "feat/parallel-experiment"
    }))

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(makeProjectedWorktreePath(repoRoot, "feat/parallel-experiment"), { recursive: true, force: true })
    gitDirs.forEach((gitDirPath) => rmSync(gitDirPath, { recursive: true, force: true }))
  })

  it("rejects creating a conversation when the model is invalid for the provider", async () => {
    const userDataPath = createTempDir("teamcow-invalid-create-model-")
    const repoRoot = createTempDir("teamcow-invalid-create-model-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "claude-sonnet-4-6",
      executionTarget: {
        type: "default"
      }
    })

    expect(created.status).toBe("error")
    if (created.status !== "error") {
      throw new Error("expected error result")
    }

    expect(created.error.code).toBe("PROVIDER_NOT_READY")
    expect(created.error.message).toContain("Model claude-sonnet-4-6 is not registered for provider codex")
    expect(service.getCurrentConversation()).toBeNull()

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("cleans up a newly created worktree when conversation persistence fails afterwards", async () => {
    const userDataPath = createTempDir("teamcow-cleanup-worktree-")
    const repoRoot = createTempDir("teamcow-cleanup-worktree-repo-")
    const gitDirs: string[] = []
    makeGitRepo(repoRoot)

    const failingService = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => true,
      createGitWorktree: (_projectRootPath, branch, targetPath) => {
        const gitDirPath = createTempDir("teamcow-cleanup-worktree-gitdir-")
        gitDirs.push(gitDirPath)
        mkdirSync(targetPath, { recursive: true })
        makeGitWorktreeRepo(targetPath, gitDirPath)
        writeFileSync(join(gitDirPath, "HEAD"), `ref: refs/heads/${branch}\n`)
        return null
      },
      afterCreateConversationPersist: () => {
        throw new Error("post-persist failure")
      },
      initializeGit: () => null,
      now: () => "2026-05-16T10:00:00.000Z"
    })

    const imported = await failingService.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const createdWorktreePath = makeProjectedWorktreePath(repoRoot, "feat/retry-safe")

    const result = await failingService.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: {
        type: "new-worktree",
        branch: "feat/retry-safe"
      }
    })

    expect(result.status).toBe("error")
    if (result.status !== "error") {
      throw new Error("expected error result")
    }

    expect(result.error.code).toBe("CONVERSATION_SELECTION_FAILED")
    expect(failingService.listWorktreesByProject(imported.project.id)).toHaveLength(1)
    expect(
      failingService.listWorktreesByProject(imported.project.id).every((worktree) => worktree.kind === "default")
    ).toBe(true)
    expect(() => realpathSync(createdWorktreePath)).toThrow()

    failingService.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(createdWorktreePath, { recursive: true, force: true })
    gitDirs.forEach((gitDirPath) => rmSync(gitDirPath, { recursive: true, force: true }))
  })

  it("rejects new worktrees when the branch already exists", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoot = createTempDir("teamcow-duplicate-branch-")
    const existingWorktreeRoot = createTempDir("teamcow-existing-branch-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => true,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedWorktree(userDataPath, {
      id: "worktree-2",
      projectId: imported.project.id,
      kind: "git_worktree",
      rootPath: existingWorktreeRoot,
      branch: "feat/existing",
      status: "ready",
      createdAt: "2026-05-16T10:00:00.000Z",
      updatedAt: "2026-05-16T10:00:00.000Z"
    })

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: {
        type: "new-worktree",
        branch: "feat/existing"
      }
    })

    expect(created.status).toBe("error")
    if (created.status !== "error") {
      throw new Error("expected error result")
    }

    expect(created.error.code).toBe("WORKTREE_BRANCH_EXISTS")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(existingWorktreeRoot, { recursive: true, force: true })
  })

  it("rejects new worktrees when the derived target directory already exists", async () => {
    const userDataPath = createTempDir("teamcow-db-")
    const repoRoot = createTempDir("teamcow-existing-target-")
    const conflictingBranch = "feat/conflict"
    const conflictingPath = makeProjectedWorktreePath(repoRoot, conflictingBranch)
    makeGitRepo(repoRoot)
    mkdirSync(conflictingPath, { recursive: true })

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => true,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: {
        type: "new-worktree",
        branch: conflictingBranch
      }
    })

    expect(created.status).toBe("error")
    if (created.status !== "error") {
      throw new Error("expected error result")
    }

    expect(created.error.code).toBe("WORKTREE_PATH_EXISTS")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(conflictingPath, { recursive: true, force: true })
  })

  it("reports project worktree usage and delete availability", async () => {
    const userDataPath = createTempDir("teamcow-worktree-usage-")
    const repoRoot = createTempDir("teamcow-worktree-usage-repo-")
    const unusedWorktreeRoot = createTempDir("teamcow-worktree-unused-")
    const usedWorktreeRoot = createTempDir("teamcow-worktree-used-")
    makeGitRepo(repoRoot)
    makeGitRepo(unusedWorktreeRoot)
    makeGitRepo(usedWorktreeRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedWorktree(userDataPath, {
      id: "worktree-unused",
      projectId: imported.project.id,
      kind: "git_worktree",
      rootPath: unusedWorktreeRoot,
      branch: "feat/unused",
      status: "ready",
      createdAt: "2026-05-22T01:00:00.000Z",
      updatedAt: "2026-05-22T01:00:00.000Z"
    })
    seedWorktree(userDataPath, {
      id: "worktree-used",
      projectId: imported.project.id,
      kind: "git_worktree",
      rootPath: usedWorktreeRoot,
      branch: "feat/used",
      status: "ready",
      createdAt: "2026-05-22T01:01:00.000Z",
      updatedAt: "2026-05-22T01:01:00.000Z"
    })
    seedConversation(userDataPath, {
      id: "conversation-used",
      projectId: imported.project.id,
      title: "Used target",
      worktreeId: "worktree-used",
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "completed",
      createdAt: "2026-05-22T01:02:00.000Z",
      updatedAt: "2026-05-22T01:02:00.000Z"
    })

    const worktrees = service.listProjectWorktrees(imported.project.id)

    expect(worktrees.find((worktree) => worktree.id === imported.project.defaultWorktree.id)).toMatchObject({
      kind: "default",
      canDelete: false,
      deleteBlockedReason: "default"
    })
    expect(worktrees.find((worktree) => worktree.id === "worktree-used")).toMatchObject({
      conversationCount: 1,
      canDelete: false,
      deleteBlockedReason: "in-use"
    })
    expect(worktrees.find((worktree) => worktree.id === "worktree-unused")).toMatchObject({
      conversationCount: 0,
      canDelete: true,
      deleteBlockedReason: null
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(unusedWorktreeRoot, { recursive: true, force: true })
    rmSync(usedWorktreeRoot, { recursive: true, force: true })
  })

  it("blocks deleting default or conversation-bound worktrees", async () => {
    const userDataPath = createTempDir("teamcow-worktree-delete-blocked-")
    const repoRoot = createTempDir("teamcow-worktree-delete-blocked-repo-")
    const usedWorktreeRoot = createTempDir("teamcow-worktree-delete-used-")
    makeGitRepo(repoRoot)
    makeGitRepo(usedWorktreeRoot)

    const removeGitWorktree = vi.fn(() => null)
    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      removeGitWorktree,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedWorktree(userDataPath, {
      id: "worktree-used",
      projectId: imported.project.id,
      kind: "git_worktree",
      rootPath: usedWorktreeRoot,
      branch: "feat/used",
      status: "ready",
      createdAt: "2026-05-22T01:00:00.000Z",
      updatedAt: "2026-05-22T01:00:00.000Z"
    })
    seedConversation(userDataPath, {
      id: "conversation-used",
      projectId: imported.project.id,
      title: "Used target",
      worktreeId: "worktree-used",
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "failed",
      createdAt: "2026-05-22T01:02:00.000Z",
      updatedAt: "2026-05-22T01:02:00.000Z"
    })

    const defaultResult = await service.deleteWorktree({
      projectId: imported.project.id,
      worktreeId: imported.project.defaultWorktree.id
    })
    const inUseResult = await service.deleteWorktree({
      projectId: imported.project.id,
      worktreeId: "worktree-used"
    })

    expect(defaultResult.status).toBe("error")
    if (defaultResult.status !== "error") {
      throw new Error("expected default worktree delete to fail")
    }
    expect(defaultResult.error.code).toBe("WORKTREE_IN_USE")
    expect(inUseResult.status).toBe("error")
    if (inUseResult.status !== "error") {
      throw new Error("expected in-use worktree delete to fail")
    }
    expect(inUseResult.error.code).toBe("WORKTREE_IN_USE")
    expect(removeGitWorktree).not.toHaveBeenCalled()

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(usedWorktreeRoot, { recursive: true, force: true })
  })

  it("deletes unused git worktrees only after host removal succeeds", async () => {
    const userDataPath = createTempDir("teamcow-worktree-delete-")
    const repoRoot = createTempDir("teamcow-worktree-delete-repo-")
    const worktreeRoot = createTempDir("teamcow-worktree-delete-target-")
    makeGitRepo(repoRoot)
    makeGitRepo(worktreeRoot)

    const removeGitWorktree = vi.fn(() => null)
    const log = { info: vi.fn(), warn: vi.fn() }
    const worktreeGitWatcher = {
      watchWorktree: vi.fn(),
      unwatchWorktree: vi.fn(() => {
        throw new Error("watcher close failed")
      }),
      close: vi.fn()
    }
    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      removeGitWorktree,
      worktreeGitWatcher,
      log: log as never,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedWorktree(userDataPath, {
      id: "worktree-unused",
      projectId: imported.project.id,
      kind: "git_worktree",
      rootPath: worktreeRoot,
      branch: "feat/delete-me",
      status: "ready",
      createdAt: "2026-05-22T01:00:00.000Z",
      updatedAt: "2026-05-22T01:00:00.000Z"
    })

    const result = await service.deleteWorktree({
      projectId: imported.project.id,
      worktreeId: "worktree-unused"
    })

    expect(result).toEqual({
      status: "deleted",
      projectId: imported.project.id,
      worktreeId: "worktree-unused"
    })
    expect(removeGitWorktree).toHaveBeenCalledWith(realpathSync(repoRoot), worktreeRoot)
    expect(worktreeGitWatcher.unwatchWorktree).toHaveBeenCalledWith("worktree-unused")
    expect(log.warn).toHaveBeenCalledWith(
      "git",
      "git.watch.unwatch.failed",
      expect.objectContaining({ worktreeId: "worktree-unused" })
    )
    expect(service.listWorktreesByProject(imported.project.id).map((worktree) => worktree.id)).not.toContain("worktree-unused")

    service.close()
    expect(worktreeGitWatcher.close).toHaveBeenCalledOnce()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(worktreeRoot, { recursive: true, force: true })
  })

  it("keeps the database record when host worktree removal fails", async () => {
    const userDataPath = createTempDir("teamcow-worktree-delete-fail-")
    const repoRoot = createTempDir("teamcow-worktree-delete-fail-repo-")
    const worktreeRoot = createTempDir("teamcow-worktree-delete-fail-target-")
    makeGitRepo(repoRoot)
    makeGitRepo(worktreeRoot)

    const log = {
      error: vi.fn()
    }
    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      log: log as never,
      removeGitWorktree: () => ({
        code: "WORKTREE_DELETE_FAILED",
        message: "git worktree remove failed",
        suggestion: "fatal: contains modified files"
      }),
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedWorktree(userDataPath, {
      id: "worktree-unused",
      projectId: imported.project.id,
      kind: "git_worktree",
      rootPath: worktreeRoot,
      branch: "feat/delete-me",
      status: "ready",
      createdAt: "2026-05-22T01:00:00.000Z",
      updatedAt: "2026-05-22T01:00:00.000Z"
    })

    const result = await service.deleteWorktree({
      projectId: imported.project.id,
      worktreeId: "worktree-unused"
    })

    expect(result.status).toBe("error")
    if (result.status !== "error") {
      throw new Error("expected delete failure")
    }
    expect(result.error.code).toBe("WORKTREE_DELETE_FAILED")
    expect(result.error.domain).toBe("worktree")
    expect(result.error.context).toMatchObject({
      projectId: imported.project.id,
      projectName: imported.project.name,
      worktreeId: "worktree-unused",
      worktreeRootPath: worktreeRoot
    })
    expect(log.error).toHaveBeenCalledWith("worktree", "worktree.delete.failed", expect.objectContaining({
      projectId: imported.project.id,
      worktreeId: "worktree-unused",
      worktreeRootPath: worktreeRoot,
      errorCode: "WORKTREE_DELETE_FAILED",
      errorMessage: "git worktree remove failed"
    }))
    expect(service.listWorktreesByProject(imported.project.id).map((worktree) => worktree.id)).toContain("worktree-unused")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(worktreeRoot, { recursive: true, force: true })
  })

  it("reports git unavailable before deleting unused git worktrees through the default host remover", async () => {
    const userDataPath = createTempDir("teamcow-worktree-delete-no-git-")
    const repoRoot = createTempDir("teamcow-worktree-delete-no-git-repo-")
    const worktreeRoot = createTempDir("teamcow-worktree-delete-no-git-target-")
    makeGitRepo(repoRoot)
    makeGitRepo(worktreeRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedWorktree(userDataPath, {
      id: "worktree-unused",
      projectId: imported.project.id,
      kind: "git_worktree",
      rootPath: worktreeRoot,
      branch: "feat/delete-me",
      status: "ready",
      createdAt: "2026-05-22T01:00:00.000Z",
      updatedAt: "2026-05-22T01:00:00.000Z"
    })

    const result = await service.deleteWorktree({
      projectId: imported.project.id,
      worktreeId: "worktree-unused"
    })

    expect(result.status).toBe("error")
    if (result.status !== "error") {
      throw new Error("expected delete failure")
    }
    expect(result.error.code).toBe("GIT_NOT_INSTALLED")
    expect(service.listWorktreesByProject(imported.project.id).map((worktree) => worktree.id)).toContain("worktree-unused")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(worktreeRoot, { recursive: true, force: true })
  })

  it("lists project files from the conversation-bound worktree", async () => {
    const userDataPath = createTempDir("teamcow-project-files-")
    const repoRoot = createTempDir("teamcow-project-files-repo-")
    makeGitRepo(repoRoot)
    mkdirSync(join(repoRoot, "apps", "desktop", "src"), { recursive: true })
    mkdirSync(join(repoRoot, "packages", "shared-types", "src"), { recursive: true })
    mkdirSync(join(repoRoot, "node_modules", "ignored-lib"), { recursive: true })
    mkdirSync(join(repoRoot, "dist"), { recursive: true })
    writeFileSync(join(repoRoot, "apps", "desktop", "src", "DesktopShell.tsx"), "export const shell = true\n")
    writeFileSync(join(repoRoot, "packages", "shared-types", "src", "index.ts"), "export const shared = true\n")
    writeFileSync(join(repoRoot, "node_modules", "ignored-lib", "index.js"), "module.exports = {}\n")
    writeFileSync(join(repoRoot, "dist", "bundle.js"), "ignored\n")
    symlinkSync(join(repoRoot, "packages"), join(repoRoot, "linked-packages"), "dir")

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-06-04T08:17:33.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-project-files",
      projectId: imported.project.id,
      title: "Project files",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "completed",
      createdAt: "2026-06-04T08:00:00.000Z",
      updatedAt: "2026-06-04T08:10:00.000Z"
    })

    const result = await service.getConversationProjectFiles("conversation-project-files")

    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      throw new Error("expected project files")
    }
    expect(result.projectFiles).toMatchObject({
      conversationId: "conversation-project-files",
      worktreeId: imported.project.defaultWorktree.id,
      directoryPath: "",
      fileCount: 0,
      directoryCount: 5,
      checkedAt: "2026-06-04T08:17:33.000Z"
    })
    expect(result.projectFiles.files.map((file) => file.path)).toEqual([
      "apps",
      "dist",
      "linked-packages",
      "node_modules",
      "packages"
    ])
    expect(result.projectFiles.files.find((file) => file.path === "linked-packages")).toMatchObject({
      kind: "directory",
      isSymlink: true
    })
    expect(result.projectFiles.files.map((file) => file.path)).not.toContain(".git")

    const appsResult = await service.getConversationProjectFiles("conversation-project-files", "apps")
    expect(appsResult.status).toBe("ok")
    if (appsResult.status !== "ok") {
      throw new Error("expected app project files")
    }
    expect(appsResult.projectFiles).toMatchObject({
      directoryPath: "apps",
      fileCount: 0,
      directoryCount: 1
    })
    expect(appsResult.projectFiles.files.map((file) => file.path)).toEqual([
      "apps/desktop"
    ])

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("lists project files from a project worktree without requiring a conversation", async () => {
    const userDataPath = createTempDir("teamcow-worktree-project-files-")
    const repoRoot = createTempDir("teamcow-worktree-project-files-repo-")
    makeGitRepo(repoRoot)
    mkdirSync(join(repoRoot, "apps", "desktop", "src"), { recursive: true })
    mkdirSync(join(repoRoot, "node_modules", "ignored-lib"), { recursive: true })
    writeFileSync(join(repoRoot, "apps", "desktop", "src", "DesktopShell.tsx"), "export const shell = true\n")
    writeFileSync(join(repoRoot, "node_modules", "ignored-lib", "index.js"), "module.exports = {}\n")

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-06-04T08:17:33.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const result = await service.getProjectWorktreeFiles(imported.project.id, imported.project.defaultWorktree.id)

    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      throw new Error("expected project worktree files")
    }
    expect(result).toMatchObject({
      status: "ok",
      projectFiles: {
        projectId: imported.project.id,
        worktreeId: imported.project.defaultWorktree.id,
        directoryPath: "",
        fileCount: 0,
        directoryCount: 2,
        checkedAt: "2026-06-04T08:17:33.000Z"
      }
    })
    expect(result.projectFiles.files.map((file) => file.path)).toEqual([
      "apps",
      "node_modules"
    ])

    const nodeModulesResult = await service.getProjectWorktreeFiles(imported.project.id, imported.project.defaultWorktree.id, "node_modules")
    expect(nodeModulesResult.status).toBe("ok")
    if (nodeModulesResult.status !== "ok") {
      throw new Error("expected node_modules project worktree files")
    }
    expect(nodeModulesResult.projectFiles.files.map((file) => file.path)).toEqual([
      "node_modules/ignored-lib"
    ])

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("rejects expanding project file directories through symlink ancestors", async () => {
    const userDataPath = createTempDir("teamcow-project-files-symlink-")
    const repoRoot = createTempDir("teamcow-project-files-symlink-repo-")
    const outsideRoot = createTempDir("teamcow-project-files-symlink-outside-")
    makeGitRepo(repoRoot)
    mkdirSync(join(outsideRoot, "nested"), { recursive: true })
    writeFileSync(join(outsideRoot, "nested", "secret.ts"), "export const secret = true\n")
    symlinkSync(outsideRoot, join(repoRoot, "linked"), "dir")

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-06-04T08:17:33.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const rootResult = await service.getProjectWorktreeFiles(imported.project.id, imported.project.defaultWorktree.id)
    expect(rootResult.status).toBe("ok")
    if (rootResult.status !== "ok") {
      throw new Error("expected project worktree files")
    }
    expect(rootResult.projectFiles.files).toContainEqual({
      path: "linked",
      name: "linked",
      kind: "directory",
      depth: 0,
      isSymlink: true
    })

    const linkedResult = await service.getProjectWorktreeFiles(
      imported.project.id,
      imported.project.defaultWorktree.id,
      "linked/nested"
    )
    expect(linkedResult.status).toBe("error")
    if (linkedResult.status !== "error") {
      throw new Error("expected project worktree files error")
    }
    expect(linkedResult.error.code).toBe("NOT_A_DIRECTORY")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(outsideRoot, { recursive: true, force: true })
  })

  it("keeps broken symlinks visible when listing project files", async () => {
    const userDataPath = createTempDir("teamcow-project-files-broken-symlink-")
    const repoRoot = createTempDir("teamcow-project-files-broken-symlink-repo-")
    makeGitRepo(repoRoot)
    symlinkSync(join(repoRoot, "missing-target.ts"), join(repoRoot, "broken-link.ts"))

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-06-04T08:17:33.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const result = await service.getProjectWorktreeFiles(imported.project.id, imported.project.defaultWorktree.id)

    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      throw new Error("expected project worktree files")
    }
    expect(result.projectFiles.files).toContainEqual({
      path: "broken-link.ts",
      name: "broken-link.ts",
      kind: "file",
      depth: 0,
      isSymlink: true
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("returns a worktree-not-found error when listing files for a missing worktree root", async () => {
    const userDataPath = createTempDir("teamcow-project-files-missing-worktree-")
    const repoRoot = createTempDir("teamcow-project-files-missing-worktree-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    rmSync(repoRoot, { recursive: true, force: true })

    const result = await service.getProjectWorktreeFiles(imported.project.id, imported.project.defaultWorktree.id)

    expect(result.status).toBe("error")
    if (result.status !== "error") {
      throw new Error("expected missing worktree")
    }
    expect(result.error.code).toBe("WORKTREE_NOT_FOUND")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("lists large directories lazily without hiding sibling project files", async () => {
    const userDataPath = createTempDir("teamcow-project-files-large-")
    const repoRoot = createTempDir("teamcow-project-files-large-repo-")
    makeGitRepo(repoRoot)
    mkdirSync(join(repoRoot, "large"), { recursive: true })
    const largeFileCount = 1200
    for (let index = 0; index < largeFileCount; index += 1) {
      writeFileSync(join(repoRoot, "large", `file-${String(index).padStart(4, "0")}.txt`), "source\n")
    }
    writeFileSync(join(repoRoot, "z-sibling.ts"), "export const sibling = true\n")

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-06-04T08:17:33.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const result = await service.getProjectWorktreeFiles(imported.project.id, imported.project.defaultWorktree.id)

    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      throw new Error("expected project worktree files")
    }
    expect(result.projectFiles.truncated).toBe(false)
    expect(result.projectFiles.files.map((file) => file.path)).toContain("z-sibling.ts")
    expect(result.projectFiles.files.map((file) => file.path)).not.toContain("large/file-0000.txt")
    expect(result.projectFiles.fileCount).toBe(1)

    const largeResult = await service.getProjectWorktreeFiles(imported.project.id, imported.project.defaultWorktree.id, "large")
    expect(largeResult.status).toBe("ok")
    if (largeResult.status !== "ok") {
      throw new Error("expected large directory project files")
    }
    expect(largeResult.projectFiles.truncated).toBe(false)
    expect(largeResult.projectFiles.files).toHaveLength(largeFileCount)
    expect(largeResult.projectFiles.files.map((file) => file.path)).toContain("large/file-0000.txt")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("returns a typed error when listing project files for a missing conversation", async () => {
    const userDataPath = createTempDir("teamcow-project-files-missing-")
    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const result = await service.getConversationProjectFiles("missing-conversation")

    expect(result.status).toBe("error")
    if (result.status !== "error") {
      throw new Error("expected missing conversation")
    }
    expect(result.error.code).toBe("CONVERSATION_NOT_FOUND")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
  })

  it("creates conversation-bound files and folders inside the worktree", async () => {
    const fixture = await createConversationFileFixture()

    const folderResult = fixture.service.createConversationFileEntry({
      conversationId: fixture.conversation.id,
      filePath: "src",
      kind: "directory"
    })
    const fileResult = fixture.service.createConversationFileEntry({
      conversationId: fixture.conversation.id,
      filePath: "src/new-file.ts",
      kind: "file"
    })

    expect(folderResult).toMatchObject({
      status: "created",
      entry: { filePath: "src", kind: "directory" }
    })
    expect(fileResult).toMatchObject({
      status: "created",
      entry: { filePath: "src/new-file.ts", kind: "file" }
    })
    expect(statSync(join(fixture.repoRoot, "src")).isDirectory()).toBe(true)
    expect(readFileSync(join(fixture.repoRoot, "src", "new-file.ts"), "utf8")).toBe("")

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("renames conversation-bound files without leaving the worktree", async () => {
    const fixture = await createConversationFileFixture()
    mkdirSync(join(fixture.repoRoot, "docs"), { recursive: true })
    writeFileSync(join(fixture.repoRoot, "README.md"), "# TeamCow\n")

    const result = fixture.service.renameConversationFileEntry({
      conversationId: fixture.conversation.id,
      sourcePath: "README.md",
      destinationPath: "docs/README.md",
      kind: "file"
    })

    expect(result).toMatchObject({
      status: "renamed",
      entry: { filePath: "docs/README.md", kind: "file" }
    })
    expect(existsSync(join(fixture.repoRoot, "README.md"))).toBe(false)
    expect(readFileSync(join(fixture.repoRoot, "docs", "README.md"), "utf8")).toBe("# TeamCow\n")

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("deletes conversation-bound folders recursively and rejects escaped paths", async () => {
    const fixture = await createConversationFileFixture()
    mkdirSync(join(fixture.repoRoot, "tmp", "nested"), { recursive: true })
    writeFileSync(join(fixture.repoRoot, "tmp", "nested", "note.txt"), "note\n")

    const rejected = fixture.service.deleteConversationFileEntry({
      conversationId: fixture.conversation.id,
      filePath: "../outside.txt",
      kind: "file"
    })
    const deleted = fixture.service.deleteConversationFileEntry({
      conversationId: fixture.conversation.id,
      filePath: "tmp",
      kind: "directory"
    })

    expect(rejected).toMatchObject({
      status: "error",
      error: { code: "FILE_PATH_OUTSIDE_WORKTREE" }
    })
    expect(deleted).toMatchObject({
      status: "deleted",
      filePath: "tmp"
    })
    expect(existsSync(join(fixture.repoRoot, "tmp"))).toBe(false)

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("reads a conversation-bound text file with revision metadata", async () => {
    const fixture = await createConversationFileFixture()
    writeFileSync(join(fixture.repoRoot, "README.md"), "# TeamCow\n", "utf8")

    const result = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md"
    })

    expect(result).toMatchObject({
      status: "text",
      content: "# TeamCow\n",
      encoding: "utf-8",
      file: {
        conversationId: fixture.conversation.id,
        worktreeId: fixture.conversation.worktreeId,
        filePath: "README.md"
      }
    })
    expect(result.status === "text" ? result.file.revision : "").toContain("mtime")
    expect(result.status === "text" ? result.file.revision : "").toContain("ctime")
    expect(result.status === "text" ? result.file.revision : "").toContain("mtimeNs")
    expect(result.status === "text" ? result.file.revision : "").toContain("ctimeNs")

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("rejects conversation file paths outside the bound worktree", async () => {
    const fixture = await createConversationFileFixture()
    const result = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "../outside.md"
    } as never)

    expect(result).toMatchObject({
      status: "error",
      error: { code: "FILE_PATH_OUTSIDE_WORKTREE" }
    })

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("returns binary and too-large states without text content", async () => {
    const fixture = await createConversationFileFixture()
    writeFileSync(join(fixture.repoRoot, "binary.dat"), Buffer.from([0, 1, 2, 3]))
    writeFileSync(join(fixture.repoRoot, "large.txt"), "x".repeat(128), "utf8")
    writeFileSync(join(fixture.repoRoot, "oversized.txt"), "x".repeat((2 * 1024 * 1024) + 1), "utf8")

    expect(fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "binary.dat"
    })).toMatchObject({ status: "binary" })

    expect(fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "large.txt",
      maxBytes: 32
    })).toMatchObject({ status: "too-large", limitBytes: 32 })

    expect(fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "oversized.txt"
    })).toMatchObject({ status: "too-large", limitBytes: 2 * 1024 * 1024 })

    expect(fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "oversized.txt",
      maxBytes: 10 * 1024 * 1024
    })).toMatchObject({ status: "text" })

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("rejects saving a conversation file whose current size exceeds the editor limit", async () => {
    const atomicWriter = vi.fn(() => ({ status: "ok" as const }))
    const fixture = await createConversationFileFixture({
      serviceDeps: {
        conversationFileAtomicWriter: atomicWriter
      } as never
    })
    writeFileSync(join(fixture.repoRoot, "large.txt"), "x".repeat((10 * 1024 * 1024) + 1), "utf8")

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "large.txt",
      content: "small replacement\n"
    })

    expect(result).toMatchObject({
      status: "error",
      error: { code: "FILE_TOO_LARGE" }
    })
    expect(atomicWriter).not.toHaveBeenCalled()
    expect(statSync(join(fixture.repoRoot, "large.txt")).size).toBe((10 * 1024 * 1024) + 1)

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("rejects saving content that would exceed the confirmed editor limit", async () => {
    const atomicWriter = vi.fn(() => ({ status: "ok" as const }))
    const fixture = await createConversationFileFixture({
      serviceDeps: {
        conversationFileAtomicWriter: atomicWriter
      } as never
    })
    writeFileSync(join(fixture.repoRoot, "README.md"), "# TeamCow\n", "utf8")

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md",
      content: "x".repeat((10 * 1024 * 1024) + 1)
    })

    expect(result).toMatchObject({
      status: "error",
      error: { code: "FILE_TOO_LARGE" }
    })
    expect(atomicWriter).not.toHaveBeenCalled()

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("rejects reading when the parent directory is replaced by an outside symlink", async () => {
    const fixture = await createConversationFileFixture()
    const insideDir = join(fixture.repoRoot, "dir")
    const outsideRoot = createTempDir("teamcow-conversation-file-read-outside-")
    const outsideDir = join(outsideRoot, "dir")
    mkdirSync(insideDir, { recursive: true })
    mkdirSync(outsideDir, { recursive: true })
    writeFileSync(join(insideDir, "file.txt"), "inside text\n", "utf8")
    writeFileSync(join(outsideDir, "file.txt"), "outside text\n", "utf8")

    const firstRead = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "dir/file.txt"
    })
    expect(firstRead).toMatchObject({
      status: "text",
      content: "inside text\n"
    })

    rmSync(insideDir, { recursive: true, force: true })
    symlinkSync(outsideDir, insideDir, "dir")

    const result = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "dir/file.txt"
    })

    expect(result).toMatchObject({
      status: "error",
      error: { code: "FILE_PATH_OUTSIDE_WORKTREE" }
    })
    expect(result.status === "text" ? result.content : null).not.toBe("outside text\n")

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
    rmSync(outsideRoot, { recursive: true, force: true })
  })

  it("saves a text file when the revision matches", async () => {
    const fixture = await createConversationFileFixture()
    writeFileSync(join(fixture.repoRoot, "README.md"), "# Old\n", "utf8")
    const read = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md"
    })
    expect(read.status).toBe("text")

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md",
      content: "# New\n",
      precondition: { ifMatch: read.status === "text" ? read.file.revision : "" }
    })

    expect(result).toMatchObject({ status: "saved" })
    expect(readFileSync(join(fixture.repoRoot, "README.md"), "utf8")).toBe("# New\n")

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("preserves executable mode when saving a text file", async () => {
    const fixture = await createConversationFileFixture()
    const absolutePath = join(fixture.repoRoot, "README.md")
    writeFileSync(absolutePath, "# Old\n", "utf8")
    chmodSync(absolutePath, 0o755)

    const read = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md"
    })
    expect(read.status).toBe("text")

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md",
      content: "# New\n",
      precondition: { ifMatch: read.status === "text" ? read.file.revision : "" }
    })

    expect(result).toMatchObject({ status: "saved" })
    expect(readFileSync(absolutePath, "utf8")).toBe("# New\n")
    expect(statSync(absolutePath).mode & 0o777).toBe(0o755)

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("returns conflict when the disk revision changed before save", async () => {
    const fixture = await createConversationFileFixture()
    const absolutePath = join(fixture.repoRoot, "README.md")
    writeFileSync(absolutePath, "# Old\n", "utf8")
    const originalStats = statSync(absolutePath)
    const read = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md"
    })
    expect(read.status).toBe("text")

    writeFileSync(absolutePath, "# Alt\n", "utf8")
    utimesSync(absolutePath, originalStats.atime, originalStats.mtime)

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md",
      content: "# Draft\n",
      precondition: { ifMatch: read.status === "text" ? read.file.revision : "" }
    })

    expect(result).toMatchObject({
      status: "conflict",
      currentContent: "# Alt\n"
    })
    expect(readFileSync(absolutePath, "utf8")).toBe("# Alt\n")

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("preserves the old file when atomic replace fails during save", async () => {
    const fixture = await createConversationFileFixture({
      serviceDeps: {
        conversationFileAtomicWriter: vi.fn(() => ({
          status: "error",
          error: {
            code: "FILE_WRITE_FAILED",
            message: "rename failed in test",
            suggestion: null
          }
        }))
      } as never
    })
    const absolutePath = join(fixture.repoRoot, "README.md")
    writeFileSync(absolutePath, "# Old\n", "utf8")

    const read = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md"
    })
    expect(read.status).toBe("text")

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md",
      content: "# New\n",
      precondition: { ifMatch: read.status === "text" ? read.file.revision : "" }
    })

    expect(result).toMatchObject({
      status: "error",
      error: { code: "FILE_WRITE_FAILED" }
    })
    expect(readFileSync(absolutePath, "utf8")).toBe("# Old\n")
    expect(readdirSync(fixture.repoRoot).filter((name) => name.includes(".teamcow-write-"))).toEqual([])

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("rejects saving when the file path is replaced by an outside symlink", async () => {
    const fixture = await createConversationFileFixture()
    const absolutePath = join(fixture.repoRoot, "README.md")
    const outsideRoot = createTempDir("teamcow-conversation-file-outside-")
    const outsidePath = join(outsideRoot, "outside.md")
    writeFileSync(absolutePath, "# Old\n", "utf8")
    writeFileSync(outsidePath, "# Outside\n", "utf8")

    const read = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md"
    })
    expect(read.status).toBe("text")

    rmSync(absolutePath, { force: true })
    symlinkSync(outsidePath, absolutePath)

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md",
      content: "# Draft\n",
      precondition: { ifMatch: read.status === "text" ? read.file.revision : "" }
    })

    expect(result).toMatchObject({
      status: "error",
      error: { code: "FILE_PATH_OUTSIDE_WORKTREE" }
    })
    expect(readFileSync(outsidePath, "utf8")).toBe("# Outside\n")

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
    rmSync(outsideRoot, { recursive: true, force: true })
  })

  it("rejects saving when the parent directory is replaced by an outside symlink", async () => {
    const fixture = await createConversationFileFixture()
    const insideDir = join(fixture.repoRoot, "dir")
    const absolutePath = join(insideDir, "file.txt")
    const outsideRoot = createTempDir("teamcow-conversation-file-write-outside-")
    const outsideDir = join(outsideRoot, "dir")
    const outsidePath = join(outsideDir, "file.txt")
    mkdirSync(insideDir, { recursive: true })
    mkdirSync(outsideDir, { recursive: true })
    writeFileSync(absolutePath, "inside text\n", "utf8")
    writeFileSync(outsidePath, "outside text\n", "utf8")

    const read = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "dir/file.txt"
    })
    expect(read.status).toBe("text")

    rmSync(insideDir, { recursive: true, force: true })
    symlinkSync(outsideDir, insideDir, "dir")

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "dir/file.txt",
      content: "draft text\n",
      precondition: { ifMatch: read.status === "text" ? read.file.revision : "" }
    })

    expect(result).toMatchObject({
      status: "error",
      error: { code: "FILE_PATH_OUTSIDE_WORKTREE" }
    })
    expect(readFileSync(outsidePath, "utf8")).toBe("outside text\n")

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
    rmSync(outsideRoot, { recursive: true, force: true })
  })

  it("rejects saving when the parent directory flips to an outside symlink during atomic save", async () => {
    const outsideRoot = createTempDir("teamcow-conversation-file-write-race-outside-")
    const outsideDir = join(outsideRoot, "dir")
    const outsidePath = join(outsideDir, "file.txt")
    let renamedInsideDir = ""
    mkdirSync(outsideDir, { recursive: true })
    writeFileSync(outsidePath, "outside text\n", "utf8")

    const fixture = await createConversationFileFixture({
      serviceDeps: {
        beforeConversationFileAtomicWrite: () => {
          const insideDir = join(fixture.repoRoot, "dir")
          renamedInsideDir = join(fixture.repoRoot, "dir-renamed")
          renameSync(insideDir, renamedInsideDir)
          symlinkSync(outsideDir, insideDir, "dir")
        }
      } as never
    })
    const insideDir = join(fixture.repoRoot, "dir")
    const absolutePath = join(insideDir, "file.txt")
    mkdirSync(insideDir, { recursive: true })
    writeFileSync(absolutePath, "inside text\n", "utf8")

    const read = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "dir/file.txt"
    })
    expect(read.status).toBe("text")

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "dir/file.txt",
      content: "draft text\n",
      precondition: { ifMatch: read.status === "text" ? read.file.revision : "" }
    })

    expect(result).toMatchObject({
      status: "error",
      error: { code: "FILE_PATH_OUTSIDE_WORKTREE" }
    })
    expect(readFileSync(outsidePath, "utf8")).toBe("outside text\n")
    expect(readFileSync(join(renamedInsideDir, "file.txt"), "utf8")).toBe("inside text\n")
    expect(readdirSync(outsideDir).filter((name) => name.includes(".teamcow-write-"))).toEqual([])
    expect(readdirSync(renamedInsideDir).filter((name) => name.includes(".teamcow-write-"))).toEqual([])
    expect(readdirSync(fixture.repoRoot).filter((name) => name.includes(".teamcow-write-"))).toEqual([])

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
    rmSync(outsideRoot, { recursive: true, force: true })
  })

  it("rejects saving when the parent directory flips to an outside symlink immediately before native atomic write", async () => {
    const outsideRoot = createTempDir("teamcow-conversation-file-native-race-outside-")
    const outsideDir = join(outsideRoot, "dir")
    const outsidePath = join(outsideDir, "file.txt")
    let renamedInsideDir = ""
    mkdirSync(outsideDir, { recursive: true })
    writeFileSync(outsidePath, "outside text\n", "utf8")

    const fixture = await createConversationFileFixture({
      serviceDeps: {
        beforeConversationFileAtomicWrite: () => {
          const insideDir = join(fixture.repoRoot, "dir")
          renamedInsideDir = join(fixture.repoRoot, "dir-renamed")
          renameSync(insideDir, renamedInsideDir)
          symlinkSync(outsideDir, insideDir, "dir")
        }
      } as never
    })
    const insideDir = join(fixture.repoRoot, "dir")
    const absolutePath = join(insideDir, "file.txt")
    mkdirSync(insideDir, { recursive: true })
    writeFileSync(absolutePath, "inside text\n", "utf8")

    const read = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "dir/file.txt"
    })
    expect(read.status).toBe("text")

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "dir/file.txt",
      content: "draft text\n",
      precondition: { ifMatch: read.status === "text" ? read.file.revision : "" }
    })

    expect(result).toMatchObject({
      status: "error",
      error: { code: "FILE_PATH_OUTSIDE_WORKTREE" }
    })
    expect(readFileSync(outsidePath, "utf8")).toBe("outside text\n")
    expect(readFileSync(join(renamedInsideDir, "file.txt"), "utf8")).toBe("inside text\n")
    expect(readdirSync(outsideDir).filter((name) => name.includes(".teamcow-write-"))).toEqual([])
    expect(readdirSync(renamedInsideDir).filter((name) => name.includes(".teamcow-write-"))).toEqual([])
    expect(readdirSync(fixture.repoRoot).filter((name) => name.includes(".teamcow-write-"))).toEqual([])

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
    rmSync(outsideRoot, { recursive: true, force: true })
  })

  it("rejects saving when an intermediate parent path swaps outside before the native atomic rename", async () => {
    const outsideRoot = createTempDir("teamcow-conversation-file-native-intermediate-race-")
    const outsideBase = join(outsideRoot, "base")
    const outsideDir = join(outsideBase, "nested")
    const outsidePath = join(outsideDir, "file.txt")
    let renamedInsideBase = ""
    mkdirSync(outsideDir, { recursive: true })

    const fixture = await createConversationFileFixture({
      serviceDeps: {
        beforeConversationFileAtomicWrite: () => {
          const insideBase = join(fixture.repoRoot, "base")
          renamedInsideBase = join(fixture.repoRoot, "base-renamed")
          renameSync(insideBase, renamedInsideBase)
          mkdirSync(dirname(outsidePath), { recursive: true })
          linkSync(join(renamedInsideBase, "nested", "file.txt"), outsidePath)
          symlinkSync(outsideBase, insideBase, "dir")
        }
      } as never
    })
    const insideDir = join(fixture.repoRoot, "base", "nested")
    const absolutePath = join(insideDir, "file.txt")
    mkdirSync(insideDir, { recursive: true })
    writeFileSync(absolutePath, "inside text\n", "utf8")

    const read = fixture.service.readConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "base/nested/file.txt"
    })
    expect(read.status).toBe("text")

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "base/nested/file.txt",
      content: "draft text\n",
      precondition: { ifMatch: read.status === "text" ? read.file.revision : "" }
    })

    expect(result).toMatchObject({
      status: "error",
      error: { code: "FILE_PATH_OUTSIDE_WORKTREE" }
    })
    expect(readFileSync(outsidePath, "utf8")).toBe("inside text\n")
    expect(readFileSync(join(renamedInsideBase, "nested", "file.txt"), "utf8")).toBe("inside text\n")
    expect(readdirSync(outsideDir).filter((name) => name.includes(".teamcow-write-"))).toEqual([])

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
    rmSync(outsideRoot, { recursive: true, force: true })
  })

  it("rejects saving while the conversation run is active", async () => {
    const fixture = await createConversationFileFixture({ runStatus: "running" })
    writeFileSync(join(fixture.repoRoot, "README.md"), "# Old\n", "utf8")

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md",
      content: "# New\n"
    })

    expect(result).toMatchObject({
      status: "readonly",
      error: { code: "FILE_RUN_ACTIVE_READONLY" }
    })

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  it("rejects saving while an execution run is still active", async () => {
    const fixture = await createConversationFileFixture({
      runStatus: "completed",
      executionRunStatus: "running"
    })
    writeFileSync(join(fixture.repoRoot, "README.md"), "# Old\n", "utf8")

    const result = fixture.service.writeConversationFile({
      conversationId: fixture.conversation.id,
      filePath: "README.md",
      content: "# New\n"
    })

    expect(result).toMatchObject({
      status: "readonly",
      error: { code: "FILE_RUN_ACTIVE_READONLY" }
    })

    fixture.service.close()
    rmSync(fixture.userDataPath, { recursive: true, force: true })
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  })

  describe("conversation changes", () => {
    it("registers the trusted worktree before Git reads and isolates watcher failures", async () => {
      const worktreeGitWatcher = {
        watchWorktree: vi.fn(() => {
          throw new Error("watcher unavailable")
        }),
        unwatchWorktree: vi.fn(),
        close: vi.fn()
      }
      const log = { warn: vi.fn() }
      const fixture = await createConversationChangesFixture({
        serviceDeps: { worktreeGitWatcher, log: log as never }
      })

      try {
        const result = await fixture.service.getConversationChanges({ conversationId: "conversation-changes" })
        expect(result.status).toBe("ok")
        expect(worktreeGitWatcher.watchWorktree).toHaveBeenCalledWith({
          worktreeId: fixture.imported.project.defaultWorktree.id,
          rootPath: realpathSync(fixture.repoRoot)
        })
        expect(log.warn).toHaveBeenCalledWith(
          "git",
          "git.watch.register.failed",
          expect.objectContaining({ worktreeId: fixture.imported.project.defaultWorktree.id })
        )
      } finally {
        fixture.service.close()
        expect(worktreeGitWatcher.close).toHaveBeenCalledOnce()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("reads independent staged and unstaged rows and lazy diffs from the bound real repository", async () => {
      const fixture = await createConversationChangesFixture()

      try {
        const result = await fixture.service.getConversationChanges({ conversationId: "conversation-changes" })
        expect(result.status).toBe("ok")
        if (result.status !== "ok") {
          throw new Error("expected conversation changes")
        }

        expect(result.changes).toMatchObject({
          conversationId: "conversation-changes",
          worktreeId: fixture.imported.project.defaultWorktree.id,
          worktreeRootPath: realpathSync(fixture.repoRoot),
          checkedAt: "2026-07-10T04:00:00.000Z"
        })
        expect(result.changes.staged.map((file) => file.path)).toEqual(expect.arrayContaining([
          "src/both.ts",
          "src/copy-source.ts",
          "src/copy-target.ts",
          "src/conflicted.ts",
          "src/renamed -> 新.ts"
        ]))
        expect(result.changes.unstaged.map((file) => file.path)).toEqual(expect.arrayContaining([
          "src/binary.dat",
          "src/both.ts",
          "src/conflicted.ts",
          "src/deleted.ts",
          "src/large.ts",
          "src/[literal].ts",
          "src/mode-only.sh",
          "src/unstaged.ts",
          fixture.untrackedBinaryPath,
          fixture.untrackedLargeBinaryPath,
          fixture.untrackedLargePath,
          fixture.untrackedTextPath
        ]))

        expect(result.changes.staged.find((file) => file.path === "src/renamed -> 新.ts")).toMatchObject({
          oldPath: "src/rename-source.ts",
          status: "renamed"
        })
        expect(result.changes.staged.find((file) => file.path === "src/copy-target.ts")).toMatchObject({
          oldPath: "src/copy-source.ts",
          status: "copied"
        })
        expect(result.changes.staged.find((file) => file.path === "src/conflicted.ts")).toMatchObject({
          status: "conflicted"
        })
        expect(result.changes.unstaged.find((file) => file.path === "src/conflicted.ts")).toMatchObject({
          status: "conflicted"
        })
        expect(result.changes.unstaged.find((file) => file.path === "src/deleted.ts")).toMatchObject({
          status: "deleted"
        })
        expect(result.changes.unstaged.find((file) => file.path === fixture.untrackedTextPath)).toMatchObject({
          status: "untracked",
          additions: 2,
          deletions: 0,
          isBinary: false
        })
        expect(result.changes.unstaged.find((file) => file.path === fixture.untrackedBinaryPath)).toMatchObject({
          status: "untracked",
          additions: 0,
          deletions: 0,
          isBinary: true
        })
        expect(result.changes.unstaged.find((file) => file.path === fixture.untrackedLargeBinaryPath)).toMatchObject({
          status: "untracked",
          additions: 0,
          deletions: 0,
          isBinary: true
        })
        expect(result.changes.unstaged.find((file) => file.path === fixture.untrackedLargePath)).toMatchObject({
          status: "untracked",
          additions: 0,
          deletions: 0,
          isBinary: false
        })
        expect(result.changes.unstaged.find((file) => file.path === "src/binary.dat")).toMatchObject({
          isBinary: true
        })

        const stagedDiff = await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: "src/both.ts",
          area: "staged"
        })
        expect(stagedDiff).toMatchObject({
          status: "text",
          conversationId: "conversation-changes",
          worktreeId: fixture.imported.project.defaultWorktree.id,
          filePath: "src/both.ts",
          area: "staged",
          truncated: false
        })
        if (stagedDiff.status === "text") {
          expect(stagedDiff.patch).toContain("-base")
          expect(stagedDiff.patch).toContain("+staged")
          expect(stagedDiff.originalByteLength).toBe(stagedDiff.returnedByteLength)
        }


        const stagedDocument = await fixture.service.getConversationChangeDiffDocument({
          conversationId: "conversation-changes",
          worktreeId: result.changes.worktreeId,
          revision: result.changes.revision,
          filePath: "src/both.ts",
          area: "staged"
        })
        expect(stagedDocument).toMatchObject({
          status: "text",
          original: "base\n",
          modified: "staged\n"
        })
        const unstagedDocument = await fixture.service.getConversationChangeDiffDocument({
          conversationId: "conversation-changes",
          worktreeId: result.changes.worktreeId,
          revision: result.changes.revision,
          filePath: "src/both.ts",
          area: "unstaged"
        })
        expect(unstagedDocument).toMatchObject({
          status: "text",
          original: "staged\n",
          modified: "staged\nworktree\n",
          originalMode: "100644",
          modifiedMode: "100644"
        })
        expect(await fixture.service.getConversationChangeDiffDocument({
          conversationId: "conversation-changes",
          worktreeId: result.changes.worktreeId,
          revision: result.changes.revision,
          filePath: "src/mode-only.sh",
          area: "unstaged"
        })).toMatchObject({
          status: "text",
          original: "#!/bin/sh\necho mode\n",
          modified: "#!/bin/sh\necho mode\n",
          originalMode: "100644",
          modifiedMode: "100755"
        })
        expect(await fixture.service.getConversationChangeDiffDocument({
          conversationId: "conversation-changes",
          worktreeId: result.changes.worktreeId,
          revision: result.changes.revision,
          filePath: "src/[literal].ts",
          area: "unstaged"
        })).toMatchObject({
          status: "text",
          original: "literal base\n",
          modified: "literal changed\n"
        })
        expect(await fixture.service.getConversationChangeDiffDocument({
          conversationId: "conversation-changes",
          worktreeId: result.changes.worktreeId,
          revision: result.changes.revision,
          filePath: fixture.untrackedTextPath,
          area: "unstaged"
        })).toMatchObject({
          status: "text",
          original: "",
          modified: "alpha\nbeta\n"
        })
        expect(await fixture.service.getConversationChangeDiffDocument({
          conversationId: "conversation-changes",
          worktreeId: result.changes.worktreeId,
          revision: result.changes.revision,
          filePath: fixture.untrackedBinaryPath,
          area: "unstaged"
        })).toMatchObject({ status: "binary" })
        expect(await fixture.service.getConversationChangeDiffDocument({
          conversationId: "conversation-changes",
          worktreeId: result.changes.worktreeId,
          revision: result.changes.revision,
          filePath: "src/conflicted.ts",
          area: "unstaged"
        })).toMatchObject({ status: "conflicted" })
        expect(await fixture.service.getConversationChangeDiffDocument({
          conversationId: "conversation-changes",
          worktreeId: result.changes.worktreeId,
          revision: result.changes.revision,
          filePath: "src/deleted.ts",
          area: "unstaged"
        })).toMatchObject({ status: "text", modified: "" })
        expect(await fixture.service.getConversationChangeDiffDocument({
          conversationId: "conversation-changes",
          worktreeId: result.changes.worktreeId,
          revision: result.changes.revision,
          filePath: "src/unstaged.ts",
          area: "staged"
        })).toMatchObject({ status: "missing", reason: "area-changed" })
        expect(await fixture.service.getConversationChangeDiffDocument({
          conversationId: "conversation-changes",
          worktreeId: result.changes.worktreeId,
          revision: "changes-v1:stale",
          filePath: "src/both.ts",
          area: "unstaged"
        })).toMatchObject({ status: "stale", actualRevision: result.changes.revision })

        const renamedDiff = await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: "src/renamed -> 新.ts",
          area: "staged"
        })
        expect(renamedDiff).toMatchObject({ status: "text", area: "staged" })
        if (renamedDiff.status === "text") {
          expect(renamedDiff.patch).toContain("similarity index 100%")
          expect(renamedDiff.patch).toContain("rename from src/rename-source.ts")
          expect(renamedDiff.patch).toContain("rename to ")
        }

        const copiedDiff = await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: "src/copy-target.ts",
          area: "staged"
        })
        expect(copiedDiff).toMatchObject({ status: "text", area: "staged" })
        if (copiedDiff.status === "text") {
          expect(copiedDiff.patch).toContain("similarity index 100%")
          expect(copiedDiff.patch).toContain("copy from src/copy-source.ts")
          expect(copiedDiff.patch).toContain("copy to src/copy-target.ts")
        }

        const untrackedDiff = await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: fixture.untrackedTextPath,
          area: "unstaged"
        })
        expect(untrackedDiff).toMatchObject({
          status: "text",
          filePath: fixture.untrackedTextPath,
          area: "unstaged",
          truncated: false
        })
        if (untrackedDiff.status === "text") {
          expect(untrackedDiff.patch).toContain("--- /dev/null")
          expect(untrackedDiff.patch).toContain("+alpha")
          expect(untrackedDiff.patch).toContain("+beta")
        }

        expect(await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: fixture.untrackedBinaryPath,
          area: "unstaged"
        })).toMatchObject({
          status: "binary",
          filePath: fixture.untrackedBinaryPath,
          area: "unstaged"
        })

        expect(await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: fixture.untrackedLargePath,
          area: "unstaged"
        })).toMatchObject({
          status: "text",
          filePath: fixture.untrackedLargePath,
          area: "unstaged",
          truncated: true
        })

        const largeDiff = await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: "src/large.ts",
          area: "unstaged"
        })
        expect(largeDiff).toMatchObject({
          status: "text",
          truncated: true
        })
        if (largeDiff.status === "text") {
          expect(largeDiff.returnedByteLength).toBeLessThanOrEqual(512 * 1024)
          expect(largeDiff.originalByteLength).toBeGreaterThan(largeDiff.returnedByteLength)
          expect(largeDiff.patch).not.toContain("tail without newline")
        }

        expect(await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: "src/unstaged.ts",
          area: "staged"
        })).toMatchObject({
          status: "missing",
          reason: "area-changed"
        })
        expect(await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: "src/no-longer-here.ts",
          area: "unstaged"
        })).toMatchObject({
          status: "missing",
          reason: "file-missing"
        })

        const oversizedPath = "src/oversized-document.txt"
        writeFileSync(join(fixture.repoRoot, oversizedPath), "x".repeat((2 * 1024 * 1024) + 1))
        const oversizedSnapshot = await fixture.service.getConversationChanges({ conversationId: "conversation-changes" })
        expect(oversizedSnapshot.status).toBe("ok")
        if (oversizedSnapshot.status === "ok") {
          expect(await fixture.service.getConversationChangeDiffDocument({
            conversationId: "conversation-changes",
            worktreeId: oversizedSnapshot.changes.worktreeId,
            revision: oversizedSnapshot.changes.revision,
            filePath: oversizedPath,
            area: "unstaged"
          })).toMatchObject({
            status: "too-large",
            side: "modified",
            byteLength: (2 * 1024 * 1024) + 1,
            limitBytes: 2 * 1024 * 1024
          })
        }

        const oversizedStagedPath = "src/oversized-staged-document.txt"
        writeFileSync(join(fixture.repoRoot, oversizedStagedPath), "y".repeat((2 * 1024 * 1024) + 7))
        runGit(fixture.repoRoot, ["add", "--", oversizedStagedPath])
        const oversizedStagedSnapshot = await fixture.service.getConversationChanges({ conversationId: "conversation-changes" })
        expect(oversizedStagedSnapshot.status).toBe("ok")
        if (oversizedStagedSnapshot.status === "ok") {
          expect(await fixture.service.getConversationChangeDiffDocument({
            conversationId: "conversation-changes",
            worktreeId: oversizedStagedSnapshot.changes.worktreeId,
            revision: oversizedStagedSnapshot.changes.revision,
            filePath: oversizedStagedPath,
            area: "staged"
          })).toMatchObject({
            status: "too-large",
            side: "modified",
            byteLength: (2 * 1024 * 1024) + 7,
            limitBytes: 2 * 1024 * 1024
          })
        }
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("returns structured errors for a missing conversation and missing bound worktree", async () => {
      const fixture = await createConversationChangesFixture()

      try {
        expect(await fixture.service.getConversationChanges({ conversationId: "missing-conversation" })).toMatchObject({
          status: "error",
          error: { code: "CONVERSATION_NOT_FOUND" }
        })
        expect(await fixture.service.getConversationChangeDiff({
          conversationId: "missing-conversation",
          filePath: "src/file.ts",
          area: "unstaged"
        })).toMatchObject({
          status: "error",
          conversationId: "missing-conversation",
          filePath: "src/file.ts",
          area: "unstaged",
          error: { code: "CONVERSATION_NOT_FOUND" }
        })

        rmSync(fixture.repoRoot, { recursive: true, force: true })
        expect(await fixture.service.getConversationChanges({ conversationId: "conversation-changes" })).toMatchObject({
          status: "error",
          error: { code: "WORKTREE_NOT_FOUND" }
        })
        expect(await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: "src/file.ts",
          area: "unstaged"
        })).toMatchObject({
          status: "error",
          error: { code: "WORKTREE_NOT_FOUND" }
        })
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("does not follow an untracked file replaced by an outside symlink after validation", async () => {
      const outsideRoot = createTempDir("teamcow-conversation-changes-outside-")
      const outsidePath = join(outsideRoot, "secret.ts")
      writeFileSync(outsidePath, "outside secret must not be read\n")
      let replaced = false
      const fixture = await createConversationChangesFixture({
        serviceDeps: {
          beforeOpenConversationChangesUntrackedFile: ({ targetPath }: { targetPath: string }) => {
            if (replaced || !targetPath.endsWith("untracked -> 新\tname.ts")) {
              return
            }
            rmSync(targetPath)
            symlinkSync(outsidePath, targetPath)
            replaced = true
          }
        } as never
      })

      try {
        const diff = await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: fixture.untrackedTextPath,
          area: "unstaged"
        })
        expect(replaced).toBe(true)
        expect(diff).toMatchObject({
          status: "unavailable",
          filePath: fixture.untrackedTextPath,
          area: "unstaged"
        })
        expect(JSON.stringify(diff)).not.toContain("outside secret must not be read")
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
        rmSync(outsideRoot, { recursive: true, force: true })
      }
    })

    it("keeps list stats bounded and validates untracked diff content lazily", async () => {
      const opened = vi.fn()
      const fixture = await createConversationChangesFixture({
        serviceDeps: { beforeOpenConversationChangesUntrackedFile: opened } as never
      })

      try {
        const executablePath = "src/untracked-executable.sh"
        const invalidUtf8Path = "src/untracked-invalid-utf8.txt"
        writeFileSync(join(fixture.repoRoot, executablePath), "#!/bin/sh\necho ok\n")
        chmodSync(join(fixture.repoRoot, executablePath), 0o755)
        writeFileSync(join(fixture.repoRoot, invalidUtf8Path), Buffer.from([0xc3, 0x28, 0x0a]))

        expect(await fixture.service.getConversationChanges({ conversationId: "conversation-changes" })).toMatchObject({
          status: "ok",
          changes: {
            unstaged: expect.arrayContaining([
              expect.objectContaining({ path: executablePath, additions: 2, isBinary: false }),
              expect.objectContaining({ path: invalidUtf8Path, additions: 0, isBinary: true })
            ])
          }
        })
        expect(opened).not.toHaveBeenCalled()

        const executableDiff = await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: executablePath,
          area: "unstaged"
        })
        expect(executableDiff).toMatchObject({ status: "text" })
        if (executableDiff.status === "text") {
          expect(executableDiff.patch).toContain("new file mode 100755")
        }
        expect(await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes",
          filePath: invalidUtf8Path,
          area: "unstaged"
        })).toMatchObject({ status: "binary" })
        expect(opened).toHaveBeenCalledTimes(1)
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("caps untracked stat hydration by attempted file count", async () => {
      const fixture = await createConversationChangesFixture()

      try {
        for (let index = 0; index <= 256; index += 1) {
          writeFileSync(
            join(fixture.repoRoot, `000-cap-${index.toString().padStart(3, "0")}.dat`),
            Buffer.from([0, index % 255])
          )
        }

        const result = await fixture.service.getConversationChanges({ conversationId: "conversation-changes" })
        expect(result.status).toBe("ok")
        if (result.status === "ok") {
          expect(result.changes.unstaged.find((file) => file.path === "000-cap-255.dat")).toMatchObject({
            isBinary: true
          })
          expect(result.changes.unstaged.find((file) => file.path === "000-cap-256.dat")).toMatchObject({
            isBinary: false
          })
        }
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("returns a bounded tracked patch even when git produces more than the normal command buffer", async () => {
      const fixture = await createConversationChangesMutationFixture()

      try {
        const filePath = "src/huge-diff.ts"
        writeFileSync(join(fixture.repoRoot, filePath), "base\n")
        runGit(fixture.repoRoot, ["add", "--", filePath])
        runGit(fixture.repoRoot, ["commit", "-m", "add huge diff fixture"])
        writeFileSync(join(fixture.repoRoot, filePath), "expanded line\n".repeat(800_000))

        const diff = await fixture.service.getConversationChangeDiff({
          conversationId: "conversation-changes-mutation",
          filePath,
          area: "unstaged"
        })
        expect(diff).toMatchObject({ status: "text", truncated: true })
        if (diff.status === "text") {
          expect(diff.returnedByteLength).toBeLessThanOrEqual(512 * 1024)
          expect(diff.originalByteLength).toBeGreaterThan(diff.returnedByteLength)
        }
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })
  })

  describe("mutates conversation changes", () => {
    it("stages one current unstaged path and then all freshly observed unstaged paths", async () => {
      const fixture = await createConversationChangesMutationFixture()

      try {
        writeFileSync(join(fixture.repoRoot, "src", "one.ts"), "one changed\n")
        writeFileSync(join(fixture.repoRoot, "src", "two -> 新.ts"), "two changed\n")
        writeFileSync(join(fixture.repoRoot, "src", "new\tfile.ts"), "new file\n")
        writeFileSync(join(fixture.repoRoot, ":!literal.ts"), "literal changed\n")
        writeFileSync(join(fixture.repoRoot, "other-root.ts"), "other root changed\n")

        expect(await fixture.service.stageConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: "src/one.ts" }
        })).toMatchObject({
          status: "ok",
          conversationId: "conversation-changes-mutation",
          worktreeId: fixture.imported.project.defaultWorktree.id,
          scope: { type: "file", filePath: "src/one.ts" },
          changedPaths: ["src/one.ts"]
        })
        expect(runGit(fixture.repoRoot, ["diff", "--cached", "--name-only", "--"])).toBe("src/one.ts\n")

        expect(await fixture.service.stageConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: ":!literal.ts" }
        })).toMatchObject({ status: "ok", changedPaths: [":!literal.ts"] })
        expect(runGit(fixture.repoRoot, ["diff", "--cached", "--name-only", "-z", "--"]).split("\0").filter(Boolean))
          .toEqual([":!literal.ts", "src/one.ts"])

        const stageAll = await fixture.service.stageConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "all" }
        })
        expect(stageAll).toMatchObject({
          status: "ok",
          scope: { type: "all" }
        })
        if (stageAll.status !== "ok") {
          throw new Error("expected all changes to be staged")
        }
        expect(stageAll.changedPaths).toEqual(expect.arrayContaining([
          "src/new\tfile.ts",
          "src/two -> 新.ts",
          "other-root.ts"
        ]))
        expect(runGit(fixture.repoRoot, ["diff", "--cached", "--name-only", "-z", "--"]).split("\0").filter(Boolean))
          .toEqual(expect.arrayContaining(["src/new\tfile.ts", "src/one.ts", "src/two -> 新.ts"]))
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("unstages one path and all paths without changing worktree content", async () => {
      const fixture = await createConversationChangesMutationFixture()

      try {
        writeFileSync(join(fixture.repoRoot, "src", "one.ts"), "one staged\n")
        writeFileSync(join(fixture.repoRoot, "src", "two -> 新.ts"), "two staged\n")
        runGit(fixture.repoRoot, ["add", "--", "src/one.ts", "src/two -> 新.ts"])

        expect(await fixture.service.unstageConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: "src/one.ts" }
        })).toMatchObject({
          status: "ok",
          changedPaths: ["src/one.ts"]
        })
        expect(readFileSync(join(fixture.repoRoot, "src", "one.ts"), "utf8")).toBe("one staged\n")
        expect(runGit(fixture.repoRoot, ["diff", "--cached", "--name-only", "-z", "--"])).toBe("src/two -> 新.ts\0")

        expect(await fixture.service.unstageConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "all" }
        })).toMatchObject({
          status: "ok",
          changedPaths: ["src/two -> 新.ts"]
        })
        expect(runGit(fixture.repoRoot, ["diff", "--cached", "--name-only", "--"])).toBe("")
        expect(readFileSync(join(fixture.repoRoot, "src", "two -> 新.ts"), "utf8")).toBe("two staged\n")

        runGit(fixture.repoRoot, ["mv", "--", "src/one.ts", "src/renamed-one.ts"])
        expect(await fixture.service.unstageConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: "src/renamed-one.ts" }
        })).toMatchObject({
          status: "ok",
          changedPaths: ["src/one.ts", "src/renamed-one.ts"]
        })
        expect(runGit(fixture.repoRoot, ["diff", "--cached", "--name-only", "--"])).toBe("")
        expect(readFileSync(join(fixture.repoRoot, "src", "renamed-one.ts"), "utf8")).toBe("one staged\n")
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("unstages an unborn HEAD index and treats an already empty index as a no-op", async () => {
      const fixture = await createConversationChangesMutationFixture({ unborn: true })

      try {
        writeFileSync(join(fixture.repoRoot, "src", "one.ts"), "one staged\n")
        writeFileSync(join(fixture.repoRoot, "src", "two.ts"), "two staged\n")
        runGit(fixture.repoRoot, ["add", "--", "src/one.ts", "src/two.ts"])

        expect(await fixture.service.unstageConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: "src/one.ts" }
        })).toMatchObject({ status: "ok", changedPaths: ["src/one.ts"] })
        expect(existsSync(join(fixture.repoRoot, "src", "one.ts"))).toBe(true)
        expect(runGit(fixture.repoRoot, ["ls-files", "-z"])).toBe("src/two.ts\0")

        expect(await fixture.service.unstageConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "all" }
        })).toMatchObject({ status: "ok", changedPaths: ["src/two.ts"] })
        expect(runGit(fixture.repoRoot, ["ls-files", "-z"])).toBe("")
        expect(readFileSync(join(fixture.repoRoot, "src", "two.ts"), "utf8")).toBe("two staged\n")

        expect(await fixture.service.unstageConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "all" }
        })).toMatchObject({ status: "ok", changedPaths: [] })
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("discards only the unstaged side of a dual-state file", async () => {
      const fixture = await createConversationChangesMutationFixture()

      try {
        writeFileSync(join(fixture.repoRoot, "src", "dual.ts"), "dual staged\n")
        runGit(fixture.repoRoot, ["add", "--", "src/dual.ts"])
        writeFileSync(join(fixture.repoRoot, "src", "dual.ts"), "dual staged\ndual worktree\n")

        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: "src/dual.ts" }
        })).toMatchObject({ status: "ok", changedPaths: ["src/dual.ts"] })
        expect(readFileSync(join(fixture.repoRoot, "src", "dual.ts"), "utf8")).toBe("dual staged\n")
        expect(runGit(fixture.repoRoot, ["show", ":src/dual.ts"])).toBe("dual staged\n")
        expect(runGit(fixture.repoRoot, ["diff", "--", "src/dual.ts"])).toBe("")
        expect(runGit(fixture.repoRoot, ["diff", "--cached", "--", "src/dual.ts"])).toContain("+dual staged")

        writeFileSync(join(fixture.repoRoot, ":(glob)*.ts"), "glob literal changed\n")
        writeFileSync(join(fixture.repoRoot, "other-root.ts"), "other root must remain changed\n")
        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: ":(glob)*.ts" }
        })).toMatchObject({ status: "ok", changedPaths: [":(glob)*.ts"] })
        expect(readFileSync(join(fixture.repoRoot, ":(glob)*.ts"), "utf8")).toBe("glob literal base\n")
        expect(readFileSync(join(fixture.repoRoot, "other-root.ts"), "utf8")).toBe("other root must remain changed\n")
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("materializes binary, executable, and symlink index entries through the native conditional writer", async () => {
      const fixture = await createConversationChangesMutationFixture()

      try {
        const binaryPath = join(fixture.repoRoot, "src", "tracked.bin")
        const executablePath = join(fixture.repoRoot, "src", "run.sh")
        const symlinkPath = join(fixture.repoRoot, "src", "tracked-link")
        writeFileSync(binaryPath, Buffer.from([0, 1, 2, 255]))
        writeFileSync(executablePath, "#!/bin/sh\necho base\n")
        chmodSync(executablePath, 0o755)
        symlinkSync("one.ts", symlinkPath)
        runGit(fixture.repoRoot, ["add", "--", "src/tracked.bin", "src/run.sh", "src/tracked-link"])
        runGit(fixture.repoRoot, ["commit", "-m", "add native discard fixtures"])

        writeFileSync(binaryPath, Buffer.from([9, 8, 7, 0]))
        writeFileSync(executablePath, "#!/bin/sh\necho changed\n")
        chmodSync(executablePath, 0o644)
        rmSync(symlinkPath)
        symlinkSync("dual.ts", symlinkPath)

        const result = await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "all" }
        })
        expect(result).toMatchObject({ status: "ok" })
        expect(readFileSync(binaryPath)).toEqual(Buffer.from([0, 1, 2, 255]))
        expect(readFileSync(executablePath, "utf8")).toBe("#!/bin/sh\necho base\n")
        expect(statSync(executablePath).mode & 0o777).toBe(0o755)
        expect(readlinkSync(symlinkPath)).toBe("one.ts")
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("refuses tracked and untracked discard when content changes after confirmation", async () => {
      const changed = new Set<string>()
      const fixture = await createConversationChangesMutationFixture({
        serviceDeps: {
          beforeDiscardConversationChange: ({ filePath, targetPath }: { filePath: string; targetPath: string }) => {
            if (changed.has(filePath)) return
            changed.add(filePath)
            writeFileSync(targetPath, `new content after confirmation: ${filePath}\n`)
          }
        } as never
      })

      try {
        const trackedPath = "src/one.ts"
        const untrackedPath = "src/stale-untracked.txt"
        writeFileSync(join(fixture.repoRoot, trackedPath), "tracked before confirmation\n")
        writeFileSync(join(fixture.repoRoot, untrackedPath), "untracked before confirmation\n")

        for (const filePath of [trackedPath, untrackedPath]) {
          expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
            conversationId: "conversation-changes-mutation",
            scope: { type: "file", filePath }
          })).toMatchObject({
            status: "error",
            error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
          })
          expect(readFileSync(join(fixture.repoRoot, filePath), "utf8"))
            .toBe(`new content after confirmation: ${filePath}\n`)
        }
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("preserves a concurrent tracked save that lands immediately before the native conditional apply", async () => {
      let replaced = false
      const fixture = await createConversationChangesMutationFixture({
        serviceDeps: {
          beforeNativeTrackedDiscardApply: ({ targetPath }: { targetPath: string }) => {
            if (replaced) return
            replaced = true
            writeFileSync(targetPath, "concurrent save must survive\n")
          }
        } as never
      })

      try {
        const filePath = "src/one.ts"
        writeFileSync(join(fixture.repoRoot, filePath), "discard candidate\n")
        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath }
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
        })
        expect(readFileSync(join(fixture.repoRoot, filePath), "utf8")).toBe("concurrent save must survive\n")
        expect(readdirSync(join(fixture.repoRoot, "src")).some((name) => name.includes(".teamcow-discard-"))).toBe(false)
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("refuses tracked restore when a missing parent becomes an external symlink", async () => {
      const outsideRoot = createTempDir("teamcow-tracked-discard-parent-outside-")
      const fixture = await createConversationChangesMutationFixture({
        serviceDeps: {
          beforeNativeTrackedDiscardApply: ({ filePath }: { filePath: string }) => {
            if (filePath !== "removed-parent/file.txt") return
            symlinkSync(outsideRoot, join(fixture.repoRoot, "removed-parent"))
          }
        } as never
      })

      try {
        mkdirSync(join(fixture.repoRoot, "removed-parent"))
        writeFileSync(join(fixture.repoRoot, "removed-parent", "file.txt"), "tracked parent content\n")
        runGit(fixture.repoRoot, ["add", "--", "removed-parent/file.txt"])
        runGit(fixture.repoRoot, ["commit", "-m", "add parent restore fixture"])
        rmSync(join(fixture.repoRoot, "removed-parent"), { recursive: true })

        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: "removed-parent/file.txt" }
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
        })
        expect(existsSync(join(outsideRoot, "file.txt"))).toBe(false)
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
        rmSync(outsideRoot, { recursive: true, force: true })
      }
    })

    it("safely recreates missing tracked parent directories from the root descriptor", async () => {
      const fixture = await createConversationChangesMutationFixture()

      try {
        const filePath = "removed/tree/file.txt"
        mkdirSync(join(fixture.repoRoot, "removed", "tree"), { recursive: true })
        writeFileSync(join(fixture.repoRoot, filePath), "restore nested content\n")
        runGit(fixture.repoRoot, ["add", "--", filePath])
        runGit(fixture.repoRoot, ["commit", "-m", "add nested restore fixture"])
        rmSync(join(fixture.repoRoot, "removed"), { recursive: true })

        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath }
        })).toMatchObject({ status: "ok", changedPaths: [filePath] })
        expect(readFileSync(join(fixture.repoRoot, filePath), "utf8")).toBe("restore nested content\n")
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("reports tracked rename discard as partial when a later conditional removal fails", async () => {
      const fixture = await createConversationChangesMutationFixture({
        serviceDeps: {
          readGitStatus: () => ({
            status: "ok" as const,
            stdout: " R src/renamed-one.ts\0src/one.ts\0",
            stderr: ""
          }),
          conversationChangeRemover: vi.fn(() => ({
            status: "error" as const,
            didMutate: false,
            error: {
              code: "GIT_CHANGE_OPERATION_FAILED" as const,
              message: "injected later path failure",
              suggestion: null,
              domain: "git" as const
            }
          }))
        } as never
      })

      try {
        renameSync(join(fixture.repoRoot, "src", "one.ts"), join(fixture.repoRoot, "src", "renamed-one.ts"))
        const current = await fixture.service.getConversationChanges({ conversationId: "conversation-changes-mutation" })
        expect(current).toMatchObject({
          status: "ok",
          changes: {
            unstaged: [expect.objectContaining({
              path: "src/renamed-one.ts",
              oldPath: "src/one.ts",
              status: "renamed"
            })]
          }
        })
        if (current.status !== "ok") throw new Error("expected rename changes")

        const result = await fixture.service.discardConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: "src/renamed-one.ts" },
          expectedRevision: current.changes.revision
        })
        expect(result).toMatchObject({
          status: "partial",
          changedPaths: ["src/one.ts"],
          failures: [expect.objectContaining({ filePath: "src/renamed-one.ts" })]
        })
        expect(readFileSync(join(fixture.repoRoot, "src", "one.ts"), "utf8")).toBe("one base\n")
        expect(readFileSync(join(fixture.repoRoot, "src", "renamed-one.ts"), "utf8")).toBe("one base\n")
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("removes untracked files, directories, and external symlinks without following them", async () => {
      const outsideRoot = createTempDir("teamcow-conversation-changes-discard-outside-")
      const outsideFile = join(outsideRoot, "keep.txt")
      writeFileSync(outsideFile, "must survive\n")
      const fixture = await createConversationChangesMutationFixture()

      try {
        const untrackedFile = "src/untracked-file.txt"
        const untrackedDirectory = "src/untracked-directory"
        const externalSymlink = "src/external-link"
        writeFileSync(join(fixture.repoRoot, untrackedFile), "remove file\n")
        mkdirSync(join(fixture.repoRoot, untrackedDirectory))
        writeFileSync(join(fixture.repoRoot, untrackedDirectory, "nested.txt"), "remove directory\n")
        mkdirSync(join(fixture.repoRoot, untrackedDirectory, "nested-directory"))
        writeFileSync(join(fixture.repoRoot, untrackedDirectory, "nested-directory", "deep.txt"), "remove deeply\n")
        writeFileSync(join(fixture.repoRoot, untrackedDirectory, "tab\tline\n新.txt"), "remove special path\n")
        symlinkSync(outsideRoot, join(fixture.repoRoot, untrackedDirectory, "nested-external-link"))
        symlinkSync(outsideRoot, join(fixture.repoRoot, externalSymlink))

        for (const filePath of [untrackedFile, untrackedDirectory, externalSymlink]) {
          const discardResult = await discardConversationChangesAtCurrentRevision(fixture.service, {
            conversationId: "conversation-changes-mutation",
            scope: { type: "file", filePath }
          })
          expect(discardResult).toMatchObject({ status: "ok", changedPaths: [filePath] })
          expect(existsSync(join(fixture.repoRoot, filePath))).toBe(false)
        }
        expect(readFileSync(outsideFile, "utf8")).toBe("must survive\n")

        const mixedDirectory = "src/mixed-untracked-directory"
        mkdirSync(join(fixture.repoRoot, mixedDirectory))
        writeFileSync(join(fixture.repoRoot, mixedDirectory, "visible.txt"), "visible untracked\n")
        writeFileSync(join(fixture.repoRoot, mixedDirectory, "ignored.txt"), "ignored content must survive\n")
        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: mixedDirectory }
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
        })
        expect(readFileSync(join(fixture.repoRoot, mixedDirectory, "visible.txt"), "utf8")).toBe("visible untracked\n")
        expect(readFileSync(join(fixture.repoRoot, mixedDirectory, "ignored.txt"), "utf8")).toBe("ignored content must survive\n")

        const nestedRepository = "src/nested-repository"
        mkdirSync(join(fixture.repoRoot, nestedRepository))
        runGit(join(fixture.repoRoot, nestedRepository), ["init"])
        writeFileSync(join(fixture.repoRoot, nestedRepository, "nested.txt"), "nested repository content\n")
        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: nestedRepository }
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
        })
        expect(existsSync(join(fixture.repoRoot, nestedRepository, ".git"))).toBe(true)
        expect(readFileSync(join(fixture.repoRoot, nestedRepository, "nested.txt"), "utf8")).toBe("nested repository content\n")
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
        rmSync(outsideRoot, { recursive: true, force: true })
      }
    })

    it("does not follow a parent replaced by an external symlink before the final native remove", async () => {
      const outsideRoot = createTempDir("teamcow-conversation-change-remove-race-outside-")
      const outsideFile = join(outsideRoot, "untracked.txt")
      writeFileSync(outsideFile, "external content must survive\n")
      let replacedParent = false
      const fixture = await createConversationChangesMutationFixture({
        serviceDeps: {
          beforeNativeConversationChangeRemove: ({
            filePath,
            targetPath
          }: {
            filePath: string
            targetPath: string
          }) => {
            if (replacedParent || filePath !== "src/race-parent/untracked.txt") {
              return
            }
            const parentPath = dirname(targetPath)
            renameSync(parentPath, `${parentPath}-original`)
            symlinkSync(outsideRoot, parentPath)
            replacedParent = true
          }
        } as never
      })

      try {
        const targetPath = join(fixture.repoRoot, "src", "race-parent", "untracked.txt")
        mkdirSync(dirname(targetPath))
        writeFileSync(targetPath, "inside content\n")

        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: "src/race-parent/untracked.txt" }
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
        })
        expect(replacedParent).toBe(true)
        expect(readFileSync(outsideFile, "utf8")).toBe("external content must survive\n")
        expect(readFileSync(`${dirname(targetPath)}-original/untracked.txt`, "utf8")).toBe("inside content\n")
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
        rmSync(outsideRoot, { recursive: true, force: true })
      }
    })

    it("preserves an untracked file modified immediately before native removal", async () => {
      let modified = false
      const fixture = await createConversationChangesMutationFixture({
        serviceDeps: {
          beforeNativeConversationChangeRemove: ({ targetPath }: { targetPath: string }) => {
            writeFileSync(targetPath, "replacement content\n")
            modified = true
          }
        } as never
      })

      try {
        const filePath = "src/native-stale.txt"
        writeFileSync(join(fixture.repoRoot, filePath), "original content\n")
        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath }
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
        })
        expect(modified).toBe(true)
        expect(readFileSync(join(fixture.repoRoot, filePath), "utf8")).toBe("replacement content\n")
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("refuses a directory when ignored content appears after the final JavaScript check", async () => {
      let injectedIgnoredFile = false
      const fixture = await createConversationChangesMutationFixture({
        serviceDeps: {
          beforeNativeConversationChangeRemove: ({
            filePath,
            targetPath
          }: {
            filePath: string
            targetPath: string
          }) => {
            if (injectedIgnoredFile || filePath !== "src/late-directory") {
              return
            }
            writeFileSync(join(targetPath, "ignored.txt"), "late ignored content\n")
            injectedIgnoredFile = true
          }
        } as never
      })

      try {
        const directoryPath = join(fixture.repoRoot, "src", "late-directory")
        mkdirSync(directoryPath)
        writeFileSync(join(directoryPath, "visible.txt"), "visible content\n")

        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: "src/late-directory" }
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
        })
        expect(injectedIgnoredFile).toBe(true)
        expect(readFileSync(join(directoryPath, "visible.txt"), "utf8")).toBe("visible content\n")
        expect(readFileSync(join(directoryPath, "ignored.txt"), "utf8")).toBe("late ignored content\n")
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("refuses conflicted single and bulk discard before changing any target", async () => {
      const fixture = await createConversationChangesFixture()

      try {
        const beforeBoth = readFileSync(join(fixture.repoRoot, "src", "both.ts"), "utf8")
        const beforeUntracked = readFileSync(join(fixture.repoRoot, fixture.untrackedTextPath), "utf8")

        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes",
          scope: { type: "all" }
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
        })
        expect(readFileSync(join(fixture.repoRoot, "src", "both.ts"), "utf8")).toBe(beforeBoth)
        expect(readFileSync(join(fixture.repoRoot, fixture.untrackedTextPath), "utf8")).toBe(beforeUntracked)

        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes",
          scope: { type: "file", filePath: "src/conflicted.ts" }
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
        })
        expect(readFileSync(join(fixture.repoRoot, "src", "both.ts"), "utf8")).toBe(beforeBoth)
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("reports partial bulk discard when a later untracked target disappears", async () => {
      let secondTargetPath = ""
      const fixture = await createConversationChangesMutationFixture({
        serviceDeps: {
          beforeDiscardConversationChange: ({ filePath, targetPath }: { filePath: string; targetPath: string }) => {
            if (filePath === "src/partial-two.txt") {
              secondTargetPath = targetPath
              rmSync(targetPath)
            }
          }
        } as never
      })

      try {
        writeFileSync(join(fixture.repoRoot, "src", "partial-one.txt"), "one\n")
        writeFileSync(join(fixture.repoRoot, "src", "partial-two.txt"), "two\n")

        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "all" }
        })).toMatchObject({
          status: "partial",
          changedPaths: ["src/partial-one.txt"],
          failures: [{
            filePath: "src/partial-two.txt",
            error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
          }]
        })
        expect(secondTargetPath).toBe(join(realpathSync(fixture.repoRoot), "src", "partial-two.txt"))
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("reports partial when the native remover fails after mutating the target", async () => {
      const fixture = await createConversationChangesMutationFixture({
        serviceDeps: {
          conversationChangeRemover: () => ({
            status: "error",
            didMutate: true,
            nativeStatus: "remove_failed",
            error: {
              code: "GIT_CHANGE_OPERATION_FAILED",
              message: "native remove failed after mutation",
              suggestion: "simulated native partial",
              domain: "git"
            }
          })
        } as never
      })

      try {
        const filePath = "src/native-partial.txt"
        writeFileSync(join(fixture.repoRoot, filePath), "partial target\n")
        expect(await discardConversationChangesAtCurrentRevision(fixture.service, {
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath }
        })).toMatchObject({
          status: "partial",
          changedPaths: [filePath],
          failures: [{
            filePath,
            error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
          }]
        })
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("rejects stale membership, traversal, and a missing bound worktree without touching another path", async () => {
      const outsideRoot = createTempDir("teamcow-conversation-changes-traversal-")
      const outsideFile = join(outsideRoot, "outside.txt")
      writeFileSync(outsideFile, "outside\n")
      const fixture = await createConversationChangesMutationFixture()

      try {
        writeFileSync(join(fixture.repoRoot, "src", "one.ts"), "one changed\n")
        expect(await fixture.service.stageConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: "src/not-current.ts" }
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_CHANGE_OPERATION_FAILED", domain: "git" }
        })
        expect(runGit(fixture.repoRoot, ["diff", "--cached", "--name-only", "--"])).toBe("")
        expect(readFileSync(join(fixture.repoRoot, "src", "one.ts"), "utf8")).toBe("one changed\n")

        await expect(fixture.service.discardConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "file", filePath: "../outside.txt" }
        } as never)).rejects.toThrow()
        expect(readFileSync(outsideFile, "utf8")).toBe("outside\n")

        rmSync(fixture.repoRoot, { recursive: true, force: true })
        expect(await fixture.service.stageConversationChanges({
          conversationId: "conversation-changes-mutation",
          scope: { type: "all" }
        })).toMatchObject({
          status: "error",
          error: {
            code: "GIT_CHANGE_OPERATION_FAILED",
            domain: "git",
            context: {
              conversationId: "conversation-changes-mutation",
              worktreeId: fixture.imported.project.defaultWorktree.id
            }
          }
        })
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
        rmSync(outsideRoot, { recursive: true, force: true })
      }
    })

    it("commits the existing index only and never updates a configured remote", async () => {
      const remoteRoot = createTempDir("teamcow-conversation-changes-remote-")
      runGit(remoteRoot, ["init", "--bare"])
      const mutationCommands: string[][] = []
      const fixture = await createConversationChangesMutationFixture({
        serviceDeps: { readGitCommand: createRecordingGitCommandRunner(mutationCommands) } as never
      })

      try {
        runGit(fixture.repoRoot, ["remote", "add", "origin", remoteRoot])
        const fakeHookHash = "f".repeat(40)
        const postCommitHookPath = join(fixture.repoRoot, ".git", "hooks", "post-commit")
        writeFileSync(
          postCommitHookPath,
          `#!/bin/sh\necho "[main ${fakeHookHash}] fake stdout summary"\necho "[main ${"e".repeat(40)}] fake stderr summary" >&2\n`
        )
        chmodSync(postCommitHookPath, 0o755)
        writeFileSync(join(fixture.repoRoot, "src", "one.ts"), "one staged for commit\n")
        runGit(fixture.repoRoot, ["add", "--", "src/one.ts"])
        writeFileSync(join(fixture.repoRoot, "src", "unstaged-only.ts"), "must remain unstaged\n")

        const result = await fixture.service.commitConversationChanges({
          conversationId: "conversation-changes-mutation",
          message: "  commit staged only  "
        })
        expect(result).toMatchObject({
          status: "committed",
          conversationId: "conversation-changes-mutation",
          worktreeId: fixture.imported.project.defaultWorktree.id
        })
        if (result.status !== "committed") {
          throw new Error("expected staged commit")
        }
        expect(result.commitHash).toBe(runGit(fixture.repoRoot, ["rev-parse", "HEAD"]).trim())
        expect(result.commitHash).not.toBe(fakeHookHash)
        expect(result.shortCommitHash).toBe(result.commitHash.slice(0, 12))
        expect(runGit(fixture.repoRoot, ["log", "-1", "--format=%s"])).toBe("commit staged only\n")
        expect(runGit(fixture.repoRoot, ["show", "HEAD:src/one.ts"])).toBe("one staged for commit\n")
        expect(runGit(fixture.repoRoot, ["show", "HEAD:src/unstaged-only.ts"])).toBe("unstaged base\n")
        expect(readFileSync(join(fixture.repoRoot, "src", "unstaged-only.ts"), "utf8")).toBe("must remain unstaged\n")
        expect(mutationCommands.some((args) => args.includes("add"))).toBe(false)
        expect(mutationCommands.some((args) => args.some((arg) => ["fetch", "pull", "push"].includes(arg)))).toBe(false)
        expect(mutationCommands.filter((args) => args.includes("rev-parse"))).toHaveLength(2)
        expect(() => runGit(remoteRoot, ["show-ref"])).toThrow()
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
        rmSync(remoteRoot, { recursive: true, force: true })
      }
    })

    it("does not run commit when an existing HEAD cannot be read", async () => {
      const commands: string[][] = []
      const hostRunner = createRecordingGitCommandRunner(commands)
      let failedHeadRead = false
      const fixture = await createConversationChangesMutationFixture({
        serviceDeps: {
          readGitCommand: (rootPath: string, args: string[]) => {
            commands.push([...args])
            if (!failedHeadRead && args[0] === "rev-parse" && args.includes("HEAD")) {
              failedHeadRead = true
              return {
                status: "error" as const,
                error: {
                  code: "GIT_STATUS_FAILED" as const,
                  message: "injected HEAD read failure",
                  suggestion: "I/O failure",
                  domain: "git" as const
                }
              }
            }
            return hostRunner(rootPath, args)
          }
        } as never
      })

      try {
        const beforeHead = runGit(fixture.repoRoot, ["rev-parse", "HEAD"]).trim()
        writeFileSync(join(fixture.repoRoot, "src", "one.ts"), "staged but not committed\n")
        runGit(fixture.repoRoot, ["add", "--", "src/one.ts"])

        expect(await fixture.service.commitConversationChanges({
          conversationId: "conversation-changes-mutation",
          message: "must not be created"
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_COMMIT_FAILED", domain: "git" }
        })
        expect(runGit(fixture.repoRoot, ["rev-parse", "HEAD"]).trim()).toBe(beforeHead)
        expect(runGit(fixture.repoRoot, ["diff", "--cached", "--name-only", "--"])).toBe("src/one.ts\n")
        expect(commands.some((args) => args[0] === "commit")).toBe(false)
      } finally {
        fixture.service.close()
        rmSync(fixture.userDataPath, { recursive: true, force: true })
        rmSync(fixture.repoRoot, { recursive: true, force: true })
      }
    })

    it("returns structured commit failures for an empty index, missing identity, and a rejecting hook", async () => {
      const emptyFixture = await createConversationChangesMutationFixture()
      const identityFixture = await createConversationChangesMutationFixture()
      const hookFixture = await createConversationChangesMutationFixture()
      const invalidMessageFixture = await createConversationChangesMutationFixture()
      const noSummaryCommands: string[][] = []
      const noSummaryRunner = createRecordingGitCommandRunner(noSummaryCommands)
      const noSummaryFixture = await createConversationChangesMutationFixture({
        serviceDeps: {
          readGitCommand: (rootPath: string, args: string[]) => {
            const result = noSummaryRunner(rootPath, args)
            return result.status === "ok" && args.includes("commit")
              ? { ...result, stdout: "post-commit hook output without a summary\n" }
              : result
          }
        } as never
      })

      try {
        expect(await emptyFixture.service.commitConversationChanges({
          conversationId: "conversation-changes-mutation",
          message: "nothing staged"
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_COMMIT_EMPTY_INDEX", domain: "git" }
        })
        await expect(emptyFixture.service.commitConversationChanges({
          conversationId: "conversation-changes-mutation",
          message: "   "
        })).rejects.toThrow()

        writeFileSync(join(identityFixture.repoRoot, "src", "one.ts"), "identity staged\n")
        runGit(identityFixture.repoRoot, ["add", "--", "src/one.ts"])
        runGit(identityFixture.repoRoot, ["config", "user.name", ""])
        runGit(identityFixture.repoRoot, ["config", "user.email", ""])
        expect(await identityFixture.service.commitConversationChanges({
          conversationId: "conversation-changes-mutation",
          message: "identity must fail"
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_COMMIT_IDENTITY_INVALID", domain: "git" }
        })
        expect(runGit(identityFixture.repoRoot, ["diff", "--cached", "--name-only", "--"])).toBe("src/one.ts\n")

        writeFileSync(join(hookFixture.repoRoot, "src", "one.ts"), "hook staged\n")
        runGit(hookFixture.repoRoot, ["add", "--", "src/one.ts"])
        const hookPath = join(hookFixture.repoRoot, ".git", "hooks", "pre-commit")
        writeFileSync(hookPath, "#!/bin/sh\necho TeamCow rejecting hook >&2\nexit 1\n")
        chmodSync(hookPath, 0o755)
        const hookResult = await hookFixture.service.commitConversationChanges({
          conversationId: "conversation-changes-mutation",
          message: "hook must fail"
        })
        expect(hookResult).toMatchObject({
          status: "error",
          error: { code: "GIT_COMMIT_REJECTED", domain: "git" }
        })
        expect(JSON.stringify(hookResult)).toContain("TeamCow rejecting hook")
        expect(runGit(hookFixture.repoRoot, ["diff", "--cached", "--name-only", "--"])).toBe("src/one.ts\n")

        writeFileSync(join(invalidMessageFixture.repoRoot, "src", "one.ts"), "invalid message staged\n")
        runGit(invalidMessageFixture.repoRoot, ["add", "--", "src/one.ts"])
        expect(await invalidMessageFixture.service.commitConversationChanges({
          conversationId: "conversation-changes-mutation",
          message: "invalid\0message"
        })).toMatchObject({
          status: "error",
          error: { code: "GIT_COMMIT_FAILED", domain: "git" }
        })
        expect(runGit(invalidMessageFixture.repoRoot, ["diff", "--cached", "--name-only", "--"])).toBe("src/one.ts\n")

        writeFileSync(join(noSummaryFixture.repoRoot, "src", "one.ts"), "no summary staged\n")
        runGit(noSummaryFixture.repoRoot, ["add", "--", "src/one.ts"])
        expect(await noSummaryFixture.service.commitConversationChanges({
          conversationId: "conversation-changes-mutation",
          message: "commit without summary"
        })).toMatchObject({
          status: "committed"
        })
        expect(runGit(noSummaryFixture.repoRoot, ["log", "-1", "--format=%s"])).toBe("commit without summary\n")
      } finally {
        for (const fixture of [emptyFixture, identityFixture, hookFixture, invalidMessageFixture, noSummaryFixture]) {
          fixture.service.close()
          rmSync(fixture.userDataPath, { recursive: true, force: true })
          rmSync(fixture.repoRoot, { recursive: true, force: true })
        }
      }
    })
  })

  it("reads git status from the conversation-bound worktree", async () => {
    const userDataPath = createTempDir("teamcow-git-status-")
    const repoRoot = createTempDir("teamcow-git-status-repo-")
    makeGitRepo(repoRoot)

    const readGitStatus = vi.fn(() => ({
      status: "ok" as const,
      stdout: [
        "## feat/git-panel",
        " M apps/desktop/src/main/project-service.ts",
        "A  packages/shared-types/src/index.ts",
        "?? docs/git-panel.md"
      ].join("\n"),
      stderr: ""
    }))

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus,
      now: () => "2026-05-28T08:17:33.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-git-status",
      projectId: imported.project.id,
      title: "Git panel",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "completed",
      createdAt: "2026-05-28T08:00:00.000Z",
      updatedAt: "2026-05-28T08:10:00.000Z"
    })

    const result = await service.getConversationGitStatus("conversation-git-status")

    expect(readGitStatus).toHaveBeenCalledWith(realpathSync(repoRoot))
    expect(result).toMatchObject({
      status: "ok",
      git: {
        conversationId: "conversation-git-status",
        worktreeId: imported.project.defaultWorktree.id,
        worktreeRootPath: realpathSync(repoRoot),
        worktreeKind: "default",
        branch: {
          changedCount: 3,
          current: "feat/git-panel",
          recorded: "main",
          upstream: null,
          isClean: false
        },
        checkedAt: "2026-05-28T08:17:33.000Z"
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("reads repository, identity, upstream, and all-repository commits for the Git overview", async () => {
    const userDataPath = createTempDir("teamcow-git-overview-")
    const repoRoot = createTempDir("teamcow-git-overview-repo-")
    makeGitRepo(repoRoot)

    const readGitStatus = vi.fn(() => ({
      status: "ok" as const,
      stdout: [
        "## feature/git-panel...origin/main",
        " M apps/desktop/src/main/project-service.ts",
        "?? docs/git-panel.md"
      ].join("\n"),
      stderr: ""
    }))

    const readGitCommand = vi.fn((worktreeRootPath: string, args: string[]) => {
      expect(worktreeRootPath).toBe(realpathSync(repoRoot))
      const key = args.join("\0")

      if (key === "remote\0-v") {
        return {
          status: "ok" as const,
          stdout: [
            "origin\tgit@github.com:teamcow/teamcow.git (fetch)",
            "origin\tgit@github.com:teamcow/teamcow.git (push)",
            "backup\tgit@example.com:teamcow/teamcow.git (fetch)"
          ].join("\n"),
          stderr: ""
        }
      }

      if (key === "rev-parse\0--abbrev-ref\0--symbolic-full-name\0@{u}") {
        return {
          status: "ok" as const,
          stdout: "origin/main\n",
          stderr: ""
        }
      }

      if (key === "config\0--local\0user.name") {
        return { status: "ok" as const, stdout: "Team Cow\n", stderr: "" }
      }

      if (key === "config\0--local\0user.email") {
        return { status: "ok" as const, stdout: "dev@teamcow.local\n", stderr: "" }
      }

      if (args[0] === "log" && args.includes("--all")) {
        return {
          status: "ok" as const,
          stdout: [
            "2508d1f012345678901234567890123456789abc\u001f2508d1f\u001ffix: remove inspector execution targets\u001fTeam Cow\u001f2026-07-08T08:17:33+08:00\u001f2 hours ago\u001e",
            "6e1123a012345678901234567890123456789abc\u001f6e1123a\u001ffix: avoid redundant mermaid renders\u001fTeam Cow\u001f2026-07-08T07:17:33+08:00\u001f3 hours ago\u001e"
          ].join(""),
          stderr: ""
        }
      }

      return {
        status: "error" as const,
        error: {
          code: "GIT_STATUS_FAILED" as const,
          message: `unexpected git command: ${args.join(" ")}`,
          suggestion: null
        }
      }
    })

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus,
      readGitCommand,
      now: () => "2026-07-08T08:30:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-git-overview",
      projectId: imported.project.id,
      title: "Git overview",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "completed",
      createdAt: "2026-07-08T08:00:00.000Z",
      updatedAt: "2026-07-08T08:10:00.000Z"
    })

    const result = await service.getConversationGitStatus({
      conversationId: "conversation-git-overview",
      commitScope: "allRepository"
    })

    expect(result).toMatchObject({
      status: "ok",
      git: {
        repository: {
          selectedRemoteName: "origin",
          selectedRemoteUrl: "git@github.com:teamcow/teamcow.git",
          upstreamRemoteName: "origin",
          upstreamBranchName: "main"
        },
        identity: {
          name: "Team Cow",
          email: "dev@teamcow.local",
          source: "local"
        },
        branch: {
          current: "feature/git-panel",
          recorded: "main",
          upstream: "origin/main",
          isClean: false,
          changedCount: 2
        },
        commits: {
          status: "ok",
          scope: "allRepository",
          hasMore: false
        }
      }
    })

    if (result.status !== "ok") {
      throw new Error("expected git overview")
    }
    expect(result.git.repository.remotes).toEqual([
      {
        name: "origin",
        url: "git@github.com:teamcow/teamcow.git",
        isUpstreamDefault: true
      },
      {
        name: "backup",
        url: "git@example.com:teamcow/teamcow.git",
        isUpstreamDefault: false
      }
    ])
    expect(result.git.commits.items.map((commit) => [commit.shortHash, commit.subject])).toEqual([
      ["2508d1f", "fix: remove inspector execution targets"],
      ["6e1123a", "fix: avoid redundant mermaid renders"]
    ])
    expect(result.git).not.toHaveProperty("files")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("matches upstream remotes that include slashes in the configured remote name", async () => {
    const userDataPath = createTempDir("teamcow-git-slashed-remote-")
    const repoRoot = createTempDir("teamcow-git-slashed-remote-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus: vi.fn(() => ({
        status: "ok" as const,
        stdout: "## feature/slashed-remote...team/origin/main\n",
        stderr: ""
      })),
      readGitCommand: vi.fn((_worktreeRootPath: string, args: string[]) => {
        const key = args.join("\0")

        if (key === "remote\0-v") {
          return {
            status: "ok" as const,
            stdout: [
              "team/origin\tgit@github.com:teamcow/teamcow.git (fetch)",
              "team/origin\tgit@github.com:teamcow/teamcow.git (push)",
              "origin\tgit@example.com:teamcow/fallback.git (fetch)"
            ].join("\n"),
            stderr: ""
          }
        }

        if (key === "rev-parse\0--abbrev-ref\0--symbolic-full-name\0@{u}") {
          return {
            status: "ok" as const,
            stdout: "team/origin/main\n",
            stderr: ""
          }
        }

        if (key.startsWith("config\0")) {
          return {
            status: "error" as const,
            error: {
              code: "GIT_STATUS_FAILED" as const,
              message: "config missing",
              suggestion: null
            }
          }
        }

        if (args[0] === "log") {
          return { status: "ok" as const, stdout: "", stderr: "" }
        }

        return {
          status: "error" as const,
          error: {
            code: "GIT_STATUS_FAILED" as const,
            message: `unexpected git command: ${args.join(" ")}`,
            suggestion: null
          }
        }
      })
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-git-slashed-remote",
      projectId: imported.project.id,
      title: "Git slashed remote",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-07-08T08:00:00.000Z",
      updatedAt: "2026-07-08T08:10:00.000Z"
    })

    const result = await service.getConversationGitStatus("conversation-git-slashed-remote")

    expect(result).toMatchObject({
      status: "ok",
      git: {
        repository: {
          upstreamRemoteName: "team/origin",
          upstreamBranchName: "main",
          selectedRemoteName: "team/origin",
          selectedRemoteUrl: "git@github.com:teamcow/teamcow.git"
        },
        branch: {
          upstream: "team/origin/main"
        }
      }
    })

    if (result.status !== "ok") {
      throw new Error("expected git overview")
    }
    expect(result.git.repository.remotes).toEqual([
      {
        name: "team/origin",
        url: "git@github.com:teamcow/teamcow.git",
        isUpstreamDefault: true
      },
      {
        name: "origin",
        url: "git@example.com:teamcow/fallback.git",
        isUpstreamDefault: false
      }
    ])

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("falls back to origin, then first remote, when no upstream remote exists", async () => {
    const userDataPath = createTempDir("teamcow-git-remote-fallback-")
    const repoRoot = createTempDir("teamcow-git-remote-fallback-repo-")
    makeGitRepo(repoRoot)

    const readGitStatus = vi.fn(() => ({
      status: "ok" as const,
      stdout: "## main\n",
      stderr: ""
    }))
    const readGitCommand = vi.fn((_root: string, args: string[]) => {
      const key = args.join("\0")
      if (key === "remote\0-v") {
        return {
          status: "ok" as const,
          stdout: [
            "backup\tgit@example.com:teamcow/teamcow.git (fetch)",
            "origin\tgit@github.com:teamcow/teamcow.git (fetch)"
          ].join("\n"),
          stderr: ""
        }
      }
      if (key === "rev-parse\0--abbrev-ref\0--symbolic-full-name\0@{u}") {
        return {
          status: "error" as const,
          error: {
            code: "GIT_STATUS_FAILED" as const,
            message: "no upstream",
            suggestion: null
          }
        }
      }
      if (key.startsWith("config\0")) {
        return {
          status: "error" as const,
          error: {
            code: "GIT_STATUS_FAILED" as const,
            message: "config missing",
            suggestion: null
          }
        }
      }
      if (args[0] === "log" && args.includes("--all")) {
        return { status: "ok" as const, stdout: "", stderr: "" }
      }
      return {
        status: "error" as const,
        error: {
          code: "GIT_STATUS_FAILED" as const,
          message: `unexpected git command: ${args.join(" ")}`,
          suggestion: null
        }
      }
    })

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus,
      readGitCommand
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-git-remote-fallback",
      projectId: imported.project.id,
      title: "Git remote fallback",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-07-08T08:00:00.000Z",
      updatedAt: "2026-07-08T08:10:00.000Z"
    })

    const result = await service.getConversationGitStatus("conversation-git-remote-fallback")
    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      throw new Error("expected git overview")
    }
    expect(result.git.repository.selectedRemoteName).toBe("origin")
    expect(result.git.identity.source).toBe("unset")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("uses HEAD for the default current-branch commit scope", async () => {
    const userDataPath = createTempDir("teamcow-git-current-branch-")
    const repoRoot = createTempDir("teamcow-git-current-branch-repo-")
    makeGitRepo(repoRoot)

    const readGitCommand = vi.fn((_root: string, args: string[]) => ({
      status: "ok" as const,
      stdout: args[0] === "log" ? "" : "",
      stderr: ""
    }))

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus: vi.fn(() => ({ status: "ok" as const, stdout: "## main\n", stderr: "" })),
      readGitCommand
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-git-current-branch",
      projectId: imported.project.id,
      title: "Git current branch",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-07-08T08:00:00.000Z",
      updatedAt: "2026-07-08T08:10:00.000Z"
    })

    await service.getConversationGitStatus("conversation-git-current-branch")

    expect(readGitCommand).toHaveBeenCalledWith(realpathSync(repoRoot), [
      "log",
      "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1f%ar%x1e",
      "-n",
      "31",
      "HEAD"
    ], { cacheTtlMs: 500 })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("marks commit history unavailable when git log fails", async () => {
    const userDataPath = createTempDir("teamcow-git-log-failure-")
    const repoRoot = createTempDir("teamcow-git-log-failure-repo-")
    makeGitRepo(repoRoot)

    const readGitCommand = vi.fn((_root: string, args: string[]) => {
      if (args[0] === "log") {
        return {
          status: "error" as const,
          error: {
            code: "GIT_STATUS_FAILED" as const,
            message: "git log failed",
            suggestion: "fatal: your current branch does not have any commits yet"
          }
        }
      }

      return { status: "ok" as const, stdout: "", stderr: "" }
    })

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus: vi.fn(() => ({ status: "ok" as const, stdout: "## main\n", stderr: "" })),
      readGitCommand
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-git-log-failure",
      projectId: imported.project.id,
      title: "Git log failure",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-07-08T08:00:00.000Z",
      updatedAt: "2026-07-08T08:10:00.000Z"
    })

    const result = await service.getConversationGitStatus("conversation-git-log-failure")
    expect(result).toMatchObject({
      status: "ok",
      git: {
        commits: {
          status: "unavailable",
          scope: "currentBranch",
          items: [],
          hasMore: false
        }
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("marks unmerged AA and DD git status rows as conflicted", async () => {
    const userDataPath = createTempDir("teamcow-git-status-conflict-")
    const repoRoot = createTempDir("teamcow-git-status-conflict-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus: vi.fn(() => ({
        status: "ok" as const,
        stdout: [
          "## feat/conflict",
          "AA packages/shared-types/src/conflict.ts",
          "DD apps/desktop/src/main/deleted-conflict.ts"
        ].join("\n"),
        stderr: ""
      }))
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-conflict-git-status",
      projectId: imported.project.id,
      title: "Conflict git panel",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-05-28T08:00:00.000Z",
      updatedAt: "2026-05-28T08:10:00.000Z"
    })

    const result = await service.getConversationGitStatus("conversation-conflict-git-status")

    expect(result).toMatchObject({
      status: "ok",
      git: {
        branch: {
          current: "feat/conflict",
          changedCount: 2,
          isClean: false
        }
      }
    })
    expect(result).not.toHaveProperty("git.files")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("preserves porcelain paths unless the status row is a rename or copy", async () => {
    const userDataPath = createTempDir("teamcow-git-status-paths-")
    const repoRoot = createTempDir("teamcow-git-status-paths-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus: vi.fn(() => ({
        status: "ok" as const,
        stdout: [
          "## feat/path-parsing",
          " M docs/name -> not-renamed.md",
          " M  leading-space.md",
          "R  docs/old-name.md -> docs/new-name.md"
        ].join("\n"),
        stderr: ""
      }))
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-path-git-status",
      projectId: imported.project.id,
      title: "Path git panel",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-05-28T08:00:00.000Z",
      updatedAt: "2026-05-28T08:10:00.000Z"
    })

    const result = await service.getConversationGitStatus("conversation-path-git-status")

    expect(result).toMatchObject({
      status: "ok",
      git: {
        branch: {
          current: "feat/path-parsing",
          changedCount: 3,
          isClean: false
        }
      }
    })
    expect(result).not.toHaveProperty("git.files")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("preserves NUL-delimited porcelain paths with arrows, quotes, tabs, newlines, and trailing spaces", async () => {
    const userDataPath = createTempDir("teamcow-git-status-z-paths-")
    const repoRoot = createTempDir("teamcow-git-status-z-paths-repo-")
    makeGitRepo(repoRoot)

    const sourcePath = "docs/source -> path.md"
    const renamedTarget = "docs/target -> path.md"
    const quotedPath = "docs/quote\"file.md"
    const tabPath = "docs/tab\tfile.md"
    const newlinePath = "docs/new\nline.md"
    const trailingSpacePath = "docs/trailing-space .md "

    const readGitStatus = vi.fn(() => ({
      status: "ok" as const,
      stdout: [
        "## feat/z-paths",
        `R  ${renamedTarget}`,
        sourcePath,
        ` M ${quotedPath}`,
        ` M ${tabPath}`,
        ` M ${newlinePath}`,
        ` M ${trailingSpacePath}`,
        ""
      ].join("\0"),
      stderr: ""
    }))

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-z-path-git-status",
      projectId: imported.project.id,
      title: "Z path git panel",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-05-28T08:00:00.000Z",
      updatedAt: "2026-05-28T08:10:00.000Z"
    })

    const result = await service.getConversationGitStatus("conversation-z-path-git-status")

    expect(readGitStatus).toHaveBeenCalledWith(realpathSync(repoRoot))
    expect(result).toMatchObject({
      status: "ok",
      git: {
        branch: {
          current: "feat/z-paths",
          changedCount: 5,
          isClean: false
        }
      }
    })
    expect(result).not.toHaveProperty("git.files")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("returns a structured git status error when porcelain output is invalid", async () => {
    const userDataPath = createTempDir("teamcow-git-status-invalid-")
    const repoRoot = createTempDir("teamcow-git-status-invalid-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus: vi.fn(() => ({
        status: "ok" as const,
        stdout: [
          "## feat/invalid-output",
          "this is not porcelain output"
        ].join("\n"),
        stderr: ""
      }))
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-invalid-git-status",
      projectId: imported.project.id,
      title: "Invalid git panel",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-05-28T08:00:00.000Z",
      updatedAt: "2026-05-28T08:10:00.000Z"
    })

    const result = await service.getConversationGitStatus("conversation-invalid-git-status")

    expect(result).toMatchObject({
      status: "error",
      error: {
        code: "GIT_STATUS_PARSE_FAILED"
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("reports a clean git status for the conversation-bound worktree", async () => {
    const userDataPath = createTempDir("teamcow-git-status-clean-")
    const repoRoot = createTempDir("teamcow-git-status-clean-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus: vi.fn(() => ({
        status: "ok" as const,
        stdout: "## main\n",
        stderr: ""
      }))
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-clean-git-status",
      projectId: imported.project.id,
      title: "Clean git panel",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-05-28T08:00:00.000Z",
      updatedAt: "2026-05-28T08:10:00.000Z"
    })

    const result = await service.getConversationGitStatus("conversation-clean-git-status")

    expect(result).toMatchObject({
      status: "ok",
      git: {
        branch: {
          current: "main",
          recorded: "main",
          upstream: null,
          changedCount: 0,
          isClean: true
        }
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("returns a structured git status error when the bound worktree path is missing", async () => {
    const userDataPath = createTempDir("teamcow-git-status-missing-worktree-")
    const repoRoot = createTempDir("teamcow-git-status-missing-worktree-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const worktreeRootPath = imported.project.defaultWorktree.rootPath

    seedConversation(userDataPath, {
      id: "conversation-missing-worktree-git-status",
      projectId: imported.project.id,
      title: "Missing worktree",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-05-28T08:00:00.000Z",
      updatedAt: "2026-05-28T08:10:00.000Z"
    })
    rmSync(repoRoot, { recursive: true, force: true })

    const result = await service.getConversationGitStatus("conversation-missing-worktree-git-status")

    expect(result).toEqual({
      status: "error",
      error: {
        code: "WORKTREE_NOT_FOUND",
        message: `Worktree path was not found: ${worktreeRootPath}`,
        suggestion: null
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
  })

  it("returns a structured git status error when git status fails", async () => {
    const userDataPath = createTempDir("teamcow-git-status-command-failure-")
    const repoRoot = createTempDir("teamcow-git-status-command-failure-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      readGitStatus: vi.fn(() => ({
        status: "error" as const,
        error: {
          code: "GIT_STATUS_FAILED" as const,
          message: "git status failed for /tmp/teamcow",
          suggestion: "fatal: not a git repository"
        }
      }))
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-failed-git-status",
      projectId: imported.project.id,
      title: "Failed git status",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      runStatus: "idle",
      createdAt: "2026-05-28T08:00:00.000Z",
      updatedAt: "2026-05-28T08:10:00.000Z"
    })

    const result = await service.getConversationGitStatus("conversation-failed-git-status")

    expect(result).toEqual({
      status: "error",
      error: {
        code: "GIT_STATUS_FAILED" as const,
        message: "git status failed for /tmp/teamcow",
        suggestion: "fatal: not a git repository"
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("returns a structured git status error when the conversation is missing", async () => {
    const userDataPath = createTempDir("teamcow-git-status-missing-conversation-")

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const result = await service.getConversationGitStatus("missing-conversation")

    expect(result).toEqual({
      status: "error",
      error: {
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation id was not found: missing-conversation",
        suggestion: null
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
  })

  it("rejects creating a conversation for a provider that is not ready", async () => {
    const userDataPath = createTempDir("teamcow-provider-not-ready-")
    const repoRoot = createTempDir("teamcow-provider-not-ready-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      getProviderReadinessSnapshot: () => ({
        checkedAt: "2026-05-16T11:00:00.000Z",
        providers: [
          {
            kind: "codex",
            availability: "unavailable",
            badge: {
              kind: "codex",
              label: "codex",
              status: "unavailable"
            },
            issues: []
          }
        ]
      }),
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: {
        type: "default"
      }
    })

    expect(created.status).toBe("error")
    if (created.status !== "error") {
      throw new Error("expected error result")
    }

    expect(created.error.code).toBe("PROVIDER_NOT_READY")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("persists a sent user message with its run and initial event in a single conversation timeline", async () => {
    const userDataPath = createTempDir("teamcow-message-run-")
    const repoRoot = createTempDir("teamcow-message-run-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-05-19T02:40:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: {
        type: "default"
      }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Build the persistence model"
    })

    expect(sent.status).toBe("accepted")
    if (sent.status !== "accepted") {
      throw new Error("expected accepted message")
    }

    expect(sent.conversation.runStatus).toBe("unavailable")
    expect(sent.context.shell.runStatus).toBe("unavailable")
    expect(sent.timeline.messages).toHaveLength(1)
    expect(sent.timeline.runs).toHaveLength(1)
    expect(sent.timeline.events).toHaveLength(1)
    expect(sent.timeline.messages[0]).toMatchObject({
      conversationId: created.conversation.id,
      role: "user",
      content: "Build the persistence model",
      model: "gpt-5.5",
      runId: sent.timeline.runs[0].id
    })
    expect(sent.timeline.runs[0]).toMatchObject({
      conversationId: created.conversation.id,
      provider: "codex",
      model: "gpt-5.5",
      worktreeId: imported.project.defaultWorktree.id,
      status: "unavailable"
    })
    expect(sent.timeline.events[0]).toMatchObject({
      conversationId: created.conversation.id,
      runId: sent.timeline.runs[0].id,
      sequence: 1,
      type: "system.status" as const,
      payload: {
        status: "unavailable",
        reason: "provider-runtime-not-connected"
      }
    })

    const reloadedTimeline = service.getConversationTimeline(created.conversation.id)
    expect(reloadedTimeline.status).toBe("ok")
    if (reloadedTimeline.status !== "ok") {
      throw new Error("expected timeline")
    }
    expect(reloadedTimeline.timeline).toEqual(sent.timeline)

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("persists attachment-only messages and forwards safe local attachment paths to the provider", async () => {
    const userDataPath = createTempDir("teamcow-message-attachment-")
    const repoRoot = createTempDir("teamcow-message-attachment-repo-")
    makeGitRepo(repoRoot)
    const runProviderCalls: ProviderRunInput[] = []
    const imageContent = Buffer.from([0x89, 0x50, 0x4e, 0x47])

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      runProvider: async (input): Promise<ProviderRunResult> => {
        runProviderCalls.push(input)
        return { status: "completed", events: [] }
      },
      now: () => "2026-08-20T02:40:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "",
      attachments: [{
        name: "clipboard.png",
        mimeType: "image/png",
        sizeBytes: imageContent.byteLength,
        dataBase64: imageContent.toString("base64")
      }]
    })
    if (sent.status !== "accepted") {
      throw new Error("expected accepted message")
    }

    expect(sent.conversation.title).toBe("clipboard.png")
    expect(sent.timeline.messages[0]).toMatchObject({
      content: "",
      attachments: [{ kind: "image", name: "clipboard.png", mimeType: "image/png", sizeBytes: 4 }]
    })
    const summary = sent.timeline.messages[0].attachments?.[0]
    expect(summary?.uri).toMatch(/^teamcow-attachment:\/\/conversation\//)
    const resolved = summary ? service.resolveConversationAttachment(summary.uri) : null
    expect(resolved).not.toBeNull()
    expect(resolved && readFileSync(resolved.path)).toEqual(imageContent)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runProviderCalls[0]).toMatchObject({
      prompt: "Review the attached file or image.",
      attachments: [{ kind: "image", name: "clipboard.png", mimeType: "image/png", sizeBytes: 4 }]
    })
    expect(runProviderCalls[0].attachments?.[0].path).toBe(resolved?.path)

    await waitForConversationRunStatus(service, created.conversation.id, "completed")
    const deleted = await service.deleteConversation({ conversationId: created.conversation.id })
    expect(deleted.status).toBe("deleted")
    expect(resolved && existsSync(resolved.path)).toBe(false)
    expect(summary && service.resolveConversationAttachment(summary.uri)).toBeNull()

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("parses provider-specific slash commands before dispatching typed run options", async () => {
    const userDataPath = createTempDir("teamcow-provider-slash-")
    const repoRoot = createTempDir("teamcow-provider-slash-repo-")
    makeGitRepo(repoRoot)
    const runProviderCalls: ProviderRunInput[] = []

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      runProvider: async (input): Promise<ProviderRunResult> => {
        runProviderCalls.push(input)
        return { status: "completed", events: [] }
      },
      now: () => "2026-08-25T04:30:00.000Z"
    })

    try {
      const imported = await service.importProject({ directoryPath: repoRoot })
      if (imported.status !== "imported") {
        throw new Error("expected imported project")
      }

      const cases = [
        {
          providerKind: "codex" as const,
          model: "gpt-5.5",
          content: "/reasoning high Refactor the auth flow",
          expected: { prompt: "Refactor the auth flow", options: { reasoningEffort: "high" } }
        },
        {
          providerKind: "claude" as const,
          model: "default",
          content: "/budget 2.5 Audit dependencies",
          expected: { prompt: "Audit dependencies", options: { maxBudgetUsd: 2.5 } }
        },
        {
          providerKind: "opencode" as const,
          model: "anthropic/claude-sonnet-4-6",
          content: "/agent reviewer Review the patch",
          expected: { prompt: "Review the patch", options: { agent: "reviewer" } }
        },
        {
          providerKind: "cursor" as const,
          model: "auto",
          content: "/ask Explain this code",
          expected: { prompt: "Explain this code", options: { mode: "ask" } }
        }
      ]

      for (const testCase of cases) {
        const created = await service.createConversation({
          projectId: imported.project.id,
          providerKind: testCase.providerKind,
          model: testCase.model,
          executionTarget: { type: "default" }
        })
        if (created.status !== "created") {
          throw new Error(`expected ${testCase.providerKind} conversation`)
        }
        const sent = await service.sendConversationMessage({
          conversationId: created.conversation.id,
          content: testCase.content
        })
        expect(sent.status).toBe("accepted")
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(runProviderCalls.at(-1)).toMatchObject({
          provider: testCase.providerKind,
          ...testCase.expected
        })
      }

      const codexConversation = await service.createConversation({
        projectId: imported.project.id,
        providerKind: "codex",
        model: "gpt-5.5",
        executionTarget: { type: "default" }
      })
      if (codexConversation.status !== "created") {
        throw new Error("expected codex conversation")
      }
      const callCount = runProviderCalls.length
      const rejected = await service.sendConversationMessage({
        conversationId: codexConversation.conversation.id,
        content: "/effort high Fix the issue"
      })
      expect(rejected).toMatchObject({ status: "error" })
      expect(runProviderCalls).toHaveLength(callCount)
    } finally {
      service.close()
      rmSync(userDataPath, { recursive: true, force: true })
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it("starts a Codex provider run in the conversation worktree and persists normalized output events", async () => {
    const userDataPath = createTempDir("teamcow-codex-run-")
    const repoRoot = createTempDir("teamcow-codex-run-repo-")
    makeGitRepo(repoRoot)
    const runProviderCalls: ProviderRunInput[] = []
    const log = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    }

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      runProvider: async (input): Promise<ProviderRunResult> => {
        runProviderCalls.push(input)
        return {
          status: "completed",
          events: [
            {
              type: "run.started",
              status: "running",
              payload: {
                provider: input.provider,
                conversationId: input.conversationId,
                runId: input.runId,
                worktreeRootPath: input.worktreeRootPath,
                rawType: "thread.started"
              }
            },
            {
              type: "run.progress",
              payload: {
                rawType: "turn.started"
              }
            },
            {
              type: "run.message.delta",
              payload: {
                text: "Created the first patch",
                rawType: "agent_message_delta"
              }
            },
            {
              type: "run.status",
              payload: {
                status: "running"
              }
            },
            {
              type: "run.completed",
              status: "completed",
              payload: {
                rawType: "turn.completed"
              }
            }
          ]
        }
      },
      log,
      now: () => "2026-05-19T03:10:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Implement the first Codex task"
    })

    expect(sent.status).toBe("accepted")
    if (sent.status !== "accepted") {
      throw new Error("expected accepted message")
    }

    expect(runProviderCalls).toHaveLength(0)
    expect(sent.conversation.runStatus).toBe("running")
    expect(sent.context.shell.runStatus).toBe("running")
    expect(sent.timeline.runs[0].status).toBe("running")
    expect(sent.timeline.runs[0].completedAt).toBeNull()
    expect(sent.timeline.events.map((event) => event.type)).toEqual(["system.status"])

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runProviderCalls).toHaveLength(1)
    expect(runProviderCalls[0]).toMatchObject({
      provider: "codex",
      model: "gpt-5.5",
      accessMode: "worktree-write",
      prompt: "Implement the first Codex task",
      worktreeRootPath: realpathSync(repoRoot),
      worktreeId: imported.project.defaultWorktree.id,
      conversationId: created.conversation.id,
      runId: sent.timeline.runs[0].id
    })

    const completedTimeline = service.getConversationTimeline(created.conversation.id)
    expect(completedTimeline.status).toBe("ok")
    if (completedTimeline.status !== "ok") {
      throw new Error("expected completed timeline")
    }

    expect(completedTimeline.timeline.runs[0].status).toBe("completed")
    expect(completedTimeline.timeline.runs[0].completedAt).toBe("2026-05-19T03:10:00.000Z")
    expect(log.info).toHaveBeenCalledWith("provider", "provider.run.started", expect.objectContaining({
      providerKind: "codex",
      accessMode: "worktree-write",
      conversationId: created.conversation.id,
      worktreeId: imported.project.defaultWorktree.id,
      worktreeRootPath: realpathSync(repoRoot),
      runId: sent.timeline.runs[0].id
    }))
    expect(log.info).toHaveBeenCalledWith("provider", "provider.run.completed", expect.objectContaining({
      providerKind: "codex",
      accessMode: "worktree-write",
      conversationId: created.conversation.id,
      worktreeId: imported.project.defaultWorktree.id,
      runId: sent.timeline.runs[0].id
    }))
    expect(completedTimeline.timeline.events.map((event) => event.type)).toEqual([
      "system.status",
      "run.started",
      "run.progress",
      "run.message.delta",
      "run.status",
      "run.completed"
    ])
    expect(completedTimeline.timeline.events.at(-1)).toMatchObject({
      sequence: 6,
      type: "run.completed",
      payload: {
        rawType: "turn.completed"
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("persists the selected provider access mode and forwards it into provider runs", async () => {
    const userDataPath = createTempDir("teamcow-access-mode-")
    const repoRoot = createTempDir("teamcow-access-mode-repo-")
    makeGitRepo(repoRoot)
    const runProviderCalls: ProviderRunInput[] = []

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      runProvider: async (input): Promise<ProviderRunResult> => {
        runProviderCalls.push(input)
        return {
          status: "completed",
          events: []
        }
      },
      now: () => "2026-05-19T04:10:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      accessMode: "full-access",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    expect(created.conversation.accessMode).toBe("full-access")

    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Use the trusted local workflow"
    })
    expect(sent.status).toBe("accepted")

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runProviderCalls).toHaveLength(1)
    expect(runProviderCalls[0]).toMatchObject({
      provider: "codex",
      model: "gpt-5.5",
      accessMode: "full-access",
      prompt: "Use the trusted local workflow",
      worktreeRootPath: realpathSync(repoRoot)
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("retries a provider run with one-shot allowed tools without duplicating the user message", async () => {
    const userDataPath = createTempDir("teamcow-permission-retry-")
    const repoRoot = createTempDir("teamcow-permission-retry-repo-")
    makeGitRepo(repoRoot)
    const runProviderCalls: ProviderRunInput[] = []

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      runProvider: async (input): Promise<ProviderRunResult> => {
        runProviderCalls.push(input)
        return {
          status: "completed",
          events: []
        }
      },
      now: () => "2026-05-19T04:20:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "claude",
      model: "claude-sonnet-5",
      accessMode: "worktree-write",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Read the Huawei developer page"
    })
    expect(sent.status).toBe("accepted")

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runProviderCalls).toHaveLength(1)

    const retry = await service.retryConversationRunWithPermissions({
      conversationId: created.conversation.id,
      runId: runProviderCalls[0].runId,
      allowedTools: ["mcp__web-reader__webReader"]
    })
    expect(retry.status).toBe("accepted")

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runProviderCalls).toHaveLength(2)
    expect(runProviderCalls[1]).toMatchObject({
      provider: "claude",
      prompt: "Read the Huawei developer page",
      allowedTools: ["mcp__web-reader__webReader"],
      worktreeRootPath: realpathSync(repoRoot)
    })
    expect(runProviderCalls[1].runId).not.toBe(runProviderCalls[0].runId)

    const timeline = service.getConversationTimeline(created.conversation.id)
    if (timeline.status !== "ok") {
      throw new Error("expected timeline")
    }
    expect(timeline.timeline.messages.filter((message) => message.role === "user")).toHaveLength(1)
    expect(timeline.timeline.runs).toHaveLength(2)

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("stops a Claude run when permission-gated tool use appears so it can wait for user authorization", async () => {
    const userDataPath = createTempDir("teamcow-permission-wait-")
    const repoRoot = createTempDir("teamcow-permission-wait-repo-")
    makeGitRepo(repoRoot)
    let cancelRequested = false
    const cancelProviderRun = vi.fn(() => {
      cancelRequested = true
      return true
    })

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      cancelProviderRun,
      runProvider: async (input): Promise<ProviderRunResult> => {
        await input.onEvent?.({
          type: "run.progress",
          payload: {
            provider: "claude",
            conversationId: input.conversationId,
            runId: input.runId,
            worktreeId: input.worktreeId,
            worktreeRootPath: input.worktreeRootPath,
            rawType: "assistant",
            contentType: "tool_use",
            toolUse: {
              id: "tooluse_web_reader",
              name: "mcp__web-reader__webReader",
              input: {
                url: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742",
                retain_images: false
              }
            }
          }
        })

        if (!cancelRequested) {
          await input.onEvent?.({
            type: "run.progress",
            payload: {
              provider: "claude",
              conversationId: input.conversationId,
              runId: input.runId,
              worktreeId: input.worktreeId,
              worktreeRootPath: input.worktreeRootPath,
              rawType: "user",
              contentType: "tool_result",
              toolResult: {
                toolUseId: "tooluse_web_reader",
                isError: true,
                content: "Claude requested permissions to use mcp__web-reader__webReader, but you haven't granted it yet."
              }
            }
          })
        }

        if (!cancelRequested) {
          await input.onEvent?.({
            type: "run.message.delta",
            payload: {
              provider: "claude",
              conversationId: input.conversationId,
              runId: input.runId,
              worktreeId: input.worktreeId,
              worktreeRootPath: input.worktreeRootPath,
              rawType: "assistant",
              text: "I kept going without waiting for authorization."
            }
          })
        }

        return {
          status: cancelRequested ? "failed" : "completed",
          events: []
        }
      },
      now: () => "2026-05-19T04:30:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "claude",
      model: "claude-sonnet-5",
      accessMode: "worktree-write",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Read the Huawei developer page"
    })
    expect(sent.status).toBe("accepted")

    const timeline = await waitForConversationRunStatus(service, created.conversation.id, "unavailable")
    expect(cancelProviderRun).toHaveBeenCalledWith(created.conversation.id)
    expect(timeline.timeline.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "run.progress",
        payload: expect.objectContaining({
          contentType: "tool_use",
          toolUse: expect.objectContaining({
            name: "mcp__web-reader__webReader"
          })
        })
      })
    ]))
    expect(timeline.timeline.events.some((event) =>
      event.type === "run.progress" && event.payload.contentType === "tool_result"
    )).toBe(false)
    expect(timeline.timeline.events.some((event) =>
      event.type === "run.message.delta" &&
      event.payload.text === "I kept going without waiting for authorization."
    )).toBe(false)
    expect(timeline.timeline.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "run.status",
        payload: {
          status: "unavailable",
          reason: "provider-permission-required"
        }
      })
    ]))

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("does not pause a Claude permission retry when the model switches from the allowed MCP reader to WebFetch", async () => {
    const userDataPath = createTempDir("teamcow-permission-alias-")
    const repoRoot = createTempDir("teamcow-permission-alias-repo-")
    makeGitRepo(repoRoot)
    const runProviderCalls: ProviderRunInput[] = []
    const cancelProviderRun = vi.fn(() => true)
    let nowTick = 0

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      cancelProviderRun,
      runProvider: async (input): Promise<ProviderRunResult> => {
        runProviderCalls.push(input)
        const isRetry = runProviderCalls.length > 1

        await input.onEvent?.({
          type: "run.progress",
          payload: {
            provider: "claude",
            conversationId: input.conversationId,
            runId: input.runId,
            worktreeId: input.worktreeId,
            worktreeRootPath: input.worktreeRootPath,
            rawType: "assistant",
            contentType: "tool_use",
            toolUse: {
              id: isRetry ? "tooluse_web_fetch_retry" : "tooluse_web_reader",
              name: isRetry ? "WebFetch" : "mcp__web-reader__webReader",
              input: {
                url: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742"
              }
            }
          }
        })

        if (isRetry) {
          await input.onEvent?.({
            type: "run.message.delta",
            payload: {
              provider: "claude",
              conversationId: input.conversationId,
              runId: input.runId,
              worktreeId: input.worktreeId,
              worktreeRootPath: input.worktreeRootPath,
              rawType: "assistant",
              text: "Fetched the page after authorization."
            }
          })
        }

        return {
          status: isRetry ? "completed" : "failed",
          events: []
        }
      },
      now: () => `2026-06-30T02:23:${String(nowTick++).padStart(2, "0")}.000Z`
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "claude",
      model: "claude-sonnet-5",
      accessMode: "worktree-write",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Read the Huawei developer page"
    })
    expect(sent.status).toBe("accepted")

    await waitForConversationRunStatus(service, created.conversation.id, "unavailable")
    expect(cancelProviderRun).toHaveBeenCalledTimes(1)

    const retry = await service.retryConversationRunWithPermissions({
      conversationId: created.conversation.id,
      runId: runProviderCalls[0].runId,
      allowedTools: ["mcp__web-reader__webReader"]
    })
    expect(retry.status).toBe("accepted")

    const retryDeadline = Date.now() + 1000
    let retryTimeline: Extract<ReturnType<typeof service.getConversationTimeline>, { status: "ok" }> | null = null
    while (Date.now() < retryDeadline) {
      const timeline = service.getConversationTimeline(created.conversation.id)
      const retryRunId = runProviderCalls[1]?.runId
      const retryRun = timeline.status === "ok" && retryRunId
        ? timeline.timeline.runs.find((run) => run.id === retryRunId)
        : null
      if (timeline.status === "ok" && retryRun?.status === "completed") {
        retryTimeline = timeline
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    if (!retryTimeline) {
      throw new Error("expected retry run to complete")
    }
    expect(cancelProviderRun).toHaveBeenCalledTimes(1)
    expect(runProviderCalls).toHaveLength(2)
    expect(runProviderCalls[1]).toMatchObject({
      allowedTools: ["mcp__web-reader__webReader"],
      prompt: "Read the Huawei developer page"
    })
    expect(retryTimeline.timeline.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        runId: runProviderCalls[1].runId,
        type: "run.progress",
        payload: expect.objectContaining({
          contentType: "tool_use",
          toolUse: expect.objectContaining({
            name: "WebFetch"
          })
        })
      }),
      expect.objectContaining({
        runId: runProviderCalls[1].runId,
        type: "run.message.delta",
        payload: expect.objectContaining({
          text: "Fetched the page after authorization."
        })
      })
    ]))

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("starts a Claude provider run in the conversation worktree and persists normalized output events", async () => {
    const userDataPath = createTempDir("teamcow-claude-run-")
    const repoRoot = createTempDir("teamcow-claude-run-repo-")
    makeGitRepo(repoRoot)
    const runProviderCalls: ProviderRunInput[] = []

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      runProvider: async (input): Promise<ProviderRunResult> => {
        runProviderCalls.push(input)
        return {
          status: "completed",
          events: [
            {
              type: "run.started",
              status: "running",
              payload: {
                provider: input.provider,
                conversationId: input.conversationId,
                runId: input.runId,
                worktreeId: input.worktreeId,
                worktreeRootPath: input.worktreeRootPath,
                rawType: "system"
              }
            },
            {
              type: "run.message.delta",
              payload: {
                provider: input.provider,
                conversationId: input.conversationId,
                runId: input.runId,
                worktreeId: input.worktreeId,
                worktreeRootPath: input.worktreeRootPath,
                text: "Claude produced a patch",
                rawType: "assistant"
              }
            },
            {
              type: "run.completed",
              status: "completed",
              payload: {
                provider: input.provider,
                conversationId: input.conversationId,
                runId: input.runId,
                worktreeId: input.worktreeId,
                worktreeRootPath: input.worktreeRootPath,
                rawType: "result"
              }
            }
          ]
        }
      },
      now: () => "2026-05-22T14:10:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "claude",
      model: "claude-sonnet-5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Implement the first Claude task"
    })

    expect(sent.status).toBe("accepted")
    if (sent.status !== "accepted") {
      throw new Error("expected accepted message")
    }

    expect(sent.conversation.runStatus).toBe("running")
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runProviderCalls).toHaveLength(1)
    expect(runProviderCalls[0]).toMatchObject({
      provider: "claude",
      model: "claude-sonnet-5",
      accessMode: "worktree-write",
      prompt: "Implement the first Claude task",
      worktreeRootPath: realpathSync(repoRoot),
      worktreeId: imported.project.defaultWorktree.id,
      conversationId: created.conversation.id,
      runId: sent.timeline.runs[0].id
    })

    const completedTimeline = service.getConversationTimeline(created.conversation.id)
    expect(completedTimeline.status).toBe("ok")
    if (completedTimeline.status !== "ok") {
      throw new Error("expected completed timeline")
    }

    expect(completedTimeline.timeline.runs[0]).toMatchObject({
      provider: "claude",
      model: "claude-sonnet-5",
      worktreeId: imported.project.defaultWorktree.id,
      status: "completed"
    })
    expect(completedTimeline.timeline.events.map((event) => event.type)).toEqual([
      "system.status",
      "run.started",
      "run.message.delta",
      "run.completed"
    ])
    expect(completedTimeline.timeline.events.at(-1)).toMatchObject({
      type: "run.completed",
      sequence: 4,
      payload: {
        provider: "claude",
        worktreeId: imported.project.defaultWorktree.id,
        worktreeRootPath: realpathSync(repoRoot),
        rawType: "result"
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("starts an OpenCode provider run in the conversation worktree and persists normalized output events", async () => {
    const userDataPath = createTempDir("teamcow-opencode-run-")
    const repoRoot = createTempDir("teamcow-opencode-run-repo-")
    makeGitRepo(repoRoot)
    const runProviderCalls: ProviderRunInput[] = []
    let service: ReturnType<typeof createProjectService> | null = null

    try {
      service = createProjectService({
        userDataPath,
        pickProjectDirectory: async () => null,
        confirmGitInit: async () => false,
        gitBinaryAvailable: () => false,
        initializeGit: () => null,
        runProvider: async (input): Promise<ProviderRunResult> => {
          runProviderCalls.push(input)
          return {
            status: "completed",
            events: [
              {
                type: "run.started",
                status: "running",
                payload: {
                  provider: input.provider,
                  conversationId: input.conversationId,
                  runId: input.runId,
                  worktreeId: input.worktreeId,
                  worktreeRootPath: input.worktreeRootPath,
                  rawType: "step_start"
                }
              },
              {
                type: "run.message.delta",
                payload: {
                  provider: input.provider,
                  conversationId: input.conversationId,
                  runId: input.runId,
                  worktreeId: input.worktreeId,
                  worktreeRootPath: input.worktreeRootPath,
                  text: "OpenCode produced a patch",
                  rawType: "text"
                }
              },
              {
                type: "run.progress",
                payload: {
                  provider: input.provider,
                  conversationId: input.conversationId,
                  runId: input.runId,
                  worktreeId: input.worktreeId,
                  worktreeRootPath: input.worktreeRootPath,
                  rawType: "tool_use",
                  toolUse: {
                    name: "edit",
                    status: "completed"
                  }
                }
              },
              {
                type: "run.completed",
                status: "completed",
                payload: {
                  provider: input.provider,
                  conversationId: input.conversationId,
                  runId: input.runId,
                  worktreeId: input.worktreeId,
                  worktreeRootPath: input.worktreeRootPath,
                  rawType: "step_finish"
                }
              }
            ]
          }
        },
        now: () => "2026-05-24T06:30:00.000Z"
      })

      const imported = await service.importProject({ directoryPath: repoRoot })
      if (imported.status !== "imported") {
        throw new Error("expected imported project")
      }

      const created = await service.createConversation({
        projectId: imported.project.id,
        providerKind: "opencode",
        model: "anthropic/claude-sonnet-4-6",
        executionTarget: { type: "default" }
      })
      if (created.status !== "created") {
        throw new Error("expected created conversation")
      }

      const sent = await service.sendConversationMessage({
        conversationId: created.conversation.id,
        content: "Implement the first OpenCode task"
      })

      expect(sent.status).toBe("accepted")
      if (sent.status !== "accepted") {
        throw new Error("expected accepted message")
      }

      expect(sent.conversation.runStatus).toBe("running")

      const completedTimeline = await waitForConversationRunStatus(service, created.conversation.id, "completed")

      expect(runProviderCalls).toHaveLength(1)
      expect(runProviderCalls[0]).toMatchObject({
        provider: "opencode",
        model: "anthropic/claude-sonnet-4-6",
        accessMode: "worktree-write",
        prompt: "Implement the first OpenCode task",
        worktreeRootPath: realpathSync(repoRoot),
        worktreeId: imported.project.defaultWorktree.id,
        conversationId: created.conversation.id,
        runId: sent.timeline.runs[0].id
      })

      expect(completedTimeline.timeline.runs[0]).toMatchObject({
        provider: "opencode",
        model: "anthropic/claude-sonnet-4-6",
        worktreeId: imported.project.defaultWorktree.id,
        status: "completed"
      })
      expect(completedTimeline.timeline.events.map((event) => event.type)).toEqual([
        "system.status",
        "run.started",
        "run.message.delta",
        "run.progress",
        "run.completed"
      ])
      expect(completedTimeline.timeline.events.at(-1)).toMatchObject({
        type: "run.completed",
        sequence: 5,
        payload: {
          provider: "opencode",
          worktreeId: imported.project.defaultWorktree.id,
          worktreeRootPath: realpathSync(repoRoot),
          rawType: "step_finish"
        }
      })
    } finally {
      closeService(service)
      rmSync(userDataPath, { recursive: true, force: true })
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it("persists Cursor conversations and resumes the provider-native ACP session", async () => {
    const userDataPath = createTempDir("teamcow-cursor-run-")
    const repoRoot = createTempDir("teamcow-cursor-run-repo-")
    makeGitRepo(repoRoot)
    const runProviderCalls: ProviderRunInput[] = []
    let service: ReturnType<typeof createProjectService> | null = null

    try {
      service = createProjectService({
        userDataPath,
        pickProjectDirectory: async () => null,
        confirmGitInit: async () => false,
        gitBinaryAvailable: () => false,
        initializeGit: () => null,
        runProvider: async (input): Promise<ProviderRunResult> => {
          runProviderCalls.push(input)
          return {
            status: "completed",
            sessionId: "cursor-session-1",
            events: [
              {
                type: "run.started",
                status: "running",
                payload: {
                  provider: input.provider,
                  conversationId: input.conversationId,
                  runId: input.runId,
                  worktreeId: input.worktreeId,
                  worktreeRootPath: input.worktreeRootPath,
                  rawType: "teamcow/session_ready",
                  transport: "acp"
                }
              },
              {
                type: "run.message.completed",
                payload: {
                  provider: input.provider,
                  conversationId: input.conversationId,
                  runId: input.runId,
                  worktreeId: input.worktreeId,
                  worktreeRootPath: input.worktreeRootPath,
                  rawType: "session/prompt",
                  text: `Cursor: ${input.prompt}`,
                  authoritative: true
                }
              },
              {
                type: "run.completed",
                status: "completed",
                payload: {
                  provider: input.provider,
                  conversationId: input.conversationId,
                  runId: input.runId,
                  worktreeId: input.worktreeId,
                  worktreeRootPath: input.worktreeRootPath,
                  rawType: "session/prompt",
                  transport: "acp",
                  sessionId: "cursor-session-1"
                }
              }
            ]
          }
        },
        now: () => "2026-08-20T08:20:00.000Z"
      })

      const imported = await service.importProject({ directoryPath: repoRoot })
      if (imported.status !== "imported") throw new Error("expected imported project")
      const created = await service.createConversation({
        projectId: imported.project.id,
        providerKind: "cursor",
        model: "auto",
        executionTarget: { type: "default" }
      })
      if (created.status !== "created") throw new Error("expected created conversation")

      const first = await service.sendConversationMessage({
        conversationId: created.conversation.id,
        content: "First Cursor turn"
      })
      if (first.status !== "accepted") throw new Error("expected accepted message")
      await waitForConversationRunStatus(service, created.conversation.id, "completed")

      const second = await service.sendConversationMessage({
        conversationId: created.conversation.id,
        content: "Resume Cursor turn"
      })
      if (second.status !== "accepted") throw new Error("expected accepted message")
      const deadline = Date.now() + 1000
      let completedTimeline = service.getConversationTimeline(created.conversation.id)
      while (
        Date.now() < deadline
        && (completedTimeline.status !== "ok"
          || completedTimeline.timeline.runs.length !== 2
          || completedTimeline.timeline.runs.some((run) => run.status !== "completed"))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        completedTimeline = service.getConversationTimeline(created.conversation.id)
      }
      if (completedTimeline.status !== "ok") throw new Error("expected completed Cursor timeline")

      expect(runProviderCalls).toHaveLength(2)
      expect(runProviderCalls[0]).toMatchObject({
        provider: "cursor",
        model: "auto",
        accessMode: "worktree-write",
        sessionId: undefined,
        worktreeRootPath: realpathSync(repoRoot)
      })
      expect(runProviderCalls[1]).toMatchObject({
        provider: "cursor",
        model: "auto",
        sessionId: "cursor-session-1",
        prompt: "Resume Cursor turn"
      })
      expect(completedTimeline.timeline.runs).toHaveLength(2)
      expect(completedTimeline.timeline.runs.every((run) => run.provider === "cursor" && run.status === "completed")).toBe(true)
      expect(completedTimeline.timeline.events.filter((event) => event.type === "run.completed")).toHaveLength(2)
    } finally {
      closeService(service)
      rmSync(userDataPath, { recursive: true, force: true })
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it("persists provider runtime exceptions with inspectable diagnostic payloads", async () => {
    const userDataPath = createTempDir("teamcow-runtime-exception-")
    const repoRoot = createTempDir("teamcow-runtime-exception-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      runProvider: async () => {
        throw new Error("runtime crashed")
      },
      now: () => "2026-05-22T14:20:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "claude",
      model: "claude-sonnet-5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Trigger runtime exception"
    })
    expect(sent.status).toBe("accepted")
    if (sent.status !== "accepted") {
      throw new Error("expected accepted message")
    }

    await new Promise((resolve) => setTimeout(resolve, 0))

    const failedTimeline = service.getConversationTimeline(created.conversation.id)
    expect(failedTimeline.status).toBe("ok")
    if (failedTimeline.status !== "ok") {
      throw new Error("expected failed timeline")
    }

    expect(failedTimeline.timeline.runs[0].status).toBe("failed")
    expect(failedTimeline.timeline.events.at(-1)).toMatchObject({
      type: "run.error",
      payload: {
        provider: "claude",
        conversationId: created.conversation.id,
        runId: sent.timeline.runs[0].id,
        worktreeId: imported.project.defaultWorktree.id,
        worktreeRootPath: realpathSync(repoRoot),
        rawType: "provider-runtime.exception",
        raw: {
          message: "runtime crashed"
        },
        message: "runtime crashed"
      }
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("rejects sending when the persisted conversation model is missing or invalid for the provider", async () => {
    const userDataPath = createTempDir("teamcow-invalid-model-")
    const repoRoot = createTempDir("teamcow-invalid-model-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "conversation-invalid-model",
      projectId: imported.project.id,
      title: "Legacy invalid model",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      currentModel: "claude-sonnet-4-6",
      runStatus: "idle",
      createdAt: "2026-05-19T02:39:00.000Z",
      updatedAt: "2026-05-19T02:39:00.000Z"
    })

    const sent = await service.sendConversationMessage({
      conversationId: "conversation-invalid-model",
      content: "This should not create a run"
    })

    expect(sent.status).toBe("error")
    if (sent.status !== "error") {
      throw new Error("expected error")
    }
    expect(sent.error.code).toBe("CONVERSATION_SELECTION_FAILED")

    const timeline = service.getConversationTimeline("conversation-invalid-model")
    expect(timeline.status).toBe("ok")
    if (timeline.status !== "ok") {
      throw new Error("expected timeline")
    }
    expect(timeline.timeline.messages).toHaveLength(0)
    expect(timeline.timeline.runs).toHaveLength(0)

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("updates the run and conversation status when appending a status event", async () => {
    const userDataPath = createTempDir("teamcow-run-status-event-")
    const repoRoot = createTempDir("teamcow-run-status-event-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-05-19T02:43:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }
    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Track this run"
    })
    if (sent.status !== "accepted") {
      throw new Error("expected sent message")
    }

    const statusEvent = {
      conversationId: created.conversation.id,
      runId: sent.timeline.runs[0].id,
      type: "system.status" as const,
      payload: { status: "completed" },
      status: "completed" as const
    }
    service.appendRunEvent(statusEvent)

    const timeline = service.getConversationTimeline(created.conversation.id)
    expect(timeline.status).toBe("ok")
    if (timeline.status !== "ok") {
      throw new Error("expected timeline")
    }
    expect(timeline.timeline.runs[0].status).toBe("completed")
    expect(timeline.timeline.runs[0].completedAt).toBe("2026-05-19T02:43:00.000Z")
    expect(service.getCurrentConversation()?.runStatus).toBe("completed")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("deduplicates persisted provider events by their native event id", async () => {
    const userDataPath = createTempDir("teamcow-provider-event-idempotency-")
    const repoRoot = createTempDir("teamcow-provider-event-idempotency-repo-")
    makeGitRepo(repoRoot)
    const onRunEvent = vi.fn()
    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      onRunEvent,
      now: () => "2026-05-19T02:43:30.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") throw new Error("expected imported project")
    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") throw new Error("expected created conversation")
    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Replay-safe event"
    })
    if (sent.status !== "accepted") throw new Error("expected sent message")
    onRunEvent.mockClear()

    const input = {
      conversationId: created.conversation.id,
      runId: sent.timeline.runs[0].id,
      type: "run.progress" as const,
      payload: { rawType: "item/completed", providerEventId: "item-42" },
      providerEventId: "item-42"
    }
    const first = service.appendRunEvent(input)
    const replay = service.appendRunEvent(input)

    expect(replay.id).toBe(first.id)
    expect(onRunEvent).toHaveBeenCalledTimes(1)
    const timeline = service.getConversationTimeline(created.conversation.id)
    if (timeline.status !== "ok") throw new Error("expected timeline")
    expect(timeline.timeline.events.filter((event) => event.id === first.id)).toHaveLength(1)

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("emits run notification candidates after terminal status updates without blocking persistence", async () => {
    const userDataPath = createTempDir("teamcow-run-notification-")
    const repoRoot = createTempDir("teamcow-run-notification-repo-")
    makeGitRepo(repoRoot)
    const onRunNotificationCandidate = vi.fn(() => {
      throw new Error("notification service unavailable")
    })

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      onRunNotificationCandidate,
      runProvider: vi.fn(async (): Promise<ProviderRunResult> => ({
        status: "running",
        events: []
      })),
      now: () => "2026-05-19T02:44:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }
    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Notify me when done"
    })
    if (sent.status !== "accepted") {
      throw new Error("expected sent message")
    }

    expect(() => service.appendRunEvent({
      conversationId: created.conversation.id,
      runId: sent.timeline.runs[0].id,
      type: "run.completed",
      payload: { rawType: "turn.completed" },
      status: "completed"
    })).not.toThrow()

    expect(onRunNotificationCandidate).toHaveBeenCalledWith({
      kind: "run-completed",
      context: {
        projectName: imported.project.name,
        conversationTitle: "Notify me when done",
        providerKind: "codex",
        worktreeLabel: "main",
        runStatus: "completed"
      },
      params: {
        conversationId: created.conversation.id,
        runId: sent.timeline.runs[0].id,
        worktreeId: imported.project.defaultWorktree.id
      }
    })

    const timeline = service.getConversationTimeline(created.conversation.id)
    expect(timeline.status).toBe("ok")
    if (timeline.status !== "ok") {
      throw new Error("expected timeline")
    }
    expect(timeline.timeline.runs[0].status).toBe("completed")
    expect(timeline.timeline.events.at(-1)).toMatchObject({
      type: "run.completed"
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("suppresses completed notifications for the focused active conversation but still emits failures", async () => {
    const userDataPath = createTempDir("teamcow-run-notification-focused-")
    const repoRoot = createTempDir("teamcow-run-notification-focused-repo-")
    makeGitRepo(repoRoot)
    const onRunNotificationCandidate = vi.fn()

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      isAppFocused: () => true,
      onRunNotificationCandidate,
      runProvider: vi.fn(async (): Promise<ProviderRunResult> => ({
        status: "running",
        events: []
      })),
      now: () => "2026-05-19T02:45:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }
    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Notify only if attention is needed"
    })
    if (sent.status !== "accepted") {
      throw new Error("expected sent message")
    }

    service.appendRunEvent({
      conversationId: created.conversation.id,
      runId: sent.timeline.runs[0].id,
      type: "run.completed",
      payload: { rawType: "turn.completed" },
      status: "completed"
    })
    expect(onRunNotificationCandidate).not.toHaveBeenCalled()

    service.appendRunEvent({
      conversationId: created.conversation.id,
      runId: sent.timeline.runs[0].id,
      type: "run.failed",
      payload: { rawType: "turn.failed" },
      status: "failed"
    })
    expect(onRunNotificationCandidate).toHaveBeenCalledWith(expect.objectContaining({
      kind: "run-failed",
      context: expect.objectContaining({
        runStatus: "failed"
      })
    }))

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("does not repeat notifications or overwrite completedAt for duplicate terminal status events", async () => {
    const userDataPath = createTempDir("teamcow-run-notification-duplicate-")
    const repoRoot = createTempDir("teamcow-run-notification-duplicate-repo-")
    makeGitRepo(repoRoot)
    const onRunNotificationCandidate = vi.fn()
    const timestamps = [
      "2026-05-19T02:46:00.000Z",
      "2026-05-19T02:46:01.000Z",
      "2026-05-19T02:46:02.000Z",
      "2026-05-19T02:46:03.000Z",
      "2026-05-19T02:46:04.000Z"
    ]

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      onRunNotificationCandidate,
      runProvider: vi.fn(async (): Promise<ProviderRunResult> => ({
        status: "running",
        events: []
      })),
      now: () => timestamps.shift() ?? "2026-05-19T02:46:99.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }
    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Avoid duplicate notifications"
    })
    if (sent.status !== "accepted") {
      throw new Error("expected sent message")
    }

    service.appendRunEvent({
      conversationId: created.conversation.id,
      runId: sent.timeline.runs[0].id,
      type: "run.completed",
      payload: { rawType: "turn.completed" },
      status: "completed"
    })
    const afterFirstTerminal = service.getConversationTimeline(created.conversation.id)
    expect(afterFirstTerminal.status).toBe("ok")
    if (afterFirstTerminal.status !== "ok") {
      throw new Error("expected timeline")
    }
    const firstCompletedAt = afterFirstTerminal.timeline.runs[0].completedAt

    service.appendRunEvent({
      conversationId: created.conversation.id,
      runId: sent.timeline.runs[0].id,
      type: "run.completed",
      payload: { rawType: "turn.completed", duplicate: true },
      status: "completed"
    })

    const timeline = service.getConversationTimeline(created.conversation.id)
    expect(timeline.status).toBe("ok")
    if (timeline.status !== "ok") {
      throw new Error("expected timeline")
    }
    expect(onRunNotificationCandidate).toHaveBeenCalledTimes(1)
    expect(timeline.timeline.runs[0].completedAt).toBe(firstCompletedAt)

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("orders timeline events by run start order and preserves malformed payloads", async () => {
    const userDataPath = createTempDir("teamcow-timeline-order-")
    const repoRoot = createTempDir("teamcow-timeline-order-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    seedConversation(userDataPath, {
      id: "conversation-order",
      projectId: imported.project.id,
      title: "Ordering",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "running",
      createdAt: "2026-05-19T02:44:00.000Z",
      updatedAt: "2026-05-19T02:44:00.000Z"
    })

    const db = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
    db.db.insert(executionRunsTable).values([
      {
        id: "z-run-earlier",
        conversationId: "conversation-order",
        provider: "codex",
        model: "gpt-5.5",
        worktreeId: imported.project.defaultWorktree.id,
        status: "running",
        startedAt: "2026-05-19T02:44:00.000Z",
        completedAt: null,
        createdAt: "2026-05-19T02:44:00.000Z",
        updatedAt: "2026-05-19T02:44:00.000Z"
      },
      {
        id: "a-run-later",
        conversationId: "conversation-order",
        provider: "codex",
        model: "gpt-5.5",
        worktreeId: imported.project.defaultWorktree.id,
        status: "running",
        startedAt: "2026-05-19T02:45:00.000Z",
        completedAt: null,
        createdAt: "2026-05-19T02:45:00.000Z",
        updatedAt: "2026-05-19T02:45:00.000Z"
      }
    ]).run()
    db.db.insert(runEventsTable).values([
      {
        id: "event-later",
        conversationId: "conversation-order",
        runId: "a-run-later",
        sequence: 1,
        type: "system.status",
        payload: "{\"status\":\"running\"}",
        createdAt: "2026-05-19T02:45:00.000Z"
      },
      {
        id: "event-earlier",
        conversationId: "conversation-order",
        runId: "z-run-earlier",
        sequence: 1,
        type: "system.status",
        payload: "not-json",
        createdAt: "2026-05-19T02:44:00.000Z"
      }
    ]).run()
    db.close()

    const timeline = service.getConversationTimeline("conversation-order")
    expect(timeline.status).toBe("ok")
    if (timeline.status !== "ok") {
      throw new Error("expected timeline")
    }
    expect(timeline.timeline.events.map((event) => event.id)).toEqual(["event-earlier", "event-later"])
    expect(timeline.timeline.events[0].payload).toEqual({
      raw: "not-json",
      parseError: "invalid-json"
    })

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("pages conversation history with a stable run cursor", async () => {
    const userDataPath = createTempDir("teamcow-timeline-page-")
    const repoRoot = createTempDir("teamcow-timeline-page-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    try {
      const imported = await service.importProject({ directoryPath: repoRoot })
      if (imported.status !== "imported") throw new Error("expected imported project")

      seedConversation(userDataPath, {
        id: "conversation-page",
        projectId: imported.project.id,
        title: "Paged history",
        worktreeId: imported.project.defaultWorktree.id,
        provider: "codex",
        currentModel: "gpt-5.5",
        runStatus: "completed",
        createdAt: "2026-05-19T02:40:00.000Z",
        updatedAt: "2026-05-19T02:45:00.000Z"
      })

      const db = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
      db.db.insert(executionRunsTable).values(Array.from({ length: 5 }, (_, index) => {
        const minute = String(41 + index).padStart(2, "0")
        const timestamp = `2026-05-19T02:${minute}:00.000Z`
        return {
          id: `page-run-${index + 1}`,
          conversationId: "conversation-page",
          provider: "codex",
          model: "gpt-5.5",
          worktreeId: imported.project.defaultWorktree.id,
          status: "completed",
          startedAt: timestamp,
          completedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      })).run()
      db.close()

      const first = service.getConversationTimelinePage({ conversationId: "conversation-page", limit: 2 })
      expect(first.status).toBe("ok")
      if (first.status !== "ok") throw new Error("expected first page")
      expect(first.timeline.runs.map((run) => run.id)).toEqual(["page-run-4", "page-run-5"])
      expect(first.pageInfo).toEqual({ nextCursor: "page-run-4", hasMore: true })

      const second = service.getConversationTimelinePage({
        conversationId: "conversation-page",
        beforeRunId: first.pageInfo.nextCursor ?? undefined,
        limit: 2
      })
      expect(second.status).toBe("ok")
      if (second.status !== "ok") throw new Error("expected second page")
      expect(second.timeline.runs.map((run) => run.id)).toEqual(["page-run-2", "page-run-3"])
      expect(second.pageInfo).toEqual({ nextCursor: "page-run-2", hasMore: true })

      const third = service.getConversationTimelinePage({
        conversationId: "conversation-page",
        beforeRunId: second.pageInfo.nextCursor ?? undefined,
        limit: 2
      })
      expect(third.status).toBe("ok")
      if (third.status !== "ok") throw new Error("expected third page")
      expect(third.timeline.runs.map((run) => run.id)).toEqual(["page-run-1"])
      expect(third.pageInfo).toEqual({ nextCursor: null, hasMore: false })
    } finally {
      service.close()
      rmSync(userDataPath, { recursive: true, force: true })
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it("reads multiple historical runs and artifacts from local storage without provider runtime", async () => {
    const userDataPath = createTempDir("teamcow-history-local-")
    const repoRoot = createTempDir("teamcow-history-local-repo-")
    let service: ReturnType<typeof createProjectService> | null = null
    let db: ReturnType<typeof createAppDatabase> | null = null

    try {
      makeGitRepo(repoRoot)
      const runProvider = vi.fn(async (): Promise<ProviderRunResult> => ({
        status: "completed",
        events: []
      }))

      service = createProjectService({
        userDataPath,
        pickProjectDirectory: async () => null,
        confirmGitInit: async () => false,
        gitBinaryAvailable: () => false,
        initializeGit: () => null,
        runProvider
      })

      const imported = await service.importProject({ directoryPath: repoRoot })
      if (imported.status !== "imported") {
        throw new Error("expected imported project")
      }
      seedConversation(userDataPath, {
        id: "conversation-history-local",
        projectId: imported.project.id,
        title: "Local history",
        worktreeId: imported.project.defaultWorktree.id,
        provider: "codex",
        currentModel: "gpt-5.1",
        runStatus: "failed",
        createdAt: "2026-05-19T02:40:00.000Z",
        updatedAt: "2026-05-19T02:46:00.000Z"
      })

      db = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
      db.db.insert(executionRunsTable).values([
        {
          id: "history-run-1",
          conversationId: "conversation-history-local",
          provider: "codex",
          model: "gpt-5.1",
          worktreeId: imported.project.defaultWorktree.id,
          status: "completed",
          startedAt: "2026-05-19T02:40:00.000Z",
          completedAt: "2026-05-19T02:41:00.000Z",
          createdAt: "2026-05-19T02:40:00.000Z",
          updatedAt: "2026-05-19T02:41:00.000Z"
        },
        {
          id: "history-run-2",
          conversationId: "conversation-history-local",
          provider: "claude",
          model: "claude-sonnet-4",
          worktreeId: imported.project.defaultWorktree.id,
          status: "failed",
          startedAt: "2026-05-19T02:45:00.000Z",
          completedAt: "2026-05-19T02:46:00.000Z",
          createdAt: "2026-05-19T02:45:00.000Z",
          updatedAt: "2026-05-19T02:46:00.000Z"
        }
      ]).run()
      db.db.insert(artifactsTable).values([
        {
          id: "history-artifact-1",
          conversationId: "conversation-history-local",
          runId: "history-run-1",
          kind: "summary",
          title: "First local result",
          uri: null,
          payload: "{\"changedFiles\":2}",
          createdAt: "2026-05-19T02:41:00.000Z"
        },
        {
          id: "history-artifact-2",
          conversationId: "conversation-history-local",
          runId: "history-run-2",
          kind: "summary",
          title: "Second local result",
          uri: null,
          payload: "{\"changedFiles\":1}",
          createdAt: "2026-05-19T02:46:00.000Z"
        }
      ]).run()
      db.close()
      db = null

      const timeline = service.getConversationTimeline("conversation-history-local")
      expect(timeline.status).toBe("ok")
      if (timeline.status !== "ok") {
        throw new Error("expected timeline")
      }

      expect(runProvider).not.toHaveBeenCalled()
      expect(timeline.timeline.runs.map((run) => ({
        id: run.id,
        provider: run.provider,
        model: run.model,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt
      }))).toEqual([
        {
          id: "history-run-1",
          provider: "codex",
          model: "gpt-5.1",
          status: "completed",
          startedAt: "2026-05-19T02:40:00.000Z",
          completedAt: "2026-05-19T02:41:00.000Z"
        },
        {
          id: "history-run-2",
          provider: "claude",
          model: "claude-sonnet-4",
          status: "failed",
          startedAt: "2026-05-19T02:45:00.000Z",
          completedAt: "2026-05-19T02:46:00.000Z"
        }
      ])
      expect(timeline.timeline.artifacts.map((artifact) => ({
        id: artifact.id,
        runId: artifact.runId,
        conversationId: artifact.conversationId
      }))).toEqual([
        {
          id: "history-artifact-1",
          runId: "history-run-1",
          conversationId: "conversation-history-local"
        },
        {
          id: "history-artifact-2",
          runId: "history-run-2",
          conversationId: "conversation-history-local"
        }
      ])
    } finally {
      db?.close()
      closeService(service)
      rmSync(userDataPath, { recursive: true, force: true })
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it("enforces run event sequence uniqueness and run/conversation ownership in the database", async () => {
    const userDataPath = createTempDir("teamcow-run-constraints-")
    const repoRoot = createTempDir("teamcow-run-constraints-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    seedConversation(userDataPath, {
      id: "conversation-owner-1",
      projectId: imported.project.id,
      title: "Owner one",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "running",
      createdAt: "2026-05-19T02:46:00.000Z",
      updatedAt: "2026-05-19T02:46:00.000Z"
    })
    seedConversation(userDataPath, {
      id: "conversation-owner-2",
      projectId: imported.project.id,
      title: "Owner two",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "running",
      createdAt: "2026-05-19T02:46:00.000Z",
      updatedAt: "2026-05-19T02:46:00.000Z"
    })

    const db = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
    db.db.insert(executionRunsTable).values({
      id: "run-owner-1",
      conversationId: "conversation-owner-1",
      provider: "codex",
      model: "gpt-5.5",
      worktreeId: imported.project.defaultWorktree.id,
      status: "running",
      startedAt: "2026-05-19T02:46:00.000Z",
      completedAt: null,
      createdAt: "2026-05-19T02:46:00.000Z",
      updatedAt: "2026-05-19T02:46:00.000Z"
    }).run()
    db.db.insert(runEventsTable).values({
      id: "event-owner-1",
      conversationId: "conversation-owner-1",
      runId: "run-owner-1",
      sequence: 1,
      type: "system.status",
      payload: "{}",
      createdAt: "2026-05-19T02:46:00.000Z"
    }).run()

    expect(() => db.db.insert(runEventsTable).values({
      id: "event-owner-duplicate",
      conversationId: "conversation-owner-1",
      runId: "run-owner-1",
      sequence: 1,
      type: "system.status",
      payload: "{}",
      createdAt: "2026-05-19T02:46:01.000Z"
    }).run()).toThrow()
    expect(() => db.db.insert(artifactsTable).values({
      id: "artifact-wrong-owner",
      conversationId: "conversation-owner-2",
      runId: "run-owner-1",
      kind: "summary",
      title: null,
      uri: null,
      payload: "{}",
      createdAt: "2026-05-19T02:46:01.000Z"
    }).run()).toThrow()

    db.close()
    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("reads the persisted conversation timeline after restarting the service", async () => {
    const userDataPath = createTempDir("teamcow-timeline-restart-")
    const repoRoot = createTempDir("teamcow-timeline-restart-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-05-19T02:47:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }
    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Read this after restart"
    })
    if (sent.status !== "accepted") {
      throw new Error("expected sent message")
    }
    const persistedRunId = sent.timeline.runs[0].id
    service.appendRunArtifact({
      conversationId: created.conversation.id,
      runId: persistedRunId,
      kind: "summary",
      title: "Restart artifact",
      payload: { changedFiles: 2 }
    })
    service.close()

    const restartedService = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })
    const timeline = restartedService.getConversationTimeline(created.conversation.id)
    expect(timeline.status).toBe("ok")
    if (timeline.status !== "ok") {
      throw new Error("expected timeline")
    }
    expect(timeline.timeline.messages.map((message) => message.content)).toEqual(["Read this after restart"])
    expect(timeline.timeline.runs).toHaveLength(1)
    expect(timeline.timeline.events).toHaveLength(1)
    expect(timeline.timeline.artifacts.map((artifact) => ({
      runId: artifact.runId,
      title: artifact.title,
      payload: artifact.payload
    }))).toEqual([
      {
        runId: persistedRunId,
        title: "Restart artifact",
        payload: { changedFiles: 2 }
      }
    ])

    restartedService.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("keeps message, run, event, and artifact reads isolated by conversation", async () => {
    const userDataPath = createTempDir("teamcow-timeline-isolation-")
    const repoRoot = createTempDir("teamcow-timeline-isolation-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-05-19T02:41:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const first = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    const second = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "claude",
      model: "claude-sonnet-5",
      executionTarget: { type: "default" }
    })
    if (first.status !== "created" || second.status !== "created") {
      throw new Error("expected conversations")
    }

    const firstSent = await service.sendConversationMessage({
      conversationId: first.conversation.id,
      content: "First isolated message"
    })
    const secondSent = await service.sendConversationMessage({
      conversationId: second.conversation.id,
      content: "Second isolated message"
    })
    if (firstSent.status !== "accepted" || secondSent.status !== "accepted") {
      throw new Error("expected sent messages")
    }

    service.appendRunArtifact({
      conversationId: first.conversation.id,
      runId: firstSent.timeline.runs[0].id,
      kind: "summary",
      title: "First result",
      uri: null,
      payload: { changedFiles: 1 }
    })

    const firstTimeline = service.getConversationTimeline(first.conversation.id)
    const secondTimeline = service.getConversationTimeline(second.conversation.id)
    expect(firstTimeline.status).toBe("ok")
    expect(secondTimeline.status).toBe("ok")
    if (firstTimeline.status !== "ok" || secondTimeline.status !== "ok") {
      throw new Error("expected timelines")
    }

    expect(firstTimeline.timeline.messages.map((message) => message.content)).toEqual(["First isolated message"])
    expect(secondTimeline.timeline.messages.map((message) => message.content)).toEqual(["Second isolated message"])
    expect(firstTimeline.timeline.runs.map((run) => run.provider)).toEqual(["codex"])
    expect(secondTimeline.timeline.runs.map((run) => run.provider)).toEqual(["claude"])
    expect(firstTimeline.timeline.artifacts).toHaveLength(1)
    expect(secondTimeline.timeline.artifacts).toHaveLength(0)

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("persists streaming provider events for concurrent conversations before either run completes", async () => {
    const userDataPath = createTempDir("teamcow-concurrent-runs-")
    const repoRoot = createTempDir("teamcow-concurrent-runs-repo-")
    makeGitRepo(repoRoot)
    const runProviderCalls: ProviderRunInput[] = []
    const releaseRuns: Array<() => void> = []
    let missingEventSink = false
    let service: ReturnType<typeof createProjectService> | null = null

    try {
      service = createProjectService({
        userDataPath,
        pickProjectDirectory: async () => null,
        confirmGitInit: async () => false,
        gitBinaryAvailable: () => false,
        initializeGit: () => null,
        runProvider: async (input): Promise<ProviderRunResult> => {
          runProviderCalls.push(input)
          const streamingInput = input as ProviderRunInput & {
            onEvent?: (event: ProviderRunResult["events"][number]) => void | Promise<void>
          }

          if (!streamingInput.onEvent) {
            missingEventSink = true
          } else {
            await streamingInput.onEvent({
              type: "run.started",
              status: "running",
              payload: {
                provider: input.provider,
                conversationId: input.conversationId,
                runId: input.runId,
                worktreeId: input.worktreeId,
                worktreeRootPath: input.worktreeRootPath,
                rawType: "stream.start"
              }
            })
            await streamingInput.onEvent({
              type: "run.message.delta",
              payload: {
                provider: input.provider,
                conversationId: input.conversationId,
                runId: input.runId,
                worktreeId: input.worktreeId,
                worktreeRootPath: input.worktreeRootPath,
                rawType: "stream.delta",
                text: `${input.provider} streamed before completion`
              }
            })
          }

          await new Promise<void>((resolve) => {
            releaseRuns.push(resolve)
          })

          return {
            status: "completed",
            events: [
              {
                type: "run.completed",
                status: "completed",
                payload: {
                  provider: input.provider,
                  conversationId: input.conversationId,
                  runId: input.runId,
                  worktreeId: input.worktreeId,
                  worktreeRootPath: input.worktreeRootPath,
                  rawType: "stream.completed"
                }
              }
            ]
          }
        },
        now: () => "2026-05-24T12:30:00.000Z"
      })

      const imported = await service.importProject({ directoryPath: repoRoot })
      if (imported.status !== "imported") {
        throw new Error("expected imported project")
      }

      const first = await service.createConversation({
        projectId: imported.project.id,
        providerKind: "codex",
        model: "gpt-5.5",
        executionTarget: { type: "default" }
      })
      const second = await service.createConversation({
        projectId: imported.project.id,
        providerKind: "claude",
        model: "claude-sonnet-5",
        executionTarget: { type: "default" }
      })
      if (first.status !== "created" || second.status !== "created") {
        throw new Error("expected conversations")
      }

      const firstSent = await service.sendConversationMessage({
        conversationId: first.conversation.id,
        content: "First concurrent task"
      })
      const secondSent = await service.sendConversationMessage({
        conversationId: second.conversation.id,
        content: "Second concurrent task"
      })
      if (firstSent.status !== "accepted" || secondSent.status !== "accepted") {
        throw new Error("expected accepted sends")
      }

      expect(firstSent.conversation.runStatus).toBe("running")
      expect(secondSent.conversation.runStatus).toBe("running")

      const deadline = Date.now() + 1000
      while (runProviderCalls.length < 2 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }

      expect(runProviderCalls).toHaveLength(2)
      expect(missingEventSink).toBe(false)
      expect(runProviderCalls.map((input) => input.conversationId).sort()).toEqual([
        first.conversation.id,
        second.conversation.id
      ].sort())
      expect(runProviderCalls.map((input) => input.runId)).toEqual([
        firstSent.timeline.runs[0].id,
        secondSent.timeline.runs[0].id
      ])

      const firstStreamingTimeline = service.getConversationTimeline(first.conversation.id)
      const secondStreamingTimeline = service.getConversationTimeline(second.conversation.id)
      expect(firstStreamingTimeline.status).toBe("ok")
      expect(secondStreamingTimeline.status).toBe("ok")
      if (firstStreamingTimeline.status !== "ok" || secondStreamingTimeline.status !== "ok") {
        throw new Error("expected timelines")
      }

      expect(firstStreamingTimeline.timeline.runs[0].status).toBe("running")
      expect(secondStreamingTimeline.timeline.runs[0].status).toBe("running")
      expect(firstStreamingTimeline.timeline.events.map((event) => event.payload.conversationId).filter(Boolean)).toEqual([
        first.conversation.id,
        first.conversation.id
      ])
      expect(secondStreamingTimeline.timeline.events.map((event) => event.payload.conversationId).filter(Boolean)).toEqual([
        second.conversation.id,
        second.conversation.id
      ])
      expect(firstStreamingTimeline.timeline.events.map((event) => event.type)).toEqual([
        "system.status",
        "run.started",
        "run.message.delta"
      ])
      expect(secondStreamingTimeline.timeline.events.map((event) => event.type)).toEqual([
        "system.status",
        "run.started",
        "run.message.delta"
      ])

      releaseRuns[0]?.()
      const firstCompleted = await waitForConversationRunStatus(service, first.conversation.id, "completed")
      const secondStillRunning = service.getConversationTimeline(second.conversation.id)
      expect(secondStillRunning.status).toBe("ok")
      if (secondStillRunning.status !== "ok") {
        throw new Error("expected second timeline")
      }
      expect(firstCompleted.timeline.runs[0].status).toBe("completed")
      expect(secondStillRunning.timeline.runs[0].status).toBe("running")

      releaseRuns[1]?.()
      const secondCompleted = await waitForConversationRunStatus(service, second.conversation.id, "completed")
      expect(secondCompleted.timeline.runs[0].status).toBe("completed")
    } finally {
      releaseRuns.forEach((release) => release())
      closeService(service)
      rmSync(userDataPath, { recursive: true, force: true })
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it("builds assistant cache from persisted streamed events when final provider events are empty", async () => {
    const userDataPath = createTempDir("teamcow-stream-cache-")
    const repoRoot = createTempDir("teamcow-stream-cache-repo-")
    makeGitRepo(repoRoot)
    let service: ReturnType<typeof createProjectService> | null = null

    try {
      service = createProjectService({
        userDataPath,
        pickProjectDirectory: async () => null,
        confirmGitInit: async () => false,
        gitBinaryAvailable: () => false,
        initializeGit: () => null,
        runProvider: async (input): Promise<ProviderRunResult> => {
          await input.onEvent?.({
            type: "run.message.delta",
            payload: {
              provider: input.provider,
              conversationId: input.conversationId,
              runId: input.runId,
              worktreeId: input.worktreeId,
              worktreeRootPath: input.worktreeRootPath,
              rawType: "stream.delta",
              text: "Streamed "
            }
          })
          await input.onEvent?.({
            type: "run.message.delta",
            payload: {
              provider: input.provider,
              conversationId: input.conversationId,
              runId: input.runId,
              worktreeId: input.worktreeId,
              worktreeRootPath: input.worktreeRootPath,
              rawType: "stream.delta",
              text: "answer"
            }
          })
          await input.onEvent?.({
            type: "run.message.completed",
            payload: {
              provider: input.provider,
              conversationId: input.conversationId,
              runId: input.runId,
              worktreeId: input.worktreeId,
              worktreeRootPath: input.worktreeRootPath,
              rawType: "stream.completed-message",
              phase: "final",
              authoritative: true,
              text: "Streamed answer (full final text)"
            }
          })
          await input.onEvent?.({
            type: "run.completed",
            status: "completed",
            payload: {
              provider: input.provider,
              conversationId: input.conversationId,
              runId: input.runId,
              worktreeId: input.worktreeId,
              worktreeRootPath: input.worktreeRootPath,
              rawType: "stream.completed"
            }
          })

          return {
            status: "completed",
            events: []
          }
        }
      })

      const imported = await service.importProject({ directoryPath: repoRoot })
      if (imported.status !== "imported") {
        throw new Error("expected imported project")
      }
      const created = await service.createConversation({
        projectId: imported.project.id,
        providerKind: "codex",
        model: "gpt-5.5",
        executionTarget: { type: "default" }
      })
      if (created.status !== "created") {
        throw new Error("expected created conversation")
      }

      const sent = await service.sendConversationMessage({
        conversationId: created.conversation.id,
        content: "Stream a response"
      })
      expect(sent.status).toBe("accepted")

      const completed = await waitForConversationRunStatus(service, created.conversation.id, "completed")
      expect(completed.timeline.messages).toEqual([
        expect.objectContaining({
          role: "user",
          content: "Stream a response"
        }),
        expect.objectContaining({
          role: "assistant",
          content: "Streamed answer (full final text)",
          runId: completed.timeline.runs[0].id
        })
      ])
    } finally {
      closeService(service)
      rmSync(userDataPath, { recursive: true, force: true })
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it("queues sends but still rejects model changes while the conversation has a running provider run", async () => {
    const userDataPath = createTempDir("teamcow-running-guard-")
    const repoRoot = createTempDir("teamcow-running-guard-repo-")
    makeGitRepo(repoRoot)
    let service: ReturnType<typeof createProjectService> | null = null

    try {
      service = createProjectService({
        userDataPath,
        pickProjectDirectory: async () => null,
        confirmGitInit: async () => false,
        gitBinaryAvailable: () => false,
        initializeGit: () => null,
        runProvider: async (): Promise<ProviderRunResult> => new Promise<ProviderRunResult>(() => undefined)
      })

      const imported = await service.importProject({ directoryPath: repoRoot })
      if (imported.status !== "imported") {
        throw new Error("expected imported project")
      }
      const created = await service.createConversation({
        projectId: imported.project.id,
        providerKind: "codex",
        model: "gpt-5.5",
        executionTarget: { type: "default" }
      })
      if (created.status !== "created") {
        throw new Error("expected created conversation")
      }

      const firstSent = await service.sendConversationMessage({
        conversationId: created.conversation.id,
        content: "Keep running"
      })
      expect(firstSent.status).toBe("accepted")

      const secondSent = await service.sendConversationMessage({
        conversationId: created.conversation.id,
        content: "Run this after the current task"
      })
      expect(secondSent.status).toBe("queued")
      if (secondSent.status !== "queued") {
        throw new Error("expected queued result")
      }
      expect(secondSent.queuedMessage.content).toBe("Run this after the current task")

      const modelResult = await service.setConversationModel({
        conversationId: created.conversation.id,
        model: "gpt-5.4-mini"
      })
      expect(modelResult.status).toBe("error")
      if (modelResult.status !== "error") {
        throw new Error("expected error result")
      }
      expect(modelResult.error.code).toBe("CONVERSATION_RUN_IN_PROGRESS")

      const timeline = service.getConversationTimeline(created.conversation.id)
      expect(timeline.status).toBe("ok")
      if (timeline.status !== "ok") {
        throw new Error("expected timeline")
      }
      expect(timeline.timeline.runs).toHaveLength(1)
      expect(timeline.timeline.messages.filter((message) => message.role === "user")).toHaveLength(1)
      expect(timeline.timeline.queuedMessages?.map((message) => message.content)).toEqual([
        "Run this after the current task"
      ])
      expect(service.getCurrentConversation()?.currentModel).toBe("gpt-5.5")

      const deleted = await service.deleteQueuedConversationMessage({
        conversationId: created.conversation.id,
        queuedMessageId: secondSent.queuedMessage.id
      })
      expect(deleted).toMatchObject({ status: "ok", timeline: { queuedMessages: [] } })
    } finally {
      closeService(service)
      rmSync(userDataPath, { recursive: true, force: true })
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it("automatically dispatches queued messages in FIFO order after each provider run exits", async () => {
    const userDataPath = createTempDir("teamcow-message-queue-")
    const repoRoot = createTempDir("teamcow-message-queue-repo-")
    makeGitRepo(repoRoot)
    let service: ReturnType<typeof createProjectService> | null = null
    const runProviderCalls: ProviderRunInput[] = []
    const releaseRuns: Array<() => void> = []

    try {
      service = createProjectService({
        userDataPath,
        pickProjectDirectory: async () => null,
        confirmGitInit: async () => false,
        gitBinaryAvailable: () => false,
        initializeGit: () => null,
        runProvider: async (input): Promise<ProviderRunResult> => {
          runProviderCalls.push(input)
          await new Promise<void>((resolve) => releaseRuns.push(resolve))
          return {
            status: "completed",
            events: [{
              type: "run.completed",
              status: "completed",
              payload: {
                provider: input.provider,
                conversationId: input.conversationId,
                runId: input.runId,
                worktreeId: input.worktreeId,
                worktreeRootPath: input.worktreeRootPath,
                rawType: "queue-test.completed"
              }
            }]
          }
        },
        now: () => "2026-08-21T08:00:00.000Z"
      })

      const imported = await service.importProject({ directoryPath: repoRoot })
      if (imported.status !== "imported") throw new Error("expected imported project")
      const created = await service.createConversation({
        projectId: imported.project.id,
        providerKind: "codex",
        model: "gpt-5.5",
        executionTarget: { type: "default" }
      })
      if (created.status !== "created") throw new Error("expected created conversation")

      const first = await service.sendConversationMessage({
        conversationId: created.conversation.id,
        content: "First task"
      })
      expect(first.status).toBe("accepted")

      const waitForProviderCallCount = async (count: number) => {
        const deadline = Date.now() + 1000
        while (runProviderCalls.length < count && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 5))
        }
        expect(runProviderCalls).toHaveLength(count)
      }
      await waitForProviderCallCount(1)

      const second = await service.sendConversationMessage({
        conversationId: created.conversation.id,
        content: "Second task",
        attachments: [{
          name: "queue-note.txt",
          mimeType: "text/plain",
          sizeBytes: 4,
          dataBase64: "dGVzdA=="
        }]
      })
      const third = await service.sendConversationMessage({
        conversationId: created.conversation.id,
        content: "Third task"
      })
      expect(second.status).toBe("queued")
      expect(third.status).toBe("queued")
      expect(service.getConversationTimeline(created.conversation.id)).toMatchObject({
        status: "ok",
        timeline: {
          queuedMessages: [
            { content: "Second task" },
            { content: "Third task" }
          ]
        }
      })

      releaseRuns.shift()?.()
      await waitForProviderCallCount(2)
      expect(runProviderCalls[1].prompt).toBe("Second task")
      expect(runProviderCalls[1].attachments).toMatchObject([{
        name: "queue-note.txt",
        mimeType: "text/plain",
        sizeBytes: 4
      }])
      expect(existsSync(runProviderCalls[1].attachments?.[0]?.path ?? "")).toBe(true)
      expect(service.getConversationTimeline(created.conversation.id)).toMatchObject({
        status: "ok",
        timeline: { queuedMessages: [{ content: "Third task" }] }
      })

      releaseRuns.shift()?.()
      await waitForProviderCallCount(3)
      expect(runProviderCalls[2].prompt).toBe("Third task")

      releaseRuns.shift()?.()
      await waitForConversationRunStatus(service, created.conversation.id, "completed")
      const completed = service.getConversationTimeline(created.conversation.id)
      expect(completed).toMatchObject({
        status: "ok",
        timeline: { queuedMessages: [] }
      })
      if (completed.status !== "ok") throw new Error("expected completed timeline")
      expect(completed.timeline.messages
        .filter((message) => message.role === "user")
        .map((message) => message.content)).toEqual(["First task", "Second task", "Third task"])
      expect(completed.timeline.messages.find((message) => message.content === "Second task")?.attachments)
        .toMatchObject([{ name: "queue-note.txt", sizeBytes: 4 }])
    } finally {
      closeService(service)
      rmSync(userDataPath, { recursive: true, force: true })
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it("rolls back message and run persistence when a send transaction fails", async () => {
    const userDataPath = createTempDir("teamcow-message-rollback-")
    const repoRoot = createTempDir("teamcow-message-rollback-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      afterSendConversationMessagePersist: () => {
        throw new Error("message persistence hook failed")
      },
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-05-19T02:42:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created conversation")
    }

    const sent = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "This should roll back"
    })

    expect(sent.status).toBe("error")
    if (sent.status !== "error") {
      throw new Error("expected error")
    }

    const db = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
    expect(db.db.select().from(conversationMessagesTable).all()).toHaveLength(0)
    expect(db.db.select().from(executionRunsTable).all()).toHaveLength(0)
    expect(db.db.select().from(runEventsTable).all()).toHaveLength(0)
    expect((db.db.select().from(conversationsTable).all() as Array<{ runStatus: string }>)[0].runStatus).toBe("idle")
    db.close()

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("persists the model picked at creation and updates it via setConversationModel", async () => {
    const userDataPath = createTempDir("teamcow-set-model-")
    const repoRoot = createTempDir("teamcow-set-model-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-05-17T08:00:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created result")
    }

    expect(created.conversation.currentModel).toBe("gpt-5.5")

    const updated = await service.setConversationModel({
      conversationId: created.conversation.id,
      model: "gpt-5.4-mini"
    })

    expect(updated.status).toBe("ok")
    if (updated.status !== "ok") {
      throw new Error("expected ok result")
    }

    expect(updated.conversation.currentModel).toBe("gpt-5.4-mini")
    expect(service.getCurrentConversation()?.currentModel).toBe("gpt-5.4-mini")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("updates the conversation access mode when the conversation is idle", async () => {
    const userDataPath = createTempDir("teamcow-set-access-mode-")
    const repoRoot = createTempDir("teamcow-set-access-mode-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      now: () => "2026-05-17T08:30:00.000Z"
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created result")
    }

    expect(created.conversation.accessMode).toBe("worktree-write")

    const updated = await service.setConversationAccessMode({
      conversationId: created.conversation.id,
      accessMode: "full-access"
    })

    expect(updated.status).toBe("ok")
    if (updated.status !== "ok") {
      throw new Error("expected ok result")
    }

    expect(updated.conversation.accessMode).toBe("full-access")
    expect(service.getCurrentConversation()?.accessMode).toBe("full-access")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("accepts provider-discovered models for creation and model changes", async () => {
    const userDataPath = createTempDir("teamcow-dynamic-model-")
    const repoRoot = createTempDir("teamcow-dynamic-model-repo-")
    makeGitRepo(repoRoot)
    const codexModels: ProviderModelOption[] = [
      {
        id: "gpt-5.5-preview",
        label: "gpt-5.5-preview",
        detail: "Configured Codex model via Modelgate.",
        source: "config-derived"
      }
    ]

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      listProviderModels: async (providerKind) => providerKind === "codex" ? codexModels : []
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })

    expect(created.status).toBe("created")
    if (created.status !== "created") {
      throw new Error("expected created result")
    }
    expect(created.conversation.currentModel).toBe("gpt-5.5")

    const updated = await service.setConversationModel({
      conversationId: created.conversation.id,
      model: "gpt-5.5-preview"
    })

    expect(updated.status).toBe("ok")
    if (updated.status !== "ok") {
      throw new Error("expected ok result")
    }
    expect(updated.conversation.currentModel).toBe("gpt-5.5-preview")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("rejects setConversationModel when the model does not belong to the conversation provider", async () => {
    const userDataPath = createTempDir("teamcow-set-model-invalid-")
    const repoRoot = createTempDir("teamcow-set-model-invalid-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created result")
    }

    const result = await service.setConversationModel({
      conversationId: created.conversation.id,
      model: "claude-sonnet-4-6"
    })

    expect(result.status).toBe("error")
    if (result.status !== "error") {
      throw new Error("expected error result")
    }

    expect(result.error.code).toBe("PROVIDER_NOT_READY")
    expect(service.getCurrentConversation()?.currentModel).toBe("gpt-5.5")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("renames a conversation and returns the updated summary", async () => {
    const userDataPath = createTempDir("teamcow-rename-convo-")
    const repoRoot = createTempDir("teamcow-rename-convo-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created result")
    }

    const renamed = await service.renameConversation({
      conversationId: created.conversation.id,
      title: "Renamed title"
    })

    expect(renamed.status).toBe("ok")
    if (renamed.status !== "ok") {
      throw new Error("expected ok result")
    }
    expect(renamed.conversation.title).toBe("Renamed title")
    expect(service.getCurrentConversation()?.title).toBe("Renamed title")

    const missing = await service.renameConversation({
      conversationId: "does-not-exist",
      title: "Whatever"
    })
    expect(missing.status).toBe("error")
    if (missing.status !== "error") {
      throw new Error("expected error result")
    }
    expect(missing.error.code).toBe("CONVERSATION_NOT_FOUND")

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("cascade-deletes conversation rows while preserving the worktree", async () => {
    const userDataPath = createTempDir("teamcow-delete-convo-")
    const repoRoot = createTempDir("teamcow-delete-convo-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }
    const worktreeId = imported.project.defaultWorktree.id

    seedConversation(userDataPath, {
      id: "convo-del",
      projectId: imported.project.id,
      title: "Doomed",
      worktreeId,
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "idle",
      createdAt: "2026-05-20T01:00:00.000Z",
      updatedAt: "2026-05-20T01:00:00.000Z"
    })

    const seedDb = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
    seedDb.db.insert(executionRunsTable).values({
      id: "run-del",
      conversationId: "convo-del",
      provider: "codex",
      model: "gpt-5.5",
      worktreeId,
      status: "completed",
      startedAt: "2026-05-20T01:01:00.000Z",
      completedAt: "2026-05-20T01:02:00.000Z",
      createdAt: "2026-05-20T01:01:00.000Z",
      updatedAt: "2026-05-20T01:02:00.000Z"
    }).run()
    seedDb.db.insert(conversationMessagesTable).values({
      id: "msg-del",
      conversationId: "convo-del",
      role: "user",
      content: "hi",
      model: "gpt-5.5",
      runId: "run-del",
      createdAt: "2026-05-20T01:01:00.000Z"
    }).run()
    seedDb.db.insert(runEventsTable).values({
      id: "event-del",
      conversationId: "convo-del",
      runId: "run-del",
      sequence: 1,
      type: "system.status",
      payload: "{\"status\":\"completed\"}",
      createdAt: "2026-05-20T01:01:30.000Z"
    }).run()
    seedDb.db.insert(artifactsTable).values({
      id: "artifact-del",
      conversationId: "convo-del",
      runId: "run-del",
      kind: "summary",
      title: "Result",
      uri: null,
      payload: "{\"changedFiles\":1}",
      createdAt: "2026-05-20T01:02:00.000Z"
    }).run()
    seedDb.close()

    const deleted = await service.deleteConversation({ conversationId: "convo-del" })
    expect(deleted.status).toBe("deleted")
    if (deleted.status !== "deleted") {
      throw new Error("expected deleted result")
    }
    expect(deleted.conversationId).toBe("convo-del")

    const db = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
    expect(db.db.select().from(conversationsTable).all()).toHaveLength(0)
    expect(db.db.select().from(conversationMessagesTable).all()).toHaveLength(0)
    expect(db.db.select().from(executionRunsTable).all()).toHaveLength(0)
    expect(db.db.select().from(runEventsTable).all()).toHaveLength(0)
    expect(db.db.select().from(artifactsTable).all()).toHaveLength(0)
    // Worktree is intentionally preserved.
    const worktrees = db.db.select().from(worktreesTable).all() as Array<{ id: string }>
    expect(worktrees.some((row) => row.id === worktreeId)).toBe(true)
    db.close()

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("clears the selection when the deleted conversation was current", async () => {
    const userDataPath = createTempDir("teamcow-delete-current-")
    const repoRoot = createTempDir("teamcow-delete-current-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    const created = await service.createConversation({
      projectId: imported.project.id,
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: { type: "default" }
    })
    if (created.status !== "created") {
      throw new Error("expected created result")
    }
    expect(service.getAppContext().selectedConversationId).toBe(created.conversation.id)

    const deleted = await service.deleteConversation({ conversationId: created.conversation.id })
    expect(deleted.status).toBe("deleted")
    if (deleted.status !== "deleted") {
      throw new Error("expected deleted result")
    }
    expect(deleted.context.selectedConversationId).toBeNull()
    expect(service.getCurrentConversation()).toBeNull()

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it("cancels a running provider run before deleting the conversation", async () => {
    const userDataPath = createTempDir("teamcow-delete-running-")
    const repoRoot = createTempDir("teamcow-delete-running-repo-")
    makeGitRepo(repoRoot)

    const service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null
    })

    const imported = await service.importProject({ directoryPath: repoRoot })
    if (imported.status !== "imported") {
      throw new Error("expected imported project")
    }

    seedConversation(userDataPath, {
      id: "convo-running",
      projectId: imported.project.id,
      title: "Running",
      worktreeId: imported.project.defaultWorktree.id,
      provider: "codex",
      currentModel: "gpt-5.5",
      runStatus: "running",
      createdAt: "2026-05-20T02:00:00.000Z",
      updatedAt: "2026-05-20T02:00:00.000Z"
    })

    const deleted = await service.deleteConversation({ conversationId: "convo-running" })
    expect(deleted.status).toBe("deleted")

    const db = createAppDatabase(join(userDataPath, "teamcow.sqlite"))
    expect(db.db.select().from(conversationsTable).all()).toHaveLength(0)
    db.close()

    service.close()
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  })
})
