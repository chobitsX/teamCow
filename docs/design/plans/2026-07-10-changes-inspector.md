# Changes Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the artifact-driven Diff inspector with a live, conversation-bound Changes surface that reviews and manages staged and unstaged worktree changes.

**Architecture:** Add a dedicated zod-validated Changes IPC domain alongside the existing Git overview. The main process resolves the conversation's bound worktree, reads or mutates Git with argument arrays, and returns lightweight status plus lazy per-file diffs; renderer state owns polling, request guards, pin snapshots, and a focused Changes component.

**Tech Stack:** Node 22.22.2, Yarn workspaces, Electron, React 19, TypeScript, zod, Vitest, better-sqlite3, native `git` CLI.

## Global Constraints

- Use Yarn, not npm or pnpm; do not create another lockfile.
- Preserve `Project -> Conversation`; every Changes command derives its worktree from the conversation binding.
- Renderer must not access `fs`, `git`, `child_process`, or provider processes directly.
- Every IPC input and output must pass shared zod schemas through `teamcow:invoke`.
- Keep `Git` responsible for repository identity, branch/upstream, remotes, and commit history.
- Changes shows all live uncommitted worktree changes, including provider and manual edits; it is not run-specific.
- User-visible copy must exist in both English and Chinese and pass `yarn i18n:check`.
- Do not run `git commit` or an equivalent operation on the TeamCow repository without explicit user approval. The product's new Commit button may commit the user's inspected project because that is the requested feature; this constraint concerns development commits in this workspace.

---

### Task 1: Define the Changes contracts and IPC surface

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/desktop/src/main/preload/api.ts`
- Modify: `apps/desktop/src/main/desktop-router.ts`
- Test: `apps/desktop/src/main/__tests__/shared-contracts.test.ts`
- Test: `apps/desktop/src/main/__tests__/desktop-router.test.ts`

**Interfaces:**
- Produces: `ConversationChangeArea`, `ConversationChangeFile`, `ConversationChangesSnapshot`, `GetConversationChangesResult`, `GetConversationChangeDiffResult`, `MutateConversationChangesInput`, `ConversationChangesMutationResult`, and `CommitConversationChangesResult`.
- Produces API calls: `getConversationChanges`, `getConversationChangeDiff`, `stageConversationChanges`, `unstageConversationChanges`, `discardConversationChanges`, and `commitConversationChanges`.

- [ ] **Step 1: Write failing shared-contract tests**

Add imports and a focused test that parses every new input/result and DesktopCommand variant:

```ts
const snapshot = conversationChangesSnapshotSchema.parse({
  conversationId: "conversation-1",
  worktreeId: "worktree-1",
  worktreeRootPath: "/tmp/teamcow",
  staged: [{
    path: "src/staged.ts",
    oldPath: null,
    status: "modified",
    additions: 2,
    deletions: 1,
    isBinary: false
  }],
  unstaged: [{
    path: "src/new.ts",
    oldPath: null,
    status: "untracked",
    additions: 4,
    deletions: 0,
    isBinary: false
  }],
  checkedAt: "2026-07-10T08:00:00.000Z"
})

expect(getConversationChangesResultSchema.parse({ status: "ok", changes: snapshot })).toMatchObject({
  status: "ok",
  changes: { conversationId: "conversation-1" }
})
expect(getConversationChangeDiffResultSchema.parse({
  status: "ok",
  diff: {
    conversationId: "conversation-1",
    worktreeId: "worktree-1",
    filePath: "src/new.ts",
    area: "unstaged",
    kind: "text",
    patch: "@@ -0,0 +1 @@\n+new",
    truncatedLineCount: 0
  }
}).status).toBe("ok")
expect(desktopCommandSchema.parse({
  type: "stageConversationChanges",
  input: {
    conversationId: "conversation-1",
    scope: { type: "paths", filePaths: ["src/new.ts"] }
  }
}).type).toBe("stageConversationChanges")
```

Also assert that empty path arrays, absolute paths, traversal paths, empty commit messages, and a binary diff containing a patch are rejected.

- [ ] **Step 2: Run the shared-contract test and verify RED**

Run:

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/shared-contracts.test.ts
```

Expected: FAIL because the Changes schemas and command variants do not exist.

- [ ] **Step 3: Add the shared schemas and API types**

Add the following shapes near the existing Git contracts in `packages/shared-types/src/index.ts`:

```ts
export const conversationChangeAreaSchema = z.enum(["staged", "unstaged"])
export type ConversationChangeArea = z.infer<typeof conversationChangeAreaSchema>

export const conversationChangeStatusSchema = z.enum([
  "added", "modified", "deleted", "renamed", "copied",
  "untracked", "conflicted", "unknown"
])

const conversationChangePathSchema = z.string()
  .trim()
  .min(1)
  .refine((value) => !value.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(value), "path must be relative")
  .transform((value) => value.replace(/\\/g, "/"))
  .refine((value) => value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."), "path must stay inside the worktree")

export const conversationChangeFileSchema = z.object({
  path: conversationChangePathSchema,
  oldPath: conversationChangePathSchema.nullable(),
  status: conversationChangeStatusSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  isBinary: z.boolean()
})
export type ConversationChangeFile = z.infer<typeof conversationChangeFileSchema>

export const conversationChangesSnapshotSchema = z.object({
  conversationId: z.string().min(1),
  worktreeId: z.string().min(1),
  worktreeRootPath: z.string().min(1),
  staged: z.array(conversationChangeFileSchema),
  unstaged: z.array(conversationChangeFileSchema),
  checkedAt: z.string().datetime()
})
export type ConversationChangesSnapshot = z.infer<typeof conversationChangesSnapshotSchema>

export const getConversationChangesInputSchema = z.object({ conversationId: z.string().min(1) })
export type GetConversationChangesInput = z.infer<typeof getConversationChangesInputSchema>
export const getConversationChangesResultSchema = z.union([
  z.object({ status: z.literal("ok"), changes: conversationChangesSnapshotSchema }),
  z.object({ status: z.literal("error"), error: appErrorSchema })
])
export type GetConversationChangesResult = z.infer<typeof getConversationChangesResultSchema>

export const getConversationChangeDiffInputSchema = z.object({
  conversationId: z.string().min(1),
  filePath: conversationChangePathSchema,
  area: conversationChangeAreaSchema
})
export type GetConversationChangeDiffInput = z.infer<typeof getConversationChangeDiffInputSchema>

export const conversationChangeDiffSchema = z.object({
  conversationId: z.string().min(1),
  worktreeId: z.string().min(1),
  filePath: conversationChangePathSchema,
  area: conversationChangeAreaSchema,
  kind: z.enum(["text", "binary"]),
  patch: z.string().nullable(),
  truncatedLineCount: z.number().int().nonnegative()
}).superRefine((value, context) => {
  if (value.kind === "binary" && value.patch !== null) {
    context.addIssue({ code: "custom", message: "binary diffs cannot contain text patches" })
  }
  if (value.kind === "text" && value.patch === null) {
    context.addIssue({ code: "custom", message: "text diffs must contain a patch" })
  }
})
export type ConversationChangeDiff = z.infer<typeof conversationChangeDiffSchema>
export const getConversationChangeDiffResultSchema = z.union([
  z.object({ status: z.literal("ok"), diff: conversationChangeDiffSchema }),
  z.object({ status: z.literal("error"), error: appErrorSchema })
])
export type GetConversationChangeDiffResult = z.infer<typeof getConversationChangeDiffResultSchema>

export const conversationChangesScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("paths"), filePaths: z.array(conversationChangePathSchema).min(1) })
])
export type ConversationChangesScope = z.infer<typeof conversationChangesScopeSchema>
export const mutateConversationChangesInputSchema = z.object({
  conversationId: z.string().min(1),
  scope: conversationChangesScopeSchema
})
export type MutateConversationChangesInput = z.infer<typeof mutateConversationChangesInputSchema>

export const conversationChangesMutationResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    operation: z.enum(["stage", "unstage", "discard"]),
    conversationId: z.string(),
    worktreeId: z.string(),
    affectedPaths: z.array(conversationChangePathSchema)
  }),
  z.object({ status: z.literal("error"), error: appErrorSchema })
])
export type ConversationChangesMutationResult = z.infer<typeof conversationChangesMutationResultSchema>

export const commitConversationChangesInputSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().trim().min(1).max(10_000)
})
export type CommitConversationChangesInput = z.infer<typeof commitConversationChangesInputSchema>
export const commitConversationChangesResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    conversationId: z.string(),
    worktreeId: z.string(),
    commitHash: z.string().min(1)
  }),
  z.object({ status: z.literal("error"), error: appErrorSchema })
])
export type CommitConversationChangesResult = z.infer<typeof commitConversationChangesResultSchema>
```

