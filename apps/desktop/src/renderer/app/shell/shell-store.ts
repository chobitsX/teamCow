import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { PROVIDER_MODEL_CATALOG } from "@shared/index"
import type {
  AppContextSnapshot,
  AppError,
  AddCustomModelInput,
  CancelConversationRunInput,
  CancelConversationRunResult,
  ConversationTimeline,
  ConversationSummary,
  CreateConversationInput,
  DeleteQueuedConversationMessageInput,
  DeleteConversationResult,
  GetConversationTimelinePageResult,
  GetConversationTimelineResult,
  ImportedProjectSummary,
  ProjectMovePosition,
  ProjectWorktreeSummary,
  ProviderAccessMode,
  ProviderKind,
  ProviderModelOption,
  RemoveCustomModelInput,
  RenameConversationResult,
  RetryConversationRunWithPermissionsInput,
  RunEventPushPayload,
  SendConversationMessageInput,
  WorktreeSummary
} from "@shared/index"
import {
  emptyConversationTimelinePageInfo,
  mergeTimelinePages,
  type ConversationTimelinePageInfo
} from "./conversation-timeline-query"

const fallbackContext: AppContextSnapshot = {
  mode: "development",
  platform: "darwin",
  version: "unknown",
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

const createEmptyTimeline = (conversationId: string): ConversationTimeline => ({
  conversationId,
  messages: [],
  queuedMessages: [],
  runs: [],
  events: [],
  artifacts: []
})

// Push events (window.teamcow.onRunEvent) drive the realtime incremental updates;
// this polling interval acts as a lower-frequency reconcile fallback against the DB snapshot.
const activeRunRefreshIntervalMs = 5000

const requestLatestConversationTimeline = async (
  conversationId: string
): Promise<GetConversationTimelinePageResult | GetConversationTimelineResult | null> => {
  if (window.teamcow?.getConversationTimelinePage) {
    return window.teamcow.getConversationTimelinePage({ conversationId, limit: 20 })
  }
  if (window.teamcow?.getConversationTimeline) {
    return window.teamcow.getConversationTimeline(conversationId)
  }
  return null
}

const isPaginatedTimelineResult = (
  result: GetConversationTimelinePageResult | GetConversationTimelineResult
): result is Extract<GetConversationTimelinePageResult, { status: "ok" }> =>
  result.status === "ok" && "pageInfo" in result

type ShellNotice = {
  tone: "info" | "success" | "error"
  messageKey: string
  messageParams?: Record<string, string>
}

type ProviderModelLoadState = {
  status: "idle" | "loading" | "ready" | "error"
  models: ProviderModelOption[]
  source: "host" | "fallback"
  errorMessage?: string
}

type ProviderModelsByKind = Partial<Record<ProviderKind, ProviderModelLoadState>>
type ConversationTimelineStatus = "idle" | "loading" | "ready" | "error"

const getFallbackProviderModels = (providerKind: ProviderKind): ProviderModelOption[] =>
  (PROVIDER_MODEL_CATALOG[providerKind] ?? []).map((model) => ({
    ...model,
    // eslint-disable-next-line i18next/no-literal-string -- provider model source is a typed machine value.
    source: "fallback" as const
  }))

export const useShellContext = () => {
  const { t } = useTranslation("notifications")
  const { t: tErrors } = useTranslation("errors")
  const [context, setContext] = useState<AppContextSnapshot>(fallbackContext)
  const [conversationTimeline, setConversationTimeline] = useState<ConversationTimeline | null>(null)
  const [conversationTimelineStatus, setConversationTimelineStatus] = useState<ConversationTimelineStatus>("idle")
  const [conversationTimelinePageInfo, setConversationTimelinePageInfo] = useState<ConversationTimelinePageInfo>(
    emptyConversationTimelinePageInfo
  )
  const [isLoadingOlderTimeline, setIsLoadingOlderTimeline] = useState(false)
  const [notice, setNotice] = useState<ShellNotice | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [providerModelsByKind, setProviderModelsByKind] = useState<ProviderModelsByKind>({})
  const selectedConversationIdRef = useRef<string | null>(fallbackContext.selectedConversationId)
  const selectConversationRequestIdRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!window.teamcow?.getAppContext) {
        return
      }

      try {
        const snapshot = await window.teamcow.getAppContext()

        if (!cancelled) {
          setContext(snapshot)
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error)
          setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const currentProject = useMemo(
    () => context.projects.find((project) => project.id === context.selectedProjectId) ?? null,
    [context.projects, context.selectedProjectId]
  )

  const currentConversation = useMemo<ConversationSummary | null>(() => {
    if (!currentProject || !context.selectedConversationId) {
      return null
    }

    return currentProject.conversations.find((conversation) => conversation.id === context.selectedConversationId) ?? null
  }, [context.selectedConversationId, currentProject])

  useEffect(() => {
    selectedConversationIdRef.current = context.selectedConversationId
  }, [context.selectedConversationId])

  useEffect(() => {
    let cancelled = false

    const loadTimeline = async () => {
      if (!currentConversation) {
        setConversationTimeline(null)
        setConversationTimelineStatus("idle")
        setConversationTimelinePageInfo(emptyConversationTimelinePageInfo())
        return
      }

      if (!window.teamcow?.getConversationTimelinePage && !window.teamcow?.getConversationTimeline) {
        setConversationTimeline(createEmptyTimeline(currentConversation.id))
        setConversationTimelineStatus("ready")
        setConversationTimelinePageInfo(emptyConversationTimelinePageInfo())
        return
      }

      try {
        // eslint-disable-next-line i18next/no-literal-string -- timeline status is a typed machine value.
        setConversationTimelineStatus("loading")
        const result = await requestLatestConversationTimeline(currentConversation.id)
        if (cancelled) {
          return
        }

        if (!result) {
          setConversationTimeline(createEmptyTimeline(currentConversation.id))
          setConversationTimelineStatus("ready")
          return
        }

        if (result.status === "error") {
          setNotice(renderErrorNotice(result.error))
          setConversationTimeline(createEmptyTimeline(currentConversation.id))
          setConversationTimelineStatus("error")
          return
        }

        if (result.timeline.conversationId !== currentConversation.id) {
          setConversationTimeline(createEmptyTimeline(currentConversation.id))
          setConversationTimelineStatus("error")
          return
        }

        setConversationTimeline(result.timeline)
        setConversationTimelinePageInfo(isPaginatedTimelineResult(result)
          ? result.pageInfo
          : emptyConversationTimelinePageInfo())
        setConversationTimelineStatus("ready")
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error)
          setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
          setConversationTimeline(createEmptyTimeline(currentConversation.id))
          setConversationTimelineStatus("error")
        }
      }
    }

    void loadTimeline()

    return () => {
      cancelled = true
    }
  }, [currentConversation?.id])

  const loadOlderConversationTimeline = useCallback(async () => {
    const conversationId = selectedConversationIdRef.current
    const cursor = conversationTimelinePageInfo.nextCursor
    if (
      !conversationId ||
      !cursor ||
      !conversationTimelinePageInfo.hasMore ||
      isLoadingOlderTimeline ||
      !window.teamcow?.getConversationTimelinePage
    ) {
      return
    }

    setIsLoadingOlderTimeline(true)
    try {
      const result = await window.teamcow.getConversationTimelinePage({
        conversationId,
        beforeRunId: cursor,
        limit: 20
      })
      if (selectedConversationIdRef.current !== conversationId) return
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return
      }
      setConversationTimeline((current) => current && current.conversationId === conversationId
        ? mergeTimelinePages(result.timeline, current)
        : result.timeline)
      setConversationTimelinePageInfo(result.pageInfo)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
    } finally {
      setIsLoadingOlderTimeline(false)
    }
  }, [conversationTimelinePageInfo, isLoadingOlderTimeline, t, tErrors])

  const commitContext = (snapshot: AppContextSnapshot) => {
    setContext(snapshot)
  }

  const renderErrorNotice = (error: AppError): ShellNotice => {
    const messageParams: Record<string, string> = {}

    if (error.message && error.message !== error.code) {
      messageParams.message = error.message
    }

    if (error.suggestion) {
      messageParams.suggestion = error.suggestion
    }

    return {
      tone: "error",
      messageKey: error.code,
      messageParams: Object.keys(messageParams).length > 0 ? messageParams : undefined
    }
  }

  const reconcileConversationSnapshot = useCallback(async (conversationId: string) => {
    const [contextResult, timelineResult] = await Promise.all([
      window.teamcow?.getAppContext
        ? window.teamcow.getAppContext()
            .then((snapshot) => ({ status: "ok" as const, snapshot }))
            .catch((error: unknown) => ({ status: "error" as const, error }))
        : Promise.resolve(null),
      requestLatestConversationTimeline(conversationId)
        .then((result) => result ? { status: "ok" as const, result } : null)
        .catch((error: unknown) => ({ status: "error" as const, error }))
    ])

    if (selectedConversationIdRef.current !== conversationId) {
      return
    }

    if (contextResult?.status === "ok" && contextResult.snapshot.selectedConversationId === conversationId) {
      commitContext(contextResult.snapshot)
    } else if (contextResult?.status === "error") {
      const message = contextResult.error instanceof Error ? contextResult.error.message : String(contextResult.error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
    }

    if (timelineResult?.status === "ok") {
      if (timelineResult.result.status === "error") {
        setNotice(renderErrorNotice(timelineResult.result.error))
        setConversationTimeline(createEmptyTimeline(conversationId))
        setConversationTimelineStatus("error")
        return
      }

      if (timelineResult.result.timeline.conversationId === conversationId) {
        const timeline = timelineResult.result.timeline
        setConversationTimeline((current) => current?.conversationId === conversationId
          ? mergeTimelinePages(current, timeline)
          : timeline)
        setConversationTimelineStatus("ready")
      } else {
        setConversationTimeline(createEmptyTimeline(conversationId))
        setConversationTimelineStatus("error")
      }
    } else if (timelineResult?.status === "error") {
      const message = timelineResult.error instanceof Error ? timelineResult.error.message : String(timelineResult.error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      setConversationTimelineStatus("error")
    }
  }, [t, tErrors])

  useEffect(() => {
    if (!currentConversation || currentConversation.runStatus !== "running") {
      return
    }

    const conversationId = currentConversation.id
    let cancelled = false
    let isRefreshing = false

    const refreshActiveRun = async () => {
      if (isRefreshing) {
        return
      }

      isRefreshing = true
      try {
        const [contextResult, timelineResult] = await Promise.all([
          window.teamcow?.getAppContext
            ? window.teamcow.getAppContext()
                .then((snapshot) => ({ status: "ok" as const, snapshot }))
                .catch((error: unknown) => ({ status: "error" as const, error }))
            : Promise.resolve(null),
          requestLatestConversationTimeline(conversationId)
            .then((result) => result ? { status: "ok" as const, result } : null)
            .catch((error: unknown) => ({ status: "error" as const, error }))
        ])

        if (cancelled || selectedConversationIdRef.current !== conversationId) {
          return
        }

        if (contextResult?.status === "ok" && contextResult.snapshot.selectedConversationId === conversationId) {
          commitContext(contextResult.snapshot)
        } else if (contextResult?.status === "error") {
          const message = contextResult.error instanceof Error ? contextResult.error.message : String(contextResult.error)
          setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
        }

        if (timelineResult?.status === "ok") {
          if (timelineResult.result.status === "error") {
            setNotice(renderErrorNotice(timelineResult.result.error))
            setConversationTimeline(createEmptyTimeline(conversationId))
            setConversationTimelineStatus("error")
            return
          }

          if (timelineResult.result.timeline.conversationId === conversationId) {
            const timeline = timelineResult.result.timeline
            setConversationTimeline((current) => current?.conversationId === conversationId
              ? mergeTimelinePages(current, timeline)
              : timeline)
            setConversationTimelineStatus("ready")
          } else {
            setConversationTimeline(createEmptyTimeline(conversationId))
            setConversationTimelineStatus("error")
          }
        } else if (timelineResult?.status === "error") {
          const message = timelineResult.error instanceof Error ? timelineResult.error.message : String(timelineResult.error)
          setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
          setConversationTimelineStatus("error")
        }
      } finally {
        isRefreshing = false
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshActiveRun()
    }, activeRunRefreshIntervalMs)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [currentConversation?.id, currentConversation?.runStatus])

  useEffect(() => {
    if (!currentConversation) {
      return
    }

    if (!window.teamcow?.onRunEvent) {
      return
    }

    const conversationId = currentConversation.id
    let cancelled = false

    const reconcileTimeline = async () => {
      if (!window.teamcow?.getConversationTimelinePage && !window.teamcow?.getConversationTimeline) {
        return
      }

      try {
        const result = await requestLatestConversationTimeline(conversationId)
        if (cancelled || selectedConversationIdRef.current !== conversationId) {
          return
        }

        if (result?.status === "ok" && result.timeline.conversationId === conversationId) {
          setConversationTimeline((current) => current?.conversationId === conversationId
            ? mergeTimelinePages(current, result.timeline)
            : result.timeline)
          setConversationTimelineStatus("ready")
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error)
          setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
        }
      }
    }

    const handleRunEvent = (pushEvent: RunEventPushPayload) => {
      if (cancelled || pushEvent.conversationId !== conversationId) {
        return
      }

      setConversationTimeline((prev) => {
        if (!prev || prev.conversationId !== conversationId) {
          return prev
        }

        if (prev.events.some((event) => event.id === pushEvent.id)) {
          return prev
        }

        return { ...prev, events: [...prev.events, pushEvent] }
      })

      const nextStatus = pushEvent.status
      if (nextStatus) {
        setContext((previous) => ({
          ...previous,
          projects: previous.projects.map((project) => ({
            ...project,
            conversations: project.conversations.map((conversation) =>
              conversation.id === conversationId
                ? { ...conversation, runStatus: nextStatus, updatedAt: pushEvent.createdAt }
                : conversation
            )
          })),
          shell: previous.selectedConversationId === conversationId
            ? { ...previous.shell, runStatus: nextStatus }
            : previous.shell,
          chips: previous.selectedConversationId === conversationId
            ? previous.chips.map((chip) => chip.kind === "run-status" ? { ...chip, value: nextStatus } : chip)
            : previous.chips
        }))
      }

      // A queued run can start without a renderer request, so reconcile both its
      // running edge and all terminal edges against the persisted timeline.
      if (
        pushEvent.status === "running" ||
        pushEvent.status === "completed" ||
        pushEvent.status === "failed" ||
        pushEvent.status === "interrupted" ||
        pushEvent.status === "unavailable"
      ) {
        void reconcileTimeline()
      }
    }

    const unsubscribe = window.teamcow.onRunEvent(handleRunEvent)

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [currentConversation?.id])

  const importProject = useCallback(async () => {
    if (!window.teamcow?.importProject) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    setIsBusy(true)
    try {
      const result = await window.teamcow.importProject()
      if (result.status === "cancelled") {
        setNotice({ tone: "info", messageKey: "import.cancelled" })
        return result
      }

      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      commitContext(result.context)
      setNotice({
        tone: "success",
        messageKey: result.status === "existing"
          ? "import.existing"
          : result.status === "restored"
            ? "import.restored"
            : "import.success",
        messageParams: { name: result.project.name }
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    } finally {
      setIsBusy(false)
    }
  }, [t, tErrors])

  const selectProject = useCallback(async (projectId: string) => {
    if (!window.teamcow?.selectProject) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return
    }

    setIsBusy(true)
    try {
      const result = await window.teamcow.selectProject(projectId)
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return
      }

      commitContext(result.context)
      setNotice({
        tone: "info",
        messageKey: "project.switched",
        messageParams: { name: result.context.shell.projectName ?? "" }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
    } finally {
      setIsBusy(false)
    }
  }, [t, tErrors])

  const moveProject = useCallback(async (projectId: string, position: ProjectMovePosition) => {
    if (!window.teamcow?.moveProject) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    const projectName = context.projects.find((project) => project.id === projectId)?.name ?? ""
    setIsBusy(true)
    try {
      const result = await window.teamcow.moveProject({ projectId, position })
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      commitContext(result.context)
      setNotice({
        tone: "info",
        messageKey: position === "top" ? "project.moved-top" : "project.moved-bottom",
        messageParams: { name: projectName }
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    } finally {
      setIsBusy(false)
    }
  }, [context.projects, t, tErrors])

  const removeProject = useCallback(async (projectId: string) => {
    if (!window.teamcow?.removeProject) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    const projectName = context.projects.find((project) => project.id === projectId)?.name ?? ""
    setIsBusy(true)
    try {
      const result = await window.teamcow.removeProject(projectId)
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      commitContext(result.context)
      setNotice({
        tone: "info",
        messageKey: "project.removed",
        messageParams: { name: projectName }
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    } finally {
      setIsBusy(false)
    }
  }, [context.projects, t, tErrors])

  const revealProjectInFinder = useCallback(async (projectId: string) => {
    if (!window.teamcow?.revealProjectInFinder) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    const projectName = context.projects.find((project) => project.id === projectId)?.name ?? ""
    try {
      const result = await window.teamcow.revealProjectInFinder(projectId)
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      setNotice({
        tone: "info",
        messageKey: "project.revealed",
        messageParams: { name: projectName }
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    }
  }, [context.projects, t, tErrors])

  const selectConversation = useCallback(async (conversationId: string) => {
    if (!window.teamcow?.selectConversation) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return
    }

    const requestId = selectConversationRequestIdRef.current + 1
    selectConversationRequestIdRef.current = requestId
    // Optimistically update selectedConversationId so the sidebar highlights immediately
    // without waiting for the IPC round-trip.
    setContext((prev) => ({ ...prev, selectedConversationId: conversationId }))
    try {
      const result = await window.teamcow.selectConversation(conversationId)
      if (requestId !== selectConversationRequestIdRef.current) {
        return
      }

      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return
      }

      commitContext(result.context)
      setNotice({
        tone: "info",
        messageKey: "conversation.activated",
        messageParams: { name: result.context.shell.conversationTitle ?? "" }
      })
    } catch (error) {
      if (requestId !== selectConversationRequestIdRef.current) {
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
    }
  }, [t, tErrors])

  const listWorktreesByProject = useCallback(async (projectId: string): Promise<WorktreeSummary[]> => {
    if (!window.teamcow?.listWorktreesByProject) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return []
    }

    try {
      return await window.teamcow.listWorktreesByProject(projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return []
    }
  }, [t, tErrors])

  const listProjectWorktrees = useCallback(async (projectId: string): Promise<ProjectWorktreeSummary[]> => {
    if (!window.teamcow?.listProjectWorktrees) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return []
    }

    try {
      return await window.teamcow.listProjectWorktrees(projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return []
    }
  }, [t, tErrors])

  const loadProviderModels = useCallback(async (providerKind: ProviderKind): Promise<ProviderModelOption[]> => {
    const fallbackModels = getFallbackProviderModels(providerKind)

    if (!window.teamcow?.listProviderModels) {
      setProviderModelsByKind((current) => ({
        ...current,
        [providerKind]: {
          status: "ready",
          models: fallbackModels,
          source: "fallback"
        }
      }))
      return fallbackModels
    }

    setProviderModelsByKind((current) => ({
      ...current,
      [providerKind]: {
        status: "loading",
        models: current[providerKind]?.models ?? fallbackModels,
        source: current[providerKind]?.source ?? "fallback"
      }
    }))

    try {
      const models = await window.teamcow.listProviderModels(providerKind)
      const nextModels = models.length > 0 ? models : fallbackModels
      // Discovery can degrade to the static catalog and still return a non-empty
      // list, so infer the source from the returned models rather than length:
      // if every model is fallback-sourced, the host did not contribute a live list.
      const hasHostSourcedModel = nextModels.some((model) => model.source && model.source !== "fallback")
      setProviderModelsByKind((current) => ({
        ...current,
        [providerKind]: {
          status: "ready",
          models: nextModels,
          source: hasHostSourcedModel ? "host" : "fallback"
        }
      }))
      return nextModels
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProviderModelsByKind((current) => ({
        ...current,
        [providerKind]: {
          status: "error",
          models: fallbackModels,
          source: "fallback",
          errorMessage: message
        }
      }))
      return fallbackModels
    }
  }, [])

  const addCustomModel = useCallback(async (input: AddCustomModelInput): Promise<ProviderModelOption[] | null> => {
    if (!window.teamcow?.addCustomModel) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }
    try {
      const result = await window.teamcow.addCustomModel(input)
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return null
      }
      setProviderModelsByKind((current) => ({
        ...current,
        // eslint-disable-next-line i18next/no-literal-string -- machine value
        [input.providerKind]: { status: "ready", models: result.models, source: "host" }
      }))
      return result.models
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    }
  }, [t, tErrors])

  const removeCustomModel = useCallback(async (input: RemoveCustomModelInput): Promise<ProviderModelOption[] | null> => {
    if (!window.teamcow?.removeCustomModel) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }
    try {
      const result = await window.teamcow.removeCustomModel(input)
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return null
      }
      setProviderModelsByKind((current) => ({
        ...current,
        // eslint-disable-next-line i18next/no-literal-string -- machine value
        [input.providerKind]: { status: "ready", models: result.models, source: "host" }
      }))
      return result.models
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    }
  }, [t, tErrors])

  const deleteWorktree = useCallback(async (projectId: string, worktreeId: string) => {
    if (!window.teamcow?.deleteWorktree) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    setIsBusy(true)
    try {
      const result = await window.teamcow.deleteWorktree({ projectId, worktreeId })
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      if (window.teamcow.getAppContext) {
        try {
          const snapshot = await window.teamcow.getAppContext()
          commitContext(snapshot)
        } catch {
          // The delete already succeeded; keep the result so callers can refresh local worktree state.
        }
      }
      setNotice({ tone: "success", messageKey: "worktree.deleted" })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    } finally {
      setIsBusy(false)
    }
  }, [t, tErrors])

  const renameConversation = useCallback(async (
    conversationId: string,
    title: string
  ): Promise<RenameConversationResult | null> => {
    if (!window.teamcow?.renameConversation) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    try {
      const result = await window.teamcow.renameConversation({ conversationId, title })
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      commitContext(result.context)
      setNotice({
        tone: "success",
        messageKey: "conversation.renamed",
        messageParams: { name: result.conversation.title }
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    }
  }, [t, tErrors])

  const deleteConversation = useCallback(async (
    conversationId: string
  ): Promise<DeleteConversationResult | null> => {
    if (!window.teamcow?.deleteConversation) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    setIsBusy(true)
    try {
      const result = await window.teamcow.deleteConversation({ conversationId })
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      commitContext(result.context)
      setNotice({ tone: "success", messageKey: "conversation.deleted" })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    } finally {
      setIsBusy(false)
    }
  }, [t, tErrors])

  const createConversation = useCallback(async (input: CreateConversationInput) => {
    if (!window.teamcow?.createConversation) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    setIsBusy(true)
    try {
      const result = await window.teamcow.createConversation(input)
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      commitContext(result.context)

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    } finally {
      setIsBusy(false)
    }
  }, [t, tErrors])

  const setConversationModel = useCallback(async (conversationId: string, model: string) => {
    if (!window.teamcow?.setConversationModel) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    try {
      const result = await window.teamcow.setConversationModel({ conversationId, model })
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      commitContext(result.context)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    }
  }, [t, tErrors])

  const setConversationAccessMode = useCallback(async (
    conversationId: string,
    accessMode: ProviderAccessMode
  ) => {
    if (!window.teamcow?.setConversationAccessMode) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    try {
      const result = await window.teamcow.setConversationAccessMode({ conversationId, accessMode })
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      commitContext(result.context)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    }
  }, [t, tErrors])

  const sendConversationMessage = useCallback(async (input: SendConversationMessageInput) => {
    if (!window.teamcow?.sendConversationMessage) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    setIsBusy(true)
    try {
      const result = await window.teamcow.sendConversationMessage(input)
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      if (
        selectedConversationIdRef.current !== input.conversationId ||
        result.context.selectedConversationId !== input.conversationId ||
        result.timeline.conversationId !== input.conversationId
      ) {
        return result
      }

      commitContext(result.context)
      setConversationTimeline(result.timeline)
      setConversationTimelineStatus("ready")
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    } finally {
      setIsBusy(false)
    }
  }, [t, tErrors])

  const deleteQueuedConversationMessage = useCallback(async (input: DeleteQueuedConversationMessageInput) => {
    if (!window.teamcow?.deleteQueuedConversationMessage) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    try {
      const result = await window.teamcow.deleteQueuedConversationMessage(input)
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      if (
        selectedConversationIdRef.current === input.conversationId &&
        result.timeline.conversationId === input.conversationId
      ) {
        setConversationTimeline(result.timeline)
        setConversationTimelineStatus("ready")
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    }
  }, [t, tErrors])

  const retryConversationRunWithPermissions = useCallback(async (input: RetryConversationRunWithPermissionsInput) => {
    if (!window.teamcow?.retryConversationRunWithPermissions) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    setIsBusy(true)
    try {
      const result = await window.teamcow.retryConversationRunWithPermissions(input)
      if (result.status === "error") {
        setNotice(renderErrorNotice(result.error))
        return result
      }

      if (
        selectedConversationIdRef.current !== input.conversationId ||
        result.context.selectedConversationId !== input.conversationId ||
        result.timeline.conversationId !== input.conversationId
      ) {
        return result
      }

      commitContext(result.context)
      setConversationTimeline(result.timeline)
      setConversationTimelineStatus("ready")
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    } finally {
      setIsBusy(false)
    }
  }, [t, tErrors])

  const cancelConversationRun = useCallback(async (
    input: CancelConversationRunInput
  ): Promise<CancelConversationRunResult | null> => {
    if (!window.teamcow?.cancelConversationRun) {
      setNotice({ tone: "error", messageKey: "api.unavailable" })
      return null
    }

    try {
      const result = await window.teamcow.cancelConversationRun(input)
      await reconcileConversationSnapshot(input.conversationId)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", messageKey: "fallback", messageParams: { message } })
      return null
    }
  }, [reconcileConversationSnapshot])

  const resolveNoticeMessage = (n: ShellNotice): string => {
    if (n.messageKey === "fallback" && n.messageParams?.message) {
      return n.messageParams.message
    }
    const ns = ["PATH_NOT_FOUND", "NOT_A_DIRECTORY", "PATH_NOT_READABLE", "DIALOG_CANCELLED",
      "GIT_NOT_INSTALLED", "GIT_INIT_FAILED", "DUPLICATE_PROJECT", "PROJECT_NOT_FOUND",
      "PROJECT_SELECTION_FAILED", "CONVERSATION_NOT_FOUND", "CONVERSATION_SELECTION_FAILED",
      "CONVERSATION_RENAME_FAILED", "CONVERSATION_DELETE_FAILED", "CONVERSATION_RUN_IN_PROGRESS",
      "PROVIDER_NOT_READY", "WORKTREE_NOT_FOUND", "WORKTREE_BRANCH_EXISTS", "WORKTREE_PATH_EXISTS", "WORKTREE_CREATE_FAILED",
      "WORKTREE_IN_USE", "WORKTREE_DELETE_FAILED",
      "EXTERNAL_OPEN_APP_UNAVAILABLE", "EXTERNAL_OPEN_FAILED",
      "INTERNAL_ERROR"].includes(n.messageKey) ? "errors" : "notifications"

    if (ns === "errors") {
      const msg = tErrors(n.messageKey, n.messageParams)
      const detail = n.messageParams?.message && n.messageParams.message !== n.messageKey
        ? n.messageParams.message
        : ""
      const suggestion = n.messageParams?.suggestion ?? tErrors(`suggestion.${n.messageKey}`, { defaultValue: "" })
      return [msg, detail, suggestion].filter(Boolean).join(" ")
    }

    return t(n.messageKey, n.messageParams)
  }

  const projectSummaries: ImportedProjectSummary[] = context.projects

  const interpretProjectAction = useCallback(async (projectId: string) => {
    await selectProject(projectId)
  }, [selectProject])

  return {
    context,
    conversationTimeline,
    conversationTimelineStatus,
    conversationTimelineHasMore: conversationTimelinePageInfo.hasMore,
    isLoadingOlderTimeline,
    loadOlderConversationTimeline,
    currentProject,
    currentConversation,
    notice: notice ? { tone: notice.tone, message: resolveNoticeMessage(notice) } : null,
    isBusy,
    importProject,
    projectSummaries,
    listProjectWorktrees,
    listWorktreesByProject,
    loadProviderModels,
    providerModelsByKind,
    addCustomModel,
    removeCustomModel,
    moveProject,
    removeProject,
    revealProjectInFinder,
    deleteWorktree,
    createConversation,
    renameConversation,
    deleteConversation,
    setConversationModel,
    setConversationAccessMode,
    selectProject: interpretProjectAction,
    selectConversation,
    sendConversationMessage,
    deleteQueuedConversationMessage,
    retryConversationRunWithPermissions,
    cancelConversationRun
  }
}
