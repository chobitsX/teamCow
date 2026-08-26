# TeamCow Reference Projects: Chat & Provider Integration Patterns

## Overview

Two key reference implementations:
- **T3 Code** (`apps/web`, `apps/server`, `apps/desktop`) - Chat-first agent bridge architecture
- **Superset** (`apps/desktop`, `packages/chat`, `packages/host-service`) - Desktop workbench with integrated chat runtime

## Key Findings

### 1. Chat Message Rendering & Streaming

#### Superset's `use-chat-display` Hook Pattern
**Location:** `superset/packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts`

**Pattern:**
- Single hook manages entire display state: messages, current streaming message, errors, UI commands
- Separates historical messages from in-flight `currentMessage`
- Uses polling with configurable FPS for client-side refresh (default 4fps)
- Filters historical messages to avoid showing duplicate in-flight assistant messages

**Key Features:**
```typescript
- Query-based polling (TanStack React Query)
- Optimistic user messages with "optimistic-" ID prefix
- Error deduplication: latest assistant error extracted via `findLatestAssistantErrorMessage()`
- Commands abstraction: sendMessage, stop, abort, respondToApproval, respondToQuestion, respondToPlan
- Turn-boundary logic: separates active turn from previous turns to dedupe streaming messages
```

**Error Handling:**
- `findLatestAssistantErrorMessage()` scans backwards through message history
- Checks both `stopReason !== "error"` and `errorMessage` fields
- Stops at first non-error completed assistant message
- Multiple error sources merged: runtime error → historical error → query error → command error

#### Message Parts Rendering
**Location:** `superset/apps/desktop/src/renderer/components/Chat/ChatInterface/components/MessagePartsRenderer/`

**Renders Multiple Part Types:**
- Text: Animated via Streamdown (streaming markdown parser)
- Reasoning: Collapsible reasoning blocks (Claude thinking/internal monologue)
- Error: Red alert box with AlertCircle icon and selectable text
- Tool calls: Dispatched to specialized components
- Images: Inline with zoom capability
- File attachments: Chips with file icons

**Tool Call Dispatch:**
- Reads-only tools (read_file, list_files, etc.) grouped in `ExploringGroup`
- Write/mutation tools rendered inline: BashTool, FileDiffTool, WebSearchTool, WebFetchTool
- Generic fallback: GenericToolCall component
- Each tool type has specialized rendering: diff previews, command output, web search results

### 2. Provider & Model Selection

#### T3 Code's Provider Model Pattern
**Location:** `t3code/apps/web/src/providerModels.ts`

**Architecture:**
```typescript
- getProviderSnapshot(): finds provider by driver kind
- getProviderModels(): retrieves models for driver instance
- resolveSelectableProvider(): fallback chain when instance unavailable
- getProviderModelCapabilities(): model-level feature flags
```

**Key Concepts:**
- Provider driver kind (e.g., "codex", "claude", "openai")
- Instance ID for multi-account support
- Model slug normalization for cross-provider compatibility
- Capabilities stored per model (option descriptors, feature flags)

#### Superset's Auth & Provider Status
**Location:** `superset/apps/desktop/src/shared/ai/provider-status.ts`

**Status Model:**
```typescript
ConnectionState: "connected" | "disconnected" | "needs_attention"
ProviderIssue: { code, message, remediation }
AuthStatusLike: { authenticated, method, source, issue }
Capabilities: { canUseChat, canGenerateWorkspaceTitle, canUseSmallModelTasks }
```

**Auth Resolution Logic:**
- Cascade through: managed OAuth → config credentials → keychain → env
- Detects expired OAuth, attempts refresh via Mastra before downgrading to "expired"
- Tracks credential source for UI signaling (external vs. managed)
- Per-provider issue codes (currently "expired")

### 3. Tool Call Display & Execution

#### Specialized Tool Rendering
**Location:** `superset/apps/desktop/src/renderer/components/Chat/ChatInterface/components/ToolCallBlock/`