Add `GIT_CHANGES_READ_FAILED`, `GIT_CHANGE_OPERATION_FAILED`, and `GIT_COMMIT_FAILED` to `appErrorCodeSchema`. Extend `desktopCommandSchema` and `TeamcowDesktopApi` with the six command names and the exact types above.

The API additions are:

```ts
getConversationChanges: (conversationId: string) => Promise<GetConversationChangesResult>
getConversationChangeDiff: (input: GetConversationChangeDiffInput) => Promise<GetConversationChangeDiffResult>
stageConversationChanges: (input: MutateConversationChangesInput) => Promise<ConversationChangesMutationResult>
unstageConversationChanges: (input: MutateConversationChangesInput) => Promise<ConversationChangesMutationResult>
discardConversationChanges: (input: MutateConversationChangesInput) => Promise<ConversationChangesMutationResult>
commitConversationChanges: (input: CommitConversationChangesInput) => Promise<CommitConversationChangesResult>
```

- [ ] **Step 4: Add failing router tests**

Add one table-driven test in `desktop-router.test.ts` that provides mocked service methods, calls each command, and expects the exact input to reach the service. Include one read assertion:

```ts
const getConversationChanges = vi.fn((): GetConversationChangesResult => ({
  status: "ok",
  changes: {
    conversationId: "conversation-1",
    worktreeId: "worktree-1",
    worktreeRootPath: "/tmp/teamcow",
    staged: [],
    unstaged: [],
    checkedAt: "2026-07-10T08:00:00.000Z"
  }
}))
```

Run:

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/desktop-router.test.ts
```

Expected: FAIL because router cases and preload methods are absent.

- [ ] **Step 5: Wire preload and router**

Add the six methods to `desktopApi`; for example:

```ts
async getConversationChanges(conversationId) {
  return invokeDesktopCommand({ type: "getConversationChanges", input: { conversationId } })
},
async getConversationChangeDiff(input) {
  return invokeDesktopCommand({ type: "getConversationChangeDiff", input })
},
async stageConversationChanges(input) {
  return invokeDesktopCommand({ type: "stageConversationChanges", input })
}
```

Add all six types to `commandDomainByType` with domain `git`. Add router cases that call the matching project-service method and parse with the exact result schema; mutation cases use `await` so future asynchronous implementations remain valid.

- [ ] **Step 6: Verify GREEN and checkpoint**

Run:

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/shared-contracts.test.ts src/main/__tests__/desktop-router.test.ts
yarn workspace @teamcow/desktop typecheck
git diff --check
```

Expected: all commands exit 0. Do not commit.

---

### Task 2: Read staged/unstaged snapshots and lazy diffs from the bound worktree

**Files:**
- Create: `apps/desktop/src/main/conversation-changes-git.ts`
- Create: `apps/desktop/src/main/__tests__/conversation-changes-git.test.ts`
- Modify: `apps/desktop/src/main/project-service.ts`
- Test: `apps/desktop/src/main/__tests__/project-service.test.ts`

**Interfaces:**
- Consumes: shared Changes schemas from Task 1 and the existing `GitCommandRunner` result shape.
- Produces pure helpers: `parseGitNumstat`, `buildConversationChangeGroups`, `truncateUnifiedPatch`.
- Produces service methods: `getConversationChanges(input)` and `getConversationChangeDiff(input)`.

- [ ] **Step 1: Write failing parser/model tests**

Cover ordinary and rename numstat records, staged/unstaged dual-state rows, conflict pairs, binary markers, and patch truncation:

```ts
expect(parseGitNumstat("2\t1\tsrc/a.ts\0-\t-\tassets/logo.png\0")).toEqual(new Map([
  ["src/a.ts", { additions: 2, deletions: 1, isBinary: false }],
  ["assets/logo.png", { additions: 0, deletions: 0, isBinary: true }]
]))

expect(buildConversationChangeGroups({
  statusFiles: [{
    path: "src/both.ts",
    oldPath: null,
    indexStatus: "M",
    worktreeStatus: "M",
    displayStatus: "modified"
  }],
  stagedStats: new Map([["src/both.ts", { additions: 1, deletions: 0, isBinary: false }]]),
  unstagedStats: new Map([["src/both.ts", { additions: 2, deletions: 1, isBinary: false }]])
})).toMatchObject({
  staged: [{ path: "src/both.ts", additions: 1 }],
  unstaged: [{ path: "src/both.ts", additions: 2 }]
})
```

