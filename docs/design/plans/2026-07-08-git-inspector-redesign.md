# Git Inspector Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Inspector `Git` tab as a read-only repository context and commit history surface for the active conversation-bound worktree.

**Architecture:** Keep Git access in the Electron main process and expose it through the existing typed `teamcow:invoke` command path. Extend the existing conversation Git status contract with repository, identity, branch, and commit history data while keeping the renderer focused on presentation and local UI-only selection state. Use local `git` CLI commands only; do not add a Git npm dependency.

**Tech Stack:** Electron + React + TypeScript + electron-vite, zod shared contracts, Vitest, i18next, local Git CLI via `spawnSync`, Yarn workspaces.

## Global Constraints

- Use Chinese as the first interactive language with the user.
- Use `yarn`, not npm or pnpm.
- Do not create npm, pnpm, or alternate lockfiles.
- Renderer must not access `fs`, `git`, `pty`, `child_process`, or local provider processes directly.
- Renderer-to-main calls must use the preload `window.teamcow` API and the unified `teamcow:invoke` command path.
- Cross-IPC data must use zod schemas in `packages/shared-types/src/index.ts`.
- Git panel remains read-only: no commit, push, pull, fetch, checkout, branch creation, staging, or destructive Git action.
- User-visible text must be added to both `packages/i18n-resources/src/inspector/en.json` and `packages/i18n-resources/src/inspector/zh.json`.
- Provider output, file paths, branch names, remote URLs, commit subjects, commit hashes, and Git config values remain untranslated.
- Do not run `git commit` or equivalent commit operations without explicit user approval.
- Before completing implementation, run the checks that match the touched scope: `yarn workspace @teamcow/desktop test`, `yarn i18n:check`, and `yarn typecheck`.

---

## File Structure

- Modify `packages/shared-types/src/index.ts`
  - Add `GitCommitScope`, Git overview schemas, and `getConversationGitStatusInputSchema`.
  - Update `ConversationGitStatus` so the renderer receives repository, identity, branch, and commit data.
- Modify `apps/desktop/src/main/project-service.ts`
  - Keep hard failure handling around `git status`.
  - Add local, read-only Git helpers for remotes, upstream, identity, and logs.
  - Assemble the new Git overview result for a conversation-bound worktree.
- Modify `apps/desktop/src/main/desktop-router.ts`
  - Pass the full typed `getConversationGitStatus` input to the service instead of only `conversationId`.
- Modify `apps/desktop/src/main/preload/api.ts`
  - Keep the renderer API ergonomic: `getConversationGitStatus(conversationId, commitScope?)`.
- Modify `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
  - Replace Git changed-file rendering with repository, identity, branch, and commit history sections.
  - Add commit scope state and remote display selection state.
  - Keep pinned Inspector snapshot behavior.
- Modify `apps/desktop/src/renderer/styles.css`
  - Replace the current Git file/action styles with compact overview, select, status, and commit row styles.
- Modify `packages/i18n-resources/src/inspector/en.json`
  - Add English text for repository, identity, branch, dirty summary, remote selection, and commit history.
- Modify `packages/i18n-resources/src/inspector/zh.json`
  - Add matching Chinese text.
- Modify `apps/desktop/src/main/__tests__/shared-contracts.test.ts`
  - Cover the expanded zod contract and command input.
- Modify `apps/desktop/src/main/__tests__/desktop-router.test.ts`
  - Cover routing of `commitScope`.
- Modify `apps/desktop/src/main/__tests__/project-service.test.ts`
  - Cover remote selection, identity fallback, commit scope, and local section degradation.
- Modify `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`
  - Cover the redesigned Git panel and remove assumptions that Git lists changed files.

---

### Task 1: Shared Git Overview Contract

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/desktop/src/main/__tests__/shared-contracts.test.ts`

**Interfaces:**
- Produces: `gitCommitScopeSchema`, `type GitCommitScope`, `getConversationGitStatusInputSchema`, `type GetConversationGitStatusInput`.
- Produces: expanded `conversationGitStatusSchema` with `repository`, `identity`, `branch`, and `commits`.
- Consumed by: `desktop-router.ts`, `preload/api.ts`, `project-service.ts`, and `DesktopShell.tsx`.

- [ ] **Step 1: Write the failing shared contract test**

Add this case near the existing `parses conversation-bound git status contracts and desktop commands` test in `apps/desktop/src/main/__tests__/shared-contracts.test.ts`:

```ts
it("parses expanded conversation git overview contracts", () => {
  const gitStatus = conversationGitStatusSchema.parse({
    conversationId: "conversation-1",
    worktreeId: "worktree-1",
    worktreeRootPath: "/tmp/teamcow",
    worktreeKind: "default",
    repository: {
      remotes: [
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
      ],
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
      scope: "allRepository",
      items: [
        {
          hash: "2508d1f012345678901234567890123456789abc",
          shortHash: "2508d1f",
          subject: "fix: remove inspector execution targets",
          authorName: "Team Cow",
          authoredAt: "2026-07-08T08:17:33+08:00",
          relativeTime: "2 hours ago"
        }
      ],
      hasMore: true
    },
    checkedAt: "2026-07-08T08:30:00.000Z"
  })

  expect(gitStatus.repository.selectedRemoteName).toBe("origin")
  expect(gitStatus.identity.source).toBe("local")
  expect(gitStatus.branch.current).toBe("feature/git-panel")
  expect(gitStatus.commits.scope).toBe("allRepository")

  expect(getConversationGitStatusInputSchema.parse({
    conversationId: "conversation-1",
    commitScope: "currentBranch"
  })).toEqual({
    conversationId: "conversation-1",
    commitScope: "currentBranch"
  })

  expect(desktopCommandSchema.parse({
    type: "getConversationGitStatus",
    input: {
      conversationId: "conversation-1",
      commitScope: "allRepository"
    }
  }).input).toEqual({
    conversationId: "conversation-1",
    commitScope: "allRepository"
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/shared-contracts.test.ts
```

Expected: the new test fails because `getConversationGitStatusInputSchema` and the expanded Git overview fields do not exist yet.

- [ ] **Step 3: Add the shared schemas and types**

In `packages/shared-types/src/index.ts`, replace the current `conversationGitStatusSchema` block with this expanded contract. Keep `conversationGitFileStatusSchema` above it because existing parsing helpers and tests can still use file statuses internally.

