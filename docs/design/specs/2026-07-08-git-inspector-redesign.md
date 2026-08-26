# Git Inspector Redesign

Date: 2026-07-08
Status: Ready for user review

## Summary

Redesign the right-side Inspector `Git` tab from a worktree change/action panel into a read-only repository context and commit history panel.

The `Diff` tab owns "what did the AI change?" The `Git` tab owns "which repository/worktree is this conversation bound to, which Git identity will commits use, which branch/upstream am I on, and what recent commit history am I looking at?"

## Goals

- Show repository context for the active conversation-bound worktree.
- Show the actual Git commit identity from local or global Git config.
- Show current branch, upstream, recorded branch mismatch, and clean/dirty state.
- Show a concise commit list with a scope switch for current branch or whole repository history.
- Keep the panel read-only and avoid turning TeamCow into a Git client.
- Preserve the existing Inspector follow/pin behavior and conversation-bound worktree safety model.

## Non-Goals

- No commit, push, pull, fetch, checkout, branch creation, or staging actions.
- No replacement for the `Diff` tab's changed-files and diff review responsibility.
- No remote account integration or platform identity detection for V1.
- No pagination or full Git log browser in the right rail.

## Product Positioning

The redesigned `Git` tab is a read-only audit surface for repository context and history. It helps developers quickly confirm where the current conversation is operating and what recent Git history surrounds it.

The `Diff` tab remains the short path for reviewing AI-generated file changes. A dirty worktree is represented in `Git` as a compact status and a link to `Diff`, not as a changed-files list.

## Information Architecture

### Repository

- Display the selected remote name and URL.
- Default remote selection:
  - Use the current branch upstream remote when available.
  - Otherwise use `origin` when configured.
  - Otherwise use the first configured remote.
- When `git remote -v` returns both fetch and push URLs, deduplicate by remote name and prefer the fetch URL for display.
- Allow the user to choose another remote from a dropdown.
- Remote selection affects only display state. It does not run Git operations or write repository config.
- If no remotes are configured, show a clear empty state.

### Identity

- Display the actual commit identity for this worktree:
  - `git config --local user.name`
  - `git config --local user.email`
  - fallback to `git config --global user.name`
  - fallback to `git config --global user.email`
- Show the source as `Local config`, `Global config`, or `Not configured`.
- If only name or email is configured, show the configured field and mark the missing field clearly.
- Do not infer GitHub, GitLab, or remote-platform identity from remote URLs.

### Branch

- Show the current branch.
- Show upstream branch, for example `origin/main`.
- Preserve the recorded branch mismatch warning when the live branch differs from the conversation's recorded worktree branch.
- Show clean/dirty as a compact status.
- Dirty state should not list files. It should show a short prompt to review the `Diff` tab.

### Commit History

- Show a segmented control with two scopes:
  - `Current branch`
  - `All repository`
- Default scope is `All repository`.
- Each commit row shows:
  - short hash
  - subject/title
  - author name
  - relative time
- The list is read-only.
- Copying a commit hash is allowed as a read-only helper.
- Show at most the latest 30 commits for the chosen scope.
- When more commits may exist, show a small note that the latest 30 commits are displayed.

## UI Behavior

The panel should use compact groups rather than large decorative cards, because the Inspector right rail has limited width and high information density.

Top title row:

- Left: `Git`
- Right: current branch and `Clean` or `Dirty`

Dirty state:

- Show a concise note such as `Worktree has local changes. Review Diff.`
- `Review Diff` switches to the `Diff` tab.
- Do not duplicate the `Diff` tab's changed files.

Repository group:

- Remote dropdown.
- Remote URL line with truncation and copy support.
- Empty state when no remote exists.

Identity group:

- `user.name <user.email>` when both exist.
- Source tag: local config, global config, or not configured.
- Missing fields are shown explicitly.

Branch group:

- Current branch.
- Upstream branch or `No upstream`.
- Recorded branch mismatch as a secondary warning row.

Commit History group:

- Segmented scope control.
- Compact commit rows.
- Empty state: no commits found for this scope.
- Local section error: commit history unavailable.

Read-only boundary:

- Remove or de-emphasize Git-panel handoff actions such as review files, open editor, open terminal, and open worktree.
- Keep editor, terminal, file, and diff workflows in their own Inspector tabs or global context controls.

## Data And IPC Design

Use the existing typed desktop command path rather than adding separate IPC handlers. Extend `getConversationGitStatus` so the result becomes a Git overview for the conversation-bound worktree.

The command should accept:

```ts
{
  conversationId: string
  commitScope?: "currentBranch" | "allRepository"
}
```

The default `commitScope` is `allRepository`.

The result should include:

```ts
git: {
  conversationId: string
  worktreeId: string
  worktreeRootPath: string
  worktreeKind: "default" | "git_worktree"

  repository: {
    remotes: Array<{
      name: string
      url: string
      isUpstreamDefault: boolean
    }>
    selectedRemoteName: string | null
    selectedRemoteUrl: string | null
    upstreamRemoteName: string | null
    upstreamBranchName: string | null
  }

  identity: {
    name: string | null
    email: string | null
    source: "local" | "global" | "unset"
  }

  branch: {
    current: string | null
    recorded: string | null
    upstream: string | null
    isClean: boolean
    changedCount: number
  }

  commits: {
    scope: "currentBranch" | "allRepository"
    items: Array<{
      hash: string
      shortHash: string
      subject: string
      authorName: string
      authoredAt: string
      relativeTime: string
    }>
    hasMore: boolean
  }

  checkedAt: string
}
```

## Git Commands

The main process should call only local, read-only Git commands:

- `git status --porcelain=v1 -z --branch`
  - Current branch, clean/dirty state, and changed count.
- `git remote -v` or `git remote get-url <name>`
  - Remote names and URLs.
  - Prefer fetch URLs when both fetch and push URLs are present for the same remote.
- `git rev-parse --abbrev-ref --symbolic-full-name @{u}`
  - Current branch upstream, when configured.
- `git config --local user.name`
- `git config --local user.email`
- `git config --global user.name`
- `git config --global user.email`
  - Actual commit identity and source.
- `git log --format=<stable-delimited-format> -n 31 HEAD`
  - Current branch commit history.
- `git log --all --format=<stable-delimited-format> -n 31`
  - Whole repository commit history.

Fetch 31 commits to display 30 and compute `hasMore`.

Commit parsing should use a stable delimiter format rather than human-oriented default `git log` output. The format should include full hash, short hash, subject, author name, ISO authored timestamp, and Git's relative authored date. Use delimiters that cannot be confused with ordinary commit subject text.

## Error Handling

Hard failures:

- Missing conversation.
- Missing worktree.
- Missing worktree path.
- Git unavailable.
- `git status` failure for the worktree.

These should continue to use structured app errors and the existing localized Inspector error pattern.

Local section degradation:

- Remote read failure: show no remote / remote unavailable inside the Repository section.
- Identity read failure: show not configured or identity unavailable.
- Upstream read failure: show no upstream.
- Commit log failure: show `Commit history unavailable` inside the Commit History section.

The whole panel should not fail when optional context sections fail.

Pinned Inspector behavior should preserve the Git overview snapshot captured at pin time.

## Internationalization

All user-visible text must be added to `packages/i18n-resources/src/inspector/en.json` and `packages/i18n-resources/src/inspector/zh.json`.

Provider output, file paths, branch names, remote URLs, commit subjects, commit hashes, and Git config values must remain untranslated.

## Testing

### Shared Contract Tests

- The Git overview schema parses repository, identity, branch, commits, and legacy clean/dirty values.
- `getConversationGitStatus` accepts `commitScope`.
- The schema supports clean worktrees, dirty worktrees, no remote, no upstream, and no identity.

### Main Service Tests

- Upstream remote is selected by default when present.
- Without upstream, `origin` is selected when present.
- Without upstream or `origin`, the first remote is selected.
- Local Git identity is preferred over global Git identity.
- Global Git identity is used when local identity is absent.
- Missing identity is represented explicitly.
- Current-branch commit scope reads from `HEAD`.
- All-repository commit scope reads with `--all`.
- Commit list is limited to 30 displayed rows and sets `hasMore` based on the extra fetched row.
- Optional section failures degrade locally.
- Missing worktree and `git status` failures still return structured errors.

### Renderer Tests

- The Git panel displays remote, identity, branch/upstream, clean/dirty state, and commit rows.
- Dirty state shows a summary and `Review Diff` entry, not a changed-files list.
- Commit scope switching reloads or re-renders the appropriate commit list.
- Remote dropdown changes displayed remote URL without issuing a Git operation.
- Pinned Inspector preserves the Git overview snapshot.
- English and Chinese i18n keys are present.

### Manual Acceptance

- A repository with an upstream branch defaults to that upstream remote.
- A repository with multiple remotes allows switching the displayed remote.
- A repository with no commit identity shows an explicit not-configured state.
- A dirty worktree does not duplicate the `Diff` tab's changed-files review.

## Verification Commands

```bash
yarn workspace @teamcow/desktop test
yarn i18n:check
yarn typecheck
```

## Commit Status

This design document is intentionally not committed by the assistant. Project instructions require explicit user approval before any `git commit` or equivalent commit operation when using Superpowers skills.
