# Files Editor Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TeamCow built-in file editor workspace so clicking Inspector Files opens editable conversation-bound files inside the center `Chat | Editor` split.

**Architecture:** Add narrow conversation-bound file read/write IPC contracts, implement host-side filesystem safety in `ProjectService`, then layer a focused renderer editor workspace around the existing chat pane. Keep Files in the right Inspector and use the generated UI reference as the visual target.

**Tech Stack:** Electron + React + TypeScript + electron-vite, Yarn workspaces, zod IPC contracts, Vitest, CodeMirror 6.

## Global Constraints

- First interactive language is Chinese.
- Use `yarn`, not npm, for frontend packages.
- Do not commit code or documents unless the user explicitly allows it.
- Node version is `22.22.2` from `.node-version` and `.nvmrc`.
- Renderer must not directly access `fs`, `git`, `pty`, `child_process`, or local provider processes.
- New desktop capabilities must extend `DesktopCommand`, zod schemas, preload API, `desktop-router.ts`, and the relevant service.
- All user-visible text must go through i18n resources in `packages/i18n-resources/src`.
- UI must follow the generated reference at `docs/design/assets/2026-07-07-files-editor-workspace-ui.png`.
- The feature scope excludes file creation, rename, delete, copy, drag/drop move, autosave, and Superset pane-system migration.

---

## File Structure

- Modify `packages/shared-types/src/index.ts`
  - Add file document read/write schemas, result types, error codes, desktop commands, and preload API typings.
- Modify `apps/desktop/src/main/preload/api.ts`
  - Expose `readConversationFile` and `writeConversationFile`.
- Modify `apps/desktop/src/main/desktop-router.ts`
  - Route and validate read/write commands.
- Modify `apps/desktop/src/main/project-service.ts`
  - Resolve conversation-bound file targets, read text files, detect binary/large files, write with revision preconditions, and reject writes during provider runs.
- Modify `apps/desktop/src/main/__tests__/shared-contracts.test.ts`
  - Cover shared schemas and desktop commands.
- Modify `apps/desktop/src/main/__tests__/desktop-router.test.ts`
  - Cover router dispatch and result validation.
- Modify `apps/desktop/src/main/__tests__/project-service.test.ts`
  - Cover host-side file read/write safety and conflict behavior.
- Create `apps/desktop/src/renderer/app/shell/editor/conversation-file-editor-model.ts`
  - Pure tab and document transition helpers.
- Create `apps/desktop/src/renderer/app/shell/editor/conversation-file-editor-model.test.ts`
  - Unit tests for preview/pinned/dirty tab transitions.
- Create `apps/desktop/src/renderer/app/shell/editor/use-chat-editor-split.ts`
  - Pointer-resizable center split ratio hook.
- Create `apps/desktop/src/renderer/app/shell/editor/CodeEditor.tsx`
  - CodeMirror wrapper with `value`, `readOnly`, `language`, `onChange`, and `onSave`.
- Create `apps/desktop/src/renderer/app/shell/editor/language.ts`
  - Lightweight extension-based language detection for CodeMirror.
- Create `apps/desktop/src/renderer/app/shell/editor/use-conversation-file-document.ts`
  - Hook for read/save/reload/conflict state per editor tab.
- Create `apps/desktop/src/renderer/app/shell/editor/EditorWorkspace.tsx`
  - Renders Chat-only or `Chat | Editor` split and owns editor tab state.
- Create `apps/desktop/src/renderer/app/shell/editor/EditorTabs.tsx`
  - Renders preview/pinned tabs, close buttons, pin state, dirty markers.
- Create `apps/desktop/src/renderer/app/shell/editor/FileEditorPane.tsx`
  - Renders document loading, editor, non-text states, read-only state, save/conflict actions.
- Modify `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
  - Replace direct chat rendering with `EditorWorkspace`, route Files clicks to editor tabs, and keep external handoff as explicit editor action.
- Modify `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`
  - Cover Files click integration, split visibility, tabs, dirty close, run-active read-only, save, conflict, and external handoff.
- Modify `apps/desktop/src/renderer/styles.css`
  - Add editor workspace, tabs, CodeMirror, split handle, conflict banner, and state styling.
- Modify `packages/i18n-resources/src/inspector/en.json`
  - Add editor UI copy.
- Modify `packages/i18n-resources/src/inspector/zh.json`
  - Add matching Chinese editor UI copy.
- Modify `packages/i18n-resources/src/errors/en.json`
  - Add file document error copy and suggestions.
- Modify `packages/i18n-resources/src/errors/zh.json`
  - Add matching Chinese file document error copy and suggestions.
- Modify `apps/desktop/package.json` and `yarn.lock`
  - Add CodeMirror packages using Yarn.

---

### Task 1: Shared Contracts, Router, And Preload

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/desktop/src/main/preload/api.ts`
- Modify: `apps/desktop/src/main/desktop-router.ts`
- Test: `apps/desktop/src/main/__tests__/shared-contracts.test.ts`
- Test: `apps/desktop/src/main/__tests__/desktop-router.test.ts`

**Interfaces:**
- Produces:
  - `conversationFilePathSchema`
  - `conversationFileReadInputSchema`
  - `conversationFileWriteInputSchema`
  - `conversationFileMetadataSchema`
  - `conversationFileReadResultSchema`
  - `conversationFileWriteResultSchema`
  - `ConversationFileReadInput`
  - `ConversationFileWriteInput`
  - `ConversationFileReadResult`
  - `ConversationFileWriteResult`
  - Desktop commands `readConversationFile` and `writeConversationFile`
  - Preload methods `window.teamcow.readConversationFile(input)` and `window.teamcow.writeConversationFile(input)`
- Consumes:
  - Existing `appErrorSchema`
  - Existing `desktopCommandSchema`
  - Existing `TeamcowDesktopApi`

- [ ] **Step 1: Add failing shared contract tests**

Add imports in `apps/desktop/src/main/__tests__/shared-contracts.test.ts`:

```ts
import {
  conversationFileReadInputSchema,
  conversationFileReadResultSchema,
  conversationFileWriteInputSchema,
  conversationFileWriteResultSchema
} from "@shared/index"
```

Add tests near the existing project files contract tests:

```ts
it("parses conversation file read and write contracts", () => {
  expect(conversationFileReadInputSchema.parse({
    conversationId: "conversation-1",
    filePath: "apps/desktop/src/renderer/app/shell/DesktopShell.tsx"
  })).toEqual({
    conversationId: "conversation-1",
    filePath: "apps/desktop/src/renderer/app/shell/DesktopShell.tsx"
  })

  expect(conversationFileReadInputSchema.parse({
    conversationId: "conversation-1",
    filePath: "packages/shared-types/src/index.ts",
    maxBytes: 262144
  })).toEqual({
    conversationId: "conversation-1",
    filePath: "packages/shared-types/src/index.ts",
    maxBytes: 262144
  })

  expect(() => conversationFileReadInputSchema.parse({
    conversationId: "conversation-1",
    filePath: "/tmp/outside.ts"
  })).toThrow()

  expect(() => conversationFileReadInputSchema.parse({
    conversationId: "conversation-1",
    filePath: "../outside.ts"
  })).toThrow()

  expect(conversationFileWriteInputSchema.parse({
    conversationId: "conversation-1",
    filePath: "README.md",
    content: "# TeamCow\n",
    precondition: { ifMatch: "rev-1" }
  })).toEqual({
    conversationId: "conversation-1",
    filePath: "README.md",
    content: "# TeamCow\n",
    precondition: { ifMatch: "rev-1" }
  })
})

it("parses conversation file read and write result states", () => {
  const file = {
    conversationId: "conversation-1",
    worktreeId: "worktree-1",
    filePath: "README.md",
    absolutePath: "/tmp/teamcow/README.md",
    byteLength: 12,
    modifiedAt: "2026-07-07T00:00:00.000Z",
    revision: "rev-1"
  }

  expect(conversationFileReadResultSchema.parse({
    status: "text",
    file,
    content: "# TeamCow\n",
    encoding: "utf-8"
  })).toMatchObject({ status: "text", content: "# TeamCow\n" })

  expect(conversationFileReadResultSchema.parse({
    status: "binary",
    file
  })).toMatchObject({ status: "binary" })

  expect(conversationFileReadResultSchema.parse({
    status: "too-large",
    file,
    limitBytes: 524288
  })).toMatchObject({ status: "too-large", limitBytes: 524288 })

  expect(conversationFileWriteResultSchema.parse({
    status: "saved",
    file: { ...file, revision: "rev-2" }
  })).toMatchObject({ status: "saved" })

  expect(conversationFileWriteResultSchema.parse({
    status: "conflict",
    file: { ...file, revision: "rev-3" },
    currentContent: "# Disk\n"
  })).toMatchObject({ status: "conflict", currentContent: "# Disk\n" })
})

it("parses conversation file desktop commands", () => {
  expect(desktopCommandSchema.parse({
    type: "readConversationFile",
    input: {
      conversationId: "conversation-1",
      filePath: "README.md"
    }
  })).toMatchObject({ type: "readConversationFile" })

  expect(desktopCommandSchema.parse({
    type: "writeConversationFile",
    input: {
      conversationId: "conversation-1",
      filePath: "README.md",
      content: "# TeamCow\n",
      precondition: { ifMatch: "rev-1" }
    }
  })).toMatchObject({ type: "writeConversationFile" })
})
```

- [ ] **Step 2: Run shared contract tests and verify failure**

Run:

```bash
yarn workspace @teamcow/desktop exec vitest run src/main/__tests__/shared-contracts.test.ts -t "conversation file"
```

Expected: FAIL because the new schemas are not exported.

- [ ] **Step 3: Add shared schemas and commands**

