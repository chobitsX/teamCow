/* eslint-disable i18next/no-literal-string -- This hook returns typed document/save protocol statuses; UI owns translated labels. */

import {
  CONVERSATION_FILE_AUTOMATIC_OPEN_MAX_BYTES,
  CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES,
  type AppError,
  type ConversationFileMetadata,
  type ConversationFileReadResult
} from "@shared/index"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  ConversationFileDocumentSnapshot,
  ConversationFileEditorTab,
  ConversationFileTextDocumentSnapshot
} from "./conversation-file-editor-model"

type DocumentState =
  | { status: "idle" | "loading" }
  | { status: "text"; file: ConversationFileMetadata; content: string; draft: string; savedContent: string }
  | { status: "binary" | "too-large"; file: ConversationFileMetadata; limitBytes?: number }
  | { status: "not-found" | "is-directory" }
  | { status: "error"; error: AppError }

type SaveState =
  | { status: "idle" | "saving" | "saved" }
  | { status: "conflict"; currentContent: string | null }
  | { status: "error"; error: AppError }
  | { status: "readonly"; error: AppError }

type SaveOutcome = "saved" | "conflict" | "readonly" | "error" | "skipped"

const toAppError = (error: unknown, fallbackMessage: string): AppError => ({
  code: "INTERNAL_ERROR",
  message: error instanceof Error ? error.message : String(error || fallbackMessage),
  suggestion: null
})

const readonlyAppError = (): AppError => ({
  code: "FILE_RUN_ACTIVE_READONLY",
  message: "Conversation has an active provider run",
  suggestion: null
})

const documentStateFromSnapshot = (snapshot: ConversationFileTextDocumentSnapshot): DocumentState => ({
  status: "text",
  file: snapshot.file,
  content: snapshot.content,
  draft: snapshot.draft,
  savedContent: snapshot.savedContent
})

const snapshotFromDocumentState = (document: DocumentState): ConversationFileDocumentSnapshot | undefined =>
  document.status === "text"
    ? {
        status: "text",
        file: document.file,
        content: document.content,
        draft: document.draft,
        savedContent: document.savedContent
      }
    : undefined

const documentStateFromReadResult = (result: ConversationFileReadResult): DocumentState => {
  switch (result.status) {
    case "text":
      return {
        status: "text",
        file: result.file,
        content: result.content,
        draft: result.content,
        savedContent: result.content
      }
    case "binary":
      return { status: "binary", file: result.file }
    case "too-large":
      return { status: "too-large", file: result.file, limitBytes: result.limitBytes }
    case "not-found":
    case "is-directory":
      return { status: result.status }
    case "error":
      return { status: "error", error: result.error }
  }
}

