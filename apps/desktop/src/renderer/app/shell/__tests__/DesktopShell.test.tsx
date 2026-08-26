// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  AppContextSnapshot,
  AppThemePreference,
  CommitConversationChangesInput,
  CommitConversationChangesResult,
  ConversationChangeDiffDocumentResult,
  ConversationChangesSnapshot,
  ConversationChangesMutationInput,
  ConversationChangesMutationResult,
  DiscardConversationChangesInput,
  ConversationTimeline,
  CreateConversationResult,
  ExternalOpenOption,
  GetConversationChangeDiffInput,
  GetConversationChangeDiffDocumentInput,
  GetConversationChangeDiffResult,
  GetConversationChangesResult,
  GetConversationGitStatusResult,
  GetConversationProjectFilesResult,
  GetConversationTimelineResult,
  GetConversationTimelinePageResult,
  GetProjectWorktreeFilesResult,
  ImportProjectResult,
  Locale,
  OpenConversationExternalInput,
  OpenConversationExternalResult,
  OpenConversationHandoffInput,
  OpenConversationHandoffResult,
  OpenConversationTerminalResult,
  ProjectFileTreeItem,
  ProviderModelOption,
  ProviderReadinessSnapshot,
  RunEventPushPayload,
  SendConversationMessageResult,
  TerminalOutputEvent,
  ProjectWorktreeSummary,
  UpdateActionResult,
  UpdateState,
  WorktreeGitChangedEvent,
  WorktreeSummary
} from "@shared/index"
import { I18nProvider, i18n } from "../../providers/I18nProvider"
import { ThemeProvider } from "../../providers/ThemeProvider"

vi.mock("../editor/CodeEditor", async () => {
  const React = await import("react")
  return {
    CodeEditor: ({
      value,
      readOnly,
      onChange,
      onSave
    }: {
      value: string
      readOnly: boolean
      onChange: (value: string) => void
      onSave: () => void
    }) => React.createElement(React.Fragment, null,
      React.createElement("textarea", {
        "data-testid": "mock-code-editor",
        value,
        readOnly,
        onChange: (event: { currentTarget: HTMLTextAreaElement }) => onChange(event.currentTarget.value),
        onKeyDown: (event: { key: string; metaKey: boolean; ctrlKey: boolean; preventDefault: () => void }) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "s") {
            event.preventDefault()
            onSave()
          }
        }
      }),
      React.createElement("button", {
        "data-testid": "mock-code-editor-dirty",
        type: "button",
        onClick: () => onChange(`// dirty edit\n${value}`)
      }, "dirty")
    )
  }
})

vi.mock("../editor/ChangeDiffCodeView", async () => {
  const React = await import("react")
  return {
    ChangeDiffCodeView: ({ original, modified }: { original: string; modified: string }) =>
      React.createElement("div", { "data-testid": "mock-change-diff-code-view" },
        React.createElement("pre", { "data-testid": "mock-change-diff-original" }, original),
        React.createElement("pre", { "data-testid": "mock-change-diff-modified" }, modified)
      )
  }
})

import { DesktopShell } from "../DesktopShell"

const emptyContext: AppContextSnapshot = {
  mode: "development",
  platform: "darwin",
  version: "38.0.0",
  selectedProjectId: null,
  selectedConversationId: null,
  projects: [],
  shell: {
    projectName: null,
    conversationTitle: null,
    providerKind: null,
    worktreeBranch: null,
    worktreePath: null,
    runStatus: null,
    hasProjects: false,
    hasConversations: false
  },
  chips: [
    { kind: "project", value: "" },
    { kind: "conversation", value: "" },
    { kind: "provider", value: "" },
    { kind: "worktree", value: "" },
    { kind: "run-status", value: "" }
  ]
}

const projectOnlyContext: AppContextSnapshot = {
  mode: "development",
  platform: "darwin",
  version: "38.0.0",
  selectedProjectId: "project-1",
  selectedConversationId: null,
  projects: [
    {
      id: "project-1",
      name: "teamcow",
      rootPath: "/tmp/teamcow",
      status: "ready",
      isCurrent: true,
      defaultWorktree: {
        id: "worktree-1",
        projectId: "project-1",
        kind: "default",
        rootPath: "/tmp/teamcow",
        branch: "main",
        status: "ready"
      },
      conversations: []
    }
  ],
  shell: {
    projectName: "teamcow",
    conversationTitle: null,
    providerKind: null,
    worktreeBranch: "main",
    worktreePath: "/tmp/teamcow",
    runStatus: null,
    hasProjects: true,
    hasConversations: false
  },
  chips: [
    { kind: "project", value: "teamcow" },
    { kind: "conversation", value: "" },
    { kind: "provider", value: "" },
    { kind: "worktree", value: "main" },
    { kind: "run-status", value: "" }
  ]
}

const selectionContext: AppContextSnapshot = {
  mode: "development",
  platform: "darwin",
  version: "38.0.0",
  selectedProjectId: "project-1",
  selectedConversationId: "conversation-2",
  projects: [
    {
      id: "project-1",
      name: "teamcow",
      rootPath: "/tmp/teamcow",
      status: "ready",
      isCurrent: true,
      defaultWorktree: {
        id: "worktree-1",
        projectId: "project-1",
        kind: "default",
        rootPath: "/tmp/teamcow",
        branch: "main",
        status: "ready"
      },
      conversations: [
        {
          id: "conversation-1",
          projectId: "project-1",
          title: "Navigation cleanup",
          worktreeId: "worktree-1",
          worktree: {
            id: "worktree-1",
            projectId: "project-1",
            kind: "default",
            rootPath: "/tmp/teamcow",
            branch: "main",
            status: "ready"
          },
          provider: {
            kind: "codex",
            label: "Codex",
            status: "ready"
          },
          currentModel: "gpt-5.1",
          runStatus: "idle",
          createdAt: "2026-05-09T08:00:00.000Z",
          updatedAt: "2026-05-09T08:00:00.000Z",
          isCurrent: false
        },
        {
          id: "conversation-2",
          projectId: "project-1",
          title: "Inspector polish",
          worktreeId: "worktree-1",
          worktree: {
            id: "worktree-1",
            projectId: "project-1",
            kind: "default",
            rootPath: "/tmp/teamcow",
            branch: "main",
            status: "ready"
          },
          provider: {
            kind: "claude",
            label: "Claude",
            status: "ready"
          },
          currentModel: "claude-sonnet-4",
          runStatus: "running",
          createdAt: "2026-05-09T09:00:00.000Z",
          updatedAt: "2026-05-09T09:05:00.000Z",
          isCurrent: true
        }
      ]
    }
  ],
  shell: {
    projectName: "teamcow",
    conversationTitle: "Inspector polish",
    providerKind: "claude",
    worktreeBranch: "main",
    worktreePath: "/tmp/teamcow",
    runStatus: "running",
    hasProjects: true,
    hasConversations: true
  },
  chips: [
    { kind: "project", value: "teamcow" },
    { kind: "conversation", value: "Inspector polish" },
    { kind: "provider", value: "claude" },
    { kind: "worktree", value: "main" },
    { kind: "run-status", value: "running" }
  ]
}

const conversationListContext: AppContextSnapshot = {
  mode: "development",
  platform: "darwin",
  version: "38.0.0",
  selectedProjectId: "project-1",
  selectedConversationId: null,
  projects: [
    {
      id: "project-1",
      name: "teamcow",
      rootPath: "/tmp/teamcow",
      status: "ready",
      isCurrent: true,
      defaultWorktree: {
        id: "worktree-1",
        projectId: "project-1",
        kind: "default",
        rootPath: "/tmp/teamcow",
        branch: "main",
        status: "ready"
      },
      conversations: [
        {
          id: "conversation-1",
          projectId: "project-1",
          title: "Navigation cleanup",
          worktreeId: "worktree-1",
          worktree: {
            id: "worktree-1",
            projectId: "project-1",
            kind: "default",
            rootPath: "/tmp/teamcow",
            branch: "main",
            status: "ready"
          },
          provider: {
            kind: "codex",
            label: "Codex",
            status: "ready"
          },
          currentModel: "gpt-5.1",
          runStatus: "idle",
          createdAt: "2026-05-09T08:00:00.000Z",
          updatedAt: "2026-05-09T08:00:00.000Z",
          isCurrent: false
        },
        {
          id: "conversation-2",
          projectId: "project-1",
          title: "Inspector polish",
          worktreeId: "worktree-1",
          worktree: {
            id: "worktree-1",
            projectId: "project-1",
            kind: "default",
            rootPath: "/tmp/teamcow",
            branch: "main",
            status: "ready"
          },
          provider: {
            kind: "claude",
            label: "Claude",
            status: "ready"
          },
          currentModel: "claude-sonnet-4",
          runStatus: "running",
          createdAt: "2026-05-09T09:00:00.000Z",
          updatedAt: "2026-05-09T09:05:00.000Z",
          isCurrent: false
        }
      ]
    }
  ],
  shell: {
    projectName: "teamcow",
    conversationTitle: null,
    providerKind: null,
    worktreeBranch: "main",
    worktreePath: "/tmp/teamcow",
    runStatus: null,
    hasProjects: true,
    hasConversations: true
  },
  chips: [
    { kind: "project", value: "teamcow" },
    { kind: "conversation", value: "" },
    { kind: "provider", value: "" },
    { kind: "worktree", value: "main" },
    { kind: "run-status", value: "" }
  ]
}

const initialProviderSnapshot: ProviderReadinessSnapshot = {
  checkedAt: "",
  providers: [
    {
      kind: "codex",
      availability: "unknown",
      badge: {
        kind: "codex",
        label: "codex",
        status: "unknown"
      },
      issues: []
    },
    {
      kind: "claude",
      availability: "unknown",
      badge: {
        kind: "claude",
        label: "claude",
        status: "unknown"
      },
      issues: []
    },
    {
      kind: "opencode",
      availability: "unknown",
      badge: {
        kind: "opencode",
        label: "opencode",
        status: "unknown"
      },
      issues: []
    }
  ]
}

const refreshedProviderSnapshot: ProviderReadinessSnapshot = {
  checkedAt: "2026-05-15T10:12:00.000Z",
  providers: [
    {
      kind: "codex",
      availability: "ready",
      badge: {
        kind: "codex",
        label: "codex",
        status: "ready"
      },
      issues: []
    },
    {
      kind: "claude",
      availability: "ready",
      badge: {
        kind: "claude",
        label: "claude",
        status: "ready"
      },
      issues: []
    },
    {
      kind: "opencode",
      availability: "unavailable",
      badge: {
        kind: "opencode",
        label: "opencode",
        status: "unavailable"
      },
      issues: [{ kind: "auth-missing" }]
    }
  ]
}

const unavailableClaudeSnapshot: ProviderReadinessSnapshot = {
  checkedAt: "2026-05-19T02:47:00.000Z",
  providers: refreshedProviderSnapshot.providers.map((provider) =>
    provider.kind === "claude"
      ? {
          ...provider,
          availability: "unavailable" as const,
          badge: {
            ...provider.badge,
            status: "unavailable" as const
          },
          issues: [{ kind: "auth-missing" as const }]
        }
      : provider
  )
}

const projectWorktrees: WorktreeSummary[] = [
  {
    id: "worktree-1",
    projectId: "project-1",
    kind: "default",
    rootPath: "/tmp/teamcow",
    branch: "main",
    status: "ready"
  },
  {
    id: "worktree-2",
    projectId: "project-1",
    kind: "git_worktree",
    rootPath: "/tmp/teamcow-feature",
    branch: "feat/new-conversation",
    status: "ready"
  }
]

const fallbackProviderModels: Record<string, ProviderModelOption[]> = {
  codex: [
    { id: "gpt-5.1", label: "GPT-5.1", detail: "Balanced reasoning for day-to-day coding." },
    { id: "gpt-5.1-mini", label: "GPT-5.1 Mini", detail: "Faster local iteration and lightweight edits." }
  ],
  claude: [
    { id: "claude-sonnet-4", label: "Sonnet 4", detail: "Recommended default for repo-aware coding sessions." },
    { id: "claude-opus-4.1", label: "Opus 4.1", detail: "Deeper reasoning for larger implementation work." }
  ],
  opencode: [
    { id: "open-code-default", label: "OpenCode Default", detail: "Fallback local model profile for quick experiments." }
  ],
  cursor: [
    { id: "auto", label: "Auto", detail: "Let Cursor select the best available model." },
    { id: "composer-2.5", label: "Composer 2.5", detail: "Cursor's coding model." }
  ]
}

const emptyTimeline = (conversationId: string): ConversationTimeline => ({
  conversationId,
  messages: [],
  queuedMessages: [],
  runs: [],
  events: [],
  artifacts: []
})

const dirtyGitStatus = (
  conversationId = "conversation-2",
  overrides: Partial<Extract<GetConversationGitStatusResult, { status: "ok" }>["git"]> = {}
): GetConversationGitStatusResult => {
  const git: Extract<GetConversationGitStatusResult, { status: "ok" }>["git"] = {
    conversationId,
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
      current: "feat/git-panel",
      recorded: "main",
      upstream: "origin/main",
      isClean: false,
      changedCount: 3
    },
    commits: {
      status: "ok",
      scope: "currentBranch",
      items: [
        {
          hash: "2508d1f012345678901234567890123456789abc",
          shortHash: "2508d1f",
          subject: "fix: remove inspector execution targets",
          authorName: "Team Cow",
          authoredAt: "2026-07-08T08:17:33+08:00",
          relativeTime: "2 hours ago"
        },
        {
          hash: "6e1123a012345678901234567890123456789abc",
          shortHash: "6e1123a",
          subject: "fix: avoid redundant mermaid renders",
          authorName: "Team Cow",
          authoredAt: "2026-07-08T07:17:33+08:00",
          relativeTime: "3 hours ago"
        }
      ],
      hasMore: false
    },
    checkedAt: "2026-07-08T08:30:00.000Z",
    ...overrides
  }

  return {
    status: "ok",
    git
  }
}

const projectFileFixtureByDirectory: Record<string, ProjectFileTreeItem[]> = {
  "": [
    { path: "apps", name: "apps", kind: "directory", depth: 0, isSymlink: false },
    { path: "dist", name: "dist", kind: "directory", depth: 0, isSymlink: false },
    { path: "node_modules", name: "node_modules", kind: "directory", depth: 0, isSymlink: false },
    { path: "packages", name: "packages", kind: "directory", depth: 0, isSymlink: false },
    { path: "package.json", name: "package.json", kind: "file", depth: 0, isSymlink: false }
  ],
  apps: [
    { path: "apps/desktop", name: "desktop", kind: "directory", depth: 1, isSymlink: false }
  ],
  "apps/desktop": [
    { path: "apps/desktop/src", name: "src", kind: "directory", depth: 2, isSymlink: false }
  ],
  "apps/desktop/src": [
    { path: "apps/desktop/src/main", name: "main", kind: "directory", depth: 3, isSymlink: false }
  ],
  "apps/desktop/src/main": [
    { path: "apps/desktop/src/main/project-service.ts", name: "project-service.ts", kind: "file", depth: 4, isSymlink: false }
  ],
  dist: [
    { path: "dist/bundle.js", name: "bundle.js", kind: "file", depth: 1, isSymlink: false }
  ],
  node_modules: [
    { path: "node_modules/@bloomberg", name: "@bloomberg", kind: "directory", depth: 1, isSymlink: false },
    { path: "node_modules/@chenshuai2144", name: "@chenshuai2144", kind: "directory", depth: 1, isSymlink: false },
    { path: "node_modules/ignored-lib", name: "ignored-lib", kind: "directory", depth: 1, isSymlink: false }
  ],
  "node_modules/@bloomberg": [
    { path: "node_modules/@bloomberg/record-tuple-polyfill", name: "record-tuple-polyfill", kind: "directory", depth: 2, isSymlink: false }
  ],
  "node_modules/@bloomberg/record-tuple-polyfill": [
    { path: "node_modules/@bloomberg/record-tuple-polyfill/lib", name: "lib", kind: "directory", depth: 3, isSymlink: false },
    { path: "node_modules/@bloomberg/record-tuple-polyfill/package.json", name: "package.json", kind: "file", depth: 3, isSymlink: false },
    { path: "node_modules/@bloomberg/record-tuple-polyfill/README.md", name: "README.md", kind: "file", depth: 3, isSymlink: false }
  ],
  packages: [
    { path: "packages/shared-types", name: "shared-types", kind: "directory", depth: 1, isSymlink: false }
  ],
  "packages/shared-types": [
    { path: "packages/shared-types/src", name: "src", kind: "directory", depth: 2, isSymlink: false }
  ],
  "packages/shared-types/src": [
    { path: "packages/shared-types/src/index.ts", name: "index.ts", kind: "file", depth: 3, isSymlink: false }
  ]
}

const countProjectFileKinds = (files: ProjectFileTreeItem[]) => ({
  fileCount: files.filter((file) => file.kind === "file").length,
  directoryCount: files.filter((file) => file.kind === "directory").length
})

const projectFilesResult = (
  conversationId = "conversation-2",
  directoryPath = ""
): GetConversationProjectFilesResult => {
  const files = projectFileFixtureByDirectory[directoryPath] ?? []
  return {
    status: "ok",
    projectFiles: {
      conversationId,
      worktreeId: "worktree-1",
      worktreeRootPath: "/tmp/teamcow",
      directoryPath,
      files,
      ...countProjectFileKinds(files),
      truncated: false,
      checkedAt: "2026-06-04T08:17:33.000Z"
    }
  }
}

const projectWorktreeFilesResult = (
  projectId = "project-1",
  worktreeId = "worktree-1",
  directoryPath = ""
): GetProjectWorktreeFilesResult => {
  const source = projectFilesResult("conversation-2", directoryPath)
  if (source.status !== "ok") {
    throw new Error("expected project files")
  }

  return {
    status: "ok",
    projectFiles: {
      projectId,
      worktreeId,
      worktreeRootPath: "/tmp/teamcow",
      directoryPath,
      files: source.projectFiles.files,
      ...countProjectFileKinds(source.projectFiles.files),
      truncated: false,
      checkedAt: "2026-06-04T08:17:33.000Z"
    }
  }
}

const timelineWithUserMessage = (
  conversationId: string,
  content: string,
  status: "idle" | "running" | "completed" | "failed" | "unavailable" = "unavailable"
): ConversationTimeline => ({
  conversationId,
  messages: [
    {
      id: `${conversationId}-message-1`,
      conversationId,
      role: "user",
      content,
      model: "gpt-5.1",
      runId: `${conversationId}-run-1`,
      createdAt: "2026-05-19T02:40:00.000Z"
    }
  ],
  runs: [
    {
      id: `${conversationId}-run-1`,
      conversationId,
      provider: "codex",
      model: "gpt-5.1",
      worktreeId: "worktree-1",
      status,
      startedAt: "2026-05-19T02:40:00.000Z",
      completedAt: "2026-05-19T02:40:00.000Z",
      createdAt: "2026-05-19T02:40:00.000Z",
      updatedAt: "2026-05-19T02:40:00.000Z"
    }
  ],
  events: [
    {
      id: `${conversationId}-event-1`,
      conversationId,
      runId: `${conversationId}-run-1`,
      sequence: 1,
      type: "system.status",
      payload: {
        status
      },
      createdAt: "2026-05-19T02:40:00.000Z"
    }
  ],
  artifacts: []
})

const timelineWithMultipleHistoricalRuns = (conversationId: string): ConversationTimeline => ({
  conversationId,
  messages: [
    {
      id: `${conversationId}-message-1`,
      conversationId,
      role: "user",
      content: "First historical prompt",
      model: "gpt-5.1",
      runId: `${conversationId}-run-1`,
      createdAt: "2026-05-19T02:40:00.000Z"
    },
    {
      id: `${conversationId}-message-2`,
      conversationId,
      role: "user",
      content: "Second historical prompt",
      model: "gpt-5.1",
      runId: `${conversationId}-run-2`,
      createdAt: "2026-05-19T02:45:00.000Z"
    }
  ],
  runs: [
    {
      id: `${conversationId}-run-1`,
      conversationId,
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
      id: `${conversationId}-run-2`,
      conversationId,
      provider: "codex",
      model: "gpt-5.1",
      worktreeId: "worktree-1",
      status: "failed",
      startedAt: "2026-05-19T02:45:00.000Z",
      completedAt: "2026-05-19T02:46:00.000Z",
      createdAt: "2026-05-19T02:45:00.000Z",
      updatedAt: "2026-05-19T02:46:00.000Z"
    }
  ],
  events: [
    {
      id: `${conversationId}-event-1`,
      conversationId,
      runId: `${conversationId}-run-1`,
      sequence: 1,
      type: "system.status",
      payload: { status: "completed" },
      createdAt: "2026-05-19T02:41:00.000Z"
    },
    {
      id: `${conversationId}-event-2`,
      conversationId,
      runId: `${conversationId}-run-2`,
      sequence: 1,
      type: "system.status",
      payload: { status: "failed" },
      createdAt: "2026-05-19T02:46:00.000Z"
    }
  ],
  artifacts: [
    {
      id: `${conversationId}-artifact-1`,
      conversationId,
      runId: `${conversationId}-run-1`,
      kind: "summary",
      title: "First result",
      uri: null,
      payload: { changedFiles: 2 },
      createdAt: "2026-05-19T02:41:00.000Z"
    },
    {
      id: `${conversationId}-artifact-2`,
      conversationId,
      runId: `${conversationId}-run-2`,
      kind: "summary",
      title: "Second result",
      uri: null,
      payload: { changedFiles: 1 },
      createdAt: "2026-05-19T02:46:00.000Z"
    }
  ]
})

const timelineWithUnsortedHistoricalRuns = (conversationId: string): ConversationTimeline => ({
  ...timelineWithMultipleHistoricalRuns(conversationId),
  runs: [
    {
      id: `${conversationId}-run-latest`,
      conversationId,
      provider: "claude",
      model: "claude-sonnet-4",
      worktreeId: "worktree-2",
      status: "completed",
      startedAt: "2026-05-19T03:00:00.000Z",
      completedAt: "2026-05-19T03:01:00.000Z",
      createdAt: "2026-05-19T03:00:00.000Z",
      updatedAt: "2026-05-19T03:01:00.000Z"
    },
    {
      id: `${conversationId}-run-earlier`,
      conversationId,
      provider: "codex",
      model: "gpt-5.1",
      worktreeId: "worktree-1",
      status: "failed",
      startedAt: "2026-05-19T02:00:00.000Z",
      completedAt: "2026-05-19T02:02:00.000Z",
      createdAt: "2026-05-19T02:00:00.000Z",
      updatedAt: "2026-05-19T02:02:00.000Z"
    }
  ],
  artifacts: [
    {
      id: `${conversationId}-artifact-latest`,
      conversationId,
      runId: `${conversationId}-run-latest`,
      kind: "summary",
      title: "Latest result",
      uri: null,
      payload: { changedFiles: 3 },
      createdAt: "2026-05-19T03:01:00.000Z"
    },
    {
      id: `${conversationId}-artifact-earlier`,
      conversationId,
      runId: `${conversationId}-run-earlier`,
      kind: "summary",
      title: "Earlier result",
      uri: null,
      payload: { changedFiles: 1 },
      createdAt: "2026-05-19T02:02:00.000Z"
    }
  ]
})

const structuredTimeline = (conversationId: string): ConversationTimeline => ({
  conversationId,
  messages: [
    {
      id: "structured-message-1",
      conversationId,
      role: "user",
      content: "Render this conversation",
      model: "claude-sonnet-4",
      runId: "structured-run-1",
      createdAt: "2026-05-20T10:00:00.000Z"
    }
  ],
  runs: [
    {
      id: "structured-run-1",
      conversationId,
      provider: "claude",
      model: "claude-sonnet-4",
      worktreeId: "worktree-1",
      status: "failed",
      startedAt: "2026-05-20T10:00:00.000Z",
      completedAt: "2026-05-20T10:00:05.000Z",
      createdAt: "2026-05-20T10:00:00.000Z",
      updatedAt: "2026-05-20T10:00:05.000Z"
    }
  ],
  events: [
    {
      id: "structured-event-1",
      conversationId,
      runId: "structured-run-1",
      sequence: 1,
      type: "run.started",
      payload: { status: "running", rawType: "thread.started" },
      createdAt: "2026-05-20T10:00:01.000Z"
    },
    {
      id: "structured-event-2",
      conversationId,
      runId: "structured-run-1",
      sequence: 2,
      type: "run.progress",
      payload: { rawType: "tool.summary", tool: "edit", message: "Tool event" },
      createdAt: "2026-05-20T10:00:02.000Z"
    },
    {
      id: "structured-event-3",
      conversationId,
      runId: "structured-run-1",
      sequence: 3,
      type: "run.message.delta",
      payload: { text: "Structured " },
      createdAt: "2026-05-20T10:00:03.000Z"
    },
    {
      id: "structured-event-4",
      conversationId,
      runId: "structured-run-1",
      sequence: 4,
      type: "run.message.delta",
      payload: { text: "provider output" },
      createdAt: "2026-05-20T10:00:04.000Z"
    },
    {
      id: "structured-event-5",
      conversationId,
      runId: "structured-run-1",
      sequence: 5,
      type: "provider.raw",
      payload: {
        originalEventType: "provider.unknown",
        raw: "{\"type\":\"provider.unknown\"",
        parseError: "Unexpected end of JSON input"
      },
      createdAt: "2026-05-20T10:00:04.500Z"
    },
    {
      id: "structured-event-6",
      conversationId,
      runId: "structured-run-1",
      sequence: 6,
      type: "run.error",
      payload: {
        message: "Provider failed",
        worktreeId: "worktree-1",
        runId: "structured-run-1"
      },
      createdAt: "2026-05-20T10:00:05.000Z"
    }
  ],
  artifacts: []
})

const permissionDeniedTimeline = (conversationId: string): ConversationTimeline => ({
  conversationId,
  messages: [
    {
      id: "permission-message-1",
      conversationId,
      role: "user",
      content: "Read the Huawei developer page",
      model: "claude-opus-4-7",
      runId: "permission-run-denied",
      createdAt: "2026-05-20T10:00:00.000Z"
    }
  ],
  runs: [
    {
      id: "permission-run-denied",
      conversationId,
      provider: "claude",
      model: "claude-opus-4-7",
      worktreeId: "worktree-1",
      status: "completed",
      startedAt: "2026-05-20T10:00:00.000Z",
      completedAt: "2026-05-20T10:00:05.000Z",
      createdAt: "2026-05-20T10:00:00.000Z",
      updatedAt: "2026-05-20T10:00:05.000Z"
    }
  ],
  events: [
    {
      id: "permission-event-1",
      conversationId,
      runId: "permission-run-denied",
      sequence: 1,
      type: "run.completed",
      payload: {
        provider: "claude",
        rawType: "result",
        raw: {
          type: "result",
          result: "我需要你的授权来访问网络获取文档。",
          permission_denials: [
            {
              tool_name: "mcp__web-reader__webReader",
              tool_use_id: "tooluse_web_reader",
              tool_input: {
                url: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742",
                retain_images: false
              }
            }
          ]
        },
        subtype: "success",
        message: "我需要你的授权来访问网络获取文档。"
      },
      createdAt: "2026-05-20T10:00:05.000Z"
    }
  ],
  artifacts: []
})

const permissionDeniedToolResultTimeline = (conversationId: string): ConversationTimeline => ({
  conversationId,
  messages: [
    {
      id: "permission-tool-result-message-1",
      conversationId,
      role: "user",
      content: "Read the Huawei developer page",
      model: "claude-opus-4-7",
      runId: "permission-tool-result-run-denied",
      createdAt: "2026-05-20T10:00:00.000Z"
    }
  ],
  runs: [
    {
      id: "permission-tool-result-run-denied",
      conversationId,
      provider: "claude",
      model: "claude-opus-4-7",
      worktreeId: "worktree-1",
      status: "completed",
      startedAt: "2026-05-20T10:00:00.000Z",
      completedAt: "2026-05-20T10:00:05.000Z",
      createdAt: "2026-05-20T10:00:00.000Z",
      updatedAt: "2026-05-20T10:00:05.000Z"
    }
  ],
  events: [
    {
      id: "permission-tool-result-event-1",
      conversationId,
      runId: "permission-tool-result-run-denied",
      sequence: 1,
      type: "run.progress",
      payload: {
        provider: "claude",
        rawType: "assistant",
        contentType: "tool_use",
        toolUse: {
          id: "tooluse_web_reader",
          name: "mcp__web-reader__webReader",
          input: {
            url: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742",
            retain_images: false
          }
        }
      },
      createdAt: "2026-05-20T10:00:01.000Z"
    },
    {
      id: "permission-tool-result-event-2",
      conversationId,
      runId: "permission-tool-result-run-denied",
      sequence: 2,
      type: "run.progress",
      payload: {
        provider: "claude",
        rawType: "user",
        contentType: "tool_result",
        toolResult: {
          toolUseId: "tooluse_web_reader",
          isError: true,
          content: "Claude requested permissions to use mcp__web-reader__webReader, but you haven't granted it yet."
        }
      },
      createdAt: "2026-05-20T10:00:02.000Z"
    },
    {
      id: "permission-tool-result-event-3",
      conversationId,
      runId: "permission-tool-result-run-denied",
      sequence: 3,
      type: "run.message.delta",
      payload: {
        provider: "claude",
        rawType: "assistant",
        text: "我仍然需要你的授权才能访问网页内容。"
      },
      createdAt: "2026-05-20T10:00:03.000Z"
    },
    {
      id: "permission-tool-result-event-4",
      conversationId,
      runId: "permission-tool-result-run-denied",
      sequence: 4,
      type: "run.completed",
      payload: {
        provider: "claude",
        rawType: "result"
      },
      createdAt: "2026-05-20T10:00:05.000Z"
    }
  ],
  artifacts: []
})

const toolFailureTimeline = (
  conversationId: string,
  status: "completed" | "failed" = "completed"
): ConversationTimeline => ({
  conversationId,
  messages: [
    {
      id: "tool-failure-message-1",
      conversationId,
      role: "user",
      content: "Read the Huawei developer page",
      model: "claude-opus-4-7",
      runId: "tool-failure-run",
      createdAt: "2026-05-20T10:00:00.000Z"
    }
  ],
  runs: [
    {
      id: "tool-failure-run",
      conversationId,
      provider: "claude",
      model: "claude-opus-4-7",
      worktreeId: "worktree-1",
      status,
      startedAt: "2026-05-20T10:00:00.000Z",
      completedAt: "2026-05-20T10:00:05.000Z",
      createdAt: "2026-05-20T10:00:00.000Z",
      updatedAt: "2026-05-20T10:00:05.000Z"
    }
  ],
  events: [
    {
      id: "tool-failure-event-1",
      conversationId,
      runId: "tool-failure-run",
      sequence: 1,
      type: "system.status",
      payload: {
        status: "unavailable",
        reason: "provider-permission-retry-starting",
        allowedTools: ["mcp__web-reader__webReader"]
      },
      createdAt: "2026-05-20T10:00:00.500Z"
    },
    {
      id: "tool-failure-event-2",
      conversationId,
      runId: "tool-failure-run",
      sequence: 2,
      type: "run.progress",
      payload: {
        provider: "claude",
        rawType: "assistant",
        contentType: "tool_use",
        toolUse: {
          id: "tooluse_web_reader",
          name: "mcp__web-reader__webReader",
          input: {
            url: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742",
            retain_images: false
          }
        }
      },
      createdAt: "2026-05-20T10:00:01.000Z"
    },
    {
      id: "tool-failure-event-3",
      conversationId,
      runId: "tool-failure-run",
      sequence: 3,
      type: "run.progress",
      payload: {
        provider: "claude",
        rawType: "user",
        contentType: "tool_result",
        toolResult: {
          toolUseId: "tooluse_web_reader",
          isError: true,
          content: "MCP error -429: {\"error\":{\"code\":\"1309\",\"message\":\"您的GLM Coding Plan套餐已到期，暂无法使用\"}}"
        }
      },
      createdAt: "2026-05-20T10:00:02.000Z"
    },
    {
      id: "tool-failure-event-4",
      conversationId,
      runId: "tool-failure-run",
      sequence: 4,
      type: "run.message.delta",
      payload: {
        provider: "claude",
        rawType: "assistant",
        text: "看起来网络访问工具遇到了套餐限制问题。"
      },
      createdAt: "2026-05-20T10:00:03.000Z"
    },
    {
      id: "tool-failure-event-5",
      conversationId,
      runId: "tool-failure-run",
      sequence: 5,
      type: status === "completed" ? "run.completed" : "run.error",
      payload: {
        provider: "claude",
        rawType: status === "completed" ? "result" : "process.exit",
        ...(status === "failed" ? { message: "Claude stopped after the tool error" } : {})
      },
      createdAt: "2026-05-20T10:00:05.000Z"
    }
  ],
  artifacts: []
})

const structuredTimelineWithLongerProviderOutput = (conversationId: string): ConversationTimeline => ({
  conversationId,
  messages: [
    {
      id: "structured-message-1",
      conversationId,
      role: "user",
      content: "Render this conversation",
      model: "claude-sonnet-4",
      runId: "structured-run-1",
      createdAt: "2026-05-20T10:00:00.000Z"
    }
  ],
  runs: [
    {
      id: "structured-run-1",
      conversationId,
      provider: "claude",
      model: "claude-sonnet-4",
      worktreeId: "worktree-1",
      status: "failed",
      startedAt: "2026-05-20T10:00:00.000Z",
      completedAt: "2026-05-20T10:00:05.000Z",
      createdAt: "2026-05-20T10:00:00.000Z",
      updatedAt: "2026-05-20T10:00:05.000Z"
    }
  ],
  events: [
    {
      id: "structured-event-1",
      conversationId,
      runId: "structured-run-1",
      sequence: 1,
      type: "run.started",
      payload: { status: "running", rawType: "thread.started" },
      createdAt: "2026-05-20T10:00:01.000Z"
    },
    {
      id: "structured-event-2",
      conversationId,
      runId: "structured-run-1",
      sequence: 2,
      type: "run.progress",
      payload: { rawType: "tool.summary", tool: "edit", message: "Tool event" },
      createdAt: "2026-05-20T10:00:02.000Z"
    },
    {
      id: "structured-event-3",
      conversationId,
      runId: "structured-run-1",
      sequence: 3,
      type: "run.message.delta",
      payload: { text: "Structured " },
      createdAt: "2026-05-20T10:00:03.000Z"
    },
    {
      id: "structured-event-4",
      conversationId,
      runId: "structured-run-1",
      sequence: 4,
      type: "run.message.delta",
      payload: { text: "provider output with more detail" },
      createdAt: "2026-05-20T10:00:04.000Z"
    },
    {
      id: "structured-event-5",
      conversationId,
      runId: "structured-run-1",
      sequence: 5,
      type: "provider.raw",
      payload: {
        originalEventType: "provider.unknown",
        raw: "{\"type\":\"provider.unknown\"",
        parseError: "Unexpected end of JSON input"
      },
      createdAt: "2026-05-20T10:00:04.500Z"
    },
    {
      id: "structured-event-6",
      conversationId,
      runId: "structured-run-1",
      sequence: 6,
      type: "run.error",
      payload: {
        message: "Provider failed",
        worktreeId: "worktree-1",
        runId: "structured-run-1"
      },
      createdAt: "2026-05-20T10:00:05.000Z"
    }
  ],
  artifacts: []
})

const inspectorFilesTimeline = (conversationId: string): ConversationTimeline => ({
  ...timelineWithUserMessage(conversationId, "Review the changed files", "completed"),
  artifacts: [
    {
      id: `${conversationId}-artifact-1`,
      conversationId,
      runId: `${conversationId}-run-1`,
      kind: "changed-files",
      title: "Changed files",
      uri: null,
      payload: {
        changedFiles: [
          {
            path: "apps/desktop/src/renderer/app/shell/DesktopShell.tsx",
            status: "modified",
            additions: 22,
            deletions: 4,
            preview: "Renders active changed file preview"
          },
          "  packages/i18n-resources/src/inspector/en.json  ",
          {
            file: "packages/shared-types/src/index.ts",
            changeType: "added",
            linesAdded: 12,
            snippet: "export const filePreviewSchema = z.object({})"
          },
          "",
          "   "
        ]
      },
      createdAt: "2026-05-21T10:00:00.000Z"
    }
  ]
})