In `packages/shared-types/src/index.ts`, extend `appErrorCodeSchema` with these file-specific codes:

```ts
  "FILE_PATH_OUTSIDE_WORKTREE",
  "FILE_NOT_READABLE",
  "FILE_NOT_WRITABLE",
  "FILE_BINARY",
  "FILE_TOO_LARGE",
  "FILE_SAVE_CONFLICT",
  "FILE_RUN_ACTIVE_READONLY",
  "FILE_READ_FAILED",
  "FILE_WRITE_FAILED",
```

Extend `errorDomainSchema` with:

```ts
  "filesystem",
```

Add these schemas after `getProjectWorktreeFilesResultSchema`:

```ts
const relativePathSegmentSchema = z.string()
  .min(1)
  .refine((value) => value !== "." && value !== "..", "path segments must stay inside the worktree")

export const conversationFilePathSchema = z.string()
  .trim()
  .min(1)
  .refine((value) => !value.startsWith("/"), "file path must be relative")
  .refine((value) => !/^[A-Za-z]:[\\/]/.test(value), "file path must be relative")
  .refine((value) => value.split(/[\\/]+/).every((segment) => relativePathSegmentSchema.safeParse(segment).success), "file path must stay inside the worktree")

export const conversationFileReadInputSchema = z.object({
  conversationId: z.string().min(1),
  filePath: conversationFilePathSchema,
  maxBytes: z.number().int().positive().max(10 * 1024 * 1024).optional()
})
export type ConversationFileReadInput = z.infer<typeof conversationFileReadInputSchema>

export const conversationFileWriteInputSchema = z.object({
  conversationId: z.string().min(1),
  filePath: conversationFilePathSchema,
  content: z.string(),
  precondition: z.object({
    ifMatch: z.string().min(1)
  }).optional()
})
export type ConversationFileWriteInput = z.infer<typeof conversationFileWriteInputSchema>

export const conversationFileMetadataSchema = z.object({
  conversationId: z.string(),
  worktreeId: z.string(),
  filePath: conversationFilePathSchema,
  absolutePath: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  modifiedAt: z.string(),
  revision: z.string().min(1)
})
export type ConversationFileMetadata = z.infer<typeof conversationFileMetadataSchema>

export const conversationFileReadResultSchema = z.union([
  z.object({
    status: z.literal("text"),
    file: conversationFileMetadataSchema,
    content: z.string(),
    encoding: z.literal("utf-8")
  }),
  z.object({
    status: z.literal("binary"),
    file: conversationFileMetadataSchema
  }),
  z.object({
    status: z.literal("too-large"),
    file: conversationFileMetadataSchema,
    limitBytes: z.number().int().positive()
  }),
  z.object({
    status: z.literal("not-found"),
    conversationId: z.string(),
    filePath: conversationFilePathSchema
  }),
  z.object({
    status: z.literal("is-directory"),
    conversationId: z.string(),
    filePath: conversationFilePathSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type ConversationFileReadResult = z.infer<typeof conversationFileReadResultSchema>

export const conversationFileWriteResultSchema = z.union([
  z.object({
    status: z.literal("saved"),
    file: conversationFileMetadataSchema
  }),
  z.object({
    status: z.literal("conflict"),
    file: conversationFileMetadataSchema,
    currentContent: z.string().nullable()
  }),
  z.object({
    status: z.literal("not-found"),
    conversationId: z.string(),
    filePath: conversationFilePathSchema
  }),
  z.object({
    status: z.literal("readonly"),
    error: appErrorSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type ConversationFileWriteResult = z.infer<typeof conversationFileWriteResultSchema>
```

Add desktop command variants to `desktopCommandSchema` near the project files commands:

```ts
  z.object({
    type: z.literal("readConversationFile"),
    input: conversationFileReadInputSchema
  }),
  z.object({
    type: z.literal("writeConversationFile"),
    input: conversationFileWriteInputSchema
  }),
```

Add API methods to `TeamcowDesktopApi`:

```ts
  readConversationFile: (input: ConversationFileReadInput) => Promise<ConversationFileReadResult>
  writeConversationFile: (input: ConversationFileWriteInput) => Promise<ConversationFileWriteResult>
```

- [ ] **Step 4: Add preload methods**

In `apps/desktop/src/main/preload/api.ts`, add methods after `getProjectWorktreeFiles`:

```ts
  async readConversationFile(input) {
    return invokeDesktopCommand({ type: "readConversationFile", input })
  },
  async writeConversationFile(input) {
    return invokeDesktopCommand({ type: "writeConversationFile", input })
  },
```

- [ ] **Step 5: Add router cases and domain**

In `apps/desktop/src/main/desktop-router.ts`, import result schemas:

```ts
  conversationFileReadResultSchema,
  conversationFileWriteResultSchema,
```

Add command domains:

```ts
  readConversationFile: "filesystem",
  writeConversationFile: "filesystem",
```

Add switch cases after `getProjectWorktreeFiles`:

```ts
    case "readConversationFile":
      try {
        return conversationFileReadResultSchema.parse(
          services.projectService.readConversationFile(command.input)
        )
      } catch (err) {
        return conversationFileReadResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "writeConversationFile":
      try {
        return conversationFileWriteResultSchema.parse(
          services.projectService.writeConversationFile(command.input)
        )
      } catch (err) {
        return conversationFileWriteResultSchema.parse(createInternalErrorResult(err, command))
      }
```

- [ ] **Step 6: Add router tests and verify failure until service exists**

In `apps/desktop/src/main/__tests__/desktop-router.test.ts`, add service mocks in the existing router test factory:

```ts
const readConversationFile = vi.fn(() => ({
  status: "text" as const,
  file: {
    conversationId: "conversation-1",
    worktreeId: "worktree-1",
    filePath: "README.md",
    absolutePath: "/tmp/teamcow/README.md",
    byteLength: 12,
    modifiedAt: "2026-07-07T00:00:00.000Z",
    revision: "rev-1"
  },
  content: "# TeamCow\n",
  encoding: "utf-8" as const
}))

const writeConversationFile = vi.fn(() => ({
  status: "saved" as const,
  file: {
    conversationId: "conversation-1",
    worktreeId: "worktree-1",
    filePath: "README.md",
    absolutePath: "/tmp/teamcow/README.md",
    byteLength: 12,
    modifiedAt: "2026-07-07T00:00:01.000Z",
    revision: "rev-2"
  }
}))
```

Add assertions:

```ts
await expect(executeDesktopCommand(services, {
  type: "readConversationFile",
  input: { conversationId: "conversation-1", filePath: "README.md" }
})).resolves.toMatchObject({ status: "text", content: "# TeamCow\n" })

await expect(executeDesktopCommand(services, {
  type: "writeConversationFile",
  input: {
    conversationId: "conversation-1",
    filePath: "README.md",
    content: "# TeamCow\n",
    precondition: { ifMatch: "rev-1" }
  }
})).resolves.toMatchObject({ status: "saved" })

expect(readConversationFile).toHaveBeenCalledWith({ conversationId: "conversation-1", filePath: "README.md" })
expect(writeConversationFile).toHaveBeenCalledWith({
  conversationId: "conversation-1",
  filePath: "README.md",
  content: "# TeamCow\n",
  precondition: { ifMatch: "rev-1" }
})
```

Run:

```bash
yarn workspace @teamcow/desktop exec vitest run src/main/__tests__/shared-contracts.test.ts src/main/__tests__/desktop-router.test.ts -t "conversation file"
```

Expected: PASS after the service interface is accepted by TypeScript test doubles.

- [ ] **Step 7: Run typecheck for shared/router surface**

Run:

```bash
yarn workspace @teamcow/desktop typecheck
```

Expected: FAIL only because `ProjectService` has not yet returned `readConversationFile` and `writeConversationFile`. Task 2 will resolve that.

- [ ] **Step 8: Checkpoint without commit**

Run:

```bash
git status --short
```

Expected: modified shared-types, preload, router, and tests. Do not commit.

---

### Task 2: Conversation-Bound File Read/Write Service

**Files:**
- Modify: `apps/desktop/src/main/project-service.ts`
- Test: `apps/desktop/src/main/__tests__/project-service.test.ts`
- Modify: `packages/i18n-resources/src/errors/en.json`
- Modify: `packages/i18n-resources/src/errors/zh.json`

**Interfaces:**
- Consumes:
  - `ConversationFileReadInput`
  - `ConversationFileReadResult`
  - `ConversationFileWriteInput`
  - `ConversationFileWriteResult`
  - `conversationFileReadResultSchema`
  - `conversationFileWriteResultSchema`
- Produces:
  - `projectService.readConversationFile(input)`
  - `projectService.writeConversationFile(input)`

- [ ] **Step 1: Add failing service fixture and read-state tests**

In `apps/desktop/src/main/__tests__/project-service.test.ts`, extend the `node:fs` import with `readFileSync`, then add this fixture helper near the existing `seedWorktree` helper:

```ts
const createConversationFileFixture = async (input?: {
  runStatus?: string
  now?: string
  providerRunStatus?: "completed" | "running"
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
    runProvider: input?.providerRunStatus === "running"
      ? () => new Promise<ProviderRunResult>(() => undefined)
      : undefined
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
```

Add tests near the project file listing tests. Each test must call `service.close()` and remove its temp directories before it returns:

```ts
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

  expect(fixture.service.readConversationFile({
    conversationId: fixture.conversation.id,
    filePath: "binary.dat"
  })).toMatchObject({ status: "binary" })

  expect(fixture.service.readConversationFile({
    conversationId: fixture.conversation.id,
    filePath: "large.txt",
    maxBytes: 32
  })).toMatchObject({ status: "too-large", limitBytes: 32 })

  fixture.service.close()
  rmSync(fixture.userDataPath, { recursive: true, force: true })
  rmSync(fixture.repoRoot, { recursive: true, force: true })
})
```

