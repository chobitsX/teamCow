# Chat Provider Output Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TeamCow chat preserve provider output from `run_events`, keep the main chat concise by default, and enforce provider running state so users can stop but cannot send or switch models mid-run.

**Architecture:** Keep the current schema: `run_events` remains the provider output fact source, `conversation_messages` remains a derived readable cache, and `execution_runs.model` records the actual model used per turn. Tighten main-process persistence and IPC contracts first, then update renderer assembly/classification and composer controls without introducing a new debug panel or database migration.

**Tech Stack:** Electron + React + TypeScript, zod-validated IPC over `teamcow:invoke`, SQLite + drizzle-orm, i18next, Vitest, yarn workspaces.

**Spec:** `docs/design/specs/2026-06-17-chat-provider-output-assessment-design.md`

---

## File Structure

### Modify

- `packages/shared-types/src/index.ts` — add explicit `cancelConversationRunInputSchema` and `cancelConversationRunResultSchema`; use them in `desktopCommandSchema` and `TeamcowDesktopApi`.
- `apps/desktop/src/main/desktop-router.ts` — parse `cancelConversationRun` results with the new schema.
- `apps/desktop/src/main/__tests__/shared-contracts.test.ts` — cover the new cancel command contract.
- `apps/desktop/src/main/__tests__/desktop-router.test.ts` — assert cancel routing validates and returns `{ status: "ok" | "not-running" }`.
- `apps/desktop/src/main/project-service.ts` — stop deduping streamed events, rebuild assistant cache from persisted `run_events`, reject send/model changes while running, and type cancel input/result.
- `apps/desktop/src/main/__tests__/project-service.test.ts` — cover streaming cache recovery, repeated identical deltas, running send guard, running model guard, and per-run model fixation across switches.
- `apps/desktop/src/main/services/provider-runtime-service.ts` — sanitize Codex raw payloads the same way Claude/OpenCode raw payloads are sanitized.
- `apps/desktop/src/main/__tests__/provider-runtime-service.test.ts` — cover Codex raw redaction/truncation.
- `apps/desktop/src/renderer/app/shell/chat-render-model.ts` — classify chat render items, treat assistant message cache as fallback, stop turning plain `run.progress` into tool events.
- `apps/desktop/src/renderer/app/shell/chat-render-model.test.ts` — cover assistant cache fallback/deduping and progress classification.
- `apps/desktop/src/renderer/app/shell/chat/ToolCallCard.tsx` — keep details collapsed by default and fix nested `<summary>` structure.
- `apps/desktop/src/renderer/app/shell/shell-store.ts` — expose `cancelConversationRun()` through `useShellContext()`.
- `apps/desktop/src/renderer/app/shell/DesktopShell.tsx` — disable submit/model selector while running, make Stop independent of provider readiness, add model source badges in composer model menu.
- `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx` — cover running composer behavior, stop, model selector disabled, model source badges, and folded details.
- `packages/i18n-resources/src/chat/en.json`
- `packages/i18n-resources/src/chat/zh.json`
- `packages/i18n-resources/src/shell/en.json`
- `packages/i18n-resources/src/shell/zh.json`

### Do Not Modify

- `packages/db/src/schema.ts` — existing columns already support the target model; no migration is needed.
- `packages/db/src/index.ts` — no schema migration for this change.
- Provider package boundaries — keep all runtime normalization in `provider-runtime-service.ts` for this pass.

---

## Task 1: Shared Cancel Contract And Router Validation

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/desktop/src/main/desktop-router.ts`
- Test: `apps/desktop/src/main/__tests__/shared-contracts.test.ts`
- Test: `apps/desktop/src/main/__tests__/desktop-router.test.ts`

- [ ] **Step 1.1: Write the failing shared contract tests**

Add these tests to `apps/desktop/src/main/__tests__/shared-contracts.test.ts` in the existing `desktopCommandSchema` describe block:

```typescript
it("parses cancelConversationRun commands", () => {
  expect(
    desktopCommandSchema.parse({
      type: "cancelConversationRun",
      input: { conversationId: "conversation-1" }
    })
  ).toEqual({
    type: "cancelConversationRun",
    input: { conversationId: "conversation-1" }
  })
})

it("rejects cancelConversationRun commands without a conversation id", () => {
  expect(() =>
    desktopCommandSchema.parse({
      type: "cancelConversationRun",
      input: { conversationId: "" }
    })
  ).toThrow()
})
```

If `desktopCommandSchema` is not already imported in that file, add it to the existing `@shared/index` import:

```typescript
import { desktopCommandSchema } from "@shared/index"
```

- [ ] **Step 1.2: Write the failing router test**

Add this test to `apps/desktop/src/main/__tests__/desktop-router.test.ts` near the other provider/conversation command tests:

```typescript
it("routes cancelConversationRun commands through the project service", async () => {
  const cancelConversationRun = vi.fn(async () => ({ status: "ok" as const }))

  const result = await executeDesktopCommand(
    {
      projectService: {
        cancelConversationRun
      } as never,
      providerRuntimeService: {} as never,
      customModelsService: {} as never,
      ...integrationServices
    },
    {
      type: "cancelConversationRun",
      input: {
        conversationId: "conversation-1"
      }
    }
  )

  expect(cancelConversationRun).toHaveBeenCalledWith({ conversationId: "conversation-1" })
  expect(result).toEqual({ status: "ok" })
})
```

- [ ] **Step 1.3: Run the targeted tests and confirm the contract is still inline**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/main/__tests__/shared-contracts.test.ts apps/desktop/src/main/__tests__/desktop-router.test.ts
```

Expected: the tests may still pass because the command currently uses an inline schema, but this step documents the current contract before replacing it with named schemas.

- [ ] **Step 1.4: Add named cancel schemas**

In `packages/shared-types/src/index.ts`, immediately after `sendConversationMessageResultSchema` / `SendConversationMessageResult`, add:

