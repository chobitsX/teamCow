import { ipcRenderer } from "electron"
import { runEventPushPayloadSchema, terminalOutputEventSchema, updateStateSchema, worktreeGitChangedEventSchema, type AppThemePreference, type DesktopCommand, type Locale, type TeamcowDesktopApi } from "@shared/index"
import { TEAMCOW_DESKTOP_CHANNEL, TEAMCOW_RUN_EVENT_CHANNEL, TEAMCOW_TERMINAL_OUTPUT_CHANNEL, TEAMCOW_UPDATE_STATE_CHANNEL, TEAMCOW_WORKTREE_GIT_CHANGED_CHANNEL } from "../desktop-channel"

const invokeDesktopCommand = async (command: DesktopCommand) => {
  return ipcRenderer.invoke(TEAMCOW_DESKTOP_CHANNEL, command)
}

export const desktopApi: TeamcowDesktopApi = {
  async getAppContext() {
    return invokeDesktopCommand({ type: "getAppContext" })
  },
  async getCurrentConversation() {
    return invokeDesktopCommand({ type: "getCurrentConversation" })
  },
  async getProviderReadiness() {
    return invokeDesktopCommand({ type: "getProviderReadiness" })
  },
  async refreshProviderReadiness() {
    return invokeDesktopCommand({ type: "refreshProviderReadiness" })
  },
  async listProviderModels(providerKind) {
    return invokeDesktopCommand({ type: "listProviderModels", input: { providerKind } })
  },
  async listProjects() {
    return invokeDesktopCommand({ type: "listProjects" })
  },
  async listWorktreesByProject(projectId) {
    return invokeDesktopCommand({ type: "listWorktreesByProject", input: { projectId } })
  },
  async listProjectWorktrees(projectId) {
    return invokeDesktopCommand({ type: "listProjectWorktrees", input: { projectId } })
  },
  async listConversationsByProject(projectId) {
    return invokeDesktopCommand({ type: "listConversationsByProject", input: { projectId } })
  },
  async importProject(input) {
    return invokeDesktopCommand({ type: "importProject", input })
  },
  async selectProject(projectId) {
    return invokeDesktopCommand({ type: "selectProject", input: { projectId } })
  },
  async moveProject(input) {
    return invokeDesktopCommand({ type: "moveProject", input })
  },
  async removeProject(projectId) {
    return invokeDesktopCommand({ type: "removeProject", input: { projectId } })
  },
  async revealProjectInFinder(projectId) {
    return invokeDesktopCommand({ type: "revealProjectInFinder", input: { projectId } })
  },
  async selectConversation(conversationId) {
    return invokeDesktopCommand({ type: "selectConversation", input: { conversationId } })
  },
  async createConversation(input) {
    return invokeDesktopCommand({ type: "createConversation", input })
  },
  async setConversationModel(input) {
    return invokeDesktopCommand({ type: "setConversationModel", input })
  },
  async setConversationAccessMode(input) {
    return invokeDesktopCommand({ type: "setConversationAccessMode", input })
  },
  async renameConversation(input) {
    return invokeDesktopCommand({ type: "renameConversation", input })
  },
  async deleteConversation(input) {
    return invokeDesktopCommand({ type: "deleteConversation", input })
  },
  async sendConversationMessage(input) {
    return invokeDesktopCommand({ type: "sendConversationMessage", input })
  },
  async deleteQueuedConversationMessage(input) {
    return invokeDesktopCommand({ type: "deleteQueuedConversationMessage", input })
  },
  async retryConversationRunWithPermissions(input) {
    return invokeDesktopCommand({ type: "retryConversationRunWithPermissions", input })
  },
  async cancelConversationRun(input) {
    return invokeDesktopCommand({ type: "cancelConversationRun", input })
  },
  async getConversationTimeline(conversationId) {
    return invokeDesktopCommand({ type: "getConversationTimeline", input: { conversationId } })
  },
  async getConversationTimelinePage(input) {
    return invokeDesktopCommand({ type: "getConversationTimelinePage", input })
  },
  async getConversationGitStatus(conversationId, commitScope) {
    return invokeDesktopCommand({
      type: "getConversationGitStatus",
      input: { conversationId, commitScope }
    })
  },
  async getConversationChanges(conversationId) {
    return invokeDesktopCommand({ type: "getConversationChanges", input: { conversationId } })
  },
  async getConversationChangeDiff(input) {
    return invokeDesktopCommand({ type: "getConversationChangeDiff", input })
  },
  async getConversationChangeDiffDocument(input) {
    return invokeDesktopCommand({ type: "getConversationChangeDiffDocument", input })
  },
  async stageConversationChanges(input) {
    return invokeDesktopCommand({ type: "stageConversationChanges", input })
  },
  async unstageConversationChanges(input) {
    return invokeDesktopCommand({ type: "unstageConversationChanges", input })
  },
  async discardConversationChanges(input) {
    return invokeDesktopCommand({ type: "discardConversationChanges", input })
  },
  async commitConversationChanges(input) {
    return invokeDesktopCommand({ type: "commitConversationChanges", input })
  },
  async getConversationProjectFiles(conversationId, directoryPath) {
    return invokeDesktopCommand({ type: "getConversationProjectFiles", input: { conversationId, directoryPath } })
  },
  async getProjectWorktreeFiles(projectId, worktreeId, directoryPath) {
    return invokeDesktopCommand({ type: "getProjectWorktreeFiles", input: { projectId, worktreeId, directoryPath } })
  },
  async readConversationFile(input) {
    return invokeDesktopCommand({ type: "readConversationFile", input })
  },
  async writeConversationFile(input) {
    return invokeDesktopCommand({ type: "writeConversationFile", input })
  },
  async createConversationFileEntry(input) {
    return invokeDesktopCommand({ type: "createConversationFileEntry", input })
  },
  async renameConversationFileEntry(input) {
    return invokeDesktopCommand({ type: "renameConversationFileEntry", input })
  },
  async deleteConversationFileEntry(input) {
    return invokeDesktopCommand({ type: "deleteConversationFileEntry", input })
  },
  async revealConversationFileEntry(input) {
    return invokeDesktopCommand({ type: "revealConversationFileEntry", input })
  },
  async openConversationHandoff(input) {
    return invokeDesktopCommand({ type: "openConversationHandoff", input })
  },
  async listExternalOpenOptions() {
    return invokeDesktopCommand({ type: "listExternalOpenOptions" })
  },
  async openConversationExternal(input) {
    return invokeDesktopCommand({ type: "openConversationExternal", input })
  },
  async openConversationTerminal(input) {
    return invokeDesktopCommand({ type: "openConversationTerminal", input })
  },
  async writeTerminalInput(input) {
    return invokeDesktopCommand({ type: "writeTerminalInput", input })
  },
  async resizeTerminal(input) {
    return invokeDesktopCommand({ type: "resizeTerminal", input })
  },
  async closeTerminal(input) {
    return invokeDesktopCommand({ type: "closeTerminal", input })
  },
  onTerminalOutput(callback) {
    const listener = (_event: unknown, rawEvent: unknown) => {
      callback(terminalOutputEventSchema.parse(rawEvent))
    }
    ipcRenderer.on(TEAMCOW_TERMINAL_OUTPUT_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(TEAMCOW_TERMINAL_OUTPUT_CHANNEL, listener)
    }
  },
  onRunEvent(callback) {
    const listener = (_event: unknown, rawEvent: unknown) => {
      callback(runEventPushPayloadSchema.parse(rawEvent))
    }
    ipcRenderer.on(TEAMCOW_RUN_EVENT_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(TEAMCOW_RUN_EVENT_CHANNEL, listener)
    }
  },
  onWorktreeGitChanged(callback) {
    const listener = (_event: unknown, rawEvent: unknown) => {
      callback(worktreeGitChangedEventSchema.parse(rawEvent))
    }
    ipcRenderer.on(TEAMCOW_WORKTREE_GIT_CHANGED_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(TEAMCOW_WORKTREE_GIT_CHANGED_CHANNEL, listener)
    }
  },
  onUpdateState(callback) {
    const listener = (_event: unknown, rawState: unknown) => {
      callback(updateStateSchema.parse(rawState))
    }
    ipcRenderer.on(TEAMCOW_UPDATE_STATE_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(TEAMCOW_UPDATE_STATE_CHANNEL, listener)
    }
  },
  async listEditorOptions() {
    return invokeDesktopCommand({ type: "listEditorOptions" })
  },
  async getSelectedEditor() {
    return invokeDesktopCommand({ type: "getSelectedEditor" })
  },
  async setSelectedEditor(input) {
    return invokeDesktopCommand({ type: "setSelectedEditor", input })
  },
  async deleteWorktree(input) {
    return invokeDesktopCommand({ type: "deleteWorktree", input })
  },
  async getLocale() {
    return invokeDesktopCommand({ type: "getLocale" }) as Promise<Locale>
  },
  async setLocale(locale: Locale) {
    await invokeDesktopCommand({ type: "setLocale", input: { locale } })
  },
  async getAppTheme() {
    return invokeDesktopCommand({ type: "getAppTheme" }) as Promise<AppThemePreference>
  },
  async setAppTheme(theme: AppThemePreference) {
    await invokeDesktopCommand({ type: "setAppTheme", input: { theme } })
  },
  async addCustomModel(input) {
    return invokeDesktopCommand({ type: "addCustomModel", input })
  },
  async removeCustomModel(input) {
    return invokeDesktopCommand({ type: "removeCustomModel", input })
  },
  async showHostNotification(input) {
    return invokeDesktopCommand({ type: "showHostNotification", input })
  },
  async getUpdateState() {
    return invokeDesktopCommand({ type: "getUpdateState" })
  },
  async checkForUpdates() {
    return invokeDesktopCommand({ type: "checkForUpdates" })
  },
  async installUpdateAndRestart() {
    return invokeDesktopCommand({ type: "installUpdateAndRestart" })
  }
}
