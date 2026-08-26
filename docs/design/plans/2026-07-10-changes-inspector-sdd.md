# Changes Inspector Subagent Execution Plan

**Goal:** Execute the approved `spec-changes-inspector.md` in dependency order so every task can complete a real RED/GREEN cycle and leave the branch type-safe.

**Approved requirements:** `_bmad-output/implementation-artifacts/spec-changes-inspector.md`

## Global Constraints

- Use Yarn with Node 22.22.2; no npm/pnpm lockfiles.
- Changes always derives its worktree from inspected `conversationId`; never accept a renderer root path.
- Renderer never imports `fs`, `git`, `child_process`, or provider processes.
- Every IPC input/result is zod-validated through `teamcow:invoke`.
- Git owns repository/branch/remote/history; Changes owns live staged/unstaged rows, lazy file diff, stage/unstage/discard/commit.
- Git commands use argument arrays plus `--`; destructive targets require canonical-root/symlink checks.
- Discard affects unstaged only and preserves the index; conflicted collections cannot bulk discard; commit never implicitly stages or pushes.
- Pin freezes the Changes snapshot/diff and disables all Changes mutations.
- All visible copy is symmetric in English and Chinese.
- Follow TDD: record the focused RED command/output, implement minimally, record GREEN, then run the task's regression command.
- Work only in the isolated `changes-inspector` worktree; task-level commits are authorized, but do not push or touch remotes.

---

### Task 1: Shared Changes contracts and compile-safe API declarations

**Files:**
- Modify `packages/shared-types/src/index.ts`
- Modify `apps/desktop/src/main/preload/api.ts`
- Modify `apps/desktop/src/main/desktop-router.ts` only for command-domain entries, not switch cases
- Modify full `window.teamcow` mocks in `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx` and any typechecked test fixture that constructs `TeamcowDesktopApi`
- Test `apps/desktop/src/main/__tests__/shared-contracts.test.ts`

**Requirements:**

- Add `GIT_CHANGES_READ_FAILED`, `GIT_CHANGE_OPERATION_FAILED`, `GIT_COMMIT_FAILED`.
- Add schemas/types for area (`staged|unstaged`), relative safe paths, file status, file stats, snapshot, selection diff, mutation scope, mutation results and commit result.
- Diff result must distinguish `text`, `binary`, `missing`, `unavailable`, and top-level `error`; text owns patch/truncation metadata, binary does not carry a patch.
- Add six commands/API methods: `getConversationChanges`, `getConversationChangeDiff`, `stageConversationChanges`, `unstageConversationChanges`, `discardConversationChanges`, `commitConversationChanges`.
- Add preload methods now so `TeamcowDesktopApi` remains satisfied. Add six `git` entries to `commandDomainByType`; router switch cases wait for Task 4 because service methods do not yet exist.
- Update test mocks with safe error/empty defaults; do not fake behavior under test.

**TDD/verification:**

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/shared-contracts.test.ts
yarn workspace @teamcow/desktop typecheck
git diff --check
```

**Commit:** `feat: define conversation changes contracts`

---

### Task 2: Git normalization and read-only Changes service

**Files:**
- Create `apps/desktop/src/main/conversation-changes-git.ts`
- Create `apps/desktop/src/main/__tests__/conversation-changes-git.test.ts`
- Modify `apps/desktop/src/main/project-service.ts`
- Modify `apps/desktop/src/main/__tests__/project-service.test.ts`

**Requirements:**

- Keep parsing pure: porcelain/numstat normalization, rename/copy old paths, dual-state grouping, conflict mapping, binary stats, and line-safe 512 KiB patch truncation.
- `getConversationChanges({conversationId})` resolves conversation -> worktree -> canonical root, then returns independent staged/unstaged rows; untracked files are inspected safely for line count/binary state with a bounded read.
- `getConversationChangeDiff(input)` first verifies the path is currently in the requested area. Return text/binary/missing/unavailable honestly. Staged compares HEAD/index; unstaged compares index/worktree; untracked uses an empty original without shell-string construction.
- No DB/Electron dependencies in the pure helper.
- Real temporary Git repository tests cover dual-state, rename/copy, delete, untracked, binary, conflict, Unicode/special paths, truncation, missing path/area and missing conversation/worktree.

**TDD/verification:**

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/conversation-changes-git.test.ts
yarn workspace @teamcow/desktop test src/main/__tests__/project-service.test.ts -t "conversation changes"
yarn workspace @teamcow/desktop typecheck
git diff --check
```