- [ ] **Step 2: Run parser tests and verify RED**

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/conversation-changes-git.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement focused Git parsing helpers**

`parseGitNumstat` must parse NUL output including rename cells in the Superset-compatible form `<add>\t<del>\t\0<old>\0<new>\0`, indexing stats under both paths. `buildConversationChangeGroups` creates independent staged and unstaged rows from index/worktree status codes; untracked rows are unstaged only. `truncateUnifiedPatch` slices by complete lines at 512 KiB and returns the hidden line count.

Use these exact signatures:

```ts
export type ChangeStats = { additions: number; deletions: number; isBinary: boolean }
export type ParsedStatusFile = ConversationGitFileStatus & { oldPath: string | null }

export const parseGitNumstat = (raw: string): Map<string, ChangeStats> => {
  const result = new Map<string, ChangeStats>()
  const entries = raw.split("\0")
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (!entry) continue
    const firstTab = entry.indexOf("\t")
    const secondTab = firstTab >= 0 ? entry.indexOf("\t", firstTab + 1) : -1
    if (firstTab < 0 || secondTab < 0) continue
    const additions = entry.slice(0, firstTab)
    const deletions = entry.slice(firstTab + 1, secondTab)
    const inlinePath = entry.slice(secondTab + 1)
    const stats = {
      additions: additions === "-" ? 0 : Number.parseInt(additions || "0", 10),
      deletions: deletions === "-" ? 0 : Number.parseInt(deletions || "0", 10),
      isBinary: additions === "-" && deletions === "-"
    }
    if (inlinePath) {
      result.set(inlinePath, stats)
      continue
    }
    const oldPath = entries[index + 1] ?? ""
    const newPath = entries[index + 2] ?? ""
    index += 2
    if (oldPath) result.set(oldPath, stats)
    if (newPath) result.set(newPath, stats)
  }
  return result
}

const statusForCode = (file: ParsedStatusFile, code: string | null, area: ConversationChangeArea) => {
  if (file.displayStatus === "conflicted") return "conflicted" as const
  if (area === "unstaged" && file.indexStatus === "?" && file.worktreeStatus === "?") return "untracked" as const
  if (code === "A") return "added" as const
  if (code === "M") return "modified" as const
  if (code === "D") return "deleted" as const
  if (code === "R") return "renamed" as const
  if (code === "C") return "copied" as const
  return "unknown" as const
}

const toChangeFile = (
  file: ParsedStatusFile,
  area: ConversationChangeArea,
  stats: Map<string, ChangeStats>
): ConversationChangeFile => ({
  path: file.path,
  oldPath: file.oldPath,
  status: statusForCode(file, area === "staged" ? file.indexStatus : file.worktreeStatus, area),
  ...(stats.get(file.path) ?? { additions: 0, deletions: 0, isBinary: false })
})

export const buildConversationChangeGroups = (input: {
  statusFiles: ParsedStatusFile[]
  stagedStats: Map<string, ChangeStats>
  unstagedStats: Map<string, ChangeStats>
}): Pick<ConversationChangesSnapshot, "staged" | "unstaged"> => ({
  staged: input.statusFiles
    .filter((file) => Boolean(file.indexStatus) && file.indexStatus !== "?")
    .map((file) => toChangeFile(file, "staged", input.stagedStats)),
  unstaged: input.statusFiles
    .filter((file) => Boolean(file.worktreeStatus))
    .map((file) => toChangeFile(file, "unstaged", input.unstagedStats))
})

export const truncateUnifiedPatch = (patch: string, maxBytes = 512 * 1024) => {
  const lines = patch.split(/\r?\n/)
  const visible: string[] = []
  let byteLength = 0
  for (const line of lines) {
    const nextLength = Buffer.byteLength(`${line}\n`, "utf8")
    if (byteLength + nextLength > maxBytes) break
    visible.push(line)
    byteLength += nextLength
  }
  return {
    patch: visible.join("\n"),
    truncatedLineCount: Math.max(0, lines.length - visible.length)
  }
}
```

Do not put database or Electron dependencies in this file.

- [ ] **Step 4: Write failing project-service read tests**

Create a temporary real repository with `git init`, a configured local identity, an initial commit, a staged file, an unstaged file, an untracked file, and one file with both staged and unstaged changes. Seed a conversation bound to that repository. Assert:

```ts
const result = service.getConversationChanges({ conversationId: "conversation-changes" })
expect(result.status).toBe("ok")
if (result.status !== "ok") throw new Error("expected changes")
expect(result.changes.staged.map((file) => file.path)).toContain("src/both.ts")
expect(result.changes.unstaged.map((file) => file.path)).toEqual(expect.arrayContaining([
  "src/both.ts", "src/unstaged.ts", "src/untracked.ts"
]))

const diff = service.getConversationChangeDiff({
  conversationId: "conversation-changes",
  filePath: "src/both.ts",
  area: "staged"
})
expect(diff).toMatchObject({ status: "ok", diff: { area: "staged", kind: "text" } })
```

Also assert that traversal, absolute paths, missing conversation/worktree, binary files, and paths not in the selected change area return structured errors or binary results.

- [ ] **Step 5: Run project-service read tests and verify RED**

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/project-service.test.ts -t "conversation changes"
```

Expected: FAIL because the service methods do not exist.

- [ ] **Step 6: Implement conversation/worktree resolution and reads**

In `project-service.ts`, extend the status parser to retain `oldPath` for rename/copy rows. Add a single helper used by every Changes method:

```ts
const resolveConversationChangesWorktree = (conversationId: string) => {
  const conversation = getConversationById(conversationId)
  if (!conversation) return { status: "error" as const, error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${conversationId}`) }
  const worktree = getWorktreeById(conversation.worktreeId)
  if (!worktree || !existsSync(worktree.rootPath)) {
    return { status: "error" as const, error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${conversation.worktreeId} was not found`) }
  }
  return { status: "ok" as const, conversation, worktree }
}
```

`getConversationChanges` runs status plus:

```ts
readGitCommand(worktree.rootPath, ["diff", "--numstat", "-z", "-M", "--cached"])
readGitCommand(worktree.rootPath, ["diff", "--numstat", "-z", "-M"])
```

`getConversationChangeDiff` validates membership in the requested area, then runs staged `git diff --cached --no-ext-diff --binary --unified=3 -- <path>` or unstaged `git diff --no-ext-diff --binary --unified=3 -- <path>`. For untracked files, synthesize a standard new-file patch from safely read UTF-8 content; binary sniffing and the 512 KiB limit must happen before building the patch. Add both methods to the returned ProjectService object.

- [ ] **Step 7: Verify GREEN and checkpoint**

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/conversation-changes-git.test.ts
yarn workspace @teamcow/desktop test src/main/__tests__/project-service.test.ts -t "conversation changes"
git diff --check
```