- [ ] **Step 2: Add failing service tests for save states**

Add:

```ts
it("saves a text file when the revision matches", async () => {
  const fixture = await createConversationFileFixture()
  writeFileSync(join(fixture.repoRoot, "README.md"), "# Old\n", "utf8")
  const read = fixture.service.readConversationFile({ conversationId: fixture.conversation.id, filePath: "README.md" })
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

it("returns conflict when the disk revision changed before save", async () => {
  const fixture = await createConversationFileFixture()
  const absolutePath = join(fixture.repoRoot, "README.md")
  writeFileSync(absolutePath, "# Old\n", "utf8")
  const read = fixture.service.readConversationFile({ conversationId: fixture.conversation.id, filePath: "README.md" })
  expect(read.status).toBe("text")

  writeFileSync(absolutePath, "# Disk\n", "utf8")

  const result = fixture.service.writeConversationFile({
    conversationId: fixture.conversation.id,
    filePath: "README.md",
    content: "# Draft\n",
    precondition: { ifMatch: read.status === "text" ? read.file.revision : "" }
  })

  expect(result).toMatchObject({
    status: "conflict",
    currentContent: "# Disk\n"
  })
  expect(readFileSync(absolutePath, "utf8")).toBe("# Disk\n")

  fixture.service.close()
  rmSync(fixture.userDataPath, { recursive: true, force: true })
  rmSync(fixture.repoRoot, { recursive: true, force: true })
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
```

- [ ] **Step 3: Run service tests and verify failure**

Run:

```bash
yarn workspace @teamcow/desktop exec vitest run src/main/__tests__/project-service.test.ts -t "conversation-bound text file|conversation file paths|binary and too-large|saves a text file|disk revision|run is active"
```

Expected: FAIL because service methods are missing.

- [ ] **Step 4: Import file schemas and fs helpers**

In `apps/desktop/src/main/project-service.ts`, extend imports from `node:fs` with any missing helper. The current file already imports `readFileSync` and `statSync`; add `writeFileSync` when it is not present:

```ts
  writeFileSync,
```

Extend shared imports:

```ts
  conversationFileReadInputSchema,
  conversationFileReadResultSchema,
  conversationFileWriteInputSchema,
  conversationFileWriteResultSchema,
  type ConversationFileMetadata,
  type ConversationFileReadInput,
  type ConversationFileReadResult,
  type ConversationFileWriteInput,
  type ConversationFileWriteResult,
```

- [ ] **Step 5: Add host-side helpers**

Add near `isPathInsideRoot`:

```ts
const defaultConversationFileMaxBytes = 512 * 1024
const binaryProbeBytes = 8192

const normalizeConversationFilePath = (filePath: string) => filePath.split(/[\\/]+/).filter(Boolean).join("/")

const buildFileRevision = (realPath: string, stats: ReturnType<typeof statSync>) =>
  [
    "mtime",
    Math.trunc(stats.mtimeMs),
    "size",
    stats.size,
    "ino",
    stats.ino ?? 0,
    "path",
    realPath
  ].join(":")

const isBinaryBuffer = (buffer: Buffer) => {
  const limit = Math.min(buffer.length, binaryProbeBytes)
  for (let index = 0; index < limit; index += 1) {
    if (buffer[index] === 0) {
      return true
    }
  }
  return false
}
```

Add resolver inside `createProjectService` after `resolveConversationHandoffTarget` or immediately before it:

```ts
  const resolveConversationFileTarget = (conversationId: string, filePath: string) => {
    const conversation = getConversationById(conversationId)
    if (!conversation) {
      return {
        status: "error" as const,
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${conversationId}`, null, {
          domain: "filesystem",
          context: { conversationId }
        })
      }
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return {
        status: "error" as const,
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${conversation.worktreeId} was not found`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: conversation.worktreeId }
        })
      }
    }

    let worktreeRootPath: string
    try {
      worktreeRootPath = realpathSync(worktree.rootPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "WORKTREE_NOT_FOUND", `Worktree path could not be resolved: ${worktree.rootPath}`)
      }
    }

    if (isAbsolute(filePath)) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target must be relative: ${filePath}`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
        })
      }
    }

    const normalizedFilePath = normalizeConversationFilePath(filePath)
    const targetPath = resolve(worktreeRootPath, normalizedFilePath)
    if (!isPathInsideRoot(worktreeRootPath, targetPath)) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target is outside worktree: ${filePath}`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
        })
      }
    }

    if (!existsSync(targetPath)) {
      return {
        status: "not-found" as const,
        conversation,
        worktree,
        filePath: normalizedFilePath
      }
    }

    let realTargetPath: string
    try {
      realTargetPath = realpathSync(targetPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "PATH_NOT_FOUND", `File target path could not be resolved: ${targetPath}`)
      }
    }

    if (!isPathInsideRoot(worktreeRootPath, realTargetPath)) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target resolved outside worktree: ${filePath}`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
        })
      }
    }

    let stats: ReturnType<typeof statSync>
    try {
      stats = statSync(realTargetPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "PATH_NOT_FOUND", `File target path could not be inspected: ${realTargetPath}`)
      }
    }

    if (stats.isDirectory()) {
      return {
        status: "is-directory" as const,
        conversation,
        worktree,
        filePath: normalizedFilePath
      }
    }

    if (!stats.isFile()) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_NOT_READABLE", `File target is not a regular file: ${realTargetPath}`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
        })
      }
    }

    const file: ConversationFileMetadata = {
      conversationId,
      worktreeId: worktree.id,
      filePath: normalizedFilePath,
      absolutePath: realTargetPath,
      byteLength: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      revision: buildFileRevision(realTargetPath, stats)
    }

    return {
      status: "ok" as const,
      conversation,
      worktree,
      file
    }
  }
```

- [ ] **Step 6: Implement readConversationFile**

Add:

```ts
  const readConversationFile = (rawInput: ConversationFileReadInput): ConversationFileReadResult => {
    const input = conversationFileReadInputSchema.parse(rawInput)
    const target = resolveConversationFileTarget(input.conversationId, input.filePath)

    if (target.status === "not-found") {
      return conversationFileReadResultSchema.parse({
        status: "not-found",
        conversationId: input.conversationId,
        filePath: input.filePath
      })
    }

    if (target.status === "is-directory") {
      return conversationFileReadResultSchema.parse({
        status: "is-directory",
        conversationId: input.conversationId,
        filePath: input.filePath
      })
    }

    if (target.status === "error") {
      return conversationFileReadResultSchema.parse({
        status: "error",
        error: target.error
      })
    }

    const limitBytes = input.maxBytes ?? defaultConversationFileMaxBytes
    if (target.file.byteLength > limitBytes) {
      return conversationFileReadResultSchema.parse({
        status: "too-large",
        file: target.file,
        limitBytes
      })
    }

    try {
      const buffer = readFileSync(target.file.absolutePath)
      if (isBinaryBuffer(buffer)) {
        return conversationFileReadResultSchema.parse({
          status: "binary",
          file: target.file
        })
      }

      return conversationFileReadResultSchema.parse({
        status: "text",
        file: target.file,
        content: buffer.toString("utf8"),
        encoding: "utf-8"
      })
    } catch (err) {
      return conversationFileReadResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "FILE_READ_FAILED", `File could not be read: ${target.file.absolutePath}`)
      })
    }
  }
```

- [ ] **Step 7: Implement writeConversationFile**

Add:

```ts
  const writeConversationFile = (rawInput: ConversationFileWriteInput): ConversationFileWriteResult => {
    const input = conversationFileWriteInputSchema.parse(rawInput)
    const target = resolveConversationFileTarget(input.conversationId, input.filePath)

    if (target.status === "not-found") {
      return conversationFileWriteResultSchema.parse({
        status: "not-found",
        conversationId: input.conversationId,
        filePath: input.filePath
      })
    }

    if (target.status === "is-directory") {
      return conversationFileWriteResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_NOT_WRITABLE", `File target is a directory: ${input.filePath}`, null, {
          domain: "filesystem",
          context: { conversationId: input.conversationId }
        })
      })
    }

    if (target.status === "error") {
      return conversationFileWriteResultSchema.parse({
        status: "error",
        error: target.error
      })
    }

    if (target.conversation.runStatus === "running") {
      return conversationFileWriteResultSchema.parse({
        status: "readonly",
        error: buildAppError("FILE_RUN_ACTIVE_READONLY", "Conversation has an active provider run", null, {
          domain: "filesystem",
          context: {
            conversationId: target.conversation.id,
            conversationTitle: target.conversation.title,
            worktreeId: target.worktree.id,
            worktreeRootPath: target.worktree.rootPath
          }
        })
      })
    }

    let currentBuffer: Buffer
    try {
      currentBuffer = readFileSync(target.file.absolutePath)
    } catch (err) {
      return conversationFileWriteResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "FILE_READ_FAILED", `File could not be read before saving: ${target.file.absolutePath}`)
      })
    }

    if (isBinaryBuffer(currentBuffer)) {
      return conversationFileWriteResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_BINARY", `Binary file cannot be edited: ${target.file.filePath}`, null, {
          domain: "filesystem",
          context: { conversationId: target.conversation.id, worktreeId: target.worktree.id }
        })
      })
    }

    if (input.precondition?.ifMatch && input.precondition.ifMatch !== target.file.revision) {
      return conversationFileWriteResultSchema.parse({
        status: "conflict",
        file: target.file,
        currentContent: currentBuffer.length <= defaultConversationFileMaxBytes ? currentBuffer.toString("utf8") : null
      })
    }

    try {
      writeFileSync(target.file.absolutePath, input.content, "utf8")
      const nextStats = statSync(target.file.absolutePath)
      return conversationFileWriteResultSchema.parse({
        status: "saved",
        file: {
          ...target.file,
          byteLength: nextStats.size,
          modifiedAt: nextStats.mtime.toISOString(),
          revision: buildFileRevision(target.file.absolutePath, nextStats)
        }
      })
    } catch (err) {
      return conversationFileWriteResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "FILE_WRITE_FAILED", `File could not be saved: ${target.file.absolutePath}`)
      })
    }
  }