```typescript
export const cancelConversationRunInputSchema = z.object({
  conversationId: z.string().min(1)
})
export type CancelConversationRunInput = z.infer<typeof cancelConversationRunInputSchema>

export const cancelConversationRunResultSchema = z.object({
  status: z.enum(["ok", "not-running"])
})
export type CancelConversationRunResult = z.infer<typeof cancelConversationRunResultSchema>
```

- [ ] **Step 1.5: Use named schemas in `desktopCommandSchema` and `TeamcowDesktopApi`**

Replace the current inline cancel command object near the end of `desktopCommandSchema`:

```typescript
z.object({ type: z.literal("cancelConversationRun"), input: z.object({ conversationId: z.string().min(1) }) })
```

with:

```typescript
z.object({
  type: z.literal("cancelConversationRun"),
  input: cancelConversationRunInputSchema
})
```

Then replace the API method type:

```typescript
cancelConversationRun: (input: { conversationId: string }) => Promise<{ status: "ok" | "not-running" }>
```

with:

```typescript
cancelConversationRun: (input: CancelConversationRunInput) => Promise<CancelConversationRunResult>
```

- [ ] **Step 1.6: Parse cancel results in the desktop router**

In `apps/desktop/src/main/desktop-router.ts`, add `cancelConversationRunResultSchema` to the `@shared/index` import list:

```typescript
cancelConversationRunResultSchema,
```

Then replace the `cancelConversationRun` case:

```typescript
case "cancelConversationRun":
  return services.projectService.cancelConversationRun(command.input)
```

with:

```typescript
case "cancelConversationRun":
  return cancelConversationRunResultSchema.parse(
    await services.projectService.cancelConversationRun(command.input)
  )
```

