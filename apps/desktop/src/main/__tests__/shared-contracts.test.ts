// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  appErrorCodeSchema,
  appErrorSchema,
  commitConversationChangesInputSchema,
  commitConversationChangesResultSchema,
  conversationChangeAreaSchema,
  conversationChangeDiffResultSchema,
  conversationChangeDiffDocumentResultSchema,
  conversationChangeFileSchema,
  conversationChangeFileStatsSchema,
  conversationChangeFileStatusSchema,
  conversationChangePathSchema,
  conversationChangesMutationResultSchema,
  conversationChangesMutationScopeSchema,
  conversationChangesSnapshotSchema,
  conversationFileReadInputSchema,
  conversationFileReadResultSchema,
  conversationFileWriteInputSchema,
  conversationFileWriteResultSchema,
  conversationGitStatusSchema,
  conversationMessageRoleSchema,
  conversationRunStatusSchema,
  conversationTimelineSchema,
  createConversationInputSchema,
  deleteWorktreeInputSchema,
  deleteWorktreeResultSchema,
  desktopCommandSchema,
  diagnosticLogEntrySchema,
  errorContextSchema,
  errorDomainSchema,
  editorOptionSchema,
  executionTargetSchema,
  externalOpenOptionSchema,
  getConversationChangeDiffInputSchema,
  getConversationChangeDiffDocumentInputSchema,
  getConversationChangesInputSchema,
  getConversationChangesResultSchema,
  getConversationProjectFilesResultSchema,
  getConversationGitStatusResultSchema,
  getConversationGitStatusInputSchema,
  getProjectWorktreeFilesResultSchema,
  hostNotificationPayloadSchema,
  getSlashCommandsForProvider,
  MAX_GIT_COMMIT_MESSAGE_LENGTH,
  openConversationExternalInputSchema,
  openConversationExternalResultSchema,
  openConversationTerminalInputSchema,
  openConversationTerminalResultSchema,
  projectFileTreeItemSchema,
  providerAccessModeSchema,
  providerModelOptionSchema,
  parseProviderSlashCommand,
  PROVIDER_MODEL_CATALOG,
  projectWorktreeSummarySchema,
  retryConversationRunWithPermissionsInputSchema,
  selectedEditorResultSchema,
  sendConversationMessageInputSchema,
  setConversationAccessModeInputSchema,
  setSelectedEditorInputSchema,
  terminalCloseInputSchema,
  terminalOutputEventSchema,
  terminalResizeInputSchema,
  terminalSessionSummarySchema,
  terminalWriteInputSchema,
  updateActionResultSchema,
  updateStateSchema,
  worktreeGitChangedEventSchema,
  worktreeKindSchema
} from "@shared/index"

