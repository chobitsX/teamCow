// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import {
  commitConversationChangesResultSchema,
  discardConversationChangesResultSchema,
  getConversationChangeDiffDocumentResultSchema,
  getConversationChangeDiffResultSchema,
  getConversationChangesResultSchema,
  getConversationGitStatusResultSchema,
  stageConversationChangesResultSchema,
  unstageConversationChangesResultSchema
} from "@shared/index"
import type {
  AppContextSnapshot,
  CreateConversationResult,
  GetConversationGitStatusResult,
  GetConversationTimelinePageResult,
  GetConversationProjectFilesResult,
  GetConversationTimelineResult,
  GetProjectWorktreeFilesResult,
  DeleteWorktreeResult,
  OpenConversationTerminalResult,
  ProjectWorktreeSummary,
  ProviderModelOption,
  ProviderReadinessSnapshot,
  SendConversationMessageResult,
  SetConversationAccessModeResult,
  SetConversationModelResult,
  UpdateActionResult,
  UpdateState,
  WorktreeSummary
} from "@shared/index"
import { executeDesktopCommand } from "../desktop-router"

type DesktopServices = Parameters<typeof executeDesktopCommand>[0]

const integrationServices = {
  notificationService: {
    showHostNotification: vi.fn(() => ({ status: "shown" as const }))
  },
  updateService: {
    getState: vi.fn(() => ({ status: "idle" as const })),
    checkForUpdates: vi.fn(async () => ({ status: "ok" as const, state: { status: "idle" as const } })),
    installUpdateAndRestart: vi.fn(() => ({
      status: "ok" as const,
      state: {
        status: "downloaded" as const,
        downloadedAt: "2026-06-07T14:50:00.000Z"
      }
    }))
  }
} satisfies Pick<DesktopServices, "notificationService" | "updateService">