```ts
export const gitCommitScopeSchema = z.enum(["currentBranch", "allRepository"])
export type GitCommitScope = z.infer<typeof gitCommitScopeSchema>

export const getConversationGitStatusInputSchema = z.object({
  conversationId: z.string().min(1),
  commitScope: gitCommitScopeSchema.optional()
})
export type GetConversationGitStatusInput = z.infer<typeof getConversationGitStatusInputSchema>

export const conversationGitRemoteSchema = z.object({
  name: z.string().min(1),
  url: z.string(),
  isUpstreamDefault: z.boolean()
})
export type ConversationGitRemote = z.infer<typeof conversationGitRemoteSchema>

export const conversationGitRepositorySchema = z.object({
  remotes: z.array(conversationGitRemoteSchema),
  selectedRemoteName: z.string().nullable(),
  selectedRemoteUrl: z.string().nullable(),
  upstreamRemoteName: z.string().nullable(),
  upstreamBranchName: z.string().nullable()
})
export type ConversationGitRepository = z.infer<typeof conversationGitRepositorySchema>

export const conversationGitIdentitySchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  source: z.enum(["local", "global", "unset"])
})
export type ConversationGitIdentity = z.infer<typeof conversationGitIdentitySchema>

export const conversationGitBranchSchema = z.object({
  current: z.string().nullable(),
  recorded: z.string().nullable(),
  upstream: z.string().nullable(),
  isClean: z.boolean(),
  changedCount: z.number().int().nonnegative()
})
export type ConversationGitBranch = z.infer<typeof conversationGitBranchSchema>

export const conversationGitCommitSchema = z.object({
  hash: z.string().min(1),
  shortHash: z.string().min(1),
  subject: z.string(),
  authorName: z.string(),
  authoredAt: z.string(),
  relativeTime: z.string()
})
export type ConversationGitCommit = z.infer<typeof conversationGitCommitSchema>

export const conversationGitCommitsSchema = z.object({
  scope: gitCommitScopeSchema,
  items: z.array(conversationGitCommitSchema),
  hasMore: z.boolean()
})
export type ConversationGitCommits = z.infer<typeof conversationGitCommitsSchema>

export const conversationGitStatusSchema = z.object({
  conversationId: z.string(),
  worktreeId: z.string(),
  worktreeRootPath: z.string(),
  worktreeKind: worktreeKindSchema,
  repository: conversationGitRepositorySchema,
  identity: conversationGitIdentitySchema,
  branch: conversationGitBranchSchema,
  commits: conversationGitCommitsSchema,
  checkedAt: z.string()
})
export type ConversationGitStatus = z.infer<typeof conversationGitStatusSchema>
```

Update the desktop command schema entry:

```ts
z.object({
  type: z.literal("getConversationGitStatus"),
  input: getConversationGitStatusInputSchema
}),
```

Update the desktop API type:

```ts
getConversationGitStatus: (
  conversationId: string,
  commitScope?: GitCommitScope
) => Promise<GetConversationGitStatusResult>
```

- [ ] **Step 4: Update the older shared contract test**

Replace the old Git status fixture in `apps/desktop/src/main/__tests__/shared-contracts.test.ts` with the expanded shape from Step 1. Keep the assertions that parse `GIT_STATUS_FAILED`, `GIT_STATUS_PARSE_FAILED`, and `getConversationGitStatusResultSchema`.

- [ ] **Step 5: Run the shared contract test again**

Run:

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/shared-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint only after approval**

Ask the user: `May I commit Task 1 shared contract changes?`

If the user explicitly approves, run:

```bash
git add packages/shared-types/src/index.ts apps/desktop/src/main/__tests__/shared-contracts.test.ts
git commit -m "feat: expand git inspector contract"
```

Expected: commit succeeds. If the user does not approve, leave changes unstaged.

---

### Task 2: Main Process Git Readers And Parsers

**Files:**
- Modify: `apps/desktop/src/main/project-service.ts`
- Modify: `apps/desktop/src/main/__tests__/project-service.test.ts`

**Interfaces:**
- Consumes: `GetConversationGitStatusInput`, `GitCommitScope`, `ConversationGitCommit`, `ConversationGitRepository`, and `ConversationGitIdentity` from shared types.
- Produces: local helpers `readGitCommandFromHost`, `parseGitRemotes`, `parseGitUpstream`, `readGitIdentity`, `parseGitLog`, and `selectGitRemote`.
- Produces: `ProjectServiceDeps.readGitCommand?: (worktreeRootPath: string, args: string[]) => GitCommandReadResult`.

- [ ] **Step 1: Add failing main service tests for repository overview**

In `apps/desktop/src/main/__tests__/project-service.test.ts`, add this test after the existing dirty Git status test:

```ts
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
        code: "GIT_STATUS_FAILED",
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

  const result = service.getConversationGitStatus({
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

  service.close()
  rmSync(userDataPath, { recursive: true, force: true })
  rmSync(repoRoot, { recursive: true, force: true })
})
```

- [ ] **Step 2: Add failing fallback and scope tests**

Add two smaller tests in the same file:

```ts
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
          code: "GIT_STATUS_FAILED",
          message: "no upstream",
          suggestion: null
        }
      }
    }
    if (key.startsWith("config\0")) {
      return {
        status: "error" as const,
        error: {
          code: "GIT_STATUS_FAILED",
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
        code: "GIT_STATUS_FAILED",
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

  const result = service.getConversationGitStatus("conversation-git-remote-fallback")
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

it("uses HEAD for current-branch commit scope", async () => {
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

  service.getConversationGitStatus({
    conversationId: "conversation-git-current-branch",
    commitScope: "currentBranch"
  })

  expect(readGitCommand).toHaveBeenCalledWith(realpathSync(repoRoot), [
    "log",
    "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1f%ar%x1e",
    "-n",
    "31",
    "HEAD"
  ])

  service.close()
  rmSync(userDataPath, { recursive: true, force: true })
  rmSync(repoRoot, { recursive: true, force: true })
})
```

- [ ] **Step 3: Run the focused service tests and verify they fail**