Expected: all commands exit 0. Do not commit.

---

### Task 3: Implement stage, unstage, discard, and commit mutations

**Files:**
- Modify: `apps/desktop/src/main/project-service.ts`
- Modify: `apps/desktop/src/main/conversation-changes-git.ts`
- Test: `apps/desktop/src/main/__tests__/project-service.test.ts`

**Interfaces:**
- Consumes: `MutateConversationChangesInput`, `ConversationChangesMutationResult`, and `CommitConversationChangesInput`.
- Produces ProjectService methods matching the six IPC names from Task 1.

- [ ] **Step 1: Write failing mutation tests against a real temporary repository**

Test these observable outcomes:

```ts
expect(service.stageConversationChanges({
  conversationId,
  scope: { type: "paths", filePaths: ["src/unstaged.ts"] }
})).toMatchObject({ status: "ok", operation: "stage" })

expect(service.unstageConversationChanges({
  conversationId,
  scope: { type: "all" }
})).toMatchObject({ status: "ok", operation: "unstage" })

expect(service.discardConversationChanges({
  conversationId,
  scope: { type: "paths", filePaths: ["src/both.ts"] }
})).toMatchObject({ status: "ok", operation: "discard" })
expect(readFileSync(join(repoRoot, "src/both.ts"), "utf8")).toBe(indexVersion)

expect(service.commitConversationChanges({ conversationId, message: "test: commit staged changes" })).toMatchObject({
  status: "ok",
  commitHash: expect.any(String)
})
```

Assert that discard preserves staged content, deletes confirmed untracked paths without following an external symlink, refuses conflicts and invalid paths, commit refuses an empty index, and hook/identity failures use `GIT_COMMIT_FAILED`.

- [ ] **Step 2: Run mutation tests and verify RED**

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/project-service.test.ts -t "mutates conversation changes"
```

Expected: FAIL because mutation methods are absent.

- [ ] **Step 3: Implement mutation path resolution and Git commands**

Resolve `scope.type === "all"` from a fresh snapshot; never accept a renderer-provided root. Deduplicate normalized paths. Use these commands:

```ts
// stage paths/all
["add", "-A", "--", ...paths]

// unstage paths/all; use reset for compatibility with repositories whose HEAD exists
["reset", "HEAD", "--", ...paths]

// discard tracked unstaged paths back to the index, preserving staged content
["restore", "--worktree", "--", ...trackedPaths]

// commit the existing index only
["commit", "-m", message]
["rev-parse", "HEAD"]
```

Handle an unborn HEAD by using `git rm --cached --ignore-unmatch -- <paths>` for unstage. For untracked paths, use `lstatSync` and `rmSync(target, { recursive: isDirectory, force: false })`; reject targets outside the canonical worktree and remove symlink entries themselves without following them. Bulk discard is rejected when a fresh snapshot contains any conflicted row.

Every failed mutation returns a concrete structured error such as:

```ts
return {
  status: "error",
  error: buildAppError(
    operation === "commit" ? "GIT_COMMIT_FAILED" : "GIT_CHANGE_OPERATION_FAILED",
    `git ${operation} failed for conversation ${conversationId}`,
    result.status === "error" ? result.error.message : null,
    {
      domain: "git",
      context: { conversationId, worktreeId: worktree.id, worktreeRootPath: worktree.rootPath }
    }
  )
}
```

- [ ] **Step 4: Verify GREEN and checkpoint**

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/project-service.test.ts -t "conversation changes|mutates conversation changes"
yarn workspace @teamcow/desktop test src/main/__tests__/desktop-router.test.ts
git diff --check
```

Expected: all commands exit 0. Do not commit.

---

### Task 4: Build the pure renderer model and focused Changes panel

**Files:**
- Create: `apps/desktop/src/renderer/app/shell/inspector-changes-model.ts`
- Create: `apps/desktop/src/renderer/app/shell/inspector-changes-model.test.ts`
- Create: `apps/desktop/src/renderer/app/shell/InspectorChangesPanel.tsx`
- Create: `apps/desktop/src/renderer/app/shell/__tests__/InspectorChangesPanel.test.tsx`

**Interfaces:**
- Consumes: `ConversationChangesSnapshot`, `ConversationChangeFile`, and `GetConversationChangeDiffResult`.
- Produces: stable `ConversationChangeSelection`, `InspectorChangesLoadState`, summary counts, unified-diff line rows, and a presentational panel whose callbacks contain no Git logic.

- [ ] **Step 1: Write failing model tests**

```ts
expect(getConversationChangeKey("unstaged", "src/a.ts")).toBe("unstaged:src/a.ts")
expect(getConversationChangesSummary(snapshot)).toEqual({
  rowCount: 3,
  additions: 7,
  deletions: 2
})
expect(parseConversationChangePatch("@@ -1 +1 @@\n-old\n+new")).toMatchObject([
  { kind: "hunk" },
  { kind: "removed" },
  { kind: "added" }
])
```

Also test meta headers, context lines, truncated counts, and duplicate paths in separate areas.

- [ ] **Step 2: Run model tests and verify RED**

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/inspector-changes-model.test.ts
```

Expected: FAIL because the model file does not exist.

- [ ] **Step 3: Implement the pure model**

Use exact exported types/functions:

```ts
export type InspectorChangesLoadState = "idle" | "loading" | "ready" | "error" | "unavailable"

export type ConversationChangeSelection = {
  area: ConversationChangeArea
  filePath: string
}

export const getConversationChangeKey = (area: ConversationChangeArea, filePath: string) => `${area}:${filePath}`
export const getConversationChangesSummary = (snapshot: ConversationChangesSnapshot) =>
  [...snapshot.unstaged, ...snapshot.staged].reduce(
    (summary, file) => ({
      rowCount: summary.rowCount + 1,
      additions: summary.additions + file.additions,
      deletions: summary.deletions + file.deletions
    }),
    { rowCount: 0, additions: 0, deletions: 0 }
  )
export const parseConversationChangePatch = (patch: string): InspectorDiffLine[] =>
  patch.split(/\r?\n/).map((content, index) => ({
    id: `change-line-${index}`,
    kind: content.startsWith("@@")
      ? "hunk"
      : content.startsWith("diff --git ") || content.startsWith("index ") || content.startsWith("--- ") || content.startsWith("+++ ")
        ? "meta"
        : content.startsWith("+")
          ? "added"
          : content.startsWith("-")
            ? "removed"
            : "context",
    content
  }))
