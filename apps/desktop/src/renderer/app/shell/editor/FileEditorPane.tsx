import { faArrowUpRightFromSquare, faFloppyDisk } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES,
  type AppError,
  type ConversationSummary
} from "@shared/index"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { CodeEditor } from "./CodeEditor"
import type { ConversationFileEditorTab } from "./conversation-file-editor-model"
import { detectEditorLanguage } from "./language"
import { useConversationFileDocument } from "./use-conversation-file-document"

export type FileEditorPaneActions = {
  save: () => Promise<"saved" | "conflict" | "readonly" | "error" | "skipped">
}

export type FileEditorExternalOpenMessage = {
  tone: "error"
  text: string
}

type FileEditorPaneProps = {
  conversation: ConversationSummary
  tab: ConversationFileEditorTab
  active: boolean
  onDirtyChange: (tabId: string, dirty: boolean) => void
  onDocumentSnapshotChange: Parameters<typeof useConversationFileDocument>[2]
  onRegisterActions: (tabId: string, actions: FileEditorPaneActions | null) => void
  onOpenExternal: (conversationId: string, filePath: string) => Promise<FileEditorExternalOpenMessage | null>
}

const getErrorCopy = (
  error: AppError,
  t: (key: string, options?: Record<string, unknown>) => string
) => t(`errors:${error.code}`, { defaultValue: error.message })

const formatMegabytes = (byteLength: number) => {
  const megabytes = byteLength / (1024 * 1024)
  return megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1)
}