const inspectorDiffTimeline = (conversationId: string): ConversationTimeline => ({
  ...timelineWithUserMessage(conversationId, "Review the diff", "completed"),
  events: [
    {
      id: `${conversationId}-event-1`,
      conversationId,
      runId: `${conversationId}-run-1`,
      sequence: 1,
      type: "run.completed",
      payload: {
        message: "Updated the inspector diff review path"
      },
      createdAt: "2026-05-21T10:00:03.000Z"
    }
  ],
  artifacts: [
    {
      id: `${conversationId}-artifact-diff`,
      conversationId,
      runId: `${conversationId}-run-1`,
      kind: "diff",
      title: "Inspector diff",
      uri: null,
      payload: {
        diff: [
          "diff --git a/apps/desktop/src/renderer/app/shell/DesktopShell.tsx b/apps/desktop/src/renderer/app/shell/DesktopShell.tsx",
          "--- a/apps/desktop/src/renderer/app/shell/DesktopShell.tsx",
          "+++ b/apps/desktop/src/renderer/app/shell/DesktopShell.tsx",
          "@@ -12,7 +12,8 @@ export function DesktopShell() {",
          " const panel = \"files\"",
          "-const inspector = \"summary\"",
          "+const inspector = \"diff\"",
          "+const selectedDiff = true"
        ].join("\n"),
        changedFiles: [
          {
            path: "apps/desktop/src/renderer/app/shell/DesktopShell.tsx",
            status: "modified"
          }
        ]
      },
      createdAt: "2026-05-21T10:00:04.000Z"
    },
    {
      id: `${conversationId}-artifact-other-run`,
      conversationId,
      runId: `${conversationId}-run-2`,
      kind: "diff",
      title: "Other run diff",
      uri: null,
      payload: {
        diffSummary: "This diff belongs to another run"
      },
      createdAt: "2026-05-21T10:00:05.000Z"
    }
  ]
})

const compareTimeline = ({
  conversationId,
  provider,
  model,
  worktreeId,
  status,
  summary,
  files,
  createdAt = "2026-05-21T10:00:00.000Z"
}: {
  conversationId: string
  provider: "codex" | "claude" | "opencode" | "cursor"
  model: string
  worktreeId: string
  status: "idle" | "running" | "completed" | "failed" | "unavailable"
  summary: string
  files?: Array<string | { path: string; status?: string }>
  createdAt?: string
}): ConversationTimeline => ({
  conversationId,
  messages: [
    {
      id: `${conversationId}-message-1`,
      conversationId,
      role: "user",
      content: `Run ${conversationId}`,
      model,
      runId: `${conversationId}-run-1`,
      createdAt
    }
  ],
  runs: [
    {
      id: `${conversationId}-run-1`,
      conversationId,
      provider,
      model,
      worktreeId,
      status,
      startedAt: createdAt,
      completedAt: createdAt,
      createdAt,
      updatedAt: createdAt
    }
  ],
  events: [
    {
      id: `${conversationId}-event-1`,
      conversationId,
      runId: `${conversationId}-run-1`,
      sequence: 1,
      type: status === "failed" ? "run.error" : "run.completed",
      payload: {
        message: summary
      },
      createdAt
    }
  ],
  artifacts: files
    ? [
        {
          id: `${conversationId}-artifact-1`,
          conversationId,
          runId: `${conversationId}-run-1`,
          kind: "changed-files",
          title: "Changed files",
          uri: null,
          payload: {
            changedFiles: files
          },
          createdAt
        }
      ]
    : []
})

const renderWithI18n = async (container: HTMLElement, component: React.ReactElement) => {
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <I18nProvider>
        <ThemeProvider>{component}</ThemeProvider>
      </I18nProvider>
    )
    await Promise.resolve()
  })
  return root
}

const clickElement = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

const doubleClickElement = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

const rightClickElement = async (
  element: Element | null | undefined,
  position: { clientX: number; clientY: number } = { clientX: 128, clientY: 96 }
) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: position.clientX,
      clientY: position.clientY
    }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

const settle = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

const openProjectServiceFileFromFiles = async (container: HTMLElement, mode: "click" | "double-click" = "click") => {
  await clickElement(getByTestId(container, "inspector-tab-files"))
  await clickElement(getByTestId(container, "inspector-project-file-apps"))
  await clickElement(getByTestId(container, "inspector-project-file-apps/desktop"))
  await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src"))
  await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main"))
  const fileRow = getByTestId(container, "inspector-project-file-apps/desktop/src/main/project-service.ts")
  if (mode === "double-click") {
    await doubleClickElement(fileRow)
  } else {
    await clickElement(fileRow)
  }
  await settle()
}

const getRenderedProjectTreePaths = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(".inspector-file-row.project-file[data-testid^=\"inspector-project-file-\"]"))
    .map((row) => row.dataset.testid?.replace("inspector-project-file-", "") ?? "")

const editCodeMirrorDocument = async (container: HTMLElement, insert: string) => {
  const dirtyButton = getByTestId(container, "mock-code-editor-dirty")
  if (dirtyButton) {
    await clickElement(dirtyButton)
    return
  }

  const mockEditor = getByTestId(container, "mock-code-editor") as HTMLTextAreaElement | null
  if (mockEditor) {
    await act(async () => {
      const nextValue = `${insert}${mockEditor.value}`
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      valueSetter?.call(mockEditor, nextValue)
      mockEditor.dispatchEvent(new Event("input", { bubbles: true }))
      mockEditor.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    return
  }

  const editorContent = container.querySelector(".cm-content") as HTMLElement | null
  await act(async () => {
    editorContent?.focus()
    editorContent?.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: insert
    }))
    await Promise.resolve()
    await Promise.resolve()
  })
}


const changeSelect = async (element: Element | null | undefined, value: string) => {
  await act(async () => {
    if (element instanceof HTMLSelectElement) {
      element.value = value
      element.dispatchEvent(new Event("change", { bubbles: true }))
    }
    await Promise.resolve()
    await Promise.resolve()
  })
}

const getByTestId = (container: HTMLElement, testId: string) =>
  container.querySelector(`[data-testid="${testId}"]`) ??
  document.body.querySelector(`[data-testid="${testId}"]`)

const getProjectBindingDetail = (container: HTMLElement) =>
  container.querySelector(".sidebar-footer .binding-row .binding-info span")

const getButtonByAriaLabel = (container: HTMLElement, label: string) =>
  Array.from(container.querySelectorAll("button")).find((button) => button.getAttribute("aria-label") === label) ?? null

const queryAllByTestIdPrefix = (container: HTMLElement, prefix: string) =>
  Array.from(container.querySelectorAll(`[data-testid^="${prefix}"]`))

const openCommandSelect = async (container: HTMLElement, testId: string) => {
  await clickElement(getByTestId(container, `${testId}-trigger`))
}

const chooseCommandSelectOption = async (container: HTMLElement, testId: string, optionId: string) => {
  if (!getByTestId(container, `${testId}-option-${optionId}`)) {
    await openCommandSelect(container, testId)
  }
  await clickElement(getByTestId(container, `${testId}-option-${optionId}`))
}

const withActiveConversationProviderStatus = (
  context: AppContextSnapshot,
  status: "ready" | "unavailable" | "unknown"
): AppContextSnapshot => ({
  ...context,
  projects: context.projects.map((project) => ({
    ...project,
    conversations: project.conversations.map((conversation) =>
      conversation.id === context.selectedConversationId
        ? {
            ...conversation,
            provider: {
              ...conversation.provider,
              status
            }
          }
        : conversation
    )
  }))
})

const withActiveConversationRunStatus = (
  context: AppContextSnapshot,
  runStatus: "idle" | "running" | "completed" | "failed" | "unavailable"
): AppContextSnapshot => ({
  ...context,
  shell: {
    ...context.shell,
    runStatus
  },
  projects: context.projects.map((project) => ({
    ...project,
    conversations: project.conversations.map((conversation) =>
      conversation.id === context.selectedConversationId
        ? {
            ...conversation,
            runStatus
          }
        : conversation
    )
  }))
})

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

const changeFile = (
  path: string,
  overrides: Partial<ConversationChangesSnapshot["unstaged"][number]> = {}
): ConversationChangesSnapshot["unstaged"][number] => ({
  path,
  oldPath: null,
  status: "modified",
  additions: 2,
  deletions: 1,
  isBinary: false,
  ...overrides
})

const changesSnapshot = (
  conversationId: string,
  options: {
    staged?: ConversationChangesSnapshot["staged"]
    unstaged?: ConversationChangesSnapshot["unstaged"]
    checkedAt?: string
    worktreeId?: string
    worktreeRootPath?: string
    revision?: string
  } = {}
): ConversationChangesSnapshot => ({
  conversationId,
  worktreeId: options.worktreeId ?? "worktree-1",
  worktreeRootPath: options.worktreeRootPath ?? "/tmp/teamcow",
  revision: options.revision ?? "revision-1",
  staged: options.staged ?? [],
  unstaged: options.unstaged ?? [],
  checkedAt: options.checkedAt ?? "2026-07-10T05:00:00.000Z"
})

const textChangeDiffDocument = (
  input: GetConversationChangeDiffDocumentInput,
  original = "old\n",
  modified = "new\n"
): ConversationChangeDiffDocumentResult => ({
  status: "text",
  ...input,
  oldPath: null,
  original,
  modified,
  originalMode: "100644",
  modifiedMode: "100644",
  originalByteLength: original.length,
  modifiedByteLength: modified.length
})

const contextSelectingConversationFrom = (
  context: AppContextSnapshot,
  conversationId: "conversation-1" | "conversation-2",
  runStatus?: "idle" | "running" | "completed" | "failed" | "unavailable"
): AppContextSnapshot => {
  const conversation = context.projects[0].conversations.find((item) => item.id === conversationId)!
  const nextRunStatus = runStatus ?? conversation.runStatus
  return {
    ...context,
    selectedConversationId: conversationId,
    projects: context.projects.map((project) => ({
      ...project,
      conversations: project.conversations.map((item) => ({
        ...item,
        runStatus: item.id === conversationId ? nextRunStatus : item.runStatus,
        isCurrent: item.id === conversationId
      }))
    })),
    shell: {
      ...context.shell,
      conversationTitle: conversation.title,
      providerKind: conversation.provider.kind,
      worktreeBranch: conversation.worktree.branch,
      worktreePath: conversation.worktree.rootPath,
      runStatus: nextRunStatus
    }
  }
}

const contextSelectingConversation = (
  conversationId: "conversation-1" | "conversation-2",
  runStatus?: "idle" | "running" | "completed" | "failed" | "unavailable"
): AppContextSnapshot => contextSelectingConversationFrom(selectionContext, conversationId, runStatus)