- [ ] **Step 1.7: Run contract and router tests**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/main/__tests__/shared-contracts.test.ts apps/desktop/src/main/__tests__/desktop-router.test.ts
```

Expected: PASS.

- [ ] **Step 1.8: Commit**

```bash
git add packages/shared-types/src/index.ts apps/desktop/src/main/desktop-router.ts apps/desktop/src/main/__tests__/shared-contracts.test.ts apps/desktop/src/main/__tests__/desktop-router.test.ts
git commit -m "feat(shared-types): add cancel conversation run contract"
```

---

## Task 2: Main Persistence Fact Source And Running Guards

**Files:**
- Modify: `apps/desktop/src/main/project-service.ts`
- Test: `apps/desktop/src/main/__tests__/project-service.test.ts`

- [ ] **Step 2.1: Write streaming assistant cache regression tests**

Add these tests to `apps/desktop/src/main/__tests__/project-service.test.ts` after `persists streaming provider events for concurrent conversations before either run completes`:

```typescript
it("persists assistant cache from streamed deltas when final provider result clears events", async () => {
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
          type: "run.started",
          status: "running",
          payload: {
            provider: input.provider,
            conversationId: input.conversationId,
            runId: input.runId,
            worktreeId: input.worktreeId,
            worktreeRootPath: input.worktreeRootPath,
            rawType: "stream.started"
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
            text: "ha"
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
            text: "ha"
          }
        })

        return { status: "completed", events: [] }
      },
      now: () => "2026-06-17T09:00:00.000Z"
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
      content: "Stream repeated text"
    })
    if (sent.status !== "accepted") throw new Error("expected accepted send")

    const completed = await waitForConversationRunStatus(service, created.conversation.id, "completed")
    const assistantMessages = completed.timeline.messages.filter((message) => message.role === "assistant")
    const deltaEvents = completed.timeline.events.filter((event) => event.type === "run.message.delta")

    expect(deltaEvents.map((event) => event.payload.text)).toEqual(["ha", "ha"])
    expect(assistantMessages).toEqual([
      expect.objectContaining({
        role: "assistant",
        content: "haha",
        model: "gpt-5.5",
        runId: sent.timeline.runs[0].id
      })
    ])
  } finally {
    closeService(service)
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

it("prefers streamed deltas over completed messages when writing assistant cache", async () => {
  const userDataPath = createTempDir("teamcow-stream-cache-prefer-delta-")
  const repoRoot = createTempDir("teamcow-stream-cache-prefer-delta-repo-")
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
            text: "delta text"
          }
        })
        return {
          status: "completed",
          events: [
            {
              type: "run.message.completed",
              payload: {
                provider: input.provider,
                conversationId: input.conversationId,
                runId: input.runId,
                worktreeId: input.worktreeId,
                worktreeRootPath: input.worktreeRootPath,
                rawType: "stream.completed-message",
                text: "delta text duplicated"
              }
            },
            {
              type: "run.completed",
              status: "completed",
              payload: { status: "completed" }
            }
          ]
        }
      }
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

    await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Do not duplicate completed text"
    })

    const completed = await waitForConversationRunStatus(service, created.conversation.id, "completed")
    expect(completed.timeline.messages.filter((message) => message.role === "assistant")).toEqual([
      expect.objectContaining({
        content: "delta text"
      })
    ])
  } finally {
    closeService(service)
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2.2: Write running guard and model fixation tests**

Add these tests near the existing `setConversationModel` tests:

```typescript
it("rejects sending a new message while the conversation is running", async () => {
  const userDataPath = createTempDir("teamcow-running-send-guard-")
  const repoRoot = createTempDir("teamcow-running-send-guard-repo-")
  makeGitRepo(repoRoot)
  let releaseRun: (() => void) | null = null
  let service: ReturnType<typeof createProjectService> | null = null

  try {
    service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      runProvider: async (): Promise<ProviderRunResult> => {
        await new Promise<void>((resolve) => {
          releaseRun = resolve
        })
        return { status: "completed", events: [] }
      }
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
      content: "First running prompt"
    })
    expect(first.status).toBe("accepted")

    const second = await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Second prompt should be blocked"
    })
    expect(second.status).toBe("error")
    if (second.status !== "error") throw new Error("expected error")
    expect(second.error.code).toBe("PROVIDER_NOT_READY")

    const timeline = service.getConversationTimeline(created.conversation.id)
    expect(timeline.status).toBe("ok")
    if (timeline.status !== "ok") throw new Error("expected timeline")
    expect(timeline.timeline.runs).toHaveLength(1)
    expect(timeline.timeline.messages.filter((message) => message.role === "user")).toHaveLength(1)
  } finally {
    releaseRun?.()
    closeService(service)
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

it("rejects setConversationModel while the conversation is running", async () => {
  const userDataPath = createTempDir("teamcow-running-model-guard-")
  const repoRoot = createTempDir("teamcow-running-model-guard-repo-")
  makeGitRepo(repoRoot)
  let releaseRun: (() => void) | null = null
  let service: ReturnType<typeof createProjectService> | null = null

  try {
    service = createProjectService({
      userDataPath,
      pickProjectDirectory: async () => null,
      confirmGitInit: async () => false,
      gitBinaryAvailable: () => false,
      initializeGit: () => null,
      runProvider: async (): Promise<ProviderRunResult> => {
        await new Promise<void>((resolve) => {
          releaseRun = resolve
        })
        return { status: "completed", events: [] }
      }
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

    await service.sendConversationMessage({
      conversationId: created.conversation.id,
      content: "Keep model locked while running"
    })

    const updated = await service.setConversationModel({
      conversationId: created.conversation.id,
      model: "gpt-5.4-mini"
    })
    expect(updated.status).toBe("error")
    if (updated.status !== "error") throw new Error("expected error")
    expect(updated.error.code).toBe("PROVIDER_NOT_READY")
    expect(service.getCurrentConversation()?.currentModel).toBe("gpt-5.5")
  } finally {
    releaseRun?.()
    closeService(service)
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2.3: Run the project-service tests and verify failure**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/main/__tests__/project-service.test.ts
```

Expected: FAIL. Current code dedupes identical streamed deltas, writes assistant cache from `providerRun.events`, allows running sends, and allows running model switches.

- [ ] **Step 2.4: Add helpers to rebuild assistant text from persisted run events**

In `apps/desktop/src/main/project-service.ts`, near `createProviderRunEventKey`, add:

```typescript
const getProviderMessageText = (payload: Record<string, unknown>) => {
  const text = payload.text
  if (typeof text === "string") {
    return text
  }

  const delta = payload.delta
  if (typeof delta === "string") {
    return delta
  }

  const raw = parseJsonRecord(JSON.stringify(payload.raw ?? {}))
  const item = raw.item && typeof raw.item === "object" && !Array.isArray(raw.item)
    ? raw.item as Record<string, unknown>
    : null
  const itemText = item?.text
  const itemMessage = item?.message
  return typeof itemText === "string"
    ? itemText
    : typeof itemMessage === "string"
      ? itemMessage
      : ""
}

const buildAssistantTextFromRunEvents = (events: RunEventRow[]) => {
  const sorted = [...events].sort((left, right) => left.sequence - right.sequence)
  const deltas = sorted
    .filter((event) => event.type === "run.message.delta")
    .map((event) => getProviderMessageText(parseJsonRecord(event.payload)))
  const deltaText = deltas.join("")
  if (deltaText.trim().length > 0) {
    return deltaText
  }

  return sorted
    .filter((event) => event.type === "run.message.completed")
    .map((event) => getProviderMessageText(parseJsonRecord(event.payload)))
    .join("")
}
```

If `RunEventRow` is already in scope as a local type, reuse it. If TypeScript reports `parseJsonRecord` cannot be used before declaration, move this helper below `parseJsonRecord` and above `persistProviderRun`.

- [ ] **Step 2.5: Stop deduping streamed events**

In `persistProviderRun()`, keep `streamedEventKeys` for final-result de-duplication, but remove the early return from the `onEvent` handler. Replace:

```typescript
const eventKey = createProviderRunEventKey(event)
if (streamedEventKeys.has(eventKey)) {
  return
}

streamedEventKeys.add(eventKey)
appendRunEvent({
```

with:

```typescript
streamedEventKeys.add(createProviderRunEventKey(event))
appendRunEvent({
```

This preserves repeated identical streaming deltas while still skipping duplicate final `providerRun.events`.

- [ ] **Step 2.6: Rebuild assistant cache from persisted events**

Replace the current `assistantText` block in `persistProviderRun()`:

```typescript
const assistantText = providerRun.events
  .filter((e) => e.type === "run.message.delta" || e.type === "run.message.completed")
  .map((e) => {
    const text = typeof e.payload.text === "string" ? e.payload.text :
                 typeof e.payload.delta === "string" ? e.payload.delta : ""
    return text
  })
  .join("")

if (assistantText.trim().length > 0 && providerRun.status === "completed") {
  database.db.insert(conversationMessagesTable).values({
    id: randomUUID(),
    conversationId: providerInput.conversationId,
    role: "assistant",
    content: assistantText,
    model: providerInput.model,
    runId: providerInput.runId,
    createdAt: now()
  }).run()
}
```

with:

```typescript
const persistedEvents = database.db
  .select()
  .from(runEventsTable)
  .where(eq(runEventsTable.runId, providerInput.runId))
  .all() as RunEventRow[]
const assistantText = buildAssistantTextFromRunEvents(persistedEvents)
const existingAssistantMessage = database.db
  .select()
  .from(conversationMessagesTable)
  .where(eq(conversationMessagesTable.runId, providerInput.runId))
  .all()
  .some((message) => message.role === "assistant")

if (!existingAssistantMessage && assistantText.trim().length > 0 && providerRun.status === "completed") {
  database.db.insert(conversationMessagesTable).values({
    id: randomUUID(),
    conversationId: providerInput.conversationId,
    role: "assistant",
    content: assistantText,
    model: providerInput.model,
    runId: providerInput.runId,
    createdAt: now()
  }).run()
}
```

- [ ] **Step 2.7: Add running guards to send and model changes**

In `sendConversationMessage()`, after the conversation existence check and before reading the worktree, add:

```typescript
if (conversation.runStatus === "running") {
  return sendConversationMessageResultSchema.parse({
    status: "error",
    error: buildAppError(
      "PROVIDER_NOT_READY",
      `Conversation ${input.conversationId} already has a running provider run`
    )
  })
}
```

In `setConversationModel()`, after the conversation existence check and before provider parsing, add:

```typescript
if (conversation.runStatus === "running") {
  return setConversationModelResultSchema.parse({
    status: "error",
    error: buildAppError(
      "PROVIDER_NOT_READY",
      `Model changes are disabled while conversation ${input.conversationId} is running`
    )
  })
}
```

- [ ] **Step 2.8: Type `cancelConversationRun()` with the named schemas**

Add the new imports from `@shared/index`:

```typescript
cancelConversationRunInputSchema,
cancelConversationRunResultSchema,
type CancelConversationRunInput,
type CancelConversationRunResult,
```

Then replace the cancel function signature:

```typescript
const cancelConversationRun = async (
  input: { conversationId: string }
): Promise<{ status: "ok" | "not-running" }> => {
```

with:

```typescript
const cancelConversationRun = async (
  rawInput: CancelConversationRunInput
): Promise<CancelConversationRunResult> => {
  const input = cancelConversationRunInputSchema.parse(rawInput)
```

Wrap its two return shapes with `cancelConversationRunResultSchema.parse(...)`:

```typescript
return cancelConversationRunResultSchema.parse({ status: "not-running" })
```

and:

```typescript
return cancelConversationRunResultSchema.parse({ status: "ok" })
```

- [ ] **Step 2.9: Run the project-service tests**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/main/__tests__/project-service.test.ts
```

Expected: PASS.

- [ ] **Step 2.10: Commit**

```bash
git add apps/desktop/src/main/project-service.ts apps/desktop/src/main/__tests__/project-service.test.ts
git commit -m "fix(chat): preserve streamed assistant output from run events"
```

---

## Task 3: Codex Raw Payload Redaction

**Files:**
- Modify: `apps/desktop/src/main/services/provider-runtime-service.ts`
- Test: `apps/desktop/src/main/__tests__/provider-runtime-service.test.ts`

- [ ] **Step 3.1: Write the failing Codex redaction test**

Add this test near `redacts secrets and truncates oversized OpenCode diagnostics before persistence`:

```typescript
it("redacts secrets and truncates oversized Codex raw payloads before persistence", async () => {
  const service = createProviderRuntimeService({
    providers: [
      {
        kind: "codex",
        command: "codex",
        minimumVersion: "0.0.0"
      }
    ],
    runCommand: () => ({
      stdout: [
        JSON.stringify({
          type: "item.completed",
          item: {
            type: "agent_message",
            text: "Codex responded",
            token: "sk-codex-secret",
            output: `OPENAI_API_KEY=sk-codex-output ${"x".repeat(5000)}`
          }
        }),
        JSON.stringify({ type: "turn.completed" })
      ].join("\n"),
      stderr: "",
      status: 0
    })
  })

  const result = await service.runProvider({
    provider: "codex",
    model: "gpt-5.5",
    prompt: "Do not leak Codex secrets",
    worktreeRootPath: "/tmp/teamcow-codex-worktree",
    worktreeId: "worktree-codex",
    conversationId: "conversation-codex",
    runId: "run-codex"
  })

  const persisted = JSON.stringify(result.events)
  expect(result.status).toBe("completed")
  expect(persisted).toContain("Codex responded")
  expect(persisted).not.toContain("sk-codex-secret")
  expect(persisted).not.toContain("sk-codex-output")
  expect(persisted).toContain("[REDACTED]")
  expect(persisted).toContain("[TRUNCATED")
  expect(persisted.length).toBeLessThan(5000)
})
```

- [ ] **Step 3.2: Run the provider runtime test and verify failure**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/main/__tests__/provider-runtime-service.test.ts
```

Expected: FAIL because `normalizeCodexEvent()` currently stores `raw: rawEvent`.

- [ ] **Step 3.3: Sanitize Codex base payload raw**

In `apps/desktop/src/main/services/provider-runtime-service.ts`, inside `normalizeCodexEvent()`, replace:

```typescript
raw: rawEvent
```

with:

```typescript
raw: sanitizeProviderPayload(rawEvent)
```

- [ ] **Step 3.4: Run provider runtime tests**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/main/__tests__/provider-runtime-service.test.ts apps/desktop/src/main/services/__tests__/provider-runtime-service.list-models.test.ts
```

Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add apps/desktop/src/main/services/provider-runtime-service.ts apps/desktop/src/main/__tests__/provider-runtime-service.test.ts
git commit -m "fix(provider): redact codex raw payloads"
```

---

## Task 4: Chat Render Model Classification And Assistant Cache Fallback

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/chat-render-model.ts`
- Modify: `apps/desktop/src/renderer/app/shell/chat/ToolCallCard.tsx`
- Test: `apps/desktop/src/renderer/app/shell/chat-render-model.test.ts`

- [ ] **Step 4.1: Write assistant cache and progress classification tests**

Add these tests to `apps/desktop/src/renderer/app/shell/chat-render-model.test.ts` after the existing delta/completed fallback tests:

```typescript
it("uses provider text events over assistant message cache for the same run", () => {
  const items = buildChatRenderItems(timeline({
    messages: [
      {
        id: "message-user",
        conversationId: "conversation-1",
        role: "user",
        content: "Generate a patch",
        model: "gpt-5.5",
        runId: "run-1",
        createdAt: "2026-05-20T10:00:00.000Z"
      },
      {
        id: "message-assistant-cache",
        conversationId: "conversation-1",
        role: "assistant",
        content: "Cached assistant text",
        model: "gpt-5.5",
        runId: "run-1",
        createdAt: "2026-05-20T10:00:03.000Z"
      }
    ],
    runs: [run("run-1", "completed")],
    events: [
      event("event-1", "run-1", 1, "run.message.delta", { text: "Event assistant text" })
    ]
  }))

  expect(items.filter((item) => item.kind === "user-message")).toHaveLength(1)
  expect(items.filter((item) => item.kind === "provider-message")).toEqual([
    expect.objectContaining({
      content: "Event assistant text",
      eventIds: ["event-1"]
    })
  ])
  expect(items.map((item) => "content" in item ? item.content : "")).not.toContain("Cached assistant text")
})

it("falls back to assistant message cache when provider text events are missing", () => {
  const items = buildChatRenderItems(timeline({
    messages: [
      {
        id: "message-assistant-cache",
        conversationId: "conversation-1",
        role: "assistant",
        content: "Cached assistant text",
        model: "gpt-5.5",
        runId: "run-1",
        createdAt: "2026-05-20T10:00:03.000Z"
      }
    ],
    runs: [run("run-1", "completed")],
    events: [
      event("event-1", "run-1", 1, "run.completed", { rawType: "turn.completed" })
    ]
  }))

  expect(items.filter((item) => item.kind === "user-message")).toHaveLength(0)
  expect(items.filter((item) => item.kind === "provider-message")).toEqual([
    expect.objectContaining({
      id: "provider-message-assistant-cache",
      content: "Cached assistant text",
      eventIds: []
    })
  ])
})

it("does not render plain provider progress as tool activity", () => {
  const items = buildChatRenderItems(timeline({
    runs: [run("run-1", "completed")],
    events: [
      event("event-1", "run-1", 1, "run.started", { rawType: "thread.started" }),
      event("event-2", "run-1", 2, "run.progress", { rawType: "turn.started" }),
      event("event-3", "run-1", 3, "run.completed", { rawType: "turn.completed" })
    ]
  }))

  expect(items.map((item) => item.kind)).toEqual(["system-summary", "system-summary"])
  expect(items.some((item) => item.kind === "tool-event")).toBe(false)
})
```

Also update the existing `maps timeline messages and normalized run events into stable chat render items` expectation from:

```typescript
expect(items.map((item) => item.kind)).toEqual([
  "user-message",
  "system-summary",
  "tool-event",
  "provider-message",
  "system-summary"
])
```

to:

```typescript
expect(items.map((item) => item.kind)).toEqual([
  "user-message",
  "system-summary",
  "provider-message",
  "system-summary"
])
```

and update the provider/system index assertions in that test to use `items[2]` and `items[3]`.

- [ ] **Step 4.2: Run render model tests and verify failure**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/renderer/app/shell/chat-render-model.test.ts
```

Expected: FAIL because assistant cache is treated as user and plain progress is treated as tool.

- [ ] **Step 4.3: Add local display classification to chat render items**

In `apps/desktop/src/renderer/app/shell/chat-render-model.ts`, add after imports:

```typescript
export type ChatDisplayClass =
  | "assistant_text"
  | "run_lifecycle"
  | "tool_activity"
  | "artifact_reference"
  | "provider_notice"
  | "debug_raw"
```

Keep `BaseChatRenderItem` unchanged and add `displayClass` only to provider/system/tool/raw items. Do not add `displayClass` to `UserMessageRenderItem`.

```typescript
type BaseChatRenderItem = {
  id: string
  runId: string | null
  createdAt: string
}
```

```typescript
export type ProviderMessageRenderItem = BaseChatRenderItem & {
  kind: "provider-message"
  displayClass: "assistant_text"
  content: string
  eventIds: string[]
}
```

Update the other non-user render item types:

```typescript
export type SystemSummaryRenderItem = BaseChatRenderItem & {
  kind: "system-summary"
  displayClass: "run_lifecycle" | "provider_notice"
  eventType: string
  status: ConversationRunStatus | null
  summary: string
  rawDetails: string | null
}

export type ToolEventRenderItem = BaseChatRenderItem & {
  kind: "tool-event"
  displayClass: "tool_activity"
  eventType: string
  summary: string
  rawDetails: string | null
  toolName: string | null
  toolStatus: string | null
  toolInput: Record<string, unknown> | null
  toolOutput: string | null
  isToolError: boolean
}

export type RawFallbackRenderItem = BaseChatRenderItem & {
  kind: "raw-fallback"
  displayClass: "debug_raw"
  eventType: string
  summary: string
  rawDetails: string
}
```

Set `displayClass: "assistant_text"` in provider message creators, `displayClass: "tool_activity"` in tool event items, `displayClass: "debug_raw"` in raw fallback items, and `displayClass: "run_lifecycle"` in run status summaries.

- [ ] **Step 4.4: Add assistant cache fallback item creation**

Add this helper next to `createProviderMessageItem()`:

```typescript
const createAssistantMessageCacheItem = (message: ConversationMessageSummary): ProviderMessageRenderItem => ({
  kind: "provider-message",
  displayClass: "assistant_text",
  id: `provider-${message.id}`,
  runId: message.runId,
  createdAt: message.createdAt,
  content: message.content,
  eventIds: []
})
```

Then replace the message handling branch in `buildChatRenderItems()`:

```typescript
if (entry.source === TimelineEntrySource.Message) {
  items.push(createUserMessageItem(entry.message))
  continue
}
```

with:

```typescript
if (entry.source === TimelineEntrySource.Message) {
  if (entry.message.role === "user") {
    items.push(createUserMessageItem(entry.message))
    continue
  }

  if (entry.message.role === "assistant") {
    if (!entry.message.runId || !deltaGroups.has(entry.message.runId)) {
      items.push(createAssistantMessageCacheItem(entry.message))
    }
    continue
  }

  items.push({
    kind: "system-summary",
    displayClass: "provider_notice",
    id: entry.message.id,
    runId: entry.message.runId,
    createdAt: entry.message.createdAt,
    eventType: "conversation.message.system",
    status: null,
    summary: entry.message.content,
    rawDetails: null
  })
  continue
}
```

- [ ] **Step 4.5: Make `createEventItem()` return null for plain progress**

Change `createEventItem()` return type to include `null`:

```typescript
const createEventItem = (event: RunEventSummary): Exclude<ChatRenderItem, UserMessageRenderItem | ProviderMessageRenderItem> | null => {
```

Add this helper above it:

```typescript
const isToolActivityEvent = (event: RunEventSummary) => {
  if (event.type !== "run.progress") {
    return false
  }

  return Boolean(
    event.payload.toolUse ||
    event.payload.toolResult ||
    event.payload.tool ||
    event.payload.command ||
    event.payload.file ||
    event.payload.path ||
    event.payload.contentType === "tool_use" ||
    event.payload.contentType === "tool_result"
  )
}
```

After the `isRunSummaryEvent(event)` block and before the tool item creation, add:

```typescript
if (!isToolActivityEvent(event)) {
  return null
}
```

Then update the loop in `buildChatRenderItems()`:

```typescript
const eventItem = createEventItem(event)
if (eventItem) {
  items.push(eventItem)
}
```

- [ ] **Step 4.6: Fix `ToolCallCard` details semantics while keeping default collapsed**

In `apps/desktop/src/renderer/app/shell/chat/ToolCallCard.tsx`, replace the expanded details block:

```tsx
{expanded ? (
  <details open className="chat-raw-details">
    <summary>{tChat("render.tool-input")}</summary>
    <pre>{item.toolInput ? JSON.stringify(item.toolInput, null, 2) : item.summary}</pre>
    {item.toolOutput ? (
      <>
        <summary>{tChat("render.tool-output")}</summary>
        <pre>{item.toolOutput}</pre>
      </>
    ) : null}
    {item.isToolError ? (
      <p className="tool-error">{tChat("render.tool-error")}</p>
    ) : null}
  </details>
) : null}
```

with:

```tsx
{expanded ? (
  <details open className="chat-raw-details">
    <summary>{tChat("render.tool-details")}</summary>
    <section>
      <strong>{tChat("render.tool-input")}</strong>
      <pre>{item.toolInput ? JSON.stringify(item.toolInput, null, 2) : item.summary}</pre>
    </section>
    {item.toolOutput ? (
      <section>
        <strong>{tChat("render.tool-output")}</strong>
        <pre>{item.toolOutput}</pre>
      </section>
    ) : null}
    {item.isToolError ? (
      <p className="tool-error">{tChat("render.tool-error")}</p>
    ) : null}
  </details>
) : null}
```

Add `render.tool-details` to `packages/i18n-resources/src/chat/en.json` and `packages/i18n-resources/src/chat/zh.json`:

```json
"render.tool-details": "Tool details"
```

```json
"render.tool-details": "工具详情"
```

- [ ] **Step 4.7: Run renderer model tests and i18n check**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/renderer/app/shell/chat-render-model.test.ts
yarn i18n:check
```

Expected: PASS.

- [ ] **Step 4.8: Commit**

```bash
git add apps/desktop/src/renderer/app/shell/chat-render-model.ts apps/desktop/src/renderer/app/shell/chat-render-model.test.ts apps/desktop/src/renderer/app/shell/chat/ToolCallCard.tsx packages/i18n-resources/src/chat/en.json packages/i18n-resources/src/chat/zh.json
git commit -m "fix(chat): render provider events without progress noise"
```

---

## Task 5: Composer Running State, Stop, And Model Source Badges

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/shell-store.ts`
- Modify: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
- Modify: `packages/i18n-resources/src/shell/en.json`
- Modify: `packages/i18n-resources/src/shell/zh.json`
- Test: `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`

- [ ] **Step 5.1: Write running composer behavior tests**

Add this helper near `withActiveConversationProviderStatus()` in `DesktopShell.test.tsx`:

```typescript
const withActiveConversationRunStatus = (
  context: AppContextSnapshot,
  runStatus: "idle" | "running" | "completed" | "failed" | "unavailable"
): AppContextSnapshot => ({
  ...context,
  shell: {
    ...context.shell,
    runStatus
  },
  chips: context.chips.map((chip) =>
    chip.kind === "run-status" ? { ...chip, value: runStatus } : chip
  ),
  projects: context.projects.map((project) => ({
    ...project,
    conversations: project.conversations.map((conversation) =>
      conversation.id === context.selectedConversationId
        ? { ...conversation, runStatus }
        : conversation
    )
  }))
})
```

Add these tests near the composer model selector tests:

```typescript
it("shows stop and blocks submit/model changes while the active conversation is running", async () => {
  const runningContext = withActiveConversationRunStatus(selectionContext, "running")
  window.teamcow.getAppContext = vi.fn(async () => runningContext)
  window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
    status: "ok",
    timeline: timelineWithUserMessage(conversationId, "Running prompt", "running")
  }))

  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = await renderWithI18n(container, <DesktopShell />)

  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(getByTestId(container, "composer-stop")).toBeTruthy()
  expect(getByTestId(container, "composer-send")).toBeFalsy()
  expect((getByTestId(container, "composer-model-trigger") as HTMLButtonElement | null)?.disabled).toBe(true)

  const composerInput = getByTestId(container, "composer-input") as HTMLTextAreaElement
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
    valueSetter?.call(composerInput, "Should not send")
    composerInput.dispatchEvent(new Event("input", { bubbles: true }))
    composerInput.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter"
    }))
    await Promise.resolve()
  })

  expect(window.teamcow.sendConversationMessage).not.toHaveBeenCalled()
  expect(window.teamcow.setConversationModel).not.toHaveBeenCalled()

  await act(async () => {
    root.unmount()
  })
  container.remove()
})

it("keeps stop available when readiness becomes unavailable during a running run", async () => {
  const runningUnavailableContext = withActiveConversationProviderStatus(
    withActiveConversationRunStatus(selectionContext, "running"),
    "unavailable"
  )
  window.teamcow.getAppContext = vi.fn(async () => runningUnavailableContext)
  window.teamcow.getProviderReadiness = vi.fn(async () => unavailableClaudeSnapshot)
  window.teamcow.refreshProviderReadiness = vi.fn(async () => unavailableClaudeSnapshot)
  window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
    status: "ok",
    timeline: timelineWithUserMessage(conversationId, "Running while unavailable", "running")
  }))

  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = await renderWithI18n(container, <DesktopShell />)

  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(getByTestId(container, "composer-stop")).toBeTruthy()
  await clickElement(getByTestId(container, "composer-stop"))
  expect(window.teamcow.cancelConversationRun).toHaveBeenCalledWith({ conversationId: "conversation-2" })

  await act(async () => {
    root.unmount()
  })
  container.remove()
})

it("shows model source badges in the composer model menu", async () => {
  window.teamcow.getAppContext = vi.fn(async () => selectionContext)
  window.teamcow.listProviderModels = vi.fn(async () => [
    {
      id: "claude-sonnet-4",
      label: "Sonnet 4",
      detail: "Current Claude Code model.",
      source: "fallback" as const
    },
    {
      id: "claude-opus-4.1",
      label: "Opus 4.1",
      detail: "Discovered from local Claude Code config.",
      source: "config-derived" as const
    },
    {
      id: "custom-claude",
      label: "Custom Claude",
      detail: "User supplied model.",
      source: "user-custom" as const
    }
  ])

  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = await renderWithI18n(container, <DesktopShell />)

  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  await clickElement(getByTestId(container, "composer-model-trigger"))
  expect(getByTestId(container, "composer-model-popover")?.textContent).toContain("Built-in")
  expect(getByTestId(container, "composer-model-popover")?.textContent).toContain("Config")
  expect(getByTestId(container, "composer-model-popover")?.textContent).toContain("Custom")

  await act(async () => {
    root.unmount()
  })
  container.remove()
})
```

- [ ] **Step 5.2: Run the DesktopShell tests and verify failure**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx
```

Expected: FAIL because running submit/model guards and composer source badges are incomplete.

- [ ] **Step 5.3: Expose `cancelConversationRun()` from `useShellContext()`**

In `apps/desktop/src/renderer/app/shell/shell-store.ts`, import the cancel types:

```typescript
CancelConversationRunInput,
CancelConversationRunResult,
```

Add this callback near `sendConversationMessage`:

```typescript
const cancelConversationRun = useCallback(async (
  input: CancelConversationRunInput
): Promise<CancelConversationRunResult | null> => {
  if (!window.teamcow?.cancelConversationRun) {
    setNotice({ tone: "error", messageKey: "api.unavailable" })
    return null
  }

  try {
    const result = await window.teamcow.cancelConversationRun(input)
    if (window.teamcow.getAppContext) {
      const snapshot = await window.teamcow.getAppContext()
      commitContext(snapshot)
    }
    if (window.teamcow.getConversationTimeline && selectedConversationIdRef.current === input.conversationId) {
      const timelineResult = await window.teamcow.getConversationTimeline(input.conversationId)
      if (timelineResult.status === "ok" && selectedConversationIdRef.current === input.conversationId) {
        setConversationTimeline(timelineResult.timeline)
        setConversationTimelineStatus("ready")
      }
    }
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
    return null
  }
}, [t, tErrors])
```

Add it to the returned object:

```typescript
cancelConversationRun,
```

- [ ] **Step 5.4: Add local running derived values in `DesktopShell.tsx`**

After `activeModelOption`, add:

```typescript
const isActiveRunRunning = activeConversation?.runStatus === "running"
const isModelSwitchDisabled =
  isComposerProviderBlocked || isActiveRunRunning || activeModelOptions.length === 0
const canSubmitComposer =
  Boolean(activeConversation) && !isBusy && !isComposerProviderBlocked && !isActiveRunRunning
```

Destructure `cancelConversationRun` from `useShellContext()`.

- [ ] **Step 5.5: Guard submit/model handlers and close model menu while running**

Update `handleComposerSubmit()` guard:

```typescript
if (!activeConversation || content.length === 0 || !canSubmitComposer) {
  return
}
```

Update `handleComposerModelSelect()` guard:

```typescript
if (
  !activeConversation ||
  isModelSwitchDisabled ||
  activeConversation.currentModel === option.id
) {
  return
}
```

Replace the effect that only watches `isComposerProviderBlocked`:

```typescript
if (isComposerProviderBlocked) {
  setComposerModelMenuOpen(false)
}
```

with:

```typescript
if (isModelSwitchDisabled) {
  setComposerModelMenuOpen(false)
}
```

Use `[isModelSwitchDisabled]` as the dependency array.

- [ ] **Step 5.6: Make Stop independent of provider readiness**

Replace `handleComposerCancel()` body:

```typescript
if (!activeConversation || activeConversation.runStatus !== "running") {
  return
}

if (!window.teamcow?.cancelConversationRun) {
  return
}

await window.teamcow.cancelConversationRun({ conversationId: activeConversation.id })
```

with:

```typescript
if (!activeConversation || !isActiveRunRunning) {
  return
}

await cancelConversationRun({ conversationId: activeConversation.id })
```

In the composer JSX:

```tsx
disabled={isComposerProviderBlocked || activeModelOptions.length === 0}
```

becomes:

```tsx
disabled={isModelSwitchDisabled}
```

and:

```tsx
activeConversation.runStatus === "running" && !isComposerProviderBlocked ? (
```

becomes:

```tsx
isActiveRunRunning ? (
```

For the send button:

```tsx
disabled={isBusy || isComposerProviderBlocked}
```

becomes:

```tsx
disabled={!canSubmitComposer}
```

- [ ] **Step 5.7: Show model source badges in the composer menu**

Inside the composer model option JSX, after the model detail span, add:

```tsx
{sourceBadgeKeyFor(option.source) ? (
  <span className="model-picker__badge">{tShell(sourceBadgeKeyFor(option.source) ?? "")}</span>
) : null}
```

To avoid calling `sourceBadgeKeyFor()` twice, implement the map block as:

```tsx
{activeModelOptions.map((option) => {
  const badgeKey = sourceBadgeKeyFor(option.source)
  return (
    <button
      key={option.id}
      className={`composer-model-option${activeConversation.currentModel === option.id ? " is-selected" : ""}`}
      type="button"
      onClick={() => void handleComposerModelSelect(option)}
      data-testid={`composer-model-option-${option.id}`}
    >
      <div className="composer-model-option-copy">
        <strong>{option.label}</strong>
        <span>{option.detail}</span>
        {badgeKey ? <span className="model-picker__badge">{tShell(badgeKey)}</span> : null}
      </div>
      {activeConversation.currentModel === option.id ? (
        <FontAwesomeIcon icon={faCheck} />
      ) : null}
    </button>
  )
})}
```

Add a native-list badge because the helper currently handles config/fallback/custom but not native:

```typescript
if (source === "native-list") return "modelPicker.badge.nativeList"
```

Add translations:

```json
"modelPicker.badge.nativeList": "Native"
```

```json
"modelPicker.badge.nativeList": "原生"
```

If the running title needs a clearer tooltip, add:

```json
"composer.model.running": "Model changes are disabled while this conversation is running."
```

```json
"composer.model.running": "当前会话运行中，暂不能切换模型。"
```

Then set `activeModelBoundaryCopy` so running takes precedence:

```typescript
const activeModelBoundaryCopy = isActiveRunRunning
  ? tShell("composer.model.running")
  : activeConversation && isComposerProviderBlocked
    ? tShell("composer.model.provider-required", { provider: activeProviderLabel })
    : ""
```

- [ ] **Step 5.8: Run DesktopShell tests and i18n check**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx
yarn i18n:check
```

Expected: PASS.

- [ ] **Step 5.9: Commit**

```bash
git add apps/desktop/src/renderer/app/shell/shell-store.ts apps/desktop/src/renderer/app/shell/DesktopShell.tsx apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx packages/i18n-resources/src/shell/en.json packages/i18n-resources/src/shell/zh.json
git commit -m "fix(chat): lock composer controls while provider runs"
```

---

## Task 6: Integration Verification

**Files:**
- No source edits unless verification exposes a defect.

- [ ] **Step 6.1: Run focused main/provider suites**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/main/__tests__/provider-runtime-service.test.ts apps/desktop/src/main/services/__tests__/provider-runtime-service.list-models.test.ts
yarn workspace @teamcow/desktop test -- apps/desktop/src/main/__tests__/project-service.test.ts apps/desktop/src/main/__tests__/shared-contracts.test.ts apps/desktop/src/main/__tests__/desktop-router.test.ts
```

Expected: PASS.

- [ ] **Step 6.2: Run focused renderer suites**

Run:

```bash
yarn workspace @teamcow/desktop test -- apps/desktop/src/renderer/app/shell/chat-render-model.test.ts apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx apps/desktop/src/renderer/domains/providers/__tests__/provider-readiness.test.ts
```

Expected: PASS.

- [ ] **Step 6.3: Run workspace quality gates**

Run:

```bash
yarn typecheck
yarn lint
yarn test
yarn i18n:check
```

Expected: PASS.

- [ ] **Step 6.4: Run Electron risk checks if provider cancel or IPC wiring changed beyond this plan**

Run this when the implementation modifies preload channel wiring, provider process cancellation internals, or shared IPC command shapes beyond the named cancel schemas:

```bash
yarn build
yarn workspace @teamcow/desktop smoke
```

Expected: PASS.

- [ ] **Step 6.5: Final commit**

If Task 6 required fixes, commit them:

```bash
git add .
git commit -m "test(chat): verify provider output control flow"
```

If Task 6 required no fixes, skip this commit.

---

## Agent Team Execution Notes

- Use `superpowers:subagent-driven-development` for implementation.
- Assign Task 1 and Task 2 to a main-process worker because both touch IPC contracts and `ProjectService`.
- Assign Task 3 to a provider-runtime worker with write ownership limited to `provider-runtime-service.ts` and its tests.
- Assign Task 4 to a renderer-model worker with write ownership limited to `chat-render-model.ts`, `ToolCallCard.tsx`, chat i18n, and `chat-render-model.test.ts`.
- Assign Task 5 to a renderer-shell worker with write ownership limited to `shell-store.ts`, `DesktopShell.tsx`, shell i18n, and `DesktopShell.test.tsx`.
- Review after each task for two things: spec compliance first, then code quality. Pay special attention to repeated identical deltas, late provider terminal events after cancel, and model changes made after a run started.

---

## Self-Review

- Spec coverage: Task 2 covers `run_events` as fact source, assistant cache from persisted events, running send guard, running model guard, per-run model fixation. Task 3 covers raw redaction. Task 4 covers assistant cache fallback, display classification, folded tool details, and progress noise reduction. Task 5 covers Stop, model selector disabled while running, and model source badge visibility. Task 6 covers verification.
- No database migration: existing `conversations.current_model`, `execution_runs.model`, `conversation_messages.model/run_id`, and `run_events.payload/sequence` are sufficient.
- No provider table split: provider adapter work stays inside `provider-runtime-service.ts`.
- No new debug panel: raw/debug details remain folded in chat for this pass; a dedicated debug inspector can be a later feature.