```

- [ ] **Step 8: Return service methods**

Add to the object returned by `createProjectService`:

```ts
    readConversationFile,
    writeConversationFile,
```

- [ ] **Step 9: Add localized error copy**

In `packages/i18n-resources/src/errors/en.json`, add:

```json
"FILE_PATH_OUTSIDE_WORKTREE": "TeamCow refused to access a file outside the conversation worktree.",
"FILE_NOT_READABLE": "The selected file cannot be read.",
"FILE_NOT_WRITABLE": "The selected file cannot be saved.",
"FILE_BINARY": "This file appears to be binary and cannot be edited inside TeamCow.",
"FILE_TOO_LARGE": "This file is too large to open in TeamCow.",
"FILE_SAVE_CONFLICT": "The file changed on disk before TeamCow saved your edit.",
"FILE_RUN_ACTIVE_READONLY": "The provider is currently running, so this file is read-only.",
"FILE_READ_FAILED": "TeamCow could not read the selected file.",
"FILE_WRITE_FAILED": "TeamCow could not save the selected file.",
"suggestion.FILE_PATH_OUTSIDE_WORKTREE": "Open files from the current conversation worktree only.",
"suggestion.FILE_NOT_READABLE": "Check file permissions or open the file in an external editor.",
"suggestion.FILE_NOT_WRITABLE": "Check file permissions or save the changes in an external editor.",
"suggestion.FILE_BINARY": "Use Open in editor to inspect or edit this file externally.",
"suggestion.FILE_TOO_LARGE": "Use Open in editor for large files.",
"suggestion.FILE_SAVE_CONFLICT": "Reload from disk, overwrite, or keep editing after reviewing the conflict.",
"suggestion.FILE_RUN_ACTIVE_READONLY": "Wait for the provider run to finish before saving manual edits.",
"suggestion.FILE_READ_FAILED": "Refresh Files or open the file externally.",
"suggestion.FILE_WRITE_FAILED": "Check local permissions and try saving again."
```

Add matching Chinese keys in `packages/i18n-resources/src/errors/zh.json`.

- [ ] **Step 10: Run targeted main tests**

Run:

```bash
yarn workspace @teamcow/desktop exec vitest run src/main/__tests__/shared-contracts.test.ts src/main/__tests__/desktop-router.test.ts src/main/__tests__/project-service.test.ts -t "conversation file|conversation-bound text file|disk revision|run is active"
```

Expected: PASS.

- [ ] **Step 11: Run typecheck**

Run:

```bash
yarn workspace @teamcow/desktop typecheck
```

Expected: PASS for main/shared surfaces.

- [ ] **Step 12: Checkpoint without commit**

Run:

```bash
git status --short
```

Expected: service, shared contract, router/preload, i18n, and tests modified. Do not commit.

---

### Task 3: Editor Tab Model

**Files:**
- Create: `apps/desktop/src/renderer/app/shell/editor/conversation-file-editor-model.ts`
- Create: `apps/desktop/src/renderer/app/shell/editor/conversation-file-editor-model.test.ts`

**Interfaces:**
- Produces:
  - `ConversationFileEditorTab`
  - `ConversationFileEditorState`
  - `createEditorTabId(conversationId, filePath)`
  - `openConversationFileTab(state, input)`
  - `pinConversationFileTab(state, tabId)`
  - `markConversationFileTabDirty(state, tabId, dirty)`
  - `closeConversationFileTab(state, tabId)`
  - `resetConversationFileTabsForConversation(state, conversationId)`
- Consumes:
  - `ConversationSummary["runStatus"]` in renderer tasks through state fields, not in pure model.

- [ ] **Step 1: Write model tests**

Create `apps/desktop/src/renderer/app/shell/editor/conversation-file-editor-model.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  closeConversationFileTab,
  createEmptyConversationFileEditorState,
  createEditorTabId,
  markConversationFileTabDirty,
  openConversationFileTab,
  pinConversationFileTab,
  resetConversationFileTabsForConversation
} from "./conversation-file-editor-model"

describe("conversation file editor model", () => {
  it("opens the first file as a preview tab", () => {
    const state = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })

    expect(state.activeTabId).toBe(createEditorTabId("conversation-1", "README.md"))
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0]).toMatchObject({ filePath: "README.md", pinned: false, dirty: false })
  })

  it("replaces a clean preview tab on single-click", () => {
    const first = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })
    const next = openConversationFileTab(first, {
      conversationId: "conversation-1",
      filePath: "src/index.ts",
      mode: "preview"
    })

    expect(next.tabs).toHaveLength(1)
    expect(next.tabs[0]).toMatchObject({ filePath: "src/index.ts", pinned: false })
  })

  it("auto-pins a dirty preview before opening another preview", () => {
    const first = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })
    const dirty = markConversationFileTabDirty(first, createEditorTabId("conversation-1", "README.md"), true)
    const next = openConversationFileTab(dirty, {
      conversationId: "conversation-1",
      filePath: "src/index.ts",
      mode: "preview"
    })

    expect(next.tabs).toHaveLength(2)
    expect(next.tabs.find((tab) => tab.filePath === "README.md")).toMatchObject({ pinned: true, dirty: true })
    expect(next.tabs.find((tab) => tab.filePath === "src/index.ts")).toMatchObject({ pinned: false, dirty: false })
  })

  it("pins a tab explicitly and prevents duplicate tabs", () => {
    const opened = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })
    const pinned = pinConversationFileTab(opened, createEditorTabId("conversation-1", "README.md"))
    const reopened = openConversationFileTab(pinned, {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "pinned"
    })

    expect(reopened.tabs).toHaveLength(1)
    expect(reopened.tabs[0]).toMatchObject({ pinned: true })
  })

  it("closes clean tabs and keeps dirty tabs blocked", () => {
    const opened = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })
    const dirty = markConversationFileTabDirty(opened, createEditorTabId("conversation-1", "README.md"), true)

    expect(closeConversationFileTab(dirty, createEditorTabId("conversation-1", "README.md"))).toMatchObject({
      status: "blocked-dirty"
    })
    expect(closeConversationFileTab(opened, createEditorTabId("conversation-1", "README.md"))).toMatchObject({
      status: "closed",
      state: { tabs: [], activeTabId: null }
    })
  })

  it("clears tabs when the active conversation changes", () => {
    const state = openConversationFileTab(createEmptyConversationFileEditorState(), {
      conversationId: "conversation-1",
      filePath: "README.md",
      mode: "preview"
    })

    expect(resetConversationFileTabsForConversation(state, "conversation-2")).toEqual(createEmptyConversationFileEditorState())
    expect(resetConversationFileTabsForConversation(state, "conversation-1")).toBe(state)
  })
})
```

- [ ] **Step 2: Run model tests and verify failure**

Run:

```bash
yarn workspace @teamcow/desktop exec vitest run src/renderer/app/shell/editor/conversation-file-editor-model.test.ts
```

Expected: FAIL because model file does not exist.

- [ ] **Step 3: Implement editor model**

Create `apps/desktop/src/renderer/app/shell/editor/conversation-file-editor-model.ts`:

```ts
export type ConversationFileEditorTab = {
  id: string
  conversationId: string
  filePath: string
  title: string
  pinned: boolean
  dirty: boolean
}

export type ConversationFileEditorState = {
  tabs: ConversationFileEditorTab[]
  activeTabId: string | null
}

export type OpenConversationFileTabInput = {
  conversationId: string
  filePath: string
  mode: "preview" | "pinned"
}

export const createEmptyConversationFileEditorState = (): ConversationFileEditorState => ({
  tabs: [],
  activeTabId: null
})

export const createEditorTabId = (conversationId: string, filePath: string) =>
  `${conversationId}:${filePath}`

const getFileTitle = (filePath: string) => {
  const parts = filePath.split("/")
  return parts.at(-1) || filePath
}

export const openConversationFileTab = (
  state: ConversationFileEditorState,
  input: OpenConversationFileTabInput
): ConversationFileEditorState => {
  const id = createEditorTabId(input.conversationId, input.filePath)
  const existing = state.tabs.find((tab) => tab.id === id)
  if (existing) {
    return {
      ...state,
      tabs: state.tabs.map((tab) => tab.id === id && input.mode === "pinned" ? { ...tab, pinned: true } : tab),
      activeTabId: id
    }
  }

  const nextTab: ConversationFileEditorTab = {
    id,
    conversationId: input.conversationId,
    filePath: input.filePath,
    title: getFileTitle(input.filePath),
    pinned: input.mode === "pinned",
    dirty: false
  }

  const cleanPreview = state.tabs.find((tab) => !tab.pinned && !tab.dirty)
  const tabs = cleanPreview
    ? state.tabs.map((tab) => tab.id === cleanPreview.id ? nextTab : tab)
    : [
        ...state.tabs.map((tab) => !tab.pinned && tab.dirty ? { ...tab, pinned: true } : tab),
        nextTab
      ]

  return {
    tabs,
    activeTabId: id
  }
}

export const pinConversationFileTab = (
  state: ConversationFileEditorState,
  tabId: string
): ConversationFileEditorState => ({
  ...state,
  tabs: state.tabs.map((tab) => tab.id === tabId ? { ...tab, pinned: true } : tab)
})

