import type {
  GeneratedImageSummary,
  ConversationMessageSummary,
  ConversationRunStatus,
  ConversationTimeline,
  RunEventSummary
} from "@shared/index"
import { generatedImageSummarySchema } from "@shared/index"

const readEventImages = (event: RunEventSummary): GeneratedImageSummary[] => {
  const candidates = Array.isArray(event.payload.images) ? event.payload.images : [event.payload.image]
  return candidates.flatMap((value) => {
    const image = generatedImageSummarySchema.safeParse(value)
    return image.success ? [image.data] : []
  })
}

type BaseChatRenderItem = {
  id: string
  runId: string | null
  createdAt: string
  displayClass?: ChatDisplayClass
}

export type ChatDisplayClass =
  | "assistant_text"
  | "run_lifecycle"
  | "tool_activity"
  | "provider_notice"
  | "debug_raw"

const CHAT_DISPLAY_CLASSES = {
  assistantText: "assistant_text",
  runLifecycle: "run_lifecycle",
  toolActivity: "tool_activity",
  providerNotice: "provider_notice",
  debugRaw: "debug_raw"
} satisfies Record<string, ChatDisplayClass>

const PROVIDER_MESSAGE_PHASES = {
  commentary: "commentary",
  final: "final",
  finalAnswer: "final_answer"
} as const
const PROVIDER_CONTEXT_KINDS = {
  commentary: "commentary",
  reasoning: "reasoning"
} as const
const PROVIDER_GROUP_TOKENS = {
  separator: ":",
  legacy: "legacy",
  reasoning: "reasoning"
} as const

export type UserMessageRenderItem = BaseChatRenderItem & {
  kind: "user-message"
  content: string
  attachments?: NonNullable<ConversationMessageSummary["attachments"]>
  model: string | null
}

export type ProviderMessageRenderItem = BaseChatRenderItem & {
  kind: "provider-message"
  content: string
  eventIds: string[]
  phase: "commentary" | "final"
  authoritative: boolean
  isRunning: boolean
}

export type ProviderImageRenderItem = BaseChatRenderItem & {
  kind: "provider-image"
  image: GeneratedImageSummary
}

export type ProviderContextRenderItem = BaseChatRenderItem & {
  kind: "provider-context"
  contextKind: "commentary" | "reasoning"
  content: string
  entries: string[]
  eventIds: string[]
  isRunning: boolean
}

export type ProviderActivityPhase = "starting" | "running" | "completed" | "failed" | "interrupted" | "unavailable"

export type ProviderActivityStepRenderItem = {
  id: string
  phase: ProviderActivityPhase
  activityKind: string
  label: string
  detail: string | null
}

export type ProviderActivityDetailRenderItem = {
  id: string
  eventType: string
  summary: string
  rawDetails: string
  status: ConversationRunStatus | null
}

export type ProviderActivityRenderItem = BaseChatRenderItem & {
  kind: "provider-activity"
  phase: ProviderActivityPhase
  activityKind: string
  label: string
  detail: string | null
  eventCount: number
  steps: ProviderActivityStepRenderItem[]
  details: ProviderActivityDetailRenderItem[]
}

export type SystemSummaryRenderItem = BaseChatRenderItem & {
  kind: "system-summary"
  eventType: string
  status: ConversationRunStatus | null
  summary: string
  rawDetails: string | null
}

export type RunOutcomeRenderItem = BaseChatRenderItem & {
  kind: "run-outcome"
  status: ConversationRunStatus
  diagnosticsCount: number
  hasProviderOutput: boolean
}

export type PermissionDenialRenderItem = {
  toolName: string
  toolUseId: string | null
  target: string
  input: Record<string, unknown> | null
}

export type PermissionRequestRenderItem = BaseChatRenderItem & {
  kind: "permission-request"
  eventId: string
  allowedTools: string[]
  denials: PermissionDenialRenderItem[]
}

export type ToolFailureRenderItem = BaseChatRenderItem & {
  kind: "tool-failure"
  eventId: string
  isFatal: boolean
  isRunning: boolean
  toolName: string | null
  target: string
  message: string
  rawDetails: string
}

export type ToolEventRenderItem = BaseChatRenderItem & {
  kind: "tool-event"
  eventType: string
  summary: string
  rawDetails: string | null
  toolName: string | null
  toolStatus: string | null
  toolInput: Record<string, unknown> | null
  toolOutput: string | null
  isToolError: boolean
}

export type RawFallbackRenderItem = BaseChatRenderItem & {
  kind: "raw-fallback"
  eventType: string
  summary: string
  rawDetails: string
}

export type ChatRenderItem =
  | UserMessageRenderItem
  | ProviderMessageRenderItem
  | ProviderImageRenderItem
  | ProviderContextRenderItem
  | ProviderActivityRenderItem
  | SystemSummaryRenderItem
  | RunOutcomeRenderItem
  | PermissionRequestRenderItem
  | ToolFailureRenderItem
  | ToolEventRenderItem
  | RawFallbackRenderItem

const DEFAULT_ACTIVITY_KIND = "working"
const PROVIDER_ACTIVITY_KIND = "provider"
const REQUEST_ACTIVITY_KIND = "request"
const PROVIDER_ACTIVITY_PHASE_STARTING: ProviderActivityRenderItem["phase"] = "starting"
const PROVIDER_ACTIVITY_PHASE_RUNNING: ProviderActivityRenderItem["phase"] = "running"
const PROVIDER_ACTIVITY_PHASE_COMPLETED: ProviderActivityRenderItem["phase"] = "completed"
const PROVIDER_ACTIVITY_PHASE_FAILED: ProviderActivityRenderItem["phase"] = "failed"
const PROVIDER_ACTIVITY_PHASE_INTERRUPTED: ProviderActivityRenderItem["phase"] = "interrupted"
const PROVIDER_ACTIVITY_PHASE_UNAVAILABLE: ProviderActivityRenderItem["phase"] = "unavailable"

const RUN_STATUS_VALUES = new Set<ConversationRunStatus>([
  "idle",
  "running",
  "completed",
  "failed",
  "interrupted",
  "unavailable"
])

const readString = (value: unknown) => typeof value === "string" ? value : null

const readRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null

const readArray = (value: unknown) => Array.isArray(value) ? value : []

const readStatus = (value: unknown): ConversationRunStatus | null => {
  if (typeof value !== "string") {
    return null
  }

  return RUN_STATUS_VALUES.has(value as ConversationRunStatus) ? value as ConversationRunStatus : null
}

const stringifyPayload = (payload: Record<string, unknown>) => JSON.stringify(payload, null, 2)

const MAX_ACTIVITY_DETAIL_LENGTH = 140
const MAX_PROVIDER_ACTIVITY_STEPS = 4