Run:

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/project-service.test.ts --testNamePattern "Git overview|remote fallback|current-branch commit scope"
```

Expected: FAIL because `readGitCommand`, the expanded input shape, and overview assembly are missing.

- [ ] **Step 4: Add the Git command runner dependency and host helper**

In `apps/desktop/src/main/project-service.ts`, add this type next to `GitStatusReadResult`:

```ts
type GitCommandReadResult = GitStatusReadResult
type GitCommandRunner = (worktreeRootPath: string, args: string[]) => GitCommandReadResult
```

Add this optional dependency to `ProjectServiceDeps`:

```ts
readGitCommand?: GitCommandRunner
```

Add this host helper near `readGitStatusFromHost`:

```ts
const readGitCommandFromHost: GitCommandRunner = (worktreeRootPath, args) => {
  const result = spawnSync("git", ["-C", worktreeRootPath, ...args], {
    encoding: "utf8",
    timeout: 5000
  })

  if (result.error) {
    const nodeError = result.error as NodeJS.ErrnoException
    if (nodeError.code === "ENOENT") {
      return {
        status: "error",
        error: buildAppError("GIT_NOT_INSTALLED", "git is required to read worktree status")
      }
    }

    return {
      status: "error",
      error: buildAppError("GIT_STATUS_FAILED", `git ${args.join(" ")} failed for ${worktreeRootPath}`, result.error.message)
    }
  }

  if (result.status !== 0) {
    return {
      status: "error",
      error: buildAppError(
        "GIT_STATUS_FAILED",
        `git ${args.join(" ")} failed for ${worktreeRootPath}`,
        result.stderr || result.stdout || null
      )
    }
  }

  return {
    status: "ok",
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  }
}
```

- [ ] **Step 5: Add pure parsing helpers**

In `apps/desktop/src/main/project-service.ts`, below `parseGitStatusBranch`, add:

```ts
const gitLogFormat = "%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1f%ar%x1e"
const gitLogLimit = 31
const gitLogDisplayLimit = 30

const parseGitRemoteRows = (stdout: string, upstreamRemoteName: string | null) => {
  const remotesByName = new Map<string, { name: string; url: string; isUpstreamDefault: boolean }>()

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const match = /^([^\s]+)\s+(.+?)\s+\((fetch|push)\)$/.exec(trimmed)
    if (!match) {
      continue
    }

    const [, name, url, direction] = match
    if (!name || !url) {
      continue
    }

    const existing = remotesByName.get(name)
    if (!existing || direction === "fetch") {
      remotesByName.set(name, {
        name,
        url,
        isUpstreamDefault: upstreamRemoteName === name
      })
    }
  }

  return Array.from(remotesByName.values())
}

const parseGitUpstream = (stdout: string) => {
  const upstream = stdout.trim()
  if (!upstream) {
    return {
      upstream: null,
      upstreamRemoteName: null,
      upstreamBranchName: null
    }
  }

  const slashIndex = upstream.indexOf("/")
  if (slashIndex <= 0 || slashIndex === upstream.length - 1) {
    return {
      upstream,
      upstreamRemoteName: null,
      upstreamBranchName: upstream
    }
  }

  return {
    upstream,
    upstreamRemoteName: upstream.slice(0, slashIndex),
    upstreamBranchName: upstream.slice(slashIndex + 1)
  }
}

const selectGitRemote = (
  remotes: Array<{ name: string; url: string; isUpstreamDefault: boolean }>,
  upstreamRemoteName: string | null
) => {
  const selected = remotes.find((remote) => remote.name === upstreamRemoteName)
    ?? remotes.find((remote) => remote.name === "origin")
    ?? remotes[0]
    ?? null

  return {
    selectedRemoteName: selected?.name ?? null,
    selectedRemoteUrl: selected?.url ?? null
  }
}

