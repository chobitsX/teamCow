import { faEye, faMessage, faXmark } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { useTranslation } from "react-i18next"
import type { ConversationEditorTab } from "./conversation-file-editor-model"

type EditorTabsProps = {
  tabs: ConversationEditorTab[]
  activeTabId: string | null
  chatActive: boolean
  onSelectChat: () => void
  onSelect: (tabId: string) => void
  onPin: (tabId: string) => void
  onClose: (tabId: string) => void
}

export const EditorTabs = ({
  tabs,
  activeTabId,
  chatActive,
  onSelectChat,
  onSelect,
  onPin,
  onClose
}: EditorTabsProps) => {
  const { t } = useTranslation("inspector")

  return (
    <div className="editor-tabs" role="tablist" aria-label={t("editor.title")}>
      <button
        type="button"
        role="tab"
        aria-selected={chatActive}
        className={`editor-tab editor-tab--chat${chatActive ? " active" : ""}`}
        data-testid="editor-tab-chat"
        onClick={onSelectChat}
      >
        <span className="editor-tab-chat-icon" aria-hidden="true">
          <FontAwesomeIcon icon={faMessage} />
        </span>
        <span className="editor-tab-title">{t("editor.chat")}</span>
      </button>
      {tabs.map((tab) => {
        const unsavedLabel = t("editor.unsaved")

        return (
          <div
            key={tab.id}
            className={`editor-tab${tab.id === activeTabId ? " active" : ""}${tab.pinned ? " pinned" : " preview"}`}
            data-editor-tab-mode={tab.pinned ? "pinned" : "preview"}
            data-testid={`editor-tab-${tab.filePath}`}
            data-editor-resource={tab.resourceType ?? "file"}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab.id === activeTabId}
              className="editor-tab-select"
              onClick={() => onSelect(tab.id)}
              onDoubleClick={() => onPin(tab.id)}
              title={tab.filePath}
            >
              {!tab.pinned ? (
                <span
                  className="editor-tab-preview-indicator"
                  aria-label={t("editor.preview-description")}
                  title={t("editor.preview-description")}
                >
                  <FontAwesomeIcon icon={faEye} />
                  <span>{t("editor.preview")}</span>
                </span>
              ) : null}
              <span className="editor-tab-title">
                {tab.title}
                {tab.dirty ? (
                  <>
                    <span aria-hidden="true"> *</span>
                    <span className="visually-hidden"> {unsavedLabel}</span>
                  </>
                ) : null}
              </span>
              {tab.resourceType === "change-diff" ? (
                <span className={`editor-tab-area editor-tab-area-${tab.area}`}>
                  {t(`changes.section.${tab.area}`)}
                </span>
              ) : null}
            </button>
            <span className="editor-tab-actions">
              <button
                type="button"
                aria-label={t("editor.close")}
                className="editor-tab-icon"
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}