**Architecture:**
- Single ToolCallBlock dispatches to 30+ specialized components
- Each tool has normalized name extraction and validation
- Result extraction with fallback chains for different response shapes

**Examples:**
```typescript
- ExecuteCommand → BashTool (shows stdout/stderr/exitCode)
- WriteFile → FileDiffTool (write mode: full content diff)
- EditFile → FileDiffTool (diff mode: hunks from structured patch)
- WebSearch → WebSearchTool (with results grouping)
- ReadFile → Inline display (not grouped away)
```

**State Representation:**
```typescript
type ToolState = "pending" | "running" | "completed" | "failed" | "interrupted"
// Via toWsToolState(part) from tool part data
```

**Result Parsing:**
- Flexible extraction: looks for output/result/stdout/stderr in multiple field name variations
- Hunk parsing: converts structured patch hunks to oldString/newString diffs
- File path normalization: resolves workspace-relative paths

### 4. Chat Session & Thread Management

#### T3 Code's Thread Context
**Location:** `t3code/apps/web/src/lib/chatThreadActions.ts`

**Thread Types:**
- Active thread (committed/persisted)
- Active draft thread (in-session working copy)
- Default thread context for fallback

**Context Properties:**
```typescript
- environmentId, projectId (identifies where chat runs)
- branch (git branch being worked on)
- worktreePath (isolated worktree for this session)
- envMode: "local" | "worktree" (execution environment)
```

**Thread Selection Logic:**
- Active thread > active draft thread > default project
- Contextual new thread preserves branch/worktree from previous thread
- Local-only thread mode bypasses worktree, runs in local env

### 5. Streaming & Real-time Updates

#### Superset's Runtime Display State
**Location:** `superset/packages/host-service/src/runtime/chat/chat.ts`

**Display State Fields:**
```typescript
{
  currentMessage: { role, id, ... } | null  // actively streaming
  isRunning: boolean                          // backend still processing
  errorMessage: string | null                 // runtime-level error
  pendingQuestion: ChatPendingQuestion | null // awaiting user input
  pendingApproval: {...} | null              // approval gate
}
```

**Polling Mechanism:**
- Client polls `getDisplayState` + `listMessages` with configurable interval
- Deduplication logic: active-turn messages deduplicated by ID
- Optimistic UI: client-side "optimistic-" prefix for user messages sent before server confirms

**Question/Approval Handling:**
```typescript
- respondToQuestion(): user answers, optimistically clears pending question
- respondToPlan(): user approves/rejects plan with optional feedback
- respondToApproval(): tool approval (approve/decline/always_allow_category)
- Rollback on error: restores pending question if response fails
```

### 6. Error States & Recovery

#### Multi-layer Error Collection
**Error sources (in order of precedence):**
1. Runtime error (active execution failure)
2. Latest assistant error (from message history)
3. Query error (TanStack Query failure)
4. Message list error
5. Command error (sendMessage/stop/abort threw)

**Error Message Extraction:**
- Searches backwards through message history
- Only returns error if latest assistant message has `stopReason === "error"`
- Stops at first fully completed (has stopReason) non-error message
- Both `stopReason` field AND `errorMessage` field checked

