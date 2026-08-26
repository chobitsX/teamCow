import type { ConversationSummary } from "@shared/index"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react"
import { useTranslation } from "react-i18next"
import {
  closeConversationFileTab,
  markConversationFileTabDirty,
  pinConversationFileTab,
  updateConversationFileTabDocumentSnapshot,
  type ConversationFileDocumentSnapshot,
  type ConversationFileEditorState
} from "./conversation-file-editor-model"
import { EditorTabs } from "./EditorTabs"
import { ChangeDiffEditorPane } from "./ChangeDiffEditorPane"
import { FileEditorPane, type FileEditorExternalOpenMessage, type FileEditorPaneActions } from "./FileEditorPane"

type EditorWorkspaceProps = {
  resolveConversation: (conversationId: string) => ConversationSummary | null
  editorState: ConversationFileEditorState
  onEditorStateChange: Dispatch<SetStateAction<ConversationFileEditorState>>
  onOpenExternalFile: (conversationId: string, filePath: string) => Promise<FileEditorExternalOpenMessage | null>
  children: ReactNode
}

export const EditorWorkspace = ({
  resolveConversation,
  editorState,
  onEditorStateChange,
  onOpenExternalFile,
  children
}: EditorWorkspaceProps) => {
  const activeTab = editorState.tabs.find((tab) => tab.id === editorState.activeTabId) ?? editorState.tabs[0] ?? null
  const activeConversation = activeTab ? resolveConversation(activeTab.conversationId) : null
  const hasActiveEditor = Boolean(activeConversation && activeTab)
  const { t } = useTranslation("inspector")
  const [activeSurface, setActiveSurface] = useState<"chat" | "editor">("chat")
  const previousActiveTabIdRef = useRef(editorState.activeTabId)
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null)
  const paneActionsRef = useRef(new Map<string, FileEditorPaneActions>())

  useEffect(() => {
    const activeTabId = activeTab?.id ?? null
    if (!activeTabId) {
      setActiveSurface("chat")
    } else if (previousActiveTabIdRef.current !== activeTabId) {
      // eslint-disable-next-line i18next/no-literal-string -- Workspace view is an internal state discriminator.
      setActiveSurface("editor")
    }
    previousActiveTabIdRef.current = activeTabId
  }, [activeTab?.id])

  const registerPaneActions = useCallback((tabId: string, actions: FileEditorPaneActions | null) => {
    if (actions) {
      paneActionsRef.current.set(tabId, actions)
      return
    }
    paneActionsRef.current.delete(tabId)
  }, [])

  const markTabDirty = useCallback((tabId: string, dirty: boolean) => {
    onEditorStateChange((current) => markConversationFileTabDirty(current, tabId, dirty))
  }, [onEditorStateChange])

  const updateTabDocumentSnapshot = useCallback((
    tabId: string,
    snapshot: ConversationFileDocumentSnapshot | undefined
  ) => {
    onEditorStateChange((current) => updateConversationFileTabDocumentSnapshot(current, tabId, snapshot))
  }, [onEditorStateChange])

  const discardTab = (tabId: string) => {
    onEditorStateChange((current) => {
      const nextTabs = current.tabs.filter((tab) => tab.id !== tabId)
      return {
        tabs: nextTabs,
        activeTabId: current.activeTabId === tabId ? nextTabs.at(-1)?.id ?? null : current.activeTabId
      }
    })
    setPendingCloseTabId(null)
  }

  const closeTab = (tabId: string) => {
    const result = closeConversationFileTab(editorState, tabId)
    if (result.status === "blocked-dirty") {
      onEditorStateChange((current) => ({ ...current, activeTabId: tabId }))
      setPendingCloseTabId(tabId)
      return
    }
    onEditorStateChange(result.state)
  }

  const saveAndClosePendingTab = async () => {
    if (!pendingCloseTabId) return
    const outcome = await paneActionsRef.current.get(pendingCloseTabId)?.save()
    if (outcome === "saved" || outcome === "skipped") {
      discardTab(pendingCloseTabId)
      return
    }
  }

  return (
    <div className="editor-workspace">
      <EditorTabs
        tabs={editorState.tabs}
        activeTabId={activeSurface === "editor" && hasActiveEditor ? activeTab.id : null}
        chatActive={activeSurface === "chat" || !hasActiveEditor}
        onSelectChat={() => setActiveSurface("chat")}
        onSelect={(tabId) => {
          // eslint-disable-next-line i18next/no-literal-string -- Workspace view is an internal state discriminator.
          setActiveSurface("editor")
          onEditorStateChange((current) => ({ ...current, activeTabId: tabId }))
        }}
        onPin={(tabId) => onEditorStateChange((current) => pinConversationFileTab(current, tabId))}
        onClose={closeTab}
      />
      <div className="editor-workspace-chat" hidden={activeSurface !== "chat" && hasActiveEditor}>
        {children}
      </div>
      <div
        className="editor-workspace-editor"
        data-testid={activeSurface === "editor" && hasActiveEditor ? "editor-workspace" : undefined}
        hidden={activeSurface !== "editor" || !hasActiveEditor}
      >
        {activeConversation && activeTab ? editorState.tabs.map((tab) => (
          (() => {
            const conversation = resolveConversation(tab.conversationId)
            if (!conversation) {
              return null
            }

            if (tab.resourceType === "change-diff") {
              return (
                <ChangeDiffEditorPane
                  key={tab.id}
                  tab={tab}
                  active={activeSurface === "editor" && tab.id === activeTab.id}
                />
              )
            }

            return (
              <FileEditorPane
                key={tab.id}
                conversation={conversation}
                tab={tab}
                active={activeSurface === "editor" && tab.id === activeTab.id}
                onOpenExternal={onOpenExternalFile}
                onRegisterActions={registerPaneActions}
                onDirtyChange={markTabDirty}
                onDocumentSnapshotChange={updateTabDocumentSnapshot}
              />
            )
          })()
        )) : null}
      </div>
      {pendingCloseTabId ? (
        <div className="danger-confirmation" role="dialog" aria-modal="true" aria-labelledby="editor-dirty-close-title">
          <div className="danger-confirmation__inner">
            <h3 id="editor-dirty-close-title">
              {t("editor.close-dirty.title", { file: editorState.tabs.find((tab) => tab.id === pendingCloseTabId)?.title ?? "" })}
            </h3>
            <p>{t("editor.close-dirty.description")}</p>
            <div className="danger-confirmation__actions">
              <button type="button" onClick={() => setPendingCloseTabId(null)}>
                {t("editor.close-dirty.cancel")}
              </button>
              <button type="button" data-testid="editor-close-dirty-save" onClick={() => void saveAndClosePendingTab()}>
                {t("editor.close-dirty.save")}
              </button>
              <button
                type="button"
                className="btn danger"
                data-testid="editor-close-dirty-discard"
                onClick={() => discardTab(pendingCloseTabId)}
              >
                {t("editor.close-dirty.discard")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