const normalizeActivityKind = (value: string | null) => {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")

  return normalized && normalized.length > 0 ? normalized : DEFAULT_ACTIVITY_KIND
}

const toActivityLabel = (value: string | null, fallback: string) => {
  const label = value?.trim()
  if (label && label.length > 0) {
    return label
  }

  return fallback
}

const truncateActivityDetail = (value: string | null) => {
  const detail = value?.trim()
  if (!detail) {
    return null
  }

  return detail.length > MAX_ACTIVITY_DETAIL_LENGTH
    ? `${detail.slice(0, MAX_ACTIVITY_DETAIL_LENGTH - 3)}...`
    : detail
}

const summarizePayload = (payload: Record<string, unknown>, fallback: string) =>
  readString(payload.message) ??
  readString(payload.reason) ??
  readString(payload.status) ??
  readString(payload.rawType) ??
  readString(payload.parseError) ??
  fallback

const getEventStatus = (event: RunEventSummary): ConversationRunStatus | null => {
  if (event.type === "run.started") {
    return "running"
  }

  if (event.type === "run.completed") {
    return "completed"
  }

  if (event.type === "run.error") {
    return "failed"
  }

  if (event.type === "run.status" || event.type === "system.status") {
    return readStatus(event.payload.status)
  }

  return null
}

const eventNeedsRawFallback = (event: RunEventSummary) =>
  event.type !== "run.started" &&
  event.type !== "run.progress" &&
  event.type !== "run.message.delta" &&
  event.type !== "run.message.completed" &&
  event.type !== "run.reasoning.delta" &&
  event.type !== "run.reasoning.completed" &&
  event.type !== "run.status" &&
  event.type !== "run.completed" &&
  event.type !== "run.error" &&
  event.type !== "system.status"

const isProviderNoticeEvent = (event: RunEventSummary) =>
  event.type === "provider.notice" ||
  event.payload.displayClass === "provider_notice" ||
  event.payload.rawType === "system" ||
  event.payload.rawType === "provider.notice"

const isToolActivityEvent = (event: RunEventSummary) => {
  if (event.type !== "run.progress") {
    return false
  }

  if (isProviderNoticeEvent(event)) {
    return false
  }

  const payload = event.payload
  const raw = readRecord(payload.raw)
  const rawItem = readRecord(raw?.item)
  if (readString(rawItem?.type) === "agent_message") {
    return false
  }

  return Boolean(
    readRecord(payload.toolUse) ||
    readRecord(payload.toolResult) ||
    readRecord(payload.input) ||
    readString(rawItem?.type) ||
    readString(rawItem?.query) ||
    readString(rawItem?.name) ||
    readString(rawItem?.command) ||
    readString(payload.contentType) === "tool_use" ||
    readString(payload.contentType) === "tool_result" ||
    readString(payload.tool) ||
    readString(payload.name) ||
    readString(payload.command) ||
    readString(payload.output) ||
    readString(payload.file) ||
    readString(payload.filePath) ||
    readString(payload.path)
  )
}

const isRunSummaryEvent = (event: RunEventSummary) =>
  event.type === "run.started" ||
  event.type === "run.status" ||
  event.type === "run.completed" ||
  event.type === "run.error" ||
  event.type === "system.status"

const isLegacyClaudeResultMessageEvent = (event: RunEventSummary) => {
  if (
    event.type !== "run.completed" ||
    event.payload.provider !== "claude" ||
    event.payload.rawType !== "result"
  ) {
    return false
  }

  const raw = readRecord(event.payload.raw)
  const text = readString(event.payload.message) ?? readString(raw?.result)
  return Boolean(text?.trim())
}

const hasUserFacingCompletedSummary = (event: RunEventSummary) =>
  event.type === "run.completed" &&
  !isLegacyClaudeResultMessageEvent(event) &&
  Boolean(readString(event.payload.message))

const isDiagnosticEvent = (event: RunEventSummary) =>
  !isLegacyClaudeResultMessageEvent(event) &&
  !hasUserFacingCompletedSummary(event) &&
  (
    isToolActivityEvent(event) ||
    isRunSummaryEvent(event) ||
    isProviderNoticeEvent(event) ||
    eventNeedsRawFallback(event) ||
    Boolean(event.payload.parseError)
  )

const isRoutineLifecycleDiagnosticEvent = (event: RunEventSummary) => {
  if (event.type === "run.started" || event.type === "run.completed") {
    return !event.payload.message && !event.payload.reason && !event.payload.parseError
  }

  if (event.type === "run.status" || event.type === "system.status") {
    const status = readStatus(event.payload.status)
    return (status === "running" || status === "completed") &&
      !event.payload.message &&
      !event.payload.reason &&
      !event.payload.parseError
  }

  return false
}

const createProviderActivityDetail = (event: RunEventSummary): ProviderActivityDetailRenderItem => ({
  id: event.id,
  eventType: event.type,
  summary: summarizePayload(event.payload, event.type),
  rawDetails: stringifyPayload(event.payload),
  status: getEventStatus(event)
})

const enum TimelineEntrySource {
  Message,
  Event
}

type TimelineEntry =
  | {
      createdAt: string
      sequence: number
      source: TimelineEntrySource.Message
      message: ConversationMessageSummary
    }
  | {
      createdAt: string
      sequence: number
      source: TimelineEntrySource.Event
      event: RunEventSummary
    }

const sortByOccurrence = <T extends { createdAt: string }>(items: T[]) =>
  [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt))

const isProviderMessageEvent = (event: RunEventSummary) =>
  event.type === "run.message.delta" ||
  event.type === "run.message.completed" ||
  isPersistedCodexAgentMessageEvent(event) ||
  isLegacyClaudeResultMessageEvent(event)

const getProviderMessagePhase = (event: RunEventSummary): "commentary" | "final" =>
  event.payload.phase === PROVIDER_MESSAGE_PHASES.final ||
  event.payload.phase === PROVIDER_MESSAGE_PHASES.finalAnswer ||
  event.payload.authoritative === true
    ? PROVIDER_MESSAGE_PHASES.final
    : PROVIDER_MESSAGE_PHASES.commentary

type ClaudeStreamRenderState = {
  blockIndex: number | null
  messageId: string | null
}

const getClaudeStreamRenderScope = (event: RunEventSummary, raw: Record<string, unknown>) => [
  event.runId,
  readString(raw.session_id) ?? readString(raw.sessionId) ?? "session",
  readString(raw.parent_tool_use_id) ?? readString(raw.parentToolUseId) ?? "root"
].join(PROVIDER_GROUP_TOKENS.separator)