**Selectable Error Text:**
- Errors rendered with `.select-text` class (overrides electron's `user-select: none`)
- Users can copy error text for bug reports

### 7. Provider Authentication Flow

#### Superset's Multi-Method Auth
**Location:** `superset/packages/chat/src/server/desktop/chat-service/chat-service.ts`

**Auth Cascade:**
1. Managed OAuth (Mastra-handled, stored in browser auth storage)
2. Config file credentials (`anthropic.yml`, `openai.json`)
3. System keychain lookup
4. Environment variables (process.env fallback)

**Key Workflows:**
- OAuth expiry detection + automatic refresh attempt
- API key backup/restore during OAuth disconnection
- Provider-specific validation (isClaudeCredentialExpired, isOpenAICredentialExpired)
- Separate storage for OAuth vs. API key methods

### 8. Component Architecture Patterns

#### Message Component Composition
**Superset UI Elements:** `packages/ui/src/components/ai-elements/`

**Composable Parts:**
```typescript
<Message from="user|assistant">
  <MessageContent>{children}</MessageContent>
  <MessageActions>
    <MessageAction tooltip="Copy" />
  </MessageActions>
  <MessageAttachments>
    <MessageAttachment data={file} onRemove={...} />
  </MessageAttachments>
</Message>

// Branching variants
<MessageBranch defaultBranch={0} onBranchChange={...}>
  <MessageBranchContent>
    <div>Branch 1</div>
    <div>Branch 2</div>
  </MessageBranchContent>
  <MessageBranchSelector>
    <MessageBranchPrevious />
    <MessageBranchPage />
    <MessageBranchNext />
  </MessageBranchSelector>
</MessageBranch>
```

**Message Response:**
- Uses Streamdown for markdown rendering + streaming animation
- Configurable animation: blurIn, char-by-char, 180ms duration
- Mermaid diagram support via plugins
- Compact mode for tool call inner content via `TOOL_CALL_MD_CLASSNAME`

### 9. Accessibility & UX Patterns

#### Read-only Tool Grouping
**Concept:** Read-only tools (list_files, find_files, search_codebase) grouped away by default
- Reduces clutter during exploration
- Single read_file call rendered inline (not grouped)
- ExploringGroup collapsible container

#### File Interaction
- Normalized file paths: workspace-relative conversion
- Click handlers: open in viewer pane or diff pane
- Telemetry: capture tool usage, open target (view vs diff)
- Workspace context threaded through render chain

### 10. Session & Window Management

#### Superset Desktop IPC Pattern
**Key Design:** Observable subscriptions for IPC (not async generators)

```typescript
// CORRECT for trpc-electron
return observable<MyEvent>((emit) => {
  const handler = (data) => emit.next({...});
  myEmitter.on("event", handler);
  return () => myEmitter.off("event", handler);
});

// WRONG - async generators don't work with IPC transport
return async function*() {
  while(true) yield await getNextEvent();
}
```

**State Management:**
- TanStack Router for navigation
- Zustand stores for local state (theme, tabs, panes)
- tRPC subscriptions for real-time updates
- Electron contextBridge for secure IPC

---

## Patterns to Adopt for TeamCow

### High Priority (Core Chat)
1. **Polling-based display state** with FPS configuration
2. **Message deduplication** via optimistic ID prefixing
3. **Error message extraction** scanning backwards through history
4. **Multi-layer error handling** with fallback chain
5. **Tool part dispatch** with specialized renderers per tool type
6. **Provider authentication cascade** (OAuth → config → keychain → env)

### Medium Priority (UX Polish)
1. **Message branching** UI for retries
2. **Tool call grouping** for read-only tools
3. **Selective error text** (user-select: text on error boxes)
4. **File click handlers** for viewer/diff pane integration
5. **Markdown streaming animation** with Streamdown

### Medium Priority (Architecture)
1. **Provider capabilities model** with model-level feature flags
2. **Thread context** including branch/worktree info
3. **Auth status model** with connection states and remediation hints
4. **Observable subscriptions** for IPC (not async generators)

### Consider Later (Full Desktop Workbench)
1. Pane-based UI system (sidebar, chat, inspector, terminal)
2. Local SQLite + Drizzle ORM for persistence
3. Workspace/worktree abstraction
4. Diff/git/file viewer integration

---

## Summary

**T3 Code teaches:** How to build a chat-first interface that bridges mature coding tools without reimplementing agent runtime.

**Superset teaches:** How to architect a desktop workbench with clean separation of concerns—runtime, IPC, state management, and multi-pane rendering.

**For TeamCow:** Focus on Superset's message handling, error recovery, and provider auth patterns. Combine with T3 Code's chat-first philosophy. Save full workbench patterns for post-MVP expansion.