export const markConversationFileTabDirty = (
  state: ConversationFileEditorState,
  tabId: string,
  dirty: boolean
): ConversationFileEditorState => ({
  ...state,
  tabs: state.tabs.map((tab) =>
    tab.id === tabId
      ? { ...tab, dirty, pinned: dirty ? true : tab.pinned }
      : tab
  )
})

export const closeConversationFileTab = (
  state: ConversationFileEditorState,
  tabId: string
):
  | { status: "closed"; state: ConversationFileEditorState }
  | { status: "blocked-dirty"; tab: ConversationFileEditorTab } => {
  const target = state.tabs.find((tab) => tab.id === tabId)
  if (!target) {
    return { status: "closed", state }
  }
  if (target.dirty) {
    return { status: "blocked-dirty", tab: target }
  }

  const tabs = state.tabs.filter((tab) => tab.id !== tabId)
  const activeTabId = state.activeTabId === tabId
    ? tabs.at(-1)?.id ?? null
    : state.activeTabId

  return {
    status: "closed",
    state: { tabs, activeTabId }
  }
}

export const resetConversationFileTabsForConversation = (
  state: ConversationFileEditorState,
  conversationId: string | null
): ConversationFileEditorState => {
  if (!conversationId) {
    return state.tabs.length === 0 ? state : createEmptyConversationFileEditorState()
  }

  return state.tabs.every((tab) => tab.conversationId === conversationId)
    ? state
    : createEmptyConversationFileEditorState()
}
```

- [ ] **Step 4: Run model tests**

Run:

```bash
yarn workspace @teamcow/desktop exec vitest run src/renderer/app/shell/editor/conversation-file-editor-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint without commit**

Run:

```bash
git status --short
```

Expected: new editor model files. Do not commit.

---

### Task 4: CodeMirror Editor And Document Hook

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `yarn.lock`
- Create: `apps/desktop/src/renderer/app/shell/editor/language.ts`
- Create: `apps/desktop/src/renderer/app/shell/editor/CodeEditor.tsx`
- Create: `apps/desktop/src/renderer/app/shell/editor/use-conversation-file-document.ts`

**Interfaces:**
- Consumes:
  - `window.teamcow.readConversationFile`
  - `window.teamcow.writeConversationFile`
  - `ConversationFileEditorTab`
  - `ConversationFileReadResult`
  - `ConversationFileWriteResult`
- Produces:
  - `detectEditorLanguage(filePath)`
  - `CodeEditor`
  - `useConversationFileDocument(tab, isReadOnly)`
  - A document save function that resolves to `"saved"`, `"conflict"`, `"readonly"`, `"error"`, or `"skipped"` so dirty-close flows can save before closing.

- [ ] **Step 1: Add CodeMirror packages with Yarn**

Run:

```bash
yarn workspace @teamcow/desktop add @codemirror/commands @codemirror/lang-css @codemirror/lang-html @codemirror/lang-javascript @codemirror/lang-json @codemirror/lang-markdown @codemirror/language @codemirror/search @codemirror/state @codemirror/view
```

Expected: `apps/desktop/package.json` and `yarn.lock` update. No npm lockfile is created.

- [ ] **Step 2: Create language detection helper**

Create `apps/desktop/src/renderer/app/shell/editor/language.ts`:

```ts
export type EditorLanguage = "css" | "html" | "javascript" | "json" | "markdown" | "plain"

export const detectEditorLanguage = (filePath: string): EditorLanguage => {
  const normalized = filePath.toLowerCase()
  if (normalized.endsWith(".css")) return "css"
  if (normalized.endsWith(".html") || normalized.endsWith(".htm")) return "html"
  if (
    normalized.endsWith(".js") ||
    normalized.endsWith(".jsx") ||
    normalized.endsWith(".ts") ||
    normalized.endsWith(".tsx") ||
    normalized.endsWith(".mjs") ||
    normalized.endsWith(".cjs")
  ) return "javascript"
  if (normalized.endsWith(".json")) return "json"
  if (normalized.endsWith(".md") || normalized.endsWith(".mdx")) return "markdown"
  return "plain"
}
```

- [ ] **Step 3: Create CodeMirror wrapper**

Create `apps/desktop/src/renderer/app/shell/editor/CodeEditor.tsx`:

```tsx
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { css } from "@codemirror/lang-css"
import { html } from "@codemirror/lang-html"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { bracketMatching, indentOnInput } from "@codemirror/language"
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search"
import { Compartment, EditorState, type Extension } from "@codemirror/state"
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view"
import { useEffect, useRef } from "react"
import type { EditorLanguage } from "./language"

type CodeEditorProps = {
  value: string
  language: EditorLanguage
  readOnly: boolean
  onChange: (value: string) => void
  onSave: () => void
}

const languageExtensionFor = (language: EditorLanguage): Extension => {
  switch (language) {
    case "css":
      return css()
    case "html":
      return html()
    case "javascript":
      return javascript({ jsx: true, typescript: true })
    case "json":
      return json()
    case "markdown":
      return markdown()
    default:
      return []
  }
}

export const CodeEditor = ({ value, language, readOnly, onChange, onSave }: CodeEditorProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const languageCompartment = useRef(new Compartment()).current
  const editableCompartment = useRef(new Compartment()).current
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const externalUpdateRef = useRef(false)

  onChangeRef.current = onChange
  onSaveRef.current = onSave

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          languageCompartment.of(languageExtensionFor(language)),
          editableCompartment.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly)
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || externalUpdateRef.current) return
            onChangeRef.current(update.state.doc.toString())
          }),
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                onSaveRef.current()
                return true
              }
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap
          ])
        ]
      })
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: languageCompartment.reconfigure(languageExtensionFor(language)) })
  }, [language, languageCompartment])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editableCompartment.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly)
      ])
    })
  }, [editableCompartment, readOnly])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    externalUpdateRef.current = true
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value }
      })
    } finally {
      externalUpdateRef.current = false
    }
  }, [value])

  return <div className="file-code-editor" ref={hostRef} />
}
```

- [ ] **Step 4: Create document hook**

Create `apps/desktop/src/renderer/app/shell/editor/use-conversation-file-document.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ConversationFileEditorTab } from "./conversation-file-editor-model"
import type { ConversationFileMetadata } from "@shared/index"

type DocumentState =
  | { status: "idle" | "loading" }
  | { status: "text"; file: ConversationFileMetadata; content: string; draft: string; savedContent: string }
  | { status: "binary" | "too-large"; file: ConversationFileMetadata; limitBytes?: number }
  | { status: "not-found" | "is-directory" }
  | { status: "error"; message: string }

type SaveState =
  | { status: "idle" | "saving" | "saved" }
  | { status: "conflict"; currentContent: string | null }
  | { status: "error"; message: string }
  | { status: "readonly"; message: string }

type SaveOutcome = "saved" | "conflict" | "readonly" | "error" | "skipped"

export const useConversationFileDocument = (
  tab: ConversationFileEditorTab | null,
  readOnly: boolean
) => {
  const [document, setDocument] = useState<DocumentState>({ status: "idle" })
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" })
  const requestRef = useRef(0)

  useEffect(() => {
    if (!tab) {
      setDocument({ status: "idle" })
      setSaveState({ status: "idle" })
      return
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setDocument({ status: "loading" })
    setSaveState({ status: "idle" })

    void window.teamcow.readConversationFile({
      conversationId: tab.conversationId,
      filePath: tab.filePath
    }).then((result) => {
      if (requestRef.current !== requestId) return
      if (result.status === "text") {
        setDocument({
          status: "text",
          file: result.file,
          content: result.content,
          draft: result.content,
          savedContent: result.content
        })
        return
      }
      if (result.status === "binary") {
        setDocument({ status: "binary", file: result.file })
        return
      }
      if (result.status === "too-large") {
        setDocument({ status: "too-large", file: result.file, limitBytes: result.limitBytes })
        return
      }
      if (result.status === "not-found" || result.status === "is-directory") {
        setDocument({ status: result.status })
        return
      }
      setDocument({ status: "error", message: result.error.message })
    }).catch((error) => {
      if (requestRef.current !== requestId) return
      setDocument({ status: "error", message: error instanceof Error ? error.message : String(error) })
    })
  }, [tab?.id])

  const dirty = document.status === "text" && document.draft !== document.savedContent

  const setDraft = useCallback((draft: string) => {
    setDocument((current) => current.status === "text" ? { ...current, draft } : current)
    setSaveState({ status: "idle" })
  }, [])

  const save = useCallback(async (force = false): Promise<SaveOutcome> => {
    if (!tab || document.status !== "text") return "skipped"
    if (readOnly) {
      setSaveState({ status: "readonly", message: "Run active · read-only" })
      return "readonly"
    }

    setSaveState({ status: "saving" })
    const result = await window.teamcow.writeConversationFile({
      conversationId: tab.conversationId,
      filePath: tab.filePath,
      content: document.draft,
      precondition: force ? undefined : { ifMatch: document.file.revision }
    })

    if (result.status === "saved") {
      setDocument({
        status: "text",
        file: result.file,
        content: document.draft,
        draft: document.draft,
        savedContent: document.draft
      })
      setSaveState({ status: "saved" })
      return "saved"
    }
    if (result.status === "conflict") {
      setSaveState({ status: "conflict", currentContent: result.currentContent })
      return "conflict"
    }
    if (result.status === "readonly") {
      setSaveState({ status: "readonly", message: result.error.message })
      return "readonly"
    }
    setSaveState({
      status: "error",
      message: result.status === "error" ? result.error.message : "File was not found."
    })
    return "error"
  }, [document, readOnly, tab])

  const reloadFromDisk = useCallback(() => {
    if (!tab) return
    requestRef.current += 1
    setDocument({ status: "loading" })
    void window.teamcow.readConversationFile({
      conversationId: tab.conversationId,
      filePath: tab.filePath
    }).then((result) => {
      if (result.status === "text") {
        setDocument({
          status: "text",
          file: result.file,
          content: result.content,
          draft: result.content,
          savedContent: result.content
        })
        setSaveState({ status: "idle" })
      }
    })
  }, [tab])

  return useMemo(() => ({
    document,
    saveState,
    dirty,
    setDraft,
    save,
    reloadFromDisk,
    keepEditing: () => setSaveState({ status: "idle" }),
    overwrite: () => void save(true)
  }), [dirty, document, reloadFromDisk, save, saveState, setDraft])
}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
yarn workspace @teamcow/desktop typecheck
```

