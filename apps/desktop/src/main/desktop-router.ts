import { ipcMain } from "electron"
import {
  appContextSnapshotSchema,
  cancelConversationRunResultSchema,
  conversationFileEntryMutationResultSchema,
  conversationFileEntryRevealResultSchema,
  conversationSummarySchema,
  createConversationResultSchema,
  customModelMutationResultSchema,
  deleteQueuedConversationMessageResultSchema,
  deleteWorktreeResultSchema,
  conversationFileReadResultSchema,
  conversationFileWriteResultSchema,
  desktopCommandSchema,
  discardConversationChangesResultSchema,
  externalOpenOptionSchema,
  getConversationChangeDiffResultSchema,
  getConversationChangeDiffDocumentResultSchema,
  getConversationChangesResultSchema,
  getConversationGitStatusResultSchema,
  getConversationProjectFilesResultSchema,
  getConversationTimelineResultSchema,
  getConversationTimelinePageResultSchema,
  getProjectWorktreeFilesResultSchema,
  hostNotificationResultSchema,
  importedProjectSummarySchema,
  importProjectResultSchema,
  projectMutationResultSchema,
  revealProjectInFinderResultSchema,
  commitConversationChangesResultSchema,
  openConversationExternalResultSchema,
  openConversationTerminalResultSchema,
  openConversationHandoffResultSchema,
  providerModelOptionSchema,
  providerReadinessSnapshotSchema,
  selectConversationResultSchema,
  selectProjectResultSchema,
  selectedEditorResultSchema,
  retryConversationRunWithPermissionsResultSchema,
  sendConversationMessageResultSchema,
  setConversationAccessModeResultSchema,
  setConversationModelResultSchema,
  stageConversationChangesResultSchema,
  renameConversationResultSchema,
  deleteConversationResultSchema,
  terminalActionResultSchema,
  updateActionResultSchema,
  updateStateSchema,
  unstageConversationChangesResultSchema,
  projectWorktreeSummarySchema,
  editorOptionSchema,
  worktreeSummarySchema,
  type DesktopCommand,
  type ErrorDomain
} from "@shared/index"
import type { ProjectService } from "./project-service"
import type { ProviderRuntimeService } from "./services/provider-runtime-service"
import type { CustomModelsService } from "./services/custom-models-service"
import type { NotificationService } from "./services/notification-service"
import type { UpdateService } from "./services/update-service"
import { TEAMCOW_DESKTOP_CHANNEL } from "./desktop-channel"

type DesktopServices = {
  projectService: ProjectService
  providerRuntimeService: Pick<
    ProviderRuntimeService,
    "getSnapshot" | "refreshSnapshot" | "listProviderModels" | "invalidateModelDiscoveryCache"
  >
  customModelsService: CustomModelsService
  notificationService: NotificationService
  updateService: UpdateService
}

const commandDomainByType: Record<DesktopCommand["type"], ErrorDomain> = {
  getAppContext: "internal",
  getCurrentConversation: "conversation",
  getProviderReadiness: "provider",
  refreshProviderReadiness: "provider",
  listProviderModels: "provider",
  listProjects: "project",
  listWorktreesByProject: "worktree",
  listProjectWorktrees: "worktree",
  listConversationsByProject: "conversation",
  importProject: "project",
  selectProject: "project",
  moveProject: "project",
  removeProject: "project",
  revealProjectInFinder: "project",
  selectConversation: "conversation",
  createConversation: "conversation",
  setConversationModel: "model",
  setConversationAccessMode: "conversation",
  renameConversation: "conversation",
  deleteConversation: "conversation",
  sendConversationMessage: "provider",
  deleteQueuedConversationMessage: "conversation",
  retryConversationRunWithPermissions: "provider",
  cancelConversationRun: "provider",
  getConversationTimeline: "conversation",
  getConversationTimelinePage: "conversation",
  getConversationGitStatus: "git",
  getConversationChanges: "git",
  getConversationChangeDiff: "git",
  getConversationChangeDiffDocument: "git",
  stageConversationChanges: "git",
  unstageConversationChanges: "git",
  discardConversationChanges: "git",
  commitConversationChanges: "git",
  getConversationProjectFiles: "handoff",
  getProjectWorktreeFiles: "handoff",
  readConversationFile: "filesystem",
  writeConversationFile: "filesystem",
  createConversationFileEntry: "filesystem",
  renameConversationFileEntry: "filesystem",
  deleteConversationFileEntry: "filesystem",
  revealConversationFileEntry: "filesystem",
  openConversationHandoff: "handoff",
  listExternalOpenOptions: "handoff",
  openConversationExternal: "handoff",
  openConversationTerminal: "terminal",
  writeTerminalInput: "terminal",
  resizeTerminal: "terminal",
  closeTerminal: "terminal",
  listEditorOptions: "handoff",
  getSelectedEditor: "handoff",
  setSelectedEditor: "handoff",
  deleteWorktree: "worktree",
  getLocale: "settings",
  setLocale: "settings",
  getAppTheme: "settings",
  setAppTheme: "settings",
  addCustomModel: "model",
  removeCustomModel: "model",
  showHostNotification: "notification",
  getUpdateState: "update",
  checkForUpdates: "update",
  installUpdateAndRestart: "update"
}

