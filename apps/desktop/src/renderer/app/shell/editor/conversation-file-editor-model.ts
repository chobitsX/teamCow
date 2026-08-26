import type { ConversationChangeArea, ConversationFileMetadata } from "@shared/index"

export type ConversationFileTextDocumentSnapshot = {
  status: "text"
  file: ConversationFileMetadata
  content: string
  draft: string
  savedContent: string
}

export type ConversationFileDocumentSnapshot = ConversationFileTextDocumentSnapshot

export type ConversationFileEditorTab = {
  id: string
  conversationId: string
  filePath: string
  title: string
  pinned: boolean
  dirty: boolean
  documentSnapshot?: ConversationFileDocumentSnapshot
  resourceType?: "file"
}

export type ConversationChangeDiffEditorTab = {
  id: string
  conversationId: string
  worktreeId: string
  revision: string
  area: ConversationChangeArea
  filePath: string
  title: string
  pinned: boolean
  dirty: false
  resourceType: "change-diff"
}

export type ConversationEditorTab = ConversationFileEditorTab | ConversationChangeDiffEditorTab

export type ConversationFileEditorState = {
  tabs: ConversationEditorTab[]
  activeTabId: string | null
}

export type OpenConversationFileTabInput = {
  conversationId: string
  filePath: string
  mode: "preview" | "pinned"
}

export type OpenConversationChangeDiffTabInput = {
  conversationId: string
  worktreeId: string
  revision: string
  area: ConversationChangeArea
  filePath: string
  mode: "preview" | "pinned"
}

export type CloseConversationFileTabResult =
  | { status: "closed"; state: ConversationFileEditorState }
  | { status: "blocked-dirty"; tab: ConversationEditorTab }

export const createEmptyConversationFileEditorState = (): ConversationFileEditorState => ({
  tabs: [],
  activeTabId: null
})

export const createEditorTabId = (conversationId: string, filePath: string) => `${conversationId}:${filePath}`

export const createChangeDiffEditorTabId = (
  conversationId: string,
  worktreeId: string,
  revision: string,
  area: ConversationChangeArea,
  filePath: string
// eslint-disable-next-line i18next/no-literal-string -- Resource IDs use an internal typed discriminator.
) => JSON.stringify(["change-diff", conversationId, worktreeId, revision, area, filePath])

const getFileTitle = (filePath: string) => {
  const parts = filePath.split("/")
  return parts.at(-1) || filePath
}

export const openConversationFileTab = (
  state: ConversationFileEditorState,
  input: OpenConversationFileTabInput
): ConversationFileEditorState => {
  const id = createEditorTabId(input.conversationId, input.filePath)
  const existing = state.tabs.find((tab) => tab.id === id)

  if (existing) {
    return {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === id && input.mode === "pinned"
          ? { ...tab, pinned: true }
          : tab
      ),
      activeTabId: id
    }
  }

  const nextTab: ConversationFileEditorTab = {
    id,
    conversationId: input.conversationId,
    filePath: input.filePath,
    title: getFileTitle(input.filePath),
    pinned: input.mode === "pinned",
    dirty: false
  }

  const cleanPreview = state.tabs.find((tab) => !tab.pinned && !tab.dirty)
  const tabsWithDirtyPinned = state.tabs.map((tab) =>
    !tab.pinned && tab.dirty ? { ...tab, pinned: true } : tab
  )
  const tabs =
    input.mode === "preview" && cleanPreview
      ? tabsWithDirtyPinned.map((tab) => (tab.id === cleanPreview.id ? nextTab : tab))
      : [...tabsWithDirtyPinned, nextTab]

  return {
    tabs,
    activeTabId: id
  }
}

