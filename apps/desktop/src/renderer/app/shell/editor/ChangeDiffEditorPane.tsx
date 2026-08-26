import type { AppError, ConversationChangeDiffDocumentResult } from "@shared/index"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { ConversationChangeDiffEditorTab } from "./conversation-file-editor-model"
import { ChangeDiffCodeView } from "./ChangeDiffCodeView"
import { detectEditorLanguage } from "./language"

type ChangeDiffEditorPaneProps = {
  tab: ConversationChangeDiffEditorTab
  active: boolean
}

type ChangeDiffDocumentState =
  | { status: "loading" }
  | { status: "ready"; result: ConversationChangeDiffDocumentResult }
  | { status: "error"; error: AppError }

const fallbackError = (error: unknown): AppError => ({
  code: "GIT_CHANGES_READ_FAILED",
  message: error instanceof Error ? error.message : String(error),
  suggestion: null,
  // eslint-disable-next-line i18next/no-literal-string -- AppError domain is a machine discriminator.
  domain: "git"
})

export const ChangeDiffEditorPane = ({ tab, active }: ChangeDiffEditorPaneProps) => {
  const { t } = useTranslation(["inspector", "errors"])
  const [document, setDocument] = useState<ChangeDiffDocumentState>({ status: "loading" })
  const requestRef = useRef(0)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!active || loadedRef.current) return
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setDocument({ status: "loading" })
    void window.teamcow.getConversationChangeDiffDocument({
      conversationId: tab.conversationId,
      worktreeId: tab.worktreeId,
      revision: tab.revision,
      area: tab.area,
      filePath: tab.filePath
    }).then((result) => {
      if (
        requestRef.current !== requestId
      ) return
      if (
        result.conversationId !== tab.conversationId ||
        result.worktreeId !== tab.worktreeId ||
        result.revision !== tab.revision ||
        result.area !== tab.area ||
        result.filePath !== tab.filePath
      ) {
        loadedRef.current = true
        setDocument({
          status: "error",
          // eslint-disable-next-line i18next/no-literal-string -- Internal diagnostic is mapped to localized AppError copy before rendering.
          error: fallbackError(new Error("Diff response identity did not match the requested resource"))
        })
        return
      }
      loadedRef.current = true
      setDocument({ status: "ready", result })
    }).catch((error: unknown) => {
      if (requestRef.current !== requestId) return
      loadedRef.current = true
      setDocument({ status: "error", error: fallbackError(error) })
    })
    return () => {
      requestRef.current += 1
    }
  }, [active, tab.area, tab.conversationId, tab.filePath, tab.revision, tab.worktreeId])

  const handleMergeViewError = useCallback((error: unknown) => {
    loadedRef.current = true
    setDocument({ status: "error", error: fallbackError(error) })
  }, [])

  const result = document.status === "ready" ? document.result : null
  const originalLabel = tab.area === "staged"
    ? t("inspector:editor.change-diff.head")
    : t("inspector:editor.change-diff.index")
  const modifiedLabel = tab.area === "staged"
    ? t("inspector:editor.change-diff.index")
    : t("inspector:editor.change-diff.worktree")
  const originalPath = result && "oldPath" in result && result.oldPath
    ? result.oldPath
    : tab.filePath
  const originalSideLabel = originalPath === tab.filePath
    ? originalLabel
    : `${originalLabel} · ${originalPath}`
  const modifiedSideLabel = originalPath === tab.filePath
    ? modifiedLabel
    : `${modifiedLabel} · ${tab.filePath}`
  const formatAppError = (error: AppError) => {
    const title = t(`errors:${error.code}`, { defaultValue: t("errors:fallback") })
    const suggestion = t(`errors:suggestion.${error.code}`, { defaultValue: "" })
    return [title, suggestion].filter(Boolean).join(" ")
  }
  const modeChanged = result?.status === "text" &&
    result.originalMode !== result.modifiedMode &&
    result.originalMode !== null &&
    result.modifiedMode !== null

  return (
    <section
      className={`file-editor-pane change-diff-editor-pane${active ? " active" : ""}`}
      data-testid="change-diff-editor-pane"
      hidden={!active}
    >
      <header className="file-editor-toolbar change-diff-editor-toolbar">
        <div className="file-editor-title">
          <strong title={tab.filePath}>{tab.filePath}</strong>
          <span>{t(`inspector:changes.section.${tab.area}`)}</span>
        </div>
        <span className="change-diff-readonly">{t("inspector:editor.change-diff.readonly")}</span>
      </header>
      <div className="change-diff-side-labels">
        <span>{originalSideLabel}</span>
        <span>{modifiedSideLabel}</span>
      </div>
      {modeChanged ? (
        <p className="change-diff-mode-change">
          {t("inspector:editor.change-diff.mode", {
            original: result.originalMode,
            modified: result.modifiedMode
          })}
        </p>
      ) : null}
      <div className="file-editor-body change-diff-editor-body">
        {document.status === "loading" ? <p className="file-editor-state">{t("inspector:editor.change-diff.loading")}</p> : null}
        {document.status === "error" ? (
          <p className="file-editor-state error">{formatAppError(document.error)}</p>
        ) : null}
        {result?.status === "text" ? (
          <ChangeDiffCodeView
            original={result.original}
            modified={result.modified}
            originalLanguage={detectEditorLanguage(originalPath)}
            modifiedLanguage={detectEditorLanguage(tab.filePath)}
            originalLabel={originalSideLabel}
            modifiedLabel={modifiedSideLabel}
            onError={handleMergeViewError}
          />
        ) : null}
        {result && result.status !== "text" ? (
          <div className={`change-diff-structured-state change-diff-structured-state-${result.status}`} role="status">
            <strong>{t(`inspector:editor.change-diff.state.${result.status}`)}</strong>
            {result.status === "too-large" ? (
              <span>{t("inspector:editor.change-diff.too-large-detail", { count: result.limitBytes })}</span>
            ) : null}
            {result.status === "error" ? <span>{formatAppError(result.error)}</span> : null}
          </div>
        ) : null}
      </div>
      {result?.status === "text" ? (
        <footer className="file-editor-status">
          <span>{detectEditorLanguage(tab.filePath)}</span>
          <span>{t("inspector:editor.encoding.utf8")}</span>
          <span>{t("inspector:editor.change-diff.bytes", {
            original: result.originalByteLength,
            modified: result.modifiedByteLength
          })}</span>
        </footer>
      ) : null}
    </section>
  )
}