const createInternalErrorResult = (err: unknown, command?: DesktopCommand) => ({
  status: "error" as const,
  error: {
    code: "INTERNAL_ERROR" as const,
    message: err instanceof Error ? err.message : String(err),
    suggestion: null,
    domain: command ? commandDomainByType[command.type] : "internal",
    context: command
      ? {
          command: command.type
        }
      : undefined
  }
})

export const executeDesktopCommand = async (services: DesktopServices, command: DesktopCommand) => {
  switch (command.type) {
    case "getAppContext":
      return appContextSnapshotSchema.parse(services.projectService.getAppContext())
    case "getCurrentConversation":
      return conversationSummarySchema.nullable().parse(services.projectService.getCurrentConversation())
    case "getProviderReadiness":
      return providerReadinessSnapshotSchema.parse(services.providerRuntimeService.getSnapshot())
    case "refreshProviderReadiness":
      return providerReadinessSnapshotSchema.parse(await services.providerRuntimeService.refreshSnapshot())
    case "listProviderModels":
      return providerModelOptionSchema.array().parse(
        await services.providerRuntimeService.listProviderModels(command.input.providerKind)
      )
    case "listProjects":
      return importedProjectSummarySchema.array().parse(services.projectService.listProjects())
    case "listWorktreesByProject":
      return worktreeSummarySchema.array().parse(
        services.projectService.listWorktreesByProject(command.input.projectId)
      )
    case "listProjectWorktrees":
      return projectWorktreeSummarySchema.array().parse(
        services.projectService.listProjectWorktrees(command.input.projectId)
      )
    case "listConversationsByProject":
      return conversationSummarySchema.array().parse(
        services.projectService.listConversationsByProject(command.input.projectId)
      )
    case "importProject":
      return importProjectResultSchema.parse(await services.projectService.importProject(command.input))
    case "selectProject":
      return selectProjectResultSchema.parse(await services.projectService.selectProject(command.input.projectId))
    case "moveProject":
      return projectMutationResultSchema.parse(services.projectService.moveProject(command.input))
    case "removeProject":
      return projectMutationResultSchema.parse(services.projectService.removeProject(command.input.projectId))
    case "revealProjectInFinder":
      return revealProjectInFinderResultSchema.parse(
        await services.projectService.revealProjectInFinder(command.input.projectId)
      )
    case "selectConversation":
      return selectConversationResultSchema.parse(
        await services.projectService.selectConversation(command.input.conversationId)
      )
    case "createConversation":
      return createConversationResultSchema.parse(await services.projectService.createConversation(command.input))
    case "setConversationModel":
      return setConversationModelResultSchema.parse(
        await services.projectService.setConversationModel(command.input)
      )
    case "setConversationAccessMode":
      return setConversationAccessModeResultSchema.parse(
        await services.projectService.setConversationAccessMode(command.input)
      )
    case "renameConversation":
      return renameConversationResultSchema.parse(
        await services.projectService.renameConversation(command.input)
      )
    case "deleteConversation":
      return deleteConversationResultSchema.parse(
        await services.projectService.deleteConversation(command.input)
      )
    case "sendConversationMessage":
      return sendConversationMessageResultSchema.parse(
        await services.projectService.sendConversationMessage(command.input)
      )
    case "deleteQueuedConversationMessage":
      return deleteQueuedConversationMessageResultSchema.parse(
        await services.projectService.deleteQueuedConversationMessage(command.input)
      )
    case "retryConversationRunWithPermissions":
      return retryConversationRunWithPermissionsResultSchema.parse(
        await services.projectService.retryConversationRunWithPermissions(command.input)
      )
    case "cancelConversationRun":
      return cancelConversationRunResultSchema.parse(
        await services.projectService.cancelConversationRun(command.input)
      )
    case "getConversationTimeline":
      try {
        return getConversationTimelineResultSchema.parse(
          services.projectService.getConversationTimeline(command.input.conversationId)
        )
      } catch (err) {
        return getConversationTimelineResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "getConversationTimelinePage":
      try {
        return getConversationTimelinePageResultSchema.parse(
          services.projectService.getConversationTimelinePage(command.input)
        )
      } catch (err) {
        return getConversationTimelinePageResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "getConversationGitStatus":
      try {
        return getConversationGitStatusResultSchema.parse(
          await services.projectService.getConversationGitStatus(command.input)
        )
      } catch (err) {
        return getConversationGitStatusResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "getConversationChanges":
      try {
        return getConversationChangesResultSchema.parse(
          await services.projectService.getConversationChanges(command.input)
        )
      } catch (err) {
        return getConversationChangesResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "getConversationChangeDiff":
      try {
        return getConversationChangeDiffResultSchema.parse(
          await services.projectService.getConversationChangeDiff(command.input)
        )
      } catch (err) {
        return getConversationChangeDiffResultSchema.parse({
          ...createInternalErrorResult(err, command),
          ...command.input
        })
      }
    case "getConversationChangeDiffDocument":
      try {
        return getConversationChangeDiffDocumentResultSchema.parse(
          await services.projectService.getConversationChangeDiffDocument(command.input)
        )
      } catch (err) {
        return getConversationChangeDiffDocumentResultSchema.parse({
          ...createInternalErrorResult(err, command),
          ...command.input
        })
      }
    case "stageConversationChanges":
      try {
        return stageConversationChangesResultSchema.parse(
          await services.projectService.stageConversationChanges(command.input)
        )
      } catch (err) {
        return stageConversationChangesResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "unstageConversationChanges":
      try {
        return unstageConversationChangesResultSchema.parse(
          await services.projectService.unstageConversationChanges(command.input)
        )
      } catch (err) {
        return unstageConversationChangesResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "discardConversationChanges":
      try {
        return discardConversationChangesResultSchema.parse(
          await services.projectService.discardConversationChanges(command.input)
        )
      } catch (err) {
        return discardConversationChangesResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "commitConversationChanges":
      try {
        return commitConversationChangesResultSchema.parse(
          await services.projectService.commitConversationChanges(command.input)
        )
      } catch (err) {
        return commitConversationChangesResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "getConversationProjectFiles":
      try {
        return getConversationProjectFilesResultSchema.parse(
          await services.projectService.getConversationProjectFiles(command.input.conversationId, command.input.directoryPath)
        )
      } catch (err) {
        return getConversationProjectFilesResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "getProjectWorktreeFiles":
      try {
        return getProjectWorktreeFilesResultSchema.parse(
          await services.projectService.getProjectWorktreeFiles(command.input.projectId, command.input.worktreeId, command.input.directoryPath)
        )
      } catch (err) {
        return getProjectWorktreeFilesResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "readConversationFile":
      try {
        return conversationFileReadResultSchema.parse(
          services.projectService.readConversationFile(command.input)
        )
      } catch (err) {
        return conversationFileReadResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "writeConversationFile":
      try {
        return conversationFileWriteResultSchema.parse(
          services.projectService.writeConversationFile(command.input)
        )
      } catch (err) {
        return conversationFileWriteResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "createConversationFileEntry":
      try {
        return conversationFileEntryMutationResultSchema.parse(
          services.projectService.createConversationFileEntry(command.input)
        )
      } catch (err) {
        return conversationFileEntryMutationResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "renameConversationFileEntry":
      try {
        return conversationFileEntryMutationResultSchema.parse(
          services.projectService.renameConversationFileEntry(command.input)
        )
      } catch (err) {
        return conversationFileEntryMutationResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "deleteConversationFileEntry":
      try {
        return conversationFileEntryMutationResultSchema.parse(
          services.projectService.deleteConversationFileEntry(command.input)
        )
      } catch (err) {
        return conversationFileEntryMutationResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "revealConversationFileEntry":
      try {
        return conversationFileEntryRevealResultSchema.parse(
          await services.projectService.revealConversationFileEntry(command.input)
        )
      } catch (err) {
        return conversationFileEntryRevealResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "openConversationHandoff":
      try {
        return openConversationHandoffResultSchema.parse(
          await services.projectService.openConversationHandoff(command.input)
        )
      } catch (err) {
        return openConversationHandoffResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "listExternalOpenOptions":
      return externalOpenOptionSchema.array().parse(services.projectService.listExternalOpenOptions())
    case "openConversationExternal":
      try {
        return openConversationExternalResultSchema.parse(
          await services.projectService.openConversationExternal(command.input)
        )
      } catch (err) {
        return openConversationExternalResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "openConversationTerminal":
      try {
        return openConversationTerminalResultSchema.parse(
          await services.projectService.openConversationTerminal(command.input)
        )
      } catch (err) {
        return openConversationTerminalResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "writeTerminalInput":
      try {
        return terminalActionResultSchema.parse(services.projectService.writeTerminalInput(command.input))
      } catch (err) {
        return terminalActionResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "resizeTerminal":
      try {
        return terminalActionResultSchema.parse(services.projectService.resizeTerminal(command.input))
      } catch (err) {
        return terminalActionResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "closeTerminal":
      try {
        return terminalActionResultSchema.parse(services.projectService.closeTerminal(command.input))
      } catch (err) {
        return terminalActionResultSchema.parse(createInternalErrorResult(err, command))
      }
    case "listEditorOptions":
      return editorOptionSchema.array().parse(services.projectService.listEditorOptions())
    case "getSelectedEditor":
      return selectedEditorResultSchema.parse(services.projectService.getSelectedEditor())
    case "setSelectedEditor":
      return selectedEditorResultSchema.parse(services.projectService.setSelectedEditor(command.input))
    case "deleteWorktree":
      return deleteWorktreeResultSchema.parse(await services.projectService.deleteWorktree(command.input))
    case "getLocale":
      return services.projectService.getLocale()
    case "setLocale":
      services.projectService.setLocale(command.input.locale)
      return
    case "getAppTheme":
      return services.projectService.getAppTheme()
    case "setAppTheme":
      services.projectService.setAppTheme(command.input.theme)
      return
    case "addCustomModel": {
      const result = services.customModelsService.add(command.input)
      if (result.status === "error") {
        return customModelMutationResultSchema.parse(result)
      }
      services.providerRuntimeService.invalidateModelDiscoveryCache(command.input.providerKind)
      const models = await services.providerRuntimeService.listProviderModels(command.input.providerKind)
      return customModelMutationResultSchema.parse({ status: "ok", models })
    }
    case "removeCustomModel": {
      const result = services.customModelsService.remove(command.input)
      if (result.status === "error") {
        return customModelMutationResultSchema.parse(result)
      }
      services.providerRuntimeService.invalidateModelDiscoveryCache(command.input.providerKind)
      const models = await services.providerRuntimeService.listProviderModels(command.input.providerKind)
      return customModelMutationResultSchema.parse({ status: "ok", models })
    }
    case "showHostNotification":
      return hostNotificationResultSchema.parse(services.notificationService.showHostNotification(command.input))
    case "getUpdateState":
      return updateStateSchema.parse(services.updateService.getState())
    case "checkForUpdates":
      return updateActionResultSchema.parse(await services.updateService.checkForUpdates())
    case "installUpdateAndRestart":
      return updateActionResultSchema.parse(services.updateService.installUpdateAndRestart())
  }
}

export const registerDesktopRouter = (services: DesktopServices) => {
  ipcMain.handle(TEAMCOW_DESKTOP_CHANNEL, async (_event, rawCommand) => {
    const command = desktopCommandSchema.parse(rawCommand)

    try {
      return await executeDesktopCommand(services, command)
    } catch (err) {
      if (
        command.type === "getAppContext" ||
        command.type === "getCurrentConversation" ||
        command.type === "getProviderReadiness" ||
        command.type === "refreshProviderReadiness" ||
        command.type === "listProviderModels" ||
        command.type === "listProjects" ||
        command.type === "listWorktreesByProject" ||
        command.type === "listProjectWorktrees" ||
        command.type === "listConversationsByProject"
      ) {
        throw err
      }

      return createInternalErrorResult(err, command)
    }
  })
}