export const FileEditorPane = ({
  conversation,
  tab,
  active,
  onDirtyChange,
  onDocumentSnapshotChange,
  onRegisterActions,
  onOpenExternal
}: FileEditorPaneProps) => {
  const { t } = useTranslation(["inspector", "errors"])
  const readOnly = conversation.runStatus === "running"
  const document = useConversationFileDocument(tab, readOnly, onDocumentSnapshotChange)
  const [externalOpenState, setExternalOpenState] = useState<
    { status: "idle" | "opening" } | { status: "error"; text: string }
  >({ status: "idle" })

  useEffect(() => {
    onDirtyChange(tab.id, document.dirty)
  }, [document.dirty, onDirtyChange, tab.id])

  useEffect(() => {
    onRegisterActions(tab.id, { save: document.save })
    return () => onRegisterActions(tab.id, null)
  }, [document.save, onRegisterActions, tab.id])

  const statusLabel = readOnly
    ? t("editor.readonly.run-active")
    : document.saveState.status === "saving"
      ? t("editor.saving")
      : document.dirty
        ? t("editor.unsaved")
        : t("editor.saved")
  const saveAlert = document.saveState.status === "error" || document.saveState.status === "readonly"
    ? {
        tone: document.saveState.status,
        title: document.saveState.status === "readonly"
          ? t("editor.save-alert.readonly-title")
          : t("editor.save-alert.error-title"),
        body: getErrorCopy(document.saveState.error, t)
      }
    : null
  const handleOpenExternal = async () => {
    setExternalOpenState({ status: "opening" })
    const result = await onOpenExternal(tab.conversationId, tab.filePath)
    setExternalOpenState(result ? { status: result.tone, text: result.text } : { status: "idle" })
  }
  const externalOpenMessage = externalOpenState.status === "error" ? externalOpenState : null

  return (
    <section
      className={`file-editor-pane${active ? " active" : ""}`}
      data-testid="file-editor-pane"
      hidden={!active}
    >
      <header className="file-editor-toolbar">
        <div className="file-editor-title">
          <strong title={tab.filePath}>{tab.filePath}</strong>
          <span>{statusLabel}</span>
        </div>
        <button
          className="file-editor-action"
          type="button"
          data-testid="file-editor-save"
          disabled={readOnly || document.document.status !== "text" || !document.dirty || document.saveState.status === "saving"}
          onClick={() => void document.save()}
        >
          <FontAwesomeIcon icon={faFloppyDisk} />
          {t("editor.save")}
        </button>
        <button
          className="file-editor-action"
          type="button"
          data-testid="file-editor-open-external"
          disabled={externalOpenState.status === "opening"}
          onClick={() => void handleOpenExternal()}
        >
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
          {externalOpenState.status === "opening" ? t("editor.opening-external") : t("editor.open-external")}
        </button>
      </header>

      {externalOpenMessage ? (
        <p
          className={`file-editor-handoff-message ${externalOpenMessage.status}`}
          data-testid="file-editor-handoff-message"
          role="alert"
        >
          {externalOpenMessage.text}
        </p>
      ) : null}

      {document.saveState.status === "conflict" ? (
        <div className="file-editor-conflict" data-testid="file-editor-conflict">
          <div className="file-editor-conflict-copy">
            <strong>{t("editor.conflict.title")}</strong>
            <span>{t("editor.conflict.description")}</span>
          </div>
          <div className="file-editor-conflict-actions">
            <button type="button" onClick={document.reloadFromDisk}>{t("editor.conflict.reload")}</button>
            <button type="button" onClick={document.overwrite}>{t("editor.conflict.overwrite")}</button>
            <button type="button" onClick={document.keepEditing}>{t("editor.conflict.keep")}</button>
          </div>
        </div>
      ) : null}

      {saveAlert ? (
        <div
          className={`file-editor-alert ${saveAlert.tone}`}
          data-testid="file-editor-save-alert"
          role="alert"
        >
          <strong>{saveAlert.title}</strong>
          <span>{saveAlert.body}</span>
        </div>
      ) : null}

      {document.largeFileMode ? (
        <div className="file-editor-large-file-notice" data-testid="file-editor-large-file-notice" role="status">
          <strong>{t("editor.large-file.mode-title")}</strong>
          <span>{t("editor.large-file.mode-description")}</span>
        </div>
      ) : null}

      <div className="file-editor-body">
        {document.document.status === "loading" || document.document.status === "idle" ? (
          <p className="file-editor-state">{t("editor.loading")}</p>
        ) : null}
        {document.document.status === "binary" ? <p className="file-editor-state">{t("editor.binary")}</p> : null}
        {document.document.status === "too-large" ? (
          <div className="file-editor-large-file-prompt" data-testid="file-editor-large-file-prompt">
            <strong>
              {document.canOpenLargeFile
                ? t("editor.large-file.confirm-title")
                : t("editor.large-file.limit-title")}
            </strong>
            <span>
              {document.canOpenLargeFile
                ? t("editor.large-file.confirm-description", {
                    size: formatMegabytes(document.document.file.byteLength)
                  })
                : t("editor.large-file.limit-description", {
                    size: formatMegabytes(document.document.file.byteLength),
                    limit: formatMegabytes(CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES)
                  })}
            </span>
            {document.canOpenLargeFile ? (
              <button type="button" data-testid="file-editor-open-large" onClick={document.openLargeFile}>
                {t("editor.large-file.open-anyway")}
              </button>
            ) : null}
          </div>
        ) : null}
        {document.document.status === "not-found" ? <p className="file-editor-state">{t("editor.not-found")}</p> : null}
        {document.document.status === "is-directory" ? <p className="file-editor-state">{t("editor.is-directory")}</p> : null}
        {document.document.status === "error" ? (
          <p className="file-editor-state error">{getErrorCopy(document.document.error, t) || t("editor.error")}</p>
        ) : null}
        {document.document.status === "text" ? (
          <CodeEditor
            value={document.document.draft}
            language={detectEditorLanguage(tab.filePath)}
            readOnly={readOnly}
            largeFileMode={document.largeFileMode}
            onChange={document.setDraft}
            onSave={() => void document.save()}
          />
        ) : null}
      </div>
      {document.document.status === "text" ? (
        <footer className="file-editor-status">
          <span>{detectEditorLanguage(tab.filePath)}</span>
          <span>{t("editor.encoding.utf8")}</span>
          <span>{t("editor.bytes", { count: document.document.file.byteLength })}</span>
          {document.largeFileMode ? <span>{t("editor.large-file.status")}</span> : null}
        </footer>
      ) : null}
    </section>
  )
}