const buildClaudeStreamGroupIds = (events: RunEventSummary[]) => {
  const groupIds = new Map<string, string>()
  const stateByScope = new Map<string, ClaudeStreamRenderState>()
  const ordered = [...events].sort((left, right) => left.runId === right.runId
    ? left.sequence - right.sequence
    : left.createdAt.localeCompare(right.createdAt))

  for (const event of ordered) {
    if (event.provider !== "claude" && event.payload.provider !== "claude") {
      continue
    }

    const raw = readRecord(event.payload.raw)
    if (!raw) {
      continue
    }

    const scope = getClaudeStreamRenderScope(event, raw)
    const current = stateByScope.get(scope) ?? { blockIndex: null, messageId: null }
    const rawType = readString(raw.type) ?? readString(event.payload.rawType)

    if (rawType === "stream_event") {
      const streamEvent = readRecord(raw.event)
      const streamEventType = readString(streamEvent?.type)
      const streamBlockIndex = typeof streamEvent?.index === "number" ? streamEvent.index : null

      if (streamEventType === "message_start") {
        current.messageId = readString(readRecord(streamEvent?.message)?.id)
        current.blockIndex = null
      } else if (streamEventType === "content_block_start") {
        current.blockIndex = streamBlockIndex
      } else if (streamEventType === "content_block_delta" && current.messageId && streamBlockIndex !== null) {
        groupIds.set(event.id, `${current.messageId}:${streamBlockIndex}`)
      } else if (streamEventType === "content_block_stop") {
        current.blockIndex = null
      } else if (streamEventType === "message_stop") {
        current.blockIndex = null
        current.messageId = null
      }

      stateByScope.set(scope, current)
      continue
    }

    if (rawType === "assistant" && current.blockIndex !== null) {
      const messageId = readString(readRecord(raw.message)?.id)
      if (messageId) {
        groupIds.set(event.id, `${messageId}:${current.blockIndex}`)
      }
    }
  }

  return groupIds
}

const getProviderMessageGroupId = (event: RunEventSummary, streamGroupIds: Map<string, string>) =>
  streamGroupIds.get(event.id) ??
  readString(event.payload.messageId) ??
  [event.runId, PROVIDER_GROUP_TOKENS.legacy].join(PROVIDER_GROUP_TOKENS.separator)

const getTextGroupContent = (events: RunEventSummary[]) => {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence)
  const authoritative = [...ordered].reverse().find((event) => event.payload.authoritative === true)
  if (authoritative) {
    return getProviderMessageText(authoritative) ?? ""
  }

  const deltas = ordered.filter((event) => event.type === "run.message.delta")
  if (deltas.length > 0) {
    return deltas.map((event) => getProviderMessageText(event) ?? "").join("")
  }

  return getProviderMessageText(ordered[ordered.length - 1]) ?? ""
}

const normalizeReasoningEntry = (text: string) => {
  const trimmed = text.trim()
  const emphasized = trimmed.match(/^\*\*(.+)\*\*$/s)
  return (emphasized?.[1] ?? trimmed).trim()
}

const splitReasoningEntries = (text: string) =>
  text
    .split(/\n+/)
    .map(normalizeReasoningEntry)
    .filter(Boolean)

const buildProviderOutputItems = (
  timeline: ConversationTimeline,
  runStatusById: Map<string, ConversationRunStatus>
) => {
  const claudeStreamGroupIds = buildClaudeStreamGroupIds(timeline.events)
  const messageGroups = new Map<string, RunEventSummary[]>()
  const reasoningGroups = new Map<string, RunEventSummary[]>()
  const reasoningDeltaMessageIds = new Set(
    timeline.events
      .filter((event) => event.type === "run.reasoning.delta")
      .map((event) => [
        event.runId,
        claudeStreamGroupIds.get(event.id) ?? readString(event.payload.messageId) ?? PROVIDER_GROUP_TOKENS.reasoning
      ].join(PROVIDER_GROUP_TOKENS.separator))
  )

  for (const event of timeline.events) {
    if (isProviderMessageEvent(event)) {
      const key = `${event.runId}:${getProviderMessageGroupId(event, claudeStreamGroupIds)}`
      const group = messageGroups.get(key) ?? []
      group.push(event)
      messageGroups.set(key, group)
      continue
    }

    if (event.type === "run.reasoning.delta" || event.type === "run.reasoning.completed") {
      const messageKey = [
        event.runId,
        claudeStreamGroupIds.get(event.id) ?? readString(event.payload.messageId) ?? PROVIDER_GROUP_TOKENS.reasoning
      ].join(PROVIDER_GROUP_TOKENS.separator)
      if (event.type === "run.reasoning.completed" && reasoningDeltaMessageIds.has(messageKey)) {
        continue
      }
      const key = event.type === "run.reasoning.delta"
        ? [messageKey, String(event.payload.summaryIndex ?? 0)].join(PROVIDER_GROUP_TOKENS.separator)
        : messageKey
      const group = reasoningGroups.get(key) ?? []
      group.push(event)
      reasoningGroups.set(key, group)
    }
  }

  const finalByRun = new Map<string, ProviderMessageRenderItem>()
  const commentaryByRun = new Map<string, { events: RunEventSummary[]; contents: string[] }>()
  for (const group of messageGroups.values()) {
    const ordered = [...group].sort((left, right) => left.sequence - right.sequence)
    const content = getTextGroupContent(ordered)
    if (!content.trim()) {
      continue
    }
    const anchor = ordered.find((event) => event.payload.authoritative === true) ?? ordered[0]
    const phase = ordered.some((event) => getProviderMessagePhase(event) === PROVIDER_MESSAGE_PHASES.final)
      ? PROVIDER_MESSAGE_PHASES.final
      : PROVIDER_MESSAGE_PHASES.commentary
    const authoritative = ordered.some((event) => event.payload.authoritative === true)

    if (phase === "final") {
      const candidate: ProviderMessageRenderItem = {
        kind: "provider-message",
        id: `provider-${anchor.runId}-${getProviderMessageGroupId(anchor, claudeStreamGroupIds)}`,
        runId: anchor.runId,
        createdAt: anchor.createdAt,
        displayClass: CHAT_DISPLAY_CLASSES.assistantText,
        content,
        eventIds: ordered.map((event) => event.id),
        phase,
        authoritative,
        isRunning: runStatusById.get(anchor.runId) === "running"
      }
      const current = finalByRun.get(anchor.runId)
      if (!current || anchor.sequence >= (timeline.events.find((event) => event.id === current.eventIds[0])?.sequence ?? -1)) {
        finalByRun.set(anchor.runId, candidate)
      }
      continue
    }

    const current = commentaryByRun.get(anchor.runId) ?? { events: [], contents: [] }
    current.events.push(...ordered)
    current.contents.push(content)
    commentaryByRun.set(anchor.runId, current)
  }

  const itemByAnchorEventId = new Map<string, ProviderMessageRenderItem | ProviderContextRenderItem>()
  for (const [runId, finalItem] of finalByRun) {
    const anchorId = finalItem.eventIds.find((id) => timeline.events.find((event) => event.id === id)?.payload.authoritative === true)
      ?? finalItem.eventIds[0]
    itemByAnchorEventId.set(anchorId, finalItem)

    const commentary = commentaryByRun.get(runId)
    if (commentary) {
      const content = commentary.contents.filter((entry) => entry.trim() && entry.trim() !== finalItem.content.trim()).join("\n\n")
      if (content.trim()) {
        const anchor = [...commentary.events].sort((left, right) => left.sequence - right.sequence)[0]
        itemByAnchorEventId.set(anchor.id, {
          kind: "provider-context",
          contextKind: PROVIDER_CONTEXT_KINDS.commentary,
          id: `provider-commentary-${runId}`,
          runId,
          createdAt: anchor.createdAt,
          displayClass: CHAT_DISPLAY_CLASSES.providerNotice,
          content,
          entries: commentary.contents,
          eventIds: commentary.events.map((event) => event.id),
          isRunning: runStatusById.get(runId) === "running"
        })
      }
    }
  }

  for (const [runId, commentary] of commentaryByRun) {
    if (finalByRun.has(runId)) {
      continue
    }
    const anchor = [...commentary.events].sort((left, right) => left.sequence - right.sequence)[0]
    itemByAnchorEventId.set(anchor.id, {
      kind: "provider-message",
      id: `provider-streaming-${runId}`,
      runId,
      createdAt: anchor.createdAt,
      displayClass: CHAT_DISPLAY_CLASSES.assistantText,
      content: commentary.contents.join("\n\n"),
      eventIds: commentary.events.map((event) => event.id),
      phase: PROVIDER_MESSAGE_PHASES.commentary,
      authoritative: false,
      isRunning: runStatusById.get(runId) === "running"
    })
  }

  const reasoningByRun = new Map<string, { events: RunEventSummary[]; contents: string[] }>()
  for (const group of reasoningGroups.values()) {
    const ordered = [...group].sort((left, right) => left.sequence - right.sequence)
    const deltas = ordered.filter((event) => event.type === "run.reasoning.delta")
    const content = deltas.length > 0
      ? deltas.map((event) => readString(event.payload.text) ?? "").join("")
      : readString(ordered[ordered.length - 1]?.payload.text) ?? ""
    const entries = splitReasoningEntries(content)
    if (entries.length === 0) {
      continue
    }
    const current = reasoningByRun.get(ordered[0].runId) ?? { events: [], contents: [] }
    current.events.push(...ordered)
    current.contents.push(...entries)
    reasoningByRun.set(ordered[0].runId, current)
  }

  for (const [runId, reasoning] of reasoningByRun) {
    const anchor = [...reasoning.events].sort((left, right) => left.sequence - right.sequence)[0]
    itemByAnchorEventId.set(anchor.id, {
      kind: "provider-context",
      contextKind: PROVIDER_CONTEXT_KINDS.reasoning,
      id: `provider-reasoning-${runId}`,
      runId,
      createdAt: anchor.createdAt,
      displayClass: CHAT_DISPLAY_CLASSES.providerNotice,
      content: reasoning.contents.join("\n\n"),
      entries: reasoning.contents,
      eventIds: reasoning.events.map((event) => event.id),
      isRunning: runStatusById.get(runId) === "running"
    })
  }

  return {
    itemByAnchorEventId,
    providerOutputRunIds: new Set([
      ...finalByRun.keys(),
      ...commentaryByRun.keys()
    ])
  }
}