**Commit:** `feat: read conversation worktree changes`

---

### Task 3: Stage, unstage, discard, and commit service operations

**Files:**
- Modify `apps/desktop/src/main/project-service.ts`
- Modify `apps/desktop/src/main/conversation-changes-git.ts` only for reusable pure helpers
- Modify `apps/desktop/src/main/__tests__/project-service.test.ts`

**Requirements:**

- Implement all four remaining service methods using fresh conversation-bound snapshots for `scope: all`.
- Stage paths/all with `git add -A --`; unstage paths/all without breaking unborn HEAD; discard tracked worktree content back to index while preserving staged content.
- Untracked discard removes the entry itself after canonical-root and lstat/symlink validation; never follows an external symlink.
- Refuse bulk discard when any target is conflicted.
- Commit requires non-empty message and staged rows, commits existing index only, returns HEAD hash, never stages/pushes.
- Structured errors include git domain and conversation/worktree context; partial destructive failure must not report complete success.
- Real repository tests cover per-file/all operations, dual-state preservation, directory/symlink untracked removal, conflict refusal, unborn HEAD, empty index, identity failure and rejecting commit hook.

**TDD/verification:**

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/project-service.test.ts -t "conversation changes|mutates conversation changes"
yarn workspace @teamcow/desktop typecheck
git diff --check
```

**Commit:** `feat: mutate conversation worktree changes`

---

### Task 4: Route the completed Changes service through IPC

**Files:**
- Modify `apps/desktop/src/main/desktop-router.ts`
- Modify `apps/desktop/src/main/preload/api.ts` only if Task 1 left a contract mismatch
- Modify `apps/desktop/src/main/__tests__/desktop-router.test.ts`
- Modify `apps/desktop/src/main/__tests__/shared-contracts.test.ts` only for missing command coverage

**Requirements:**

- Add all six switch cases now that `ProjectService` exposes all methods.
- Parse every service response through its exact zod result schema.
- Reads may be sync or awaited; mutations must support async without losing structured errors.
- Router tests verify exact inputs reach exact service methods, result identities survive, and thrown errors become git-domain `INTERNAL_ERROR` responses accepted by the correct result schema.

**TDD/verification:**

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/shared-contracts.test.ts src/main/__tests__/desktop-router.test.ts
yarn workspace @teamcow/desktop typecheck
git diff --check
```

**Commit:** `feat: route conversation changes commands`

---

### Task 5: Localized Changes model and presentational panel

**Files:**
- Modify `packages/i18n-resources/src/inspector/en.json` and `zh.json`
- Modify `packages/i18n-resources/src/chat/en.json` and `zh.json`
- Modify `packages/i18n-resources/src/errors/en.json` and `zh.json`
- Create `apps/desktop/src/renderer/app/shell/inspector-changes-model.ts`
- Create `apps/desktop/src/renderer/app/shell/inspector-changes-model.test.ts`
- Create `apps/desktop/src/renderer/app/shell/InspectorChangesPanel.tsx`
- Create `apps/desktop/src/renderer/app/shell/__tests__/InspectorChangesPanel.test.tsx`

**Requirements:**

- Add minimal symmetric Changes keys before expecting component GREEN: tab/title, summary, staged/unstaged, loading/clean/stale/error, all actions/statuses, diff states/line labels, discard confirmations, commit and pinned read-only; add three error messages/suggestions; change existing chat/Git review copy values to Review changes/审查变更.
- Pure model provides stable `area:path` key, row/addition/deletion totals and unified patch line kinds with meta headers not misclassified.
- Panel has no `window.teamcow`, timers or global listeners. It renders unstaged then staged collapsible sections, bulk/per-file actions, exactly one inline lazy-diff surface, explicit binary/missing/unavailable/truncated states, destructive confirmations, open-editor handoff and sticky commit.
- `readOnly` disables all mutations but not review/handoff. Commit requires staged rows, trimmed message and no pending mutation. Conflicted group disables bulk discard.
- Component tests cover English and Chinese visible core states without asserting implementation-only DOM structure.