Expected: PASS or only failures from integration files that do not exist yet. Resolve import/type errors before Task 5.

- [ ] **Step 6: Checkpoint without commit**

Run:

```bash
git status --short
```

Expected: CodeMirror dependency changes and new editor files. Do not commit.

---

### Task 5: Editor Workspace UI

**Files:**
- Create: `apps/desktop/src/renderer/app/shell/editor/use-chat-editor-split.ts`
- Create: `apps/desktop/src/renderer/app/shell/editor/EditorTabs.tsx`
- Create: `apps/desktop/src/renderer/app/shell/editor/FileEditorPane.tsx`
- Create: `apps/desktop/src/renderer/app/shell/editor/EditorWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/styles.css`
- Modify: `packages/i18n-resources/src/inspector/en.json`
- Modify: `packages/i18n-resources/src/inspector/zh.json`

**Interfaces:**
- Consumes:
  - `ConversationFileEditorState`
  - `ConversationFileEditorTab`
  - `useConversationFileDocument`
  - `openConversationHandoff(input)`
- Produces:
  - `EditorWorkspace` component with props:
    - `conversation`
    - `editorState`
    - `onEditorStateChange`
    - `children`
    - `onOpenExternalFile(filePath)`

- [ ] **Step 1: Add i18n keys**

In `packages/i18n-resources/src/inspector/en.json`, add:

```json
"editor.title": "Editor",
"editor.save": "Save",
"editor.saved": "Saved",
"editor.saving": "Saving...",
"editor.unsaved": "Unsaved",
"editor.pin": "Pin tab",
"editor.close": "Close tab",
"editor.preview": "Preview",
"editor.open-external": "Open in editor",
"editor.readonly.run-active": "Run active · read-only",
"editor.loading": "Loading file...",
"editor.binary": "This binary file cannot be edited inside TeamCow.",
"editor.too-large": "This file is too large to open in TeamCow.",
"editor.not-found": "This file no longer exists.",
"editor.is-directory": "Folders cannot be edited.",
"editor.error": "File unavailable.",
"editor.conflict.title": "File changed on disk",
"editor.conflict.description": "Review the disk version before saving over it.",
"editor.conflict.reload": "Reload from disk",
"editor.conflict.overwrite": "Overwrite",
"editor.conflict.keep": "Keep editing",
"editor.close-dirty.title": "Save changes to {{file}}?",
"editor.close-dirty.description": "Your edits will be lost if you discard them.",
"editor.close-dirty.save": "Save",
"editor.close-dirty.discard": "Discard",
"editor.close-dirty.cancel": "Cancel"
```

Add matching keys to `packages/i18n-resources/src/inspector/zh.json`.

- [ ] **Step 2: Create split hook**

Create `apps/desktop/src/renderer/app/shell/editor/use-chat-editor-split.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react"

const STORAGE_KEY = "teamcow.layout.chatEditorRatio"
const DEFAULT_RATIO = 0.5
const MIN_RATIO = 0.32
const MAX_RATIO = 0.68

const clamp = (value: number) => Math.min(Math.max(value, MIN_RATIO), MAX_RATIO)

export const useChatEditorSplit = () => {
  const [ratio, setRatio] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_RATIO
    const value = Number.parseFloat(window.localStorage.getItem(STORAGE_KEY) ?? "")
    return Number.isFinite(value) ? clamp(value) : DEFAULT_RATIO
  })
  const dragRef = useRef<{ startX: number; startRatio: number; width: number; pointerId: number; target: HTMLElement } | null>(null)

  const startResize = useCallback((event: React.PointerEvent) => {
    const container = event.currentTarget.parentElement
    if (!container) return
    event.preventDefault()
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    dragRef.current = {
      startX: event.clientX,
      startRatio: ratio,
      width: container.getBoundingClientRect().width,
      pointerId: event.pointerId,
      target
    }
  }, [ratio])

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const deltaRatio = (event.clientX - drag.startX) / drag.width
      setRatio(clamp(drag.startRatio + deltaRatio))
    }

    const handleEnd = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (drag.target.hasPointerCapture(event.pointerId)) {
        drag.target.releasePointerCapture(event.pointerId)
      }
      dragRef.current = null
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleEnd)
    window.addEventListener("pointercancel", handleEnd)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleEnd)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(ratio))
  }, [ratio])

  return { ratio, startResize }
}
```

- [ ] **Step 3: Create EditorTabs**

Create `apps/desktop/src/renderer/app/shell/editor/EditorTabs.tsx`:

```tsx
import { faThumbtack, faXmark } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { useTranslation } from "react-i18next"
import type { ConversationFileEditorTab } from "./conversation-file-editor-model"

type EditorTabsProps = {
  tabs: ConversationFileEditorTab[]
  activeTabId: string | null
  onSelect: (tabId: string) => void
  onPin: (tabId: string) => void
  onClose: (tabId: string) => void
}

export const EditorTabs = ({ tabs, activeTabId, onSelect, onPin, onClose }: EditorTabsProps) => {
  const { t } = useTranslation("inspector")
  return (
    <div className="editor-tabs" role="tablist" aria-label={t("editor.title")}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTabId}
          className={`editor-tab${tab.id === activeTabId ? " active" : ""}${tab.pinned ? " pinned" : " preview"}`}
          data-testid={`editor-tab-${tab.filePath}`}
          onClick={() => onSelect(tab.id)}
          onDoubleClick={() => onPin(tab.id)}
          title={tab.filePath}
        >
          <span>{tab.title}{tab.dirty ? " *" : ""}</span>
          {!tab.pinned ? <small>{t("editor.preview")}</small> : null}
          <span
            role="button"
            tabIndex={0}
            aria-label={t("editor.pin")}
            className="editor-tab-icon"
            onClick={(event) => {
              event.stopPropagation()
              onPin(tab.id)
            }}
          >
            <FontAwesomeIcon icon={faThumbtack} />
          </span>
          <span
            role="button"
            tabIndex={0}
            aria-label={t("editor.close")}
            className="editor-tab-icon"
            onClick={(event) => {
              event.stopPropagation()
              onClose(tab.id)
            }}
          >
            <FontAwesomeIcon icon={faXmark} />
          </span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create FileEditorPane**

Create `apps/desktop/src/renderer/app/shell/editor/FileEditorPane.tsx`:

```tsx
import { faExternalLinkAlt, faSave } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import type { ConversationSummary } from "@shared/index"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { CodeEditor } from "./CodeEditor"
import type { ConversationFileEditorTab } from "./conversation-file-editor-model"
import { detectEditorLanguage } from "./language"
import { useConversationFileDocument } from "./use-conversation-file-document"

export type FileEditorPaneActions = {
  save: () => Promise<"saved" | "conflict" | "readonly" | "error" | "skipped">
}

type FileEditorPaneProps = {
  conversation: ConversationSummary
  tab: ConversationFileEditorTab
  active: boolean
  onDirtyChange: (tabId: string, dirty: boolean) => void
  onRegisterActions: (tabId: string, actions: FileEditorPaneActions | null) => void
  onOpenExternal: (filePath: string) => void
}

