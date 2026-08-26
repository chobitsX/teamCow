# Changes Inspector Design

## Goal

Replace the artifact-driven `Diff` inspector with a complete, Superset-inspired `Changes` surface for the active conversation's bound worktree. It must show every current uncommitted change, including provider edits and manual edits, and support reviewing, staging, unstaging, discarding, and committing those changes.

The user-facing tab is named `Changes` in English and `变更` in Chinese. `Git` remains a separate inspector tab responsible for repository identity, branch and upstream information, remotes, and commit history.

## Product Scope

The Changes tab represents the live Git state of the inspected conversation's bound worktree. It is intentionally not limited to the latest provider run and does not claim that every listed file was changed by the provider. The current conversation and worktree ownership remain visible so that changes from conversations sharing a default worktree are not misattributed.

Included:

- Live staged and unstaged file groups.
- Added, modified, deleted, renamed, copied, untracked, conflicted, and unknown statuses.
- Per-file additions, deletions, binary state, and old path where available.
- Lazy per-file staged or unstaged diff loading.
- Per-file and group stage/unstage actions.
- Per-file and group discard actions with destructive confirmation.
- Commit-message input and commit of the staged set.
- Manual refresh and automatic refresh while the tab is active.
- Existing open-in-editor handoff for changed files.

Excluded:

- Push, pull, publish, PR creation, and PR review.
- A committed-against-base section or commit-range browser; commit history remains in Git.
- Replacing chat with a full-screen source-control or editor workspace.
- Using provider artifacts as the live Changes data source.

Existing chat review entry points will open the Changes tab. If an artifact provides a file path that is still present in the live worktree changes, that row is selected; otherwise the unfiltered current Changes list is shown. Historical artifacts remain available to conversation history and comparison features, but they do not override live worktree state in Changes.

## Architecture and Contracts

Changes receives its own typed IPC commands rather than extending the repository-heavy `getConversationGitStatus` response:

```ts
type ConversationChangeArea = "staged" | "unstaged"

type ConversationChangeFile = {
  path: string
  oldPath: string | null
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked" | "conflicted" | "unknown"
  additions: number
  deletions: number
  isBinary: boolean
}

type ConversationChanges = {
  conversationId: string
  worktreeId: string
  worktreeRootPath: string
  staged: ConversationChangeFile[]
  unstaged: ConversationChangeFile[]
  checkedAt: string
}
```

`getConversationChanges(conversationId)` returns the lightweight snapshot. A path may appear in both groups when its index and working-tree versions both differ.

`getConversationChangeDiff({ conversationId, filePath, area })` is called only for the selected row. Its structured result distinguishes text diff, binary content, truncated content, missing files, unavailable Git state, and errors. Text results return a unified patch plus truncation metadata so the existing diff-line semantics can be reused without reading Git in the renderer.

Mutation commands cover single-file and section-level stage, unstage, and discard operations, plus `commitConversationChanges({ conversationId, message })`. Every result is zod-validated and identifies the conversation/worktree it changed. Commands flow through shared schemas, `DesktopCommand`, preload's `window.teamcow` API, the unified desktop router, and project service.

The main process resolves the conversation and bound worktree for every request. Renderer-supplied root paths are never trusted.

## Git Semantics

The status snapshot derives staged and unstaged states independently from porcelain status plus `git diff --numstat` and `git diff --cached --numstat`. Rename/copy paths and binary markers are preserved. Untracked text files may count their current lines as additions; oversized or binary untracked files remain reviewable as status rows without pretending to have text statistics.

Staging uses path-separated Git arguments and stages the selected current path. Unstaging affects only the index version. Discard affects only unstaged content: tracked files return to the index version, preserving staged work, while untracked files are deleted after confirmation. Conflicted files do not expose one-click discard, and bulk unstaged discard is disabled while the group contains a conflict.

Commit requires a non-empty trimmed message and at least one staged file. It commits only the current index, never stages implicitly, never pushes, and returns structured Git failures such as missing identity or hook rejection. Successful mutations trigger fresh Changes and Git reads.

## Renderer Experience

The tab header shows `Changes`, the total changed-row count, total additions/deletions, and a refresh button. The count is derived from staged and unstaged rows; a file in both areas is intentionally counted twice because each row represents a different diff.

`Unstaged` and `Staged` sections are collapsible. Section headers show their counts and safe bulk actions. Rows show a file icon, compact directory and filename, rename origin where relevant, textual status, and additions/deletions. Hover actions expose stage or unstage, discard where allowed, and open in editor.

Selecting a row expands exactly one inline diff beneath that row. The diff is loaded lazily for that path and area. Selecting another row cancels or invalidates the old request and moves the expanded review. Long diffs use the existing line classification and truncation treatment; binary and unavailable diffs display explicit non-color-only states.

A sticky commit area sits at the bottom of the tab. Commit is enabled only when staged files exist, the message is non-empty, and no Changes mutation is pending. The input is retained after failed commits and cleared after success.

When not pinned, the active Changes tab refreshes every 2.5 seconds, on window focus, when a provider run reaches a terminal state, after a manual refresh, and after a successful mutation. Polling stops while the tab is hidden or the inspector is pinned. Refreshes are coalesced so slow repositories cannot accumulate overlapping Git commands.

Pinning freezes the Changes snapshot, selected row, and loaded diff. All stage, unstage, discard, and commit controls are disabled while pinned; review and editor handoff remain available. Unpinning immediately reloads the active conversation's worktree state.

## Loading, Errors, and Stale Data

Initial loading, clean worktree, refresh failure, unsupported repository state, binary diff, truncated diff, missing file, and mutation failure each have separate localized states.

A transient refresh failure preserves the last successful snapshot and marks it stale rather than replacing it with an empty list. Mutations do not optimistically rewrite rows. A failed mutation preserves the selected row, expanded diff, and commit message.

Every async response is guarded by request identity plus conversation id. Diff responses additionally match file path and change area. Switching conversations, selecting another file, pinning, or unpinning invalidates incompatible pending results.

## Security

All file paths are normalized as worktree-relative paths. Absolute paths, traversal segments, empty/root targets, and resolved targets outside the bound worktree are rejected. Symlink targets are checked before destructive filesystem operations. Git commands are invoked with argument arrays and `--` path separators; no shell command strings are constructed from user input.

Discarding untracked files and all unstaged changes requires a clear confirmation that names the affected scope. Bulk discard runs only when no conflicted row is present, reports partial or total failure honestly, and refreshes from Git before presenting the final state.

## Testing and Verification

Shared contract tests cover every command and result variant. Desktop-router tests verify typed dispatch. Project-service tests use temporary Git repositories to cover staged, unstaged, untracked, deleted, renamed, copied, conflicted, binary, dual-state, commit, and discard behavior, including path traversal and stale/missing worktrees.

Renderer tests cover tab renaming, grouping, statistics, lazy diff loading, selection changes, manual and timed refresh, focus refresh, provider completion refresh, individual and bulk mutations, destructive confirmations, commit validation and failure retention, pinned read-only behavior, stale-response guards, clean/error/stale states, and English/Chinese copy.

Verification includes the focused desktop tests, `yarn typecheck`, `yarn lint`, `yarn test`, and `yarn i18n:check`. Because the change crosses preload, IPC, Git, and Electron integration boundaries, it also includes `yarn build` and `yarn workspace @teamcow/desktop smoke` when the local environment supports Electron startup.