const createUserMessageItem = (message: ConversationMessageSummary): UserMessageRenderItem => ({
  kind: "user-message",
  id: message.id,
  runId: message.runId,
  createdAt: message.createdAt,
  content: message.content,
  attachments: message.attachments ?? [],
  model: message.model
})

const createProviderMessageCacheItem = (message: ConversationMessageSummary): ProviderMessageRenderItem => ({
  kind: "provider-message",
  id: message.id,
  runId: message.runId,
  createdAt: message.createdAt,
  displayClass: CHAT_DISPLAY_CLASSES.assistantText,
  content: message.content,
  eventIds: [],
  phase: PROVIDER_MESSAGE_PHASES.final,
  authoritative: true,
  isRunning: false
})

const createRunOutcomeItem = (
  runId: string,
  createdAt: string,
  status: ConversationRunStatus,
  diagnosticsCount: number,
  hasProviderOutput: boolean
): RunOutcomeRenderItem => ({
  kind: "run-outcome",
  id: `outcome-${runId}`,
  runId,
  createdAt,
  displayClass: CHAT_DISPLAY_CLASSES.runLifecycle,
  status,
  diagnosticsCount,
  hasProviderOutput
})

const getRawItem = (event: RunEventSummary) => {
  const raw = readRecord(event.payload.raw)
  return readRecord(raw?.item)
}

const getProviderActivityDetail = (event: RunEventSummary) => {
  const rawItem = getRawItem(event)
  const toolUse = readRecord(event.payload.toolUse)
  const input =
    readRecord(toolUse?.input) ??
    readRecord(rawItem?.input) ??
    readRecord(event.payload.input)

  return truncateActivityDetail(
    readString(rawItem?.query) ??
    readString(input?.query) ??
    readString(input?.search_query) ??
    readString(event.payload.query) ??
    readString(event.payload.message) ??
    readString(rawItem?.command) ??
    readString(input?.command) ??
    readString(event.payload.command) ??
    readString(input?.url) ??
    readString(input?.path) ??
    readString(event.payload.path)
  )
}

const getProviderActivityPhaseForStatus = (status: ConversationRunStatus | null): ProviderActivityPhase | null => {
  if (status === "failed") {
    return PROVIDER_ACTIVITY_PHASE_FAILED
  }

  if (status === "interrupted") {
    return PROVIDER_ACTIVITY_PHASE_INTERRUPTED
  }

  if (status === "unavailable") {
    return PROVIDER_ACTIVITY_PHASE_UNAVAILABLE
  }

  if (status === "completed") {
    return PROVIDER_ACTIVITY_PHASE_COMPLETED
  }

  if (status === "running") {
    return PROVIDER_ACTIVITY_PHASE_RUNNING
  }

  return null
}