export const openConversationChangeDiffTab = (
  state: ConversationFileEditorState,
  input: OpenConversationChangeDiffTabInput
): ConversationFileEditorState => {
  const id = createChangeDiffEditorTabId(
    input.conversationId,
    input.worktreeId,
    input.revision,
    input.area,
    input.filePath
  )
  const existing = state.tabs.find((tab) => tab.id === id)
  if (existing) {
    return {
      ...state,
      tabs: state.tabs.map((tab) => tab.id === id && input.mode === "pinned" ? { ...tab, pinned: true } : tab),
      activeTabId: id
    }
  }

  const nextTab: ConversationChangeDiffEditorTab = {
    id,
    conversationId: input.conversationId,
    worktreeId: input.worktreeId,
    revision: input.revision,
    area: input.area,
    filePath: input.filePath,
    title: getFileTitle(input.filePath),
    pinned: input.mode === "pinned",
    dirty: false,
    // eslint-disable-next-line i18next/no-literal-string -- Resource type is an internal discriminant.
    resourceType: "change-diff"
  }
  const cleanPreview = state.tabs.find((tab) => !tab.pinned && !tab.dirty)
  const tabsWithDirtyPinned = state.tabs.map((tab) => !tab.pinned && tab.dirty ? { ...tab, pinned: true } : tab)
  const tabs = input.mode === "preview" && cleanPreview
    ? tabsWithDirtyPinned.map((tab) => tab.id === cleanPreview.id ? nextTab : tab)
    : [...tabsWithDirtyPinned, nextTab]
  return { tabs, activeTabId: id }
}

export const pinConversationFileTab = (
  state: ConversationFileEditorState,
  tabId: string
): ConversationFileEditorState => ({
  ...state,
  tabs: state.tabs.map((tab) => tab.id === tabId ? { ...tab, pinned: true } : tab)
})

export const markConversationFileTabDirty = (
  state: ConversationFileEditorState,
  tabId: string,
  dirty: boolean
): ConversationFileEditorState => ({
  ...state,
  tabs: state.tabs.map((tab) =>
    tab.resourceType !== "change-diff" && tab.id === tabId
      ? { ...tab, dirty, pinned: dirty ? true : tab.pinned }
      : tab
  )
})

const areDocumentSnapshotsEqual = (
  left: ConversationFileDocumentSnapshot | undefined,
  right: ConversationFileDocumentSnapshot | undefined
) => {
  if (!left || !right) {
    return left === right
  }

  return left.status === right.status &&
    left.file.revision === right.file.revision &&
    left.file.byteLength === right.file.byteLength &&
    left.file.absolutePath === right.file.absolutePath &&
    left.content === right.content &&
    left.draft === right.draft &&
    left.savedContent === right.savedContent
}

export const updateConversationFileTabDocumentSnapshot = (
  state: ConversationFileEditorState,
  tabId: string,
  documentSnapshot: ConversationFileDocumentSnapshot | undefined
): ConversationFileEditorState => {
  let changed = false
  const tabs = state.tabs.map((tab) => {
    if (
      tab.resourceType === "change-diff" ||
      tab.id !== tabId ||
      areDocumentSnapshotsEqual(tab.documentSnapshot, documentSnapshot)
    ) {
      return tab
    }

    changed = true
    return { ...tab, documentSnapshot }
  })

  return changed ? { ...state, tabs } : state
}

export const closeConversationFileTab = (
  state: ConversationFileEditorState,
  tabId: string
): CloseConversationFileTabResult => {
  const target = state.tabs.find((tab) => tab.id === tabId)
  if (!target) {
    return { status: "closed", state }
  }

  if (target.dirty) {
    return { status: "blocked-dirty", tab: target }
  }

  const tabs = state.tabs.filter((tab) => tab.id !== tabId)
  const activeTabId = state.activeTabId === tabId
    ? tabs.at(-1)?.id ?? null
    : state.activeTabId

  return {
    status: "closed",
    state: { tabs, activeTabId }
  }
}

export const resetConversationFileTabsForConversation = (
  state: ConversationFileEditorState,
  conversationId: string | null
): ConversationFileEditorState => {
  const tabs = state.tabs.filter((tab) =>
    tab.dirty ||
    (tab.resourceType === "change-diff" && tab.pinned) ||
    (conversationId !== null && tab.conversationId === conversationId)
  )
  const activeTabId = tabs.some((tab) => tab.id === state.activeTabId)
    ? state.activeTabId
    : tabs.at(-1)?.id ?? null

  return tabs.length === state.tabs.length && activeTabId === state.activeTabId
    ? state
    : { tabs, activeTabId }
}