**TDD/verification:**

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/inspector-changes-model.test.ts src/renderer/app/shell/__tests__/InspectorChangesPanel.test.tsx
yarn i18n:check
yarn workspace @teamcow/desktop typecheck
git diff --check
```

**Commit:** `feat: add localized changes inspector panel`

---

### Task 6: DesktopShell live data, polling, pin, navigation, and mutations

**Files:**
- Modify `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
- Modify `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`

**Requirements:**

- Rename tab/state/test ids from Diff to Changes; live data comes only from `getConversationChanges`. Keep artifact diff parsing only for historical/compare and preferred-path navigation hints.
- Empty artifacts plus dirty service response must show files. Selecting a row lazily loads only its path/area diff.
- Guard snapshot and diff responses with request id plus conversation; diff also checks path/area. Switching conversation, selection, pin/unpin invalidates incompatible responses.
- Refresh on tab activation, manual action, window focus, provider terminal transition and every 2500 ms while active/follow. Coalesce requests; hidden/pinned tabs do not poll. Refresh failure preserves last snapshot and marks stale.
- Mutations use inspected conversation, preserve context/message on error, refresh Changes and Git on success, and clear commit message only after commit success.
- Pinned snapshot includes Changes list/selection/diff; all mutations disabled until unpin, which immediately reloads active context.
- Chat and Git review entry points open Changes. Select a preferred artifact path only if still live, preferring unstaged then staged; otherwise show unfiltered list.

**TDD/verification:**

```bash
yarn workspace @teamcow/desktop test src/renderer/app/shell/__tests__/DesktopShell.test.tsx
yarn workspace @teamcow/desktop test src/renderer/app/shell/inspector-diff-model.test.ts
yarn workspace @teamcow/desktop typecheck
git diff --check
```

**Commit:** `feat: connect inspector to live changes`

---

### Task 7: Superset-inspired styling and complete verification

**Files:**
- Modify `apps/desktop/src/renderer/styles.css`
- Modify adjacent renderer tests only for behavior/accessibility regressions
- Update `_bmad-output/implementation-artifacts/spec-changes-inspector.md` task checkboxes after evidence is fresh

**Requirements:**

- Fill inspector height with scrollable grouped rows and sticky commit area; section headers are clear, file paths truncate safely, only selected diff expands and inner diff caps at 320 px.
- Normal metadata remains visible; hover/focus actions are keyboard reachable. Status uses text/icon plus color. Reuse graphite/warm cream/workbench blue tokens and existing diff semantic colors.
- No unrelated theme or Files/Git redesign.
- Run all focused and full gates with Node 22.22.2. For this isolated worktree, use the existing main-checkout Electron distribution through `ELECTRON_OVERRIDE_DIST_PATH` if download remains unavailable.

**Verification:**

```bash
yarn workspace @teamcow/desktop test src/main/__tests__/conversation-changes-git.test.ts
yarn workspace @teamcow/desktop test src/main/__tests__/project-service.test.ts -t "conversation changes|mutates conversation changes"
yarn workspace @teamcow/desktop test src/main/__tests__/shared-contracts.test.ts src/main/__tests__/desktop-router.test.ts
yarn workspace @teamcow/desktop test src/renderer/app/shell/inspector-changes-model.test.ts src/renderer/app/shell/__tests__/InspectorChangesPanel.test.tsx src/renderer/app/shell/__tests__/DesktopShell.test.tsx
yarn typecheck
yarn lint
yarn test
yarn i18n:check
yarn build
yarn workspace @teamcow/desktop smoke
git diff --check
```

**Commit:** `style: finish changes inspector workspace`
