# Open Current Worktree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header split-button menu that opens the active conversation worktree in Finder, terminal apps, or installed IDEs/editors.

**Architecture:** Add typed external-open contracts in shared types, route them through the existing `teamcow:invoke` IPC path, and implement macOS app detection/opening in `ProjectService`. Render a compact header control inside `DesktopShell` that calls preload APIs and uses localized strings.

**Tech Stack:** Electron main/preload, React + TypeScript renderer, zod shared contracts, Vitest, Yarn workspaces.

**Project Rule Override:** Do not run `git commit` in this plan. Use verification checkpoints instead, because AGENTS.md requires explicit user permission before commits.

---

### Task 1: Shared Contracts

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/desktop/src/main/__tests__/shared-contracts.test.ts`

- [ ] **Step 1: Write the failing contract test**

Add assertions to the existing shared contract tests near the editor selector coverage:

```ts
expect(externalOpenOptionSchema.parse({
  id: "finder",
  label: "Finder",
  appName: "Finder",
  group: "system",
  isAvailable: true
})).toMatchObject({
  id: "finder",
  group: "system",
  isAvailable: true
})

expect(openConversationExternalInputSchema.parse({
  conversationId: "conversation-1",
  appId: "cursor"
})).toEqual({
  conversationId: "conversation-1",
  appId: "cursor"
})

expect(openConversationExternalResultSchema.parse({
  status: "opened",
  conversationId: "conversation-1",
  worktreeId: "worktree-1",
  appId: "cursor",
  appLabel: "Cursor",
  targetPath: "/tmp/teamcow"
})).toMatchObject({
  status: "opened",
  appId: "cursor",
  targetPath: "/tmp/teamcow"
})

expect(desktopCommandSchema.parse({ type: "listExternalOpenOptions" })).toEqual({
  type: "listExternalOpenOptions"
})