```

Extract reusable line parsing from `inspector-diff-model.ts` only if both artifact history and live Changes need it; do not delete artifact parsing used by conversation history/compare.

- [ ] **Step 4: Write failing panel interaction tests**

Render `InspectorChangesPanel` with one unstaged and one staged file. Assert section labels/counts, row status/statistics, one expanded diff, hover action accessibility labels, commit enablement, destructive confirmation callbacks, stale/error banners, binary fallback, and `readOnly` disabling every Git mutation.

Use callback spies, for example:

```tsx
<InspectorChangesPanel
  snapshot={snapshot}
  loadState="ready"
  stale={false}
  error={null}
  selectedChange={{ area: "unstaged", filePath: "src/a.ts" }}
  selectedDiff={textDiff}
  diffLoadState="ready"
  readOnly={false}
  mutationPending={false}
  commitMessage="fix changes"
  onSelectChange={onSelectChange}
  onStage={onStage}
  onUnstage={onUnstage}
  onDiscard={onDiscard}
  onCommit={onCommit}
  onCommitMessageChange={onCommitMessageChange}
  onRefresh={onRefresh}
  onOpenFile={onOpenFile}
/>
```

- [ ] **Step 5: Run panel tests and verify RED**

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/__tests__/InspectorChangesPanel.test.tsx
```

Expected: FAIL because the panel does not exist.

- [ ] **Step 6: Implement the panel with no side effects**

Use this public props contract:

```ts
export type InspectorChangesPanelProps = {
  snapshot: ConversationChangesSnapshot | null
  loadState: InspectorChangesLoadState
  stale: boolean
  error: string | null
  selectedChange: ConversationChangeSelection | null
  selectedDiff: ConversationChangeDiff | null
  diffLoadState: InspectorChangesLoadState
  readOnly: boolean
  mutationPending: boolean
  commitMessage: string
  onSelectChange: (selection: ConversationChangeSelection) => void
  onStage: (scope: ConversationChangesScope) => void
  onUnstage: (scope: ConversationChangesScope) => void
  onDiscard: (scope: ConversationChangesScope) => void
  onCommit: () => void
  onCommitMessageChange: (message: string) => void
  onRefresh: () => void
  onOpenFile: (filePath: string) => void
}
```

The panel renders:

- Header summary and refresh button.
- Collapsible `unstaged` then `staged` sections.
- File rows with `FileIcon`, directory/basename split, old path, textual status, additions/deletions, and accessible action buttons.
- Exactly one inline diff under the selected row.
- Confirmation dialogs for untracked/bulk discard.
- Sticky commit area; disabled unless staged rows exist, trimmed message is non-empty, and no mutation is pending.

The component only calls props. It must not call `window.teamcow`, timers, or window event listeners.

The core row/inline-diff rendering is implemented directly from props:

```tsx
const [collapsedAreas, setCollapsedAreas] = useState<Set<ConversationChangeArea>>(new Set())
const summary = snapshot
  ? getConversationChangesSummary(snapshot)
  : { rowCount: 0, additions: 0, deletions: 0 }
const toggleArea = (area: ConversationChangeArea) => {
  setCollapsedAreas((current) => {
    const next = new Set(current)
    if (next.has(area)) next.delete(area)
    else next.add(area)
    return next
  })
}

const renderSelectedDiff = ({ selectedDiff, diffLoadState, truncatedLineCount }: {
  selectedDiff: ConversationChangeDiff | null
  diffLoadState: InspectorChangesLoadState
  truncatedLineCount: number
}) => {
  if (diffLoadState === "loading") return <p className="inspector-changes-message">{t("changes.diff.loading")}</p>
  if (!selectedDiff) return <p className="inspector-changes-message">{t("changes.diff.unavailable")}</p>
  if (selectedDiff.kind === "binary") return <p className="inspector-changes-message">{t("changes.diff.binary")}</p>
  return (
    <div className="inspector-changes-diff">
      {parseConversationChangePatch(selectedDiff.patch ?? "").map((line) => (
        <div className={`inspector-diff-line ${line.kind}`} key={line.id}>
          <span>{t(`changes.diff.line.${line.kind}`)}</span>
          <code>{line.content}</code>
        </div>
      ))}
      {truncatedLineCount > 0 ? <p>{t("changes.diff.truncated", { count: truncatedLineCount })}</p> : null}
    </div>
  )
}

const renderSection = (area: ConversationChangeArea, files: ConversationChangeFile[]) => (
  <section className="inspector-changes-section" data-testid={`changes-section-${area}`}>
    <button
      className="inspector-changes-section-head"
      type="button"
      aria-expanded={!collapsedAreas.has(area)}
      onClick={() => toggleArea(area)}
    >
      <span>{t(`changes.${area}`)}</span>
      <span>{files.length}</span>
    </button>
    {!collapsedAreas.has(area) ? files.map((file) => {
      const selection = { area, filePath: file.path }
      const selected = selectedChange?.area === area && selectedChange.filePath === file.path
      return (
        <div className={`inspector-changes-row${selected ? " active" : ""}`} key={getConversationChangeKey(area, file.path)}>
          <button type="button" className="inspector-changes-row-main" onClick={() => onSelectChange(selection)}>
            <FileIcon fileName={file.path.split("/").at(-1) ?? file.path} />
            <span className="inspector-changes-path" title={file.path}>{file.path}</span>
            <span className="inspector-changes-stats">
              {file.additions > 0 ? <span className="added">+{file.additions}</span> : null}
              {file.deletions > 0 ? <span className="removed">-{file.deletions}</span> : null}
              <span>{t(`changes.status.${file.status}`)}</span>
            </span>
          </button>
          <div className="inspector-changes-row-actions">
            {area === "unstaged" ? (
              <button type="button" disabled={readOnly || mutationPending} onClick={() => onStage({ type: "paths", filePaths: [file.path] })}>
                {t("changes.actions.stage")}
              </button>
            ) : (
              <button type="button" disabled={readOnly || mutationPending} onClick={() => onUnstage({ type: "paths", filePaths: [file.path] })}>
                {t("changes.actions.unstage")}
              </button>
            )}
            <button type="button" onClick={() => onOpenFile(file.path)}>{t("handoff.open-file")}</button>
          </div>
          {selected ? renderSelectedDiff({ selectedDiff, diffLoadState, truncatedLineCount: selectedDiff?.truncatedLineCount ?? 0 }) : null}
        </div>
      )
    }) : null}
  </section>
)

return (
  <div className="inspector-changes-panel" data-testid="inspector-changes-panel">
    <header className="inspector-changes-head">
      <strong>{t("changes.title")}</strong>
      <span>{t("changes.summary", { count: summary.rowCount, additions: summary.additions, deletions: summary.deletions })}</span>
      <button type="button" onClick={onRefresh} disabled={loadState === "loading"}>{t("changes.actions.refresh")}</button>
    </header>
    <div className="inspector-changes-list">
      {renderSection("unstaged", snapshot?.unstaged ?? [])}
      {renderSection("staged", snapshot?.staged ?? [])}
    </div>
    <form className="inspector-changes-commit" onSubmit={(event) => { event.preventDefault(); onCommit() }}>
      <input value={commitMessage} onChange={(event) => onCommitMessageChange(event.currentTarget.value)} placeholder={t("changes.commit.placeholder")} />
      <button type="submit" disabled={readOnly || mutationPending || !snapshot?.staged.length || !commitMessage.trim()}>
        {t("changes.commit.action")}
      </button>
    </form>
  </div>
)
```

