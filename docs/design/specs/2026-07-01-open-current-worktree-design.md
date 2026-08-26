# Open Current Worktree From Header

## Context

TeamCow already supports coding editor handoff through `openConversationHandoff`, `listEditorOptions`, `getSelectedEditor`, and `setSelectedEditor`. That flow is editor-centric and is currently surfaced in Inspector and Settings.

The requested feature is a Codex Desktop-style header control that opens the active conversation's current project location in locally available macOS tools. The reference implementation in `references/upstream/superset` uses a general external app menu with Finder, IDE, and terminal options. TeamCow should adopt the behavior while keeping its existing IPC and product model.

## Goals

- Add a header "open location" split control for the active conversation.
- Let users open the active conversation worktree in Finder, terminal apps, or installed IDEs/editors.
- Show only available local app options where availability can be detected.
- Preserve the current `Project -> Conversation` model: the opened path is derived from the active conversation's bound worktree.
- Keep renderer filesystem and process access behind preload and the unified `teamcow:invoke` IPC channel.

## Non-Goals

- Do not replace Inspector file handoff or Settings editor selection.
- Do not hot-swap a conversation's provider, model, or worktree.
- Do not add generic cross-platform support beyond macOS-first V1 behavior.
- Do not implement file-level external app routing in the header; the header opens the current worktree root.

## Architecture

Shared contracts add:

- `externalOpenAppIdSchema`: known app ids such as `finder`, `terminal`, `iterm2`, `ghostty`, `warp`, `cursor`, `vscode`, `windsurf`, `zed`, `sublime-text`, `webstorm`, and `intellij-idea`.
- `externalOpenOptionSchema`: id, label, appName, optional bundleId, group, and `isAvailable`.
- `listExternalOpenOptions` desktop command.
- `openConversationExternal` desktop command with `{ conversationId, appId }`.
- Result schemas for successful open and app/error cases.

Main process adds project-service methods:

- `listExternalOpenOptions()` builds a catalog and marks availability.
- `openConversationExternal(input)` resolves the conversation worktree root using the same safety checks as terminal/worktree handoff, then opens it with the selected app.

Renderer adds a header component in `DesktopShell`:

- Main button opens the last successfully used available app, defaulting to Finder.
- Dropdown lists available apps grouped as System, Terminal, and IDE.
- The control is disabled without an active conversation.
- Errors are displayed through the existing shell notice/error pattern rather than raw exception text.

## Data Flow

1. `DesktopShell` loads external open options through `window.teamcow.listExternalOpenOptions()`.
2. The header computes the active worktree from `activeConversation`.
3. User clicks the main button or a dropdown item.
4. Renderer calls `window.teamcow.openConversationExternal({ conversationId, appId })`.
5. Main validates the command, resolves the worktree root, verifies the app is available, opens it through macOS host APIs, and returns a typed result.
6. Renderer remembers the last successful app for the session and shows a localized success or error message.

## Opening Rules

- Finder uses the macOS Finder app to reveal/open the worktree root.
- Terminal apps use `/usr/bin/open` with the app bundle/name and the worktree path.
- IDE/editor apps use `/usr/bin/open -b <bundleId> <path>` when bundle ids are known, otherwise `/usr/bin/open -a <appName> <path>`.
- Availability detection uses bundle id Spotlight lookup for third-party apps, with Finder and Terminal treated as available on macOS.
- If an app becomes unavailable between listing and opening, return a typed `EXTERNAL_OPEN_APP_UNAVAILABLE` error.

## UX

The control lives in the existing window chrome `headerActions`, adjacent to Settings. It should feel like a compact workbench utility, not a marketing CTA:

- A small icon-plus-label button: "Open Location" / "打开位置".
- A chevron button opens the menu.
- Menu items use familiar icons from the existing icon library where possible.
- Disabled state text explains that a conversation is required.
- No large cards, hero treatment, or separate onboarding copy.

## Error Handling

New errors should be localized:

- `EXTERNAL_OPEN_APP_UNAVAILABLE`: selected local app is not installed or no longer available.
- `EXTERNAL_OPEN_FAILED`: macOS failed to open the current worktree in the selected app.

Existing errors are reused where possible:

- `CONVERSATION_NOT_FOUND`
- `WORKTREE_NOT_FOUND`
- `NOT_A_DIRECTORY`

Renderer catches unexpected failures and shows a generic localized fallback.

## Testing

Add tests before implementation:

- Shared contracts parse external open option, command, and result payloads.
- Desktop router routes `listExternalOpenOptions` and `openConversationExternal`.
- Project service lists app availability, opens a conversation worktree with the requested app, rejects unavailable apps, and preserves worktree safety checks.
- DesktopShell renders the header control, disables it without an active conversation, opens the default app, opens a selected app from the dropdown, and shows errors.
- Run `yarn workspace @teamcow/desktop test` for targeted coverage, then `yarn typecheck` and `yarn i18n:check` because contracts and user-visible strings change.