expect(desktopCommandSchema.parse({
  type: "openConversationExternal",
  input: {
    conversationId: "conversation-1",
    appId: "cursor"
  }
})).toEqual({
  type: "openConversationExternal",
  input: {
    conversationId: "conversation-1",
    appId: "cursor"
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn workspace @teamcow/desktop test apps/desktop/src/main/__tests__/shared-contracts.test.ts`

Expected: FAIL because the new schemas are not exported.

- [ ] **Step 3: Add minimal shared contract implementation**

Add zod schemas and API members:

```ts
export const externalOpenAppIdSchema = z.enum([
  "finder",
  "terminal",
  "iterm2",
  "ghostty",
  "warp",
  "cursor",
  "vscode",
  "windsurf",
  "zed",
  "sublime-text",
  "webstorm",
  "intellij-idea"
])
export type ExternalOpenAppId = z.infer<typeof externalOpenAppIdSchema>

export const externalOpenOptionSchema = z.object({
  id: externalOpenAppIdSchema,
  label: z.string().trim().min(1),
  appName: z.string().trim().min(1),
  bundleId: z.string().trim().min(1).optional(),
  group: z.enum(["system", "terminal", "ide"]),
  isAvailable: z.boolean()
})
export type ExternalOpenOption = z.infer<typeof externalOpenOptionSchema>

export const openConversationExternalInputSchema = z.object({
  conversationId: z.string().min(1),
  appId: externalOpenAppIdSchema
})
export type OpenConversationExternalInput = z.infer<typeof openConversationExternalInputSchema>

export const openConversationExternalResultSchema = z.union([
  z.object({
    status: z.literal("opened"),
    conversationId: z.string(),
    worktreeId: z.string(),
    appId: externalOpenAppIdSchema,
    appLabel: z.string(),
    targetPath: z.string()
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type OpenConversationExternalResult = z.infer<typeof openConversationExternalResultSchema>
```

Add command variants and `TeamcowDesktopApi` methods for `listExternalOpenOptions` and `openConversationExternal`.

- [ ] **Step 4: Run test to verify it passes**

Run the same shared-contracts command.

Expected: PASS for shared contracts.

### Task 2: Main Router, Preload, And Project Service

**Files:**
- Modify: `apps/desktop/src/main/project-service.ts`
- Modify: `apps/desktop/src/main/desktop-router.ts`
- Modify: `apps/desktop/src/main/preload/api.ts`
- Modify: `apps/desktop/src/main/__tests__/project-service.test.ts`
- Modify: `apps/desktop/src/main/__tests__/desktop-router.test.ts`

- [ ] **Step 1: Write failing router and service tests**

Add router assertions:

```ts
const listExternalOpenOptions = vi.fn(() => [{ id: "finder", label: "Finder", appName: "Finder", group: "system", isAvailable: true }])
const openConversationExternal = vi.fn(async () => ({
  status: "opened" as const,
  conversationId: "conversation-1",
  worktreeId: "worktree-1",
  appId: "finder" as const,
  appLabel: "Finder",
  targetPath: "/tmp/teamcow"
}))

await expect(executeDesktopCommand(services, { type: "listExternalOpenOptions" })).resolves.toHaveLength(1)
await expect(executeDesktopCommand(services, {
  type: "openConversationExternal",
  input: { conversationId: "conversation-1", appId: "finder" }
})).resolves.toMatchObject({ status: "opened", appId: "finder" })
```

Add project-service tests that inject `listInstalledExternalOpenApps` and `openExternalAppPath` dependencies:

```ts
expect(service.listExternalOpenOptions().filter((option) => option.isAvailable).map((option) => option.id))
  .toEqual(expect.arrayContaining(["finder", "terminal", "cursor"]))

const opened = await service.openConversationExternal({ conversationId: "conversation-1", appId: "cursor" })
expect(opened).toMatchObject({ status: "opened", appId: "cursor", targetPath: repoRoot })
expect(openedPaths).toEqual([{ appId: "cursor", appName: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92", targetPath: repoRoot }])

const unavailable = await service.openConversationExternal({ conversationId: "conversation-1", appId: "warp" })
expect(unavailable).toMatchObject({ status: "error", error: { code: "EXTERNAL_OPEN_APP_UNAVAILABLE" } })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn workspace @teamcow/desktop test apps/desktop/src/main/__tests__/desktop-router.test.ts apps/desktop/src/main/__tests__/project-service.test.ts`

Expected: FAIL because project service and router methods do not exist.

- [ ] **Step 3: Implement main/preload plumbing**

Add project-service dependency types:

```ts
type ExternalAppPathOpener = (input: {
  appId: ExternalOpenAppId
  appName: string
  bundleId?: string | null
  targetPath: string
}) => Promise<string>
type InstalledExternalAppDetector = () => ExternalOpenAppId[]
```

Add catalog, availability listing, and open method. Reuse the existing conversation worktree resolution shape from `resolveConversationTerminalTarget` or `resolveConversationHandoffTarget`.

Add router cases:

```ts
case "listExternalOpenOptions":
  return externalOpenOptionSchema.array().parse(services.projectService.listExternalOpenOptions())
case "openConversationExternal":
  return openConversationExternalResultSchema.parse(
    await services.projectService.openConversationExternal(command.input)
  )
```

Add preload methods:

```ts
async listExternalOpenOptions() {
  return invokeDesktopCommand({ type: "listExternalOpenOptions" })
},
async openConversationExternal(input) {
  return invokeDesktopCommand({ type: "openConversationExternal", input })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run the same desktop-router/project-service command.

Expected: PASS for the new tests and no regressions in those files.

### Task 3: Renderer Header Control

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
- Modify: `apps/desktop/src/renderer/styles.css`
- Modify: `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`

- [ ] **Step 1: Write failing renderer tests**

Add mocked preload methods to the default `window.teamcow` fixture:

```ts
listExternalOpenOptions: vi.fn(async () => [
  { id: "finder", label: "Finder", appName: "Finder", group: "system", isAvailable: true },
  { id: "cursor", label: "Cursor", appName: "Cursor", group: "ide", isAvailable: true },
  { id: "warp", label: "Warp", appName: "Warp", group: "terminal", isAvailable: false }
]),
openConversationExternal: vi.fn(async (input) => ({
  status: "opened",
  conversationId: input.conversationId,
  worktreeId: "worktree-1",
  appId: input.appId,
  appLabel: input.appId === "cursor" ? "Cursor" : "Finder",
  targetPath: "/tmp/teamcow"
}))
```

Add tests:

```ts
expect(getByTestId(container, "header-open-location")).not.toBeNull()
button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
expect(window.teamcow.openConversationExternal).toHaveBeenCalledWith({ conversationId: "conversation-2", appId: "finder" })

menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
expect(container.textContent).toContain("Cursor")
expect(container.textContent).not.toContain("Warp")
cursorItem.dispatchEvent(new MouseEvent("click", { bubbles: true }))
expect(window.teamcow.openConversationExternal).toHaveBeenLastCalledWith({ conversationId: "conversation-2", appId: "cursor" })
```

Add a no-conversation test that the button is disabled and does not call preload.

- [ ] **Step 2: Run renderer test to verify it fails**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn workspace @teamcow/desktop test apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`

Expected: FAIL because the header control is absent.

- [ ] **Step 3: Implement the header split button**

Add state for options, menu open, pending app id, and session-local default app. Load options on mount. Render inside `headerActions` next to Settings:

```tsx
<div className="header-open-location" data-testid="header-open-location">
  <button type="button" onClick={() => void openActiveConversationLocation(defaultOpenAppId)} disabled={!activeConversation || externalOpenPending}>
    <FontAwesomeIcon icon={faFolderOpen} />
    {tShell("header.open-location")}
  </button>
  <button type="button" aria-label={tShell("header.open-location-menu")} onClick={() => setExternalOpenMenuOpen((open) => !open)} disabled={!activeConversation || externalOpenPending}>
    <FontAwesomeIcon icon={faChevronDown} />
  </button>
  {externalOpenMenuOpen ? (
    <div className="header-open-location-menu" role="menu">
      {availableExternalOpenOptions.map((option) => (
        <button key={option.id} type="button" role="menuitem" onClick={() => void openActiveConversationLocation(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  ) : null}
</div>
```

Use icons from the existing FontAwesome import set where available. Use existing notice/error helpers for result feedback.

- [ ] **Step 4: Run renderer test to verify it passes**

Run the same DesktopShell test command.

Expected: PASS for the renderer tests.

### Task 4: I18n And Errors

**Files:**
- Modify: `packages/i18n-resources/src/shell/en.json`
- Modify: `packages/i18n-resources/src/shell/zh.json`
- Modify: `packages/i18n-resources/src/errors/en.json`
- Modify: `packages/i18n-resources/src/errors/zh.json`
- Modify: `packages/shared-types/src/index.ts`

- [ ] **Step 1: Write or extend failing i18n/contract tests**

Ensure `EXTERNAL_OPEN_APP_UNAVAILABLE` and `EXTERNAL_OPEN_FAILED` are accepted by `appErrorCodeSchema`, and add shell translation keys used by the header control.

- [ ] **Step 2: Run checks to verify they fail**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn i18n:check`

Expected: FAIL until both locales include matching keys.

- [ ] **Step 3: Add localized strings**

Add shell keys:

```json
"header": {
  "open-location": "Open Location",
  "open-location-menu": "Choose app to open current location",
  "open-location-disabled": "Select a conversation before opening a location",
  "open-location-success": "Opened {{path}} in {{app}}",
  "open-location-empty": "No supported local apps were found"
}
```

Chinese equivalents:

```json
"header": {
  "open-location": "打开位置",
  "open-location-menu": "选择用于打开当前位置的应用",
  "open-location-disabled": "先选择一个对话后再打开位置",
  "open-location-success": "已用 {{app}} 打开 {{path}}",
  "open-location-empty": "没有找到可用的本地应用"
}
```

Add error translations and suggestions for the new error codes.

- [ ] **Step 4: Run i18n check to verify it passes**

Run the same i18n command.

Expected: PASS.

### Task 5: Full Verification

**Files:**
- No new edits unless verification exposes an issue.

- [ ] **Step 1: Run focused tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn workspace @teamcow/desktop test \
  apps/desktop/src/main/__tests__/shared-contracts.test.ts \
  apps/desktop/src/main/__tests__/desktop-router.test.ts \
  apps/desktop/src/main/__tests__/project-service.test.ts \
  apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn typecheck`

Expected: PASS.

- [ ] **Step 3: Run i18n check**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn i18n:check`

Expected: PASS.

- [ ] **Step 4: Inspect git diff**

Run: `git diff --stat && git diff --check`

Expected: diff contains only the feature, docs, tests, and i18n changes; `git diff --check` reports no whitespace errors.