- [ ] **Step 7: Verify GREEN and checkpoint**

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/inspector-changes-model.test.ts src/renderer/app/shell/__tests__/InspectorChangesPanel.test.tsx
git diff --check
```

Expected: all commands exit 0. Do not commit.

---

### Task 5: Integrate live Changes state, polling, pinning, and navigation into DesktopShell

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
- Modify: `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`

**Interfaces:**
- Consumes: `InspectorChangesPanel` and the six `window.teamcow` Changes methods.
- Produces: active-conversation Changes orchestration with stale-response guards and pinned snapshots.

- [ ] **Step 1: Add failing shell tests for the live source**

Change the default `window.teamcow` test mock to provide the six Changes methods. Add tests proving:

1. The tab is `Changes`, not `Diff`.
2. Empty timeline artifacts plus a dirty `getConversationChanges` response still render the changed files.
3. Clicking a row calls `getConversationChangeDiff` only for that path/area.
4. Switching conversation before a slow Changes or diff response resolves does not show stale data.
5. A provider run transition to completed, a window focus event, manual refresh, and a 2.5-second active-tab interval refresh the snapshot without overlapping calls.
6. Stage/unstage/discard/commit invoke the inspected conversation id and refresh Changes plus Git.
7. Pinning freezes the snapshot/diff and disables mutations; unpinning reloads the active conversation.
8. Chat and Git `Review diff` entry points now open Changes and select an artifact path only when that path is still live.

Core regression fixture:

```ts
window.teamcow.getConversationTimeline = vi.fn(async (conversationId) => ({
  status: "ok",
  timeline: emptyTimeline(conversationId)
}))
window.teamcow.getConversationChanges = vi.fn(async (conversationId) => ({
  status: "ok",
  changes: {
    conversationId,
    worktreeId: "worktree-1",
    worktreeRootPath: "/tmp/teamcow",
    staged: [],
    unstaged: [{
      path: "src/provider-change.ts",
      oldPath: null,
      status: "modified",
      additions: 3,
      deletions: 1,
      isBinary: false
    }],
    checkedAt: "2026-07-10T08:00:00.000Z"
  }
}))
```

- [ ] **Step 2: Run shell tests and verify RED**

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/__tests__/DesktopShell.test.tsx -t "Changes inspector"
```

Expected: FAIL because DesktopShell still renders artifact-driven Diff.

- [ ] **Step 3: Replace Diff tab state with Changes state**

Rename `InspectorTab` member `diff` to `changes`. Replace `selectedInspectorDiffId` with `selectedConversationChange: ConversationChangeSelection | null`. Add state and refs:

```ts
const [conversationChanges, setConversationChanges] = useState<ConversationChangesSnapshot | null>(null)
const [conversationChangesLoadState, setConversationChangesLoadState] = useState<InspectorChangesLoadState>("idle")
const [conversationChangesError, setConversationChangesError] = useState<string | null>(null)
const [conversationChangesStale, setConversationChangesStale] = useState(false)
const [selectedConversationChange, setSelectedConversationChange] = useState<ConversationChangeSelection | null>(null)
const [selectedConversationChangeDiff, setSelectedConversationChangeDiff] = useState<ConversationChangeDiff | null>(null)
const [conversationChangeDiffLoadState, setConversationChangeDiffLoadState] = useState<InspectorChangesLoadState>("idle")
const [changesMutationPending, setChangesMutationPending] = useState(false)
const [changesCommitMessage, setChangesCommitMessage] = useState("")
const changesRequestRef = useRef(0)
const changeDiffRequestRef = useRef(0)
const changesRequestInFlightRef = useRef(false)
```

Extend `PinnedInspectorContext` with the snapshot, stale/error state, selection, and selected diff. Remove artifact-derived changed-file/diff rendering from the live panel but retain `getInspectorDiffBlocks` only for historical chat/compare target extraction.

- [ ] **Step 4: Implement guarded loading and refresh triggers**

Create `loadConversationChanges({ force?: boolean })` with `useCallback`. It must:

- Return when pinned, no active conversation, or a request is already in flight.
- Preserve the previous snapshot and set `stale=true` on refresh error.
- Clear data on conversation identity change.
- Apply a result only when request id and conversation id still match.

Add effects for active-tab initial load, a 2500 ms interval, `window.focus`, and `activeConversation.runStatus` terminal transitions. Cleanup every timer/listener. Hidden or pinned tabs do not poll.

Create a second guarded effect for `selectedConversationChange` that calls `getConversationChangeDiff`; reset it when the selected row no longer exists after refresh.

- [ ] **Step 5: Implement mutations and refresh fan-out**

Use one wrapper:

```ts
const runChangesMutation = async (
  operation: () => Promise<ConversationChangesMutationResult | CommitConversationChangesResult>
) => {
  if (!inspectedConversation || isInspectorPinned || changesMutationPending) return
  setChangesMutationPending(true)
  setConversationChangesError(null)
  try {
    const result = await operation()
    if (result.status === "error") {
      setConversationChangesError(formatDesktopError(result.error))
      return
    }
    setConversationGitStatusRefreshKey((key) => key + 1)
    await loadConversationChanges({ force: true })
  } finally {
    setChangesMutationPending(false)
  }
}
```

Commit clears `changesCommitMessage` only after success. All handlers use `inspectedConversation.id`, never a project path or active id captured before pin/follow resolution.

- [ ] **Step 6: Replace panel markup and navigation**

Replace the existing `.inspector-diff-panel` JSX with `InspectorChangesPanel`. Rename test ids to `inspector-changes-panel` and `inspector-tab-changes`. Update `canPinInspectorContext` so Changes can pin only after a ready snapshot. Chat/Git review handlers call `openInspectorChanges(preferredFilePath)`; if the live snapshot contains the path, prefer unstaged then staged selection, otherwise show the list without selection.