const getProviderActivityDescriptor = (event: RunEventSummary) => {
  if (
    (event.type === "system.status" || event.type === "run.status") &&
    event.payload.reason === "provider-runtime-starting"
  ) {
    return {
      phase: PROVIDER_ACTIVITY_PHASE_STARTING,
      activityKind: PROVIDER_ACTIVITY_KIND,
      label: PROVIDER_ACTIVITY_KIND,
      detail: null
    }
  }

  if (event.type === "run.error") {
    return {
      phase: PROVIDER_ACTIVITY_PHASE_FAILED,
      activityKind: PROVIDER_ACTIVITY_KIND,
      label: PROVIDER_ACTIVITY_KIND,
      detail: getProviderActivityDetail(event) ?? summarizePayload(event.payload, event.type)
    }
  }

  if (event.type === "run.status" || event.type === "system.status") {
    const phase = getProviderActivityPhaseForStatus(readStatus(event.payload.status))
    if (phase) {
      return {
        phase,
        activityKind: PROVIDER_ACTIVITY_KIND,
        label: PROVIDER_ACTIVITY_KIND,
        detail: getProviderActivityDetail(event) ?? summarizePayload(event.payload, event.type)
      }
    }
  }

  if (event.type === "run.started") {
    return {
      phase: PROVIDER_ACTIVITY_PHASE_STARTING,
      activityKind: PROVIDER_ACTIVITY_KIND,
      label: PROVIDER_ACTIVITY_KIND,
      detail: null
    }
  }

  if (event.type === "run.completed") {
    return {
      phase: PROVIDER_ACTIVITY_PHASE_COMPLETED,
      activityKind: PROVIDER_ACTIVITY_KIND,
      label: PROVIDER_ACTIVITY_KIND,
      detail: getProviderActivityDetail(event)
    }
  }

  if (event.type !== "run.progress") {
    return null
  }

  const rawType = readString(event.payload.rawType)
  if (rawType === "turn.started") {
    return {
      phase: PROVIDER_ACTIVITY_PHASE_RUNNING,
      activityKind: REQUEST_ACTIVITY_KIND,
      label: REQUEST_ACTIVITY_KIND,
      detail: null
    }
  }

  const rawItem = getRawItem(event)
  const rawItemType = readString(rawItem?.type)
  if (rawItemType === "agent_message") {
    return null
  }

  const toolUse = readRecord(event.payload.toolUse)
  const rawActivityKind =
    rawItemType ??
    readString(event.payload.contentType) ??
    readString(event.payload.tool) ??
    readString(event.payload.name) ??
    rawType
  const activityKind = normalizeActivityKind(rawActivityKind)
  const label = toActivityLabel(
    readString(toolUse?.name) ??
    readString(rawItem?.name) ??
    readString(event.payload.name) ??
    readString(event.payload.tool),
    activityKind
  )

  return {
    phase: rawType === "item.completed" || readString(event.payload.contentType) === "tool_result"
      ? PROVIDER_ACTIVITY_PHASE_COMPLETED
      : PROVIDER_ACTIVITY_PHASE_RUNNING,
    activityKind,
    label,
    detail: getProviderActivityDetail(event)
  }
}

const createProviderActivityItem = (
  runId: string,
  createdAt: string,
  events: RunEventSummary[],
  detailEvents: RunEventSummary[] = [],
  status: ConversationRunStatus | null = null
): ProviderActivityRenderItem | null => {
  const activityEvents = events
    .map((event) => ({ event, descriptor: getProviderActivityDescriptor(event) }))
    .filter((entry): entry is { event: RunEventSummary; descriptor: NonNullable<ReturnType<typeof getProviderActivityDescriptor>> } =>
      entry.descriptor !== null
    )

  const latest = activityEvents.at(-1)
  const details = detailEvents.map(createProviderActivityDetail)
  if (!latest && details.length === 0) {
    return null
  }

  const steps = activityEvents.reduce<ProviderActivityStepRenderItem[]>((activitySteps, { event, descriptor }) => {
    const step = {
      id: event.id,
      phase: descriptor.phase,
      activityKind: descriptor.activityKind,
      label: descriptor.label,
      detail: descriptor.detail
    }
    const previous = activitySteps.at(-1)
    if (
      previous &&
      previous.phase === step.phase &&
      previous.activityKind === step.activityKind &&
      previous.label === step.label &&
      previous.detail === step.detail
    ) {
      activitySteps[activitySteps.length - 1] = step
      return activitySteps
    }

    activitySteps.push(step)
    return activitySteps
  }, []).slice(-MAX_PROVIDER_ACTIVITY_STEPS)

  const statusPhase = getProviderActivityPhaseForStatus(status)
  const latestStep =
    statusPhase && statusPhase !== PROVIDER_ACTIVITY_PHASE_RUNNING
      ? {
          phase: statusPhase,
          activityKind: PROVIDER_ACTIVITY_KIND,
          label: PROVIDER_ACTIVITY_KIND,
          detail: details.at(-1)?.summary ?? latest?.descriptor.detail ?? null
        }
      : latest?.descriptor ?? {
          phase: PROVIDER_ACTIVITY_PHASE_RUNNING,
          activityKind: PROVIDER_ACTIVITY_KIND,
          label: PROVIDER_ACTIVITY_KIND,
          detail: details.at(-1)?.summary ?? null
        }

  return {
    kind: "provider-activity",
    id: `activity-${runId}-${latest?.event.id ?? details.at(-1)?.id ?? "details"}`,
    runId,
    createdAt,
    displayClass: CHAT_DISPLAY_CLASSES.toolActivity,
    phase: latestStep.phase,
    activityKind: latestStep.activityKind,
    label: latestStep.label,
    detail: latestStep.detail,
    eventCount: details.length > 0 ? details.length : activityEvents.length,
    steps,
    details
  }
}

const getPermissionTarget = (input: Record<string, unknown> | null) => {
  if (!input) {
    return ""
  }

  return readString(input.url) ??
    readString(input.search_query) ??
    readString(input.query) ??
    readString(input.prompt) ??
    readString(input.command) ??
    readString(input.path) ??
    readString(input.file_path) ??
    JSON.stringify(input)
}

const isPermissionRequiredStatusEvent = (event: RunEventSummary) =>
  event.type === "run.status" &&
  event.payload.status === "unavailable" &&
  event.payload.reason === "provider-permission-required"

const getAllowedTools = (event: RunEventSummary) =>
  readArray(event.payload.allowedTools)
    .map((tool) => readString(tool)?.trim() ?? "")
    .filter((tool) => tool.length > 0)

const isPermissionRetryStartEvent = (event: RunEventSummary) =>
  (event.type === "system.status" || event.type === "run.status") &&
  event.payload.reason === "provider-permission-retry-starting" &&
  getAllowedTools(event).length > 0

const permissionToolUseKey = (runId: string, toolUseId: string) => `${runId}:${toolUseId}`