export const FileEditorPane = ({
  conversation,
  tab,
  active,
  onDirtyChange,
  onRegisterActions,
  onOpenExternal
}: FileEditorPaneProps) => {
  const { t } = useTranslation("inspector")
  const readOnly = conversation.runStatus === "running"
  const document = useConversationFileDocument(tab, readOnly)

  useEffect(() => {
    onDirtyChange(tab.id, document.dirty)
  }, [document.dirty, onDirtyChange, tab.id])

  useEffect(() => {
    onRegisterActions(tab.id, { save: document.save })
    return () => onRegisterActions(tab.id, null)
  }, [document.save, onRegisterActions, tab.id])

  const statusLabel = readOnly
    ? t("editor.readonly.run-active")
    : document.saveState.status === "saving"
      ? t("editor.saving")
      : document.dirty
        ? t("editor.unsaved")
        : t("editor.saved")

  return (
    <section
      className={`file-editor-pane${active ? " active" : ""}`}
      data-testid="file-editor-pane"
      hidden={!active}
    >
      <header className="file-editor-toolbar">
        <div className="file-editor-title">
          <strong title={tab.filePath}>{tab.filePath}</strong>
          <span>{statusLabel}</span>
        </div>
        <button
          className="file-editor-action"
          type="button"
          data-testid="file-editor-save"
          disabled={readOnly || document.document.status !== "text" || !document.dirty || document.saveState.status === "saving"}
          onClick={() => void document.save()}
        >
          <FontAwesomeIcon icon={faSave} />
          {t("editor.save")}
        </button>
        <button
          className="file-editor-action"
          type="button"
          data-testid="file-editor-open-external"
          onClick={() => onOpenExternal(tab.filePath)}
        >
          <FontAwesomeIcon icon={faExternalLinkAlt} />
          {t("editor.open-external")}
        </button>
      </header>

      {document.saveState.status === "conflict" ? (
        <div className="file-editor-conflict" data-testid="file-editor-conflict">
          <strong>{t("editor.conflict.title")}</strong>
          <span>{t("editor.conflict.description")}</span>
          <button type="button" onClick={document.reloadFromDisk}>{t("editor.conflict.reload")}</button>
          <button type="button" onClick={document.overwrite}>{t("editor.conflict.overwrite")}</button>
          <button type="button" onClick={document.keepEditing}>{t("editor.conflict.keep")}</button>
        </div>
      ) : null}

      <div className="file-editor-body">
        {document.document.status === "loading" || document.document.status === "idle" ? (
          <p className="file-editor-state">{t("editor.loading")}</p>
        ) : null}
        {document.document.status === "binary" ? <p className="file-editor-state">{t("editor.binary")}</p> : null}
        {document.document.status === "too-large" ? <p className="file-editor-state">{t("editor.too-large")}</p> : null}
        {document.document.status === "not-found" ? <p className="file-editor-state">{t("editor.not-found")}</p> : null}
        {document.document.status === "is-directory" ? <p className="file-editor-state">{t("editor.is-directory")}</p> : null}
        {document.document.status === "error" ? <p className="file-editor-state error">{document.document.message || t("editor.error")}</p> : null}
        {document.document.status === "text" ? (
          <CodeEditor
            value={document.document.draft}
            language={detectEditorLanguage(tab.filePath)}
            readOnly={readOnly}
            onChange={document.setDraft}
            onSave={() => void document.save()}
          />
        ) : null}
      </div>
      {document.document.status === "text" ? (
        <footer className="file-editor-status">
          <span>{detectEditorLanguage(tab.filePath)}</span>
          <span>UTF-8</span>
          <span>{document.document.file.byteLength} bytes</span>
        </footer>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 5: Create EditorWorkspace**

Create `apps/desktop/src/renderer/app/shell/editor/EditorWorkspace.tsx`:

```tsx
import type { ConversationSummary } from "@shared/index"
import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import {
  closeConversationFileTab,
  markConversationFileTabDirty,
  pinConversationFileTab,
  type ConversationFileEditorState
} from "./conversation-file-editor-model"
import { EditorTabs } from "./EditorTabs"
import { FileEditorPane, type FileEditorPaneActions } from "./FileEditorPane"
import { useChatEditorSplit } from "./use-chat-editor-split"

type EditorWorkspaceProps = {
  conversation: ConversationSummary | null
  editorState: ConversationFileEditorState
  onEditorStateChange: Dispatch<SetStateAction<ConversationFileEditorState>>
  onOpenExternalFile: (filePath: string) => void
  children: ReactNode
}

export const EditorWorkspace = ({
  conversation,
  editorState,
  onEditorStateChange,
  onOpenExternalFile,
  children
}: EditorWorkspaceProps) => {
  const { t } = useTranslation("inspector")
  const { ratio, startResize } = useChatEditorSplit()
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null)
  const paneActionsRef = useRef(new Map<string, FileEditorPaneActions>())
  const activeTab = editorState.tabs.find((tab) => tab.id === editorState.activeTabId) ?? editorState.tabs[0] ?? null

  if (!conversation || !activeTab) {
    return <>{children}</>
  }

  const discardTab = (tabId: string) => {
    onEditorStateChange((current) => {
      const nextTabs = current.tabs.filter((tab) => tab.id !== tabId)
      return {
        tabs: nextTabs,
        activeTabId: current.activeTabId === tabId ? nextTabs.at(-1)?.id ?? null : current.activeTabId
      }
    })
    setPendingCloseTabId(null)
  }

  const closeTab = (tabId: string) => {
    const result = closeConversationFileTab(editorState, tabId)
    if (result.status === "blocked-dirty") {
      onEditorStateChange((current) => ({ ...current, activeTabId: tabId }))
      setPendingCloseTabId(tabId)
      return
    }
    onEditorStateChange(result.state)
  }

  const saveAndClosePendingTab = async () => {
    if (!pendingCloseTabId) return
    const outcome = await paneActionsRef.current.get(pendingCloseTabId)?.save()
    if (outcome === "saved" || outcome === "skipped") {
      discardTab(pendingCloseTabId)
      return
    }
    setPendingCloseTabId(null)
  }

  return (
    <div
      className="editor-workspace"
      style={{
        "--chat-editor-ratio": String(ratio),
        "--editor-chat-ratio": String(1 - ratio)
      } as React.CSSProperties}
    >
      <div className="editor-workspace-chat">{children}</div>
      <div
        className="editor-workspace-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat and editor"
        onPointerDown={startResize}
      />
      <div className="editor-workspace-editor" data-testid="editor-workspace">
        <EditorTabs
          tabs={editorState.tabs}
          activeTabId={activeTab.id}
          onSelect={(tabId) => onEditorStateChange((current) => ({ ...current, activeTabId: tabId }))}
          onPin={(tabId) => onEditorStateChange((current) => pinConversationFileTab(current, tabId))}
          onClose={closeTab}
        />
        {editorState.tabs.map((tab) => (
          <FileEditorPane
            key={tab.id}
            conversation={conversation}
            tab={tab}
            active={tab.id === activeTab.id}
            onOpenExternal={onOpenExternalFile}
            onRegisterActions={(tabId, actions) => {
              if (actions) {
                paneActionsRef.current.set(tabId, actions)
                return
              }
              paneActionsRef.current.delete(tabId)
            }}
            onDirtyChange={(tabId, dirty) => {
              onEditorStateChange((current) => markConversationFileTabDirty(current, tabId, dirty))
            }}
          />
        ))}
      </div>
      {pendingCloseTabId ? (
        <div className="danger-confirmation" role="dialog" aria-modal="true" aria-labelledby="editor-dirty-close-title">
          <div className="danger-confirmation__inner">
            <h3 id="editor-dirty-close-title">
              {t("editor.close-dirty.title", { file: editorState.tabs.find((tab) => tab.id === pendingCloseTabId)?.title ?? "" })}
            </h3>
            <p>{t("editor.close-dirty.description")}</p>
            <div className="danger-confirmation__actions">
              <button type="button" onClick={() => setPendingCloseTabId(null)}>
                {t("editor.close-dirty.cancel")}
              </button>
              <button type="button" data-testid="editor-close-dirty-save" onClick={() => void saveAndClosePendingTab()}>
                {t("editor.close-dirty.save")}
              </button>
              <button
                type="button"
                className="btn danger"
                data-testid="editor-close-dirty-discard"
                onClick={() => discardTab(pendingCloseTabId)}
              >
                {t("editor.close-dirty.discard")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 6: Add CSS**

Append editor styles near inspector styles in `apps/desktop/src/renderer/styles.css`:

```css
.editor-workspace {
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns:
    minmax(320px, calc(var(--chat-editor-ratio, 0.5) * 100%))
    8px
    minmax(360px, calc(var(--editor-chat-ratio, 0.5) * 100%));
  overflow: hidden;
}

.editor-workspace-chat,
.editor-workspace-editor {
  min-width: 0;
  min-height: 0;
}

.editor-workspace-resizer {
  cursor: col-resize;
  border-left: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: color-mix(in srgb, var(--panel) 86%, var(--accent) 14%);
}

.editor-workspace-editor {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 92%, black 8%);
}

.editor-tabs {
  display: flex;
  align-items: stretch;
  gap: 1px;
  min-height: 40px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

.editor-tab {
  min-width: 120px;
  max-width: 220px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-right: 1px solid var(--border);
  color: var(--text-muted);
  background: transparent;
  padding: 0 10px;
}

.editor-tab.active {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.editor-tab span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-tab small {
  color: var(--text-subtle);
  font-size: 10px;
}

.editor-tab-icon {
  display: inline-flex;
  color: var(--text-subtle);
}

.file-editor-pane {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.file-editor-toolbar,
.file-editor-status {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border);
  padding: 8px 10px;
}

.file-editor-status {
  border-top: 1px solid var(--border);
  border-bottom: 0;
  color: var(--text-subtle);
  font-size: 11px;
}

.file-editor-title {
  min-width: 0;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
}

.file-editor-title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-editor-title span {
  color: var(--warning);
  font-size: 11px;
}

.file-editor-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--panel) 82%, var(--accent) 18%);
  color: var(--text);
  padding: 5px 8px;
}

.file-editor-action:disabled {
  opacity: 0.5;
}

.file-editor-body {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.file-code-editor,
.file-code-editor .cm-editor {
  height: 100%;
}

.file-code-editor .cm-scroller {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
}

.file-editor-state,
.file-editor-conflict {
  margin: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--panel) 88%, transparent);
}

.file-editor-state.error {
  color: var(--danger);
}

.file-editor-conflict {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 7: Run renderer typecheck**

Run:

```bash
yarn workspace @teamcow/desktop typecheck
```

Expected: PASS for new editor components.

- [ ] **Step 8: Checkpoint without commit**

Run:

```bash
git status --short
```

Expected: new editor UI files, styles, i18n, and package changes. Do not commit.

---

### Task 6: DesktopShell Files Integration

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
- Modify: `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`

**Interfaces:**
- Consumes:
  - `EditorWorkspace`
  - `createEmptyConversationFileEditorState`
  - `openConversationFileTab`
  - `resetConversationFileTabsForConversation`
  - Existing `openConversationHandoffTarget`
- Produces:
  - Files rows open internal editor on click.
  - Files rows pin editor tab on double-click.
  - Last editor tab closed restores Chat-only.

- [ ] **Step 1: Add failing DesktopShell tests for Chat-only and Files open**

In `DesktopShell.test.tsx`, extend `window.teamcow` mock with:

```ts
readConversationFile: vi.fn(async (input) => ({
  status: "text" as const,
  file: {
    conversationId: input.conversationId,
    worktreeId: "worktree-1",
    filePath: input.filePath,
    absolutePath: `/tmp/teamcow/${input.filePath}`,
    byteLength: 28,
    modifiedAt: "2026-07-07T00:00:00.000Z",
    revision: `rev-${input.filePath}`
  },
  content: "export const value = 1\n",
  encoding: "utf-8" as const
})),
writeConversationFile: vi.fn(async (input) => ({
  status: "saved" as const,
  file: {
    conversationId: input.conversationId,
    worktreeId: "worktree-1",
    filePath: input.filePath,
    absolutePath: `/tmp/teamcow/${input.filePath}`,
    byteLength: input.content.length,
    modifiedAt: "2026-07-07T00:00:01.000Z",
    revision: `saved-${input.filePath}`
  }
}))
```

Add tests:

```ts
it("keeps the center area Chat-only until a Files row is opened", async () => {
  window.teamcow.getAppContext = vi.fn(async () => selectionContext)
  const container = document.createElement("div")
  const root = await renderWithI18n(container, <DesktopShell />)

  expect(getByTestId(container, "chat-message-list")).toBeTruthy()
  expect(getByTestId(container, "editor-workspace")).toBeNull()

  await act(async () => root.unmount())
})

it("opens a project file inside the center editor workspace from Files", async () => {
  window.teamcow.getAppContext = vi.fn(async () => selectionContext)
  const container = document.createElement("div")
  const root = await renderWithI18n(container, <DesktopShell />)

  await clickElement(getByTestId(container, "inspector-tab-files"))
  await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main/project-service.ts"))

  expect(getByTestId(container, "editor-workspace")).toBeTruthy()
  expect(window.teamcow.readConversationFile).toHaveBeenCalledWith({
    conversationId: "conversation-2",
    filePath: "apps/desktop/src/main/project-service.ts"
  })
  expect(getByTestId(container, "file-editor-pane")?.textContent).toContain("project-service.ts")

  await act(async () => root.unmount())
})
```

- [ ] **Step 2: Run new tests and verify failure**

Run:

```bash
yarn workspace @teamcow/desktop exec vitest run src/renderer/app/shell/__tests__/DesktopShell.test.tsx -t "Chat-only|center editor workspace"
```

Expected: FAIL because editor workspace is not integrated.

- [ ] **Step 3: Add editor state imports and state**

In `DesktopShell.tsx`, import:

```ts
import { EditorWorkspace } from "./editor/EditorWorkspace"
import {
  createEmptyConversationFileEditorState,
  openConversationFileTab,
  resetConversationFileTabsForConversation,
  type ConversationFileEditorState
} from "./editor/conversation-file-editor-model"
```

Add state near other shell UI state:

```ts
  const [fileEditorState, setFileEditorState] = useState<ConversationFileEditorState>(() => createEmptyConversationFileEditorState())
```

Add reset on active conversation change:

```ts
  useEffect(() => {
    setFileEditorState((current) => resetConversationFileTabsForConversation(current, activeConversation?.id ?? null))
  }, [activeConversation?.id])
```

- [ ] **Step 4: Add open file handlers**

Add near `openInspectedWorktree`:

```ts
  const openFileInEditorWorkspace = (filePath: string, mode: "preview" | "pinned" = "preview") => {
    if (!inspectedConversation) {
      return
    }

    setFileEditorState((current) => openConversationFileTab(current, {
      conversationId: inspectedConversation.id,
      filePath,
      mode
    }))
  }

  const openEditorFileExternally = (filePath: string) => {
    if (!activeConversation) {
      return
    }

    void openConversationHandoffTarget({
      conversationId: activeConversation.id,
      target: "file",
      filePath
    })
  }
```

- [ ] **Step 5: Wire project file rows**

In the `inspector-project-file-${file.path}` file row, replace:

```tsx
onClick={() => openInspectedFile(file.path)}
```

with:

```tsx
onClick={() => openFileInEditorWorkspace(file.path, "preview")}
onDoubleClick={() => openFileInEditorWorkspace(file.path, "pinned")}
```

Remove `disabled={isHandoffPending("file", file.path)}` and `aria-busy` from Files tree file rows because click no longer starts external handoff.

- [ ] **Step 6: Wrap chat content in EditorWorkspace**

Inside the return where `<div className="chat-stream modern-chat-stream...">` currently renders directly, wrap the whole chat stream with:

```tsx
      <EditorWorkspace
        conversation={activeConversation}
        editorState={fileEditorState}
        onEditorStateChange={setFileEditorState}
        onOpenExternalFile={openEditorFileExternally}
      >
        <div
          className={`chat-stream modern-chat-stream${activeConversation ? " has-conversation" : ""}`}
          onScroll={handleChatStreamScroll}
        >
          {/* existing chat content remains here unchanged */}
        </div>
      </EditorWorkspace>
```

Keep the existing chat JSX unchanged inside the wrapper.

- [ ] **Step 7: Add dirty-close and run-active read-only tests**

Add a dirty-close test that edits a file, clicks its tab close button, and verifies the editor-owned dialog exposes `editor-close-dirty-save`, `editor-close-dirty-discard`, and cancel behavior. The save branch must call `window.teamcow.writeConversationFile`, close the tab after a saved result, and restore Chat-only when it was the last tab.

Add the run-active read-only test:

Before rendering that test, clone `selectionContext` so its active conversation has `runStatus: "running"`.

```ts
it("opens files read-only while the active conversation run is running", async () => {
  window.teamcow.getAppContext = vi.fn(async () => selectionContext)
  const container = document.createElement("div")
  const root = await renderWithI18n(container, <DesktopShell />)

  await clickElement(getByTestId(container, "inspector-tab-files"))
  await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main/project-service.ts"))

  expect(getByTestId(container, "file-editor-pane")?.textContent).toContain("Run active")
  expect(getByTestId(container, "file-editor-save")?.hasAttribute("disabled")).toBe(true)

  await act(async () => root.unmount())
})
```

- [ ] **Step 8: Run targeted DesktopShell tests**

Run:

```bash
yarn workspace @teamcow/desktop exec vitest run src/renderer/app/shell/__tests__/DesktopShell.test.tsx -t "Files|editor workspace|read-only|handoff"
```

Expected: PASS.

- [ ] **Step 9: Run renderer typecheck**

Run:

```bash
yarn workspace @teamcow/desktop typecheck
```

Expected: PASS.

- [ ] **Step 10: Checkpoint without commit**

Run:

```bash
git status --short
```

Expected: DesktopShell, tests, editor components, styles, and i18n modified. Do not commit.

---

### Task 7: Final Verification And Polish

**Files:**
- Modify only files needed to resolve verification failures.

**Interfaces:**
- Consumes all previous tasks.
- Produces a fully verified implementation with no commit.

- [ ] **Step 1: Run i18n check**

Run:

```bash
yarn i18n:check
```

Expected: PASS with all inspector/error keys mirrored in `en` and `zh`.

- [ ] **Step 2: Run targeted main and renderer suites**

Run:

```bash
yarn workspace @teamcow/desktop exec vitest run src/main/__tests__/shared-contracts.test.ts src/main/__tests__/desktop-router.test.ts src/main/__tests__/project-service.test.ts src/renderer/app/shell/editor/conversation-file-editor-model.test.ts src/renderer/app/shell/__tests__/DesktopShell.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
yarn workspace @teamcow/desktop lint
```

Expected: PASS. If literal UI copy errors appear, move text into `packages/i18n-resources/src/inspector/en.json` and `zh.json`.

- [ ] **Step 4: Run workspace typecheck**

Run:

```bash
yarn typecheck
```

Expected: PASS across desktop, shared-types, db, and i18n resources.

- [ ] **Step 5: Run broader tests**

Run:

```bash
yarn test
```

Expected: PASS.

- [ ] **Step 6: Run smoke when Electron UI risk remains**

Run only if layout or CodeMirror behavior looks risky after tests:

```bash
yarn workspace @teamcow/desktop smoke
```

Expected: PASS packaged desktop smoke.

- [ ] **Step 7: Manual sanity checklist**

Run `yarn dev` and verify:

- No open file: center area is Chat-only.
- Click Inspector Files file: center becomes `Chat | Editor`.
- Chat and Editor default to 50/50.
- Drag split handle changes ratio.
- Click another file: clean preview tab is replaced.
- Edit preview tab: tab becomes pinned and dirty.
- Save button writes and clears dirty state.
- Active provider run: editor is read-only.
- External editor button opens selected editor via existing handoff.
- Close last tab: center returns to Chat-only.

- [ ] **Step 8: Final status check without commit**

Run:

```bash
git status --short
```

Expected: implementation files are modified and uncommitted. Do not commit without explicit user permission.

---

## Plan Self-Review

- Spec coverage:
  - Built-in editor workspace: Tasks 4, 5, 6.
  - Chat-only when no file is open: Task 6 tests and integration.
  - 50/50 draggable split: Task 5 split hook and CSS, Task 6 tests.
  - Preview/pinned tabs and dirty behavior: Task 3 model, Task 5 UI, Task 6 integration.
  - Manual save and conflict: Task 2 service, Task 4 hook, Task 5 UI.
  - Run-active read-only: Task 2 service backstop, Task 5 UI, Task 6 test.
  - Conversation-bound file safety: Task 1 contracts, Task 2 service tests.
  - External editor retained: Task 5 UI, Task 6 integration.
  - i18n and visual target: Task 5 i18n/styles, Task 7 checks.
- Placeholder scan:
  - This plan uses concrete files, commands, and interfaces throughout.
- Type consistency:
  - Read/write schema names match service/router/preload method names.
  - Tab model names are used consistently by EditorWorkspace and DesktopShell.

## Execution Handoff

Plan complete and saved to `docs/design/plans/2026-07-07-files-editor-workspace.md`. Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Because this project forbids automatic commits for superpowers workflows, both options must keep changes uncommitted unless the user explicitly grants commit permission.