export const useConversationFileDocument = (
  tab: ConversationFileEditorTab | null,
  readOnly: boolean,
  onDocumentSnapshotChange?: (tabId: string, snapshot: ConversationFileDocumentSnapshot | undefined) => void
) => {
  const [document, setDocument] = useState<DocumentState>(() =>
    tab?.documentSnapshot ? documentStateFromSnapshot(tab.documentSnapshot) : { status: "idle" }
  )
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" })
  const requestRef = useRef(0)
  const tabId = tab?.id ?? null
  const conversationId = tab?.conversationId ?? null
  const filePath = tab?.filePath ?? null
  const fileIdentity = tabId && conversationId && filePath ? `${tabId}\0${conversationId}\0${filePath}` : null
  const fileIdentityRef = useRef<string | null>(fileIdentity)
  fileIdentityRef.current = fileIdentity

  useEffect(() => {
    if (!conversationId || !filePath) {
      setDocument({ status: "idle" })
      setSaveState({ status: "idle" })
      return
    }

    if (tab?.documentSnapshot) {
      requestRef.current += 1
      setDocument(documentStateFromSnapshot(tab.documentSnapshot))
      setSaveState({ status: "idle" })
      return
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setDocument({ status: "loading" })
    setSaveState({ status: "idle" })

    void window.teamcow.readConversationFile({
      conversationId,
      filePath
    }).then((result) => {
      if (requestRef.current !== requestId) return
      setDocument(documentStateFromReadResult(result))
    }).catch((error: unknown) => {
      if (requestRef.current !== requestId) return
      setDocument({ status: "error", error: toAppError(error, "File could not be read") })
    })
  }, [conversationId, filePath, tab?.documentSnapshot, tabId])

  const dirty = document.status === "text" && document.draft !== document.savedContent
  const largeFileMode = document.status === "text" &&
    document.file.byteLength > CONVERSATION_FILE_AUTOMATIC_OPEN_MAX_BYTES
  const canOpenLargeFile = document.status === "too-large" &&
    document.file.byteLength <= CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES &&
    (document.limitBytes ?? 0) < CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES

  const setDraft = useCallback((draft: string) => {
    setDocument((current) => current.status === "text" ? { ...current, draft } : current)
    setSaveState({ status: "idle" })
  }, [])

  const save = useCallback(async (force = false): Promise<SaveOutcome> => {
    if (!conversationId || !filePath || document.status !== "text") return "skipped"
    const draftAtSave = document.draft
    const savedContentAtSave = document.savedContent
    const fileAtSave = document.file
    const fileIdentityAtSave = fileIdentity
    if (draftAtSave === savedContentAtSave && !force) return "skipped"
    if (readOnly) {
      setSaveState({ status: "readonly", error: readonlyAppError() })
      return "readonly"
    }

    setSaveState({ status: "saving" })
    try {
      const result = await window.teamcow.writeConversationFile({
        conversationId,
        filePath,
        content: draftAtSave,
        precondition: force ? undefined : { ifMatch: fileAtSave.revision }
      })

      if (fileIdentityRef.current !== fileIdentityAtSave) return "skipped"

      if (result.status === "saved") {
        setDocument((current) => {
          if (current.status !== "text") {
            return current
          }
          return {
            ...current,
            file: result.file,
            content: draftAtSave,
            savedContent: draftAtSave
          }
        })
        setSaveState({ status: "saved" })
        return "saved"
      }
      if (result.status === "conflict") {
        setSaveState({ status: "conflict", currentContent: result.currentContent })
        return "conflict"
      }
      if (result.status === "readonly") {
        setSaveState({ status: "readonly", error: result.error })
        return "readonly"
      }
      if (result.status === "error") {
        setSaveState({ status: "error", error: result.error })
        return "error"
      }
      setSaveState({
        status: "error",
        error: {
          code: "FILE_WRITE_FAILED",
          message: result.status,
          suggestion: null
        }
      })
      return "error"
    } catch (error) {
      if (fileIdentityRef.current !== fileIdentityAtSave) return "skipped"
      setSaveState({ status: "error", error: toAppError(error, "File could not be saved") })
      return "error"
    }
  }, [conversationId, document, fileIdentity, filePath, readOnly])

  const reloadFromDisk = useCallback(() => {
    if (!conversationId || !filePath) return
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setDocument({ status: "loading" })
    void window.teamcow.readConversationFile({
      conversationId,
      filePath,
      ...(largeFileMode ? { maxBytes: CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES } : {})
    }).then((result) => {
      if (requestRef.current !== requestId) return
      setDocument(documentStateFromReadResult(result))
      setSaveState({ status: "idle" })
    }).catch((error: unknown) => {
      if (requestRef.current !== requestId) return
      setDocument({ status: "error", error: toAppError(error, "File could not be read") })
      setSaveState({ status: "idle" })
    })
  }, [conversationId, filePath, largeFileMode])

  const openLargeFile = useCallback(() => {
    if (!conversationId || !filePath || !canOpenLargeFile) return
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setDocument({ status: "loading" })
    setSaveState({ status: "idle" })

    void window.teamcow.readConversationFile({
      conversationId,
      filePath,
      maxBytes: CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES
    }).then((result) => {
      if (requestRef.current !== requestId) return
      setDocument(documentStateFromReadResult(result))
    }).catch((error: unknown) => {
      if (requestRef.current !== requestId) return
      setDocument({ status: "error", error: toAppError(error, "File could not be read") })
    })
  }, [canOpenLargeFile, conversationId, filePath])

  useEffect(() => {
    if (!tabId) return
    onDocumentSnapshotChange?.(tabId, snapshotFromDocumentState(document))
  }, [document, onDocumentSnapshotChange, tabId])

  return useMemo(() => ({
    document,
    saveState,
    dirty,
    setDraft,
    save,
    largeFileMode,
    canOpenLargeFile,
    openLargeFile,
    reloadFromDisk,
    keepEditing: () => setSaveState({ status: "idle" }),
    overwrite: () => void save(true)
  }), [canOpenLargeFile, dirty, document, largeFileMode, openLargeFile, reloadFromDisk, save, saveState, setDraft])
}