- [ ] **Step 7: Verify GREEN and broader renderer regression**

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/__tests__/DesktopShell.test.tsx
yarn workspace @teamcow/desktop test src/renderer/app/shell/inspector-diff-model.test.ts
git diff --check
```

Expected: all commands exit 0. Do not commit.

---

### Task 6: Add localized Changes copy, Git errors, and Superset-inspired styling

**Files:**
- Modify: `packages/i18n-resources/src/inspector/en.json`
- Modify: `packages/i18n-resources/src/inspector/zh.json`
- Modify: `packages/i18n-resources/src/chat/en.json`
- Modify: `packages/i18n-resources/src/chat/zh.json`
- Modify: `packages/i18n-resources/src/errors/en.json`
- Modify: `packages/i18n-resources/src/errors/zh.json`
- Modify: `apps/desktop/src/renderer/styles.css`
- Test: `apps/desktop/src/renderer/app/shell/__tests__/InspectorChangesPanel.test.tsx`
- Test: `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`

**Interfaces:**
- Consumes: panel keys under `inspector.changes.*` and error codes from Task 1.
- Produces: symmetric English/Chinese copy and stable Changes CSS classes.

- [ ] **Step 1: Add failing localization assertions**

Assert English and Chinese render the tab, sections, clean state, stale banner, action labels, discard confirmations, binary/truncated fallbacks, pinned read-only note, and commit validation. Update chat/Git review expectations from `Review diff` to `Review changes` / `审查变更`.

- [ ] **Step 2: Run i18n-sensitive tests and verify RED**

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/__tests__/InspectorChangesPanel.test.tsx src/renderer/app/shell/__tests__/DesktopShell.test.tsx
yarn i18n:check
```

Expected: FAIL because the new keys do not exist or are asymmetric.

- [ ] **Step 3: Add exact copy keys**

Replace live `diff.*` keys with this Changes key set in `inspector/en.json`:

```json
{
  "tabs.changes": "Changes",
  "changes.title": "Changes",
  "changes.summary": "{{count}} changes · +{{additions}} -{{deletions}}",
  "changes.unstaged": "Unstaged",
  "changes.staged": "Staged",
  "changes.loading": "Loading changes...",
  "changes.clean": "No uncommitted changes.",
  "changes.stale": "Showing the last known changes. Refresh failed.",
  "changes.error": "Changes are unavailable.",
  "changes.actions.refresh": "Refresh changes",
  "changes.actions.stage": "Stage",
  "changes.actions.stage-all": "Stage all",
  "changes.actions.unstage": "Unstage",
  "changes.actions.unstage-all": "Unstage all",
  "changes.actions.discard": "Discard changes",
  "changes.actions.discard-all": "Discard all unstaged changes",
  "changes.actions.open-file": "Open in editor",
  "changes.status.added": "Added",
  "changes.status.modified": "Modified",
  "changes.status.deleted": "Deleted",
  "changes.status.renamed": "Renamed",
  "changes.status.copied": "Copied",
  "changes.status.untracked": "Untracked",
  "changes.status.conflicted": "Conflicted",
  "changes.status.unknown": "Changed",
  "changes.diff.loading": "Loading diff...",
  "changes.diff.unavailable": "Diff unavailable.",
  "changes.diff.binary": "Binary diff cannot be displayed.",
  "changes.diff.truncated": "{{count}} additional diff lines are hidden.",
  "changes.diff.line.added": "Added",
  "changes.diff.line.removed": "Removed",
  "changes.diff.line.context": "Context",
  "changes.diff.line.hunk": "Hunk",
  "changes.diff.line.meta": "Metadata",
  "changes.discard.file.title": "Discard changes to {{path}}?",
  "changes.discard.file.body": "Tracked content returns to the staged version. Untracked content is permanently deleted.",
  "changes.discard.all.title": "Discard all unstaged changes?",
  "changes.discard.all.body": "This reverts tracked unstaged content and permanently deletes untracked content. This cannot be undone.",
  "changes.commit.placeholder": "Commit message",
  "changes.commit.action": "Commit staged changes",
  "changes.commit.empty": "Enter a commit message.",
  "changes.pin.read-only": "Pinned changes are read-only. Unpin to modify this worktree."
}
```

Add the symmetric set to `inspector/zh.json`:

```json
{
  "tabs.changes": "变更",
  "changes.title": "变更",
  "changes.summary": "{{count}} 项变更 · +{{additions}} -{{deletions}}",
  "changes.unstaged": "未暂存",
  "changes.staged": "已暂存",
  "changes.loading": "正在加载变更……",
  "changes.clean": "没有未提交的变更。",
  "changes.stale": "当前显示上次读取的变更，刷新失败。",
  "changes.error": "无法读取变更。",
  "changes.actions.refresh": "刷新变更",
  "changes.actions.stage": "暂存",
  "changes.actions.stage-all": "全部暂存",
  "changes.actions.unstage": "取消暂存",
  "changes.actions.unstage-all": "全部取消暂存",
  "changes.actions.discard": "丢弃变更",
  "changes.actions.discard-all": "丢弃全部未暂存变更",
  "changes.actions.open-file": "在编辑器中打开",
  "changes.status.added": "新增",
  "changes.status.modified": "已修改",
  "changes.status.deleted": "已删除",
  "changes.status.renamed": "已重命名",
  "changes.status.copied": "已复制",
  "changes.status.untracked": "未跟踪",
  "changes.status.conflicted": "存在冲突",
  "changes.status.unknown": "已变更",
  "changes.diff.loading": "正在加载 Diff……",
  "changes.diff.unavailable": "Diff 不可用。",
  "changes.diff.binary": "无法显示二进制 Diff。",
  "changes.diff.truncated": "另有 {{count}} 行 Diff 已隐藏。",
  "changes.diff.line.added": "新增",
  "changes.diff.line.removed": "删除",
  "changes.diff.line.context": "上下文",
  "changes.diff.line.hunk": "区块",
  "changes.diff.line.meta": "元数据",
  "changes.discard.file.title": "丢弃 {{path}} 的变更？",
  "changes.discard.file.body": "已跟踪内容将恢复到暂存版本；未跟踪内容将被永久删除。",
  "changes.discard.all.title": "丢弃全部未暂存变更？",
  "changes.discard.all.body": "这会还原已跟踪的未暂存内容，并永久删除未跟踪内容。此操作无法撤销。",
  "changes.commit.placeholder": "提交信息",
  "changes.commit.action": "提交已暂存变更",
  "changes.commit.empty": "请输入提交信息。",
  "changes.pin.read-only": "已固定的变更为只读。取消固定后才能修改此 worktree。"
}
```