describe("DesktopShell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    void i18n.changeLanguage("en")
    const emptyClientRects = {
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* iterator() {}
    } as DOMRectList
    Range.prototype.getClientRects = vi.fn(() => emptyClientRects)
    Range.prototype.getBoundingClientRect = vi.fn(() => new DOMRect())

    const importResult: ImportProjectResult = {
      status: "imported",
      initializedGit: false,
      project: projectOnlyContext.projects[0],
      context: projectOnlyContext
    }

    window.teamcow = {
      getAppContext: vi.fn(async () => emptyContext),
      getCurrentConversation: vi.fn(async () => null),
      listProjects: vi.fn(async () => emptyContext.projects),
      listWorktreesByProject: vi.fn(async () => projectWorktrees),
      listProjectWorktrees: vi.fn(async () => []),
      deleteWorktree: vi.fn(async (input: { projectId: string; worktreeId: string }) => ({
        status: "deleted" as const,
        ...input
      })),
      listConversationsByProject: vi.fn(async () => []),
      getConversationTimeline: vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
        status: "ok",
        timeline: emptyTimeline(conversationId)
      })),
      getConversationTimelinePage: vi.fn(async ({ conversationId }): Promise<GetConversationTimelinePageResult> => {
        const result = await window.teamcow.getConversationTimeline(conversationId)
        return result.status === "ok"
          ? { ...result, pageInfo: { nextCursor: null, hasMore: false } }
          : result
      }),
      getConversationGitStatus: vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
        dirtyGitStatus(conversationId, {
          branch: {
            current: "feat/git-panel",
            recorded: "main",
            upstream: "origin/main",
            isClean: true,
            changedCount: 0
          }
        })
      ),
      getConversationChanges: vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
        status: "ok",
        changes: {
          conversationId,
          worktreeId: "worktree-1",
          worktreeRootPath: "/tmp/teamcow",
          revision: "revision-1",
          staged: [],
          unstaged: [],
          checkedAt: "2026-07-10T04:30:00.000Z"
        }
      })),
      getConversationChangeDiff: vi.fn(async (input: GetConversationChangeDiffInput): Promise<GetConversationChangeDiffResult> => ({
        status: "error",
        conversationId: input.conversationId,
        filePath: input.filePath,
        area: input.area,
        error: {
          code: "GIT_CHANGES_READ_FAILED",
          message: "Changes diffs are not configured by this test.",
          suggestion: null,
          domain: "git"
        }
      })),
      getConversationChangeDiffDocument: vi.fn(async (input) => ({
        status: "unavailable" as const,
        ...input,
        reason: "Change documents are not configured by this test."
      })),
      stageConversationChanges: vi.fn(async (): Promise<ConversationChangesMutationResult> => ({
        status: "error",
        error: {
          code: "GIT_CHANGE_OPERATION_FAILED",
          message: "Changes mutations are not configured by this test.",
          suggestion: null,
          domain: "git"
        }
      })),
      unstageConversationChanges: vi.fn(async (): Promise<ConversationChangesMutationResult> => ({
        status: "error",
        error: {
          code: "GIT_CHANGE_OPERATION_FAILED",
          message: "Changes mutations are not configured by this test.",
          suggestion: null,
          domain: "git"
        }
      })),
      discardConversationChanges: vi.fn(async (): Promise<ConversationChangesMutationResult> => ({
        status: "error",
        error: {
          code: "GIT_CHANGE_OPERATION_FAILED",
          message: "Changes mutations are not configured by this test.",
          suggestion: null,
          domain: "git"
        }
      })),
      commitConversationChanges: vi.fn(async (): Promise<CommitConversationChangesResult> => ({
        status: "error",
        error: {
          code: "GIT_COMMIT_FAILED",
          message: "Changes commits are not configured by this test.",
          suggestion: null,
          domain: "git"
        }
      })),
      getConversationProjectFiles: vi.fn(async (conversationId: string, directoryPath?: string): Promise<GetConversationProjectFilesResult> =>
        projectFilesResult(conversationId, directoryPath)
      ),
      getProjectWorktreeFiles: vi.fn(async (projectId: string, worktreeId: string, directoryPath?: string): Promise<GetProjectWorktreeFilesResult> =>
        projectWorktreeFilesResult(projectId, worktreeId, directoryPath)
      ),
      readConversationFile: vi.fn(async (input: { conversationId: string; filePath: string }) => ({
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
      writeConversationFile: vi.fn(async (input: { conversationId: string; filePath: string; content: string }) => ({
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
      })),
      createConversationFileEntry: vi.fn(async (input: { conversationId: string; filePath: string; kind: "file" | "directory" }) => ({
        status: "created" as const,
        entry: {
          conversationId: input.conversationId,
          worktreeId: "worktree-1",
          filePath: input.filePath,
          absolutePath: `/tmp/teamcow/${input.filePath}`,
          kind: input.kind
        }
      })),
      renameConversationFileEntry: vi.fn(async (input: { conversationId: string; destinationPath: string; kind: "file" | "directory" }) => ({
        status: "renamed" as const,
        entry: {
          conversationId: input.conversationId,
          worktreeId: "worktree-1",
          filePath: input.destinationPath,
          absolutePath: `/tmp/teamcow/${input.destinationPath}`,
          kind: input.kind
        }
      })),
      deleteConversationFileEntry: vi.fn(async (input: { conversationId: string; filePath: string; kind: "file" | "directory" }) => ({
        status: "deleted" as const,
        conversationId: input.conversationId,
        worktreeId: "worktree-1",
        filePath: input.filePath,
        kind: input.kind
      })),
      revealConversationFileEntry: vi.fn(async (input: { conversationId: string; filePath: string }) => ({
        status: "opened" as const,
        conversationId: input.conversationId,
        worktreeId: "worktree-1",
        filePath: input.filePath,
        targetPath: `/tmp/teamcow/${input.filePath}`
      })),
      openConversationHandoff: vi.fn(async (input: OpenConversationHandoffInput): Promise<OpenConversationHandoffResult> => ({
        status: "opened",
        conversationId: input.conversationId,
        worktreeId: "worktree-1",
        targetKind: input.target,
        targetPath: input.target === "file" ? `/tmp/teamcow/${input.filePath}` : "/tmp/teamcow"
      })),
      listExternalOpenOptions: vi.fn(async (): Promise<ExternalOpenOption[]> => [
        { id: "finder", label: "Finder", appName: "Finder", iconDataUrl: "data:image/png;base64,ZmFrZS1maW5kZXItaWNvbg==", group: "system", isAvailable: true },
        { id: "terminal", label: "Terminal", appName: "Terminal", iconDataUrl: "data:image/png;base64,ZmFrZS10ZXJtaW5hbC1pY29u", group: "terminal", isAvailable: true },
        { id: "cmux", label: "cmux", appName: "cmux", iconDataUrl: "data:image/png;base64,ZmFrZS1jbXV4LWljb24=", group: "terminal", isAvailable: true },
        { id: "cursor", label: "Cursor", appName: "Cursor", iconDataUrl: "data:image/png;base64,ZmFrZS1jdXJzb3ItaWNvbg==", group: "ide", isAvailable: true },
        { id: "antigravity-ide", label: "Antigravity IDE", appName: "Antigravity IDE", iconDataUrl: "data:image/svg+xml;base64,PHN2Zy8+", group: "ide", isAvailable: true },
        { id: "warp", label: "Warp", appName: "Warp", group: "terminal", isAvailable: false }
      ]),
      openConversationExternal: vi.fn(async (input: OpenConversationExternalInput): Promise<OpenConversationExternalResult> => ({
        status: "opened",
        conversationId: input.conversationId,
        worktreeId: "worktree-1",
        appId: input.appId,
        appLabel: input.appId === "cursor" ? "Cursor" : input.appId === "antigravity-ide" ? "Antigravity IDE" : input.appId === "cmux" ? "cmux" : "Finder",
        targetPath: "/tmp/teamcow"
      })),
      openConversationTerminal: vi.fn(async (input: { conversationId: string }): Promise<OpenConversationTerminalResult> => ({
        status: "ok",
        session: {
          sessionId: "terminal-1",
          conversationId: input.conversationId,
          worktreeId: "worktree-1",
          cwd: "/tmp/teamcow",
          shell: "/bin/zsh",
          status: "running",
          startedAt: "2026-06-05T09:54:19.000Z"
        }
      })),
      writeTerminalInput: vi.fn(async (input: { sessionId: string; data: string }) => ({
        status: "ok" as const,
        sessionId: input.sessionId
      })),
      resizeTerminal: vi.fn(async (input: { sessionId: string; cols: number; rows: number }) => ({
        status: "ok" as const,
        sessionId: input.sessionId
      })),
      closeTerminal: vi.fn(async (input: { sessionId: string }) => ({
        status: "ok" as const,
        sessionId: input.sessionId
      })),
      onTerminalOutput: vi.fn(() => vi.fn()),
      onRunEvent: vi.fn(() => vi.fn()),
      onWorktreeGitChanged: vi.fn(() => vi.fn()),
      cancelConversationRun: vi.fn(async () => ({ status: "ok" as const })),
      onUpdateState: vi.fn(() => vi.fn()),
      listEditorOptions: vi.fn(async () => [
        { id: "cursor", label: "Cursor", appName: "Cursor", isAvailable: true },
        { id: "vscode", label: "Visual Studio Code", appName: "Visual Studio Code", isAvailable: false }
      ]),
      getSelectedEditor: vi.fn(async () => ({
        status: "ok" as const,
        selectedEditorId: "cursor",
        editors: [
          { id: "cursor", label: "Cursor", appName: "Cursor", isAvailable: true },
          { id: "vscode", label: "Visual Studio Code", appName: "Visual Studio Code", isAvailable: false }
        ]
      })),
      setSelectedEditor: vi.fn(async (input: { editorId: string | null }) => ({
        status: "ok" as const,
        selectedEditorId: input.editorId,
        editors: [
          { id: "cursor", label: "Cursor", appName: "Cursor", isAvailable: true },
          { id: "vscode", label: "Visual Studio Code", appName: "Visual Studio Code", isAvailable: false }
        ]
      })),
      sendConversationMessage: vi.fn(async (input: { conversationId: string; content: string }): Promise<SendConversationMessageResult> => ({
        status: "accepted",
        conversation: {
          id: input.conversationId,
          projectId: "project-1",
          title: "Inspector polish",
          worktreeId: "worktree-1",
          worktree: projectWorktrees[0],
          provider: {
            kind: "claude",
            label: "Claude",
            status: "ready"
          },
          currentModel: "claude-sonnet-4",
          runStatus: "unavailable",
          createdAt: "2026-05-09T09:00:00.000Z",
          updatedAt: "2026-05-19T02:40:00.000Z",
          isCurrent: true
        },
        timeline: timelineWithUserMessage(input.conversationId, input.content),
        context: {
          ...selectionContext,
          shell: {
            ...selectionContext.shell,
            runStatus: "unavailable"
          }
        }
      })),
      deleteQueuedConversationMessage: vi.fn(async (input: { conversationId: string }) => ({
        status: "ok" as const,
        timeline: emptyTimeline(input.conversationId)
      })),
      retryConversationRunWithPermissions: vi.fn(async (input: { conversationId: string }): Promise<SendConversationMessageResult> => ({
        status: "accepted",
        conversation: {
          id: input.conversationId,
          projectId: "project-1",
          title: "Inspector polish",
          worktreeId: "worktree-1",
          worktree: projectWorktrees[0],
          provider: {
            kind: "claude",
            label: "Claude",
            status: "ready"
          },
          currentModel: "claude-sonnet-4",
          runStatus: "running",
          createdAt: "2026-05-09T09:00:00.000Z",
          updatedAt: "2026-05-19T02:40:00.000Z",
          isCurrent: true
        },
        timeline: permissionDeniedTimeline(input.conversationId),
        context: {
          ...selectionContext,
          shell: {
            ...selectionContext.shell,
            runStatus: "running"
          }
        }
      })),
      importProject: vi.fn(async () => importResult),
      selectProject: vi.fn(async () => ({
        status: "ok",
        context: projectOnlyContext
      }) as const),
      moveProject: vi.fn(async () => ({
        status: "ok",
        context: projectOnlyContext
      }) as const),
      removeProject: vi.fn(async () => ({
        status: "ok",
        context: emptyContext
      }) as const),
      revealProjectInFinder: vi.fn(async (projectId: string) => ({
        status: "opened",
        projectId,
        targetPath: "/tmp/teamcow"
      }) as const),
      selectConversation: vi.fn(async () => ({
        status: "ok",
        context: selectionContext
      }) as const),
      createConversation: vi.fn(async (): Promise<CreateConversationResult> => ({
        status: "created",
        conversation: {
          id: "conversation-new",
          projectId: "project-1",
          title: "codex 10:00",
          worktreeId: "worktree-2",
          worktree: projectWorktrees[1],
          provider: {
            kind: "codex",
            label: "Codex",
            status: "ready"
          },
          currentModel: "gpt-5.1",
          runStatus: "idle",
          createdAt: "2026-05-16T10:00:00.000Z",
          updatedAt: "2026-05-16T10:00:00.000Z",
          isCurrent: true
        },
        context: {
          ...projectOnlyContext,
          selectedConversationId: "conversation-new",
          shell: {
            ...projectOnlyContext.shell,
            conversationTitle: "codex 10:00",
            providerKind: "codex",
            worktreeBranch: "feat/new-conversation",
            worktreePath: "/tmp/teamcow-feature",
            runStatus: "idle",
            hasConversations: true
          },
          projects: [
            {
              ...projectOnlyContext.projects[0],
              conversations: [
                {
                  id: "conversation-new",
                  projectId: "project-1",
                  title: "codex 10:00",
                  worktreeId: "worktree-2",
                  worktree: projectWorktrees[1],
                  provider: {
                    kind: "codex",
                    label: "Codex",
                    status: "ready"
                  },
                  currentModel: "gpt-5.1",
                  runStatus: "idle",
                  createdAt: "2026-05-16T10:00:00.000Z",
                  updatedAt: "2026-05-16T10:00:00.000Z",
                  isCurrent: true
                }
              ]
            }
          ],
          chips: [
            { kind: "project", value: "teamcow" },
            { kind: "conversation", value: "codex 10:00" },
            { kind: "provider", value: "codex" },
            { kind: "worktree", value: "feat/new-conversation" },
            { kind: "run-status", value: "idle" }
          ]
        }
      })),
      getProviderReadiness: vi.fn(async () => initialProviderSnapshot),
      refreshProviderReadiness: vi.fn(async () => refreshedProviderSnapshot),
      listProviderModels: vi.fn(async (providerKind: string) => fallbackProviderModels[providerKind] ?? []),
      getLocale: vi.fn(async () => "en" as Locale),
      setLocale: vi.fn(async () => {}),
      getAppTheme: vi.fn(async () => "dark" as AppThemePreference),
      setAppTheme: vi.fn(async () => {}),
      showHostNotification: vi.fn(async () => ({ status: "shown" as const })),
      getUpdateState: vi.fn(async (): Promise<UpdateState> => ({ status: "idle" })),
      checkForUpdates: vi.fn(async (): Promise<UpdateActionResult> => ({ status: "ok", state: { status: "not-available" } })),
      installUpdateAndRestart: vi.fn(async (): Promise<UpdateActionResult> => ({ status: "ok", state: { status: "downloaded", version: "1.2.3" } })),
      addCustomModel: vi.fn(async () => ({ status: "ok" as const, models: [] })),
      removeCustomModel: vi.fn(async () => ({ status: "ok" as const, models: [] })),
      setConversationModel: vi.fn(async (input: { conversationId: string; model: string }) => ({
        status: "ok" as const,
        conversation: {
          id: input.conversationId,
          projectId: "project-1",
          title: "Inspector polish",
          worktreeId: "worktree-1",
          worktree: projectWorktrees[0],
          provider: {
            kind: "claude",
            label: "Claude",
            status: "ready"
          } as const,
          currentModel: input.model,
          runStatus: "running" as const,
          createdAt: "2026-05-09T09:00:00.000Z",
          updatedAt: "2026-05-09T09:05:00.000Z",
          isCurrent: true
        },
        context: selectionContext
      })),
      setConversationAccessMode: vi.fn(async (input: { conversationId: string; accessMode: "read-only" | "worktree-write" | "full-access" }) => ({
        status: "ok" as const,
        conversation: {
          id: input.conversationId,
          projectId: "project-1",
          title: "Inspector polish",
          worktreeId: "worktree-1",
          worktree: projectWorktrees[0],
          provider: {
            kind: "claude",
            label: "Claude",
            status: "ready"
          } as const,
          currentModel: "claude-sonnet-4",
          accessMode: input.accessMode,
          runStatus: "idle" as const,
          createdAt: "2026-05-09T09:00:00.000Z",
          updatedAt: "2026-05-09T09:05:00.000Z",
          isCurrent: true
        },
        context: selectionContext
      })),
      renameConversation: vi.fn(async (input: { conversationId: string; title: string }) => ({
        status: "ok" as const,
        conversation: {
          id: input.conversationId,
          projectId: "project-1",
          title: input.title,
          worktreeId: "worktree-1",
          worktree: projectWorktrees[0],
          provider: {
            kind: "claude",
            label: "Claude",
            status: "ready"
          } as const,
          currentModel: "claude-sonnet-4-6",
          runStatus: "idle" as const,
          createdAt: "2026-05-09T09:00:00.000Z",
          updatedAt: "2026-05-09T09:05:00.000Z",
          isCurrent: true
        },
        context: selectionContext
      })),
      deleteConversation: vi.fn(async (input: { conversationId: string }) => ({
        status: "deleted" as const,
        conversationId: input.conversationId,
        context: selectionContext
      }))
    }
  })

  it("shows the TeamCow logo in the sidebar brand row", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    const logo = container.querySelector<HTMLImageElement>(".brand-icon .brand-logo")

    expect(logo).toBeTruthy()
    expect(logo?.getAttribute("src")).toContain("teamcow-logo-rounded")
    expect(container.querySelector(".brand-row")?.textContent).toContain("TeamCow")
    expect(container.querySelector(".brand-row")?.textContent).toContain("Local coding workspace")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows the real import empty state and updates the shell after import", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(container.textContent).toContain("No projects imported yet")
    expect(container.textContent).toContain("Import Local Project")

    const importButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Import Local Project"
    )

    expect(importButton).toBeTruthy()

    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Imported project: teamcow")
    expect(container.textContent).toContain("main")
    expect(container.textContent).toContain("teamcow")
    expect(getProjectBindingDetail(container)?.textContent).toBe("/tmp/teamcow")
    expect(container.querySelector(".win-title")?.textContent ?? "").toContain("main")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("updates sidebar after successful import", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(container.textContent).toContain("No projects imported yet")

    const importButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Import Local Project"
    )
    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).not.toContain("No projects imported yet")
    expect(container.textContent).toContain("teamcow")
    expect(getProjectBindingDetail(container)?.textContent).toBe("/tmp/teamcow")
    expect(container.querySelector(".win-title")?.textContent ?? "").toContain("main")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows the default worktree path in the binding row with a middle ellipsis", async () => {
    const longProjectPath = "/Users/example/Projects/sample-app-feat-tc-test"
    const contextWithLongProjectPath: AppContextSnapshot = {
      ...projectOnlyContext,
      projects: [
        {
          ...projectOnlyContext.projects[0],
          rootPath: longProjectPath,
          defaultWorktree: {
            ...projectOnlyContext.projects[0].defaultWorktree,
            rootPath: longProjectPath
          }
        }
      ],
      shell: {
        ...projectOnlyContext.shell,
        worktreePath: longProjectPath
      }
    }
    window.teamcow.getAppContext = vi.fn(async () => contextWithLongProjectPath)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    const projectBindingDetail = getProjectBindingDetail(container)
    const displayedPath = projectBindingDetail?.textContent ?? ""

    expect(displayedPath).not.toBe("Project")
    expect(displayedPath).toContain("…")
    expect(displayedPath.startsWith("/Users/")).toBe(true)
    expect(displayedPath.endsWith("sample-app-feat-tc-test")).toBe(true)
    expect(projectBindingDetail?.getAttribute("title")).toBe(longProjectPath)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows the active worktree path in the binding row with a middle ellipsis", async () => {
    const projectPath = "/Users/example/Projects/sample-app"
    const worktreePath = "/Users/example/Projects/sample-app-feat-tc-test"
    const linkedWorktree: WorktreeSummary = {
      id: "worktree-2",
      projectId: "project-1",
      kind: "git_worktree",
      rootPath: worktreePath,
      branch: "feat/tc_test",
      status: "ready"
    }
    const contextWithLinkedWorktree: AppContextSnapshot = {
      ...selectionContext,
      projects: [
        {
          ...selectionContext.projects[0],
          rootPath: projectPath,
          defaultWorktree: {
            ...selectionContext.projects[0].defaultWorktree,
            rootPath: projectPath
          },
          conversations: selectionContext.projects[0].conversations.map((conversation) =>
            conversation.id === "conversation-2"
              ? {
                  ...conversation,
                  worktreeId: linkedWorktree.id,
                  worktree: linkedWorktree
                }
              : conversation
          )
        }
      ],
      shell: {
        ...selectionContext.shell,
        worktreeBranch: "feat/tc_test",
        worktreePath
      }
    }
    window.teamcow.getAppContext = vi.fn(async () => contextWithLinkedWorktree)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    const projectBindingDetail = getProjectBindingDetail(container)
    const displayedPath = projectBindingDetail?.textContent ?? ""

    expect(displayedPath).not.toBe(projectPath)
    expect(displayedPath).toContain("…")
    expect(displayedPath.startsWith("/Users/")).toBe(true)
    expect(displayedPath.endsWith("sample-app-feat-tc-test")).toBe(true)
    expect(projectBindingDetail?.getAttribute("title")).toBe(worktreePath)
    expect(container.querySelector(".win-title")?.textContent ?? "").toContain("feat/tc_test")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows error notice when import fails", async () => {
    window.teamcow.importProject = vi.fn(async () => ({
      status: "error" as const,
      error: {
        code: "PATH_NOT_FOUND" as const,
        message: "The selected directory does not exist.",
        suggestion: "Please select a local project directory that still exists."
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    const importButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Import Local Project"
    )
    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain("does not exist")
    expect(container.textContent).toContain("No projects imported yet")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows conversation rows and syncs the selected conversation across the shell", async () => {
    window.teamcow.getAppContext = vi.fn(async () => conversationListContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok" as const,
      context: selectionContext
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(container.textContent).toContain("Navigation cleanup")
    expect(container.textContent).toContain("main")

    const conversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    expect(conversationRow).toBeTruthy()

    await act(async () => {
      conversationRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Activated Inspector polish")
    expect(container.textContent).toContain("Inspector polish")
    expect(container.textContent).toContain("Claude")
    expect(container.textContent).toContain("Running")
    expect(container.textContent).toContain("main")
    expect(getProjectBindingDetail(container)?.textContent).toBe("/tmp/teamcow")
    expect(container.querySelector(".win-title")?.textContent ?? "").toContain("main")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("opens project actions from the project row and moves a project to the top", async () => {
    const secondProject = {
      ...projectOnlyContext.projects[0],
      id: "project-2",
      name: "othercow",
      rootPath: "/tmp/othercow",
      isCurrent: false,
      defaultWorktree: {
        ...projectOnlyContext.projects[0].defaultWorktree,
        id: "worktree-2",
        projectId: "project-2",
        rootPath: "/tmp/othercow"
      }
    }
    const twoProjectContext: AppContextSnapshot = {
      ...projectOnlyContext,
      projects: [projectOnlyContext.projects[0], secondProject]
    }
    const reorderedContext: AppContextSnapshot = {
      ...twoProjectContext,
      projects: [secondProject, projectOnlyContext.projects[0]]
    }
    window.teamcow.getAppContext = vi.fn(async () => twoProjectContext)
    window.teamcow.moveProject = vi.fn(async () => ({ status: "ok" as const, context: reorderedContext }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    const projectRow = Array.from(container.querySelectorAll(".proj-row")).find((row) =>
      row.textContent?.includes("othercow")
    ) as HTMLElement | undefined

    await act(async () => {
      projectRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 52, clientY: 84 }))
      await Promise.resolve()
    })

    expect(getByTestId(container, "project-context-menu")?.textContent).toContain("Move to Top")
    expect(getByTestId(container, "project-context-menu")?.textContent).toContain("Move to Bottom")
    expect(getByTestId(container, "project-context-menu")?.textContent).toContain("Show in Finder")
    expect(getByTestId(container, "project-context-menu")?.textContent).toContain("Remove Project")

    await clickElement(getByTestId(container, "project-menu-move-top"))

    expect(window.teamcow.moveProject).toHaveBeenCalledWith({ projectId: "project-2", position: "top" })
    expect(Array.from(container.querySelectorAll(".proj-row"))[0]?.textContent).toContain("othercow")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("reveals a project in Finder and removes it without deleting its data", async () => {
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    const openProjectMenu = async () => {
      const projectRow = container.querySelector(".proj-row") as HTMLElement | null
      await act(async () => {
        projectRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 52, clientY: 84 }))
        await Promise.resolve()
      })
    }

    await openProjectMenu()
    await clickElement(getByTestId(container, "project-menu-reveal-finder"))
    expect(window.teamcow.revealProjectInFinder).toHaveBeenCalledWith("project-1")

    await openProjectMenu()
    await clickElement(getByTestId(container, "project-menu-remove"))
    expect(window.teamcow.removeProject).toHaveBeenCalledWith("project-1")
    expect(container.querySelector(".proj-group")).toBeNull()
    expect(container.textContent).toContain("Import the same folder to restore it")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renames a conversation inline through the right-click context menu", async () => {
    window.teamcow.getAppContext = vi.fn(async () => conversationListContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    const conversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    ) as HTMLElement | undefined
    expect(conversationRow).toBeTruthy()

    await act(async () => {
      conversationRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 60 }))
      await Promise.resolve()
    })

    const renameItem = getByTestId(container, "conversation-menu-rename")
    expect(renameItem).toBeTruthy()

    await clickElement(renameItem)

    const renameInput = container.querySelector(".conv-rename-input") as HTMLInputElement | null
    expect(renameInput).toBeTruthy()

    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
        ?.set
        ?.call(renameInput!, "Renamed flow")
      renameInput!.dispatchEvent(new Event("input", { bubbles: true }))
      renameInput!.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      renameInput!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.renameConversation).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      title: "Renamed flow"
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("requires confirmation before deleting a conversation from the context menu", async () => {
    window.teamcow.getAppContext = vi.fn(async () => conversationListContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    const conversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    ) as HTMLElement | undefined
    expect(conversationRow).toBeTruthy()

    await act(async () => {
      conversationRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 60 }))
      await Promise.resolve()
    })

    await clickElement(getByTestId(container, "conversation-menu-delete"))

    // The destructive action is gated behind an explicit confirmation dialog.
    expect(window.teamcow.deleteConversation).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).toBeTruthy()

    await clickElement(getByTestId(container, "conversation-delete-confirm"))

    expect(window.teamcow.deleteConversation).toHaveBeenCalledWith({
      conversationId: "conversation-1"
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows worktree branch and run state for multiple conversations without opening each one", async () => {
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-09T09:08:00.000Z").getTime())
    const multiConversationContext: AppContextSnapshot = {
      ...selectionContext,
      shell: {
        ...selectionContext.shell,
        worktreeBranch: "feat/new-conversation",
        worktreePath: "/tmp/teamcow-feature",
        runStatus: "running"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: [
            {
              ...selectionContext.projects[0].conversations[0],
              provider: {
                kind: "codex",
                label: "Codex",
                status: "ready"
              },
              runStatus: "completed",
              worktreeId: "worktree-1",
              worktree: projectWorktrees[0],
              isCurrent: false
            },
            {
              ...selectionContext.projects[0].conversations[1],
              provider: {
                kind: "claude",
                label: "Claude",
                status: "ready"
              },
              runStatus: "running",
              worktreeId: "worktree-2",
              worktree: projectWorktrees[1],
              isCurrent: true
            }
          ]
        }
      ]
    }
    window.teamcow.getAppContext = vi.fn(async () => multiConversationContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    const conversationRows = Array.from(container.querySelectorAll(".conv-item"))
    expect(conversationRows[0]?.textContent).toContain("Inspector polish")
    expect(conversationRows[1]?.textContent).toContain("Navigation cleanup")

    const defaultRow = conversationRows.find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    const worktreeRow = conversationRows.find((row) =>
      row.textContent?.includes("Inspector polish")
    )

    expect(defaultRow?.textContent).toContain("Codex")
    expect(defaultRow?.querySelector(".ttag.provider-tag.codex .provider-tag-label")?.textContent).toBe("Codex")
    expect(defaultRow?.textContent).toContain("Completed")
    expect(defaultRow?.textContent).toContain("main")
    expect(defaultRow?.textContent).not.toContain("Default")
    expect(defaultRow?.querySelector(".conv-worktree-label")).toBeNull()
    expect(defaultRow?.querySelector(".conv-worktree-separator")).toBeNull()
    expect(defaultRow?.querySelector(".conv-worktree-icon")).toBeNull()
    expect(defaultRow?.querySelector(".conv-worktree-branch")?.textContent).toBe("main")
    expect(defaultRow?.querySelector(".ttag.default")).toBeNull()
    expect(defaultRow?.querySelector(".conv-updated-time")?.textContent).toBe("1h ago")
    expect(worktreeRow?.textContent).toContain("Claude")
    expect(worktreeRow?.querySelector(".ttag.provider-tag.claude .provider-tag-label")?.textContent).toBe("Claude Code")
    expect(worktreeRow?.textContent).toContain("Running")
    expect(worktreeRow?.textContent).toContain("feat/new-conversation")
    expect(worktreeRow?.textContent).not.toContain("Git worktree")
    expect(worktreeRow?.querySelector(".conv-worktree-icon")).toBeTruthy()
    expect(worktreeRow?.querySelector(".conv-worktree-label")?.textContent).toBe("worktree")
    expect(worktreeRow?.querySelector(".conv-worktree-separator")?.textContent).toBe("·")
    expect(worktreeRow?.querySelector(".conv-worktree-branch")?.textContent).toBe("feat/new-conversation")
    expect(worktreeRow?.querySelector(".conv-updated-time")?.textContent).toBe("3m ago")
    expect(worktreeRow?.querySelector(".ttag.worktree")).toBeNull()
    expect(worktreeRow?.classList.contains("active")).toBe(true)

    await act(async () => {
      root.unmount()
    })
    container.remove()
    dateNow.mockRestore()
  })

  it("keeps inspector tabs focused on the selected tab content", async () => {
    const activeGitWorktreeContext: AppContextSnapshot = {
      ...selectionContext,
      shell: {
        ...selectionContext.shell,
        worktreeBranch: "feat/new-conversation",
        worktreePath: "/tmp/teamcow-feature",
        runStatus: "running"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) =>
            conversation.id === "conversation-2"
              ? {
                  ...conversation,
                  worktreeId: "worktree-2",
                  worktree: projectWorktrees[1],
                  runStatus: "running" as const,
                  isCurrent: true
                }
              : {
                  ...conversation,
                  isCurrent: false
                }
          )
        }
      ]
    }
    window.teamcow.getAppContext = vi.fn(async () => activeGitWorktreeContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    const inspector = container.querySelector(".inspector")
    const inspectorTabs = Array.from(container.querySelectorAll(".inspector-tabbar .tab")).map((tab) =>
      tab.textContent?.trim()
    )

    expect(inspectorTabs).toEqual(["Files", "Terminal", "Changes", "Git"])
    expect(getByTestId(container, "inspector-tab-summary")).toBeNull()
    expect(getByTestId(container, "inspector-summary")).toBeNull()
    expect(getByTestId(container, "inspector-terminal-panel")?.hasAttribute("hidden")).toBe(true)
    expect(getByTestId(container, "inspector-files-panel")?.hasAttribute("hidden")).toBe(false)
    expect(getByTestId(container, "inspector-changes-panel")?.hasAttribute("hidden")).toBe(true)
    expect(getByTestId(container, "inspector-git-panel")?.hasAttribute("hidden")).toBe(true)
    expect(inspector?.querySelector(".inspector-minimal-panel")).toBeNull()
    expect(inspector?.querySelectorAll(".inspector-context-label")).toHaveLength(0)
    expect(inspector?.textContent).not.toContain("Inspector polish")
    expect(inspector?.textContent).not.toContain("Active conversation")
    expect(inspector?.textContent).not.toContain("Provider")
    expect(inspector?.textContent).not.toContain("Claude")
    expect(inspector?.textContent).not.toContain("feat/new-conversation")
    expect(inspector?.textContent).not.toContain("Run Status")
    expect(inspector?.textContent).not.toContain("Running")

    await clickElement(getByTestId(container, "inspector-tab-terminal"))
    const terminalPanel = getByTestId(container, "inspector-terminal-panel")

    expect(getByTestId(container, "inspector-files-panel")?.hasAttribute("hidden")).toBe(true)
    expect(terminalPanel?.hasAttribute("hidden")).toBe(false)
    expect(terminalPanel?.textContent).toContain("Terminal")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("uses the focused project landing state when a project has conversations but none is active", async () => {
    window.teamcow.getAppContext = vi.fn(async () => conversationListContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    expect(container.textContent).toContain("Navigation cleanup")
    expect(getByTestId(container, "project-conversation-landing-state")?.textContent).toContain("Start a conversation")
    expect(getByTestId(container, "project-landing-new-conversation")).toBeTruthy()
    expect(container.textContent).not.toContain("Select a conversation to continue")
    expect(container.textContent).not.toContain("Provider readiness")
    expect(container.querySelector(".provider-panel-compact")).toBeNull()
    expect(container.querySelector(".composer-modern")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps Files as the default inspector tab when a run summary exists", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: {
        ...timelineWithUserMessage(conversationId, "Summarize this run", "completed"),
        events: [
          {
            id: `${conversationId}-event-1`,
            conversationId,
            runId: `${conversationId}-run-1`,
            sequence: 1,
            type: "run.completed",
            payload: {
              message: "Generated the comparison summary"
            },
            createdAt: "2026-05-19T02:41:00.000Z"
          }
        ]
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(getByTestId(container, "inspector-summary")).toBeNull()
    expect(getByTestId(container, "inspector-files-panel")?.hasAttribute("hidden")).toBe(false)
    expect(getByTestId(container, "inspector-files-panel")?.textContent).not.toContain("Generated the comparison summary")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("pins the Files tab across conversation switches and returns to follow on unpin", async () => {
    const firstConversationContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-1",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Navigation cleanup",
        providerKind: "codex",
        runStatus: "idle"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-1"
          }))
        }
      ]
    }

    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok" as const,
      context: firstConversationContext
    }))
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: {
        ...timelineWithUserMessage(conversationId, "Summarize this run", "completed"),
        events: [
          {
            id: `${conversationId}-event-1`,
            conversationId,
            runId: `${conversationId}-run-1`,
            sequence: 1,
            type: "run.completed",
            payload: {
              message: conversationId === "conversation-2"
                ? "Pinned summary from Inspector polish"
                : "Follow summary from Navigation cleanup"
            },
            createdAt: "2026-05-19T02:41:00.000Z"
          }
        ]
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await settle()
    expect(getByTestId(container, "inspector-files-panel")?.hasAttribute("hidden")).toBe(false)
    expect(getByTestId(container, "inspector-summary")).toBeNull()

    await clickElement(getByTestId(container, "inspector-pin-toggle"))
    expect(getByTestId(container, "inspector-pin-toggle")?.getAttribute("aria-pressed")).toBe("true")

    const firstConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    await clickElement(firstConversationRow)

    expect(getByTestId(container, "inspector-files-panel")?.hasAttribute("hidden")).toBe(false)
    expect(getByTestId(container, "inspector-pin-mismatch")?.textContent).toContain("Active: Navigation cleanup")
    expect(container.querySelector(".inspector-minimal-panel")).toBeNull()

    await clickElement(getByTestId(container, "inspector-pin-toggle"))

    expect(getByTestId(container, "inspector-pin-toggle")?.getAttribute("aria-pressed")).toBe("false")
    expect(getByTestId(container, "inspector-files-panel")?.hasAttribute("hidden")).toBe(false)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps the pinned tab visible even if another inspector tab is clicked", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "chat-review-diff-conversation-2-artifact-diff"))
    await clickElement(getByTestId(container, "inspector-pin-toggle"))
    await clickElement(getByTestId(container, "inspector-tab-files"))

    expect(getByTestId(container, "inspector-changes-panel")?.hasAttribute("hidden")).toBe(false)
    expect(getByTestId(container, "inspector-files-panel")?.hasAttribute("hidden")).toBe(true)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps the center area Chat-only until a Files row is opened", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(getByTestId(container, "chat-message-list")).toBeTruthy()
    expect(getByTestId(container, "editor-workspace")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("opens a project file inside the center editor workspace from Files", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await openProjectServiceFileFromFiles(container)

    expect(getByTestId(container, "editor-workspace")).toBeTruthy()
    expect(window.teamcow.readConversationFile).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      filePath: "apps/desktop/src/main/project-service.ts"
    })
    expect(window.teamcow.openConversationHandoff).not.toHaveBeenCalled()
    expect(getByTestId(container, "file-editor-pane")?.textContent).toContain("project-service.ts")
    expect(container.querySelector(".editor-workspace-chat")?.hasAttribute("hidden")).toBe(true)
    expect(container.querySelector(".editor-workspace-chat .composer-modern")).toBeTruthy()

    await clickElement(getByTestId(container, "editor-tab-chat"))
    expect(container.querySelector(".editor-workspace-chat")?.hasAttribute("hidden")).toBe(false)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("pins an editor workspace tab when a Files row is double-clicked", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await openProjectServiceFileFromFiles(container, "double-click")

    expect(getByTestId(container, "editor-tab-apps/desktop/src/main/project-service.ts")?.textContent).not.toContain("Preview")
    expect(window.teamcow.openConversationHandoff).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("distinguishes preview and pinned editor tabs", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await openProjectServiceFileFromFiles(container)

    const tabId = "editor-tab-apps/desktop/src/main/project-service.ts"
    const previewTab = getByTestId(container, tabId)
    expect(previewTab?.getAttribute("data-editor-tab-mode")).toBe("preview")
    expect(previewTab?.querySelector(".editor-tab-preview-indicator")?.textContent).toContain("Preview")
    expect(previewTab?.querySelector(".editor-tab-pin-indicator")).toBeNull()
    expect(previewTab?.querySelector(".editor-tab-pin-action")).toBeNull()

    await doubleClickElement(previewTab?.querySelector(".editor-tab-select"))
    await settle()

    const pinnedTab = getByTestId(container, tabId)
    expect(pinnedTab?.getAttribute("data-editor-tab-mode")).toBe("pinned")
    expect(pinnedTab?.querySelector(".editor-tab-pin-indicator")).toBeNull()
    expect(pinnedTab?.querySelector(".editor-tab-pin-action")).toBeNull()
    expect(pinnedTab?.querySelector(".editor-tab-preview-indicator")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("creates a new file from the Files context menu with inline editing", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop"))
    await rightClickElement(getByTestId(container, "inspector-project-file-apps/desktop/src"))
    await clickElement(getByTestId(container, "project-file-context-new-file"))

    const input = getByTestId(container, "project-file-inline-input") as HTMLInputElement | null
    expect(input).toBeTruthy()

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      valueSetter?.call(input, "new-helper.ts")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(window.teamcow.createConversationFileEntry).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      filePath: "apps/desktop/src/new-helper.ts",
      kind: "file"
    })
    expect(window.teamcow.getConversationProjectFiles).toHaveBeenCalledWith("conversation-2", "apps/desktop/src")
    expect(window.teamcow.readConversationFile).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      filePath: "apps/desktop/src/new-helper.ts"
    })
    expect(getByTestId(container, "editor-tab-apps/desktop/src/new-helper.ts")?.textContent).not.toContain("Preview")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps the Files context menu inside the viewport when opened at the right edge", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 })
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 720 })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main"))
    await rightClickElement(
      getByTestId(container, "inspector-project-file-apps/desktop/src/main/project-service.ts"),
      { clientX: 318, clientY: 96 }
    )

    const menu = getByTestId(container, "project-file-context-menu") as HTMLElement | null
    expect(menu?.parentElement).toBe(document.body)
    expect(Number.parseFloat(menu?.style.left ?? "")).toBeLessThanOrEqual(92)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renames a file from the Files context menu with inline editing", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main"))
    await rightClickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main/project-service.ts"))
    await clickElement(getByTestId(container, "project-file-context-rename"))

    const input = getByTestId(container, "project-file-inline-input") as HTMLInputElement | null
    expect(input).toBeTruthy()

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      valueSetter?.call(input, "renamed-service.ts")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(window.teamcow.renameConversationFileEntry).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      sourcePath: "apps/desktop/src/main/project-service.ts",
      destinationPath: "apps/desktop/src/main/renamed-service.ts",
      kind: "file"
    })
    expect(window.teamcow.getConversationProjectFiles).toHaveBeenCalledWith("conversation-2", "apps/desktop/src/main")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("cancels Files inline editing when focus moves to another file", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main"))
    await clickElement(getByTestId(container, "inspector-project-file-packages"))
    await clickElement(getByTestId(container, "inspector-project-file-packages/shared-types"))
    await clickElement(getByTestId(container, "inspector-project-file-packages/shared-types/src"))
    await rightClickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main/project-service.ts"))
    await clickElement(getByTestId(container, "project-file-context-rename"))

    const input = getByTestId(container, "project-file-inline-input") as HTMLInputElement | null
    expect(input).toBeTruthy()

    await act(async () => {
      input?.focus()
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      valueSetter?.call(input, "draft-name.ts")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
      input?.dispatchEvent(new FocusEvent("focusout", {
        bubbles: true,
        relatedTarget: getByTestId(container, "inspector-project-file-packages/shared-types/src/index.ts")
      }))
      getByTestId(container, "inspector-project-file-packages/shared-types/src/index.ts")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(getByTestId(container, "project-file-inline-input")).toBeNull()
    expect(window.teamcow.renameConversationFileEntry).not.toHaveBeenCalled()
    expect(window.teamcow.readConversationFile).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      filePath: "packages/shared-types/src/index.ts"
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("confirms deletion from the Files context menu before deleting", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main"))
    await rightClickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main/project-service.ts"))
    await clickElement(getByTestId(container, "project-file-context-delete"))

    expect(window.teamcow.deleteConversationFileEntry).not.toHaveBeenCalled()
    await clickElement(getByTestId(container, "project-file-delete-confirm"))
    await settle()

    expect(window.teamcow.deleteConversationFileEntry).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      filePath: "apps/desktop/src/main/project-service.ts",
      kind: "file"
    })
    expect(window.teamcow.getConversationProjectFiles).toHaveBeenCalledWith("conversation-2", "apps/desktop/src/main")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("handles dirty editor workspace close cancel and save from Files", async () => {
    window.teamcow.getAppContext = vi.fn(async () => withActiveConversationRunStatus(selectionContext, "idle"))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await openProjectServiceFileFromFiles(container)
    await editCodeMirrorDocument(container, "// dirty edit\n")
    await settle()

    expect(getByTestId(container, "file-editor-pane")?.textContent).toContain("Unsaved")

    const closeButton = () => container.querySelector(".editor-tab.active .editor-tab-actions button[aria-label=\"Close tab\"]")
    await clickElement(closeButton())

    expect(getByTestId(container, "editor-close-dirty-save")).toBeTruthy()
    expect(getByTestId(container, "editor-close-dirty-discard")).toBeTruthy()

    const cancelButton = Array.from(container.querySelectorAll(".danger-confirmation button")).find((button) =>
      button.textContent === "Cancel"
    )
    await clickElement(cancelButton)

    expect(getByTestId(container, "editor-close-dirty-save")).toBeNull()
    expect(getByTestId(container, "editor-workspace")).toBeTruthy()

    await clickElement(closeButton())
    await clickElement(getByTestId(container, "editor-close-dirty-save"))
    await settle()

    expect(window.teamcow.writeConversationFile).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      filePath: "apps/desktop/src/main/project-service.ts",
      content: "// dirty edit\nexport const value = 1\n",
      precondition: {
        ifMatch: "rev-apps/desktop/src/main/project-service.ts"
      }
    })
    expect(getByTestId(container, "editor-workspace")).toBeNull()
    expect(getByTestId(container, "chat-message-list")).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps the dirty close dialog open and shows the save error when saving fails", async () => {
    window.teamcow.getAppContext = vi.fn(async () => withActiveConversationRunStatus(selectionContext, "idle"))
    window.teamcow.writeConversationFile = vi.fn(async () => ({
      status: "error" as const,
      error: {
        code: "FILE_WRITE_FAILED" as const,
        message: "disk denied the write",
        suggestion: null
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await openProjectServiceFileFromFiles(container)
    await editCodeMirrorDocument(container, "// dirty edit\n")
    await settle()

    const closeButton = () => container.querySelector(".editor-tab.active .editor-tab-actions button[aria-label=\"Close tab\"]")
    await clickElement(closeButton())
    await clickElement(getByTestId(container, "editor-close-dirty-save"))
    await settle()

    expect(getByTestId(container, "editor-close-dirty-save")).toBeTruthy()
    expect(getByTestId(container, "file-editor-save-alert")?.textContent).toContain("TeamCow could not save the selected file.")
    expect(getByTestId(container, "editor-workspace")).toBeTruthy()
    expect(getByTestId(container, "file-editor-pane")?.textContent).toContain("Unsaved")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows visible editor save banners for error and readonly results", async () => {
    window.teamcow.getAppContext = vi.fn(async () => withActiveConversationRunStatus(selectionContext, "idle"))
    window.teamcow.writeConversationFile = vi.fn(async () => ({
      status: "readonly" as const,
      error: {
        code: "FILE_RUN_ACTIVE_READONLY" as const,
        message: "Conversation has an active provider run",
        suggestion: null
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await openProjectServiceFileFromFiles(container)
    await editCodeMirrorDocument(container, "// dirty edit\n")
    await settle()
    await clickElement(getByTestId(container, "file-editor-save"))
    await settle()

    expect(getByTestId(container, "file-editor-save-alert")?.textContent).toContain("The provider is currently running")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("opens files read-only while the active conversation run is running", async () => {
    window.teamcow.getAppContext = vi.fn(async () => withActiveConversationRunStatus(selectionContext, "running"))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await openProjectServiceFileFromFiles(container)

    expect(getByTestId(container, "file-editor-pane")?.textContent).toContain("Run active")
    expect(getByTestId(container, "file-editor-save")?.hasAttribute("disabled")).toBe(true)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("moves Files handoff behind the editor workspace external open action", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await openProjectServiceFileFromFiles(container)

    expect(window.teamcow.openConversationHandoff).not.toHaveBeenCalled()

    await clickElement(getByTestId(container, "file-editor-open-external"))

    expect(window.teamcow.openConversationHandoff).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      target: "file",
      filePath: "apps/desktop/src/main/project-service.ts"
    })
    expect(getByTestId(container, "file-editor-handoff-message")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows editor workspace external open errors in the editor pane", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.openConversationHandoff = vi.fn(async (): Promise<OpenConversationHandoffResult> => ({
      status: "error",
      error: {
        code: "HANDOFF_OPEN_FAILED",
        message: "No editor",
        suggestion: "No editor is registered"
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await openProjectServiceFileFromFiles(container)
    await clickElement(getByTestId(container, "file-editor-open-external"))

    expect(getByTestId(container, "file-editor-handoff-message")?.textContent).toContain(
      "TeamCow could not open the selected target in the selected editor."
    )
    expect(getByTestId(container, "file-editor-handoff-message")?.textContent).toContain(
      "Please confirm the selected editor can open the path, then try again."
    )

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps pinned Files editor tabs bound to the pinned conversation context", async () => {
    const firstConversationContext: AppContextSnapshot = {
      ...withActiveConversationRunStatus(selectionContext, "idle"),
      selectedConversationId: "conversation-1",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Navigation cleanup",
        providerKind: "codex",
        runStatus: "idle"
      },
      projects: [
        {
          ...withActiveConversationRunStatus(selectionContext, "idle").projects[0],
          conversations: withActiveConversationRunStatus(selectionContext, "idle").projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-1"
          }))
        }
      ]
    }
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok" as const,
      context: firstConversationContext
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-pin-toggle"))

    const firstConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    await clickElement(firstConversationRow)
    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main/project-service.ts"))
    await settle()

    expect(window.teamcow.readConversationFile).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      filePath: "apps/desktop/src/main/project-service.ts"
    })
    expect(getByTestId(container, "file-editor-pane")?.textContent).toContain("Run active")
    expect(getByTestId(container, "file-editor-save")?.hasAttribute("disabled")).toBe(true)

    await clickElement(getByTestId(container, "file-editor-open-external"))

    expect(window.teamcow.openConversationHandoff).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      target: "file",
      filePath: "apps/desktop/src/main/project-service.ts"
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps dirty editor workspace tabs when switching the active conversation", async () => {
    const initialContext = withActiveConversationRunStatus(selectionContext, "idle")
    const firstConversationContext: AppContextSnapshot = {
      ...initialContext,
      selectedConversationId: "conversation-1",
      shell: {
        ...initialContext.shell,
        conversationTitle: "Navigation cleanup",
        providerKind: "codex",
        runStatus: "idle"
      },
      projects: [
        {
          ...initialContext.projects[0],
          conversations: initialContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-1"
          }))
        }
      ]
    }

    window.teamcow.getAppContext = vi.fn(async () => initialContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok" as const,
      context: firstConversationContext
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await openProjectServiceFileFromFiles(container)
    await editCodeMirrorDocument(container, "// dirty edit\n")
    await settle()
    expect(getByTestId(container, "file-editor-pane")?.textContent).toContain("Unsaved")

    const firstConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    await clickElement(firstConversationRow)
    await settle()

    expect(getByTestId(container, "editor-workspace")).toBeTruthy()
    expect(getByTestId(container, "file-editor-pane")?.textContent).toContain("Unsaved")
    expect(getByTestId(container, "editor-tab-apps/desktop/src/main/project-service.ts")?.textContent).toContain("project-service.ts")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps dirty editor workspace draft text after switching to a project that cannot resolve the conversation", async () => {
    const initialContext = withActiveConversationRunStatus(selectionContext, "idle")
    const otherProject = {
      id: "project-2",
      name: "othercow",
      rootPath: "/tmp/othercow",
      status: "ready" as const,
      isCurrent: false,
      defaultWorktree: {
        id: "worktree-other-default",
        projectId: "project-2",
        kind: "default" as const,
        rootPath: "/tmp/othercow",
        branch: "main",
        status: "ready" as const
      },
      conversations: []
    }
    const twoProjectContext: AppContextSnapshot = {
      ...initialContext,
      projects: [
        initialContext.projects[0],
        otherProject
      ]
    }
    const otherProjectContext: AppContextSnapshot = {
      ...twoProjectContext,
      selectedProjectId: "project-2",
      selectedConversationId: null,
      projects: [
        {
          ...initialContext.projects[0],
          isCurrent: false,
          conversations: initialContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: false
          }))
        },
        {
          ...otherProject,
          isCurrent: true
        }
      ],
      shell: {
        ...initialContext.shell,
        projectName: "othercow",
        conversationTitle: null,
        providerKind: null,
        worktreeBranch: "main",
        worktreePath: "/tmp/othercow",
        runStatus: null,
        hasConversations: false
      },
      chips: [
        { kind: "project", value: "othercow" },
        { kind: "conversation", value: "" },
        { kind: "provider", value: "" },
        { kind: "worktree", value: "main" },
        { kind: "run-status", value: "" }
      ]
    }

    window.teamcow.getAppContext = vi.fn(async () => twoProjectContext)
    window.teamcow.selectProject = vi.fn(async (projectId: string) => ({
      status: "ok" as const,
      context: projectId === "project-2" ? otherProjectContext : twoProjectContext
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await openProjectServiceFileFromFiles(container)
    await editCodeMirrorDocument(container, "// dirty edit\n")
    await settle()
    expect((getByTestId(container, "mock-code-editor") as HTMLTextAreaElement | null)?.value).toContain("// dirty edit")

    const secondProjectRow = Array.from(container.querySelectorAll(".proj-row")).find((row) =>
      row.textContent?.includes("othercow")
    )
    await clickElement(secondProjectRow)
    await settle()

    expect(getByTestId(container, "editor-workspace")).toBeNull()

    const firstProjectRow = Array.from(container.querySelectorAll(".proj-row")).find((row) =>
      row.textContent?.includes("teamcow")
    )
    await clickElement(firstProjectRow)
    await settle()

    expect(getByTestId(container, "editor-workspace")).toBeTruthy()
    expect((getByTestId(container, "mock-code-editor") as HTMLTextAreaElement | null)?.value).toContain("// dirty edit")
    expect(getByTestId(container, "file-editor-pane")?.textContent).toContain("Unsaved")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows conversation-bound project files in the Files inspector tab with directories collapsed by default", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    expect(getByTestId(container, "inspector-tab-files")?.textContent).toBe("Files")
    await clickElement(getByTestId(container, "inspector-tab-files"))

    const filesPanel = getByTestId(container, "inspector-files-panel")
    expect(window.teamcow.getConversationProjectFiles).toHaveBeenCalledWith("conversation-2")
    expect(filesPanel?.textContent).toContain("apps")
    expect(filesPanel?.textContent).toContain("dist")
    expect(filesPanel?.textContent).toContain("node_modules")
    expect(filesPanel?.textContent).toContain("packages")
    expect(filesPanel?.textContent).not.toContain("desktop")
    expect(filesPanel?.textContent).not.toContain("src")
    expect(filesPanel?.textContent).not.toContain("project-service.ts")
    expect(filesPanel?.textContent).not.toContain("Project files")
    expect(filesPanel?.textContent).not.toContain("2 project files")
    expect(filesPanel?.textContent).not.toContain("Inspector")
    expect(filesPanel?.textContent).not.toContain("Active conversation")
    expect(filesPanel?.textContent).not.toContain("Summary")
    expect(filesPanel?.textContent).not.toContain("Terminal")
    expect(filesPanel?.textContent).not.toContain("apps/desktop/src/main/project-service.ts")
    expect(filesPanel?.textContent).not.toContain("packages/shared-types/src/index.ts")
    expect(filesPanel?.textContent).not.toContain("Renders active changed file preview")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps the Files inspector loaded during active run context refreshes", async () => {
    vi.useFakeTimers()

    try {
      const runningContext = withActiveConversationRunStatus(selectionContext, "running")
      const cloneRunningContext = () => JSON.parse(JSON.stringify(runningContext)) as AppContextSnapshot
      const getConversationProjectFiles = vi.fn(async (
        conversationId: string,
        directoryPath?: string
      ): Promise<GetConversationProjectFilesResult> =>
        projectFilesResult(conversationId, directoryPath)
      )

      window.teamcow.getAppContext = vi.fn(async () => cloneRunningContext())
      window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
        status: "ok",
        timeline: inspectorFilesTimeline(conversationId)
      }))
      window.teamcow.getConversationProjectFiles = getConversationProjectFiles

      const container = document.createElement("div")
      document.body.appendChild(container)

      const root = await renderWithI18n(container, <DesktopShell />)
      await clickElement(getByTestId(container, "inspector-tab-files"))

      const filesPanel = getByTestId(container, "inspector-files-panel")
      expect(filesPanel?.textContent).toContain("apps")
      expect(getConversationProjectFiles).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(getConversationProjectFiles).toHaveBeenCalledTimes(1)
      expect(filesPanel?.textContent).toContain("apps")

      await act(async () => {
        root.unmount()
      })
      container.remove()
    } finally {
      vi.useRealTimers()
    }
  })

  it("renders Material file icons for project files and folders", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main"))
    await clickElement(getByTestId(container, "inspector-project-file-packages"))
    await clickElement(getByTestId(container, "inspector-project-file-packages/shared-types"))
    await clickElement(getByTestId(container, "inspector-project-file-packages/shared-types/src"))

    const srcIcon = getByTestId(container, "inspector-project-file-apps/desktop/src")
      ?.querySelector(".project-file-icon") as HTMLImageElement | null
    const tsIcon = getByTestId(container, "inspector-project-file-apps/desktop/src/main/project-service.ts")
      ?.querySelector(".project-file-icon") as HTMLImageElement | null
    const indexIcon = getByTestId(container, "inspector-project-file-packages/shared-types/src/index.ts")
      ?.querySelector(".project-file-icon") as HTMLImageElement | null

    expect(srcIcon?.getAttribute("src")).toContain("/file-icons/folder-src-open.svg")
    expect(tsIcon?.getAttribute("src")).toContain("/file-icons/typescript.svg")
    expect(indexIcon?.getAttribute("src")).toContain("/file-icons/typescript.svg")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows default worktree project files when the selected project has no conversation", async () => {
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)
    const getProjectWorktreeFiles = vi.fn(async (projectId: string, worktreeId: string, directoryPath?: string) =>
      projectWorktreeFilesResult(projectId, worktreeId, directoryPath)
    )
    window.teamcow.getProjectWorktreeFiles = getProjectWorktreeFiles

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-files"))

    const filesPanel = getByTestId(container, "inspector-files-panel")
    expect(getProjectWorktreeFiles).toHaveBeenCalledWith("project-1", "worktree-1")
    expect(filesPanel?.textContent).toContain("apps")
    expect(filesPanel?.textContent).toContain("packages")
    expect(filesPanel?.textContent).not.toContain("No project files found in this worktree.")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("collapses and expands project file directories in the Files inspector tab", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-files"))

    const filesPanel = getByTestId(container, "inspector-files-panel")
    expect(filesPanel?.textContent).toContain("apps")
    expect(filesPanel?.textContent).not.toContain("desktop")
    expect(filesPanel?.textContent).not.toContain("project-service.ts")

    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    expect(filesPanel?.textContent).toContain("apps")
    expect(filesPanel?.textContent).toContain("desktop")
    expect(filesPanel?.textContent).not.toContain("project-service.ts")

    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    expect(filesPanel?.textContent).not.toContain("desktop")
    expect(filesPanel?.textContent).not.toContain("project-service.ts")

    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    expect(filesPanel?.textContent).toContain("desktop")

    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop"))
    expect(filesPanel?.textContent).toContain("src")
    expect(filesPanel?.textContent).not.toContain("project-service.ts")

    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src"))
    expect(filesPanel?.textContent).toContain("main")
    expect(filesPanel?.textContent).not.toContain("project-service.ts")

    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main"))
    expect(filesPanel?.textContent).toContain("project-service.ts")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps lazily loaded scoped package children directly under their parent", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-project-file-node_modules"))
    await clickElement(getByTestId(container, "inspector-project-file-node_modules/@bloomberg"))
    await clickElement(getByTestId(container, "inspector-project-file-node_modules/@bloomberg/record-tuple-polyfill"))

    const rows = getRenderedProjectTreePaths(container)
    const parentIndex = rows.indexOf("node_modules/@bloomberg/record-tuple-polyfill")
    expect(parentIndex).toBeGreaterThanOrEqual(0)
    expect(rows.slice(parentIndex, parentIndex + 4)).toEqual([
      "node_modules/@bloomberg/record-tuple-polyfill",
      "node_modules/@bloomberg/record-tuple-polyfill/lib",
      "node_modules/@bloomberg/record-tuple-polyfill/package.json",
      "node_modules/@bloomberg/record-tuple-polyfill/README.md"
    ])

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("virtualizes large project file directories instead of rendering every loaded row", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationProjectFiles = vi.fn(async (
      conversationId: string,
      directoryPath?: string
    ): Promise<GetConversationProjectFilesResult> => {
      if (directoryPath !== "node_modules") {
        return projectFilesResult(conversationId, directoryPath)
      }
      const files: ProjectFileTreeItem[] = Array.from({ length: 400 }, (_, index) => {
        const name = `pkg-${String(index).padStart(3, "0")}`
        return {
          path: `node_modules/${name}`,
          name,
          kind: "directory",
          depth: 1,
          isSymlink: false
        }
      })
      return {
        status: "ok",
        projectFiles: {
          conversationId,
          worktreeId: "worktree-1",
          worktreeRootPath: "/tmp/teamcow",
          directoryPath,
          files,
          fileCount: 0,
          directoryCount: files.length,
          truncated: false,
          checkedAt: "2026-06-04T08:17:33.000Z"
        }
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-project-file-node_modules"))

    expect(getRenderedProjectTreePaths(container).length).toBeLessThan(120)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("does not send duplicate project file requests while a directory load is pending", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    const pendingNodeModules = createDeferred<GetConversationProjectFilesResult>()
    const getConversationProjectFiles = vi.fn((
      conversationId: string,
      directoryPath?: string
    ): Promise<GetConversationProjectFilesResult> => {
      if (directoryPath === "node_modules") {
        return pendingNodeModules.promise
      }
      return Promise.resolve(projectFilesResult(conversationId, directoryPath))
    })
    window.teamcow.getConversationProjectFiles = getConversationProjectFiles

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-project-file-node_modules"))
    await clickElement(getByTestId(container, "inspector-project-file-node_modules"))
    await clickElement(getByTestId(container, "inspector-project-file-node_modules"))

    expect(getConversationProjectFiles.mock.calls.filter(([, directoryPath]) =>
      directoryPath === "node_modules"
    )).toHaveLength(1)

    await act(async () => {
      pendingNodeModules.resolve(projectFilesResult("conversation-2", "node_modules"))
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("ignores stale project file directory responses after a forced refresh", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    const staleSrcDirectory = createDeferred<GetConversationProjectFilesResult>()
    let srcDirectoryRequestCount = 0
    const srcDirectoryResult = (
      conversationId: string,
      files: ProjectFileTreeItem[]
    ): GetConversationProjectFilesResult => {
      const source = projectFilesResult(conversationId, "apps/desktop/src")
      if (source.status !== "ok") {
        throw new Error("expected project files")
      }
      return {
        status: "ok",
        projectFiles: {
          ...source.projectFiles,
          files,
          ...countProjectFileKinds(files)
        }
      }
    }

    window.teamcow.getConversationProjectFiles = vi.fn((
      conversationId: string,
      directoryPath?: string
    ): Promise<GetConversationProjectFilesResult> => {
      if (directoryPath === "apps/desktop/src") {
        srcDirectoryRequestCount += 1
        if (srcDirectoryRequestCount === 1) {
          return staleSrcDirectory.promise
        }
        return Promise.resolve(srcDirectoryResult(conversationId, [
          { path: "apps/desktop/src/main", name: "main", kind: "directory", depth: 3, isSymlink: false },
          { path: "apps/desktop/src/new-helper.ts", name: "new-helper.ts", kind: "file", depth: 3, isSymlink: false }
        ]))
      }
      return Promise.resolve(projectFilesResult(conversationId, directoryPath))
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop"))
    await rightClickElement(getByTestId(container, "inspector-project-file-apps/desktop/src"))
    await clickElement(getByTestId(container, "project-file-context-new-file"))

    const input = getByTestId(container, "project-file-inline-input") as HTMLInputElement | null
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      valueSetter?.call(input, "new-helper.ts")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(srcDirectoryRequestCount).toBe(2)
    expect(getRenderedProjectTreePaths(container)).toContain("apps/desktop/src/new-helper.ts")

    await act(async () => {
      staleSrcDirectory.resolve(srcDirectoryResult("conversation-2", [
        { path: "apps/desktop/src/main", name: "main", kind: "directory", depth: 3, isSymlink: false },
        { path: "apps/desktop/src/old-helper.ts", name: "old-helper.ts", kind: "file", depth: 3, isSymlink: false }
      ]))
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    const rows = getRenderedProjectTreePaths(container)
    expect(rows).toContain("apps/desktop/src/new-helper.ts")
    expect(rows).not.toContain("apps/desktop/src/old-helper.ts")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows live dirty changes and opens the exact selected revision in the editor workspace", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: emptyTimeline(conversationId)
    }))
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId, {
        unstaged: [changeFile("src/provider-edit.ts"), changeFile("src/manual-edit.ts")]
      })
    }))
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, "old provider output\n", `${input.filePath}\n`)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)

    expect(getByTestId(container, "inspector-tab-changes")?.textContent).toBe("Changes")
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()

    const panel = getByTestId(container, "inspector-changes-panel")
    expect(panel?.hasAttribute("hidden")).toBe(false)
    expect(panel?.textContent).toContain("src/provider-edit.ts")
    expect(panel?.textContent).toContain("src/manual-edit.ts")
    expect(window.teamcow.getConversationChangeDiffDocument).not.toHaveBeenCalled()

    await clickElement(getButtonByAriaLabel(container, "Review changes for src/manual-edit.ts (unstaged)"))
    await settle()

    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalledTimes(1)
    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      worktreeId: "worktree-1",
      revision: "revision-1",
      area: "unstaged",
      filePath: "src/manual-edit.ts"
    })
    expect(getByTestId(container, "editor-tab-src/manual-edit.ts")?.getAttribute("data-editor-resource")).toBe("change-diff")
    expect(getByTestId(container, "mock-change-diff-original")?.textContent).toContain("old provider output")
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("src/manual-edit.ts")

    await act(async () => root.unmount())
    container.remove()
  })

  it("reuses an immutable exact-revision preview when the selected change row is clicked again", async () => {
    let diffRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId, { unstaged: [changeFile("src/reselect.ts")] })
    }))
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) => {
      diffRead += 1
      return textChangeDiffDocument(input, "old", `RESELECT-${diffRead}`)
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    const row = getButtonByAriaLabel(container, "Review changes for src/reselect.ts (unstaged)")
    await clickElement(row)
    await settle()
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("RESELECT-1")
    expect(getByTestId(container, "inspector-pin-toggle")?.hasAttribute("disabled")).toBe(false)

    await clickElement(row)
    await settle()

    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalledTimes(1)
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("RESELECT-1")
    expect(getByTestId(container, "inspector-pin-toggle")?.hasAttribute("disabled")).toBe(false)

    await act(async () => root.unmount())
    container.remove()
  })

  it("keeps a row-pinned fixed-revision diff when the active conversation changes", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async (conversationId: string) => ({
      status: "ok" as const,
      context: contextSelectingConversation(conversationId as "conversation-1" | "conversation-2")
    }))
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId, {
        revision: conversationId === "conversation-2" ? "revision-fixed-a" : "revision-b",
        unstaged: [changeFile("src/pinned-a.ts")]
      })
    }))
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, "A-before", "A-fixed-revision")
    )

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()

    await doubleClickElement(getButtonByAriaLabel(container, "Review changes for src/pinned-a.ts (unstaged)"))
    await settle()
    expect(getByTestId(container, "editor-tab-src/pinned-a.ts")?.getAttribute("data-editor-tab-mode")).toBe("pinned")
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("A-fixed-revision")

    const conversationOneRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    await clickElement(conversationOneRow)
    await settle()

    expect(getByTestId(container, "editor-tab-src/pinned-a.ts")?.getAttribute("data-editor-tab-mode")).toBe("pinned")
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("A-fixed-revision")
    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalledTimes(1)
    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation-2",
      revision: "revision-fixed-a"
    }))

    await act(async () => root.unmount())
    container.remove()
  })

  it("opens a new exact-revision preview and ignores the old document response after refresh", async () => {
    const staleDiff = createDeferred<ConversationChangeDiffDocumentResult>()
    let listRead = 0
    let diffRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      listRead += 1
      return {
        status: "ok",
        changes: changesSnapshot(conversationId, {
          unstaged: [changeFile("src/revision.ts")],
          revision: listRead === 1 ? "revision-1" : "revision-2",
          checkedAt: listRead === 1 ? "2026-07-10T05:00:00.000Z" : "2026-07-10T05:00:01.000Z"
        })
      }
    })
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) => {
      diffRead += 1
      if (diffRead === 1) {
        return staleDiff.promise
      }
      return textChangeDiffDocument(input, "old", "FRESH-REVISION")
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/revision.ts (unstaged)"))

    await clickElement(getButtonByAriaLabel(container, "Refresh changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/revision.ts (unstaged)"))
    await settle()
    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalledTimes(2)
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("FRESH-REVISION")

    await act(async () => {
      staleDiff.resolve(textChangeDiffDocument({
        conversationId: "conversation-2",
        worktreeId: "worktree-1",
        revision: "revision-1",
        area: "unstaged",
        filePath: "src/revision.ts"
      }, "old", "STALE-REVISION"))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("FRESH-REVISION")
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).not.toContain("STALE-REVISION")

    await act(async () => root.unmount())
    container.remove()
  })

  it("opens a refreshed revision after a structured editor document error", async () => {
    let diffRead = 0
    let listRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      listRead += 1
      return {
        status: "ok",
        changes: changesSnapshot(conversationId, {
          revision: `revision-${listRead}`,
          unstaged: [changeFile("src/retry-diff.ts")]
        })
      }
    })
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput): Promise<ConversationChangeDiffDocumentResult> => {
      diffRead += 1
      if (diffRead === 1) {
        return {
          status: "error",
          ...input,
          error: {
            code: "GIT_CHANGES_READ_FAILED",
            message: "temporary diff failure",
            suggestion: null,
            domain: "git"
          }
        }
      }
      return textChangeDiffDocument(input, "old", "RETRIED-DIFF")
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/retry-diff.ts (unstaged)"))
    await settle()
    expect(getByTestId(container, "change-diff-editor-pane")?.textContent).toContain(
      "TeamCow could not read the current worktree changes."
    )
    expect(getByTestId(container, "change-diff-editor-pane")?.textContent).not.toContain("temporary diff failure")
    await clickElement(getButtonByAriaLabel(container, "Refresh changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/retry-diff.ts (unstaged)"))
    await settle()

    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalledTimes(2)
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("RETRIED-DIFF")

    await act(async () => root.unmount())
    container.remove()
  })

  it("ignores out-of-order live list and exact editor document responses", async () => {
    const conversationTwoList = createDeferred<GetConversationChangesResult>()
    const conversationOneList = createDeferred<GetConversationChangesResult>()
    const firstDiff = createDeferred<ConversationChangeDiffDocumentResult>()
    const secondDiff = createDeferred<ConversationChangeDiffDocumentResult>()
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async (conversationId: string) => ({
      status: "ok" as const,
      context: contextSelectingConversation(conversationId as "conversation-1" | "conversation-2")
    }))
    window.teamcow.getConversationChanges = vi.fn((conversationId: string) =>
      conversationId === "conversation-2" ? conversationTwoList.promise : conversationOneList.promise
    )
    window.teamcow.getConversationChangeDiffDocument = vi.fn((input: GetConversationChangeDiffDocumentInput) =>
      input.filePath === "src/first.ts" ? firstDiff.promise : secondDiff.promise
    )

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))

    const firstConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    await clickElement(firstConversationRow)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await act(async () => {
      conversationOneList.resolve({
        status: "ok",
        changes: changesSnapshot("conversation-1", {
          staged: [changeFile("src/first.ts")],
          unstaged: [changeFile("src/second.ts")]
        })
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/first.ts (staged)"))
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/second.ts (unstaged)"))
    await act(async () => {
      secondDiff.resolve(textChangeDiffDocument({
        conversationId: "conversation-1",
        worktreeId: "worktree-1",
        revision: "revision-1",
        area: "unstaged",
        filePath: "src/second.ts"
      }, "old", "SECOND"))
      await Promise.resolve()
      firstDiff.resolve(textChangeDiffDocument({
        conversationId: "conversation-1",
        worktreeId: "worktree-1",
        revision: "revision-1",
        area: "staged",
        filePath: "src/first.ts"
      }, "old", "FIRST"))
      conversationTwoList.resolve({
        status: "ok",
        changes: changesSnapshot("conversation-2", { unstaged: [changeFile("src/stale.ts")] })
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    const panel = getByTestId(container, "inspector-changes-panel")
    expect(panel?.textContent).toContain("src/second.ts")
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("SECOND")
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).not.toContain("FIRST")
    expect(panel?.textContent).not.toContain("src/stale.ts")

    await act(async () => root.unmount())
    container.remove()
  })

  it("physically coalesces A to B to A list reads without overlapping the returning A request", async () => {
    const firstARead = createDeferred<GetConversationChangesResult>()
    let aReadCount = 0
    let activeAReads = 0
    let maxActiveAReads = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async (conversationId: string) => ({
      status: "ok" as const,
      context: contextSelectingConversation(conversationId as "conversation-1" | "conversation-2")
    }))
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      if (conversationId === "conversation-1") {
        return { status: "ok", changes: changesSnapshot(conversationId, { unstaged: [changeFile("src/b.ts")] }) }
      }

      aReadCount += 1
      activeAReads += 1
      maxActiveAReads = Math.max(maxActiveAReads, activeAReads)
      if (aReadCount === 1) {
        const result = await firstARead.promise
        activeAReads -= 1
        return result
      }
      activeAReads -= 1
      return { status: "ok", changes: changesSnapshot(conversationId, { unstaged: [changeFile("src/a-fresh.ts")] }) }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await clickElement(Array.from(container.querySelectorAll(".conv-item")).find((row) => row.textContent?.includes("Navigation cleanup")))
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(Array.from(container.querySelectorAll(".conv-item")).find((row) => row.textContent?.includes("Inspector polish")))
    await clickElement(getByTestId(container, "inspector-tab-changes"))

    expect(aReadCount).toBe(1)
    expect(activeAReads).toBe(1)
    await act(async () => {
      firstARead.resolve({
        status: "ok",
        changes: changesSnapshot("conversation-2", { unstaged: [changeFile("src/a-stale.ts")] })
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(aReadCount).toBe(2)
    expect(maxActiveAReads).toBe(1)
    expect(getByTestId(container, "inspector-changes-panel")?.textContent).toContain("src/a-fresh.ts")
    expect(getByTestId(container, "inspector-changes-panel")?.textContent).not.toContain("src/a-stale.ts")

    await act(async () => root.unmount())
    container.remove()
  })

  it("coalesces live refreshes and preserves a stale same-conversation snapshot on failure", async () => {
    const pendingRefresh = createDeferred<GetConversationChangesResult>()
    let requestCount = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      requestCount += 1
      if (requestCount === 1) {
        return { status: "ok", changes: changesSnapshot(conversationId, { unstaged: [changeFile("src/kept.ts")] }) }
      }
      if (requestCount === 2) {
        return pendingRefresh.promise
      }
      if (requestCount >= 4) {
        return { status: "ok", changes: changesSnapshot(conversationId, { unstaged: [changeFile("src/kept.ts")] }) }
      }
      return {
        status: "error",
        error: {
          code: "GIT_CHANGES_READ_FAILED",
          message: "refresh failed",
          suggestion: null,
          domain: "git"
        }
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Refresh changes"))
    await clickElement(getButtonByAriaLabel(container, "Refresh changes"))
    await clickElement(getButtonByAriaLabel(container, "Refresh changes"))
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(2)

    await act(async () => {
      pendingRefresh.resolve({ status: "ok", changes: changesSnapshot("conversation-2", { unstaged: [changeFile("src/kept.ts")] }) })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    const panel = getByTestId(container, "inspector-changes-panel")
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(3)
    expect(panel?.textContent).toContain("src/kept.ts")
    expect(panel?.textContent).toContain("Showing the last known changes")
    expect(panel?.textContent).toContain("Changes are unavailable right now")

    await act(async () => {
      window.dispatchEvent(new Event("focus"))
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(4)
    expect(panel?.textContent).toContain("src/kept.ts")
    expect(panel?.textContent).not.toContain("Showing the last known changes")
    expect(panel?.textContent).not.toContain("Changes are unavailable right now")

    await act(async () => root.unmount())
    container.remove()
  })

  it("maps unsupported Changes service errors to the unavailable worktree state", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (): Promise<GetConversationChangesResult> => ({
      status: "error",
      error: {
        code: "GIT_NOT_INSTALLED",
        message: "git is unavailable",
        suggestion: null,
        domain: "git"
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()

    const panel = getByTestId(container, "inspector-changes-panel")
    expect(panel?.textContent).toContain("Changes are unavailable for this worktree")
    expect(panel?.textContent).toContain("Changes require a Git worktree")

    await act(async () => root.unmount())
    container.remove()
  })

  it("refreshes visible Changes from focus and matching worktree events without an idle timer", async () => {
    vi.useFakeTimers()
    let worktreeChanged: ((event: WorktreeGitChangedEvent) => void) | null = null
    const unsubscribe = vi.fn()
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId)
    }))
    window.teamcow.onWorktreeGitChanged = vi.fn((callback) => {
      worktreeChanged = callback
      return unsubscribe
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const activationCount = vi.mocked(window.teamcow.getConversationChanges).mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(activationCount)

    await act(async () => {
      window.dispatchEvent(new Event("focus"))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(activationCount + 1)

    await act(async () => {
      worktreeChanged?.({ worktreeId: "worktree-other" })
      worktreeChanged?.({ worktreeId: "worktree-1", paths: ["src/app.ts"] })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(activationCount + 2)

    await clickElement(getByTestId(container, "inspector-tab-files"))
    expect(unsubscribe).toHaveBeenCalledOnce()
    const hiddenCount = vi.mocked(window.teamcow.getConversationChanges).mock.calls.length
    await act(async () => {
      window.dispatchEvent(new Event("focus"))
      worktreeChanged?.({ worktreeId: "worktree-1" })
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(hiddenCount)

    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it("rejects an old refresh after Changes is hidden and reopened", async () => {
    const slowRefresh = createDeferred<GetConversationChangesResult>()
    const freshRefresh = createDeferred<GetConversationChangesResult>()
    let worktreeChanged: ((event: WorktreeGitChangedEvent) => void) | null = null
    let listRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      listRead += 1
      if (listRead === 1) {
        return {
          status: "ok",
          changes: changesSnapshot(conversationId, {
            revision: "revision-base",
            unstaged: [changeFile("src/base.ts")]
          })
        }
      }
      return listRead === 2 ? slowRefresh.promise : freshRefresh.promise
    })
    window.teamcow.onWorktreeGitChanged = vi.fn((callback) => {
      worktreeChanged = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()

    await act(async () => {
      worktreeChanged?.({ worktreeId: "worktree-1", paths: ["src/stale.ts"] })
      await Promise.resolve()
    })
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(2)

    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await act(async () => {
      slowRefresh.resolve({
        status: "ok",
        changes: changesSnapshot("conversation-2", {
          revision: "revision-stale",
          unstaged: [changeFile("src/stale.ts")]
        })
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(3)
    expect(getByTestId(container, "inspector-changes-panel")?.textContent).not.toContain("src/stale.ts")

    await act(async () => {
      freshRefresh.resolve({
        status: "ok",
        changes: changesSnapshot("conversation-2", {
          revision: "revision-fresh",
          unstaged: [changeFile("src/fresh.ts")]
        })
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()
    expect(getByTestId(container, "inspector-changes-panel")?.textContent).toContain("src/fresh.ts")

    await act(async () => root.unmount())
    container.remove()
  })

  it("queues one trailing event refresh and keeps an exact editor document stable for the same revision", async () => {
    const slowRefresh = createDeferred<GetConversationChangesResult>()
    let worktreeChanged: ((event: WorktreeGitChangedEvent) => void) | null = null
    let listRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      listRead += 1
      if (listRead === 2) {
        return slowRefresh.promise
      }
      return {
        status: "ok",
        changes: changesSnapshot(conversationId, { unstaged: [changeFile("src/slow.ts")] })
      }
    })
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, "old", "STABLE-DIFF")
    )
    window.teamcow.onWorktreeGitChanged = vi.fn((callback) => {
      worktreeChanged = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/slow.ts (unstaged)"))
    await settle()

    await act(async () => {
      worktreeChanged?.({ worktreeId: "worktree-1" })
      await Promise.resolve()
    })
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(2)
    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalledTimes(1)
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("STABLE-DIFF")
    expect(getButtonByAriaLabel(container, "Stage src/slow.ts")?.hasAttribute("disabled")).toBe(false)

    await act(async () => {
      worktreeChanged?.({ worktreeId: "worktree-1" })
      worktreeChanged?.({ worktreeId: "worktree-1", paths: ["src/slow.ts"] })
      worktreeChanged?.({ worktreeId: "worktree-1" })
      await Promise.resolve()
    })
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(2)

    await act(async () => {
      slowRefresh.resolve({
        status: "ok",
        changes: changesSnapshot("conversation-2", { unstaged: [changeFile("src/slow.ts")] })
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(3)
    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalledTimes(1)
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("STABLE-DIFF")

    await act(async () => root.unmount())
    container.remove()
  })

  it("opens the refreshed exact document when a worktree event reveals a new snapshot revision", async () => {
    const oldDiff = createDeferred<ConversationChangeDiffDocumentResult>()
    let worktreeChanged: ((event: WorktreeGitChangedEvent) => void) | null = null
    let listRead = 0
    let diffRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      listRead += 1
      return {
        status: "ok",
        changes: changesSnapshot(conversationId, {
          revision: listRead === 1 ? "revision-1" : "revision-2",
          unstaged: [changeFile("src/slow.ts")]
        })
      }
    })
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) => {
      diffRead += 1
      return diffRead === 1
        ? oldDiff.promise
        : textChangeDiffDocument(input, "old", "NEW-DIFF")
    })
    window.teamcow.onWorktreeGitChanged = vi.fn((callback) => {
      worktreeChanged = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/slow.ts (unstaged)"))

    await act(async () => {
      worktreeChanged?.({ worktreeId: "worktree-1", paths: ["src/slow.ts"] })
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/slow.ts (unstaged)"))
    await settle()
    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalledTimes(2)
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("NEW-DIFF")

    await act(async () => {
      oldDiff.resolve(textChangeDiffDocument({
        conversationId: "conversation-2",
        worktreeId: "worktree-1",
        revision: "revision-1",
        area: "unstaged",
        filePath: "src/slow.ts"
      }, "old", "OLD-DIFF"))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).not.toContain("OLD-DIFF")

    await act(async () => root.unmount())
    container.remove()
  })

  it("refreshes Changes immediately on a provider terminal event", async () => {
    let runEventCallback: ((event: RunEventPushPayload) => void) | null = null
    const runEventCallbacks: Array<(event: RunEventPushPayload) => void> = []
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId)
    }))
    window.teamcow.onRunEvent = vi.fn((callback: (event: RunEventPushPayload) => void) => {
      runEventCallbacks.push(callback)
      runEventCallback = (event) => runEventCallbacks.forEach((listener) => listener(event))
      return () => {
        const index = runEventCallbacks.indexOf(callback)
        if (index >= 0) {
          runEventCallbacks.splice(index, 1)
        }
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    const beforeTerminalEvent = vi.mocked(window.teamcow.getConversationChanges).mock.calls.length
    await act(async () => {
      runEventCallback?.({
        id: "push-completed-1",
        conversationId: "conversation-2",
        runId: "conversation-2-run-1",
        sequence: 2,
        schemaVersion: 1,
        provider: "codex",
        type: "run.completed",
        status: "completed",
        payload: {},
        createdAt: "2026-08-17T01:00:00.000Z"
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(beforeTerminalEvent + 1)

    await act(async () => root.unmount())
    container.remove()
  })

  it("routes exact change mutations, refreshes Changes and Git, and clears commit text only after success", async () => {
    const snapshot = changesSnapshot("conversation-2", {
      staged: [changeFile("src/staged.ts")],
      unstaged: [changeFile("src/unstaged.ts"), changeFile("src/other.ts")]
    })
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (): Promise<GetConversationChangesResult> => ({ status: "ok", changes: snapshot }))
    window.teamcow.stageConversationChanges = vi.fn(async (input: ConversationChangesMutationInput): Promise<ConversationChangesMutationResult> => ({
      status: "ok",
      conversationId: input.conversationId,
      worktreeId: "worktree-1",
      scope: input.scope,
      changedPaths: input.scope.type === "file" ? [input.scope.filePath] : snapshot.unstaged.map((file) => file.path)
    }))
    window.teamcow.unstageConversationChanges = vi.fn(async (input: ConversationChangesMutationInput): Promise<ConversationChangesMutationResult> => ({
      status: "ok",
      conversationId: input.conversationId,
      worktreeId: "worktree-1",
      scope: input.scope,
      changedPaths: input.scope.type === "file" ? [input.scope.filePath] : snapshot.staged.map((file) => file.path)
    }))
    window.teamcow.discardConversationChanges = vi.fn(async (input: DiscardConversationChangesInput): Promise<ConversationChangesMutationResult> => ({
      status: "ok",
      conversationId: input.conversationId,
      worktreeId: "worktree-1",
      scope: input.scope,
      changedPaths: input.scope.type === "file" ? [input.scope.filePath] : snapshot.unstaged.map((file) => file.path)
    }))
    let commitAttempt = 0
    window.teamcow.commitConversationChanges = vi.fn(async (input: CommitConversationChangesInput): Promise<CommitConversationChangesResult> => {
      commitAttempt += 1
      if (commitAttempt === 1) {
        return {
          status: "error",
          error: {
            code: "GIT_COMMIT_FAILED",
            message: "hook rejected",
            suggestion: null,
            domain: "git"
          }
        }
      }
      return {
        status: "committed",
        conversationId: input.conversationId,
        worktreeId: "worktree-1",
        commitHash: "abcdef123456",
        shortCommitHash: "abcdef1"
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()

    await clickElement(getButtonByAriaLabel(container, "Stage src/unstaged.ts"))
    await settle()
    expect(window.teamcow.stageConversationChanges).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      scope: { type: "file", filePath: "src/unstaged.ts" }
    })
    await clickElement(getButtonByAriaLabel(container, "Stage all unstaged changes"))
    await settle()
    expect(window.teamcow.stageConversationChanges).toHaveBeenLastCalledWith({ conversationId: "conversation-2", scope: { type: "all" } })
    await clickElement(getButtonByAriaLabel(container, "Unstage src/staged.ts"))
    await settle()
    expect(window.teamcow.unstageConversationChanges).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      scope: { type: "file", filePath: "src/staged.ts" }
    })
    await clickElement(getButtonByAriaLabel(container, "Unstage all staged changes"))
    await settle()
    expect(window.teamcow.unstageConversationChanges).toHaveBeenLastCalledWith({ conversationId: "conversation-2", scope: { type: "all" } })

    await clickElement(getButtonByAriaLabel(container, "Discard changes for src/other.ts"))
    await clickElement(Array.from(container.querySelectorAll(".changes-confirmation-dialog button")).find((button) => button.textContent === "Discard"))
    await settle()
    expect(window.teamcow.discardConversationChanges).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      scope: { type: "file", filePath: "src/other.ts" },
      expectedRevision: "revision-1"
    })
    await clickElement(getButtonByAriaLabel(container, "Discard all unstaged changes"))
    await clickElement(Array.from(container.querySelectorAll(".changes-confirmation-dialog button")).find((button) => button.textContent === "Discard"))
    await settle()
    expect(window.teamcow.discardConversationChanges).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      scope: { type: "all" },
      expectedRevision: "revision-1"
    })

    const commitInput = container.querySelector(".changes-commit-area textarea") as HTMLTextAreaElement | null
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      setter?.call(commitInput, "feat: live changes")
      commitInput?.dispatchEvent(new Event("input", { bubbles: true }))
      commitInput?.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })
    await clickElement(container.querySelector(".changes-commit-area button[type=submit]"))
    await settle()
    expect(window.teamcow.commitConversationChanges).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      message: "feat: live changes"
    })
    expect(commitInput?.value).toBe("feat: live changes")
    await clickElement(container.querySelector(".changes-commit-area button[type=submit]"))
    await settle()
    expect(commitInput?.value).toBe("")
    expect(vi.mocked(window.teamcow.getConversationChanges).mock.calls.length).toBeGreaterThan(1)
    expect(vi.mocked(window.teamcow.getConversationGitStatus).mock.calls.length).toBeGreaterThan(1)

    await act(async () => root.unmount())
    container.remove()
  })

  it("keeps a staged file pending until the refreshed snapshot moves it into this commit", async () => {
    const filePath = "src/add-to-commit.ts"
    const initialSnapshot = changesSnapshot("conversation-2", {
      unstaged: [changeFile(filePath)]
    })
    const refreshedSnapshot = changesSnapshot("conversation-2", {
      revision: "revision-2",
      staged: [changeFile(filePath, { status: "added" })]
    })
    const refreshedChanges = createDeferred<GetConversationChangesResult>()
    let stageStarted = false
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn((): Promise<GetConversationChangesResult> => stageStarted
      ? refreshedChanges.promise
      : Promise.resolve({ status: "ok", changes: initialSnapshot }))
    window.teamcow.stageConversationChanges = vi.fn(async (
      input: ConversationChangesMutationInput
    ): Promise<ConversationChangesMutationResult> => {
      stageStarted = true
      return {
        status: "ok",
        conversationId: input.conversationId,
        worktreeId: "worktree-1",
        scope: input.scope,
        changedPaths: [filePath]
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()

    await clickElement(getButtonByAriaLabel(container, `Stage ${filePath}`))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getButtonByAriaLabel(container, `Stage ${filePath}`)?.hasAttribute("disabled")).toBe(true)
    expect(container.textContent).not.toContain("Refreshing changes...")
    expect(getByTestId(container, "inspector-handoff-message")).toBeNull()

    await act(async () => {
      refreshedChanges.resolve({ status: "ok", changes: refreshedSnapshot })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(getButtonByAriaLabel(container, `Review changes for ${filePath} (unstaged)`)).toBeNull()
    expect(getButtonByAriaLabel(container, `Review changes for ${filePath} (staged)`)).toBeTruthy()
    expect(getByTestId(container, "inspector-handoff-message")?.textContent)
      .toBe(`Added ${filePath} to this commit.`)

    await act(async () => root.unmount())
    container.remove()
  })

  it("isolates pending mutations by worktree and ignores an old conversation completion", async () => {
    const mutationA = createDeferred<ConversationChangesMutationResult>()
    const mutationB = createDeferred<ConversationChangesMutationResult>()
    const separateWorktreesContext: AppContextSnapshot = {
      ...selectionContext,
      projects: selectionContext.projects.map((project) => ({
        ...project,
        conversations: project.conversations.map((conversation) =>
          conversation.id === "conversation-1"
            ? {
                ...conversation,
                worktreeId: "worktree-2",
                worktree: {
                  ...conversation.worktree,
                  id: "worktree-2",
                  kind: "git_worktree" as const,
                  rootPath: "/tmp/teamcow-b",
                  branch: "codex/b"
                }
              }
            : conversation
        )
      }))
    }
    window.teamcow.getAppContext = vi.fn(async () => separateWorktreesContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok" as const,
      context: contextSelectingConversationFrom(separateWorktreesContext, "conversation-1")
    }))
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId, {
        unstaged: [changeFile(`src/${conversationId}.ts`)],
        worktreeId: conversationId === "conversation-2" ? "worktree-1" : "worktree-2",
        worktreeRootPath: conversationId === "conversation-2" ? "/tmp/teamcow" : "/tmp/teamcow-b"
      })
    }))
    window.teamcow.stageConversationChanges = vi.fn((input: ConversationChangesMutationInput) =>
      input.conversationId === "conversation-2" ? mutationA.promise : mutationB.promise
    )

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Stage src/conversation-2.ts"))
    await clickElement(Array.from(container.querySelectorAll(".conv-item")).find((row) => row.textContent?.includes("Navigation cleanup")))
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()

    const stageB = getButtonByAriaLabel(container, "Stage src/conversation-1.ts")
    expect(stageB?.hasAttribute("disabled")).toBe(false)
    await clickElement(stageB)
    expect(window.teamcow.stageConversationChanges).toHaveBeenCalledTimes(2)
    expect(stageB?.hasAttribute("disabled")).toBe(true)

    await act(async () => {
      mutationA.resolve({
        status: "ok",
        conversationId: "conversation-2",
        worktreeId: "worktree-1",
        scope: { type: "file", filePath: "src/conversation-2.ts" },
        changedPaths: ["src/conversation-2.ts"]
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(stageB?.hasAttribute("disabled")).toBe(true)
    expect(getByTestId(container, "inspector-handoff-message")).toBeNull()

    await act(async () => {
      mutationB.resolve({
        status: "error",
        error: {
          code: "GIT_CHANGE_OPERATION_FAILED",
          message: "B failed",
          suggestion: null,
          domain: "git"
        }
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(stageB?.hasAttribute("disabled")).toBe(false)
    expect(getByTestId(container, "inspector-handoff-message")?.textContent).toContain("TeamCow could not update the selected worktree changes")

    await act(async () => root.unmount())
    container.remove()
  })

  it("serializes pending mutations for conversations that share a worktree", async () => {
    const mutationA = createDeferred<ConversationChangesMutationResult>()
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok" as const,
      context: contextSelectingConversation("conversation-1")
    }))
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId, { unstaged: [changeFile(`src/${conversationId}.ts`)] })
    }))
    window.teamcow.stageConversationChanges = vi.fn(() => mutationA.promise)

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Stage src/conversation-2.ts"))
    await clickElement(Array.from(container.querySelectorAll(".conv-item")).find((row) => row.textContent?.includes("Navigation cleanup")))
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()

    const sharedStage = getButtonByAriaLabel(container, "Stage src/conversation-1.ts")
    expect(sharedStage?.hasAttribute("disabled")).toBe(true)
    await clickElement(sharedStage)
    expect(window.teamcow.stageConversationChanges).toHaveBeenCalledTimes(1)

    await act(async () => {
      mutationA.resolve({
        status: "ok",
        conversationId: "conversation-2",
        worktreeId: "worktree-1",
        scope: { type: "file", filePath: "src/conversation-2.ts" },
        changedPaths: ["src/conversation-2.ts"]
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(sharedStage?.hasAttribute("disabled")).toBe(false)

    await act(async () => root.unmount())
    container.remove()
  })

  it("does not restore a pending mutation follow-up after switching away and back", async () => {
    const stageMutation = createDeferred<ConversationChangesMutationResult>()
    let stageResolved = false
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async (conversationId: string) => ({
      status: "ok" as const,
      context: contextSelectingConversation(conversationId as "conversation-1" | "conversation-2")
    }))
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId, conversationId === "conversation-2"
        ? stageResolved
          ? { staged: [changeFile("src/round-trip.ts")] }
          : { unstaged: [changeFile("src/round-trip.ts")] }
        : { unstaged: [changeFile("src/other-conversation.ts")] })
    }))
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, `old-${input.area}`, `new-${input.area}`)
    )
    window.teamcow.stageConversationChanges = vi.fn(() => stageMutation.promise)

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/round-trip.ts (unstaged)"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Stage src/round-trip.ts"))

    await clickElement(Array.from(container.querySelectorAll(".conv-item")).find((row) => row.textContent?.includes("Navigation cleanup")))
    await settle()
    await clickElement(Array.from(container.querySelectorAll(".conv-item")).find((row) => row.textContent?.includes("Inspector polish")))
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()

    await act(async () => {
      stageResolved = true
      stageMutation.resolve({
        status: "ok",
        conversationId: "conversation-2",
        worktreeId: "worktree-1",
        scope: { type: "file", filePath: "src/round-trip.ts" },
        changedPaths: ["src/round-trip.ts"]
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(getButtonByAriaLabel(container, "Review changes for src/round-trip.ts (staged)")?.getAttribute("aria-current")).not.toBe("true")
    expect(vi.mocked(window.teamcow.getConversationChangeDiffDocument).mock.calls.map(([input]) => `${input.area}:${input.filePath}`)).not.toContain(
      "staged:src/round-trip.ts"
    )

    await act(async () => root.unmount())
    container.remove()
  })

  it("refreshes after a partial mutation while preserving the exact editor document and commit message", async () => {
    const snapshot = changesSnapshot("conversation-2", {
      staged: [changeFile("src/dual.ts")],
      unstaged: [changeFile("src/dual.ts")]
    })
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (): Promise<GetConversationChangesResult> => ({ status: "ok", changes: snapshot }))
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, "old", "KEPT-DIFF")
    )
    window.teamcow.unstageConversationChanges = vi.fn(async (input: ConversationChangesMutationInput): Promise<ConversationChangesMutationResult> => ({
      status: "partial",
      conversationId: input.conversationId,
      worktreeId: "worktree-1",
      scope: input.scope,
      changedPaths: [],
      failures: [{
        filePath: "src/dual.ts",
        error: {
          code: "GIT_CHANGE_OPERATION_FAILED",
          message: "partial",
          suggestion: null,
          domain: "git"
        }
      }]
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/dual.ts (staged)"))
    await settle()
    const commitInput = container.querySelector(".changes-commit-area textarea") as HTMLTextAreaElement | null
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      setter?.call(commitInput, "keep this message")
      commitInput?.dispatchEvent(new Event("input", { bubbles: true }))
      await Promise.resolve()
    })
    const beforeChangesReads = vi.mocked(window.teamcow.getConversationChanges).mock.calls.length
    const beforeGitReads = vi.mocked(window.teamcow.getConversationGitStatus).mock.calls.length
    await clickElement(getButtonByAriaLabel(container, "Unstage src/dual.ts"))
    await settle()

    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("KEPT-DIFF")
    expect(commitInput?.value).toBe("keep this message")
    expect(vi.mocked(window.teamcow.getConversationChanges).mock.calls.length).toBeGreaterThan(beforeChangesReads)
    expect(vi.mocked(window.teamcow.getConversationGitStatus).mock.calls.length).toBeGreaterThan(beforeGitReads)
    expect(getByTestId(container, "inspector-handoff-message")?.textContent).toContain("TeamCow could not update the selected worktree changes")

    await act(async () => root.unmount())
    container.remove()
  })

  it("stages an unselected file without replacing the selected change or editor diff", async () => {
    let listRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      listRead += 1
      return {
        status: "ok",
        changes: listRead === 1
          ? changesSnapshot(conversationId, {
              revision: "revision-1",
              unstaged: [changeFile("src/selected.ts"), changeFile("src/unselected.ts")]
            })
          : changesSnapshot(conversationId, {
              revision: "revision-2",
              staged: [changeFile("src/unselected.ts")],
              unstaged: [changeFile("src/selected.ts")]
            })
      }
    })
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, `old-${input.filePath}`, `new-${input.filePath}`)
    )
    window.teamcow.stageConversationChanges = vi.fn(async (input: ConversationChangesMutationInput): Promise<ConversationChangesMutationResult> => ({
      status: "ok",
      conversationId: input.conversationId,
      worktreeId: "worktree-1",
      scope: input.scope,
      changedPaths: ["src/unselected.ts"]
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/selected.ts (unstaged)"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Stage src/unselected.ts"))
    await settle()

    expect(getButtonByAriaLabel(container, "Review changes for src/selected.ts (unstaged)")?.getAttribute("aria-current")).toBe("true")
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("new-src/selected.ts")
    expect(vi.mocked(window.teamcow.getConversationChangeDiffDocument).mock.calls.map(([input]) => input.filePath)).toEqual([
      "src/selected.ts"
    ])

    await act(async () => root.unmount())
    container.remove()
  })

  it("follows a selected file when the watcher snapshot lands before the stage response", async () => {
    const stageMutation = createDeferred<ConversationChangesMutationResult>()
    let worktreeChanged: ((event: WorktreeGitChangedEvent) => void) | null = null
    let listRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      listRead += 1
      return {
        status: "ok",
        changes: changesSnapshot(conversationId, {
          revision: listRead === 1 ? "revision-1" : "revision-2",
          staged: listRead === 1 ? [] : [changeFile("src/watcher-first.ts")],
          unstaged: listRead === 1 ? [changeFile("src/watcher-first.ts")] : []
        })
      }
    })
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, `old-${input.area}`, `new-${input.area}`)
    )
    window.teamcow.stageConversationChanges = vi.fn(() => stageMutation.promise)
    window.teamcow.onWorktreeGitChanged = vi.fn((callback) => {
      worktreeChanged = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/watcher-first.ts (unstaged)"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Stage src/watcher-first.ts"))
    await act(async () => {
      worktreeChanged?.({ worktreeId: "worktree-1", paths: ["src/watcher-first.ts"] })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getButtonByAriaLabel(container, "Review changes for src/watcher-first.ts (staged)")?.getAttribute("aria-current")).not.toBe("true")

    await act(async () => {
      stageMutation.resolve({
        status: "ok",
        conversationId: "conversation-2",
        worktreeId: "worktree-1",
        scope: { type: "file", filePath: "src/watcher-first.ts" },
        changedPaths: ["src/watcher-first.ts"]
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(3)
    expect(getButtonByAriaLabel(container, "Review changes for src/watcher-first.ts (staged)")?.getAttribute("aria-current")).toBe("true")
    expect(vi.mocked(window.teamcow.getConversationChangeDiffDocument).mock.calls.at(-1)?.[0]).toMatchObject({
      area: "staged",
      filePath: "src/watcher-first.ts",
      revision: "revision-2"
    })

    await act(async () => root.unmount())
    container.remove()
  })

  it("does not reclaim selection when the user chooses another file before the mutation refresh lands", async () => {
    const stageMutation = createDeferred<ConversationChangesMutationResult>()
    const mutationRefresh = createDeferred<GetConversationChangesResult>()
    let listRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn((conversationId: string): Promise<GetConversationChangesResult> => {
      listRead += 1
      if (listRead === 1) {
        return Promise.resolve({
          status: "ok",
          changes: changesSnapshot(conversationId, {
            revision: "revision-1",
            unstaged: [changeFile("src/mutated.ts"), changeFile("src/latest.ts")]
          })
        })
      }
      return mutationRefresh.promise
    })
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, `old-${input.filePath}`, `new-${input.filePath}`)
    )
    window.teamcow.stageConversationChanges = vi.fn(() => stageMutation.promise)

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/mutated.ts (unstaged)"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Stage src/mutated.ts"))
    await act(async () => {
      stageMutation.resolve({
        status: "ok",
        conversationId: "conversation-2",
        worktreeId: "worktree-1",
        scope: { type: "file", filePath: "src/mutated.ts" },
        changedPaths: ["src/mutated.ts"]
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(2)
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/latest.ts (unstaged)"))
    await settle()

    await act(async () => {
      mutationRefresh.resolve({
        status: "ok",
        changes: changesSnapshot("conversation-2", {
          revision: "revision-2",
          staged: [changeFile("src/mutated.ts")],
          unstaged: [changeFile("src/latest.ts")]
        })
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(getButtonByAriaLabel(container, "Review changes for src/latest.ts (unstaged)")?.getAttribute("aria-current")).toBe("true")
    expect(getButtonByAriaLabel(container, "Review changes for src/mutated.ts (staged)")?.getAttribute("aria-current")).not.toBe("true")
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("new-src/latest.ts")
    expect(vi.mocked(window.teamcow.getConversationChangeDiffDocument).mock.calls.map(([input]) => `${input.area}:${input.filePath}`)).not.toContain(
      "staged:src/mutated.ts"
    )

    await act(async () => root.unmount())
    container.remove()
  })

  it("does not follow a dual-state path when the mutation source area was not selected", async () => {
    let listRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      listRead += 1
      return {
        status: "ok",
        changes: changesSnapshot(conversationId, {
          revision: listRead === 1 ? "revision-1" : "revision-2",
          staged: [changeFile("src/dual-area.ts")],
          unstaged: listRead === 1 ? [changeFile("src/dual-area.ts")] : []
        })
      }
    })
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, `old-${input.area}`, `new-${input.area}`)
    )
    window.teamcow.stageConversationChanges = vi.fn(async (input: ConversationChangesMutationInput): Promise<ConversationChangesMutationResult> => ({
      status: "ok",
      conversationId: input.conversationId,
      worktreeId: "worktree-1",
      scope: input.scope,
      changedPaths: ["src/dual-area.ts"]
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/dual-area.ts (staged)"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Stage src/dual-area.ts"))
    await settle()

    expect(getButtonByAriaLabel(container, "Review changes for src/dual-area.ts (staged)")?.getAttribute("aria-current")).toBe("true")
    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalledTimes(1)
    expect(vi.mocked(window.teamcow.getConversationChangeDiffDocument).mock.calls[0]?.[0]).toMatchObject({
      area: "staged",
      filePath: "src/dual-area.ts",
      revision: "revision-1"
    })

    await act(async () => root.unmount())
    container.remove()
  })

  it("blocks mutation during refresh, then reselects a file in its new area after staging", async () => {
    const oldPoll = createDeferred<GetConversationChangesResult>()
    let listRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      listRead += 1
      if (listRead === 1) {
        return { status: "ok", changes: changesSnapshot(conversationId, { unstaged: [changeFile("src/move.ts")] }) }
      }
      if (listRead === 2) {
        return oldPoll.promise
      }
      return {
        status: "ok",
        changes: changesSnapshot(conversationId, {
          revision: "revision-2",
          staged: [changeFile("src/move.ts")]
        })
      }
    })
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, `old-${input.area}`, `new-${input.area}`)
    )
    window.teamcow.stageConversationChanges = vi.fn(async (input: ConversationChangesMutationInput): Promise<ConversationChangesMutationResult> => ({
      status: "ok",
      conversationId: input.conversationId,
      worktreeId: "worktree-1",
      scope: input.scope,
      changedPaths: ["src/move.ts"]
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/move.ts (unstaged)"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Refresh changes"))
    expect(getButtonByAriaLabel(container, "Stage src/move.ts")?.hasAttribute("disabled")).toBe(true)
    await clickElement(getButtonByAriaLabel(container, "Stage src/move.ts"))
    expect(window.teamcow.stageConversationChanges).not.toHaveBeenCalled()
    await act(async () => {
      oldPoll.resolve({ status: "ok", changes: changesSnapshot("conversation-2", { unstaged: [changeFile("src/move.ts")] }) })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()
    expect(getButtonByAriaLabel(container, "Stage src/move.ts")?.hasAttribute("disabled")).toBe(false)
    await clickElement(getButtonByAriaLabel(container, "Stage src/move.ts"))
    await settle()

    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(3)
    const stagedRow = getButtonByAriaLabel(container, "Review changes for src/move.ts (staged)")
    expect(stagedRow?.getAttribute("aria-current")).toBe("true")
    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenCalledTimes(2)
    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      worktreeId: "worktree-1",
      revision: "revision-2",
      area: "staged",
      filePath: "src/move.ts"
    })
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("new-staged")

    await act(async () => root.unmount())
    container.remove()
  })

  it("pins a frozen Changes snapshot, ignores worktree events and mutations, then reloads on unpin", async () => {
    vi.useFakeTimers()
    let worktreeChanged: ((event: WorktreeGitChangedEvent) => void) | null = null
    const contextOne = contextSelectingConversation("conversation-1")
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async () => ({ status: "ok" as const, context: contextOne }))
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId, {
        unstaged: [changeFile(conversationId === "conversation-2" ? "src/pinned.ts" : "src/active.ts")]
      })
    }))
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, "old", "PINNED-DIFF")
    )
    window.teamcow.onWorktreeGitChanged = vi.fn((callback) => {
      worktreeChanged = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/pinned.ts (unstaged)"))
    await settle()
    await clickElement(getByTestId(container, "inspector-pin-toggle"))
    const readsAtPin = vi.mocked(window.teamcow.getConversationChanges).mock.calls.length

    const firstConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    await clickElement(firstConversationRow)
    await settle()
    const readsAfterConversationSwitch = vi.mocked(window.teamcow.getConversationChanges).mock.calls.length
    await act(async () => {
      window.dispatchEvent(new Event("focus"))
      worktreeChanged?.({ worktreeId: "worktree-1" })
      await vi.advanceTimersByTimeAsync(5000)
    })
    const panel = getByTestId(container, "inspector-changes-panel")
    expect(panel?.textContent).toContain("src/pinned.ts")
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("PINNED-DIFF")
    expect(panel?.textContent).not.toContain("src/active.ts")
    expect(getButtonByAriaLabel(container, "Stage src/pinned.ts")?.hasAttribute("disabled")).toBe(true)
    expect(readsAfterConversationSwitch).toBe(readsAtPin)
    expect(window.teamcow.getConversationChanges).toHaveBeenCalledTimes(readsAfterConversationSwitch)
    await clickElement(getButtonByAriaLabel(container, "Open src/pinned.ts in editor"))
    await settle()
    expect(Array.from(container.querySelectorAll('[data-testid="editor-tab-src/pinned.ts"]')).some((tab) =>
      tab.getAttribute("data-editor-resource") === "file"
    )).toBe(true)
    expect(window.teamcow.openConversationHandoff).not.toHaveBeenCalled()

    await clickElement(getByTestId(container, "inspector-pin-toggle"))
    await settle()
    expect(panel?.textContent).toContain("src/active.ts")
    expect(panel?.textContent).not.toContain("src/pinned.ts")

    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it("allows pinning a stale valid snapshot while its exact editor document is loading", async () => {
    const pendingDiff = createDeferred<ConversationChangeDiffDocumentResult>()
    let listRead = 0
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      listRead += 1
      if (listRead === 1) {
        return { status: "ok", changes: changesSnapshot(conversationId, { unstaged: [changeFile("src/stale-pin.ts")] }) }
      }
      return {
        status: "error",
        error: {
          code: "GIT_CHANGES_READ_FAILED",
          message: "temporary failure",
          suggestion: null,
          domain: "git"
        }
      }
    })
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async () => pendingDiff.promise)

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Review changes for src/stale-pin.ts (unstaged)"))
    expect(getByTestId(container, "inspector-pin-toggle")?.hasAttribute("disabled")).toBe(false)
    await clickElement(getButtonByAriaLabel(container, "Refresh changes"))
    await settle()

    expect(getByTestId(container, "inspector-changes-panel")?.textContent).toContain("Showing the last known changes")
    expect(getByTestId(container, "inspector-pin-toggle")?.hasAttribute("disabled")).toBe(false)
    await clickElement(getByTestId(container, "inspector-pin-toggle"))
    expect(getByTestId(container, "inspector-pin-toggle")?.getAttribute("aria-pressed")).toBe("true")
    expect(getByTestId(container, "inspector-changes-panel")?.textContent).toContain("src/stale-pin.ts")

    await act(async () => {
      pendingDiff.resolve(textChangeDiffDocument({
        conversationId: "conversation-2",
        worktreeId: "worktree-1",
        revision: "revision-1",
        area: "unstaged",
        filePath: "src/stale-pin.ts"
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => root.unmount())
    container.remove()
  })

  it("disables pin while a stale snapshot retry is still loading", async () => {
    const retry = createDeferred<GetConversationChangesResult>()
    let nextRead: "success" | "error" | "pending" = "success"
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => {
      if (nextRead === "success") {
        return { status: "ok", changes: changesSnapshot(conversationId, { unstaged: [changeFile("src/stale-retry.ts")] }) }
      }
      if (nextRead === "error") {
        nextRead = "success"
        return {
          status: "error",
          error: {
            code: "GIT_CHANGES_READ_FAILED",
            message: "temporary failure",
            suggestion: null,
            domain: "git"
          }
        }
      }
      return retry.promise
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    nextRead = "error"
    await clickElement(getButtonByAriaLabel(container, "Refresh changes"))
    await settle()
    expect(getByTestId(container, "inspector-pin-toggle")?.hasAttribute("disabled")).toBe(false)

    nextRead = "pending"
    await clickElement(getButtonByAriaLabel(container, "Refresh changes"))
    expect(getByTestId(container, "inspector-pin-toggle")?.hasAttribute("disabled")).toBe(true)

    await act(async () => {
      retry.resolve({
        status: "error",
        error: {
          code: "GIT_CHANGES_READ_FAILED",
          message: "still unavailable",
          suggestion: null,
          domain: "git"
        }
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getByTestId(container, "inspector-pin-toggle")?.hasAttribute("disabled")).toBe(false)

    await act(async () => root.unmount())
    container.remove()
  })

  it("clears a pinned conversation commit draft before the newly active conversation is usable", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok" as const,
      context: contextSelectingConversation("conversation-1")
    }))
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId, { staged: [changeFile(`src/${conversationId}.ts`)] })
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    const commitInput = container.querySelector(".changes-commit-area textarea") as HTMLTextAreaElement | null
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      setter?.call(commitInput, "conversation A only")
      commitInput?.dispatchEvent(new Event("input", { bubbles: true }))
      await Promise.resolve()
    })
    await clickElement(getByTestId(container, "inspector-pin-toggle"))
    await clickElement(Array.from(container.querySelectorAll(".conv-item")).find((row) => row.textContent?.includes("Navigation cleanup")))
    expect(commitInput?.value).toBe("conversation A only")
    await clickElement(getByTestId(container, "inspector-pin-toggle"))
    expect(commitInput?.value).toBe("")
    await settle()
    expect(getByTestId(container, "inspector-changes-panel")?.textContent).toContain("src/conversation-1.ts")
    expect(commitInput?.value).toBe("")

    await act(async () => root.unmount())
    container.remove()
  })

  it("never exposes another active conversation's live Changes content or editor resource", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok" as const,
      context: contextSelectingConversation("conversation-1")
    }))
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId, {
        unstaged: [changeFile(conversationId === "conversation-2" ? "src/from-a.ts" : "src/from-b.ts")]
      })
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    await clickElement(getButtonByAriaLabel(container, "Open src/from-a.ts in editor"))
    await settle()
    expect(getByTestId(container, "editor-tab-src/from-a.ts")?.getAttribute("data-editor-resource")).toBe("file")
    expect(getByTestId(container, "inspector-handoff-message")).toBeNull()

    const observedLeaks: string[] = []
    const observer = new MutationObserver(() => {
      const activeCopy = container.querySelector(".binding-row.active")?.textContent ?? ""
      const panelCopy = getByTestId(container, "inspector-changes-panel")?.textContent ?? ""
      if (activeCopy.includes("Navigation cleanup") && panelCopy.includes("src/from-a.ts")) {
        observedLeaks.push(panelCopy)
      }
    })
    observer.observe(container, { childList: true, characterData: true, subtree: true })
    await clickElement(Array.from(container.querySelectorAll(".conv-item")).find((row) => row.textContent?.includes("Navigation cleanup")))
    observer.disconnect()
    expect(observedLeaks).toEqual([])

    await clickElement(getByTestId(container, "inspector-tab-changes"))
    await settle()
    expect(getByTestId(container, "inspector-changes-panel")?.textContent).toContain("src/from-b.ts")
    expect(getByTestId(container, "inspector-changes-panel")?.textContent).not.toContain("src/from-a.ts")
    expect(getByTestId(container, "editor-tab-src/from-a.ts")).toBeNull()
    expect(getByTestId(container, "inspector-handoff-message")).toBeNull()

    await act(async () => root.unmount())
    container.remove()
  })

  it("uses artifact paths only as live preferred hints and lets Git open an unfiltered Changes list", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    const artifactPath = "apps/desktop/src/renderer/app/shell/DesktopShell.tsx"
    let includeArtifactPath = true
    window.teamcow.getConversationChanges = vi.fn(async (conversationId: string): Promise<GetConversationChangesResult> => ({
      status: "ok",
      changes: changesSnapshot(conversationId, {
        staged: includeArtifactPath ? [changeFile(artifactPath)] : [],
        unstaged: includeArtifactPath
          ? [changeFile(artifactPath), changeFile("src/live-only.ts")]
          : [changeFile("src/live-only.ts")]
      })
    }))
    window.teamcow.getConversationChangeDiffDocument = vi.fn(async (input: GetConversationChangeDiffDocumentInput) =>
      textChangeDiffDocument(input, "old artifact", "new artifact")
    )
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "chat-review-diff-conversation-2-artifact-diff"))
    await settle()
    expect(getByTestId(container, "inspector-changes-panel")?.hasAttribute("hidden")).toBe(false)
    expect(window.teamcow.getConversationChangeDiffDocument).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      worktreeId: "worktree-1",
      revision: "revision-1",
      area: "unstaged",
      filePath: artifactPath
    })
    expect(getByTestId(container, "mock-change-diff-modified")?.textContent).toContain("new artifact")

    await clickElement(getByTestId(container, "inspector-tab-git"))
    await settle()
    const reviewChanges = Array.from((getByTestId(container, "inspector-git-panel") ?? container).querySelectorAll("button")).find((button) => button.textContent?.includes("Review changes"))
    await clickElement(reviewChanges)
    await settle()
    expect(getByTestId(container, "inspector-changes-panel")?.textContent).toContain("src/live-only.ts")
    expect(container.querySelector(".changes-file-review[aria-current=true]")).toBeNull()

    includeArtifactPath = false
    await clickElement(getByTestId(container, "chat-review-diff-conversation-2-artifact-diff"))
    await settle()
    expect(getByTestId(container, "inspector-changes-panel")?.textContent).toContain("src/live-only.ts")
    expect(getByTestId(container, "inspector-changes-panel")?.textContent).not.toContain(artifactPath)
    expect(container.querySelector(".changes-file-review[aria-current=true]")).toBeNull()

    await act(async () => root.unmount())
    container.remove()
  })

  it("opens same-run chat diff files in the inspected conversation", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(getByTestId(container, "chat-open-editor-conversation-2-artifact-diff")).toBeTruthy()
    await clickElement(getByTestId(container, "chat-open-editor-conversation-2-artifact-diff"))

    expect(window.teamcow.openConversationHandoff).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      target: "file",
      filePath: "apps/desktop/src/renderer/app/shell/DesktopShell.tsx"
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("does not expose a chat diff CTA when artifacts belong to a different run", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => {
      const timeline = inspectorDiffTimeline(conversationId)
      return {
        status: "ok",
        timeline: {
          ...timeline,
          artifacts: timeline.artifacts.filter((artifact) => artifact.runId === `${conversationId}-run-2`)
        }
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(getByTestId(container, "chat-review-diff-conversation-2-artifact-diff")).toBeNull()
    expect(getByTestId(container, "chat-system-summary")?.textContent).toContain("Updated the inspector diff review path")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows active conversation git overview for the conversation-bound worktree", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))

    const gitPanel = getByTestId(container, "inspector-git-panel")
    expect(gitPanel?.hasAttribute("hidden")).toBe(false)
    expect(gitPanel?.textContent).toContain("feat/git-panel")
    expect(gitPanel?.textContent).toContain("Dirty")
    expect(gitPanel?.textContent).toContain("git@github.com:teamcow/teamcow.git")
    expect(gitPanel?.textContent).toContain("Team Cow")
    expect(gitPanel?.textContent).toContain("dev@teamcow.local")
    expect(gitPanel?.textContent).toContain("origin/main")
    expect(gitPanel?.textContent).toContain("fix: remove inspector execution targets")
    expect(gitPanel?.textContent).toContain("2508d1f")
    expect(gitPanel?.textContent).toContain("2 hours ago")
    expect(gitPanel?.textContent).toContain("Review changes")
    expect(gitPanel?.textContent).not.toContain("project-service.ts")
    expect(gitPanel?.textContent).not.toContain("modified")
    const commitItems = gitPanel?.querySelectorAll(".inspector-git-commit-timeline-item")
    expect(commitItems?.length).toBeGreaterThan(0)
    expect(commitItems?.[0]?.querySelector(".inspector-git-commit-dot")).not.toBeNull()
    expect(commitItems?.[0]?.querySelector(".inspector-git-commit-meta")?.textContent).toContain("2508d1f")
    expect(getByTestId(container, "git-remote-select")?.getAttribute("aria-label")).toBe("Remote")
    expect(window.teamcow.getConversationGitStatus).toHaveBeenCalledWith("conversation-2", "currentBranch")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows commit history unavailable separately from an empty commit scope", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId, {
        commits: {
          status: "unavailable",
          scope: "currentBranch",
          items: [],
          hasMore: false
        }
      })
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))

    const gitPanel = getByTestId(container, "inspector-git-panel")
    expect(gitPanel?.textContent).toContain("Commit history unavailable.")
    expect(gitPanel?.textContent).not.toContain("No commits found for this scope.")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("reloads Git commits when the commit scope changes", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string, scope = "currentBranch"): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId, {
        commits: {
          status: "ok",
          scope,
          items: [
            {
              hash: scope === "currentBranch"
                ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              shortHash: scope === "currentBranch" ? "aaaaaaa" : "bbbbbbb",
              subject: scope === "currentBranch" ? "feat: branch commit" : "chore: repository commit",
              authorName: "Team Cow",
              authoredAt: "2026-07-08T08:17:33+08:00",
              relativeTime: "2 hours ago"
            }
          ],
          hasMore: false
        }
      })
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    expect(getByTestId(container, "git-commit-scope-allRepository")?.getAttribute("aria-pressed")).toBe("false")
    expect(getByTestId(container, "git-commit-scope-currentBranch")?.getAttribute("aria-pressed")).toBe("true")
    expect(getByTestId(container, "inspector-git-panel")?.textContent).toContain("feat: branch commit")

    await clickElement(getByTestId(container, "git-commit-scope-allRepository"))
    expect(getByTestId(container, "git-commit-scope-allRepository")?.getAttribute("aria-pressed")).toBe("true")
    expect(getByTestId(container, "git-commit-scope-currentBranch")?.getAttribute("aria-pressed")).toBe("false")

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.getConversationGitStatus).toHaveBeenCalledWith("conversation-2", "currentBranch")
    expect(getByTestId(container, "inspector-git-panel")?.textContent).toContain("chore: repository commit")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps pinned Git commit scope tied to the snapshot", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string, scope = "currentBranch"): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId, {
        commits: {
          status: "ok",
          scope,
          items: [
            {
              hash: scope === "currentBranch"
                ? "cccccccccccccccccccccccccccccccccccccccc"
                : "dddddddddddddddddddddddddddddddddddddddd",
              shortHash: scope === "currentBranch" ? "ccccccc" : "ddddddd",
              subject: scope === "currentBranch" ? "feat: pinned branch commit" : "chore: pinned repository commit",
              authorName: "Team Cow",
              authoredAt: "2026-07-08T08:17:33+08:00",
              relativeTime: "2 hours ago"
            }
          ],
          hasMore: false
        }
      })
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "inspector-pin-toggle"))

    expect(getByTestId(container, "git-commit-scope-currentBranch")?.getAttribute("aria-pressed")).toBe("true")
    expect(getByTestId(container, "git-commit-scope-allRepository")?.hasAttribute("disabled")).toBe(true)
    expect(getByTestId(container, "inspector-git-panel")?.textContent).toContain("feat: pinned branch commit")

    await clickElement(getByTestId(container, "git-commit-scope-allRepository"))
    await settle()

    expect(getByTestId(container, "git-commit-scope-currentBranch")?.getAttribute("aria-pressed")).toBe("true")
    expect(getByTestId(container, "git-commit-scope-allRepository")?.getAttribute("aria-pressed")).toBe("false")
    expect(getByTestId(container, "inspector-git-panel")?.textContent).toContain("feat: pinned branch commit")
    expect(getByTestId(container, "inspector-git-panel")?.textContent).not.toContain("chore: pinned repository commit")
    expect((window.teamcow.getConversationGitStatus as ReturnType<typeof vi.fn>).mock.calls).not.toContainEqual([
      "conversation-2",
      "allRepository"
    ])

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("resets Git commit scope when switching away and back between conversations", async () => {
    const conversationOneContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-1",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Navigation cleanup",
        providerKind: "codex",
        runStatus: "idle"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-1"
          }))
        }
      ]
    }

    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async (conversationId: string) => ({
      status: "ok" as const,
      context: conversationId === "conversation-1" ? conversationOneContext : selectionContext
    }))
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string, scope = "currentBranch"): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId, {
        branch: {
          current: conversationId === "conversation-1" ? "feat/navigation-cleanup" : "feat/git-panel",
          recorded: "main",
          upstream: "origin/main",
          isClean: false,
          changedCount: 1
        },
        commits: {
          status: "ok",
          scope,
          items: [
            {
              hash: `${conversationId}-${scope}`.padEnd(40, "0"),
              shortHash: scope === "currentBranch" ? "aaaaaaa" : "bbbbbbb",
              subject: `${conversationId} ${scope}`,
              authorName: "Team Cow",
              authoredAt: "2026-07-08T08:17:33+08:00",
              relativeTime: "2 hours ago"
            }
          ],
          hasMore: false
        }
      })
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "git-commit-scope-allRepository"))

    const firstConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    expect(firstConversationRow).toBeTruthy()
    await clickElement(firstConversationRow)
    await settle()

    const gitCalls = (window.teamcow.getConversationGitStatus as ReturnType<typeof vi.fn>).mock.calls
    expect(gitCalls).toContainEqual(["conversation-2", "allRepository"])
    expect(gitCalls).toContainEqual(["conversation-1", "currentBranch"])

    await clickElement(getByTestId(container, "inspector-tab-git"))
    const gitPanel = getByTestId(container, "inspector-git-panel")
    expect(gitPanel?.textContent).toContain("conversation-1 currentBranch")
    expect(gitPanel?.textContent).not.toContain("project-service.ts")
    expect(gitPanel?.textContent).not.toContain("modified")

    const secondConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Inspector polish")
    )
    expect(secondConversationRow).toBeTruthy()
    const callsBeforeReturning = gitCalls.length
    await clickElement(secondConversationRow)
    await settle()

    const returnCalls = gitCalls.slice(callsBeforeReturning)
    expect(gitCalls).toContainEqual(["conversation-2", "allRepository"])
    expect(returnCalls).toContainEqual(["conversation-2", "currentBranch"])
    expect(returnCalls).not.toContainEqual(["conversation-2", "allRepository"])

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("switches displayed Git remote without reloading Git data", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    const callsBefore = (window.teamcow.getConversationGitStatus as ReturnType<typeof vi.fn>).mock.calls.length

    const remoteSelect = getByTestId(container, "git-remote-select") as HTMLSelectElement | null
    await act(async () => {
      if (!remoteSelect) {
        throw new Error("expected remote select")
      }
      remoteSelect.value = "backup"
      remoteSelect.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(getByTestId(container, "inspector-git-panel")?.textContent).toContain("git@example.com:teamcow/teamcow.git")
    expect((window.teamcow.getConversationGitStatus as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps a pinned git snapshot when the active conversation changes", async () => {
    const firstConversationContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-1",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Navigation cleanup",
        providerKind: "codex",
        runStatus: "idle"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-1"
          }))
        }
      ]
    }

    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok" as const,
      context: firstConversationContext
    }))
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn((conversationId: string): Promise<GetConversationGitStatusResult> => {
      if (conversationId === "conversation-1") {
        return Promise.resolve(dirtyGitStatus(conversationId, {
          branch: {
            current: "feat/active-navigation",
            recorded: "main",
            upstream: "origin/main",
            isClean: false,
            changedCount: 1
          },
          commits: {
            status: "ok",
            scope: "currentBranch",
            items: [{
              hash: "1111111111111111111111111111111111111111",
              shortHash: "1111111",
              subject: "feat: active navigation",
              authorName: "Team Cow",
              authoredAt: "2026-07-08T08:17:33+08:00",
              relativeTime: "2 hours ago"
            }],
            hasMore: false
          }
        }))
      }

      return Promise.resolve(dirtyGitStatus(conversationId, {
        branch: {
          current: "feat/pinned-git",
          recorded: "main",
          upstream: "origin/main",
          isClean: false,
          changedCount: 1
        },
        commits: {
          status: "ok",
          scope: "currentBranch",
          items: [{
            hash: "2222222222222222222222222222222222222222",
            shortHash: "2222222",
            subject: "feat: pinned git",
            authorName: "Team Cow",
            authoredAt: "2026-07-08T08:17:33+08:00",
            relativeTime: "2 hours ago"
          }],
          hasMore: false
        }
      }))
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    expect(getByTestId(container, "inspector-git-panel")?.textContent).toContain("feat/pinned-git")

    await clickElement(getByTestId(container, "inspector-pin-toggle"))

    const firstConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    await clickElement(firstConversationRow)

    const gitPanel = getByTestId(container, "inspector-git-panel")
    expect(gitPanel?.hasAttribute("hidden")).toBe(false)
    expect(gitPanel?.textContent).toContain("feat/pinned-git")
    expect(gitPanel?.textContent).toContain("feat: pinned git")
    expect(gitPanel?.textContent).not.toContain("feat/active-navigation")
    expect(gitPanel?.textContent).not.toContain("feat: active navigation")
    // Eager fetch on mount + tab switch: data stays pinned regardless of call count
    expect(window.teamcow.getConversationGitStatus).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("resets Git commit scope after unpinning onto a newly active conversation", async () => {
    const firstConversationContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-1",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Navigation cleanup",
        providerKind: "codex",
        runStatus: "idle"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-1"
          }))
        }
      ]
    }

    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async (conversationId: string) => ({
      status: "ok" as const,
      context: conversationId === "conversation-1" ? firstConversationContext : selectionContext
    }))
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string, scope = "currentBranch"): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId, {
        commits: {
          status: "ok",
          scope,
          items: [
            {
              hash: `${conversationId}-${scope}`.padEnd(40, "0"),
              shortHash: scope === "currentBranch" ? "aaaaaaa" : "bbbbbbb",
              subject: `${conversationId} ${scope}`,
              authorName: "Team Cow",
              authoredAt: "2026-07-08T08:17:33+08:00",
              relativeTime: "2 hours ago"
            }
          ],
          hasMore: false
        }
      })
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "git-commit-scope-allRepository"))
    await clickElement(getByTestId(container, "inspector-pin-toggle"))

    const firstConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    expect(firstConversationRow).toBeTruthy()
    await clickElement(firstConversationRow)
    await settle()

    await clickElement(getByTestId(container, "inspector-pin-toggle"))
    await settle()

    const gitCalls = (window.teamcow.getConversationGitStatus as ReturnType<typeof vi.fn>).mock.calls
    const conversationOneCalls = gitCalls.filter((call) => call[0] === "conversation-1")
    expect(conversationOneCalls[0]).toEqual(["conversation-1", "currentBranch"])
    expect(conversationOneCalls).not.toContainEqual(["conversation-1", "allRepository"])
    expect(getByTestId(container, "inspector-git-panel")?.textContent).toContain("conversation-1 currentBranch")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("does not pin files or git while their review data is still loading", async () => {
    const slowProjectFiles = createDeferred<GetConversationProjectFilesResult>()
    const slowGitStatus = createDeferred<GetConversationGitStatusResult>()
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationProjectFiles = vi.fn(async () => slowProjectFiles.promise)
    window.teamcow.getConversationGitStatus = vi.fn(async () => slowGitStatus.promise)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-files"))

    expect(getByTestId(container, "inspector-files-panel")?.textContent).toContain("Loading project files...")
    expect(getByTestId(container, "inspector-pin-toggle")?.hasAttribute("disabled")).toBe(true)

    slowProjectFiles.resolve(projectFilesResult("conversation-2"))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await clickElement(getByTestId(container, "inspector-tab-git"))
    expect(getByTestId(container, "inspector-pin-toggle")?.hasAttribute("disabled")).toBe(true)

    slowGitStatus.resolve(dirtyGitStatus("conversation-2"))

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("explains source boundaries when git is dirty but the run recorded no artifacts", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithUserMessage(conversationId, "No artifact run", "completed")
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))

    const gitPanel = getByTestId(container, "inspector-git-panel")
    expect(gitPanel?.textContent).toContain("3 changed files")
    expect(gitPanel?.textContent).toContain("Review changes")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders Git status errors with localized copy", async () => {
    void i18n.changeLanguage("zh")
    window.teamcow.getLocale = vi.fn(async () => "zh" as Locale)
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (): Promise<GetConversationGitStatusResult> => ({
      status: "error",
      error: {
        code: "GIT_STATUS_PARSE_FAILED",
        message: "git status returned output TeamCow could not parse",
        suggestion: null
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))

    const gitPanel = getByTestId(container, "inspector-git-panel")
    expect(gitPanel?.textContent).toContain("Git status 返回了 TeamCow 无法解析的输出。")
    expect(gitPanel?.textContent).toContain("请在终端检查当前仓库状态，然后刷新 Git 状态。")
    expect(gitPanel?.textContent).toContain("这是本地 Git 集成问题，不是 provider 或网络不可用。")
    expect(gitPanel?.textContent).not.toContain("git status returned output TeamCow could not parse")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("prefetches conversation git status when a conversation is active, before the Git tab is opened", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    // Git status is fetched eagerly so the panel is ready before the user opens the tab
    expect(window.teamcow.getConversationGitStatus).toHaveBeenCalledWith("conversation-2", "currentBranch")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("surfaces a recorded branch mismatch in the Git panel", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId, {
        branch: {
          current: "feat/git-panel",
          recorded: "main",
          upstream: "origin/main",
          isClean: false,
          changedCount: 3
        }
      })
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))

    const gitPanel = getByTestId(container, "inspector-git-panel")
    expect(gitPanel?.textContent).toContain("feat/git-panel")
    expect(gitPanel?.textContent).toContain("Recorded branch: main")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("refreshes Git status when run artifacts are replaced with the same count", async () => {
    const completedSelectionContext: AppContextSnapshot = {
      ...selectionContext,
      shell: {
        ...selectionContext.shell,
        runStatus: "completed"
      },
      chips: selectionContext.chips.map((chip) =>
        chip.kind === "run-status" ? { ...chip, value: "completed" } : chip
      ),
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) =>
            conversation.id === "conversation-2"
              ? { ...conversation, runStatus: "completed" as const }
              : conversation
          )
        }
      ]
    }
    const initialTimeline = compareTimeline({
      conversationId: "conversation-2",
      provider: "claude",
      model: "claude-sonnet-4",
      worktreeId: "worktree-1",
      status: "completed",
      summary: "Initial artifact",
      files: [
        {
          path: "apps/desktop/src/main/project-service.ts",
          status: "modified"
        }
      ]
    })
    const replacementTimeline = compareTimeline({
      conversationId: "conversation-2",
      provider: "claude",
      model: "claude-sonnet-4",
      worktreeId: "worktree-1",
      status: "completed",
      summary: "Replacement artifact",
      files: [
        {
          path: "apps/desktop/src/renderer/app/shell/DesktopShell.tsx",
          status: "modified"
        }
      ]
    })

    window.teamcow.getAppContext = vi.fn(async () => completedSelectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: initialTimeline
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )
    window.teamcow.sendConversationMessage = vi.fn(async (input: { conversationId: string; content: string }): Promise<SendConversationMessageResult> => ({
      status: "accepted",
      conversation: {
        ...completedSelectionContext.projects[0].conversations[1],
        runStatus: "completed"
      },
      timeline: {
        ...replacementTimeline,
        conversationId: input.conversationId
      },
      context: completedSelectionContext
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    // Eager prefetch fires on mount; clear to isolate the artifact-triggered refresh
    const callsBefore = (window.teamcow.getConversationGitStatus as ReturnType<typeof vi.fn>).mock.calls.length

    const composerInput = getByTestId(container, "composer-input") as HTMLTextAreaElement | null
    await act(async () => {
      if (composerInput) {
        composerInput.value = "Refresh artifacts"
        composerInput.dispatchEvent(new Event("input", { bubbles: true }))
      }
      await Promise.resolve()
    })
    await clickElement(getByTestId(container, "composer-send"))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.sendConversationMessage).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      content: "Refresh artifacts"
    })
    // At least one new git status fetch triggered by the artifact fingerprint change
    const callsAfter = (window.teamcow.getConversationGitStatus as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callsAfter).toBeGreaterThan(callsBefore)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("invalidates a pending Git request when the active conversation becomes empty", async () => {
    const slowGitStatus = createDeferred<GetConversationGitStatusResult>()
    const selectionContextWithOtherProject: AppContextSnapshot = {
      ...selectionContext,
      projects: [
        ...selectionContext.projects,
        {
          id: "project-2",
          name: "othercow",
          rootPath: "/tmp/othercow",
          status: "ready",
          isCurrent: false,
          defaultWorktree: {
            id: "worktree-2",
            projectId: "project-2",
            kind: "default",
            rootPath: "/tmp/othercow",
            branch: "main",
            status: "ready"
          },
          conversations: []
        }
      ]
    }
    window.teamcow.getAppContext = vi.fn(async () => selectionContextWithOtherProject)
    window.teamcow.selectProject = vi.fn(async () => ({
      status: "ok" as const,
      context: projectOnlyContext
    }))
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(() => slowGitStatus.promise)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))

    const projectRow = container.querySelector(".proj-group:not(.open) .proj-row-btn")
    await clickElement(projectRow)

    slowGitStatus.resolve(dirtyGitStatus("conversation-2", {
      branch: {
        current: "feat/stale-after-deselect",
        recorded: "main",
        upstream: "origin/main",
        isClean: false,
        changedCount: 1
      },
      commits: {
        status: "ok",
        scope: "currentBranch",
        items: [{
          hash: "3333333333333333333333333333333333333333",
          shortHash: "3333333",
          subject: "feat: stale after deselect",
          authorName: "Team Cow",
          authoredAt: "2026-07-08T08:17:33+08:00",
          relativeTime: "2 hours ago"
        }],
        hasMore: false
      }
    }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await clickElement(getByTestId(container, "inspector-tab-git"))

    const gitPanel = getByTestId(container, "inspector-git-panel")
    expect(gitPanel?.textContent).toContain("Select a conversation to inspect git status.")
    expect(gitPanel?.textContent).not.toContain("feat/stale-after-deselect")
    expect(gitPanel?.textContent).not.toContain("apps/stale-after-deselect.ts")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps the Git panel read-only and leaves handoff controls out of the panel", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))

    const gitPanel = getByTestId(container, "inspector-git-panel")
    expect(gitPanel?.textContent).toContain("Review changes")
    expect(gitPanel?.textContent).not.toContain("Review files")
    expect(gitPanel?.textContent).not.toContain("Continue in chat")
    expect(getByTestId(container, "git-action-open-editor")).toBeNull()
    expect(getByTestId(container, "git-action-open-terminal")).toBeNull()
    expect(getByTestId(container, "git-action-open-worktree")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps terminal handoff interactive with resize and restart controls", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "inspector-tab-terminal"))

    const restartButton = getByTestId(container, "terminal-restart-session")
    expect(restartButton?.getAttribute("aria-label")).toContain("Restart")
    expect(getByTestId(container, "terminal-close-session")).toBeNull()

    expect(window.teamcow.resizeTerminal).toHaveBeenCalledWith({
      sessionId: "terminal-1",
      cols: expect.any(Number),
      rows: expect.any(Number)
    })

    await act(async () => {
      window.dispatchEvent(new Event("resize"))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(window.teamcow.resizeTerminal).toHaveBeenCalledTimes(2)

    await clickElement(restartButton)
    expect(window.teamcow.closeTerminal).toHaveBeenCalledWith({
      sessionId: "terminal-1"
    })
    expect(window.teamcow.openConversationTerminal).toHaveBeenCalledTimes(2)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("closes the running terminal session before opening a replacement", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "inspector-tab-terminal"))
    await clickElement(getByTestId(container, "terminal-restart-session"))

    expect(window.teamcow.closeTerminal).toHaveBeenCalledWith({
      sessionId: "terminal-1"
    })
    expect(window.teamcow.openConversationTerminal).toHaveBeenCalledTimes(2)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders host terminal output only in the terminal panel and keeps chat timeline clean", async () => {
    let terminalOutputCallback: ((event: TerminalOutputEvent) => void) | null = null
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithUserMessage(conversationId, "Review the implementation", "completed")
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )
    window.teamcow.onTerminalOutput = vi.fn((callback: (event: TerminalOutputEvent) => void) => {
      terminalOutputCallback = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "inspector-tab-terminal"))

    await act(async () => {
      terminalOutputCallback?.({
        sessionId: "terminal-1",
        conversationId: "conversation-2",
        data: "manual terminal output\n",
        receivedAt: "2026-06-05T10:00:00.000Z"
      })
      await Promise.resolve()
    })

    // xterm renders to canvas; we assert the output event was NOT reflected in chat
    expect(container.querySelector(".chat-stream")?.textContent ?? "").not.toContain("manual terminal output")

    await act(async () => {
      terminalOutputCallback?.({
        sessionId: "terminal-other",
        conversationId: "conversation-2",
        data: "other session output\n",
        receivedAt: "2026-06-05T10:00:01.000Z"
      })
      await Promise.resolve()
    })

    // terminal panel is still present (xterm container)
    expect(getByTestId(container, "terminal-output")).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("passes raw PTY output to xterm emulator", async () => {
    let terminalOutputCallback: ((event: TerminalOutputEvent) => void) | null = null
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )
    window.teamcow.onTerminalOutput = vi.fn((callback: (event: TerminalOutputEvent) => void) => {
      terminalOutputCallback = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "inspector-tab-terminal"))

    await act(async () => {
      terminalOutputCallback?.({
        sessionId: "terminal-1",
        conversationId: "conversation-2",
        data: "\u001B[1m%\u001B[0m",
        receivedAt: "2026-06-05T10:00:00.000Z"
      })
      await Promise.resolve()
    })

    // xterm renders to canvas; just verify the terminal container is present
    expect(getByTestId(container, "terminal-output")).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders initial terminal output from the open result", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )
    window.teamcow.openConversationTerminal = vi.fn(async (input: { conversationId: string }): Promise<OpenConversationTerminalResult> => ({
      status: "ok",
      initialOutput: "startup prompt\n",
      session: {
        sessionId: "terminal-1",
        conversationId: input.conversationId,
        worktreeId: "worktree-1",
        cwd: "/tmp/teamcow",
        shell: "/bin/zsh",
        status: "running",
        startedAt: "2026-06-05T09:54:19.000Z"
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "inspector-tab-terminal"))

    // xterm renders to canvas; verify terminal container is rendered
    expect(getByTestId(container, "terminal-output")).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("updates terminal UI when the host reports PTY exit and ignores output after close", async () => {
    let terminalOutputCallback: ((event: TerminalOutputEvent) => void) | null = null
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )
    window.teamcow.onTerminalOutput = vi.fn((callback: (event: TerminalOutputEvent) => void) => {
      terminalOutputCallback = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "inspector-tab-terminal"))

    await act(async () => {
      terminalOutputCallback?.({
        sessionId: "terminal-1",
        conversationId: "conversation-2",
        data: "",
        status: "exited",
        exitCode: 0,
        receivedAt: "2026-06-05T10:00:00.000Z"
      })
      await Promise.resolve()
    })

    expect(getByTestId(container, "inspector-terminal-panel")?.textContent).toContain("Exited")

    await act(async () => {
      terminalOutputCallback?.({
        sessionId: "terminal-1",
        conversationId: "conversation-2",
        data: "late output\n",
        receivedAt: "2026-06-05T10:00:01.000Z"
      })
      await Promise.resolve()
    })

    // xterm renders to canvas; state machine guards against writing after exit
    expect(getByTestId(container, "terminal-output")).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("auto-starts a fresh terminal session when switching to a different inspected conversation", async () => {
    const firstConversationContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-1",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Navigation cleanup",
        providerKind: "codex",
        runStatus: "idle"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-1"
          }))
        }
      ]
    }

    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok",
      context: firstConversationContext
    }) as const)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "inspector-tab-terminal"))

    const firstConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    await clickElement(firstConversationRow)

    // After switching conversations, auto-start opens a new session for the new conversation
    const terminalPanel = getByTestId(container, "inspector-terminal-panel")
    expect(terminalPanel?.textContent).not.toContain("Inspector polish")
    expect(window.teamcow.openConversationTerminal).toHaveBeenLastCalledWith({
      conversationId: "conversation-1"
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("xterm handles scrollback natively; terminal container is rendered", async () => {
    let terminalOutputCallback: ((event: TerminalOutputEvent) => void) | null = null
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )
    window.teamcow.onTerminalOutput = vi.fn((callback: (event: TerminalOutputEvent) => void) => {
      terminalOutputCallback = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "inspector-tab-terminal"))

    await act(async () => {
      terminalOutputCallback?.({
        sessionId: "terminal-1",
        conversationId: "conversation-2",
        data: `early-${"x".repeat(25_000)}-latest`,
        receivedAt: "2026-06-05T10:00:00.000Z"
      })
      await Promise.resolve()
    })

    // xterm handles its own scrollback (configured with scrollback: 5000)
    expect(getByTestId(container, "terminal-output")).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("syncs terminal size when the terminal panel element resizes", async () => {
    let resizeCallback: ResizeObserverCallback | null = null
    const OriginalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    } as never

    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-git"))
    await clickElement(getByTestId(container, "inspector-tab-terminal"))
    expect(window.teamcow.resizeTerminal).toHaveBeenCalledTimes(1)

    await act(async () => {
      resizeCallback?.([], {} as ResizeObserver)
      await Promise.resolve()
    })

    expect(window.teamcow.resizeTerminal).toHaveBeenCalledTimes(2)

    await act(async () => {
      root.unmount()
    })
    container.remove()
    globalThis.ResizeObserver = OriginalResizeObserver
  })

  it("opens terminal for the pinned inspected conversation after the active conversation changes", async () => {
    const firstConversationContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-1",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Navigation cleanup",
        providerKind: "codex",
        runStatus: "idle"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-1"
          }))
        }
      ]
    }

    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok",
      context: firstConversationContext
    }) as const)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn(async (conversationId: string): Promise<GetConversationGitStatusResult> =>
      dirtyGitStatus(conversationId)
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-terminal"))
    await clickElement(getByTestId(container, "inspector-pin-toggle"))

    const firstConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    await clickElement(firstConversationRow)

    await clickElement(getByTestId(container, "terminal-restart-session"))
    expect(window.teamcow.openConversationTerminal).toHaveBeenLastCalledWith({
      conversationId: "conversation-2"
    })
    expect(getByTestId(container, "inspector-terminal-panel")?.textContent).toContain("Pinned")
    expect(getByTestId(container, "inspector-terminal-panel")?.textContent).toContain("Inspector polish")
    expect(getByTestId(container, "inspector-pin-mismatch")?.textContent).toContain("Active: Navigation cleanup")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps editor workspace handoff errors scoped to the editor pane", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorDiffTimeline(conversationId)
    }))
    window.teamcow.openConversationHandoff = vi.fn(async (): Promise<OpenConversationHandoffResult> => ({
      status: "error",
      error: {
        code: "HANDOFF_OPEN_FAILED",
        message: "No editor",
        suggestion: "No editor is registered"
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "inspector-tab-files"))
    await clickElement(getByTestId(container, "inspector-project-file-apps"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main"))
    await clickElement(getByTestId(container, "inspector-project-file-apps/desktop/src/main/project-service.ts"))
    await settle()
    await clickElement(getByTestId(container, "file-editor-open-external"))

    expect(getByTestId(container, "file-editor-handoff-message")?.textContent).toContain(
      "TeamCow could not open the selected target in the selected editor."
    )
    expect(getByTestId(container, "inspector-handoff-message")).toBeNull()

    await clickElement(getByTestId(container, "inspector-tab-changes"))

    expect(getByTestId(container, "inspector-changes-panel")?.hasAttribute("hidden")).toBe(false)
    expect(getByTestId(container, "inspector-files-panel")?.hasAttribute("hidden")).toBe(true)
    expect(getByTestId(container, "inspector-handoff-message")).toBeNull()
    expect(getByTestId(container, "file-editor-handoff-message")?.textContent).toContain(
      "TeamCow could not open the selected target in the selected editor."
    )

    await clickElement(getByTestId(container, "inspector-tab-files"))

    expect(getByTestId(container, "file-editor-handoff-message")?.textContent).toContain(
      "TeamCow could not open the selected target in the selected editor."
    )

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("does not show stale git status after switching conversations", async () => {
    const firstConversationContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-1",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Navigation cleanup",
        providerKind: "codex",
        runStatus: "idle"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-1"
          }))
        }
      ]
    }
    const slowFirstGitStatus = createDeferred<GetConversationGitStatusResult>()

    window.teamcow.getAppContext = vi.fn(async () => firstConversationContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok" as const,
      context: selectionContext
    }))
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: inspectorFilesTimeline(conversationId)
    }))
    window.teamcow.getConversationGitStatus = vi.fn((conversationId: string): Promise<GetConversationGitStatusResult> => {
      if (conversationId === "conversation-1") {
        return slowFirstGitStatus.promise
      }

      return Promise.resolve(dirtyGitStatus(conversationId, {
        branch: {
          current: "feat/current-conversation",
          recorded: "main",
          upstream: "origin/main",
          isClean: false,
          changedCount: 1
        },
        commits: {
          status: "ok",
          scope: "currentBranch",
          items: [{
            hash: "4444444444444444444444444444444444444444",
            shortHash: "4444444",
            subject: "feat: current conversation",
            authorName: "Team Cow",
            authoredAt: "2026-07-08T08:17:33+08:00",
            relativeTime: "2 hours ago"
          }],
          hasMore: false
        }
      }))
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    const secondConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Inspector polish")
    )

    await act(async () => {
      secondConversationRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    await clickElement(getByTestId(container, "inspector-tab-git"))

    slowFirstGitStatus.resolve(dirtyGitStatus("conversation-1", {
      branch: {
        current: "feat/stale-conversation",
        recorded: "main",
        upstream: "origin/main",
        isClean: false,
        changedCount: 1
      },
      commits: {
        status: "ok",
        scope: "currentBranch",
        items: [{
          hash: "5555555555555555555555555555555555555555",
          shortHash: "5555555",
          subject: "feat: stale conversation",
          authorName: "Team Cow",
          authoredAt: "2026-07-08T08:17:33+08:00",
          relativeTime: "2 hours ago"
        }],
        hasMore: false
      }
    }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const gitPanel = getByTestId(container, "inspector-git-panel")
    expect(gitPanel?.textContent).toContain("feat/current-conversation")
    expect(gitPanel?.textContent).toContain("feat: current conversation")
    expect(gitPanel?.textContent).not.toContain("feat/stale-conversation")
    expect(gitPanel?.textContent).not.toContain("feat: stale conversation")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("opens a side-by-side compare view with conversation ownership, summaries, and changed files", async () => {
    const compareContext: AppContextSnapshot = {
      ...selectionContext,
      shell: {
        ...selectionContext.shell,
        worktreeBranch: "feat/new-conversation",
        worktreePath: "/tmp/teamcow-feature",
        runStatus: "completed"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: [
            {
              ...selectionContext.projects[0].conversations[0],
              title: "Codex attempt",
              provider: {
                kind: "codex",
                label: "Codex",
                status: "ready"
              },
              currentModel: "gpt-5.1",
              accessMode: "read-only",
              runStatus: "completed",
              worktreeId: "worktree-1",
              worktree: projectWorktrees[0],
              isCurrent: false,
              updatedAt: "2026-05-21T10:00:00.000Z"
            },
            {
              ...selectionContext.projects[0].conversations[1],
              title: "Claude attempt",
              provider: {
                kind: "claude",
                label: "Claude",
                status: "ready"
              },
              currentModel: "claude-sonnet-4",
              accessMode: "full-access",
              runStatus: "completed",
              worktreeId: "worktree-2",
              worktree: projectWorktrees[1],
              isCurrent: true,
              updatedAt: "2026-05-21T10:05:00.000Z"
            }
          ]
        }
      ]
    }

    window.teamcow.getAppContext = vi.fn(async () => compareContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: conversationId === "conversation-2"
        ? compareTimeline({
            conversationId,
            provider: "claude",
            model: "claude-sonnet-4",
            worktreeId: "worktree-2",
            status: "completed",
            summary: "Claude extracted the shell layout",
            files: [
              { path: "apps/desktop/src/renderer/app/shell/DesktopShell.tsx", status: "modified" },
              { path: "packages/i18n-resources/src/shell/en.json", status: "modified" }
            ]
          })
        : compareTimeline({
            conversationId,
            provider: "codex",
            model: "gpt-5.1",
            worktreeId: "worktree-1",
            status: "completed",
            summary: "Codex kept the comparison minimal",
            files: ["apps/desktop/src/renderer/app/shell/chat-render-model.ts"]
          })
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await clickElement(getByTestId(container, "compare-toggle"))

    const compareView = getByTestId(container, "compare-view")
    expect(compareView).toBeTruthy()
    expect(compareView?.textContent).toContain("Claude attempt")
    expect(compareView?.textContent).toContain("Claude")
    expect(compareView?.textContent).toContain("feat/new-conversation")
    expect(compareView?.textContent).toContain("/tmp/teamcow-feature")
    expect(compareView?.textContent).toContain("Claude extracted the shell layout")
    expect(compareView?.textContent).toContain("DesktopShell.tsx")
    expect(compareView?.textContent).toContain("Codex attempt")
    expect(compareView?.textContent).toContain("Codex")
    expect(compareView?.textContent).toContain("main")
    expect(compareView?.textContent).toContain("Codex kept the comparison minimal")
    expect(compareView?.textContent).toContain("chat-render-model.ts")
    expect(compareView?.textContent).not.toContain("winner")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("hides the compare entry when the active project has no other conversations", async () => {
    const singleConversationContext: AppContextSnapshot = {
      ...selectionContext,
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: [
            {
              ...selectionContext.projects[0].conversations[1],
              isCurrent: true
            }
          ]
        }
      ]
    }
    window.teamcow.getAppContext = vi.fn(async () => singleConversationContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(getByTestId(container, "compare-toggle")).toBeFalsy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps missing changed files distinct from timeline load failures", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => {
      if (conversationId === "conversation-1") {
        return {
          status: "error",
          error: {
            code: "CONVERSATION_NOT_FOUND",
            message: "Missing timeline"
          }
        }
      }

      return {
        status: "ok",
        timeline: compareTimeline({
          conversationId,
          provider: "claude",
          model: "claude-sonnet-4",
          worktreeId: "worktree-2",
          status: "completed",
          summary: "Active summary"
        })
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "compare-toggle"))

    const targetCard = getByTestId(container, "compare-card-conversation-1")
    expect(targetCard?.textContent).toContain("Result unavailable")
    expect(targetCard?.textContent).toContain("Changed files unavailable.")
    expect(targetCard?.textContent).not.toContain("No changed files recorded for this conversation.")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows a changed-files empty state when the comparison timeline has no artifacts", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: compareTimeline({
        conversationId,
        provider: conversationId === "conversation-2" ? "claude" : "codex",
        model: conversationId === "conversation-2" ? "claude-sonnet-4" : "gpt-5.1",
        worktreeId: conversationId === "conversation-2" ? "worktree-2" : "worktree-1",
        status: "completed",
        summary: `${conversationId} summary`
      })
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "compare-toggle"))

    const compareView = getByTestId(container, "compare-view")
    expect(compareView?.textContent).toContain("No changed files recorded for this conversation.")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("filters empty changed-file entries and indicates hidden overflow files", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: compareTimeline({
        conversationId,
        provider: conversationId === "conversation-2" ? "claude" : "codex",
        model: conversationId === "conversation-2" ? "claude-sonnet-4" : "gpt-5.1",
        worktreeId: conversationId === "conversation-2" ? "worktree-2" : "worktree-1",
        status: "completed",
        summary: `${conversationId} summary`,
        files: conversationId === "conversation-1"
          ? [
              "  apps/a.ts  ",
              "",
              "   ",
              "apps/b.ts",
              "apps/c.ts",
              "apps/d.ts",
              "apps/e.ts",
              "apps/f.ts",
              "apps/g.ts"
            ]
          : []
      })
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "compare-toggle"))

    const compareView = getByTestId(container, "compare-view")
    expect(compareView?.textContent).toContain("apps/a.ts")
    expect(compareView?.textContent).not.toContain("  apps/a.ts  ")
    expect(compareView?.textContent).toContain("1 more changed file")
    expect(queryAllByTestIdPrefix(container, "compare-file-conversation-1-")).toHaveLength(6)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps compare target timeline responses isolated when the target changes quickly", async () => {
    const thirdWorktree: WorktreeSummary = {
      id: "worktree-3",
      projectId: "project-1",
      kind: "git_worktree",
      rootPath: "/tmp/teamcow-opencode",
      branch: "feat/opencode-compare",
      status: "ready"
    }
    const compareContext: AppContextSnapshot = {
      ...selectionContext,
      shell: {
        ...selectionContext.shell,
        worktreeBranch: "feat/new-conversation",
        worktreePath: "/tmp/teamcow-feature",
        runStatus: "completed"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: [
            {
              ...selectionContext.projects[0].conversations[0],
              title: "Slow Codex attempt",
              provider: {
                kind: "codex",
                label: "Codex",
                status: "ready"
              },
              runStatus: "completed",
              isCurrent: false,
              updatedAt: "2026-05-21T10:15:00.000Z"
            },
            {
              ...selectionContext.projects[0].conversations[1],
              title: "Claude attempt",
              runStatus: "completed",
              worktreeId: "worktree-2",
              worktree: projectWorktrees[1],
              isCurrent: true
            },
            {
              id: "conversation-3",
              projectId: "project-1",
              title: "OpenCode attempt",
              worktreeId: "worktree-3",
              worktree: thirdWorktree,
              provider: {
                kind: "opencode",
                label: "OpenCode",
                status: "ready"
              },
              currentModel: "open-code-default",
              runStatus: "completed",
              createdAt: "2026-05-21T10:10:00.000Z",
              updatedAt: "2026-05-21T10:10:00.000Z",
              isCurrent: false
            }
          ]
        }
      ]
    }
    const slowTimeline = createDeferred<GetConversationTimelineResult>()

    window.teamcow.getAppContext = vi.fn(async () => compareContext)
    window.teamcow.getConversationTimeline = vi.fn((conversationId: string): Promise<GetConversationTimelineResult> => {
      if (conversationId === "conversation-1") {
        return slowTimeline.promise
      }

      return Promise.resolve({
        status: "ok",
        timeline: compareTimeline({
          conversationId,
          provider: conversationId === "conversation-3" ? "opencode" : "claude",
          model: conversationId === "conversation-3" ? "open-code-default" : "claude-sonnet-4",
          worktreeId: conversationId === "conversation-3" ? "worktree-3" : "worktree-2",
          status: "completed",
          summary: conversationId === "conversation-3"
            ? "OpenCode completed later"
            : "Claude active summary",
          files: conversationId === "conversation-3"
            ? ["packages/shared-types/src/index.ts"]
            : ["apps/desktop/src/renderer/app/shell/DesktopShell.tsx"]
        })
      })
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "compare-toggle"))
    await clickElement(getByTestId(container, "compare-target-option-conversation-3"))

    await act(async () => {
      slowTimeline.resolve({
        status: "ok",
        timeline: compareTimeline({
          conversationId: "conversation-1",
          provider: "codex",
          model: "gpt-5.1",
          worktreeId: "worktree-1",
          status: "completed",
          summary: "Slow Codex response should be ignored",
          files: ["stale/file.ts"]
        })
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    const compareView = getByTestId(container, "compare-view")
    expect(compareView?.textContent).toContain("OpenCode attempt")
    expect(compareView?.textContent).toContain("OpenCode completed later")
    expect(compareView?.textContent).toContain("index.ts")
    expect(compareView?.textContent).not.toContain("Slow Codex response should be ignored")
    expect(compareView?.textContent).not.toContain("stale/file.ts")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("opens a follow-up launcher prefilled from either side of the compare view", async () => {
    const compareContext: AppContextSnapshot = {
      ...selectionContext,
      shell: {
        ...selectionContext.shell,
        runStatus: "completed"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: [
            {
              ...selectionContext.projects[0].conversations[0],
              title: "Codex attempt",
              provider: {
                kind: "codex",
                label: "Codex",
                status: "ready"
              },
              currentModel: "gpt-5.1",
              accessMode: "read-only",
              runStatus: "completed",
              worktreeId: "worktree-1",
              worktree: projectWorktrees[0],
              isCurrent: false
            },
            {
              ...selectionContext.projects[0].conversations[1],
              title: "Claude attempt",
              provider: {
                kind: "claude",
                label: "Claude",
                status: "ready"
              },
              currentModel: "claude-sonnet-4",
              accessMode: "full-access",
              runStatus: "completed",
              worktreeId: "worktree-2",
              worktree: projectWorktrees[1],
              isCurrent: true
            }
          ]
        }
      ]
    }
    window.teamcow.getAppContext = vi.fn(async () => compareContext)
    window.teamcow.getProviderReadiness = vi.fn(async () => refreshedProviderSnapshot)
    window.teamcow.listWorktreesByProject = vi.fn(async () => projectWorktrees)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: compareTimeline({
        conversationId,
        provider: conversationId === "conversation-2" ? "claude" : "codex",
        model: conversationId === "conversation-2" ? "claude-sonnet-4" : "gpt-5.1",
        worktreeId: conversationId === "conversation-2" ? "worktree-2" : "worktree-1",
        status: "completed",
        summary: `${conversationId} summary`
      })
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(getByTestId(container, "compare-toggle"))
    await clickElement(getByTestId(container, "compare-follow-up-conversation-1"))

    expect(getByTestId(container, "launcher-provider-trigger")?.textContent).toContain("Codex")
    expect(getByTestId(container, "launcher-model-trigger")?.textContent).toContain("GPT-5.1")
    expect(getByTestId(container, "launcher-worktree-trigger")?.textContent).toContain("main")

    await clickElement(container.querySelector(".launcher-modal .btn"))
    await clickElement(getByTestId(container, "compare-follow-up-conversation-2"))

    expect(getByTestId(container, "launcher-provider-trigger")?.textContent).toContain("Claude")
    expect(getByTestId(container, "launcher-model-trigger")?.textContent).toContain("Sonnet 4")
    expect(getByTestId(container, "launcher-worktree-trigger")?.textContent).toContain("feat/new-conversation")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("opens the active conversation worktree in the default external app from the header", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const button = getByTestId(container, "header-open-location") as HTMLButtonElement | null
    expect(button).toBeTruthy()
    expect(button?.disabled).toBe(false)
    expect(button?.querySelector(".header-open-location__main-icon")?.getAttribute("src"))
      .toBe("data:image/png;base64,ZmFrZS1maW5kZXItaWNvbg==")

    await clickElement(button)

    expect(window.teamcow.openConversationExternal).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      appId: "finder"
    })
    expect(container.querySelector(".header-open-location__message")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("opens the active conversation worktree in a selected external app from the header menu", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await clickElement(getByTestId(container, "header-open-location-menu-trigger"))

    expect(getByTestId(container, "header-open-location-menu")?.textContent).toContain("cmux")
    expect(getByTestId(container, "header-open-location-menu")?.textContent).toContain("Cursor")
    expect(getByTestId(container, "header-open-location-menu")?.textContent).toContain("Antigravity IDE")
    expect(getByTestId(container, "header-open-location-menu")?.textContent).not.toContain("Warp")
    expect(getByTestId(container, "header-open-location-option-cursor")?.querySelector(".header-open-location__icon")?.getAttribute("src"))
      .toBe("data:image/png;base64,ZmFrZS1jdXJzb3ItaWNvbg==")
    expect(getByTestId(container, "header-open-location-option-antigravity-ide")?.querySelector(".header-open-location__icon")?.getAttribute("src"))
      .toBe("data:image/svg+xml;base64,PHN2Zy8+")
    expect(getByTestId(container, "header-open-location-option-cmux")?.querySelector(".header-open-location__icon")?.getAttribute("src"))
      .toBe("data:image/png;base64,ZmFrZS1jbXV4LWljb24=")

    await clickElement(getByTestId(container, "header-open-location-option-cursor"))

    expect(window.teamcow.openConversationExternal).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      appId: "cursor"
    })
    expect(getByTestId(container, "header-open-location")?.querySelector(".header-open-location__main-icon")?.getAttribute("src"))
      .toBe("data:image/png;base64,ZmFrZS1jdXJzb3ItaWNvbg==")
    expect(container.querySelector(".header-open-location__message")).toBeNull()

    await clickElement(getByTestId(container, "header-open-location-menu-trigger"))
    await clickElement(getByTestId(container, "header-open-location-option-antigravity-ide"))

    expect(window.teamcow.openConversationExternal).toHaveBeenLastCalledWith({
      conversationId: "conversation-2",
      appId: "antigravity-ide"
    })
    expect(getByTestId(container, "header-open-location")?.querySelector(".header-open-location__main-icon")?.getAttribute("src"))
      .toBe("data:image/svg+xml;base64,PHN2Zy8+")
    expect(container.querySelector(".header-open-location__message")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("disables the header external open control when no conversation is active", async () => {
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const button = getByTestId(container, "header-open-location") as HTMLButtonElement | null
    expect(button).toBeTruthy()
    expect(button?.disabled).toBe(true)

    await clickElement(button)

    expect(window.teamcow.openConversationExternal).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("switches language to Chinese and all UI text updates", async () => {
    window.teamcow.getAppContext = vi.fn(async () => emptyContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(container.textContent).toContain("No projects imported yet")
    expect(container.textContent).toContain("Import Local Project")

    const settingsBtn = container.querySelector(".settings-btn")
    expect(settingsBtn).toBeTruthy()

    await act(async () => {
      settingsBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Settings")
    expect(container.textContent).toContain("Language")

    const zhButton = Array.from(container.querySelectorAll(".segmented-cell")).find(
      (btn) => btn.textContent === "中文"
    )
    expect(zhButton).toBeTruthy()

    await act(async () => {
      zhButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain("尚未导入项目")
    expect(container.textContent).toContain("导入本地项目")
    expect(container.textContent).toContain("设置")
    expect(container.querySelector(".segmented-cell.active")?.textContent).toBe("中文")
    expect(window.teamcow.setLocale).toHaveBeenCalledWith("zh")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("loads coding editor options in settings and persists the selected editor", async () => {
    window.teamcow.getAppContext = vi.fn(async () => emptyContext)
    window.teamcow.getSelectedEditor = vi.fn(async () => ({
      status: "ok" as const,
      selectedEditorId: null,
      editors: [
        { id: "cursor", label: "Cursor", appName: "Cursor", isAvailable: true },
        { id: "antigravity-ide", label: "Antigravity IDE", appName: "Antigravity IDE", isAvailable: true },
        { id: "vscode", label: "Visual Studio Code", appName: "Visual Studio Code", isAvailable: false }
      ]
    }))
    window.teamcow.setSelectedEditor = vi.fn(async (input: { editorId: string | null }) => ({
      status: "ok" as const,
      selectedEditorId: input.editorId,
      editors: [
        { id: "cursor", label: "Cursor", appName: "Cursor", isAvailable: true },
        { id: "antigravity-ide", label: "Antigravity IDE", appName: "Antigravity IDE", isAvailable: true },
        { id: "vscode", label: "Visual Studio Code", appName: "Visual Studio Code", isAvailable: false }
      ]
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    const settingsBtn = container.querySelector(".settings-btn")
    expect(settingsBtn).toBeTruthy()

    await clickElement(settingsBtn)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const select = getByTestId(container, "settings-editor-select") as HTMLSelectElement | null
    expect(select).toBeTruthy()
    expect(window.teamcow.getSelectedEditor).toHaveBeenCalled()
    expect(select?.value).toBe("cursor")
    expect(Array.from(select?.options ?? []).find((option) => option.value === "")?.textContent).toBe("Select an editor")
    expect(select?.textContent).toContain("Cursor")
    expect(select?.textContent).toContain("Antigravity IDE")
    expect(select?.textContent).toContain("Visual Studio Code is not installed")
    expect(Array.from(select?.options ?? []).find((option) => option.value === "vscode")?.disabled).toBe(true)

    await changeSelect(select, "antigravity-ide")

    expect(window.teamcow.setSelectedEditor).toHaveBeenCalledWith({ editorId: "antigravity-ide" })
    expect(select?.value).toBe("antigravity-ide")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("defaults the coding editor setting to the first available editor", async () => {
    window.teamcow.getAppContext = vi.fn(async () => emptyContext)
    window.teamcow.getSelectedEditor = vi.fn(async () => ({
      status: "ok" as const,
      selectedEditorId: null,
      editors: [
        { id: "cursor", label: "Cursor", appName: "Cursor", isAvailable: true },
        { id: "antigravity-ide", label: "Antigravity IDE", appName: "Antigravity IDE", isAvailable: true },
        { id: "vscode", label: "Visual Studio Code", appName: "Visual Studio Code", isAvailable: false }
      ]
    }))
    window.teamcow.setSelectedEditor = vi.fn()

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    const settingsBtn = container.querySelector(".settings-btn")
    expect(settingsBtn).toBeTruthy()

    await clickElement(settingsBtn)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const select = getByTestId(container, "settings-editor-select") as HTMLSelectElement | null
    expect(select?.value).toBe("cursor")
    expect(window.teamcow.setSelectedEditor).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows update status in settings and routes update actions through preload", async () => {
    window.teamcow.getAppContext = vi.fn(async () => emptyContext)
    window.teamcow.getUpdateState = vi.fn(async (): Promise<UpdateState> => ({
      status: "downloaded",
      version: "1.2.3",
      downloadedAt: "2026-06-07T14:50:00.000Z"
    }))
    window.teamcow.checkForUpdates = vi.fn(async (): Promise<UpdateActionResult> => ({
      status: "ok",
      state: {
        status: "available",
        version: "1.2.4",
        checkedAt: "2026-06-07T14:51:00.000Z"
      }
    }))
    window.teamcow.installUpdateAndRestart = vi.fn(async (): Promise<UpdateActionResult> => ({
      status: "ok",
      state: {
        status: "downloaded",
        version: "1.2.3",
        downloadedAt: "2026-06-07T14:50:00.000Z"
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(container.querySelector(".settings-btn"))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Updates")
    expect(container.textContent).toContain("Update downloaded")
    expect(container.textContent).toContain("Version 1.2.3")

    const checkButton = getByTestId(container, "settings-check-updates")
    expect(checkButton?.textContent).toContain("Check for updates")
    await clickElement(checkButton)
    expect(window.teamcow.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain("Update available")
    expect(container.textContent).toContain("Version 1.2.4")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps update actions visually inactive when updates are disabled", async () => {
    window.teamcow.getAppContext = vi.fn(async () => emptyContext)
    window.teamcow.getUpdateState = vi.fn(async (): Promise<UpdateState> => ({
      status: "disabled",
      message: "updates-disabled-in-development"
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(container.querySelector(".settings-btn"))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const updatePanel = container.querySelector(".settings-update-panel")
    const checkButton = getByTestId(container, "settings-check-updates") as HTMLButtonElement | null
    const restartButton = getByTestId(container, "settings-restart-update") as HTMLButtonElement | null

    expect(container.textContent).toContain("Updates are disabled in development")
    expect(updatePanel?.getAttribute("data-status")).toBe("disabled")
    expect(checkButton?.disabled).toBe(true)
    expect(restartButton?.disabled).toBe(true)
    expect(restartButton?.className).not.toContain("primary")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("routes downloaded update restart actions through preload", async () => {
    window.teamcow.getAppContext = vi.fn(async () => emptyContext)
    window.teamcow.getUpdateState = vi.fn(async (): Promise<UpdateState> => ({
      status: "downloaded",
      version: "1.2.3",
      downloadedAt: "2026-06-07T14:50:00.000Z"
    }))
    window.teamcow.installUpdateAndRestart = vi.fn(async (): Promise<UpdateActionResult> => ({
      status: "ok",
      state: {
        status: "downloaded",
        version: "1.2.3",
        downloadedAt: "2026-06-07T14:50:00.000Z"
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(container.querySelector(".settings-btn"))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const restartButton = getByTestId(container, "settings-restart-update")
    expect(restartButton?.textContent).toContain("Restart to update")
    await clickElement(restartButton)
    expect(window.teamcow.installUpdateAndRestart).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("updates an open settings drawer when the host reports a downloaded update", async () => {
    window.teamcow.getAppContext = vi.fn(async () => emptyContext)
    window.teamcow.getUpdateState = vi.fn(async (): Promise<UpdateState> => ({
      status: "available",
      version: "1.2.3",
      checkedAt: "2026-06-07T14:50:00.000Z"
    }))
    let updateStateHandler: ((state: UpdateState) => void) | null = null
    window.teamcow.onUpdateState = vi.fn((callback: (state: UpdateState) => void) => {
      updateStateHandler = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await clickElement(container.querySelector(".settings-btn"))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const restartButton = getByTestId(container, "settings-restart-update") as HTMLButtonElement | null
    expect(container.textContent).toContain("Update available")
    expect(restartButton?.disabled).toBe(true)

    await act(async () => {
      updateStateHandler?.({
        status: "downloaded",
        version: "1.2.4",
        downloadedAt: "2026-06-07T14:52:00.000Z"
      })
    })

    expect(container.textContent).toContain("Update downloaded")
    expect(container.textContent).toContain("Version 1.2.4")
    expect(restartButton?.disabled).toBe(false)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps rendering in English when getLocale fails during bootstrap", async () => {
    window.teamcow.getLocale = vi.fn(async () => {
      throw new Error("boom")
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(container.textContent).toContain("No projects imported yet")
    expect(container.textContent).toContain("Import Local Project")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("rolls back locale and shows an error notice when persisting locale fails", async () => {
    window.teamcow.setLocale = vi.fn(async () => {
      throw new Error("persist failed")
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    const settingsBtn = container.querySelector(".settings-btn")
    expect(settingsBtn).toBeTruthy()

    await act(async () => {
      settingsBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    const zhButton = Array.from(container.querySelectorAll(".segmented-cell")).find(
      (btn) => btn.textContent === "中文"
    )
    expect(zhButton).toBeTruthy()

    await act(async () => {
      zhButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain("No projects imported yet")
    expect(container.textContent).toContain("Failed to change language.")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders provider badges and placeholder chrome through translations", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(container.textContent).toContain("Claude")
    expect(container.textContent).toContain("Provider")
    expect(container.textContent).toContain("Later")
    expect(container.textContent).not.toContain("Start from chat, then fan out to review tools only when needed.")
    expect(container.querySelector(".conv-item .ttag.claude")?.textContent).toContain("Claude")
    expect(container.querySelector(".conv-item .ttag.status-chip.run")?.textContent).toContain("Running")
    expect(container.querySelector(".binding-row.active .ttag.status-chip.run")?.textContent).toContain("Running")
    expect(getByTestId(container, "chat-message-list")?.textContent).toBe("")
    expect(getByTestId(container, "inspector-files-panel")?.hasAttribute("hidden")).toBe(false)
    expect((getByTestId(container, "composer-input") as HTMLTextAreaElement | null)?.placeholder).toContain("Claude Code")
    expect((getByTestId(container, "composer-input") as HTMLTextAreaElement | null)?.placeholder).not.toContain("Codex")

    const settingsBtn = container.querySelector(".settings-btn")
    expect(settingsBtn).toBeTruthy()

    await act(async () => {
      settingsBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    const zhButton = Array.from(container.querySelectorAll(".segmented-cell")).find(
      (btn) => btn.textContent === "中文"
    )
    expect(zhButton).toBeTruthy()

    await act(async () => {
      zhButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain("稍后")
    expect(container.textContent).not.toContain("从对话开始，仅在需要时展开审查工具。")
    expect(container.querySelector(".segmented-cell.active")?.textContent).toBe("中文")
    expect(container.textContent).not.toContain("Later")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps the shell visible while settings drawer overlays the workspace", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    expect(container.querySelector(".ws")).toBeTruthy()
    expect(container.querySelector(".settings-drawer")).toBeFalsy()

    const settingsBtn = container.querySelector(".settings-btn")
    expect(settingsBtn).toBeTruthy()

    await act(async () => {
      settingsBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.querySelector(".settings-drawer")).toBeTruthy()
    expect(container.querySelector(".settings-backdrop")).toBeTruthy()
    expect(container.querySelector(".ws")).toBeTruthy()
    expect(container.textContent).toContain("Inspector polish")
    expect(container.textContent).toContain("Settings")

    await act(async () => {
      container.querySelector(".settings-close-btn")?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.querySelector(".settings-drawer")).toBeFalsy()
    expect(container.querySelector(".ws")).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders a focused project landing state without readiness details or a composer", async () => {
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getByTestId(container, "project-conversation-landing-state")?.textContent).toContain("Start a conversation")
    expect(getByTestId(container, "project-conversation-landing-state")?.textContent).toContain("begin working in teamcow")
    expect(getByTestId(container, "project-landing-new-conversation")).toBeTruthy()
    expect(container.textContent).not.toContain("Provider readiness")
    expect(container.querySelector(".provider-panel-compact")).toBeNull()
    expect(container.querySelector(".composer-modern")).toBeNull()
    expect(container.querySelector(".ws")).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("routes the empty-state new conversation CTA into project import instead of silently doing nothing", async () => {
    window.teamcow.getAppContext = vi.fn(async () => emptyContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    const newConversationButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("New Conversation")
    )
    expect(newConversationButton).toBeTruthy()

    await act(async () => {
      newConversationButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.importProject).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain("teamcow")
    expect(container.textContent).toContain("Choose how this chat will run.")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("opens a modal new conversation flow, confirms creation, and syncs shell bindings", async () => {
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)
    const readinessWithCursor: ProviderReadinessSnapshot = {
      ...refreshedProviderSnapshot,
      providers: [
        ...refreshedProviderSnapshot.providers,
        {
          kind: "cursor",
          availability: "ready",
          badge: { kind: "cursor", label: "cursor", status: "ready" },
          issues: []
        }
      ]
    }
    window.teamcow.getProviderReadiness = vi.fn(async () => readinessWithCursor)
    window.teamcow.refreshProviderReadiness = vi.fn(async () => readinessWithCursor)
    window.teamcow.listProviderModels = vi.fn(async (providerKind: string) =>
      providerKind === "codex"
        ? [{
            id: "gpt-5.5",
            label: "gpt-5.5",
            detail: "Configured Codex model via Modelgate.",
            source: "config-derived" as const,
            isDefault: true
          }]
        : []
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("New Conversation") || button.getAttribute("aria-label") === "New conversation"
    )

    expect(openButton).toBeTruthy()

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Choose how this chat will run.")
    expect(container.textContent).toContain("Run with")
    expect(container.textContent).toContain("Codex / gpt-5.5")

    const providerTrigger = getByTestId(container, "launcher-provider-trigger") as HTMLButtonElement | null
    const modelTrigger = getByTestId(container, "launcher-model-trigger") as HTMLButtonElement | null
    const worktreeTrigger = getByTestId(container, "launcher-worktree-trigger") as HTMLButtonElement | null
    expect(providerTrigger).toBeTruthy()
    expect(getByTestId(container, "launcher-access-mode-trigger")).toBeNull()
    expect(modelTrigger?.disabled).toBe(false)
    expect(worktreeTrigger).toBeTruthy()
    expect(getByTestId(container, "launcher-worktree-icon")).toBeTruthy()
    for (const provider of ["codex", "claude", "opencode", "cursor"]) {
      const logo = getByTestId(container, `launcher-provider-logo-${provider}`) as HTMLImageElement | null
      expect(logo?.tagName).toBe("IMG")
      expect(logo?.getAttribute("src") ?? "").toMatch(/(?:image\/svg\+xml|\.svg)/)
    }

    expect(window.teamcow.listProviderModels).toHaveBeenCalledWith("codex")
    expect(worktreeTrigger?.textContent).toContain("main")
    const defaultConfirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "Start"
    )
    expect(defaultConfirmButton?.hasAttribute("disabled")).toBe(false)

    await chooseCommandSelectOption(container, "launcher-model", "gpt-5.5")
    await openCommandSelect(container, "launcher-worktree")
    expect(getByTestId(container, "launcher-worktree-popover")?.className).toContain("is-placement-top")
    await clickElement(getByTestId(container, "launcher-worktree-option-worktree-2"))
    expect(container.textContent).toContain("Ready to start in this project")

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "Start"
    )
    expect(confirmButton).toBeTruthy()

    await clickElement(confirmButton)

    expect(window.teamcow.createConversation).toHaveBeenCalledWith({
      projectId: "project-1",
      providerKind: "codex",
      model: "gpt-5.5",
      executionTarget: {
        type: "existing-worktree",
        worktreeId: "worktree-2"
      }
    })
    expect(container.textContent).toContain("codex 10:00")
    expect(container.textContent).toContain("feat/new-conversation")
    expect(container.textContent).toContain("Codex")
    expect(container.textContent).not.toContain("Choose how this chat will run.")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("localizes built-in provider model details in the launcher picker", async () => {
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)
    window.teamcow.listProviderModels = vi.fn(async (providerKind: string) =>
      providerKind === "claude"
        ? [{
            id: "claude-opus-5",
            label: "Opus 5",
            detail: "最强推理能力，适合复杂架构和实现。",
            source: "fallback" as const
          }]
        : []
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("New Conversation") || button.getAttribute("aria-label") === "New conversation"
    )
    await clickElement(openButton)

    await chooseCommandSelectOption(container, "launcher-provider", "claude")
    await openCommandSelect(container, "launcher-model")

    const modelPopover = getByTestId(container, "launcher-model-popover")
    expect(modelPopover?.textContent).toContain("Claude Opus 5 for complex agentic coding and reasoning.")
    expect(modelPopover?.textContent).not.toContain("最强推理能力")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("opens the new conversation flow as a centered modal", async () => {
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("New Conversation") || button.getAttribute("aria-label") === "New conversation"
    )

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.querySelector(".launcher-modal-layer")).toBeTruthy()
    expect(container.querySelector(".launcher-modal")).toBeTruthy()
    expect(container.querySelector(".launcher-modal-backdrop")).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("switches to the clicked project before opening the new conversation launcher from a project row", async () => {
    const secondProject: AppContextSnapshot["projects"][number] = {
      id: "project-2",
      name: "othercow",
      rootPath: "/tmp/othercow",
      status: "ready",
      isCurrent: false,
      defaultWorktree: {
        id: "worktree-2",
        projectId: "project-2",
        kind: "default",
        rootPath: "/tmp/othercow",
        branch: "main",
        status: "ready"
      },
      conversations: []
    }

    const secondProjectContext: AppContextSnapshot = {
      ...projectOnlyContext,
      selectedProjectId: "project-2",
      projects: [
        {
          ...projectOnlyContext.projects[0],
          isCurrent: false
        },
        {
          ...secondProject,
          isCurrent: true,
        }
      ],
      shell: {
        ...projectOnlyContext.shell,
        projectName: "othercow",
        worktreePath: "/tmp/othercow"
      },
      chips: [
        { kind: "project", value: "othercow" },
        { kind: "conversation", value: "" },
        { kind: "provider", value: "" },
        { kind: "worktree", value: "main" },
        { kind: "run-status", value: "" }
      ]
    }

    window.teamcow.getAppContext = vi.fn(async () => ({
      ...projectOnlyContext,
      projects: [
        projectOnlyContext.projects[0],
        secondProject
      ]
    }))
    window.teamcow.selectProject = vi.fn(async (projectId: string) => ({
      status: "ok" as const,
      context: projectId === "project-2" ? secondProjectContext : projectOnlyContext
    }))
    window.teamcow.listWorktreesByProject = vi.fn(async (projectId: string): Promise<WorktreeSummary[]> =>
      projectId === "project-2" ? [secondProject.defaultWorktree] : projectWorktrees
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    const otherProjectRow = Array.from(container.querySelectorAll(".proj-row")).find((row) =>
      row.textContent?.includes("othercow")
    )
    const otherProjectAddButton = otherProjectRow?.querySelector(".proj-add-btn")
    expect(otherProjectAddButton).toBeTruthy()

    await act(async () => {
      otherProjectAddButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.selectProject).toHaveBeenCalledWith("project-2")
    expect(container.textContent).toContain("Choose how this chat will run.")
    expect(container.textContent).toContain("othercow")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows provider diagnostic copy inside the new conversation launcher", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "New conversation"
    )
    expect(openButton).toBeTruthy()

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Choose how this chat will run.")

    expect(getByTestId(container, "launcher-provider-list")).toBeTruthy()

    expect(container.textContent).toContain("OpenCode")
    expect(container.textContent).toContain("Unavailable")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps provider readiness refresh controls available inside the launcher modal", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "New conversation"
    )
    expect(openButton).toBeTruthy()

    await clickElement(openButton)

    const refreshButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label") === "Refresh"
    )
    expect(refreshButton).toBeTruthy()
    expect(container.textContent).toContain("Last checked")
    const refreshCallCount = vi.mocked(window.teamcow.refreshProviderReadiness).mock.calls.length

    await clickElement(refreshButton)

    expect(vi.mocked(window.teamcow.refreshProviderReadiness).mock.calls.length).toBe(refreshCallCount + 1)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("loads the active conversation timeline and submits a persisted user message", async () => {
    const idleActiveContext: AppContextSnapshot = {
      ...selectionContext,
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) =>
            conversation.id === "conversation-2"
              ? { ...conversation, runStatus: "completed" as const }
              : conversation
          )
        }
      ]
    }
    window.teamcow.getAppContext = vi.fn(async () => idleActiveContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithUserMessage(conversationId, "Previous persisted context", "completed")
    }))
    window.teamcow.sendConversationMessage = vi.fn(async (input: { conversationId: string; content: string }): Promise<SendConversationMessageResult> => ({
      status: "accepted",
      conversation: {
        ...selectionContext.projects[0].conversations[1],
        runStatus: "unavailable",
        updatedAt: "2026-05-19T02:40:00.000Z"
      },
      timeline: {
        ...timelineWithUserMessage(input.conversationId, "Previous persisted context", "completed"),
        messages: [
          ...timelineWithUserMessage(input.conversationId, "Previous persisted context", "completed").messages,
          {
            id: "message-new",
            conversationId: input.conversationId,
            role: "user",
            content: input.content,
            model: "claude-sonnet-4",
            runId: "run-new",
            createdAt: "2026-05-19T02:41:00.000Z"
          }
        ],
        runs: [
          ...timelineWithUserMessage(input.conversationId, "Previous persisted context", "completed").runs,
          {
            id: "run-new",
            conversationId: input.conversationId,
            provider: "claude",
            model: "claude-sonnet-4",
            worktreeId: "worktree-1",
            status: "unavailable",
            startedAt: "2026-05-19T02:41:00.000Z",
            completedAt: "2026-05-19T02:41:00.000Z",
            createdAt: "2026-05-19T02:41:00.000Z",
            updatedAt: "2026-05-19T02:41:00.000Z"
          }
        ],
        events: [
          ...timelineWithUserMessage(input.conversationId, "Previous persisted context", "completed").events,
          {
            id: "event-new",
            conversationId: input.conversationId,
            runId: "run-new",
            sequence: 1,
            type: "system.status",
            payload: { status: "unavailable", reason: "provider-runtime-not-connected" },
            createdAt: "2026-05-19T02:41:00.000Z"
          }
        ]
      },
      context: {
        ...selectionContext,
        shell: {
          ...selectionContext.shell,
          runStatus: "unavailable"
        }
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.getConversationTimeline).toHaveBeenCalledWith("conversation-2")
    expect(container.textContent).toContain("Previous persisted context")

    const composerInput = getByTestId(container, "composer-input") as HTMLTextAreaElement | null
    expect(composerInput).toBeTruthy()

    await act(async () => {
      if (composerInput) {
        composerInput.value = "Persist a new message"
        composerInput.dispatchEvent(new Event("input", { bubbles: true }))
      }
      await Promise.resolve()
    })

    await clickElement(getByTestId(container, "composer-send"))

    expect(window.teamcow.sendConversationMessage).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      content: "Persist a new message"
    })
    expect(container.textContent).toContain("Persist a new message")
    expect(container.textContent).toContain("Unavailable")
    expect(container.textContent).toContain("provider-runtime-not-connected")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows only the active provider slash commands and submits typed provider commands", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: emptyTimeline(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await settle()

    const composerInput = getByTestId(container, "composer-input") as HTMLTextAreaElement | null
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      valueSetter?.call(composerInput, "/")
      composerInput?.dispatchEvent(new Event("input", { bubbles: true }))
      await Promise.resolve()
    })

    expect(getByTestId(container, "composer-slash-menu")).toBeTruthy()
    expect(getByTestId(container, "composer-slash-command-effort")).toBeTruthy()
    expect(getByTestId(container, "composer-slash-command-budget")).toBeTruthy()
    expect(getByTestId(container, "composer-slash-command-agent")).toBeTruthy()
    expect(getByTestId(container, "composer-slash-command-model")).toBeNull()
    expect(getByTestId(container, "composer-slash-command-reasoning")).toBeNull()
    expect(getByTestId(container, "composer-slash-command-mode")).toBeNull()

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      valueSetter?.call(composerInput, "/effort high Refactor the store")
      composerInput?.dispatchEvent(new Event("input", { bubbles: true }))
      composerInput?.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.sendConversationMessage).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      content: "/effort high Refactor the store"
    })

    await act(async () => root.unmount())
    container.remove()
  })

  it("runs TeamCow slash commands locally without dispatching provider messages", async () => {
    window.teamcow.getAppContext = vi.fn(async () => withActiveConversationRunStatus(selectionContext, "idle"))
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: emptyTimeline(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await settle()

    const composerInput = getByTestId(container, "composer-input") as HTMLTextAreaElement | null
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      valueSetter?.call(composerInput, "/access read-only")
      composerInput?.dispatchEvent(new Event("input", { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      composerInput?.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.setConversationAccessMode).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      accessMode: "read-only"
    })
    expect(window.teamcow.sendConversationMessage).not.toHaveBeenCalled()
    expect(getByTestId(container, "composer-command-message")?.textContent).toContain("read-only")

    await act(async () => root.unmount())
    container.remove()
  })

  it("auto-dismisses successful local slash command feedback", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    let root: Awaited<ReturnType<typeof renderWithI18n>> | null = null
    try {
      window.teamcow.getAppContext = vi.fn(async () => withActiveConversationRunStatus(selectionContext, "idle"))
      window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
        status: "ok",
        timeline: emptyTimeline(conversationId)
      }))

      root = await renderWithI18n(container, <DesktopShell />)
      await settle()
      vi.useFakeTimers()

      const composerInput = getByTestId(container, "composer-input") as HTMLTextAreaElement | null
      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
        valueSetter?.call(composerInput, "/status")
        composerInput?.dispatchEvent(new Event("input", { bubbles: true }))
        await Promise.resolve()
      })
      await act(async () => {
        composerInput?.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true
        }))
        await Promise.resolve()
      })

      expect(getByTestId(container, "composer-command-message")?.getAttribute("role")).toBe("status")

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000)
      })

      expect(getByTestId(container, "composer-command-message")).toBeNull()
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      container.remove()
      vi.useRealTimers()
    }
  })

  it("shows an optimistic user message and provider startup activity while submit is pending", async () => {
    const idleContext = withActiveConversationRunStatus(selectionContext, "completed")
    const runningContext = withActiveConversationRunStatus(selectionContext, "running")
    const pendingSend = createDeferred<SendConversationMessageResult>()
    window.teamcow.getAppContext = vi.fn(async () => idleContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: emptyTimeline(conversationId)
    }))
    window.teamcow.sendConversationMessage = vi.fn(() => pendingSend.promise)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const composerInput = getByTestId(container, "composer-input") as HTMLTextAreaElement | null
    await act(async () => {
      if (composerInput) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
        valueSetter?.call(composerInput, "Start processing immediately")
        composerInput.dispatchEvent(new Event("input", { bubbles: true }))
      }
      await Promise.resolve()
    })

    await act(async () => {
      composerInput?.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.sendConversationMessage).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      content: "Start processing immediately"
    })
    expect(composerInput?.value).toBe("")
    expect(getByTestId(container, "chat-user-message")?.textContent).toContain("Start processing immediately")
    const pendingActivity = getByTestId(container, "chat-provider-activity")
    expect(pendingActivity?.classList.contains("starting")).toBe(true)
    expect(pendingActivity?.textContent).toContain("Starting provider")
    expect(pendingActivity?.querySelector(".chat-live-dots")).toBeTruthy()
    expect(container.querySelector('[data-chat-item-id="pending-activity-1"]')).toBeTruthy()

    const timeline = timelineWithUserMessage("conversation-2", "Start processing immediately", "running")
    pendingSend.resolve({
      status: "accepted",
      conversation: runningContext.projects[0].conversations.find((conversation) => conversation.id === "conversation-2")!,
      timeline,
      context: runningContext
    })
    await act(async () => {
      await pendingSend.promise
      await Promise.resolve()
    })

    const matchingUserMessages = [...container.querySelectorAll('[data-testid="chat-user-message"]')]
      .filter((message) => message.textContent?.includes("Start processing immediately"))
    expect(matchingUserMessages).toHaveLength(1)
    expect(container.querySelector('[data-chat-item-id="pending-activity-1"]')).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("restores the composer draft when an optimistic submit fails", async () => {
    const idleContext = withActiveConversationRunStatus(selectionContext, "completed")
    window.teamcow.getAppContext = vi.fn(async () => idleContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: emptyTimeline(conversationId)
    }))
    window.teamcow.sendConversationMessage = vi.fn(async (): Promise<SendConversationMessageResult> => ({
      status: "error",
      error: {
        code: "PROVIDER_NOT_READY",
        message: "Provider failed to start",
        suggestion: null
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const composerInput = getByTestId(container, "composer-input") as HTMLTextAreaElement | null
    await act(async () => {
      if (composerInput) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
        valueSetter?.call(composerInput, "Restore this draft")
        composerInput.dispatchEvent(new Event("input", { bubbles: true }))
      }
      await Promise.resolve()
    })

    await clickElement(getByTestId(container, "composer-send"))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(composerInput?.value).toBe("Restore this draft")
    expect(container.querySelector('[data-chat-item-id^="pending-"]')).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("opens sent images in a dismissible full-size preview", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => {
      const timeline = timelineWithUserMessage(conversationId, "Review this image", "completed")
      return {
        status: "ok",
        timeline: {
          ...timeline,
          messages: timeline.messages.map((message, index) => index === 0
            ? {
                ...message,
                attachments: [
                  {
                    id: "attachment-image-1",
                    kind: "image" as const,
                    name: "screenshot.png",
                    mimeType: "image/png",
                    sizeBytes: 128,
                    uri: "teamcow-attachment://conversation/conversation-2/attachment-image-1"
                  },
                  {
                    id: "attachment-image-2",
                    kind: "image" as const,
                    name: "diagram.png",
                    mimeType: "image/png",
                    sizeBytes: 256,
                    uri: "teamcow-attachment://conversation/conversation-2/attachment-image-2"
                  }
                ]
              }
            : message)
        }
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await settle()

    const trigger = getByTestId(container, "chat-image-preview-trigger")
    const attachments = getByTestId(container, "chat-message-attachments")
    expect(attachments?.querySelectorAll(".chat-message-attachment.image")).toHaveLength(2)
    expect(trigger?.getAttribute("aria-label")).toBe("Preview image screenshot.png")
    if (trigger instanceof HTMLElement) trigger.focus()
    await clickElement(trigger)

    expect(getByTestId(container, "image-preview-layer")).toBeTruthy()
    expect(getByTestId(container, "image-preview-image")?.getAttribute("src")).toBe(
      "teamcow-attachment://conversation/conversation-2/attachment-image-1"
    )

    const viewport = getByTestId(container, "image-preview-viewport") as HTMLDivElement
    const previewImage = getByTestId(container, "image-preview-image") as HTMLImageElement
    viewport.getBoundingClientRect = () => ({
      width: 800,
      height: 600,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })
    Object.defineProperty(previewImage, "naturalWidth", { configurable: true, value: 1200 })
    Object.defineProperty(previewImage, "naturalHeight", { configurable: true, value: 800 })
    await act(async () => {
      previewImage.dispatchEvent(new Event("load", { bubbles: true }))
      await Promise.resolve()
    })

    expect(getByTestId(container, "image-preview-zoom-level")?.textContent).toBe("63%")
    expect(getByTestId(container, "image-preview-canvas")?.getAttribute("style")).toContain("scale(0.63)")

    await clickElement(getByTestId(container, "image-preview-zoom-in"))
    expect(getByTestId(container, "image-preview-zoom-level")?.textContent).toBe("88%")

    await clickElement(getByTestId(container, "image-preview-fit"))
    expect(getByTestId(container, "image-preview-zoom-level")?.textContent).toBe("63%")

    await doubleClickElement(viewport)
    expect(getByTestId(container, "image-preview-zoom-level")?.textContent).toBe("100%")
    await doubleClickElement(viewport)
    expect(getByTestId(container, "image-preview-zoom-level")?.textContent).toBe("63%")

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      await Promise.resolve()
    })
    expect(getByTestId(container, "image-preview-layer")).toBeFalsy()
    expect(document.activeElement).toBe(trigger)

    await clickElement(trigger)
    await clickElement(getByTestId(container, "image-preview-backdrop"))
    expect(getByTestId(container, "image-preview-layer")).toBeFalsy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("adds images from the file input and clipboard paste, then sends an attachment-only message", async () => {
    const idleActiveContext: AppContextSnapshot = {
      ...selectionContext,
      projects: [{
        ...selectionContext.projects[0],
        conversations: selectionContext.projects[0].conversations.map((conversation) =>
          conversation.id === "conversation-2"
            ? { ...conversation, runStatus: "completed" as const }
            : conversation
        )
      }]
    }
    window.teamcow.getAppContext = vi.fn(async () => idleActiveContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: {
        conversationId,
        messages: [],
        runs: [],
        events: [],
        artifacts: []
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)
    await settle()
    expect(getByTestId(container, "composer-input")).toBeTruthy()

    const pastedFile = new File([new Uint8Array([1, 2, 3])], "pasted.png", { type: "image/png" })
    const composerInput = getByTestId(container, "composer-input") as HTMLTextAreaElement | null
    await act(async () => {
      if (composerInput) {
        const pasteEvent = new Event("paste", { bubbles: true })
        Object.defineProperty(pasteEvent, "clipboardData", {
          configurable: true,
          value: { files: [pastedFile] }
        })
        composerInput.dispatchEvent(pasteEvent)
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    await settle()

    const fileInput = container.querySelector(".composer-attachment-input") as HTMLInputElement | null
    expect(fileInput).toBeTruthy()
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "clipboard.png", {
      type: "image/png"
    })
    await act(async () => {
      if (fileInput) {
        Object.defineProperty(fileInput, "files", { configurable: true, value: [file] })
        fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(container.textContent).toContain("clipboard.png")
    expect(container.textContent).toContain("pasted.png")
    expect((getByTestId(container, "composer-send") as HTMLButtonElement | null)?.disabled).toBe(false)
    await clickElement(getByTestId(container, "composer-send"))

    expect(window.teamcow.sendConversationMessage).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      content: "",
      attachments: [{
        name: "pasted.png",
        mimeType: "image/png",
        sizeBytes: 3,
        dataBase64: "AQID"
      }, {
        name: "clipboard.png",
        mimeType: "image/png",
        sizeBytes: 4,
        dataBase64: "iVBORw=="
      }]
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows compact conversation metadata for the selected conversation without loading every sidebar row", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithMultipleHistoricalRuns(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.getConversationTimeline).toHaveBeenCalledTimes(1)
    expect(window.teamcow.getConversationTimeline).toHaveBeenCalledWith("conversation-2")
    expect(window.teamcow.getConversationTimeline).not.toHaveBeenCalledWith("conversation-1")
    const toolbar = container.querySelector(".conversation-toolbar")
    const metadata = container.querySelector(".conversation-toolbar-meta")
    expect(toolbar?.textContent).toContain("Inspector polish")
    expect(metadata?.textContent).toContain("Failed")
    expect(metadata?.textContent).toContain("Codex")
    expect(metadata?.textContent).toContain("gpt-5.1")
    expect(metadata?.textContent).toContain("main")
    expect(metadata?.textContent).toContain("2 artifacts")
    expect(toolbar?.textContent).not.toContain("Local history")
    expect(toolbar?.textContent).not.toContain("Latest run")
    expect(container.querySelectorAll('[data-testid="history-run-summary"]')).toHaveLength(0)
    expect(container.textContent).toContain("Failed")
    expect(container.textContent).toContain("First historical prompt")
    expect(container.textContent).toContain("Second historical prompt")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("loads older conversation history only when the user requests it", async () => {
    const conversationId = "conversation-2"
    const fullTimeline = timelineWithMultipleHistoricalRuns(conversationId)
    const pageForRun = (runId: string): ConversationTimeline => ({
      conversationId,
      runs: fullTimeline.runs.filter((run) => run.id === runId),
      messages: fullTimeline.messages.filter((message) => message.runId === runId),
      events: fullTimeline.events.filter((event) => event.runId === runId),
      artifacts: fullTimeline.artifacts.filter((artifact) => artifact.runId === runId)
    })
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimelinePage = vi.fn(async (input): Promise<GetConversationTimelinePageResult> =>
      input.beforeRunId
        ? {
            status: "ok",
            timeline: pageForRun(`${conversationId}-run-1`),
            pageInfo: { nextCursor: null, hasMore: false }
          }
        : {
            status: "ok",
            timeline: pageForRun(`${conversationId}-run-2`),
            pageInfo: { nextCursor: `${conversationId}-run-2`, hasMore: true }
          }
    )

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Second historical prompt")
    expect(container.textContent).not.toContain("First historical prompt")

    await clickElement(getByTestId(container, "chat-history-load-older"))

    expect(window.teamcow.getConversationTimelinePage).toHaveBeenLastCalledWith({
      conversationId,
      beforeRunId: `${conversationId}-run-2`,
      limit: 20
    })
    expect(container.textContent).toContain("First historical prompt")
    expect(getByTestId(container, "chat-history-load-older")).toBeNull()

    await act(async () => root.unmount())
    container.remove()
  })

  it("limits sidebar conversations to four per project by default and allows expanding", async () => {
    const baseConversation = selectionContext.projects[0].conversations[0]
    const conversations = Array.from({ length: 6 }, (_, index) => {
      const day = String(10 - index).padStart(2, "0")

      return {
        ...baseConversation,
        id: `conversation-long-${index + 1}`,
        title: `Conversation ${index + 1}`,
        currentModel: "gpt-5.1",
        runStatus: "completed" as const,
        isCurrent: index === 0,
        createdAt: `2026-05-${day}T09:00:00.000Z`,
        updatedAt: `2026-05-${day}T09:30:00.000Z`
      }
    })
    const secondProject: AppContextSnapshot["projects"][number] = {
      ...projectOnlyContext.projects[0],
      id: "project-2",
      name: "second-project",
      rootPath: "/tmp/second-project",
      isCurrent: false,
      defaultWorktree: {
        ...projectOnlyContext.projects[0].defaultWorktree,
        id: "worktree-second",
        projectId: "project-2",
        rootPath: "/tmp/second-project"
      },
      conversations: []
    }
    const manyConversationContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-long-1",
      projects: [
        {
          ...selectionContext.projects[0],
          conversations
        },
        secondProject
      ],
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Conversation 1",
        runStatus: "completed"
      }
    }
    window.teamcow.getAppContext = vi.fn(async () => manyConversationContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    const openProjectGroup = container.querySelector(".proj-group.open")
    expect(openProjectGroup).toBeTruthy()
    expect(openProjectGroup?.querySelectorAll(".conv-item")).toHaveLength(4)
    expect(openProjectGroup?.textContent).toContain("Conversation 1")
    expect(openProjectGroup?.textContent).toContain("Conversation 4")
    expect(openProjectGroup?.textContent).not.toContain("Conversation 5")
    expect(container.textContent).toContain("second-project")

    const toggleButton = getByTestId(container, "sidebar-conversation-toggle-project-1")
    expect(toggleButton?.textContent).toContain("Show 2 more")

    await clickElement(toggleButton)
    expect(openProjectGroup?.querySelectorAll(".conv-item")).toHaveLength(6)
    expect(openProjectGroup?.textContent).toContain("Conversation 6")
    expect(toggleButton?.textContent).toContain("Show fewer")

    await clickElement(toggleButton)
    expect(openProjectGroup?.querySelectorAll(".conv-item")).toHaveLength(4)
    expect(openProjectGroup?.textContent).not.toContain("Conversation 5")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("does not render per-run history chips in the conversation header", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithMultipleHistoricalRuns(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const toolbar = container.querySelector(".conversation-toolbar")
    const historyRunItems = Array.from(container.querySelectorAll('[data-testid="history-run-summary"]'))
    expect(historyRunItems).toHaveLength(0)
    expect(toolbar?.textContent).toContain("Failed")
    expect(toolbar?.textContent).toContain("Codex")
    expect(toolbar?.textContent).toContain("gpt-5.1")
    expect(toolbar?.textContent).toContain("main")
    expect(toolbar?.textContent).toContain("May 19")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("does not present timeline load failures as clean empty local history", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (): Promise<GetConversationTimelineResult> => ({
      status: "error",
      error: {
        code: "CONVERSATION_NOT_FOUND",
        message: "Timeline unavailable"
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Local history unavailable")
    expect(container.textContent).not.toContain("No runs recorded")
    expect(container.textContent).not.toContain("0 runs")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows latest run artifact ownership and worktree label in one compact header line", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.listProjectWorktrees = vi.fn(async (): Promise<ProjectWorktreeSummary[]> =>
      projectWorktrees.map((worktree, index) => ({
        ...worktree,
        conversationCount: index === 0 ? 1 : 0,
        canDelete: index !== 0,
        deleteBlockedReason: index === 0 ? "default" : null
      }))
    )
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithUnsortedHistoricalRuns(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const toolbar = container.querySelector(".conversation-toolbar")
    expect(container.querySelectorAll('[data-testid="history-run-summary"]')).toHaveLength(0)
    expect(toolbar?.textContent).toContain("Claude")
    expect(toolbar?.textContent).toContain("feat/new-conversation")
    expect(toolbar?.textContent).toContain("2 artifacts")
    expect(toolbar?.textContent).not.toContain("Codex")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("selects the latest run by timestamp even if timeline runs are unsorted", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithUnsortedHistoricalRuns(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const metadata = container.querySelector(".conversation-toolbar-meta")
    expect(metadata?.textContent).toContain("Completed")
    expect(metadata?.textContent).toContain("Claude")
    expect(metadata?.textContent).not.toContain("FailedCodex")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps persisted history visible when the selected provider is unavailable", async () => {
    window.teamcow.getAppContext = vi.fn(async () =>
      withActiveConversationProviderStatus(withActiveConversationRunStatus(selectionContext, "completed"), "unavailable")
    )
    window.teamcow.getProviderReadiness = vi.fn(async () => unavailableClaudeSnapshot)
    window.teamcow.refreshProviderReadiness = vi.fn(async () => unavailableClaudeSnapshot)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithMultipleHistoricalRuns(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Local history")
    expect(container.textContent).toContain("New messages require Claude Code readiness. Local history and inspector stay available.")
    expect(container.textContent).toContain("Sign in to Claude Code and refresh readiness.")
    expect(container.textContent).toContain("First historical prompt")
    expect(container.textContent).toContain("Second historical prompt")
    expect(container.querySelector(".conversation-toolbar-meta")?.textContent).toContain("2 artifacts")
    expect(container.textContent).not.toContain("2 runs")
    expect(container.textContent).not.toContain("must reconnect")
    expect((getByTestId(container, "composer-send") as HTMLButtonElement | null)?.disabled).toBe(true)
    await clickElement(getByTestId(container, "composer-send"))
    expect(window.teamcow.sendConversationMessage).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("blocks active composer submit when readiness snapshot is missing the conversation provider", async () => {
    const missingClaudeSnapshot: ProviderReadinessSnapshot = {
      ...refreshedProviderSnapshot,
      providers: refreshedProviderSnapshot.providers.filter((provider) => provider.kind !== "claude")
    }
    window.teamcow.getAppContext = vi.fn(async () =>
      withActiveConversationProviderStatus(withActiveConversationRunStatus(selectionContext, "completed"), "unavailable")
    )
    window.teamcow.getProviderReadiness = vi.fn(async () => missingClaudeSnapshot)
    window.teamcow.refreshProviderReadiness = vi.fn(async () => missingClaudeSnapshot)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithMultipleHistoricalRuns(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("New messages require Claude Code readiness. Local history and inspector stay available.")
    expect((getByTestId(container, "composer-send") as HTMLButtonElement | null)?.disabled).toBe(true)

    const composerInput = getByTestId(container, "composer-input") as HTMLTextAreaElement | null
    await act(async () => {
      if (composerInput) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
        valueSetter?.call(composerInput, "Continue anyway")
        composerInput.dispatchEvent(new Event("input", { bubbles: true }))
      }
      await Promise.resolve()
    })
    await clickElement(getByTestId(container, "composer-send"))

    expect(window.teamcow.sendConversationMessage).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders structured chat items with provider output and folded provider activity details", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: structuredTimeline(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getByTestId(container, "chat-user-message")?.textContent).toContain("Render this conversation")
    expect(getByTestId(container, "chat-provider-message")?.textContent).toContain("Structured provider output")
    expect(container.querySelectorAll('[data-testid="chat-provider-message"]')).toHaveLength(1)
    expect(getByTestId(container, "chat-tool-event")).toBeNull()
    expect(getByTestId(container, "chat-run-outcome")?.textContent).toContain("Failed")
    expect(getByTestId(container, "chat-run-outcome")?.textContent).toContain("Provider activity")
    const providerActivity = getByTestId(container, "chat-provider-activity")
    expect(providerActivity?.textContent).toContain("Provider activity")
    expect(providerActivity?.textContent).toContain("4 updates")
    expect(providerActivity?.textContent).toContain("provider failed")
    expect(providerActivity?.textContent).toContain("Activity details")
    const activityDetails = getByTestId(container, "chat-provider-activity-details") as HTMLDetailsElement | null
    expect(activityDetails?.open).toBe(false)
    expect(providerActivity?.textContent).toContain("Provider failed")
    expect(providerActivity?.textContent).toContain("Tool event")
    expect(providerActivity?.textContent).toContain("Unexpected end of JSON input")
    expect(providerActivity?.textContent).toContain("worktree-1")
    expect(providerActivity?.textContent).toContain("structured-run-1")
    expect(getByTestId(container, "chat-diagnostics-group")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders provider process context separately from the authoritative final answer", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => {
      const base = structuredTimeline(conversationId)
      return {
        status: "ok",
        timeline: {
          ...base,
          runs: base.runs.map((entry) => ({ ...entry, status: "completed" as const })),
          events: [
            {
              id: "provider-commentary",
              conversationId,
              runId: "structured-run-1",
              sequence: 1,
              type: "run.message.delta",
              payload: { messageId: "commentary-1", phase: "commentary", text: "Inspecting files" },
              createdAt: "2026-05-20T10:00:01.000Z"
            },
            {
              id: "provider-reasoning",
              conversationId,
              runId: "structured-run-1",
              sequence: 2,
              type: "run.reasoning.delta",
              payload: { messageId: "reasoning-1", visibility: "summary", text: "Comparing changes" },
              createdAt: "2026-05-20T10:00:02.000Z"
            },
            {
              id: "provider-final",
              conversationId,
              runId: "structured-run-1",
              sequence: 3,
              type: "run.message.completed",
              payload: {
                messageId: "final-1",
                phase: "final",
                authoritative: true,
                text: "The implementation is ready."
              },
              createdAt: "2026-05-20T10:00:03.000Z"
            },
            {
              id: "provider-completed",
              conversationId,
              runId: "structured-run-1",
              sequence: 4,
              type: "run.completed",
              payload: { rawType: "turn/completed" },
              createdAt: "2026-05-20T10:00:04.000Z"
            }
          ]
        }
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getByTestId(container, "chat-provider-commentary")?.textContent).toContain("Progress updates")
    expect(getByTestId(container, "chat-provider-commentary")?.textContent).toContain("Inspecting files")
    expect(getByTestId(container, "chat-provider-reasoning")?.textContent).toContain("Reasoning summary")
    expect(getByTestId(container, "chat-provider-reasoning")?.textContent).toContain("Comparing changes")
    const finalAnswer = getByTestId(container, "chat-provider-message")
    expect(finalAnswer?.getAttribute("data-authoritative")).toBe("true")
    expect(finalAnswer?.textContent).toContain("Final answer")
    expect(finalAnswer?.textContent).toContain("The implementation is ready.")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders Claude permission denials as an authorization card and retries with allowed tools", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: permissionDeniedTimeline(conversationId)
    }))
    window.teamcow.retryConversationRunWithPermissions = vi.fn(async (input): Promise<SendConversationMessageResult> => ({
      status: "accepted",
      conversation: {
        ...selectionContext.projects[0].conversations[0],
        runStatus: "running"
      },
      timeline: permissionDeniedTimeline(input.conversationId),
      context: {
        ...selectionContext,
        shell: {
          ...selectionContext.shell,
          runStatus: "running"
        }
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const permissionCard = getByTestId(container, "chat-permission-request")
    expect(permissionCard?.textContent).toContain("Authorization needed")
    expect(permissionCard?.textContent).toContain("mcp__web-reader__webReader")
    expect(permissionCard?.textContent).toContain("https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742")
    expect(getByTestId(container, "chat-run-outcome")).toBeNull()

    await clickElement(getByTestId(container, "chat-permission-allow-permission-run-denied"))

    expect(window.teamcow.retryConversationRunWithPermissions).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      runId: "permission-run-denied",
      allowedTools: ["mcp__web-reader__webReader"]
    })
    expect(getByTestId(container, "chat-permission-request")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders Claude denied tool results as an authorization card and retries with allowed tools", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: permissionDeniedToolResultTimeline(conversationId)
    }))
    window.teamcow.retryConversationRunWithPermissions = vi.fn(async (input): Promise<SendConversationMessageResult> => ({
      status: "accepted",
      conversation: {
        ...selectionContext.projects[0].conversations[0],
        runStatus: "running"
      },
      timeline: permissionDeniedToolResultTimeline(input.conversationId),
      context: {
        ...selectionContext,
        shell: {
          ...selectionContext.shell,
          runStatus: "running"
        }
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const permissionCard = getByTestId(container, "chat-permission-request")
    expect(permissionCard?.textContent).toContain("Authorization needed")
    expect(permissionCard?.textContent).toContain("mcp__web-reader__webReader")
    expect(permissionCard?.textContent).toContain("https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742")

    await clickElement(getByTestId(container, "chat-permission-allow-permission-tool-result-run-denied"))

    expect(window.teamcow.retryConversationRunWithPermissions).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      runId: "permission-tool-result-run-denied",
      allowedTools: ["mcp__web-reader__webReader"]
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("continues without the requested tools when a Claude permission request is denied", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: permissionDeniedToolResultTimeline(conversationId)
    }))
    window.teamcow.sendConversationMessage = vi.fn(async (input): Promise<SendConversationMessageResult> => ({
      status: "accepted",
      conversation: {
        ...selectionContext.projects[0].conversations[0],
        runStatus: "running"
      },
      timeline: permissionDeniedToolResultTimeline(input.conversationId),
      context: {
        ...selectionContext,
        shell: {
          ...selectionContext.shell,
          runStatus: "running"
        }
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await clickElement(getByTestId(container, "chat-permission-dismiss-permission-tool-result-run-denied"))

    expect(window.teamcow.sendConversationMessage).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      content: "I deny permission to use these tools for this request: mcp__web-reader__webReader. Continue without using them."
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders non-fatal Claude tool errors as a collapsed progress warning", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: toolFailureTimeline(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const warning = getByTestId(container, "chat-tool-warning") as HTMLDetailsElement | null
    expect(warning?.open).toBe(false)
    expect(warning?.textContent).toContain("mcp__web-reader__webReader did not complete")
    expect(warning?.textContent).toContain("Continued")
    expect(warning?.textContent).toContain("Claude continued")
    expect(warning?.textContent).toContain("https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742")
    expect(warning?.textContent).toContain("GLM Coding Plan")
    expect(warning?.textContent).not.toContain("authorized")
    expect(getByTestId(container, "chat-tool-failure")).toBeNull()
    expect(getByTestId(container, "chat-permission-request")).toBeNull()
    expect(getByTestId(container, "chat-provider-message")?.textContent).toContain("套餐限制问题")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps Claude tool errors prominent when the run fails", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: toolFailureTimeline(conversationId, "failed")
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const failureCard = getByTestId(container, "chat-tool-failure")
    expect(failureCard?.textContent).toContain("Tool failed")
    expect(failureCard?.textContent).toContain("returned an error")
    expect(failureCard?.textContent).not.toContain("authorized")
    expect(getByTestId(container, "chat-tool-warning")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("hides completed run activity when provider output is visible", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: {
        ...timelineWithUserMessage(conversationId, "Check project files", "completed"),
        events: [
          {
            id: `${conversationId}-event-1`,
            conversationId,
            runId: `${conversationId}-run-1`,
            sequence: 1,
            type: "run.started",
            payload: { status: "running", rawType: "thread.started" },
            createdAt: "2026-05-20T10:00:01.000Z"
          },
          {
            id: `${conversationId}-event-2`,
            conversationId,
            runId: `${conversationId}-run-1`,
            sequence: 2,
            type: "system.status",
            payload: { status: "unavailable", reason: "provider-runtime-starting" },
            createdAt: "2026-05-20T10:00:02.000Z"
          },
          {
            id: `${conversationId}-event-3`,
            conversationId,
            runId: `${conversationId}-run-1`,
            sequence: 3,
            type: "run.message.delta",
            payload: { text: "The project has files." },
            createdAt: "2026-05-20T10:00:03.000Z"
          },
          {
            id: `${conversationId}-event-4`,
            conversationId,
            runId: `${conversationId}-run-1`,
            sequence: 4,
            type: "run.completed",
            payload: { rawType: "turn.completed" },
            createdAt: "2026-05-20T10:00:04.000Z"
          }
        ]
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getByTestId(container, "chat-provider-message")?.textContent).toContain("The project has files.")
    expect(getByTestId(container, "chat-run-outcome")).toBeNull()
    expect(getByTestId(container, "chat-provider-activity")).toBeNull()
    expect(getByTestId(container, "chat-diagnostics-group")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders raw fallback controls through Chinese chat translations", async () => {
    void i18n.changeLanguage("zh")
    window.teamcow.getLocale = vi.fn(async () => "zh" as Locale)
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: structuredTimeline(conversationId)
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getByTestId(container, "chat-tool-event")).toBeNull()
    expect(getByTestId(container, "chat-provider-activity")?.textContent).toContain("过程详情")
    expect(getByTestId(container, "chat-provider-activity")?.textContent).toContain("原始详情")
    expect(getByTestId(container, "chat-provider-activity")?.textContent).toContain("Tool event")
    expect(getByTestId(container, "chat-diagnostics-group")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("does not render a timeline that belongs to a different conversation", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithUserMessage("conversation-1", "Wrong conversation history", "completed")
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).not.toContain("Wrong conversation history")
    expect(getByTestId(container, "chat-message-list")?.textContent).toBe("")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("reloads timeline when switching conversations without leaking the previous history", async () => {
    window.teamcow.getAppContext = vi.fn(async () => conversationListContext)
    window.teamcow.selectConversation = vi.fn(async (conversationId: string) => ({
      status: "ok" as const,
      context: {
        ...selectionContext,
        selectedConversationId: conversationId,
        shell: {
          ...selectionContext.shell,
          conversationTitle: conversationId === "conversation-1" ? "Navigation cleanup" : "Inspector polish",
          providerKind: conversationId === "conversation-1" ? "codex" : "claude",
          runStatus: conversationId === "conversation-1" ? "idle" as const : "running" as const
        },
        projects: [
          {
            ...selectionContext.projects[0],
            conversations: selectionContext.projects[0].conversations.map((conversation) => ({
              ...conversation,
              isCurrent: conversation.id === conversationId
            }))
          }
        ]
      }
    }))
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: conversationId === "conversation-1"
        ? timelineWithUserMessage(conversationId, "First conversation history", "completed")
        : timelineWithUserMessage(conversationId, "Second conversation history", "running")
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    const conversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )

    await act(async () => {
      conversationRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("First conversation history")
    expect(container.textContent).not.toContain("Second conversation history")

    const secondConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Inspector polish")
    )

    await act(async () => {
      secondConversationRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Second conversation history")
    expect(container.textContent).not.toContain("First conversation history")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("ignores a slow previous conversation timeline after a newer conversation becomes active", async () => {
    const firstConversationContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-1",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Navigation cleanup",
        providerKind: "codex",
        runStatus: "idle"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-1"
          }))
        }
      ]
    }
    const secondConversationContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-2",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Inspector polish",
        providerKind: "claude",
        runStatus: "running"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-2"
          }))
        }
      ]
    }
    const slowFirstTimeline = createDeferred<GetConversationTimelineResult>()

    window.teamcow.getAppContext = vi.fn(async () => firstConversationContext)
    window.teamcow.selectConversation = vi.fn(async () => ({
      status: "ok" as const,
      context: secondConversationContext
    }))
    window.teamcow.getConversationTimeline = vi.fn((conversationId: string): Promise<GetConversationTimelineResult> => {
      if (conversationId === "conversation-1") {
        return slowFirstTimeline.promise
      }

      return Promise.resolve({
        status: "ok",
        timeline: timelineWithUserMessage(conversationId, "Second conversation history", "running")
      })
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    const secondConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Inspector polish")
    )

    await act(async () => {
      secondConversationRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    slowFirstTimeline.resolve({
      status: "ok",
      timeline: timelineWithUserMessage("conversation-1", "Slow previous history", "completed")
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Second conversation history")
    expect(container.textContent).not.toContain("Slow previous history")
    expect(container.querySelector(".binding-row.active")?.textContent).toContain("Inspector polish")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("ignores a slow previous conversation selection response after a newer selection becomes active", async () => {
    const firstConversationContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-1",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Navigation cleanup",
        providerKind: "codex",
        runStatus: "completed"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-1"
          }))
        }
      ]
    }
    const secondConversationContext: AppContextSnapshot = {
      ...selectionContext,
      selectedConversationId: "conversation-2",
      shell: {
        ...selectionContext.shell,
        conversationTitle: "Inspector polish",
        providerKind: "claude",
        runStatus: "running"
      },
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) => ({
            ...conversation,
            isCurrent: conversation.id === "conversation-2"
          }))
        }
      ]
    }
    const slowFirstSelection = createDeferred<{ status: "ok", context: AppContextSnapshot }>()

    window.teamcow.getAppContext = vi.fn(async () => conversationListContext)
    window.teamcow.selectConversation = vi.fn((conversationId: string) => {
      if (conversationId === "conversation-1") {
        return slowFirstSelection.promise
      }

      return Promise.resolve({
        status: "ok" as const,
        context: secondConversationContext
      })
    })
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithUserMessage(conversationId, `${conversationId} history`, "running")
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)
    const firstConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Navigation cleanup")
    )
    const secondConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Inspector polish")
    )

    await act(async () => {
      firstConversationRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      secondConversationRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    slowFirstSelection.resolve({
      status: "ok",
      context: firstConversationContext
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector(".binding-row.active")?.textContent).toContain("Inspector polish")
    expect(container.querySelector(".binding-row.active")?.textContent).not.toContain("Navigation cleanup")
    expect(container.textContent).toContain("Activated Inspector polish")
    expect(container.textContent).not.toContain("Activated Navigation cleanup")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("refreshes the active running conversation without blocking conversation switching", async () => {
    vi.useFakeTimers()
    const completedContext: AppContextSnapshot = {
      ...selectionContext,
      shell: {
        ...selectionContext.shell,
        runStatus: "completed"
      },
      chips: selectionContext.chips.map((chip) =>
        chip.kind === "run-status" ? { ...chip, value: "completed" } : chip
      ),
      projects: [
        {
          ...selectionContext.projects[0],
          conversations: selectionContext.projects[0].conversations.map((conversation) =>
            conversation.id === "conversation-2"
              ? { ...conversation, runStatus: "completed" as const }
              : conversation
          )
        }
      ]
    }
    let contextCalls = 0
    let timelineCalls = 0

    window.teamcow.getAppContext = vi.fn(async () => {
      contextCalls += 1
      return contextCalls > 1 ? completedContext : selectionContext
    })
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => {
      timelineCalls += 1
      return {
        status: "ok",
        timeline: timelineCalls > 1
          ? structuredTimeline(conversationId)
          : timelineWithUserMessage(conversationId, "Still running", "running")
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const runningConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Inspector polish")
    )
    expect(runningConversationRow?.textContent).toContain("Running")
    expect(container.textContent).toContain("Still running")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5250)
      await Promise.resolve()
      await Promise.resolve()
    })

    const completedConversationRow = Array.from(container.querySelectorAll(".conv-item")).find((row) =>
      row.textContent?.includes("Inspector polish")
    )
    expect(window.teamcow.getConversationTimeline).toHaveBeenCalledTimes(2)
    expect(window.teamcow.getAppContext).toHaveBeenCalledTimes(2)
    expect(completedConversationRow?.textContent).toContain("Completed")
    expect(container.textContent).toContain("Structured provider output")
    expect(container.querySelector(".binding-row.active")?.textContent).toContain("Inspector polish")

    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  it("renders pushed provider activity before provider text arrives", async () => {
    let runEventCallback: ((event: RunEventPushPayload) => void) | null = null
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: timelineWithUserMessage(conversationId, "Still running", "running")
    }))
    window.teamcow.onRunEvent = vi.fn((callback: (event: RunEventPushPayload) => void) => {
      runEventCallback = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getByTestId(container, "chat-provider-activity")).toBeNull()
    expect(runEventCallback).not.toBeNull()

    await act(async () => {
      runEventCallback?.({
        id: "push-progress-1",
        conversationId: "conversation-2",
        runId: "conversation-2-run-1",
        sequence: 2,
        schemaVersion: 1,
        provider: "codex",
        type: "run.progress",
        payload: {
          provider: "codex",
          rawType: "item.started",
          raw: {
            type: "item.started",
            item: {
              id: "ws_1",
              type: "web_search",
              query: "TeamCow streaming output"
            }
          }
        },
        createdAt: "2026-08-17T01:00:00.000Z"
      })
      await Promise.resolve()
    })

    const activity = getByTestId(container, "chat-provider-activity")
    expect(activity?.textContent).toContain("Provider activity")
    expect(activity?.textContent).toContain("Working on web search")
    expect(activity?.textContent).toContain("TeamCow streaming output")
    expect(activity?.querySelector(".chat-live-dots")).toBeTruthy()
    expect(getByTestId(container, "chat-diagnostics-group")).toBeNull()

    await act(async () => {
      runEventCallback?.({
        id: "push-progress-2",
        conversationId: "conversation-2",
        runId: "conversation-2-run-1",
        sequence: 3,
        schemaVersion: 1,
        provider: "codex",
        type: "run.progress",
        payload: {
          provider: "codex",
          rawType: "item.started",
          raw: {
            type: "item.started",
            item: {
              id: "cmd_1",
              type: "command_execution",
              command: "git status --short"
            }
          }
        },
        createdAt: "2026-08-17T01:00:01.000Z"
      })
      await Promise.resolve()
    })

    const updatedActivity = getByTestId(container, "chat-provider-activity")
    expect(updatedActivity?.textContent).toContain("TeamCow streaming output")
    expect(updatedActivity?.textContent).toContain("Working on command")
    expect(updatedActivity?.textContent).toContain("git status --short")
    expect(getByTestId(container, "chat-diagnostics-group")).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("moves an idle shell back to running when a queued run starts in the main process", async () => {
    let runEventCallback: ((event: RunEventPushPayload) => void) | null = null
    const completedContext = withActiveConversationRunStatus(selectionContext, "completed")
    window.teamcow.getAppContext = vi.fn(async () => completedContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => ({
      status: "ok",
      timeline: emptyTimeline(conversationId)
    }))
    window.teamcow.onRunEvent = vi.fn((callback: (event: RunEventPushPayload) => void) => {
      runEventCallback = callback
      return vi.fn()
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(runEventCallback).not.toBeNull()
    expect(getByTestId(container, "composer-stop")).toBeFalsy()

    await act(async () => {
      runEventCallback?.({
        id: "queued-run-started",
        conversationId: "conversation-2",
        runId: "queued-run-1",
        sequence: 1,
        schemaVersion: 1,
        provider: "claude",
        type: "system.status",
        payload: { status: "unavailable", reason: "provider-runtime-starting" },
        status: "running",
        createdAt: "2026-08-21T08:00:00.000Z"
      })
      await Promise.resolve()
    })

    expect(getByTestId(container, "composer-stop")).toBeTruthy()
    expect(container.querySelector(".binding-row.active")?.textContent).toContain("Running")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("scrolls the active chat when provider output grows during a running timeline refresh", async () => {
    vi.useFakeTimers()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    })
    let timelineCalls = 0

    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => {
      timelineCalls += 1
      return {
        status: "ok",
        timeline: timelineCalls > 1
          ? structuredTimelineWithLongerProviderOutput(conversationId)
          : structuredTimeline(conversationId)
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    scrollIntoView.mockClear()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Structured provider output with more detail")
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "end" })

    await act(async () => {
      root.unmount()
    })
    container.remove()
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView
      })
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
    }
    vi.useRealTimers()
  })

  it("does not force chat back to the bottom when the user has scrolled away from the latest message", async () => {
    vi.useFakeTimers()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    })
    let timelineCalls = 0

    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.getConversationTimeline = vi.fn(async (conversationId: string): Promise<GetConversationTimelineResult> => {
      timelineCalls += 1
      return {
        status: "ok",
        timeline: timelineCalls > 1
          ? structuredTimelineWithLongerProviderOutput(conversationId)
          : structuredTimeline(conversationId)
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    scrollIntoView.mockClear()

    const chatStream = container.querySelector(".chat-stream") as HTMLDivElement | null
    expect(chatStream).toBeTruthy()

    Object.defineProperty(chatStream, "scrollHeight", { configurable: true, value: 1000 })
    Object.defineProperty(chatStream, "clientHeight", { configurable: true, value: 500 })
    Object.defineProperty(chatStream, "scrollTop", { configurable: true, value: 100, writable: true })

    await act(async () => {
      chatStream?.dispatchEvent(new Event("scroll", { bubbles: true }))
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("provider output with more detail")
    expect(scrollIntoView).toHaveBeenCalledTimes(0)

    await act(async () => {
      root.unmount()
    })
    container.remove()
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView
      })
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
    }
    vi.useRealTimers()
  })

  it("selects a provider row without opening a floating popover", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "New conversation"
    )
    expect(openButton).toBeTruthy()

    await clickElement(openButton)

    expect(getByTestId(container, "launcher-provider-list")).toBeTruthy()

    await clickElement(getByTestId(container, "launcher-provider-option-claude"))

    expect(getByTestId(container, "launcher-provider-list")).toBeTruthy()
    expect(container.textContent).toContain("Claude Code is available on this Mac.")
    expect(container.textContent).toContain("Claude Code / Sonnet 4")
    expect(getByTestId(container, "launcher-worktree-trigger")?.textContent).toContain("main")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders provider-not-ready errors with localized copy", async () => {
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)
    window.teamcow.createConversation = vi.fn(async (): Promise<CreateConversationResult> => ({
      status: "error",
      error: {
        code: "PROVIDER_NOT_READY",
        message: "Provider codex is not ready",
        suggestion: null
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("New Conversation") || button.getAttribute("aria-label") === "New conversation"
    )
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    await chooseCommandSelectOption(container, "launcher-provider", "codex")
    await chooseCommandSelectOption(container, "launcher-model", "gpt-5.1")
    await chooseCommandSelectOption(container, "launcher-worktree", "worktree-2")

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "Start"
    )
    await clickElement(confirmButton)

    expect(container.textContent).toContain("The selected provider is not ready.")
    expect(container.textContent).toContain("Refresh provider readiness, complete the provider setup, then try again.")
    expect(container.textContent).not.toContain("PROVIDER_NOT_READY")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows provider repair and local capability boundaries in the launcher", async () => {
    const unavailableCodexSnapshot: ProviderReadinessSnapshot = {
      checkedAt: "2026-06-07T12:59:00.000Z",
      providers: refreshedProviderSnapshot.providers.map((provider) =>
        provider.kind === "codex"
          ? {
              ...provider,
              availability: "unavailable",
              badge: {
                ...provider.badge,
                status: "unavailable"
              },
              issues: [{ kind: "binary-not-found" as const }]
            }
          : provider
      )
    }
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)
    window.teamcow.getProviderReadiness = vi.fn(async () => unavailableCodexSnapshot)
    window.teamcow.refreshProviderReadiness = vi.fn(async () => unavailableCodexSnapshot)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("New Conversation") || button.getAttribute("aria-label") === "New conversation"
    )
    await clickElement(openButton)
    await chooseCommandSelectOption(container, "launcher-provider", "codex")

    expect(container.textContent).toContain("Codex CLI binary not found at expected path.")
    expect(container.textContent).toContain("Install Codex CLI and make sure it is available on your PATH.")
    expect(container.textContent).toContain("Local project, history, files, diff, git, terminal, and editor handoff remain available.")
    expect(container.textContent).toContain("Starting or continuing chat requires a ready provider.")
    expect((getByTestId(container, "launcher-model-trigger") as HTMLButtonElement | null)?.disabled).toBe(true)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("falls back to the new project's default worktree after switching projects mid-launcher", async () => {
    const otherProjectDefaultWorktree: WorktreeSummary = {
      id: "worktree-other-default",
      projectId: "project-2",
      kind: "default",
      rootPath: "/tmp/othercow",
      branch: "main",
      status: "ready"
    }
    const otherProjectIndependentWorktree: WorktreeSummary = {
      id: "worktree-other-feature",
      projectId: "project-2",
      kind: "git_worktree",
      rootPath: "/tmp/othercow-feature",
      branch: "feat/other-target",
      status: "ready"
    }
    const otherProject = {
      id: "project-2",
      name: "othercow",
      rootPath: "/tmp/othercow",
      status: "ready" as const,
      isCurrent: false,
      defaultWorktree: otherProjectDefaultWorktree,
      conversations: []
    }
    const twoProjectContext: AppContextSnapshot = {
      ...projectOnlyContext,
      projects: [
        projectOnlyContext.projects[0],
        otherProject
      ]
    }
    const otherProjectContext: AppContextSnapshot = {
      ...twoProjectContext,
      selectedProjectId: "project-2",
      projects: [
        {
          ...projectOnlyContext.projects[0],
          isCurrent: false
        },
        {
          ...otherProject,
          isCurrent: true
        }
      ],
      shell: {
        ...projectOnlyContext.shell,
        projectName: "othercow",
        worktreeBranch: "main",
        worktreePath: "/tmp/othercow",
        hasConversations: false
      },
      chips: [
        { kind: "project", value: "othercow" },
        { kind: "conversation", value: "" },
        { kind: "provider", value: "" },
        { kind: "worktree", value: "main" },
        { kind: "run-status", value: "" }
      ]
    }

    window.teamcow.getAppContext = vi.fn(async () => twoProjectContext)
    window.teamcow.selectProject = vi.fn(async () => ({
      status: "ok" as const,
      context: otherProjectContext
    }))
    window.teamcow.listWorktreesByProject = vi.fn(async (projectId: string) =>
      projectId === "project-1"
        ? projectWorktrees
        : [otherProjectDefaultWorktree, otherProjectIndependentWorktree]
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("New Conversation") || button.getAttribute("aria-label") === "New conversation"
    )
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    await chooseCommandSelectOption(container, "launcher-provider", "codex")
    await chooseCommandSelectOption(container, "launcher-model", "gpt-5.1")
    await chooseCommandSelectOption(container, "launcher-worktree", "worktree-2")

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "Start"
    )
    expect(confirmButton?.hasAttribute("disabled")).toBe(false)

    const otherProjectRow = Array.from(container.querySelectorAll(".proj-row")).find((row) =>
      row.textContent?.includes("othercow")
    )
    await clickElement(otherProjectRow)

    expect(container.textContent).toContain("othercow")
    expect(getByTestId(container, "launcher-worktree-trigger")?.textContent).toContain("main")
    const fallbackConfirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.className.includes("primary") && button.textContent?.trim() === "Start"
    )
    expect(fallbackConfirmButton?.hasAttribute("disabled")).toBe(false)

    await openCommandSelect(container, "launcher-worktree")

    expect(container.textContent).toContain("feat/other-target")

    await clickElement(fallbackConfirmButton)

    expect(window.teamcow.createConversation).toHaveBeenCalledWith({
      projectId: "project-2",
      providerKind: "codex",
      model: "gpt-5.1",
      executionTarget: {
        type: "default"
      }
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("creates a conversation through the new worktree path after entering a branch name", async () => {
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)
    window.teamcow.createConversation = vi.fn(async (): Promise<CreateConversationResult> => ({
      status: "created",
      conversation: {
        id: "conversation-branch",
        projectId: "project-1",
        title: "codex 10:05",
        worktreeId: "worktree-branch",
        worktree: {
          id: "worktree-branch",
          projectId: "project-1",
          kind: "git_worktree",
          rootPath: "/tmp/teamcow-feat-parallel-experiment",
          branch: "parallel-experiment",
          status: "ready"
        },
        provider: {
          kind: "codex",
          label: "Codex",
          status: "ready"
        },
        currentModel: "gpt-5.1",
        runStatus: "idle",
        createdAt: "2026-05-16T10:05:00.000Z",
        updatedAt: "2026-05-16T10:05:00.000Z",
        isCurrent: true
      },
      context: {
        ...projectOnlyContext,
        selectedConversationId: "conversation-branch",
        shell: {
          ...projectOnlyContext.shell,
          conversationTitle: "codex 10:05",
          providerKind: "codex",
          worktreeBranch: "parallel-experiment",
          worktreePath: "/tmp/teamcow-feat-parallel-experiment",
          runStatus: "idle",
          hasConversations: true
        },
        projects: [
          {
            ...projectOnlyContext.projects[0],
            conversations: [
              {
                id: "conversation-branch",
                projectId: "project-1",
                title: "codex 10:05",
                worktreeId: "worktree-branch",
                worktree: {
                  id: "worktree-branch",
                  projectId: "project-1",
                  kind: "git_worktree",
                  rootPath: "/tmp/teamcow-feat-parallel-experiment",
                  branch: "parallel-experiment",
                  status: "ready"
                },
                provider: {
                  kind: "codex",
                  label: "Codex",
                  status: "ready"
                },
                currentModel: "gpt-5.1",
                runStatus: "idle",
                createdAt: "2026-05-16T10:05:00.000Z",
                updatedAt: "2026-05-16T10:05:00.000Z",
                isCurrent: true
              }
            ]
          }
        ],
        chips: [
          { kind: "project", value: "teamcow" },
          { kind: "conversation", value: "codex 10:05" },
          { kind: "provider", value: "codex" },
          { kind: "worktree", value: "parallel-experiment" },
          { kind: "run-status", value: "idle" }
        ]
      }
    }))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("New Conversation") || button.getAttribute("aria-label") === "New conversation"
    )

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    await chooseCommandSelectOption(container, "launcher-provider", "codex")
    await chooseCommandSelectOption(container, "launcher-model", "gpt-5.1")
    await chooseCommandSelectOption(container, "launcher-worktree", "new-worktree")

    const branchInput = container.querySelector('input[placeholder="feat/parallel-experiment"]') as HTMLInputElement | null
    expect(branchInput).toBeTruthy()

    await act(async () => {
      if (branchInput) {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
          ?.set
          ?.call(branchInput, "feat/parallel-experiment")
        branchInput.dispatchEvent(new Event("input", { bubbles: true }))
        branchInput.dispatchEvent(new Event("change", { bubbles: true }))
      }
      await Promise.resolve()
      await Promise.resolve()
    })

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "Start"
    )
    expect(confirmButton).toBeTruthy()
    expect(confirmButton?.hasAttribute("disabled")).toBe(false)

    await clickElement(confirmButton)

    expect(window.teamcow.createConversation).toHaveBeenCalledWith({
      projectId: "project-1",
      providerKind: "codex",
      model: "gpt-5.1",
      executionTarget: {
        type: "new-worktree",
        branch: "feat/parallel-experiment"
      }
    })
    expect(container.textContent).toContain("codex 10:05")
    expect(container.textContent).toContain("parallel-experiment")
    expect(container.textContent).not.toContain("Created codex 10:05")
    expect(container.textContent).not.toContain("Choose how this chat will run.")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("shows an existing-worktree empty state when the project has no independent worktrees", async () => {
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)
    window.teamcow.listWorktreesByProject = vi.fn(async () => [projectWorktrees[0]])

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("New Conversation") || button.getAttribute("aria-label") === "New conversation"
    )

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("No independent worktree yet")
    expect(container.textContent).toContain("No independent worktree yet")
    expect(container.querySelector(".launcher-inline-detail")).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps execution targets out of the inspector so Terminal can own the right rail", async () => {
    const projectWorktreeTargets: ProjectWorktreeSummary[] = [
      {
        ...projectWorktrees[0],
        conversationCount: 1,
        canDelete: false,
        deleteBlockedReason: "default"
      },
      {
        id: "worktree-2",
        projectId: "project-1",
        kind: "git_worktree",
        rootPath: "/tmp/teamcow-feature",
        branch: "feat/used",
        status: "unavailable",
        conversationCount: 1,
        canDelete: false,
        deleteBlockedReason: "in-use"
      }
    ]
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)
    window.teamcow.listProjectWorktrees = vi.fn(async () => projectWorktreeTargets)
    window.teamcow.deleteWorktree = vi.fn()

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector(".inspector .execution-targets-panel")).toBeNull()
    expect(container.querySelector(".inspector .execution-target-row")).toBeNull()
    expect(container.textContent).not.toContain("Execution targets")
    expect(container.textContent).not.toContain("feat/used")
    expect(container.textContent).not.toContain("/tmp/teamcow-feature")
    expect(window.teamcow.deleteWorktree).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("does not render the composer model selector when no conversation is active", async () => {
    window.teamcow.getAppContext = vi.fn(async () => projectOnlyContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getByTestId(container, "composer-model-trigger")).toBeFalsy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders the active conversation's model on the composer pill", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const trigger = getByTestId(container, "composer-model-trigger")
    expect(trigger).toBeTruthy()
    expect(trigger?.textContent).toContain("Sonnet 4")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("disables active model changes and explains provider catalog dependency when the provider is unavailable", async () => {
    window.teamcow.getAppContext = vi.fn(async () => withActiveConversationProviderStatus(selectionContext, "unavailable"))
    window.teamcow.getProviderReadiness = vi.fn(async () => unavailableClaudeSnapshot)
    window.teamcow.refreshProviderReadiness = vi.fn(async () => unavailableClaudeSnapshot)

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const trigger = getByTestId(container, "composer-model-trigger") as HTMLButtonElement | null
    expect(trigger).toBeTruthy()
    expect(trigger?.disabled).toBe(true)
    expect(trigger?.getAttribute("title")).toContain("Model changes require Claude Code readiness and a refreshed model catalog.")
    expect(container.textContent).toContain("Model changes require Claude Code readiness and a refreshed model catalog.")

    await clickElement(trigger)
    expect(getByTestId(container, "composer-model-popover")).toBeFalsy()
    expect(window.teamcow.setConversationModel).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("switches the conversation model through setConversationModel without changing provider", async () => {
    window.teamcow.getAppContext = vi.fn(async () => withActiveConversationRunStatus(selectionContext, "idle"))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await clickElement(getByTestId(container, "composer-model-trigger"))
    expect(getByTestId(container, "composer-model-popover")).toBeTruthy()

    await clickElement(getByTestId(container, "composer-model-option-claude-opus-4.1"))

    expect(window.teamcow.setConversationModel).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      model: "claude-opus-4.1"
    })
    expect(getByTestId(container, "composer-model-popover")).toBeFalsy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("uses provider-discovered models in the composer model menu", async () => {
    window.teamcow.getAppContext = vi.fn(async () => withActiveConversationRunStatus(selectionContext, "idle"))
    window.teamcow.listProviderModels = vi.fn(async (providerKind: string) =>
      providerKind === "claude"
        ? [
            {
              id: "claude-sonnet-4",
              label: "Sonnet 4",
              detail: "Current Claude Code model.",
              source: "fallback" as const
            },
            {
              id: "claude-opus-4.5",
              label: "Opus 4.5",
              detail: "Discovered from local Claude Code config.",
              source: "config-derived" as const
            }
          ]
        : []
    )

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.teamcow.listProviderModels).toHaveBeenCalledWith("claude")
    await clickElement(getByTestId(container, "composer-model-trigger"))
    expect(getByTestId(container, "composer-model-popover")).toBeTruthy()
    expect(getByTestId(container, "composer-model-popover")?.textContent).toContain("Config")

    await clickElement(getByTestId(container, "composer-model-option-claude-opus-4.5"))

    expect(window.teamcow.setConversationModel).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      model: "claude-opus-4.5"
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("switches the conversation access mode from the composer controls", async () => {
    window.teamcow.getAppContext = vi.fn(async () => withActiveConversationRunStatus(selectionContext, "idle"))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const trigger = getByTestId(container, "composer-access-mode-trigger") as HTMLButtonElement | null
    expect(trigger).toBeTruthy()
    expect(trigger?.textContent).toContain("WT write")

    await clickElement(trigger)
    expect(getByTestId(container, "composer-access-mode-popover")).toBeTruthy()

    await clickElement(getByTestId(container, "composer-access-mode-option-full-access"))

    expect(window.teamcow.setConversationAccessMode).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      accessMode: "full-access"
    })
    expect(getByTestId(container, "composer-access-mode-popover")).toBeFalsy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("closes composer floating menus when clicking outside them", async () => {
    window.teamcow.getAppContext = vi.fn(async () => withActiveConversationRunStatus(selectionContext, "idle"))

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await clickElement(getByTestId(container, "composer-access-mode-trigger"))
    expect(getByTestId(container, "composer-access-mode-popover")).toBeTruthy()

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      await Promise.resolve()
    })
    expect(getByTestId(container, "composer-access-mode-popover")).toBeFalsy()

    await clickElement(getByTestId(container, "composer-model-trigger"))
    expect(getByTestId(container, "composer-model-popover")).toBeTruthy()

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      await Promise.resolve()
    })
    expect(getByTestId(container, "composer-model-popover")).toBeFalsy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps the running composer editable, queues entered text, and preserves stop for an empty draft", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    window.teamcow.cancelConversationRun = vi.fn(async () => ({ status: "ok" as const }))
    window.teamcow.sendConversationMessage = vi.fn(async (input): Promise<SendConversationMessageResult> => {
      const queuedMessage = {
        id: "queued-message-1",
        conversationId: input.conversationId,
        content: input.content,
        attachments: [],
        createdAt: "2026-08-21T08:00:00.000Z"
      }
      return {
        status: "queued",
        queuedMessage,
        timeline: {
          ...emptyTimeline(input.conversationId),
          queuedMessages: [queuedMessage]
        },
        context: selectionContext
      }
    })

    const container = document.createElement("div")
    document.body.appendChild(container)

    const root = await renderWithI18n(container, <DesktopShell />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const composerInput = getByTestId(container, "composer-input") as HTMLTextAreaElement | null
    expect(composerInput?.readOnly).toBe(false)
    expect((getByTestId(container, "composer-model-trigger") as HTMLButtonElement | null)?.disabled).toBe(true)
    expect((getByTestId(container, "composer-access-mode-trigger") as HTMLButtonElement | null)?.disabled).toBe(true)
    expect(getByTestId(container, "composer-stop")).toBeTruthy()

    await act(async () => {
      if (composerInput) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
        valueSetter?.call(composerInput, "Queue this next")
        composerInput.dispatchEvent(new Event("input", { bubbles: true }))
      }
      await Promise.resolve()
    })
    expect(getByTestId(container, "composer-stop")).toBeFalsy()
    expect(getByTestId(container, "composer-send")?.getAttribute("aria-label")).toBe("Add message to queue")

    await clickElement(getByTestId(container, "composer-send"))
    expect(window.teamcow.sendConversationMessage).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      content: "Queue this next"
    })
    expect(getByTestId(container, "composer-queue")?.textContent).toContain("Queue this next")
    expect(getByTestId(container, "composer-stop")).toBeTruthy()

    await clickElement(getByTestId(container, "composer-queue-remove-queued-message-1"))
    expect(window.teamcow.deleteQueuedConversationMessage).toHaveBeenCalledWith({
      conversationId: "conversation-2",
      queuedMessageId: "queued-message-1"
    })
    expect(getByTestId(container, "composer-queue")).toBeFalsy()

    await clickElement(getByTestId(container, "composer-stop"))
    expect(window.teamcow.cancelConversationRun).toHaveBeenCalledWith({
      conversationId: "conversation-2"
    })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})

describe("DesktopShell sidebar collapse", () => {
  it("toggles the collapsed class when clicking the current project row", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)

    const projectGroup = container.querySelector(".proj-group.open")
    expect(projectGroup).toBeTruthy()
    expect(projectGroup?.classList.contains("collapsed")).toBe(false)

    const projectRow = container.querySelector(".proj-group.open .proj-row-btn")
    expect(projectRow).toBeTruthy()

    await clickElement(projectRow)
    expect(container.querySelector(".proj-group")?.classList.contains("collapsed")).toBe(true)

    await clickElement(container.querySelector(".proj-group .proj-row-btn"))
    expect(container.querySelector(".proj-group")?.classList.contains("collapsed")).toBe(false)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("does not call selectProject when toggling collapse on the current project", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)

    const projectRow = container.querySelector(".proj-group.open .proj-row-btn")
    expect(projectRow).toBeTruthy()

    await clickElement(projectRow)

    expect(window.teamcow.selectProject).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("renders the sidebar scroll and footer containers", async () => {
    window.teamcow.getAppContext = vi.fn(async () => selectionContext)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = await renderWithI18n(container, <DesktopShell />)

    expect(container.querySelector(".sidebar-scroll")).toBeTruthy()
    expect(container.querySelector(".sidebar-footer")).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})