describe("shared contracts", () => {
  it("parses diagnostic error context and legacy app errors", () => {
    expect(errorDomainSchema.parse("worktree")).toBe("worktree")
    expect(appErrorCodeSchema.parse("CONVERSATION_RUN_IN_PROGRESS")).toBe("CONVERSATION_RUN_IN_PROGRESS")
    expect(errorContextSchema.parse({
      projectId: "project-1",
      projectName: "teamCow",
      conversationId: "conversation-1",
      providerKind: "codex",
      accessMode: "worktree-write",
      worktreeId: "worktree-1",
      worktreeRootPath: "/tmp/teamcow",
      runId: "run-1",
      terminalSessionId: "terminal-1",
      updateStatus: "error",
      command: "deleteWorktree"
    })).toMatchObject({
      providerKind: "codex",
      accessMode: "worktree-write",
      updateStatus: "error",
      command: "deleteWorktree"
    })

    expect(appErrorSchema.parse({
      code: "WORKTREE_DELETE_FAILED",
      message: "git worktree remove failed",
      suggestion: null,
      domain: "worktree",
      context: {
        projectId: "project-1",
        worktreeId: "worktree-1"
      }
    })).toMatchObject({
      code: "WORKTREE_DELETE_FAILED",
      domain: "worktree"
    })

    expect(appErrorSchema.parse({
      code: "INTERNAL_ERROR",
      message: "legacy error",
      suggestion: null
    })).toMatchObject({
      code: "INTERNAL_ERROR"
    })
  })

  it("parses structured diagnostic log entries", () => {
    expect(diagnosticLogEntrySchema.parse({
      timestamp: "2026-06-08T04:10:00.000Z",
      level: "error",
      domain: "notification",
      event: "notification.send.failed",
      context: {
        projectId: "project-1",
        conversationId: "conversation-1",
        providerKind: "codex",
        errorCode: "NOTIFICATION_SEND_FAILED",
        errorMessage: "notification permission denied"
      }
    })).toMatchObject({
      level: "error",
      domain: "notification",
      event: "notification.send.failed"
    })
  })

  it("parses worktree-scoped git change events without exposing absolute paths", () => {
    expect(worktreeGitChangedEventSchema.parse({
      worktreeId: "worktree-1",
      paths: ["src/app.ts", "README.md"]
    })).toEqual({
      worktreeId: "worktree-1",
      paths: ["src/app.ts", "README.md"]
    })
    expect(worktreeGitChangedEventSchema.parse({ worktreeId: "worktree-1" })).toEqual({
      worktreeId: "worktree-1"
    })
    expect(() => worktreeGitChangedEventSchema.parse({
      worktreeId: "worktree-1",
      paths: ["/tmp/private.ts"]
    })).toThrow()
    expect(() => worktreeGitChangedEventSchema.parse({
      worktreeId: "worktree-1",
      paths: []
    })).toThrow()
    expect(() => worktreeGitChangedEventSchema.parse({
      worktreeId: "worktree-1",
      paths: Array.from({ length: 257 }, (_, index) => `src/file-${index}.ts`)
    })).toThrow()
  })

  it("accepts default, existing, and new worktree execution targets", () => {
    expect(executionTargetSchema.parse({ type: "default" })).toEqual({ type: "default" })
    expect(executionTargetSchema.parse({ type: "existing-worktree", worktreeId: "worktree-1" })).toEqual({
      type: "existing-worktree",
      worktreeId: "worktree-1"
    })
    expect(executionTargetSchema.parse({ type: "new-worktree", branch: "feat/parallel-experiment" })).toEqual({
      type: "new-worktree",
      branch: "feat/parallel-experiment"
    })
  })

  it("rejects empty branch names for new worktrees", () => {
    expect(() => executionTargetSchema.parse({ type: "new-worktree", branch: "" })).toThrow()
  })

  it("parses createConversation input with a new-worktree target", () => {
    expect(createConversationInputSchema.parse({
      projectId: "project-1",
      providerKind: "codex",
      model: "gpt-5.1",
      accessMode: "worktree-write",
      executionTarget: {
        type: "new-worktree",
        branch: "feat/parallel-experiment"
      }
    })).toMatchObject({
      projectId: "project-1",
      providerKind: "codex",
      model: "gpt-5.1",
      accessMode: "worktree-write",
      executionTarget: {
        type: "new-worktree",
        branch: "feat/parallel-experiment"
      }
    })
  })

  it("parses provider access modes and rejects unknown modes", () => {
    expect(providerAccessModeSchema.parse("read-only")).toBe("read-only")
    expect(providerAccessModeSchema.parse("worktree-write")).toBe("worktree-write")
    expect(providerAccessModeSchema.parse("full-access")).toBe("full-access")
    expect(() => providerAccessModeSchema.parse("workspace-write")).toThrow()
    expect(() => createConversationInputSchema.parse({
      projectId: "project-1",
      providerKind: "codex",
      model: "gpt-5.1",
      accessMode: "workspace-write",
      executionTarget: {
        type: "default"
      }
    })).toThrow()
  })

  it("exposes provider-specific slash command catalogs", () => {
    const commonCommands = ["help", "access", "status", "stop"]
    expect(getSlashCommandsForProvider("codex").map((command) => command.name)).toEqual([
      ...commonCommands,
      "plan",
      "reasoning"
    ])
    expect(getSlashCommandsForProvider("claude").map((command) => command.name)).toEqual([
      ...commonCommands,
      "plan",
      "effort",
      "budget",
      "agent"
    ])
    expect(getSlashCommandsForProvider("opencode").map((command) => command.name)).toEqual([
      ...commonCommands,
      "agent"
    ])
    expect(getSlashCommandsForProvider("cursor").map((command) => command.name)).toEqual([
      ...commonCommands,
      "plan",
      "ask"
    ])
  })

  it("parses slash commands into typed provider run options", () => {
    expect(parseProviderSlashCommand("codex", "/plan Design the implementation")).toMatchObject({
      status: "run",
      prompt: "Design the implementation",
      options: { mode: "plan" }
    })
    expect(parseProviderSlashCommand("codex", "/reasoning high Refactor the auth flow")).toMatchObject({
      status: "run",
      prompt: "Refactor the auth flow",
      options: { reasoningEffort: "high" }
    })
    expect(parseProviderSlashCommand("claude", "/plan Review the architecture")).toMatchObject({
      status: "run",
      prompt: "Review the architecture",
      options: { mode: "plan" }
    })
    expect(parseProviderSlashCommand("claude", "/budget 2.5 Audit dependencies")).toMatchObject({
      status: "run",
      prompt: "Audit dependencies",
      options: { maxBudgetUsd: 2.5 }
    })
    expect(parseProviderSlashCommand("claude", "/effort xhigh Trace the race")).toMatchObject({
      status: "run",
      prompt: "Trace the race",
      options: { reasoningEffort: "xhigh" }
    })
    expect(parseProviderSlashCommand("claude", "/agent general-purpose Review the patch")).toMatchObject({
      status: "run",
      prompt: "Review the patch",
      options: { agent: "general-purpose" }
    })
    expect(parseProviderSlashCommand("opencode", "/agent reviewer Review the patch")).toMatchObject({
      status: "run",
      prompt: "Review the patch",
      options: { agent: "reviewer" }
    })
    expect(parseProviderSlashCommand("cursor", "/plan Outline the change")).toMatchObject({
      status: "run",
      prompt: "Outline the change",
      options: { mode: "plan" }
    })
    expect(parseProviderSlashCommand("cursor", "/ask Explain this code")).toMatchObject({
      status: "run",
      prompt: "Explain this code",
      options: { mode: "ask" }
    })
  })

  it("rejects provider-mismatched and invalid slash command arguments", () => {
    expect(parseProviderSlashCommand("codex", "/effort high Fix it")).toMatchObject({
      status: "error",
      code: "unsupported-provider"
    })
    expect(parseProviderSlashCommand("claude", "/budget unlimited Fix it")).toMatchObject({
      status: "error",
      code: "invalid-argument"
    })
    expect(parseProviderSlashCommand("cursor", "/mode ask Fix it")).toMatchObject({
      status: "error",
      code: "unknown-command"
    })
    expect(parseProviderSlashCommand("codex", "/model gpt-5.6-sol")).toMatchObject({
      status: "error",
      code: "unknown-command"
    })
    expect(parseProviderSlashCommand("codex", "/Users/example/project")).toEqual({ status: "not-command" })
  })

  it("parses setConversationAccessMode desktop commands", () => {
    expect(setConversationAccessModeInputSchema.parse({
      conversationId: "conversation-1",
      accessMode: "full-access"
    })).toEqual({
      conversationId: "conversation-1",
      accessMode: "full-access"
    })

    expect(desktopCommandSchema.parse({
      type: "setConversationAccessMode",
      input: {
        conversationId: "conversation-1",
        accessMode: "read-only"
      }
    })).toMatchObject({
      type: "setConversationAccessMode",
      input: {
        conversationId: "conversation-1",
        accessMode: "read-only"
      }
    })

    expect(() => setConversationAccessModeInputSchema.parse({
      conversationId: "conversation-1",
      accessMode: "workspace-write"
    })).toThrow()
  })

  it("parses provider model options and listProviderModels desktop commands", () => {
    expect(providerModelOptionSchema.parse({
      id: "modelget/GPT-5.4",
      label: "modelget/GPT-5.4",
      detail: "Available from opencode models.",
      source: "native-list"
    })).toMatchObject({
      id: "modelget/GPT-5.4",
      source: "native-list"
    })

    expect(() => providerModelOptionSchema.parse({
      id: "",
      label: "Empty",
      detail: "Missing id"
    })).toThrow()

    expect(desktopCommandSchema.parse({
      type: "listProviderModels",
      input: {
        providerKind: "codex"
      }
    })).toMatchObject({
      type: "listProviderModels",
      input: {
        providerKind: "codex"
      }
    })

    expect(() => desktopCommandSchema.parse({
      type: "listProviderModels",
      input: {
        providerKind: "not-real"
      }
    })).toThrow()
  })

  it("keeps built-in provider model details locale neutral", () => {
    const builtInDetails = Object.values(PROVIDER_MODEL_CATALOG)
      .flat()
      .map((option) => option.detail)

    expect(builtInDetails).not.toHaveLength(0)
    expect(builtInDetails.join("\n")).not.toMatch(/[\u4E00-\u9FFF]/)
  })

  it("keeps the Claude fallback picker focused on auto and current exact models", () => {
    expect(PROVIDER_MODEL_CATALOG.claude.map((model) => model.id)).toEqual([
      "default",
      "claude-fable-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-sonnet-5",
      "claude-haiku-4-5"
    ])
  })

  it("accepts git_worktree contracts in typed desktop commands", () => {
    expect(worktreeKindSchema.parse("git_worktree")).toBe("git_worktree")
    expect(desktopCommandSchema.parse({
        type: "createConversation",
        input: {
          projectId: "project-1",
          providerKind: "codex",
          model: "gpt-5.1",
          executionTarget: {
            type: "new-worktree",
            branch: "feat/parallel-experiment"
        }
      }
    })).toMatchObject({
      type: "createConversation",
      input: {
        executionTarget: {
          type: "new-worktree",
          branch: "feat/parallel-experiment"
        }
      }
    })
  })

  it("parses project worktree lifecycle summaries and delete commands", () => {
    expect(appErrorCodeSchema.parse("WORKTREE_IN_USE")).toBe("WORKTREE_IN_USE")
    expect(appErrorCodeSchema.parse("WORKTREE_DELETE_FAILED")).toBe("WORKTREE_DELETE_FAILED")

    expect(projectWorktreeSummarySchema.parse({
      id: "worktree-2",
      projectId: "project-1",
      kind: "git_worktree",
      rootPath: "/tmp/teamcow-feature",
      branch: "feat/worktrees",
      status: "ready",
      conversationCount: 0,
      canDelete: true,
      deleteBlockedReason: null
    })).toMatchObject({
      id: "worktree-2",
      canDelete: true,
      deleteBlockedReason: null
    })

    expect(() => projectWorktreeSummarySchema.parse({
      id: "worktree-3",
      projectId: "project-1",
      kind: "git_worktree",
      rootPath: "/tmp/teamcow-used",
      branch: "feat/used",
      status: "ready",
      conversationCount: 1,
      canDelete: true,
      deleteBlockedReason: "in-use"
    })).toThrow()

    expect(() => projectWorktreeSummarySchema.parse({
      id: "worktree-4",
      projectId: "project-1",
      kind: "git_worktree",
      rootPath: "/tmp/teamcow-blocked",
      branch: "feat/blocked",
      status: "ready",
      conversationCount: 1,
      canDelete: false,
      deleteBlockedReason: null
    })).toThrow()

    expect(deleteWorktreeInputSchema.parse({ projectId: "project-1", worktreeId: "worktree-2" })).toEqual({
      projectId: "project-1",
      worktreeId: "worktree-2"
    })

    expect(deleteWorktreeResultSchema.parse({
      status: "deleted",
      projectId: "project-1",
      worktreeId: "worktree-2"
    })).toEqual({
      status: "deleted",
      projectId: "project-1",
      worktreeId: "worktree-2"
    })

    expect(desktopCommandSchema.parse({
      type: "listProjectWorktrees",
      input: {
        projectId: "project-1"
      }
    })).toMatchObject({
      type: "listProjectWorktrees",
      input: {
        projectId: "project-1"
      }
    })

    expect(desktopCommandSchema.parse({
      type: "deleteWorktree",
      input: {
        projectId: "project-1",
        worktreeId: "worktree-2"
      }
    })).toMatchObject({
      type: "deleteWorktree",
      input: {
        worktreeId: "worktree-2"
      }
    })
  })

  it("parses expanded conversation git overview contracts", () => {
    expect(appErrorCodeSchema.parse("GIT_STATUS_FAILED")).toBe("GIT_STATUS_FAILED")
    expect(appErrorCodeSchema.parse("GIT_STATUS_PARSE_FAILED")).toBe("GIT_STATUS_PARSE_FAILED")

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
        status: "ok",
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

    expect(getConversationGitStatusResultSchema.parse({
      status: "ok",
      git: gitStatus
    })).toMatchObject({
      status: "ok",
      git: {
        conversationId: "conversation-1",
        worktreeId: "worktree-1"
      }
    })

    const gitStatusCommand = desktopCommandSchema.parse({
      type: "getConversationGitStatus",
      input: {
        conversationId: "conversation-1",
        commitScope: "allRepository"
      }
    })
    expect(gitStatusCommand.type).toBe("getConversationGitStatus")
    if (gitStatusCommand.type !== "getConversationGitStatus") {
      throw new Error("expected git status command")
    }
    expect(gitStatusCommand.input).toEqual({
      conversationId: "conversation-1",
      commitScope: "allRepository"
    })
  })

  it("parses conversation changes snapshots, safe paths, and git error codes", () => {
    expect(appErrorCodeSchema.parse("GIT_CHANGES_READ_FAILED")).toBe("GIT_CHANGES_READ_FAILED")
    expect(appErrorCodeSchema.parse("GIT_CHANGE_OPERATION_FAILED")).toBe("GIT_CHANGE_OPERATION_FAILED")
    expect(appErrorCodeSchema.parse("GIT_COMMIT_EMPTY_INDEX")).toBe("GIT_COMMIT_EMPTY_INDEX")
    expect(appErrorCodeSchema.parse("GIT_COMMIT_IDENTITY_INVALID")).toBe("GIT_COMMIT_IDENTITY_INVALID")
    expect(appErrorCodeSchema.parse("GIT_COMMIT_REJECTED")).toBe("GIT_COMMIT_REJECTED")
    expect(appErrorCodeSchema.parse("GIT_COMMIT_FAILED")).toBe("GIT_COMMIT_FAILED")
    expect(conversationChangeAreaSchema.options).toEqual(["staged", "unstaged"])
    expect(conversationChangeFileStatusSchema.options).toEqual([
      "added",
      "modified",
      "deleted",
      "renamed",
      "copied",
      "untracked",
      "conflicted",
      "unknown"
    ])

    for (const identityPath of [
      " apps/desktop/src/main.ts ",
      "apps\\desktop\\src\\main.ts",
      "foo\\bar",
      "folder/file with trailing space "
    ]) {
      expect(conversationChangePathSchema.parse(identityPath)).toBe(identityPath)
    }
    for (const unsafePath of [
      "",
      ".",
      "..",
      "/tmp/main.ts",
      "\\rooted",
      "\\\\server\\share",
      "C:\\tmp\\main.ts",
      "C:/tmp/main.ts",
      "C:relative",
      "apps/../main.ts",
      "..\\outside",
      "dir\\..\\outside",
      "dir\\.\\outside",
      "apps//main.ts",
      "dir\\\\outside"
    ]) {
      expect(() => conversationChangePathSchema.parse(unsafePath)).toThrow()
    }

    expect(conversationChangeFileStatsSchema.parse({
      additions: 12,
      deletions: 3,
      isBinary: false
    })).toEqual({
      additions: 12,
      deletions: 3,
      isBinary: false
    })

    const changedFile = conversationChangeFileSchema.parse({
      path: "apps/desktop/src/main.ts",
      oldPath: null,
      status: "modified",
      additions: 12,
      deletions: 3,
      isBinary: false
    })
    const snapshot = conversationChangesSnapshotSchema.parse({
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      worktreeRootPath: "/tmp/teamcow",
      revision: "revision-1",
      staged: [changedFile],
      unstaged: [],
      checkedAt: "2026-07-10T04:30:00.000Z"
    })
    expect(snapshot.staged[0]?.path).toBe("apps/desktop/src/main.ts")

    expect(getConversationChangesInputSchema.parse({ conversationId: "conversation-1" })).toEqual({
      conversationId: "conversation-1"
    })
    expect(() => getConversationChangesInputSchema.parse({
      conversationId: "conversation-1",
      worktreeRootPath: "/tmp/renderer-controlled"
    })).toThrow()
    expect(getConversationChangesResultSchema.parse({
      status: "ok",
      changes: snapshot
    })).toMatchObject({
      status: "ok",
      changes: { conversationId: "conversation-1", worktreeId: "worktree-1" }
    })
    expect(getConversationChangesResultSchema.parse({
      status: "error",
      error: {
        code: "GIT_CHANGES_READ_FAILED",
        message: "status failed",
        domain: "git"
      }
    })).toMatchObject({ status: "error", error: { code: "GIT_CHANGES_READ_FAILED" } })
  })

  it("keeps patches exclusive to text conversation change diff results", () => {
    const request = {
      conversationId: "conversation-1",
      filePath: "apps/desktop/src/main.ts",
      area: "unstaged" as const
    }
    expect(getConversationChangeDiffInputSchema.parse(request)).toEqual(request)
    expect(() => getConversationChangeDiffInputSchema.parse({
      ...request,
      rootPath: "/tmp/renderer-controlled"
    })).toThrow()

    expect(conversationChangeDiffResultSchema.parse({
      status: "text",
      ...request,
      worktreeId: "worktree-1",
      patch: "@@ -1 +1 @@\n-old\n+new",
      truncated: true,
      originalByteLength: 1024,
      returnedByteLength: 512
    })).toMatchObject({
      status: "text",
      patch: "@@ -1 +1 @@\n-old\n+new",
      truncated: true
    })

    expect(conversationChangeDiffResultSchema.parse({
      status: "binary",
      ...request,
      worktreeId: "worktree-1"
    })).toMatchObject({ status: "binary", filePath: request.filePath })
    expect(() => conversationChangeDiffResultSchema.parse({
      status: "binary",
      ...request,
      worktreeId: "worktree-1",
      patch: "must not be accepted"
    })).toThrow()

    expect(conversationChangeDiffResultSchema.parse({
      status: "missing",
      ...request,
      worktreeId: "worktree-1",
      reason: "file-missing"
    })).toMatchObject({ status: "missing", reason: "file-missing" })
    expect(conversationChangeDiffResultSchema.parse({
      status: "unavailable",
      ...request,
      worktreeId: "worktree-1",
      reason: "unsupported-repository-state"
    })).toMatchObject({ status: "unavailable", reason: "unsupported-repository-state" })
    expect(conversationChangeDiffResultSchema.parse({
      status: "error",
      ...request,
      error: {
        code: "GIT_CHANGES_READ_FAILED",
        message: "diff failed",
        domain: "git"
      }
    })).toMatchObject({
      status: "error",
      conversationId: request.conversationId,
      filePath: request.filePath,
      area: request.area,
      error: { code: "GIT_CHANGES_READ_FAILED" }
    })
  })

  it("binds full change documents to an exact worktree revision and area", () => {
    const request = {
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      revision: "changes-v1:abc",
      filePath: "src/index.ts",
      area: "staged" as const
    }
    expect(getConversationChangeDiffDocumentInputSchema.parse(request)).toEqual(request)
    expect(conversationChangeDiffDocumentResultSchema.parse({
      status: "text",
      ...request,
      oldPath: null,
      original: "old\n",
      modified: "new\n",
      originalMode: "100644",
      modifiedMode: "100755",
      originalByteLength: 4,
      modifiedByteLength: 4
    })).toMatchObject({ status: "text", original: "old\n", modified: "new\n" })
    expect(conversationChangeDiffDocumentResultSchema.parse({
      status: "stale",
      ...request,
      actualRevision: "changes-v1:def"
    })).toMatchObject({ status: "stale", actualRevision: "changes-v1:def" })
    expect(() => getConversationChangeDiffDocumentInputSchema.parse({
      ...request,
      revision: ""
    })).toThrow()
  })

  it("parses conversation changes mutation, commit, and desktop command contracts", () => {
    const fileScope = conversationChangesMutationScopeSchema.parse({
      type: "file",
      filePath: "apps/desktop/src/main.ts"
    })
    const allScope = conversationChangesMutationScopeSchema.parse({ type: "all" })
    expect(fileScope).toEqual({ type: "file", filePath: "apps/desktop/src/main.ts" })
    expect(allScope).toEqual({ type: "all" })

    expect(conversationChangesMutationResultSchema.parse({
      status: "ok",
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      scope: fileScope,
      changedPaths: ["apps/desktop/src/main.ts"]
    })).toMatchObject({ status: "ok", changedPaths: ["apps/desktop/src/main.ts"] })
    expect(conversationChangesMutationResultSchema.parse({
      status: "partial",
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      scope: allScope,
      changedPaths: ["README.md"],
      failures: [{
        filePath: "apps/desktop/src/main.ts",
        error: {
          code: "GIT_CHANGE_OPERATION_FAILED",
          message: "path could not be discarded",
          domain: "git"
        }
      }]
    })).toMatchObject({ status: "partial", failures: [{ filePath: "apps/desktop/src/main.ts" }] })
    expect(conversationChangesMutationResultSchema.parse({
      status: "error",
      error: {
        code: "GIT_CHANGE_OPERATION_FAILED",
        message: "stage failed",
        domain: "git"
      }
    })).toMatchObject({ status: "error", error: { code: "GIT_CHANGE_OPERATION_FAILED" } })

    expect(commitConversationChangesInputSchema.parse({
      conversationId: "conversation-1",
      message: "feat: add Changes inspector"
    })).toEqual({
      conversationId: "conversation-1",
      message: "feat: add Changes inspector"
    })
    expect(commitConversationChangesInputSchema.safeParse({
      conversationId: "conversation-1",
      message: "x".repeat(MAX_GIT_COMMIT_MESSAGE_LENGTH + 1)
    }).success).toBe(false)
    expect(commitConversationChangesResultSchema.parse({
      status: "committed",
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      commitHash: "2508d1f012345678901234567890123456789abc",
      shortCommitHash: "2508d1f"
    })).toMatchObject({ status: "committed", shortCommitHash: "2508d1f" })
    expect(commitConversationChangesResultSchema.parse({
      status: "error",
      error: {
        code: "GIT_COMMIT_FAILED",
        message: "hook rejected the commit",
        domain: "git"
      }
    })).toMatchObject({ status: "error", error: { code: "GIT_COMMIT_FAILED" } })

    const commands = [
      { type: "getConversationChanges", input: { conversationId: "conversation-1" } },
      {
        type: "getConversationChangeDiff",
        input: { conversationId: "conversation-1", filePath: "README.md", area: "staged" }
      },
      { type: "stageConversationChanges", input: { conversationId: "conversation-1", scope: fileScope } },
      { type: "unstageConversationChanges", input: { conversationId: "conversation-1", scope: allScope } },
      {
        type: "discardConversationChanges",
        input: { conversationId: "conversation-1", scope: fileScope, expectedRevision: "revision-1" }
      },
      {
        type: "commitConversationChanges",
        input: { conversationId: "conversation-1", message: "feat: add Changes inspector" }
      }
    ] as const

    for (const command of commands) {
      expect(desktopCommandSchema.parse(command)).toEqual(command)
    }
  })

  it("parses conversation-bound project file contracts and desktop commands", () => {
    const sourceFile = projectFileTreeItemSchema.parse({
      path: "apps/desktop/src/main/project-service.ts",
      name: "project-service.ts",
      kind: "file",
      depth: 3,
      isSymlink: false
    })

    expect(sourceFile.path).toBe("apps/desktop/src/main/project-service.ts")

    expect(getConversationProjectFilesResultSchema.parse({
      status: "ok",
      projectFiles: {
        conversationId: "conversation-1",
        worktreeId: "worktree-1",
        worktreeRootPath: "/tmp/teamcow",
        directoryPath: "apps",
        files: [
          {
            path: "apps/desktop",
            name: "desktop",
            kind: "directory",
            depth: 1,
            isSymlink: false
          },
          sourceFile
        ],
        fileCount: 1,
        directoryCount: 1,
        truncated: false,
        checkedAt: "2026-06-04T08:17:33.000Z"
      }
    })).toMatchObject({
      status: "ok",
      projectFiles: {
        conversationId: "conversation-1",
        worktreeId: "worktree-1",
        directoryPath: "apps",
        fileCount: 1
      }
    })

    expect(desktopCommandSchema.parse({
      type: "getConversationProjectFiles",
      input: {
        conversationId: "conversation-1",
        directoryPath: "apps"
      }
    })).toEqual({
      type: "getConversationProjectFiles",
      input: {
        conversationId: "conversation-1",
        directoryPath: "apps"
      }
    })

    expect(() => desktopCommandSchema.parse({
      type: "getConversationProjectFiles",
      input: {
        conversationId: "",
        directoryPath: "../outside"
      }
    })).toThrow()

    expect(getProjectWorktreeFilesResultSchema.parse({
      status: "ok",
      projectFiles: {
        projectId: "project-1",
        worktreeId: "worktree-1",
        worktreeRootPath: "/tmp/teamcow",
        directoryPath: "",
        files: [sourceFile],
        fileCount: 1,
        directoryCount: 0,
        truncated: false,
        checkedAt: "2026-06-04T08:17:33.000Z"
      }
    })).toMatchObject({
      status: "ok",
      projectFiles: {
        projectId: "project-1",
        worktreeId: "worktree-1",
        fileCount: 1
      }
    })

    expect(desktopCommandSchema.parse({
      type: "getProjectWorktreeFiles",
      input: {
        projectId: "project-1",
        worktreeId: "worktree-1"
      }
    })).toEqual({
      type: "getProjectWorktreeFiles",
      input: {
        projectId: "project-1",
        worktreeId: "worktree-1"
      }
    })
  })

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

  it("parses conversation-bound handoff contracts and desktop commands", () => {
    expect(appErrorCodeSchema.parse("HANDOFF_EDITOR_NOT_SELECTED")).toBe("HANDOFF_EDITOR_NOT_SELECTED")
    expect(appErrorCodeSchema.parse("HANDOFF_EDITOR_UNAVAILABLE")).toBe("HANDOFF_EDITOR_UNAVAILABLE")
    expect(appErrorCodeSchema.parse("HANDOFF_TARGET_NOT_FILE")).toBe("HANDOFF_TARGET_NOT_FILE")
    expect(appErrorCodeSchema.parse("HANDOFF_OPEN_FAILED")).toBe("HANDOFF_OPEN_FAILED")
    expect(appErrorCodeSchema.parse("HANDOFF_PATH_OUTSIDE_WORKTREE")).toBe("HANDOFF_PATH_OUTSIDE_WORKTREE")

    expect(desktopCommandSchema.parse({
      type: "openConversationHandoff",
      input: {
        conversationId: "conversation-1",
        target: "worktree"
      }
    })).toEqual({
      type: "openConversationHandoff",
      input: {
        conversationId: "conversation-1",
        target: "worktree"
      }
    })

    expect(desktopCommandSchema.parse({
      type: "openConversationHandoff",
      input: {
        conversationId: "conversation-1",
        target: "file",
        filePath: "apps/desktop/src/main/project-service.ts"
      }
    })).toMatchObject({
      type: "openConversationHandoff",
      input: {
        target: "file",
        filePath: "apps/desktop/src/main/project-service.ts"
      }
    })

    expect(() => desktopCommandSchema.parse({
      type: "openConversationHandoff",
      input: {
        conversationId: "conversation-1",
        target: "file"
      }
    })).toThrow()
  })

  it("parses conversation-bound terminal contracts and desktop commands", () => {
    expect(appErrorCodeSchema.parse("TERMINAL_SHELL_UNAVAILABLE")).toBe("TERMINAL_SHELL_UNAVAILABLE")
    expect(appErrorCodeSchema.parse("TERMINAL_START_FAILED")).toBe("TERMINAL_START_FAILED")
    expect(appErrorCodeSchema.parse("TERMINAL_SESSION_NOT_FOUND")).toBe("TERMINAL_SESSION_NOT_FOUND")
    expect(appErrorCodeSchema.parse("TERMINAL_NATIVE_MODULE_FAILED")).toBe("TERMINAL_NATIVE_MODULE_FAILED")

    expect(openConversationTerminalInputSchema.parse({
      conversationId: "conversation-1"
    })).toEqual({
      conversationId: "conversation-1"
    })

    expect(() => openConversationTerminalInputSchema.parse({
      conversationId: "",
      cwd: "/tmp/teamcow"
    })).toThrow()

    const session = terminalSessionSummarySchema.parse({
      sessionId: "terminal-1",
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      cwd: "/tmp/teamcow",
      shell: "/bin/zsh",
      status: "running",
      startedAt: "2026-06-05T09:54:19.000Z"
    })
    expect(session).toMatchObject({
      sessionId: "terminal-1",
      cwd: "/tmp/teamcow",
      status: "running"
    })

    expect(openConversationTerminalResultSchema.parse({
      status: "ok",
      session,
      initialOutput: "ready\n"
    })).toMatchObject({
      status: "ok",
      initialOutput: "ready\n",
      session: {
        sessionId: "terminal-1"
      }
    })

    expect(terminalWriteInputSchema.parse({
      sessionId: "terminal-1",
      data: "yarn test\n"
    })).toEqual({
      sessionId: "terminal-1",
      data: "yarn test\n"
    })

    expect(terminalResizeInputSchema.parse({
      sessionId: "terminal-1",
      cols: 100,
      rows: 24
    })).toEqual({
      sessionId: "terminal-1",
      cols: 100,
      rows: 24
    })

    expect(terminalOutputEventSchema.parse({
      sessionId: "terminal-1",
      conversationId: "conversation-1",
      data: "ready\n",
      status: "running",
      receivedAt: "2026-06-05T09:54:20.000Z"
    })).toMatchObject({
      sessionId: "terminal-1",
      status: "running",
      data: "ready\n"
    })

    expect(terminalCloseInputSchema.parse({
      sessionId: "terminal-1"
    })).toEqual({
      sessionId: "terminal-1"
    })

    expect(desktopCommandSchema.parse({
      type: "openConversationTerminal",
      input: {
        conversationId: "conversation-1"
      }
    })).toEqual({
      type: "openConversationTerminal",
      input: {
        conversationId: "conversation-1"
      }
    })

    expect(desktopCommandSchema.parse({
      type: "writeTerminalInput",
      input: {
        sessionId: "terminal-1",
        data: "pwd\n"
      }
    })).toMatchObject({
      type: "writeTerminalInput",
      input: {
        sessionId: "terminal-1"
      }
    })

    expect(desktopCommandSchema.parse({
      type: "resizeTerminal",
      input: {
        sessionId: "terminal-1",
        cols: 120,
        rows: 30
      }
    })).toMatchObject({
      type: "resizeTerminal",
      input: {
        cols: 120,
        rows: 30
      }
    })

    expect(desktopCommandSchema.parse({
      type: "closeTerminal",
      input: {
        sessionId: "terminal-1"
      }
    })).toMatchObject({
      type: "closeTerminal",
      input: {
        sessionId: "terminal-1"
      }
    })
  })

  it("parses editor selector contracts and desktop commands", () => {
    expect(editorOptionSchema.parse({
      id: "vscode",
      label: "Visual Studio Code",
      appName: "Visual Studio Code",
      bundleId: "com.microsoft.VSCode",
      isAvailable: true
    })).toMatchObject({
      id: "vscode",
      label: "Visual Studio Code",
      isAvailable: true
    })

    expect(selectedEditorResultSchema.parse({
      status: "ok",
      selectedEditorId: "cursor",
      editors: [
        {
          id: "cursor",
          label: "Cursor",
          appName: "Cursor",
          isAvailable: true
        }
      ]
    })).toMatchObject({
      status: "ok",
      selectedEditorId: "cursor"
    })

    expect(setSelectedEditorInputSchema.parse({ editorId: null })).toEqual({ editorId: null })
    expect(desktopCommandSchema.parse({ type: "listEditorOptions" })).toEqual({ type: "listEditorOptions" })
    expect(desktopCommandSchema.parse({ type: "getSelectedEditor" })).toEqual({ type: "getSelectedEditor" })
    expect(desktopCommandSchema.parse({
      type: "setSelectedEditor",
      input: { editorId: "zed" }
    })).toEqual({
      type: "setSelectedEditor",
      input: { editorId: "zed" }
    })
  })

  it("parses external open contracts and desktop commands", () => {
    expect(externalOpenOptionSchema.parse({
      id: "cmux",
      label: "cmux",
      appName: "cmux",
      iconDataUrl: "data:image/png;base64,ZmFrZS1jbXV4LWljb24=",
      group: "terminal",
      isAvailable: true
    })).toMatchObject({
      id: "cmux",
      iconDataUrl: "data:image/png;base64,ZmFrZS1jbXV4LWljb24=",
      group: "terminal",
      isAvailable: true
    })

    expect(openConversationExternalInputSchema.parse({
      conversationId: "conversation-1",
      appId: "antigravity-ide"
    })).toEqual({
      conversationId: "conversation-1",
      appId: "antigravity-ide"
    })

    expect(openConversationExternalResultSchema.parse({
      status: "opened",
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      appId: "antigravity-ide",
      appLabel: "Antigravity IDE",
      targetPath: "/tmp/teamcow"
    })).toMatchObject({
      status: "opened",
      appId: "antigravity-ide",
      targetPath: "/tmp/teamcow"
    })

    expect(desktopCommandSchema.parse({ type: "listExternalOpenOptions" })).toEqual({
      type: "listExternalOpenOptions"
    })

    expect(desktopCommandSchema.parse({
      type: "openConversationExternal",
      input: {
        conversationId: "conversation-1",
        appId: "antigravity-ide"
      }
    })).toEqual({
      type: "openConversationExternal",
      input: {
        conversationId: "conversation-1",
        appId: "antigravity-ide"
      }
    })
  })

  it("parses conversation timeline contracts with message, run, event, and artifact layers", () => {
    expect(conversationMessageRoleSchema.parse("user")).toBe("user")
    expect(conversationRunStatusSchema.parse("unavailable")).toBe("unavailable")

    expect(sendConversationMessageInputSchema.parse({
      conversationId: "conversation-1",
      content: "Persist this task context"
    })).toEqual({
      conversationId: "conversation-1",
      content: "Persist this task context"
    })
    expect(sendConversationMessageInputSchema.parse({
      conversationId: "conversation-1",
      content: "",
      attachments: [{
        name: "screen.png",
        mimeType: "image/png",
        sizeBytes: 4,
        dataBase64: "iVBORw=="
      }]
    })).toMatchObject({
      content: "",
      attachments: [{ name: "screen.png", mimeType: "image/png", sizeBytes: 4 }]
    })
    expect(sendConversationMessageInputSchema.safeParse({
      conversationId: "conversation-1",
      content: ""
    }).success).toBe(false)

    expect(retryConversationRunWithPermissionsInputSchema.parse({
      conversationId: "conversation-1",
      runId: "run-denied",
      allowedTools: ["mcp__web-reader__webReader"]
    })).toEqual({
      conversationId: "conversation-1",
      runId: "run-denied",
      allowedTools: ["mcp__web-reader__webReader"]
    })

    expect(conversationTimelineSchema.parse({
      conversationId: "conversation-1",
      messages: [
        {
          id: "message-1",
          conversationId: "conversation-1",
          role: "user",
          content: "Persist this task context",
          model: "gpt-5.1",
          runId: "run-1",
          createdAt: "2026-05-19T02:40:00.000Z"
        }
      ],
      queuedMessages: [{
        id: "queued-message-1",
        conversationId: "conversation-1",
        content: "Run after the current task",
        attachments: [],
        createdAt: "2026-05-19T02:40:01.000Z"
      }],
      runs: [
        {
          id: "run-1",
          conversationId: "conversation-1",
          provider: "codex",
          model: "gpt-5.1",
          worktreeId: "worktree-1",
          status: "unavailable",
          startedAt: "2026-05-19T02:40:00.000Z",
          completedAt: "2026-05-19T02:40:00.000Z",
          createdAt: "2026-05-19T02:40:00.000Z",
          updatedAt: "2026-05-19T02:40:00.000Z"
        }
      ],
      events: [
        {
          id: "event-1",
          conversationId: "conversation-1",
          runId: "run-1",
          sequence: 1,
          type: "system.status",
          payload: {
            status: "unavailable"
          },
          createdAt: "2026-05-19T02:40:00.000Z"
        }
      ],
      artifacts: []
    })).toMatchObject({
      conversationId: "conversation-1",
      messages: [{ role: "user", runId: "run-1" }],
      queuedMessages: [{ id: "queued-message-1", content: "Run after the current task" }],
      runs: [{ status: "unavailable" }],
      events: [{ type: "system.status" }],
      artifacts: []
    })
  })

  it("parses local history timelines with multiple runs and artifact ownership", () => {
    expect(conversationTimelineSchema.parse({
      conversationId: "conversation-history",
      messages: [],
      runs: [
        {
          id: "run-1",
          conversationId: "conversation-history",
          provider: "codex",
          model: "gpt-5.1",
          worktreeId: "worktree-1",
          status: "completed",
          startedAt: "2026-05-19T02:40:00.000Z",
          completedAt: "2026-05-19T02:41:00.000Z",
          createdAt: "2026-05-19T02:40:00.000Z",
          updatedAt: "2026-05-19T02:41:00.000Z"
        },
        {
          id: "run-2",
          conversationId: "conversation-history",
          provider: "claude",
          model: "claude-sonnet-4",
          worktreeId: "worktree-1",
          status: "failed",
          startedAt: "2026-05-19T02:45:00.000Z",
          completedAt: "2026-05-19T02:46:00.000Z",
          createdAt: "2026-05-19T02:45:00.000Z",
          updatedAt: "2026-05-19T02:46:00.000Z"
        }
      ],
      events: [],
      artifacts: [
        {
          id: "artifact-1",
          conversationId: "conversation-history",
          runId: "run-1",
          kind: "summary",
          title: "First result",
          uri: null,
          payload: { changedFiles: 2 },
          createdAt: "2026-05-19T02:41:00.000Z"
        },
        {
          id: "artifact-2",
          conversationId: "conversation-history",
          runId: "run-2",
          kind: "summary",
          title: "Second result",
          uri: null,
          payload: { changedFiles: 1 },
          createdAt: "2026-05-19T02:46:00.000Z"
        }
      ]
    })).toMatchObject({
      conversationId: "conversation-history",
      runs: [
        { id: "run-1", provider: "codex", status: "completed" },
        { id: "run-2", provider: "claude", status: "failed" }
      ],
      artifacts: [
        { id: "artifact-1", runId: "run-1" },
        { id: "artifact-2", runId: "run-2" }
      ]
    })
  })

  it("accepts timeline commands through the typed desktop command contract", () => {
    expect(desktopCommandSchema.parse({
      type: "sendConversationMessage",
      input: {
        conversationId: "conversation-1",
        content: "Continue the implementation"
      }
    })).toMatchObject({
      type: "sendConversationMessage",
      input: {
        conversationId: "conversation-1"
      }
    })

    expect(desktopCommandSchema.parse({
      type: "retryConversationRunWithPermissions",
      input: {
        conversationId: "conversation-1",
        runId: "run-denied",
        allowedTools: ["mcp__web-reader__webReader"]
      }
    })).toMatchObject({
      type: "retryConversationRunWithPermissions",
      input: {
        conversationId: "conversation-1",
        runId: "run-denied",
        allowedTools: ["mcp__web-reader__webReader"]
      }
    })

    expect(desktopCommandSchema.parse({
      type: "deleteQueuedConversationMessage",
      input: {
        conversationId: "conversation-1",
        queuedMessageId: "queued-message-1"
      }
    })).toEqual({
      type: "deleteQueuedConversationMessage",
      input: {
        conversationId: "conversation-1",
        queuedMessageId: "queued-message-1"
      }
    })

    expect(desktopCommandSchema.parse({
      type: "getConversationTimeline",
      input: {
        conversationId: "conversation-1"
      }
    })).toMatchObject({
      type: "getConversationTimeline",
      input: {
        conversationId: "conversation-1"
      }
    })

    expect(desktopCommandSchema.parse({
      type: "getConversationTimelinePage",
      input: {
        conversationId: "conversation-1",
        beforeRunId: "run-20",
        limit: 20
      }
    })).toEqual({
      type: "getConversationTimelinePage",
      input: {
        conversationId: "conversation-1",
        beforeRunId: "run-20",
        limit: 20
      }
    })

    expect(() => desktopCommandSchema.parse({
      type: "getConversationTimelinePage",
      input: { conversationId: "conversation-1", limit: 51 }
    })).toThrow()

    expect(desktopCommandSchema.parse({
      type: "cancelConversationRun",
      input: {
        conversationId: "conversation-1"
      }
    })).toEqual({
      type: "cancelConversationRun",
      input: {
        conversationId: "conversation-1"
      }
    })

    expect(() => desktopCommandSchema.parse({
      type: "cancelConversationRun",
      input: {
        conversationId: ""
      }
    })).toThrow()
  })

  it("parses host notification and update lifecycle contracts with required context", () => {
    expect(hostNotificationPayloadSchema.parse({
      kind: "run-completed",
      title: "Run completed",
      body: "Codex finished Build settings drawer in teamCow.",
      context: {
        projectName: "teamCow",
        conversationTitle: "Build settings drawer",
        providerKind: "codex",
        worktreeLabel: "main",
        runStatus: "completed"
      },
      params: {
        conversationId: "conversation-1",
        runId: "run-1"
      }
    })).toMatchObject({
      kind: "run-completed",
      context: {
        providerKind: "codex",
        runStatus: "completed"
      }
    })

    expect(() => hostNotificationPayloadSchema.parse({
      kind: "run-completed",
      title: "Run completed",
      body: "Missing required context."
    })).toThrow()

    expect(updateStateSchema.parse({
      status: "downloaded",
      version: "1.2.3",
      downloadedAt: "2026-06-07T14:40:00.000Z"
    })).toMatchObject({
      status: "downloaded",
      version: "1.2.3"
    })

    expect(updateActionResultSchema.parse({
      status: "error",
      state: {
        status: "error",
        errorCode: "UPDATE_CHECK_FAILED",
        message: "Update metadata unavailable."
      },
      error: {
        code: "UPDATE_CHECK_FAILED",
        message: "Update metadata unavailable.",
        suggestion: null
      }
    })).toMatchObject({
      status: "error",
      error: {
        code: "UPDATE_CHECK_FAILED"
      }
    })

    expect(desktopCommandSchema.parse({
      type: "showHostNotification",
      input: {
        kind: "run-failed",
        title: "Run failed",
        body: "Codex needs attention.",
        context: {
          projectName: "teamCow",
          conversationTitle: "Fix provider readiness",
          providerKind: "codex",
          worktreeLabel: "feat/readiness",
          runStatus: "failed"
        }
      }
    })).toMatchObject({
      type: "showHostNotification",
      input: {
        kind: "run-failed"
      }
    })

    expect(desktopCommandSchema.parse({ type: "checkForUpdates" })).toEqual({ type: "checkForUpdates" })
    expect(desktopCommandSchema.parse({ type: "getUpdateState" })).toEqual({ type: "getUpdateState" })
    expect(desktopCommandSchema.parse({ type: "installUpdateAndRestart" })).toEqual({
      type: "installUpdateAndRestart"
    })
  })

  it("parses getAppTheme and setAppTheme commands", () => {
    expect(desktopCommandSchema.parse({ type: "getAppTheme" })).toEqual({ type: "getAppTheme" })
    expect(
      desktopCommandSchema.parse({ type: "setAppTheme", input: { theme: "light" } })
    ).toEqual({ type: "setAppTheme", input: { theme: "light" } })
  })

  it("rejects an unknown theme value", () => {
    expect(() => desktopCommandSchema.parse({ type: "setAppTheme", input: { theme: "sepia" } })).toThrow()
  })
})