describe("executeDesktopCommand", () => {
  it("returns structured provider readiness snapshots for typed RPC commands", async () => {
    const snapshot: ProviderReadinessSnapshot = {
      checkedAt: "2026-05-15T10:20:00.000Z",
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
        }
      ]
    }

    const result = await executeDesktopCommand(
      {
        projectService: {} as never,
        providerRuntimeService: {
          getSnapshot: () => snapshot,
          refreshSnapshot: async () => snapshot,
          listProviderModels: async () => [],
          invalidateModelDiscoveryCache: () => undefined
        },
        customModelsService: {} as never,
        ...integrationServices
      },
      { type: "getProviderReadiness" }
    )

    expect(result).toEqual(snapshot)
  })

  it("routes provider model list commands through the runtime service", async () => {
    const models: ProviderModelOption[] = [
      {
        id: "gpt-5.5",
        label: "gpt-5.5",
        detail: "Configured Codex model via Modelgate.",
        source: "config-derived"
      }
    ]
    const listProviderModels = vi.fn(async () => models)

    const result = await executeDesktopCommand(
      {
        projectService: {} as never,
        providerRuntimeService: {
          getSnapshot: vi.fn(),
          refreshSnapshot: vi.fn(),
          runProvider: vi.fn(),
          listProviderModels
        } as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "listProviderModels",
        input: {
          providerKind: "codex"
        }
      }
    )

    expect(listProviderModels).toHaveBeenCalledWith("codex")
    expect(result).toEqual(models)
  })

  it("routes listWorktreesByProject commands through the project service", async () => {
    const worktrees: WorktreeSummary[] = [
      {
        id: "worktree-1",
        projectId: "project-1",
        kind: "default",
        rootPath: "/tmp/teamcow",
        branch: "main",
        status: "ready"
      }
    ]

    const listWorktreesByProject = vi.fn(() => worktrees)

    const result = await executeDesktopCommand(
      {
        projectService: {
          listWorktreesByProject
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "listWorktreesByProject",
        input: {
          projectId: "project-1"
        }
      }
    )

    expect(listWorktreesByProject).toHaveBeenCalledWith("project-1")
    expect(result).toEqual(worktrees)
  })

  it("routes project worktree lifecycle commands through the project service", async () => {
    const worktrees: ProjectWorktreeSummary[] = [
      {
        id: "worktree-1",
        projectId: "project-1",
        kind: "default",
        rootPath: "/tmp/teamcow",
        branch: "main",
        status: "ready",
        conversationCount: 1,
        canDelete: false,
        deleteBlockedReason: "default"
      },
      {
        id: "worktree-2",
        projectId: "project-1",
        kind: "git_worktree",
        rootPath: "/tmp/teamcow-feature",
        branch: "feat/worktrees",
        status: "ready",
        conversationCount: 0,
        canDelete: true,
        deleteBlockedReason: null
      }
    ]
    const deleted: DeleteWorktreeResult = {
      status: "deleted",
      projectId: "project-1",
      worktreeId: "worktree-2"
    }

    const listProjectWorktrees = vi.fn(() => worktrees)
    const deleteWorktree = vi.fn(async () => deleted)

    const services = {
      projectService: {
        listProjectWorktrees,
        deleteWorktree
      } as never,
      providerRuntimeService: {} as never,
      customModelsService: {} as never,
      ...integrationServices
    }

    await expect(executeDesktopCommand(services, {
      type: "listProjectWorktrees",
      input: {
        projectId: "project-1"
      }
    })).resolves.toEqual(worktrees)

    await expect(executeDesktopCommand(services, {
      type: "deleteWorktree",
      input: {
        projectId: "project-1",
        worktreeId: "worktree-2"
      }
    })).resolves.toEqual(deleted)

    expect(listProjectWorktrees).toHaveBeenCalledWith("project-1")
    expect(deleteWorktree).toHaveBeenCalledWith({ projectId: "project-1", worktreeId: "worktree-2" })
  })

  it("routes conversation handoff commands through the project service", async () => {
    const openConversationHandoff = vi.fn(async () => ({
      status: "opened" as const,
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      targetKind: "worktree" as const,
      targetPath: "/tmp/teamcow"
    }))

    const result = await executeDesktopCommand(
      {
        projectService: {
          openConversationHandoff
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "openConversationHandoff",
        input: {
          conversationId: "conversation-1",
          target: "worktree"
        }
      } as never
    )

    expect(openConversationHandoff).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      target: "worktree"
    })
    expect(result).toEqual({
      status: "opened",
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      targetKind: "worktree",
      targetPath: "/tmp/teamcow"
    })
  })

  it("routes external open commands through the project service", async () => {
    const externalOptions = [
      {
        id: "finder" as const,
        label: "Finder",
        appName: "Finder",
        iconDataUrl: "data:image/png;base64,ZmFrZS1maW5kZXItaWNvbg==",
        group: "system" as const,
        isAvailable: true
      }
    ]
    const opened = {
      status: "opened" as const,
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      appId: "finder" as const,
      appLabel: "Finder",
      targetPath: "/tmp/teamcow"
    }
    const listExternalOpenOptions = vi.fn(() => externalOptions)
    const openConversationExternal = vi.fn(async () => opened)
    const services = {
      projectService: {
        listExternalOpenOptions,
        openConversationExternal
      } as never,
      providerRuntimeService: {} as never,
      customModelsService: {} as never,
      ...integrationServices
    }

    await expect(executeDesktopCommand(services, { type: "listExternalOpenOptions" })).resolves.toEqual(externalOptions)
    await expect(executeDesktopCommand(services, {
      type: "openConversationExternal",
      input: {
        conversationId: "conversation-1",
        appId: "finder"
      }
    })).resolves.toEqual(opened)

    expect(listExternalOpenOptions).toHaveBeenCalledTimes(1)
    expect(openConversationExternal).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      appId: "finder"
    })
  })

  it("routes project ordering, removal, and Finder commands through the project service", async () => {
    const context: AppContextSnapshot = {
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
      chips: []
    }
    const moveProject = vi.fn(() => ({ status: "ok" as const, context }))
    const removeProject = vi.fn(() => ({ status: "ok" as const, context }))
    const revealProjectInFinder = vi.fn(async () => ({
      status: "opened" as const,
      projectId: "project-1",
      targetPath: "/tmp/teamcow"
    }))
    const services = {
      projectService: {
        moveProject,
        removeProject,
        revealProjectInFinder
      } as never,
      providerRuntimeService: {} as never,
      customModelsService: {} as never,
      ...integrationServices
    }

    await expect(executeDesktopCommand(services, {
      type: "moveProject",
      input: { projectId: "project-1", position: "top" }
    })).resolves.toEqual({ status: "ok", context })
    await expect(executeDesktopCommand(services, {
      type: "removeProject",
      input: { projectId: "project-1" }
    })).resolves.toEqual({ status: "ok", context })
    await expect(executeDesktopCommand(services, {
      type: "revealProjectInFinder",
      input: { projectId: "project-1" }
    })).resolves.toEqual({ status: "opened", projectId: "project-1", targetPath: "/tmp/teamcow" })

    expect(moveProject).toHaveBeenCalledWith({ projectId: "project-1", position: "top" })
    expect(removeProject).toHaveBeenCalledWith("project-1")
    expect(revealProjectInFinder).toHaveBeenCalledWith("project-1")
  })

  it("routes terminal commands through the project service", async () => {
    const opened: OpenConversationTerminalResult = {
      status: "ok",
      session: {
        sessionId: "terminal-1",
        conversationId: "conversation-1",
        worktreeId: "worktree-1",
        cwd: "/tmp/teamcow",
        shell: "/bin/zsh",
        status: "running",
        startedAt: "2026-06-05T09:54:19.000Z"
      }
    }
    const actionResult = {
      status: "ok" as const,
      sessionId: "terminal-1"
    }
    const openConversationTerminal = vi.fn(async () => opened)
    const writeTerminalInput = vi.fn(() => actionResult)
    const resizeTerminal = vi.fn(() => actionResult)
    const closeTerminal = vi.fn(() => actionResult)
    const services = {
      projectService: {
        openConversationTerminal,
        writeTerminalInput,
        resizeTerminal,
        closeTerminal
      } as never,
      providerRuntimeService: {} as never,
      customModelsService: {} as never,
      ...integrationServices
    }

    await expect(executeDesktopCommand(services, {
      type: "openConversationTerminal",
      input: {
        conversationId: "conversation-1"
      }
    })).resolves.toEqual(opened)

    await expect(executeDesktopCommand(services, {
      type: "writeTerminalInput",
      input: {
        sessionId: "terminal-1",
        data: "pwd\n"
      }
    })).resolves.toEqual(actionResult)

    await expect(executeDesktopCommand(services, {
      type: "resizeTerminal",
      input: {
        sessionId: "terminal-1",
        cols: 120,
        rows: 30
      }
    })).resolves.toEqual(actionResult)

    await expect(executeDesktopCommand(services, {
      type: "closeTerminal",
      input: {
        sessionId: "terminal-1"
      }
    })).resolves.toEqual(actionResult)

    expect(openConversationTerminal).toHaveBeenCalledWith({ conversationId: "conversation-1" })
    expect(writeTerminalInput).toHaveBeenCalledWith({ sessionId: "terminal-1", data: "pwd\n" })
    expect(resizeTerminal).toHaveBeenCalledWith({ sessionId: "terminal-1", cols: 120, rows: 30 })
    expect(closeTerminal).toHaveBeenCalledWith({ sessionId: "terminal-1" })
  })

  it("adds command and domain context to recoverable internal command errors", async () => {
    const openConversationTerminal = vi.fn(async () => {
      throw new Error("terminal native bridge failed")
    })

    const result = await executeDesktopCommand(
      {
        projectService: {
          openConversationTerminal
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "openConversationTerminal",
        input: {
          conversationId: "conversation-1"
        }
      }
    )

    expect(result).toMatchObject({
      status: "error",
      error: {
        code: "INTERNAL_ERROR",
        domain: "terminal",
        context: {
          command: "openConversationTerminal"
        }
      }
    })
  })

  it("routes editor selector commands through the project service", async () => {
    const editors = [
      {
        id: "cursor",
        label: "Cursor",
        appName: "Cursor",
        isAvailable: true
      }
    ]
    const listEditorOptions = vi.fn(() => editors)
    const getSelectedEditor = vi.fn(() => ({
      status: "ok" as const,
      selectedEditorId: "cursor",
      editors
    }))
    const setSelectedEditor = vi.fn(() => ({
      status: "ok" as const,
      selectedEditorId: "cursor",
      editors
    }))
    const services = {
      projectService: {
        listEditorOptions,
        getSelectedEditor,
        setSelectedEditor
      } as never,
      providerRuntimeService: {} as never,
      customModelsService: {} as never,
      ...integrationServices
    }

    await expect(executeDesktopCommand(services, { type: "listEditorOptions" })).resolves.toEqual(editors)
    await expect(executeDesktopCommand(services, { type: "getSelectedEditor" })).resolves.toMatchObject({
      status: "ok",
      selectedEditorId: "cursor"
    })
    await expect(executeDesktopCommand(services, {
      type: "setSelectedEditor",
      input: { editorId: "cursor" }
    })).resolves.toMatchObject({
      status: "ok",
      selectedEditorId: "cursor"
    })

    expect(listEditorOptions).toHaveBeenCalledTimes(1)
    expect(getSelectedEditor).toHaveBeenCalledTimes(1)
    expect(setSelectedEditor).toHaveBeenCalledWith({ editorId: "cursor" })
  })

  it("routes host notification and update commands through desktop integration services", async () => {
    const notificationResult = {
      status: "shown" as const
    }
    const updateState: UpdateState = {
      status: "downloaded",
      version: "1.2.3",
      downloadedAt: "2026-06-07T14:50:00.000Z"
    }
    const updateResult: UpdateActionResult = {
      status: "ok",
      state: updateState
    }
    const showHostNotification = vi.fn(() => notificationResult)
    const getState = vi.fn(() => updateState)
    const checkForUpdates = vi.fn(async () => updateResult)
    const installUpdateAndRestart = vi.fn(() => updateResult)
    const services = {
      projectService: {} as never,
      providerRuntimeService: {} as never,
      customModelsService: {} as never,
      notificationService: {
        showHostNotification
      },
      updateService: {
        getState,
        checkForUpdates,
        installUpdateAndRestart
      }
    }

    await expect(executeDesktopCommand(services, {
      type: "showHostNotification",
      input: {
        kind: "run-completed",
        title: "Run completed",
        body: "Codex finished the task.",
        context: {
          projectName: "teamCow",
          conversationTitle: "Build updater",
          providerKind: "codex",
          worktreeLabel: "main",
          runStatus: "completed"
        }
      }
    })).resolves.toEqual(notificationResult)
    await expect(executeDesktopCommand(services, { type: "getUpdateState" })).resolves.toEqual(updateState)
    await expect(executeDesktopCommand(services, { type: "checkForUpdates" })).resolves.toEqual(updateResult)
    await expect(executeDesktopCommand(services, { type: "installUpdateAndRestart" })).resolves.toEqual(updateResult)

    expect(showHostNotification).toHaveBeenCalledWith({
      kind: "run-completed",
      title: "Run completed",
      body: "Codex finished the task.",
      context: {
        projectName: "teamCow",
        conversationTitle: "Build updater",
        providerKind: "codex",
        worktreeLabel: "main",
        runStatus: "completed"
      }
    })
    expect(getState).toHaveBeenCalledTimes(1)
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    expect(installUpdateAndRestart).toHaveBeenCalledTimes(1)
  })

  it("routes createConversation commands through the project service", async () => {
    const context: AppContextSnapshot = {
      mode: "development",
      platform: "darwin",
      version: "38.0.0",
      selectedProjectId: "project-1",
      selectedConversationId: "conversation-1",
      projects: [],
      shell: {
        projectName: "teamcow",
        conversationTitle: "New conversation",
        providerKind: "codex",
        worktreeBranch: "main",
        worktreePath: "/tmp/teamcow",
        runStatus: "idle",
        hasProjects: true,
        hasConversations: true
      },
      chips: []
    }

    const createConversation = vi.fn(async (): Promise<CreateConversationResult> => ({
      status: "created",
      conversation: {
        id: "conversation-1",
        projectId: "project-1",
        title: "New conversation",
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
          label: "codex",
          status: "ready"
        },
        currentModel: "gpt-5.1",
        runStatus: "idle",
        createdAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T10:00:00.000Z",
        isCurrent: true
      },
      context
    }))

    const result = await executeDesktopCommand(
      {
        projectService: {
          createConversation
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "createConversation",
        input: {
          projectId: "project-1",
          providerKind: "codex",
          model: "gpt-5.1",
          executionTarget: {
            type: "default"
          }
        }
      }
    )

    expect(createConversation).toHaveBeenCalledWith({
      projectId: "project-1",
      providerKind: "codex",
      model: "gpt-5.1",
      executionTarget: {
        type: "default"
      }
    })
    expect(result).toMatchObject({
      status: "created",
      conversation: {
        id: "conversation-1"
      },
      context: {
        selectedConversationId: "conversation-1"
      }
    })
  })

  it("routes setConversationModel commands through the project service", async () => {
    const context: AppContextSnapshot = {
      mode: "development",
      platform: "darwin",
      version: "38.0.0",
      selectedProjectId: "project-1",
      selectedConversationId: "conversation-1",
      projects: [],
      shell: {
        projectName: "teamcow",
        conversationTitle: "New conversation",
        providerKind: "codex",
        worktreeBranch: "main",
        worktreePath: "/tmp/teamcow",
        runStatus: "idle",
        hasProjects: true,
        hasConversations: true
      },
      chips: []
    }

    const setConversationModel = vi.fn(async (): Promise<SetConversationModelResult> => ({
      status: "ok",
      conversation: {
        id: "conversation-1",
        projectId: "project-1",
        title: "New conversation",
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
          label: "codex",
          status: "ready"
        },
        currentModel: "gpt-5.1-mini",
        runStatus: "idle",
        createdAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T10:01:00.000Z",
        isCurrent: true
      },
      context
    }))

    const result = await executeDesktopCommand(
      {
        projectService: {
          setConversationModel
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "setConversationModel",
        input: {
          conversationId: "conversation-1",
          model: "gpt-5.1-mini"
        }
      }
    )

    expect(setConversationModel).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      model: "gpt-5.1-mini"
    })
    expect(result).toMatchObject({
      status: "ok",
      conversation: { currentModel: "gpt-5.1-mini" }
    })
  })

  it("routes setConversationAccessMode commands through the project service", async () => {
    const context: AppContextSnapshot = {
      mode: "development",
      platform: "darwin",
      version: "38.0.0",
      selectedProjectId: "project-1",
      selectedConversationId: "conversation-1",
      projects: [],
      shell: {
        projectName: "teamcow",
        conversationTitle: "New conversation",
        providerKind: "codex",
        worktreeBranch: "main",
        worktreePath: "/tmp/teamcow",
        runStatus: "idle",
        hasProjects: true,
        hasConversations: true
      },
      chips: []
    }

    const setConversationAccessMode = vi.fn(async (): Promise<SetConversationAccessModeResult> => ({
      status: "ok",
      conversation: {
        id: "conversation-1",
        projectId: "project-1",
        title: "New conversation",
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
          label: "codex",
          status: "ready"
        },
        currentModel: "gpt-5.1",
        accessMode: "full-access",
        runStatus: "idle",
        createdAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T10:01:00.000Z",
        isCurrent: true
      },
      context
    }))

    const result = await executeDesktopCommand(
      {
        projectService: {
          setConversationAccessMode
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "setConversationAccessMode",
        input: {
          conversationId: "conversation-1",
          accessMode: "full-access"
        }
      }
    )

    expect(setConversationAccessMode).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      accessMode: "full-access"
    })
    expect(result).toMatchObject({
      status: "ok",
      conversation: { accessMode: "full-access" }
    })
  })

  it("routes sendConversationMessage commands through the project service", async () => {
    const sendConversationMessage = vi.fn(async (): Promise<SendConversationMessageResult> => ({
      status: "accepted",
      conversation: {
        id: "conversation-1",
        projectId: "project-1",
        title: "New conversation",
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
          label: "codex",
          status: "ready"
        },
        currentModel: "gpt-5.1",
        runStatus: "unavailable",
        createdAt: "2026-05-19T02:40:00.000Z",
        updatedAt: "2026-05-19T02:40:00.000Z",
        isCurrent: true
      },
      timeline: {
        conversationId: "conversation-1",
        messages: [],
        runs: [],
        events: [],
        artifacts: []
      },
      context: {
        mode: "development",
        platform: "darwin",
        version: "38.0.0",
        selectedProjectId: "project-1",
        selectedConversationId: "conversation-1",
        projects: [],
        shell: {
          projectName: "teamcow",
          conversationTitle: "New conversation",
          providerKind: "codex",
          worktreeBranch: "main",
          worktreePath: "/tmp/teamcow",
          runStatus: "unavailable",
          hasProjects: true,
          hasConversations: true
        },
        chips: []
      }
    }))

    const result = await executeDesktopCommand(
      {
        projectService: {
          sendConversationMessage
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "sendConversationMessage",
        input: {
          conversationId: "conversation-1",
          content: "Persist this"
        }
      }
    )

    expect(sendConversationMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      content: "Persist this"
    })
    expect(result).toMatchObject({
      status: "accepted",
      context: {
        shell: {
          runStatus: "unavailable"
        }
      }
    })
  })

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

    expect(cancelConversationRun).toHaveBeenCalledWith({
      conversationId: "conversation-1"
    })
    expect(result).toEqual({ status: "ok" })
  })

  it("routes queued message deletion through the project service", async () => {
    const deleteQueuedConversationMessage = vi.fn(async () => ({
      status: "ok" as const,
      timeline: {
        conversationId: "conversation-1",
        messages: [],
        queuedMessages: [],
        runs: [],
        events: [],
        artifacts: []
      }
    }))

    const result = await executeDesktopCommand(
      {
        projectService: { deleteQueuedConversationMessage } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "deleteQueuedConversationMessage",
        input: {
          conversationId: "conversation-1",
          queuedMessageId: "queued-message-1"
        }
      }
    )

    expect(deleteQueuedConversationMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      queuedMessageId: "queued-message-1"
    })
    expect(result).toMatchObject({ status: "ok", timeline: { queuedMessages: [] } })
  })

  it("routes getConversationTimeline commands through the project service", async () => {
    const getConversationTimeline = vi.fn((): GetConversationTimelineResult => ({
      status: "ok",
      timeline: {
        conversationId: "conversation-1",
        messages: [],
        runs: [],
        events: [],
        artifacts: []
      }
    }))

    const result = await executeDesktopCommand(
      {
        projectService: {
          getConversationTimeline
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "getConversationTimeline",
        input: {
          conversationId: "conversation-1"
        }
      }
    )

    expect(getConversationTimeline).toHaveBeenCalledWith("conversation-1")
    expect(result).toEqual({
      status: "ok",
      timeline: {
        conversationId: "conversation-1",
        messages: [],
        runs: [],
        events: [],
        artifacts: []
      }
    })
  })

  it("routes paged timeline commands through the project service", async () => {
    const getConversationTimelinePage = vi.fn((): GetConversationTimelinePageResult => ({
      status: "ok",
      timeline: {
        conversationId: "conversation-1",
        messages: [],
        runs: [],
        events: [],
        artifacts: []
      },
      pageInfo: { nextCursor: "run-older", hasMore: true }
    }))

    const result = await executeDesktopCommand(
      {
        projectService: { getConversationTimelinePage } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "getConversationTimelinePage",
        input: { conversationId: "conversation-1", beforeRunId: "run-newer", limit: 20 }
      }
    )

    expect(getConversationTimelinePage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      beforeRunId: "run-newer",
      limit: 20
    })
    expect(result).toMatchObject({ status: "ok", pageInfo: { hasMore: true } })
  })

  it("routes getConversationGitStatus commands through the project service", async () => {
    const getConversationGitStatus = vi.fn((): GetConversationGitStatusResult => ({
      status: "ok",
      git: {
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
          changedCount: 2
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
            }
          ],
          hasMore: true
        },
        checkedAt: "2026-05-28T08:17:33.000Z"
      }
    }))

    const result = getConversationGitStatusResultSchema.parse(await executeDesktopCommand(
      {
        projectService: {
          getConversationGitStatus
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "getConversationGitStatus",
        input: {
          conversationId: "conversation-1",
          commitScope: "currentBranch"
        }
      }
    ))

    expect(getConversationGitStatus).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      commitScope: "currentBranch"
    })
    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      throw new Error("expected git status")
    }
    expect(result.git).toMatchObject({
      conversationId: "conversation-1",
      worktreeId: "worktree-1",
      worktreeRootPath: "/tmp/teamcow",
      worktreeKind: "default",
      repository: {
        selectedRemoteName: "origin"
      },
      identity: {
        source: "local"
      },
      branch: {
        current: "feat/git-panel",
        isClean: false
      },
      commits: {
        scope: "currentBranch"
      },
      checkedAt: "2026-05-28T08:17:33.000Z"
    })
  })

  it("routes all conversation changes commands with exact inputs and preserves result variants", async () => {
    const changesInput = { conversationId: "conversation-changes" } as const
    const diffInput = {
      conversationId: "conversation-diff",
      filePath: "apps/desktop/src/main/desktop-router.ts",
      area: "unstaged"
    } as const
    const documentInput = {
      ...diffInput,
      worktreeId: "worktree-diff",
      revision: "revision-diff"
    } as const
    const stageInput = {
      conversationId: "conversation-stage",
      scope: { type: "file", filePath: "README.md" }
    } as const
    const unstageInput = {
      conversationId: "conversation-unstage",
      scope: { type: "all" }
    } as const
    const discardInput = {
      conversationId: "conversation-discard",
      scope: { type: "file", filePath: "scratch.txt" },
      expectedRevision: "revision-discard"
    } as const
    const commitInput = {
      conversationId: "conversation-commit",
      message: "feat: route conversation changes commands"
    } as const

    const changesResult = {
      status: "ok" as const,
      changes: {
        conversationId: changesInput.conversationId,
        worktreeId: "worktree-changes",
        worktreeRootPath: "/tmp/teamcow-changes",
        revision: "revision-changes",
        staged: [],
        unstaged: [{
          path: "README.md",
          oldPath: null,
          status: "modified" as const,
          additions: 2,
          deletions: 1,
          isBinary: false
        }],
        checkedAt: "2026-07-10T09:00:00.000Z"
      }
    }
    const diffResult = {
      status: "missing" as const,
      ...diffInput,
      worktreeId: "worktree-diff",
      reason: "area-changed" as const
    }
    const documentResult = {
      status: "text" as const,
      ...documentInput,
      oldPath: null,
      original: "before\n",
      modified: "after\n",
      originalMode: "100644",
      modifiedMode: "100644",
      originalByteLength: 7,
      modifiedByteLength: 6
    }
    const stageResult = {
      status: "ok" as const,
      conversationId: stageInput.conversationId,
      worktreeId: "worktree-stage",
      scope: stageInput.scope,
      changedPaths: ["README.md"]
    }
    const unstageResult = {
      status: "partial" as const,
      conversationId: unstageInput.conversationId,
      worktreeId: "worktree-unstage",
      scope: unstageInput.scope,
      changedPaths: ["README.md"],
      failures: [{
        filePath: "apps/desktop/src/main/desktop-router.ts",
        error: {
          code: "GIT_CHANGE_OPERATION_FAILED" as const,
          message: "one path could not be unstaged",
          domain: "git" as const
        }
      }]
    }
    const discardResult = {
      status: "error" as const,
      error: {
        code: "GIT_CHANGE_OPERATION_FAILED" as const,
        message: "discard was refused",
        domain: "git" as const,
        context: {
          conversationId: discardInput.conversationId,
          worktreeId: "worktree-discard"
        }
      }
    }
    const commitResult = {
      status: "committed" as const,
      conversationId: commitInput.conversationId,
      worktreeId: "worktree-commit",
      commitHash: "2508d1f012345678901234567890123456789abc",
      shortCommitHash: "2508d1f01234"
    }

    const getConversationChanges = vi.fn((input: typeof changesInput) => {
      void input
      return changesResult
    })
    const getConversationChangeDiff = vi.fn((input: typeof diffInput) => {
      void input
      return diffResult
    })
    const getConversationChangeDiffDocument = vi.fn((input: typeof documentInput) => {
      void input
      return documentResult
    })
    const stageConversationChanges = vi.fn(async (input: typeof stageInput) => {
      void input
      return stageResult
    })
    const unstageConversationChanges = vi.fn((input: typeof unstageInput) => {
      void input
      return unstageResult
    })
    const discardConversationChanges = vi.fn((input: typeof discardInput) => {
      void input
      return discardResult
    })
    const commitConversationChanges = vi.fn((input: typeof commitInput) => {
      void input
      return commitResult
    })
    const services = {
      projectService: {
        getConversationChanges,
        getConversationChangeDiff,
        getConversationChangeDiffDocument,
        stageConversationChanges,
        unstageConversationChanges,
        discardConversationChanges,
        commitConversationChanges
      } as never,
      providerRuntimeService: {} as never,
      customModelsService: {} as never,
      ...integrationServices
    }

    const returnedChanges = getConversationChangesResultSchema.parse(await executeDesktopCommand(
      services,
      { type: "getConversationChanges", input: changesInput }
    ))
    const returnedDiff = getConversationChangeDiffResultSchema.parse(await executeDesktopCommand(
      services,
      { type: "getConversationChangeDiff", input: diffInput }
    ))
    const returnedDocument = getConversationChangeDiffDocumentResultSchema.parse(await executeDesktopCommand(
      services,
      { type: "getConversationChangeDiffDocument", input: documentInput }
    ))
    const returnedStage = stageConversationChangesResultSchema.parse(await executeDesktopCommand(
      services,
      { type: "stageConversationChanges", input: stageInput }
    ))
    const returnedUnstage = unstageConversationChangesResultSchema.parse(await executeDesktopCommand(
      services,
      { type: "unstageConversationChanges", input: unstageInput }
    ))
    const returnedDiscard = discardConversationChangesResultSchema.parse(await executeDesktopCommand(
      services,
      { type: "discardConversationChanges", input: discardInput }
    ))
    const returnedCommit = commitConversationChangesResultSchema.parse(await executeDesktopCommand(
      services,
      { type: "commitConversationChanges", input: commitInput }
    ))

    expect(getConversationChanges.mock.calls[0]?.[0]).toBe(changesInput)
    expect(getConversationChangeDiff.mock.calls[0]?.[0]).toBe(diffInput)
    expect(getConversationChangeDiffDocument.mock.calls[0]?.[0]).toBe(documentInput)
    expect(stageConversationChanges.mock.calls[0]?.[0]).toBe(stageInput)
    expect(unstageConversationChanges.mock.calls[0]?.[0]).toBe(unstageInput)
    expect(discardConversationChanges.mock.calls[0]?.[0]).toBe(discardInput)
    expect(commitConversationChanges.mock.calls[0]?.[0]).toBe(commitInput)
    expect(returnedChanges).toEqual(changesResult)
    expect(returnedDiff).toEqual(diffResult)
    expect(returnedDocument).toEqual(documentResult)
    expect(returnedStage).toEqual(stageResult)
    expect(returnedUnstage).toEqual(unstageResult)
    expect(returnedDiscard).toEqual(discardResult)
    expect(returnedCommit).toEqual(commitResult)
  })

  it("normalizes thrown and rejected conversation changes failures through every exact result schema", async () => {
    const changesInput = { conversationId: "conversation-changes-error" } as const
    const diffInput = {
      conversationId: "conversation-diff-error",
      filePath: "apps/desktop/src/main/desktop-router.ts",
      area: "staged"
    } as const
    const stageInput = {
      conversationId: "conversation-stage-error",
      scope: { type: "file", filePath: "README.md" }
    } as const
    const unstageInput = {
      conversationId: "conversation-unstage-error",
      scope: { type: "all" }
    } as const
    const discardInput = {
      conversationId: "conversation-discard-error",
      scope: { type: "file", filePath: "scratch.txt" },
      expectedRevision: "revision-discard-error"
    } as const
    const commitInput = {
      conversationId: "conversation-commit-error",
      message: "test commit"
    } as const
    const servicesFor = (projectService: object) => ({
      projectService: projectService as never,
      providerRuntimeService: {} as never,
      customModelsService: {} as never,
      ...integrationServices
    })

    const changesError = getConversationChangesResultSchema.parse(await executeDesktopCommand(
      servicesFor({
        getConversationChanges: vi.fn(() => {
          throw new Error("changes read exploded")
        })
      }),
      { type: "getConversationChanges", input: changesInput }
    ))
    const diffError = getConversationChangeDiffResultSchema.parse(await executeDesktopCommand(
      servicesFor({
        getConversationChangeDiff: vi.fn(async () => Promise.reject(new Error("diff read rejected")))
      }),
      { type: "getConversationChangeDiff", input: diffInput }
    ))
    const stageError = stageConversationChangesResultSchema.parse(await executeDesktopCommand(
      servicesFor({
        stageConversationChanges: vi.fn(async () => Promise.reject(new Error("stage rejected")))
      }),
      { type: "stageConversationChanges", input: stageInput }
    ))
    const unstageError = unstageConversationChangesResultSchema.parse(await executeDesktopCommand(
      servicesFor({
        unstageConversationChanges: vi.fn(() => {
          throw new Error("unstage exploded")
        })
      }),
      { type: "unstageConversationChanges", input: unstageInput }
    ))
    const discardError = discardConversationChangesResultSchema.parse(await executeDesktopCommand(
      servicesFor({
        discardConversationChanges: vi.fn(async () => Promise.reject(new Error("discard rejected")))
      }),
      { type: "discardConversationChanges", input: discardInput }
    ))
    const commitError = commitConversationChangesResultSchema.parse(await executeDesktopCommand(
      servicesFor({
        commitConversationChanges: vi.fn(() => {
          throw new Error("commit exploded")
        })
      }),
      { type: "commitConversationChanges", input: commitInput }
    ))

    expect(changesError).toMatchObject({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "changes read exploded", domain: "git" }
    })
    expect(diffError).toMatchObject({
      status: "error",
      ...diffInput,
      error: { code: "INTERNAL_ERROR", message: "diff read rejected", domain: "git" }
    })
    expect(stageError).toMatchObject({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "stage rejected", domain: "git" }
    })
    expect(unstageError).toMatchObject({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "unstage exploded", domain: "git" }
    })
    expect(discardError).toMatchObject({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "discard rejected", domain: "git" }
    })
    expect(commitError).toMatchObject({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "commit exploded", domain: "git" }
    })
  })

  it("routes getConversationProjectFiles commands through the project service", async () => {
    const getConversationProjectFiles = vi.fn(async (): Promise<GetConversationProjectFilesResult> => ({
      status: "ok",
      projectFiles: {
        conversationId: "conversation-1",
        worktreeId: "worktree-1",
        worktreeRootPath: "/tmp/teamcow",
        directoryPath: "apps",
        files: [
          {
            path: "apps",
            name: "apps",
            kind: "directory",
            depth: 0,
            isSymlink: false
          },
          {
            path: "apps/desktop/src/main/project-service.ts",
            name: "project-service.ts",
            kind: "file",
            depth: 3,
            isSymlink: false
          }
        ],
        fileCount: 1,
        directoryCount: 1,
        truncated: false,
        checkedAt: "2026-06-04T08:17:33.000Z"
      }
    }))

    const result = await executeDesktopCommand(
      {
        projectService: {
          getConversationProjectFiles
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "getConversationProjectFiles",
        input: {
          conversationId: "conversation-1",
          directoryPath: "apps"
        }
      }
    )

    expect(getConversationProjectFiles).toHaveBeenCalledWith("conversation-1", "apps")
    expect(result).toMatchObject({
      status: "ok",
      projectFiles: {
        conversationId: "conversation-1",
        fileCount: 1
      }
    })
  })

  it("routes getProjectWorktreeFiles commands through the project service", async () => {
    const getProjectWorktreeFiles = vi.fn(async (): Promise<GetProjectWorktreeFilesResult> => ({
      status: "ok",
      projectFiles: {
        projectId: "project-1",
        worktreeId: "worktree-1",
        worktreeRootPath: "/tmp/teamcow",
        directoryPath: "node_modules",
        files: [
          {
            path: "apps",
            name: "apps",
            kind: "directory",
            depth: 0,
            isSymlink: false
          },
          {
            path: "apps/desktop/src/main/project-service.ts",
            name: "project-service.ts",
            kind: "file",
            depth: 3,
            isSymlink: false
          }
        ],
        fileCount: 1,
        directoryCount: 1,
        truncated: false,
        checkedAt: "2026-06-04T08:17:33.000Z"
      }
    }))

    const result = await executeDesktopCommand(
      {
        projectService: {
          getProjectWorktreeFiles
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "getProjectWorktreeFiles",
        input: {
          projectId: "project-1",
          worktreeId: "worktree-1",
          directoryPath: "node_modules"
        }
      }
    )

    expect(getProjectWorktreeFiles).toHaveBeenCalledWith("project-1", "worktree-1", "node_modules")
    expect(result).toMatchObject({
      status: "ok",
      projectFiles: {
        projectId: "project-1",
        worktreeId: "worktree-1",
        fileCount: 1
      }
    })
  })

  it("routes conversation file commands through the project service", async () => {
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

    const services = {
      projectService: {
        readConversationFile,
        writeConversationFile
      } as never,
      providerRuntimeService: {} as never,
      customModelsService: {} as never,
      ...integrationServices
    }

    await expect(executeDesktopCommand(services, {
      type: "readConversationFile",
      input: { conversationId: "conversation-1", filePath: "README.md" }
    } as never)).resolves.toMatchObject({ status: "text", content: "# TeamCow\n" })

    await expect(executeDesktopCommand(services, {
      type: "writeConversationFile",
      input: {
        conversationId: "conversation-1",
        filePath: "README.md",
        content: "# TeamCow\n",
        precondition: { ifMatch: "rev-1" }
      }
    } as never)).resolves.toMatchObject({ status: "saved" })

    expect(readConversationFile).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      filePath: "README.md"
    })
    expect(writeConversationFile).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      filePath: "README.md",
      content: "# TeamCow\n",
      precondition: { ifMatch: "rev-1" }
    })
  })

  it("returns a typed error when getConversationTimeline throws", async () => {
    const getConversationTimeline = vi.fn((): GetConversationTimelineResult => {
      throw new Error("timeline parse failed")
    })

    const result = await executeDesktopCommand(
      {
        projectService: {
          getConversationTimeline
        } as never,
        providerRuntimeService: {} as never,
        customModelsService: {} as never,
        ...integrationServices
      },
      {
        type: "getConversationTimeline",
        input: {
          conversationId: "conversation-1"
        }
      }
    )

    expect(result).toMatchObject({
      status: "error",
      error: {
        code: "INTERNAL_ERROR",
        message: "timeline parse failed",
        suggestion: null,
        domain: "conversation",
        context: {
          command: "getConversationTimeline"
        }
      }
    })
  })
})