Set `chat.render.review-diff` and `inspector.git.actions.review-diff` values to `Review changes` in English and `审查变更` in Chinese, retaining the existing keys to avoid unrelated render-model churn.

Add these exact error entries:

```json
// errors/en.json
"GIT_CHANGES_READ_FAILED": "TeamCow could not read the worktree changes.",
"GIT_CHANGE_OPERATION_FAILED": "TeamCow could not update the selected Git changes.",
"GIT_COMMIT_FAILED": "TeamCow could not commit the staged changes.",
"suggestion.GIT_CHANGES_READ_FAILED": "Check the repository state in Terminal, then refresh Changes.",
"suggestion.GIT_CHANGE_OPERATION_FAILED": "Resolve Git conflicts or locks, then retry the Changes action.",
"suggestion.GIT_COMMIT_FAILED": "Check staged files, Git identity, and commit hooks, then retry."

// errors/zh.json
"GIT_CHANGES_READ_FAILED": "TeamCow 无法读取当前 worktree 的变更。",
"GIT_CHANGE_OPERATION_FAILED": "TeamCow 无法更新所选 Git 变更。",
"GIT_COMMIT_FAILED": "TeamCow 无法提交已暂存的变更。",
"suggestion.GIT_CHANGES_READ_FAILED": "请在终端检查仓库状态，然后刷新“变更”。",
"suggestion.GIT_CHANGE_OPERATION_FAILED": "请处理 Git 冲突或锁文件，然后重试该变更操作。",
"suggestion.GIT_COMMIT_FAILED": "请检查已暂存文件、Git 身份和提交钩子，然后重试。"
```

- [ ] **Step 4: Implement compact Changes styles**

Replace obsolete live diff panel styles with `.inspector-changes-*` classes. Preserve existing diff-line semantic colors and textual labels. Required layout behavior:

- A flex column that fills the inspector height.
- Scrollable grouped rows with sticky section headers.
- Directory text truncates before a minimum-width basename.
- Row metadata is visible normally; action buttons replace it on hover/focus-within.
- Only the selected row owns an expanded diff, capped at 320 px before inner scrolling.
- Commit form is sticky at the bottom and never covers the last row.
- Focus-visible rings exist for every interactive control.
- Status is represented by text/icon as well as color.

Start from these concrete layout rules and extend only for the tested controls:

```css
.inspector-changes-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.inspector-changes-head,
.inspector-changes-section-head,
.inspector-changes-row-main,
.inspector-changes-commit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.inspector-changes-head {
  flex: 0 0 auto;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-subtle);
}

.inspector-changes-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.inspector-changes-section-head {
  position: sticky;
  top: 0;
  z-index: 1;
  width: 100%;
  padding: 6px 10px;
  color: var(--text-secondary);
  background: var(--bg-raised);
  border: 0;
  border-bottom: 1px solid var(--border-subtle);
}

.inspector-changes-row {
  border-bottom: 1px solid var(--border-subtle);
}

.inspector-changes-row-main {
  width: 100%;
  min-width: 0;
  padding: 6px 10px;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  text-align: left;
}

.inspector-changes-row.active > .inspector-changes-row-main {
  color: var(--text-primary);
  background: var(--accent-bg);
}

.inspector-changes-path {
  flex: 1 1 auto;
  min-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-changes-stats,
.inspector-changes-row-actions {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 5px;
}

.inspector-changes-row-actions {
  justify-content: flex-end;
  padding: 0 10px 6px;
}

.inspector-changes-stats .added { color: var(--git-added); }
.inspector-changes-stats .removed { color: var(--git-removed); }

.inspector-changes-diff {
  max-height: 320px;
  overflow: auto;
  margin: 0 10px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-canvas);
}

.inspector-changes-commit {
  position: sticky;
  bottom: 0;
  flex: 0 0 auto;
  padding: 8px 10px;
  background: var(--bg-raised);
  border-top: 1px solid var(--border-default);
}

.inspector-changes-commit input {
  min-width: 0;
  flex: 1 1 auto;
}

.inspector-changes-panel button:focus-visible,
.inspector-changes-panel input:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
```

- [ ] **Step 5: Verify GREEN and checkpoint**

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/__tests__/InspectorChangesPanel.test.tsx src/renderer/app/shell/__tests__/DesktopShell.test.tsx
yarn i18n:check
git diff --check
```

Expected: all commands exit 0. Do not commit.

---

### Task 7: Run full verification and review the final diff

**Files:**
- Verify all files listed in Tasks 1–6.
- Update the plan checkboxes as each command succeeds.

**Interfaces:**
- Consumes: the complete feature.
- Produces: fresh evidence that contracts, unit behavior, renderer integration, build, and Electron startup are healthy.

- [ ] **Step 1: Run focused Changes tests**

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/conversation-changes-git.test.ts
yarn workspace @teamcow/desktop test src/main/__tests__/project-service.test.ts -t "conversation changes|mutates conversation changes"
yarn workspace @teamcow/desktop test src/main/__tests__/shared-contracts.test.ts src/main/__tests__/desktop-router.test.ts
yarn workspace @teamcow/desktop test src/renderer/app/shell/inspector-changes-model.test.ts src/renderer/app/shell/__tests__/InspectorChangesPanel.test.tsx src/renderer/app/shell/__tests__/DesktopShell.test.tsx
```

Expected: every command exits 0 with zero failed tests.

- [ ] **Step 2: Run repository quality gates**

```bash
yarn typecheck
yarn lint
yarn test
yarn i18n:check
```

Expected: every command exits 0.

- [ ] **Step 3: Run desktop integration gates**

```bash
yarn build
yarn workspace @teamcow/desktop smoke
```

Expected: build exits 0; smoke launches and exits successfully. If the environment leaks `ELECTRON_RUN_AS_NODE`, follow `docs/desktop-dev-troubleshooting.md`, remove only the leaked environment variable for the smoke invocation, and rerun.

- [ ] **Step 4: Review scope, security, and worktree state**

```bash
git diff --check
git status --short
git diff --stat
git diff -- packages/shared-types/src/index.ts apps/desktop/src/main/project-service.ts apps/desktop/src/main/desktop-router.ts apps/desktop/src/main/preload/api.ts apps/desktop/src/renderer/app/shell/DesktopShell.tsx apps/desktop/src/renderer/app/shell/InspectorChangesPanel.tsx packages/i18n-resources/src apps/desktop/src/renderer/styles.css
```

Expected: no whitespace errors; only planned files and the approved design/plan documents are changed. Confirm there is no renderer import of `node:fs`, `node:child_process`, or Git execution, no shell-string construction from paths/messages, and no development commit has been created.