const buildClaudeToolUseLookup = (events: RunEventSummary[]) => {
  const lookup = new Map<string, PermissionDenialRenderItem>()

  for (const event of events) {
    if (
      event.payload.provider !== "claude" ||
      event.type !== "run.progress" ||
      readString(event.payload.contentType) !== "tool_use"
    ) {
      continue
    }

    const toolUse = readRecord(event.payload.toolUse)
    const toolUseId = readString(toolUse?.id)
    const toolName = readString(toolUse?.name)
    if (!toolUseId || !toolName) {
      continue
    }

    const input = readRecord(toolUse?.input)
    lookup.set(permissionToolUseKey(event.runId, toolUseId), {
      toolName,
      toolUseId,
      target: getPermissionTarget(input),
      input
    })
  }

  return lookup
}

const readToolResultContent = (value: unknown): string | null => {
  const text = readString(value)
  if (text !== null) {
    return text
  }

  const blocks = readArray(value)
    .map((entry) => {
      const block = readRecord(entry)
      return readString(block?.text) ?? readString(block?.content) ?? ""
    })
    .join("")

  return blocks.length > 0 ? blocks : null
}

const getDeniedClaudeToolName = (content: string | null) => {
  const match = content?.trim().match(/^Claude requested permissions to use ([^,]+), but you haven't granted it yet\.?$/)
  return match?.[1] ?? null
}

const createToolFailureItem = (
  event: RunEventSummary,
  toolUseLookup: Map<string, PermissionDenialRenderItem>,
  runStatus: ConversationRunStatus | undefined
): ToolFailureRenderItem | null => {
  if (
    event.payload.provider !== "claude" ||
    event.type !== "run.progress" ||
    readString(event.payload.contentType) !== "tool_result"
  ) {
    return null
  }

  const toolResult = readRecord(event.payload.toolResult)
  if (toolResult?.isError !== true) {
    return null
  }

  const message = readToolResultContent(toolResult.content)?.trim()
  if (!message || getDeniedClaudeToolName(message)) {
    return null
  }

  const toolUseId = readString(toolResult.toolUseId) ?? readString(toolResult.tool_use_id)
  const toolUse = toolUseId ? toolUseLookup.get(permissionToolUseKey(event.runId, toolUseId)) : null
  const isFatal = runStatus === "failed" || runStatus === "interrupted" || runStatus === "unavailable"

  return {
    kind: "tool-failure",
    id: `tool-failure-${event.id}`,
    runId: event.runId,
    createdAt: event.createdAt,
    displayClass: CHAT_DISPLAY_CLASSES.providerNotice,
    eventId: event.id,
    isFatal,
    isRunning: runStatus === "running" || runStatus === "idle" || runStatus === undefined,
    toolName: toolUse?.toolName ?? null,
    target: toolUse?.target ?? "",
    message,
    rawDetails: stringifyPayload(event.payload)
  }
}

const getClaudeResultPermissionDenials = (event: RunEventSummary): PermissionDenialRenderItem[] => {
  if (event.payload.provider !== "claude" || event.payload.rawType !== "result") {
    return []
  }

  const raw = readRecord(event.payload.raw)
  return readArray(raw?.permission_denials)
    .map((entry) => {
      const record = readRecord(entry)
      const toolName = readString(record?.tool_name) ?? readString(record?.toolName)
      if (!record || !toolName) {
        return null
      }

      const input = readRecord(record.tool_input) ?? readRecord(record.toolInput)
      return {
        toolName,
        toolUseId: readString(record.tool_use_id) ?? readString(record.toolUseId),
        target: getPermissionTarget(input),
        input
      }
    })
    .filter((denial): denial is PermissionDenialRenderItem => denial !== null)
}

const getClaudeToolResultPermissionDenials = (
  event: RunEventSummary,
  toolUseLookup: Map<string, PermissionDenialRenderItem>
): PermissionDenialRenderItem[] => {
  if (
    event.payload.provider !== "claude" ||
    event.type !== "run.progress" ||
    readString(event.payload.contentType) !== "tool_result"
  ) {
    return []
  }

  const toolResult = readRecord(event.payload.toolResult)
  const toolUseId = readString(toolResult?.toolUseId) ?? readString(toolResult?.tool_use_id)
  const toolName = getDeniedClaudeToolName(readToolResultContent(toolResult?.content))
  if (!toolUseId || !toolName) {
    return []
  }

  const toolUse = toolUseLookup.get(permissionToolUseKey(event.runId, toolUseId))
  return [
    toolUse ?? {
      toolName,
      toolUseId,
      target: "",
      input: null
    }
  ]
}

const getClaudeToolUsePermissionDenials = (
  event: RunEventSummary,
  permissionRequiredRunIds: Set<string>
): PermissionDenialRenderItem[] => {
  if (
    !permissionRequiredRunIds.has(event.runId) ||
    event.payload.provider !== "claude" ||
    event.type !== "run.progress" ||
    readString(event.payload.contentType) !== "tool_use"
  ) {
    return []
  }

  const toolUse = readRecord(event.payload.toolUse)
  const toolName = readString(toolUse?.name)
  const toolUseId = readString(toolUse?.id)
  if (!toolName) {
    return []
  }

  const input = readRecord(toolUse?.input)
  return [
    {
      toolName,
      toolUseId,
      target: getPermissionTarget(input),
      input
    }
  ]
}

const getClaudePermissionDenials = (
  event: RunEventSummary,
  toolUseLookup: Map<string, PermissionDenialRenderItem>,
  permissionRequiredRunIds: Set<string>
): PermissionDenialRenderItem[] => [
  ...getClaudeResultPermissionDenials(event),
  ...getClaudeToolResultPermissionDenials(event, toolUseLookup),
  ...getClaudeToolUsePermissionDenials(event, permissionRequiredRunIds)
]

const createPermissionRequestItem = (
  event: RunEventSummary,
  toolUseLookup: Map<string, PermissionDenialRenderItem>,
  permissionRequiredRunIds: Set<string>
): PermissionRequestRenderItem | null => {
  const denials = getClaudePermissionDenials(event, toolUseLookup, permissionRequiredRunIds)
  if (denials.length === 0) {
    return null
  }

  const permissionKey = denials
    .map((denial) => denial.toolUseId ?? denial.toolName)
    .join("-")

  return {
    kind: "permission-request",
    id: `permission-${event.runId}-${permissionKey || event.id}`,
    runId: event.runId,
    createdAt: event.createdAt,
    displayClass: CHAT_DISPLAY_CLASSES.providerNotice,
    eventId: event.id,
    allowedTools: [...new Set(denials.map((denial) => denial.toolName))],
    denials
  }
}

const buildConsumedPermissionRunIds = (
  permissionEventsByRun: Map<string, RunEventSummary[]>,
  events: RunEventSummary[],
  toolUseLookup: Map<string, PermissionDenialRenderItem>,
  permissionRequiredRunIds: Set<string>
) => {
  const retryEvents = events.filter(isPermissionRetryStartEvent)
  const consumedRunIds = new Set<string>()

  for (const permissionEvents of permissionEventsByRun.values()) {
    for (const event of permissionEvents) {
      const permissionRequest = createPermissionRequestItem(event, toolUseLookup, permissionRequiredRunIds)
      if (!permissionRequest) {
        continue
      }

      const wasRetried = retryEvents.some((retryEvent) => {
        if (retryEvent.createdAt <= permissionRequest.createdAt) {
          return false
        }

        const retriedTools = new Set(getAllowedTools(retryEvent))
        return permissionRequest.allowedTools.every((tool) => retriedTools.has(tool))
      })

      if (wasRetried) {
        consumedRunIds.add(event.runId)
      }
    }
  }

  return consumedRunIds
}

const isPersistedCodexAgentMessageEvent = (event: RunEventSummary) => {
  if (event.type !== "run.progress" || event.payload.rawType !== "item.completed") {
    return false
  }

  const raw = readRecord(event.payload.raw)
  const item = readRecord(raw?.item)
  return item?.type === "agent_message"
}

const getProviderMessageText = (event: RunEventSummary) => {
  const directText = readString(event.payload.text) ?? readString(event.payload.delta)
  if (directText !== null) {
    return directText
  }

  if (isLegacyClaudeResultMessageEvent(event)) {
    const raw = readRecord(event.payload.raw)
    return readString(event.payload.message) ?? readString(raw?.result)
  }

  const raw = readRecord(event.payload.raw)
  const item = readRecord(raw?.item)
  return readString(item?.text) ?? readString(item?.message)
}

const readToolContentText = (value: unknown, depth = 0): string => {
  if (depth > 6) return ""
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map((block) => readToolContentText(block, depth + 1)).filter(Boolean).join("\n")
  const block = readRecord(value)
  if (block?.type === "text") return readString(block.text) ?? ""
  return block?.type === "content" ? readToolContentText(block.content, depth + 1) : ""
}

const createEventItem = (event: RunEventSummary): Exclude<ChatRenderItem, UserMessageRenderItem | ProviderMessageRenderItem> | null => {
  const rawDetails = stringifyPayload(event.payload)
  const hasImages = readEventImages(event).length > 0

  if (!event.payload.parseError && (isRunSummaryEvent(event) || isProviderNoticeEvent(event))) {
    return {
      kind: "system-summary",
      id: event.id,
      runId: event.runId,
      createdAt: event.createdAt,
      displayClass: isProviderNoticeEvent(event) ? CHAT_DISPLAY_CLASSES.providerNotice : CHAT_DISPLAY_CLASSES.runLifecycle,
      eventType: event.type,
      status: getEventStatus(event),
      summary: summarizePayload(event.payload, event.type),
      rawDetails
    }
  }

  if ((!hasImages && eventNeedsRawFallback(event)) || event.payload.parseError) {
    return {
      kind: "raw-fallback",
      id: event.id,
      runId: event.runId,
      createdAt: event.createdAt,
      displayClass: CHAT_DISPLAY_CLASSES.debugRaw,
      eventType: event.type,
      summary: summarizePayload(event.payload, event.type),
      rawDetails
    }
  }

  if (event.type === "run.progress" && !hasImages && !isToolActivityEvent(event)) {
    return null
  }

  const payload = event.payload
  const toolUse = readRecord(payload.toolUse)
  const toolResult = readRecord(payload.toolResult)
  const partState = readRecord(readRecord(payload.part)?.state)
  const toolOutput =
    readString(toolUse?.output) ??
    readString(toolResult?.content) ??
    readString(payload.output) ??
    readString(partState?.output) ??
    (readToolContentText(toolResult?.content ?? payload.content ?? readRecord(payload.output)?.content ??
      readRecord(readRecord(payload.item)?.result)?.content) || null)

  return {
    kind: "tool-event",
    id: event.id,
    runId: event.runId,
    createdAt: event.createdAt,
    displayClass: CHAT_DISPLAY_CLASSES.toolActivity,
    eventType: event.type,
    summary: summarizePayload(event.payload, event.type),
    rawDetails,
    toolName: readString(toolUse?.name) ?? readString(payload.toolName) ?? readString(payload.name) ?? readString(payload.tool),
    toolStatus: readString(toolUse?.status) ?? readString(payload.toolStatus) ?? readString(payload.status),
    toolInput: readRecord(toolUse?.input) ?? readRecord(payload.input),
    toolOutput,
    isToolError: toolResult?.isError === true || toolUse?.status === "error"
  }
}

export const buildChatRenderItems = (timeline: ConversationTimeline): ChatRenderItem[] => {
  const runStatusById = new Map(timeline.runs.map((run) => [run.id, run.status]))
  const { itemByAnchorEventId, providerOutputRunIds: normalizedProviderOutputRunIds } =
    buildProviderOutputItems(timeline, runStatusById)
  const permissionToolUseLookup = buildClaudeToolUseLookup(timeline.events)
  const toolFailureEventsByRun = new Map<string, RunEventSummary[]>()
  const permissionRequiredRunIds = new Set(
    timeline.events
      .filter(isPermissionRequiredStatusEvent)
      .map((event) => event.runId)
  )
  const permissionEventsByRun = new Map<string, RunEventSummary[]>()
  const renderedProviderOutputItems = new Set<string>()
  const providerOutputRunIds = new Set<string>([
    ...normalizedProviderOutputRunIds,
    ...timeline.events.filter((event) => readEventImages(event).length > 0).map((event) => event.runId),
    ...timeline.messages
      .filter((message) => message.role === "assistant" && message.runId)
      .map((message) => message.runId as string)
  ])
  const eventsByRun = new Map<string, RunEventSummary[]>()
  const diagnosticsByRun = new Map<string, RunEventSummary[]>()
  const lastEventByRun = new Map<string, RunEventSummary>()

  for (const event of timeline.events) {
    lastEventByRun.set(event.runId, event)
    const runEvents = eventsByRun.get(event.runId) ?? []
    runEvents.push(event)
    eventsByRun.set(event.runId, runEvents)

    if (isDiagnosticEvent(event)) {
      const diagnostics = diagnosticsByRun.get(event.runId) ?? []
      diagnostics.push(event)
      diagnosticsByRun.set(event.runId, diagnostics)
    }

    if (createPermissionRequestItem(event, permissionToolUseLookup, permissionRequiredRunIds)) {
      const permissionEvents = permissionEventsByRun.get(event.runId) ?? []
      permissionEvents.push(event)
      permissionEventsByRun.set(event.runId, permissionEvents)
    }

    if (createToolFailureItem(event, permissionToolUseLookup, runStatusById.get(event.runId))) {
      const toolFailureEvents = toolFailureEventsByRun.get(event.runId) ?? []
      toolFailureEvents.push(event)
      toolFailureEventsByRun.set(event.runId, toolFailureEvents)
    }
  }

  const emittedRunSummaries = new Set<string>()
  const consumedPermissionRunIds = buildConsumedPermissionRunIds(
    permissionEventsByRun,
    timeline.events,
    permissionToolUseLookup,
    permissionRequiredRunIds
  )
  const entries: TimelineEntry[] = [
    ...timeline.messages.map((message) => ({
      createdAt: message.createdAt,
      sequence: -1,
      source: TimelineEntrySource.Message as const,
      message
    })),
    ...timeline.events.map((event) => ({
      createdAt: event.createdAt,
      sequence: event.sequence,
      source: TimelineEntrySource.Event as const,
      event
    }))
  ].sort((left, right) => {
    const timeComparison = left.createdAt.localeCompare(right.createdAt)
    return timeComparison === 0 ? left.sequence - right.sequence : timeComparison
  })

  const items: ChatRenderItem[] = []
  const renderedImageIds = new Set<string>()
  const emittedPermissionRequests = new Set<string>()
  const emittedToolFailures = new Set<string>()

  const appendPermissionRequestItem = (event: RunEventSummary, createdAt: string) => {
    if (consumedPermissionRunIds.has(event.runId)) {
      return
    }

    const permissionRequest = createPermissionRequestItem(event, permissionToolUseLookup, permissionRequiredRunIds)
    if (!permissionRequest) {
      return
    }

    if (emittedPermissionRequests.has(permissionRequest.id)) {
      return
    }

    emittedPermissionRequests.add(permissionRequest.id)
    items.push({
      ...permissionRequest,
      createdAt
    })
  }

  const appendRunPermissionRequestItems = (runId: string, createdAt: string) => {
    for (const event of permissionEventsByRun.get(runId) ?? []) {
      appendPermissionRequestItem(event, createdAt)
    }
  }

  const appendToolFailureItem = (event: RunEventSummary) => {
    const toolFailure = createToolFailureItem(event, permissionToolUseLookup, runStatusById.get(event.runId))
    if (!toolFailure || emittedToolFailures.has(toolFailure.id)) {
      return
    }

    emittedToolFailures.add(toolFailure.id)
    items.push(toolFailure)
  }

  const appendRunToolFailureItems = (runId: string) => {
    for (const event of toolFailureEventsByRun.get(runId) ?? []) {
      appendToolFailureItem(event)
    }
  }

  const appendRunSummaryItems = (event: RunEventSummary) => {
    if (
      consumedPermissionRunIds.has(event.runId) ||
      emittedRunSummaries.has(event.runId) ||
      lastEventByRun.get(event.runId)?.id !== event.id
    ) {
      return
    }

    emittedRunSummaries.add(event.runId)
    appendRunPermissionRequestItems(event.runId, event.createdAt)
    appendRunToolFailureItems(event.runId)

    const diagnostics = diagnosticsByRun.get(event.runId) ?? []
    const hasAttentionDiagnostic = diagnostics.some((diagnostic) => !isRoutineLifecycleDiagnosticEvent(diagnostic))

    if (!hasAttentionDiagnostic) {
      return
    }

    const runStatus = runStatusById.get(event.runId) ?? "idle"
    const status = runStatus === "idle" ? getEventStatus(event) ?? "running" : runStatus
    const hasProviderOutput = providerOutputRunIds.has(event.runId)
    const isWaitingForPermission = permissionRequiredRunIds.has(event.runId)
    const shouldEmitProviderActivity =
      !isWaitingForPermission &&
      (
        (status === "running" && !hasProviderOutput) ||
        status === "failed" ||
        status === "interrupted" ||
        status === "unavailable" ||
        (status === "completed" && !hasProviderOutput)
      )

    const providerActivity = shouldEmitProviderActivity
      ? createProviderActivityItem(
        event.runId,
        event.createdAt,
        eventsByRun.get(event.runId) ?? [],
        diagnostics,
        status
      )
      : null

    const shouldEmitOutcome =
      !isWaitingForPermission &&
      (
        status === "failed" ||
        status === "interrupted" ||
        status === "unavailable" ||
        (status === "completed" && !hasProviderOutput)
      )

    if (shouldEmitOutcome) {
      items.push(createRunOutcomeItem(
        event.runId,
        event.createdAt,
        status,
        diagnostics.length,
        hasProviderOutput
      ))
    }
    if (providerActivity) {
      items.push(providerActivity)
    }
  }

  for (const entry of entries) {
    if (entry.source === TimelineEntrySource.Message) {
      if (entry.message.role === "user") {
        items.push(createUserMessageItem(entry.message))
      } else if (
        entry.message.role === "assistant" &&
        entry.message.runId &&
        !normalizedProviderOutputRunIds.has(entry.message.runId)
      ) {
        items.push(createProviderMessageCacheItem(entry.message))
      }
      continue
    }

    const { event } = entry
    const images = readEventImages(event)
    for (const [index, image] of images.entries()) {
      // eslint-disable-next-line i18next/no-literal-string -- stable internal render key, not user-visible text.
      const key = image.status === "ready" ? image.attachment.id : `${event.id}:image:${index}`
      if (renderedImageIds.has(key)) continue
      renderedImageIds.add(key)
      items.push({ id: event.payload.image ? event.id : `${event.id}:image:${index}`, runId: event.runId,
        createdAt: event.createdAt, kind: "provider-image", image })
    }
    if (images.length > 0) {
      if (event.type !== "run.artifact.changed") {
        const toolItem = createEventItem(event)
        if (toolItem) items.push(toolItem)
      }
      appendRunSummaryItems(event)
      continue
    }
    const providerOutputItem = itemByAnchorEventId.get(event.id)
    if (providerOutputItem && !renderedProviderOutputItems.has(providerOutputItem.id)) {
      items.push(providerOutputItem)
      renderedProviderOutputItems.add(providerOutputItem.id)
      appendRunSummaryItems(event)
      continue
    }

    if (
      isProviderMessageEvent(event) ||
      event.type === "run.reasoning.delta" ||
      event.type === "run.reasoning.completed" ||
      event.type === "run.reasoning.raw.delta"
    ) {
      appendRunSummaryItems(event)
      continue
    }

    if (isDiagnosticEvent(event)) {
      appendToolFailureItem(event)
      appendRunSummaryItems(event)
      continue
    }

    const eventItem = createEventItem(event)
    if (eventItem) {
      items.push(eventItem)
    }
    appendRunSummaryItems(event)
  }

  return sortByOccurrence(items)
}