const parseGitLog = (stdout: string, scope: GitCommitScope) => {
  const commits = stdout
    .split("\u001e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash = "", shortHash = "", subject = "", authorName = "", authoredAt = "", relativeTime = ""] = record.split("\u001f")
      return {
        hash,
        shortHash,
        subject,
        authorName,
        authoredAt,
        relativeTime
      }
    })
    .filter((commit) => commit.hash.length > 0 && commit.shortHash.length > 0)

  return {
    scope,
    items: commits.slice(0, gitLogDisplayLimit),
    hasMore: commits.length > gitLogDisplayLimit
  }
}
```

Add `GitCommitScope` to the shared type imports at the top of the file.

- [ ] **Step 6: Add optional readers for identity, remotes, upstream, and log**

In `getConversationGitStatus`, define:

```ts
const readGitCommand = deps.readGitCommand ?? readGitCommandFromHost
```

Use these local reads after the hard `git status` success:

```ts
const commitScope = normalizedInput.commitScope ?? "allRepository"
const upstreamResult = readGitCommand(worktree.rootPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
const upstream = upstreamResult.status === "ok" ? parseGitUpstream(upstreamResult.stdout) : parseGitUpstream("")

const remotesResult = readGitCommand(worktree.rootPath, ["remote", "-v"])
const remotes = remotesResult.status === "ok"
  ? parseGitRemoteRows(remotesResult.stdout, upstream.upstreamRemoteName)
  : []
const selectedRemote = selectGitRemote(remotes, upstream.upstreamRemoteName)

const localName = readGitCommand(worktree.rootPath, ["config", "--local", "user.name"])
const localEmail = readGitCommand(worktree.rootPath, ["config", "--local", "user.email"])
const globalName = localName.status === "ok" && localName.stdout.trim()
  ? null
  : readGitCommand(worktree.rootPath, ["config", "--global", "user.name"])
const globalEmail = localEmail.status === "ok" && localEmail.stdout.trim()
  ? null
  : readGitCommand(worktree.rootPath, ["config", "--global", "user.email"])
const identityName = localName.status === "ok" && localName.stdout.trim()
  ? localName.stdout.trim()
  : globalName?.status === "ok"
    ? globalName.stdout.trim() || null
    : null
const identityEmail = localEmail.status === "ok" && localEmail.stdout.trim()
  ? localEmail.stdout.trim()
  : globalEmail?.status === "ok"
    ? globalEmail.stdout.trim() || null
    : null
const identitySource = localName.status === "ok" && localName.stdout.trim() || localEmail.status === "ok" && localEmail.stdout.trim()
  ? "local"
  : identityName || identityEmail
    ? "global"
    : "unset"

const logArgs = commitScope === "currentBranch"
  ? ["log", `--format=${gitLogFormat}`, "-n", String(gitLogLimit), "HEAD"]
  : ["log", "--all", `--format=${gitLogFormat}`, "-n", String(gitLogLimit)]
const logResult = readGitCommand(worktree.rootPath, logArgs)
const commits = logResult.status === "ok"
  ? parseGitLog(logResult.stdout, commitScope)
  : { scope: commitScope, items: [], hasMore: false }
```

This exact inline code may need formatting from the project linter. Preserve its behavior: optional section failures produce empty or unset section values instead of failing the whole response.

- [ ] **Step 7: Normalize service input and assemble the overview**

Change the service function signature:

```ts
const getConversationGitStatus = (input: GetConversationGitStatusInput | string): GetConversationGitStatusResult => {
  const normalizedInput = typeof input === "string" ? { conversationId: input } : input
  const conversationId = normalizedInput.conversationId
  ...
}
```

Replace the old returned `git` object with:

```ts
git: conversationGitStatusSchema.parse({
  conversationId,
  worktreeId: worktree.id,
  worktreeRootPath: worktree.rootPath,
  worktreeKind: worktree.kind,
  repository: {
    remotes,
    selectedRemoteName: selectedRemote.selectedRemoteName,
    selectedRemoteUrl: selectedRemote.selectedRemoteUrl,
    upstreamRemoteName: upstream.upstreamRemoteName,
    upstreamBranchName: upstream.upstreamBranchName
  },
  identity: {
    name: identityName,
    email: identityEmail,
    source: identitySource
  },
  branch: {
    current: parseGitStatusBranch(gitStatus.stdout) ?? worktree.branch,
    recorded: worktree.branch,
    upstream: upstream.upstream,
    isClean: files.length === 0,
    changedCount: files.length
  },
  commits,
  checkedAt: now()
})
```

Add `GetConversationGitStatusInput` and `GitCommitScope` to the shared type imports.

- [ ] **Step 8: Run focused main service tests**

Run:

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/project-service.test.ts --testNamePattern "Git overview|remote fallback|current-branch commit scope"
```

Expected: PASS.

- [ ] **Step 9: Run all project service tests**

Run:

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/project-service.test.ts
```

Expected: PASS. Update older Git status assertions so they check `git.branch.current`, `git.branch.changedCount`, and `git.branch.isClean` instead of removed top-level status fields.

- [ ] **Step 10: Commit checkpoint only after approval**

Ask the user: `May I commit Task 2 main Git overview changes?`

If the user explicitly approves, run:

```bash
git add apps/desktop/src/main/project-service.ts apps/desktop/src/main/__tests__/project-service.test.ts
git commit -m "feat: collect git repository overview"
```

Expected: commit succeeds. If the user does not approve, leave changes unstaged.

---

### Task 3: IPC, Router, And Preload Wiring

**Files:**
- Modify: `apps/desktop/src/main/desktop-router.ts`
- Modify: `apps/desktop/src/main/preload/api.ts`
- Modify: `apps/desktop/src/main/__tests__/desktop-router.test.ts`
- Modify: `packages/shared-types/src/index.ts` only if Task 1 missed an API type reference.

**Interfaces:**
- Consumes: `getConversationGitStatusInputSchema` and `GitCommitScope`.
- Produces: `window.teamcow.getConversationGitStatus(conversationId, commitScope?)`.

- [ ] **Step 1: Write the failing router test**

In `apps/desktop/src/main/__tests__/desktop-router.test.ts`, update the existing `routes getConversationGitStatus commands through the project service` test so it sends `commitScope`:

```ts
const result = await routeDesktopCommand({
  type: "getConversationGitStatus",
  input: {
    conversationId: "conversation-1",
    commitScope: "currentBranch"
  }
}, {
  projectService: {
    ...projectService,
    getConversationGitStatus
  }
})

expect(getConversationGitStatus).toHaveBeenCalledWith({
  conversationId: "conversation-1",
  commitScope: "currentBranch"
})
expect(result.status).toBe("ok")
```

Make the mocked `getConversationGitStatus` return the expanded Git overview shape from Task 1.

- [ ] **Step 2: Run the router test and verify it fails**

Run:

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/desktop-router.test.ts --testNamePattern "getConversationGitStatus"
```

Expected: FAIL because the router still passes only `command.input.conversationId`.

- [ ] **Step 3: Route the full input object**

In `apps/desktop/src/main/desktop-router.ts`, change:

```ts
services.projectService.getConversationGitStatus(command.input.conversationId)
```

to:

```ts
services.projectService.getConversationGitStatus(command.input)
```

- [ ] **Step 4: Update the preload API**

In `apps/desktop/src/main/preload/api.ts`, change:

```ts
async getConversationGitStatus(conversationId) {
  return invokeDesktopCommand({ type: "getConversationGitStatus", input: { conversationId } })
},
```

to:

```ts
async getConversationGitStatus(conversationId, commitScope) {
  return invokeDesktopCommand({
    type: "getConversationGitStatus",
    input: { conversationId, commitScope }
  })
},
```

- [ ] **Step 5: Run router and shared contract tests**

Run:

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/desktop-router.test.ts --testNamePattern "getConversationGitStatus"
yarn workspace @teamcow/desktop test src/main/__tests__/shared-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint only after approval**

Ask the user: `May I commit Task 3 IPC wiring changes?`

If the user explicitly approves, run:

```bash
git add apps/desktop/src/main/desktop-router.ts apps/desktop/src/main/preload/api.ts apps/desktop/src/main/__tests__/desktop-router.test.ts packages/shared-types/src/index.ts
git commit -m "feat: route git overview scope"
```

Expected: commit succeeds. If the user does not approve, leave changes unstaged.

---

### Task 4: Renderer State And Data Flow

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
- Modify: `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`

**Interfaces:**
- Consumes: `ConversationGitStatus` with `repository`, `identity`, `branch`, and `commits`.
- Produces: renderer state `gitCommitScope` and selected remote display state.
- Produces: scope-aware calls to `window.teamcow.getConversationGitStatus(conversationId, gitCommitScope)`.

- [ ] **Step 1: Update the renderer Git fixture**

Replace `dirtyGitStatus` in `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx` with an expanded fixture:

```ts
const dirtyGitStatus = (
  conversationId = "conversation-2",
  overrides: Partial<Extract<GetConversationGitStatusResult, { status: "ok" }>["git"]> = {}
): GetConversationGitStatusResult => {
  const git: Extract<GetConversationGitStatusResult, { status: "ok" }>["git"] = {
    conversationId,
    worktreeId: "worktree-1",
    worktreeRootPath: "/tmp/teamcow",
    worktreeKind: "default",
    repository: {
      remotes: [
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
      ],
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
      current: "feat/git-panel",
      recorded: "main",
      upstream: "origin/main",
      isClean: false,
      changedCount: 3
    },
    commits: {
      scope: "allRepository",
      items: [
        {
          hash: "2508d1f012345678901234567890123456789abc",
          shortHash: "2508d1f",
          subject: "fix: remove inspector execution targets",
          authorName: "Team Cow",
          authoredAt: "2026-07-08T08:17:33+08:00",
          relativeTime: "2 hours ago"
        },
        {
          hash: "6e1123a012345678901234567890123456789abc",
          shortHash: "6e1123a",
          subject: "fix: avoid redundant mermaid renders",
          authorName: "Team Cow",
          authoredAt: "2026-07-08T07:17:33+08:00",
          relativeTime: "3 hours ago"
        }
      ],
      hasMore: false
    },
    checkedAt: "2026-07-08T08:30:00.000Z",
    ...overrides
  }

  return {
    status: "ok",
    git
  }
}
```

- [ ] **Step 2: Write failing renderer tests for new data flow**

Replace the existing `renders git status for the conversation-bound worktree` expectations with:

```ts
expect(gitPanel?.textContent).toContain("feat/git-panel")
expect(gitPanel?.textContent).toContain("Dirty")
expect(gitPanel?.textContent).toContain("git@github.com:teamcow/teamcow.git")
expect(gitPanel?.textContent).toContain("Team Cow")
expect(gitPanel?.textContent).toContain("dev@teamcow.local")
expect(gitPanel?.textContent).toContain("origin/main")
expect(gitPanel?.textContent).toContain("fix: remove inspector execution targets")
expect(gitPanel?.textContent).toContain("2508d1f")
expect(gitPanel?.textContent).toContain("2 hours ago")
expect(gitPanel?.textContent).toContain("Review Diff")
expect(gitPanel?.textContent).not.toContain("project-service.ts")
expect(gitPanel?.textContent).not.toContain("modified")
expect(window.teamcow.getConversationGitStatus).toHaveBeenCalledWith("conversation-2", "allRepository")
```

Add a scope switching test:

```ts
it("reloads Git commits when the commit scope changes", async () => {
  window.teamcow.getAppContext = vi.fn(async () => selectionContext)
  window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
    status: "ok",
    timeline: inspectorFilesTimeline(conversationId)
  }))
  window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string, scope = "allRepository"): Promise<GetConversationGitStatusResult> =>
    dirtyGitStatus(conversationId, {
      commits: {
        scope,
        items: [
          {
            hash: scope === "currentBranch"
              ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            shortHash: scope === "currentBranch" ? "aaaaaaa" : "bbbbbbb",
            subject: scope === "currentBranch" ? "feat: branch commit" : "chore: repository commit",
            authorName: "Team Cow",
            authoredAt: "2026-07-08T08:17:33+08:00",
            relativeTime: "2 hours ago"
          }
        ],
        hasMore: false
      }
    })
  )

  const container = document.createElement("div")
  document.body.appendChild(container)

  const root = await renderWithI18n(container, <DesktopShell />)
  await clickElement(getByTestId(container, "inspector-tab-git"))
  expect(getByTestId(container, "inspector-git-panel")?.textContent).toContain("chore: repository commit")

  await clickElement(getByTestId(container, "git-commit-scope-currentBranch"))

  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(window.teamcow.getConversationGitStatus).toHaveBeenCalledWith("conversation-2", "currentBranch")
  expect(getByTestId(container, "inspector-git-panel")?.textContent).toContain("feat: branch commit")

  await act(async () => {
    root.unmount()
  })
  container.remove()
})
```

Add a remote selection test:

```ts
it("switches displayed Git remote without reloading Git data", async () => {
  window.teamcow.getAppContext = vi.fn(async () => selectionContext)
  window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
    status: "ok",
    timeline: inspectorFilesTimeline(conversationId)
  }))
  window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
    dirtyGitStatus(conversationId)
  )

  const container = document.createElement("div")
  document.body.appendChild(container)

  const root = await renderWithI18n(container, <DesktopShell />)
  await clickElement(getByTestId(container, "inspector-tab-git"))
  const callsBefore = (window.teamcow.getConversationGitStatus as ReturnType<typeof vi.fn>).mock.calls.length

  const remoteSelect = getByTestId(container, "git-remote-select") as HTMLSelectElement | null
  await act(async () => {
    if (!remoteSelect) {
      throw new Error("expected remote select")
    }
    remoteSelect.value = "backup"
    remoteSelect.dispatchEvent(new Event("change", { bubbles: true }))
  })

  expect(getByTestId(container, "inspector-git-panel")?.textContent).toContain("git@example.com:teamcow/teamcow.git")
  expect((window.teamcow.getConversationGitStatus as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)

  await act(async () => {
    root.unmount()
  })
  container.remove()
})
```

- [ ] **Step 3: Run the renderer tests and verify they fail**

Run:

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/__tests__/DesktopShell.test.tsx --testNamePattern "git"
```

Expected: FAIL because `DesktopShell` still expects the old status shape and renders changed files/actions.

- [ ] **Step 4: Add renderer state for commit scope and remote display**

In `DesktopShell.tsx`, add state near the Git status state:

```ts
const [gitCommitScope, setGitCommitScope] = useState<GitCommitScope>("allRepository")
const [selectedGitRemoteName, setSelectedGitRemoteName] = useState<string | null>(null)
```

Add `GitCommitScope` to the type imports from `@shared/index`.

Reset remote display when the loaded Git status changes:

```ts
useEffect(() => {
  setSelectedGitRemoteName(conversationGitStatus?.repository.selectedRemoteName ?? null)
}, [conversationGitStatus?.repository.selectedRemoteName, conversationGitStatus?.conversationId])
```

- [ ] **Step 5: Make Git status fetching scope-aware**

Change the fetch call:

```ts
void window.teamcow.getConversationGitStatus(conversationId, gitCommitScope)
```

Add `gitCommitScope` to the effect dependency array.

When active conversation changes, reset the scope:

```ts
setGitCommitScope("allRepository")
```

Place that reset in the existing context-change path that clears Git state when the active conversation becomes empty or changes.

- [ ] **Step 6: Add small display helpers**

Replace `getInspectorGitFileDisplayName` and `getInspectorGitStatusLabel` usage with helpers for the new panel:

```ts
const getGitIdentityLabel = (
  identity: ConversationGitStatus["identity"],
  tInspector: (key: string, opts?: Record<string, unknown>) => string
) => {
  if (identity.name && identity.email) {
    return `${identity.name} <${identity.email}>`
  }

  if (identity.name) {
    return identity.name
  }

  if (identity.email) {
    return identity.email
  }

  return tInspector("git.identity.unset")
}

const getGitIdentitySourceLabel = (
  source: ConversationGitStatus["identity"]["source"],
  tInspector: (key: string, opts?: Record<string, unknown>) => string
) => tInspector(`git.identity.source.${source}`)
```

Remove unused Git file helper imports or functions after the panel no longer renders files.

- [ ] **Step 7: Run renderer Git tests**

Run:

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/__tests__/DesktopShell.test.tsx --testNamePattern "git"
```

Expected: failures now point to missing JSX and i18n text, not data fetching.

- [ ] **Step 8: Commit checkpoint only after approval**

Ask the user: `May I commit Task 4 renderer data-flow changes?`

If the user explicitly approves, run:

```bash
git add apps/desktop/src/renderer/app/shell/DesktopShell.tsx apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx
git commit -m "feat: load git overview in inspector"
```

Expected: commit succeeds. If the user does not approve, leave changes unstaged.

---

### Task 5: Git Panel UI, Styles, And Read-Only Boundary

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
- Modify: `apps/desktop/src/renderer/styles.css`
- Modify: `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`

**Interfaces:**
- Consumes: Task 4 renderer state.
- Produces: `data-testid="git-remote-select"`, `data-testid="git-commit-scope-currentBranch"`, `data-testid="git-commit-scope-allRepository"`, and compact commit rows.

- [ ] **Step 1: Replace the Git panel JSX**

In `DesktopShell.tsx`, replace the old `inspector-git-summary`, `inspector-git-stats`, `inspector-git-files`, and `inspector-git-actions` block with this structure:

```tsx
{inspectedGitStatus ? (
  <>
    <div className="inspector-git-overview">
      <div className="inspector-git-status-row">
        <span>{inspectedGitStatus.branch.current ?? tInspector("git.branch-unknown")}</span>
        <strong className={inspectedGitStatus.branch.isClean ? "clean" : "dirty"}>
          {inspectedGitStatus.branch.isClean ? tInspector("git.clean") : tInspector("git.dirty")}
        </strong>
      </div>
      {!inspectedGitStatus.branch.isClean ? (
        <p className="inspector-git-note">
          {tInspector("git.dirty-note", { count: inspectedGitStatus.branch.changedCount })}
          {" "}
          <button className="inspector-inline-link" type="button" onClick={openInspectorDiff}>
            {tInspector("git.actions.review-diff")}
          </button>
        </p>
      ) : null}
    </div>

    <section className="inspector-git-section">
      <div className="inspector-git-section-title">
        <strong>{tInspector("git.repository.title")}</strong>
      </div>
      {inspectedGitStatus.repository.remotes.length > 0 ? (
        <>
          <select
            className="inspector-git-select"
            data-testid="git-remote-select"
            value={selectedGitRemoteName ?? inspectedGitStatus.repository.selectedRemoteName ?? ""}
            onChange={(event) => setSelectedGitRemoteName(event.currentTarget.value || null)}
          >
            {inspectedGitStatus.repository.remotes.map((remote) => (
              <option key={remote.name} value={remote.name}>
                {remote.name}
              </option>
            ))}
          </select>
          <code className="inspector-git-url" title={selectedGitRemote?.url ?? inspectedGitStatus.repository.selectedRemoteUrl ?? ""}>
            {selectedGitRemote?.url ?? inspectedGitStatus.repository.selectedRemoteUrl ?? tInspector("git.repository.no-remote")}
          </code>
        </>
      ) : (
        <p className="inspector-files-message">{tInspector("git.repository.no-remote")}</p>
      )}
    </section>

    <section className="inspector-git-section">
      <div className="inspector-git-section-title">
        <strong>{tInspector("git.identity.title")}</strong>
        <span>{getGitIdentitySourceLabel(inspectedGitStatus.identity.source, tInspector)}</span>
      </div>
      <code className="inspector-git-url">{getGitIdentityLabel(inspectedGitStatus.identity, tInspector)}</code>
    </section>

    <section className="inspector-git-section">
      <div className="inspector-git-section-title">
        <strong>{tInspector("git.branch")}</strong>
      </div>
      <div className="inspector-git-kv">
        <span>{tInspector("git.branch.current")}</span>
        <strong>{inspectedGitStatus.branch.current ?? tInspector("git.branch-unknown")}</strong>
      </div>
      <div className="inspector-git-kv">
        <span>{tInspector("git.branch.upstream")}</span>
        <strong>{inspectedGitStatus.branch.upstream ?? tInspector("git.branch.no-upstream")}</strong>
      </div>
      {inspectedGitStatus.branch.current &&
        inspectedGitStatus.branch.recorded &&
        inspectedGitStatus.branch.current !== inspectedGitStatus.branch.recorded ? (
        <p className="inspector-git-mismatch">
          {tInspector("git.recorded-branch", { branch: inspectedGitStatus.branch.recorded })}
        </p>
      ) : null}
    </section>

    <section className="inspector-git-section">
      <div className="inspector-git-section-title">
        <strong>{tInspector("git.commits.title")}</strong>
      </div>
      <div className="inspector-git-scope" role="group" aria-label={tInspector("git.commits.scope")}>
        <button
          type="button"
          data-testid="git-commit-scope-allRepository"
          className={gitCommitScope === "allRepository" ? "active" : ""}
          onClick={() => setGitCommitScope("allRepository")}
        >
          {tInspector("git.commits.scope.all")}
        </button>
        <button
          type="button"
          data-testid="git-commit-scope-currentBranch"
          className={gitCommitScope === "currentBranch" ? "active" : ""}
          onClick={() => setGitCommitScope("currentBranch")}
        >
          {tInspector("git.commits.scope.current")}
        </button>
      </div>
      {inspectedGitStatus.commits.items.length > 0 ? (
        <div className="inspector-git-commits">
          {inspectedGitStatus.commits.items.map((commit) => (
            <div className="inspector-git-commit-row" key={commit.hash}>
              <strong title={commit.subject}>{commit.subject}</strong>
              <span>
                <code>{commit.shortHash}</code>
                {" · "}
                {commit.authorName}
                {" · "}
                {commit.relativeTime}
              </span>
            </div>
          ))}
          {inspectedGitStatus.commits.hasMore ? (
            <p className="inspector-git-note">{tInspector("git.commits.showing-latest", { count: 30 })}</p>
          ) : null}
        </div>
      ) : (
        <p className="inspector-files-message">{tInspector("git.commits.empty")}</p>
      )}
    </section>
  </>
) : (
  <p className="inspector-files-message">{tInspector("git.empty")}</p>
)}
```

Before this JSX, compute the selected remote:

```ts
const selectedGitRemote = inspectedGitStatus?.repository.remotes.find((remote) =>
  remote.name === selectedGitRemoteName
) ?? null
```

- [ ] **Step 2: Remove old Git action assertions**

Delete or rewrite the test named `offers git next actions and opens the inspected worktree and terminal through host handoff`. Replace it with an assertion that the Git panel is read-only:

```ts
it("keeps the Git panel read-only and leaves handoff controls out of the panel", async () => {
  window.teamcow.getAppContext = vi.fn(async () => selectionContext)
  window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
    status: "ok",
    timeline: inspectorDiffTimeline(conversationId)
  }))
  window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
    dirtyGitStatus(conversationId)
  )

  const container = document.createElement("div")
  document.body.appendChild(container)

  const root = await renderWithI18n(container, <DesktopShell />)
  await clickElement(getByTestId(container, "inspector-tab-git"))

  const gitPanel = getByTestId(container, "inspector-git-panel")
  expect(gitPanel?.textContent).toContain("Review Diff")
  expect(getByTestId(container, "git-action-open-editor")).toBeNull()
  expect(getByTestId(container, "git-action-open-terminal")).toBeNull()
  expect(getByTestId(container, "git-action-open-worktree")).toBeNull()

  await act(async () => {
    root.unmount()
  })
  container.remove()
})
```

- [ ] **Step 3: Add compact Git panel styles**

In `apps/desktop/src/renderer/styles.css`, replace the old `.inspector-git-summary`, `.inspector-git-stats`, `.inspector-git-files`, `.inspector-git-file-row`, `.inspector-git-action`, and `.inspector-git-action-note` rules with:

```css
.inspector-git-overview,
.inspector-git-section {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.inspector-git-section {
  padding: 8px;
  background: var(--surface-hover);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.inspector-git-status-row,
.inspector-git-section-title,
.inspector-git-kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.inspector-git-status-row span,
.inspector-git-section-title strong,
.inspector-git-kv strong,
.inspector-git-commit-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-git-status-row strong {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  text-transform: uppercase;
}

.inspector-git-status-row strong.clean {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
}

.inspector-git-status-row strong.dirty {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.inspector-git-section-title span,
.inspector-git-kv span,
.inspector-git-commit-row span {
  color: var(--text-tertiary);
  font-size: 11px;
}

.inspector-git-select {
  width: 100%;
  min-height: 30px;
  color: var(--text-primary);
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font: inherit;
}

.inspector-git-url {
  min-width: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-inline-link {
  padding: 0;
  color: var(--accent);
  background: transparent;
  border: 0;
  font: inherit;
  text-decoration: underline;
}

.inspector-git-scope {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 3px;
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.inspector-git-scope button {
  min-height: 26px;
  color: var(--text-tertiary);
  background: transparent;
  border: 0;
  border-radius: 4px;
  font-size: 11px;
}

.inspector-git-scope button.active {
  color: var(--text-primary);
  background: var(--accent-bg);
}

.inspector-git-commits {
  display: grid;
  gap: 6px;
}

.inspector-git-commit-row {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 7px;
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.inspector-git-commit-row code {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 10px;
}
```

If `--success`, `--warning`, or `--accent` do not exist in `styles.css`, use the existing semantic tokens already present in that file. Do not introduce a new color palette.

- [ ] **Step 4: Run renderer Git tests**

Run:

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/__tests__/DesktopShell.test.tsx --testNamePattern "git"
```

Expected: failures now only concern missing i18n keys or old tests that still expect removed Git file/action content.

- [ ] **Step 5: Commit checkpoint only after approval**

Ask the user: `May I commit Task 5 Git panel UI changes?`

If the user explicitly approves, run:

```bash
git add apps/desktop/src/renderer/app/shell/DesktopShell.tsx apps/desktop/src/renderer/styles.css apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx
git commit -m "feat: redesign git inspector panel"
```

Expected: commit succeeds. If the user does not approve, leave changes unstaged.

---

### Task 6: Inspector i18n Copy

**Files:**
- Modify: `packages/i18n-resources/src/inspector/en.json`
- Modify: `packages/i18n-resources/src/inspector/zh.json`
- Modify: `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx` only if test expectations need localized strings updated.

**Interfaces:**
- Consumes: `tInspector("git.*")` keys used by Tasks 4 and 5.
- Produces: complete English and Chinese text for the redesigned Git panel.

- [ ] **Step 1: Add English keys**

In `packages/i18n-resources/src/inspector/en.json`, add:

```json
{
  "git.dirty-note": "{{count}} local changes in this worktree.",
  "git.repository.title": "Repository",
  "git.repository.remote": "Remote",
  "git.repository.no-remote": "No remotes configured",
  "git.identity.title": "Identity",
  "git.identity.unset": "Commit identity not configured",
  "git.identity.source.local": "Local config",
  "git.identity.source.global": "Global config",
  "git.identity.source.unset": "Not configured",
  "git.branch.current": "Current",
  "git.branch.upstream": "Upstream",
  "git.branch.no-upstream": "No upstream",
  "git.commits.title": "Commit history",
  "git.commits.scope": "Commit history scope",
  "git.commits.scope.current": "Current branch",
  "git.commits.scope.all": "All repository",
  "git.commits.empty": "No commits found for this scope.",
  "git.commits.unavailable": "Commit history unavailable.",
  "git.commits.showing-latest": "Showing latest {{count}} commits."
}
```

Merge these into the existing JSON object rather than replacing the file.

- [ ] **Step 2: Add Chinese keys**

In `packages/i18n-resources/src/inspector/zh.json`, add:

```json
{
  "git.dirty-note": "当前 worktree 有 {{count}} 个本地变更。",
  "git.repository.title": "仓库",
  "git.repository.remote": "Remote",
  "git.repository.no-remote": "未配置 remote",
  "git.identity.title": "提交身份",
  "git.identity.unset": "未配置提交身份",
  "git.identity.source.local": "本仓库配置",
  "git.identity.source.global": "全局配置",
  "git.identity.source.unset": "未配置",
  "git.branch.current": "当前分支",
  "git.branch.upstream": "Upstream",
  "git.branch.no-upstream": "未设置 upstream",
  "git.commits.title": "提交记录",
  "git.commits.scope": "提交记录范围",
  "git.commits.scope.current": "当前分支",
  "git.commits.scope.all": "全仓库",
  "git.commits.empty": "当前范围内没有提交记录。",
  "git.commits.unavailable": "无法读取提交记录。",
  "git.commits.showing-latest": "显示最近 {{count}} 条提交。"
}
```

Merge these into the existing JSON object rather than replacing the file.

- [ ] **Step 3: Run i18n check**

Run:

```bash
yarn i18n:check
```

Expected: PASS.

- [ ] **Step 4: Run focused renderer Git tests**

Run:

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/__tests__/DesktopShell.test.tsx --testNamePattern "git"
```

Expected: PASS.

- [ ] **Step 5: Commit checkpoint only after approval**

Ask the user: `May I commit Task 6 i18n changes?`

If the user explicitly approves, run:

```bash
git add packages/i18n-resources/src/inspector/en.json packages/i18n-resources/src/inspector/zh.json apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx
git commit -m "feat: localize git inspector overview"
```

Expected: commit succeeds. If the user does not approve, leave changes unstaged.

---

### Task 7: Full Regression And Cleanup

**Files:**
- Inspect: `packages/shared-types/src/index.ts`
- Inspect: `apps/desktop/src/main/project-service.ts`
- Inspect: `apps/desktop/src/main/desktop-router.ts`
- Inspect: `apps/desktop/src/main/preload/api.ts`
- Inspect: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
- Inspect: `apps/desktop/src/renderer/styles.css`
- Inspect: `packages/i18n-resources/src/inspector/en.json`
- Inspect: `packages/i18n-resources/src/inspector/zh.json`
- Inspect: `apps/desktop/src/main/__tests__/shared-contracts.test.ts`
- Inspect: `apps/desktop/src/main/__tests__/desktop-router.test.ts`
- Inspect: `apps/desktop/src/main/__tests__/project-service.test.ts`
- Inspect: `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: verified implementation ready for user review.

- [ ] **Step 1: Search for stale old Git panel assumptions**

Run:

```bash
rg -n "inspector-git-files|inspector-git-file-row|git-action-open-editor|git-action-open-terminal|git-action-open-worktree|stagedCount|unstagedCount|untrackedCount|summary\\.changedCount|git\\.files|recordedBranch" apps packages
```

Expected: no stale renderer usage of the old Git changed-files/action UI. Remaining occurrences are acceptable only in historical tests that were intentionally rewritten or in status parsing internals with a clear purpose.

- [ ] **Step 2: Run typecheck**

Run:

```bash
yarn typecheck
```

Expected: PASS.

- [ ] **Step 3: Run i18n verification**

Run:

```bash
yarn i18n:check
```

Expected: PASS.

- [ ] **Step 4: Run desktop tests**

Run:

```bash
yarn workspace @teamcow/desktop test
```

Expected: PASS.

- [ ] **Step 5: Run full workspace tests**

Run:

```bash
yarn test
```

Expected: PASS.

- [ ] **Step 6: Review the Git panel manually in development**

Start the app:

```bash
yarn dev
```

Manual checks:

- Select a conversation bound to a repository with an upstream remote.
- Open Inspector `Git`.
- Confirm the default remote is the upstream remote.
- Switch the remote dropdown and confirm only the displayed URL changes.
- Switch `All repository` to `Current branch` and confirm commit rows reload.
- Confirm dirty worktrees show a compact dirty message and a `Review Diff` link.
- Confirm the Git panel does not show a changed-files list.
- Confirm no commit, push, pull, fetch, checkout, branch, or staging action is exposed.

Stop the dev server after review.

- [ ] **Step 7: Final git status check**

Run:

```bash
git status --short
```

Expected: only files touched by this plan appear, plus any pre-existing unrelated user changes. Do not revert unrelated changes.

- [ ] **Step 8: Final commit only after approval**

Ask the user: `May I commit the completed Git Inspector redesign?`

If the user explicitly approves, run:

```bash
git add packages/shared-types/src/index.ts apps/desktop/src/main/project-service.ts apps/desktop/src/main/desktop-router.ts apps/desktop/src/main/preload/api.ts apps/desktop/src/renderer/app/shell/DesktopShell.tsx apps/desktop/src/renderer/styles.css packages/i18n-resources/src/inspector/en.json packages/i18n-resources/src/inspector/zh.json apps/desktop/src/main/__tests__/shared-contracts.test.ts apps/desktop/src/main/__tests__/desktop-router.test.ts apps/desktop/src/main/__tests__/project-service.test.ts apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx docs/design/specs/2026-07-08-git-inspector-redesign.md docs/design/plans/2026-07-08-git-inspector-redesign.md
git commit -m "feat: redesign git inspector overview"
```

Expected: commit succeeds. If the user does not approve, leave changes uncommitted and report the working tree status.

---

## Self-Review Notes

- Spec coverage: repository remote selection, identity fallback, branch/upstream, clean/dirty summary, commit scope switching, read-only boundary, i18n, and testing are each mapped to a task.
- Scope check: this is one cohesive Inspector Git redesign, not multiple independent subsystems.
- Type consistency: the plan uses `GitCommitScope`, `GetConversationGitStatusInput`, `ConversationGitStatus.repository`, `ConversationGitStatus.identity`, `ConversationGitStatus.branch`, and `ConversationGitStatus.commits` consistently across main, preload, renderer, and tests.
- Commit policy: every commit step is gated by explicit user approval to satisfy project rules.
