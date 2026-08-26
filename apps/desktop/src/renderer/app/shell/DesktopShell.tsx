/* eslint-disable i18next/no-literal-string */
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type ChangeEvent as ReactChangeEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type UIEvent as ReactUIEvent } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowDown, faArrowUp, faBolt, faCheck, faChevronDown, faChevronRight, faChevronUp, faCircleInfo, faCirclePlus, faCodeBranch, faCommentMedical, faCopy, faCube, faEyeSlash, faFileLines, faFolderOpen, faGear, faPenToSquare, faRotateRight, faShield, faShieldHalved, faStop, faThumbtack, faTrashCan, faXmark } from "@fortawesome/free-solid-svg-icons"
import {
  type AddCustomModelInput,
  type AppError,
  type ArtifactSummary,
  type ConversationChangeArea,
  type ConversationChangesMutationResult,
  type ConversationChangesMutationScope,
  type ConversationChangesSnapshot,
  type ConversationGitStatus,
  type ConversationProjectFiles,
  type ConversationSummary,
  type ConversationTimeline,
  DEFAULT_GIT_COMMIT_SCOPE,
  DEFAULT_PROVIDER_ACCESS_MODE,
  getSlashCommandsForProvider,
  MAX_CONVERSATION_ATTACHMENT_BYTES,
  MAX_CONVERSATION_ATTACHMENTS,
  MAX_CONVERSATION_ATTACHMENTS_TOTAL_BYTES,
  parseProviderSlashCommand,
  providerAccessModeSchema,
  type ExternalOpenAppId,
  type ExternalOpenOption,
  type GitCommitScope,
  type ProviderAccessMode,
  type TerminalOutputEvent,
  type TerminalSessionSummary,
  type ProjectWorktreeFiles,
  type ProjectWorktreeSummary,
  type ProviderKind,
  type ProviderReadiness,
  type ProviderModelOption,
  type SlashCommandDefinition,
  type ProjectFileTreeItem,
  type WorktreeSummary
} from "@shared/index"
import { useProviderReadiness } from "../../domains/providers/provider-store"
import { getProviderBoundaryCopy, getProviderReadinessCopy } from "../../domains/providers/provider-readiness"
import { useTheme } from "../providers/ThemeProvider"
import { SettingsDrawer } from "../settings/SettingsDrawer"
import { ShellLayout } from "./ShellLayout"
import { ImagePreviewDialog } from "./ImagePreviewDialog"
import { buildChatRenderItems, type ChatRenderItem, type PermissionRequestRenderItem, type SystemSummaryRenderItem, type ToolEventRenderItem } from "./chat-render-model"
import { MarkdownMessage } from "./chat/MarkdownMessage"
import { ToolCallCard } from "./chat/ToolCallCard"
import { VirtualizedChatTimeline } from "./chat/VirtualizedChatTimeline"
import { readComposerAttachment, type ComposerAttachmentDraft } from "./composer-attachments"
import { EditorWorkspace } from "./editor/EditorWorkspace"
import { FileIcon } from "./file-icons/FileIcon"
import {
  createEmptyConversationFileEditorState,
  openConversationChangeDiffTab,
  openConversationFileTab,
  resetConversationFileTabsForConversation,
  type ConversationFileEditorState
} from "./editor/conversation-file-editor-model"
import { getInspectorDiffBlocks, getReviewableDiffBlockForRun, type InspectorDiffBlock } from "./inspector-diff-model"
import { InspectorChangesPanel } from "./InspectorChangesPanel"
import type { InspectorChangeSelection } from "./inspector-changes-model"
import { useShellContext } from "./shell-store"
import { readCssThemeColor, readTerminalTheme } from "./terminal-theme"

type WorktreeTargetKind = "default" | "existing-worktree" | "new-worktree"

type LauncherPrefill = {
  providerKind: ProviderKind
  modelId: string
  worktreeTarget: Exclude<WorktreeTargetKind, "new-worktree">
  worktreeId: string | null
}

type CompareTimelineStatus = "idle" | "loading" | "ready" | "error"

type InspectorTab = "files" | "terminal" | "changes" | "git"
type InspectorGitStatusLoadState = "idle" | "loading" | "ready" | "error" | "unavailable"
type InspectorProjectFilesLoadState = "idle" | "loading" | "ready" | "error" | "unavailable"
type InspectorChangesLoadState = "idle" | "loading" | "ready" | "error" | "unavailable"
type InspectorProjectFiles = ConversationProjectFiles | ProjectWorktreeFiles
type InspectorProjectFilesTarget =
  | { kind: "conversation"; conversationId: string }
  | { kind: "worktree"; projectId: string; worktreeId: string }
type InspectorFocusMode = "follow" | "pinned"
type ConversationChangesRefreshSource = "foreground" | "mutation" | "background"

const conversationChangesRefreshPriority: Record<ConversationChangesRefreshSource, number> = {
  background: 0,
  mutation: 1,
  foreground: 2
}

type ConversationChangesInFlight = {
  requestId: number
  queuedSource: ConversationChangesRefreshSource | null
  promise: Promise<void>
}

type ProjectFileContextMenuState = {
  file: ProjectFileTreeItem
  x: number
  y: number
}

type ProjectContextMenuState = {
  projectId: string
  x: number
  y: number
}

type ProjectFileInlineEditState =
  | {
      mode: "create"
      parentPath: string
      parentDepth: number
      kind: ProjectFileTreeItem["kind"]
      draft: string
      error: string | null
      isSaving: boolean
    }
  | {
      mode: "rename"
      sourcePath: string
      sourceName: string
      kind: ProjectFileTreeItem["kind"]
      draft: string
      error: string | null
      isSaving: boolean
    }

type ProjectFileRow =
  | { kind: "existing"; file: ProjectFileTreeItem }
  | { kind: "inline-create"; parentPath: string; parentDepth: number }

type HandoffRequestState = {
  requestId: number
  conversationId: string
  target: "worktree" | "file"
  filePath?: string
}

type InspectorHandoffMessage = {
  conversationId: string | null
  tab: InspectorTab
  tone: "success" | "error"
  text: string
}

type InspectorChangesCommitDraft = {
  conversationId: string
  message: string
}

type InspectorChangesMutationPending = {
  requestId: number
  conversationId: string
  worktreeId: string
}

type PendingComposerSubmission = {
  requestId: number
  conversationId: string
  content: string
  attachments: ComposerAttachmentDraft[]
  model: string | null
  createdAt: string
  knownMessageIds: string[]
  knownRunIds: string[]
  startsRun: boolean
}

type TerminalPanelState = {
  session: TerminalSessionSummary | null
  status: "idle" | "starting" | "running" | "exited" | "error" | "closed"
  message: string | null
  conversationId: string | null
}

type PinnedInspectorContext = {
  conversation: ConversationSummary
  timeline: ConversationTimeline | null
  timelineStatus: CompareTimelineStatus
  tab: InspectorTab
  changesSnapshot: ConversationChangesSnapshot | null
  changesLoadState: InspectorChangesLoadState
  changesError: string | null
  changesStale: boolean
  selectedChange: InspectorChangeSelection | null
  gitStatus: ConversationGitStatus | null
  gitStatusLoadState: InspectorGitStatusLoadState
  gitStatusError: string | null
  pinnedAt: string
}

type LauncherSelectOption = {
  id: string
  label: string
  detail?: string
  meta?: string
  disabled?: boolean
}

const providerLogoUrls: Record<ProviderKind, string> = {
  codex: new URL("../../assets/providers/codex.svg", import.meta.url).href,
  claude: new URL("../../assets/providers/claude.svg", import.meta.url).href,
  opencode: new URL("../../assets/providers/opencode.svg", import.meta.url).href,
  cursor: new URL("../../assets/providers/cursor.svg", import.meta.url).href
}
const teamCowLogoUrl = new URL("../../assets/brand/teamcow-logo-rounded.png", import.meta.url).href

const SIDEBAR_CONVERSATION_PREVIEW_LIMIT = 4
const BINDING_PROJECT_PATH_MAX_LENGTH = 42
const MIDDLE_ELLIPSIS = "…"
const PROJECT_FILE_ROW_HEIGHT = 29
const PROJECT_FILE_VIRTUAL_OVERSCAN = 16
const PROJECT_FILE_VIEWPORT_FALLBACK_HEIGHT = 720
const PROJECT_FILE_CONTEXT_MENU_WIDTH = 220
const PROJECT_FILE_CONTEXT_MENU_HEIGHT = 320
const PROJECT_CONTEXT_MENU_WIDTH = 208
const PROJECT_CONTEXT_MENU_HEIGHT = 168
const CONTEXT_MENU_EDGE_PADDING = 8
const getFirstReadyProviderKind = (providers: ProviderReadiness[]): ProviderKind | null =>
  providers.find((provider) => provider.availability === "ready")?.kind ?? null

const getShortWorktreeName = (rootPath: string) => {
  const trimmed = rootPath.replace(/[\\/]+$/, "")
  const segments = trimmed.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) ?? rootPath
}

const formatMiddleEllipsis = (value: string, maxLength = BINDING_PROJECT_PATH_MAX_LENGTH) => {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }

  const visibleLength = Math.max(2, maxLength - MIDDLE_ELLIPSIS.length)
  const tailLength = Math.min(Math.ceil(visibleLength * 0.62), visibleLength - 1)
  const headLength = visibleLength - tailLength

  return `${trimmed.slice(0, headLength)}${MIDDLE_ELLIPSIS}${trimmed.slice(-tailLength)}`
}

const getConversationWorktreeLabel = (conversation: {
  worktree: {
    branch: string | null
    rootPath: string
  }
}) => conversation.worktree.branch ?? getShortWorktreeName(conversation.worktree.rootPath)

const getConversationWorktreeKindLabel = (
  conversation: {
    worktree: {
      kind: WorktreeSummary["kind"]
    }
  },
  tShell: (key: string, opts?: Record<string, unknown>) => string
) => conversation.worktree.kind === "default"
  ? tShell("execution-targets.default")
  : tShell("execution-targets.git-worktree")

const getViewportMenuPosition = (
  point: { x: number; y: number },
  menuSize: { width: number; height: number },
  viewportSize: { width: number; height: number }
) => ({
  left: Math.max(
    CONTEXT_MENU_EDGE_PADDING,
    Math.min(point.x, viewportSize.width - CONTEXT_MENU_EDGE_PADDING - menuSize.width)
  ),
  top: Math.max(
    CONTEXT_MENU_EDGE_PADDING,
    Math.min(point.y, viewportSize.height - CONTEXT_MENU_EDGE_PADDING - menuSize.height)
  )
})

const relativeTimeUnits = [
  { unit: "year", seconds: 365 * 24 * 60 * 60 },
  { unit: "month", seconds: 30 * 24 * 60 * 60 },
  { unit: "week", seconds: 7 * 24 * 60 * 60 },
  { unit: "day", seconds: 24 * 60 * 60 },
  { unit: "hour", seconds: 60 * 60 },
  { unit: "minute", seconds: 60 },
  { unit: "second", seconds: 1 }
] as const

const formatConversationRelativeTime = (
  timestamp: string,
  locale: string,
  nowMs = Date.now()
) => {
  const updatedMs = Date.parse(timestamp)
  if (!Number.isFinite(updatedMs)) {
    return ""
  }

  const deltaSeconds = Math.round((updatedMs - nowMs) / 1000)
  const absSeconds = Math.abs(deltaSeconds)
  const match = relativeTimeUnits.find(({ seconds }) => absSeconds >= seconds) ?? relativeTimeUnits.at(-1)!
  const value = Math.trunc(deltaSeconds / match.seconds) || (deltaSeconds < 0 ? -1 : 1)

  return new Intl.RelativeTimeFormat(locale, {
    numeric: "always",
    style: "narrow"
  }).format(value, match.unit)
}

const formatConversationUpdatedTitle = (timestamp: string, locale: string) => {
  const updatedMs = Date.parse(timestamp)
  if (!Number.isFinite(updatedMs)) {
    return timestamp
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(updatedMs))
}

const sortConversationsByRecentActivity = (conversations: ConversationSummary[]) =>
  [...conversations].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  )


const getProjectSummary = (project: {
  conversations: {
    runStatus: string
  }[]
}, tShell: (key: string, opts?: Record<string, unknown>) => string) => {
  const runningCount = project.conversations.filter((conversation) => conversation.runStatus === "running").length
  const conversationLabel = tShell("sidebar.convo-count", { count: project.conversations.length })
  const runningLabel = tShell("sidebar.running-count", { count: runningCount })
  return [conversationLabel, runningLabel].join(" · ")
}

const getProviderLabel = (
  providerKind: string | null,
  tProvider: (key: string, opts?: Record<string, unknown>) => string
) => {
  switch (providerKind) {
    case "codex":
    case "claude":
    case "opencode":
    case "cursor":
      return tProvider(`badge.${providerKind}`)
    default:
      return tProvider("badge.not-selected")
  }
}

const formatCompactDateTime = (value: string | null, locale?: string) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date)
}

const getDateTimeValue = (value: string | null) => {
  if (!value) {
    return Number.NEGATIVE_INFINITY
  }

  const time = new Date(value).getTime()
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

const compareRunsByTime = (
  left: ConversationTimeline["runs"][number],
  right: ConversationTimeline["runs"][number]
) =>
  getDateTimeValue(left.startedAt) - getDateTimeValue(right.startedAt) ||
  getDateTimeValue(left.completedAt) - getDateTimeValue(right.completedAt) ||
  getDateTimeValue(left.createdAt) - getDateTimeValue(right.createdAt) ||
  left.id.localeCompare(right.id)

const getProviderTone = (providerKind: string | null) => {
  switch (providerKind) {
    case "codex":
    case "claude":
    case "opencode":
    case "cursor":
      return providerKind
    default:
      return "not-selected"
  }
}

const getRunStatusTone = (runStatus: string | null) => {
  switch (runStatus) {
    case "running":
      return "run"
    case "completed":
      return "done"
    case "failed":
    case "interrupted":
    case "unavailable":
      return "error"
    default:
      return "idle"
  }
}

const getAvailabilityTone = (availability: string) => {
  switch (availability) {
    case "ready":
      return "done"
    case "unavailable":
      return "error"
    default:
      return "idle"
  }
}

const getConversationProviderReadinessFallback = (
  conversation: ConversationSummary | null
): ProviderReadiness | null => {
  if (!conversation) {
    return null
  }

  return {
    kind: conversation.provider.kind as ProviderKind,
    availability: conversation.provider.status,
    badge: conversation.provider,
    issues: []
  }
}

const getCurrentWorktreeLabel = (
  currentConversation: {
    worktree: {
      branch: string | null
      rootPath: string
    }
  } | null,
  currentProject: {
    defaultWorktree: {
      branch: string | null
      rootPath: string
    }
  } | null,
  shellWorktreeBranch: string | null,
  shellWorktreePath: string | null
) =>
  currentConversation?.worktree.branch ??
  currentProject?.defaultWorktree.branch ??
  shellWorktreeBranch ??
  (shellWorktreePath ? getShortWorktreeName(shellWorktreePath) : "")

const formatProviderCheckedAt = (checkedAt: string) => {
  const parsed = new Date(checkedAt)
  if (Number.isNaN(parsed.getTime())) {
    return checkedAt
  }

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, "0")
  const day = String(parsed.getDate()).padStart(2, "0")
  const hour = String(parsed.getHours()).padStart(2, "0")
  const minute = String(parsed.getMinutes()).padStart(2, "0")
  const second = String(parsed.getSeconds()).padStart(2, "0")

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

const getModelOptions = (
  providerKind: ProviderKind | null,
  providerModelsByKind: Partial<Record<ProviderKind, { models: ProviderModelOption[] }>>
): ProviderModelOption[] => {
  if (!providerKind) {
    return []
  }

  return providerModelsByKind[providerKind]?.models ?? []
}

type ModelPickerGroup = {
  key: "discovered" | "custom"
  models: ProviderModelOption[]
}

const groupModelsForPicker = (models: ProviderModelOption[]): ModelPickerGroup[] => {
  const custom = models.filter((m) => m.source === "user-custom")
  const discovered = models.filter((m) => m.source !== "user-custom")
  const groups: ModelPickerGroup[] = []
  if (discovered.length > 0) groups.push({ key: "discovered", models: discovered })
  if (custom.length > 0) groups.push({ key: "custom", models: custom })
  return groups
}

const sourceBadgeKeyFor = (source: ProviderModelOption["source"]): string | null => {
  if (source === "native-list") return "modelPicker.badge.nativeList"
  if (source === "config-derived") return "modelPicker.badge.configDerived"
  if (source === "fallback") return "modelPicker.badge.fallback"
  if (source === "user-custom") return "modelPicker.badge.userCustom"
  return null
}

const providerModelLabelKeyById: Partial<Record<ProviderKind, Record<string, string>>> = {
  claude: {
    default: "modelPicker.label.claude.default"
  },
  cursor: {
    auto: "modelPicker.label.cursor.auto"
  }
}

const providerModelDetailKeyById: Partial<Record<ProviderKind, Record<string, string>>> = {
  claude: {
    default: "modelPicker.detail.claude.default",
    "claude-fable-5": "modelPicker.detail.claude.fable-5",
    "claude-opus-5": "modelPicker.detail.claude.opus-5",
    "claude-opus-4-8": "modelPicker.detail.claude.opus-4-8",
    "claude-sonnet-5": "modelPicker.detail.claude.sonnet-5",
    "claude-haiku-4-5": "modelPicker.detail.claude.haiku-4-5"
  },
  codex: {
    "gpt-5.5": "modelPicker.detail.codex.gpt-5-5",
    "gpt-5.4": "modelPicker.detail.codex.gpt-5-4",
    "gpt-5.4-mini": "modelPicker.detail.codex.gpt-5-4-mini",
    "gpt-5.3-codex": "modelPicker.detail.codex.gpt-5-3-codex"
  },
  opencode: {
    "anthropic/claude-sonnet-4-6": "modelPicker.detail.opencode.claude-sonnet-4-6",
    "anthropic/claude-opus-4-7": "modelPicker.detail.opencode.claude-opus-4-7",
    "openai/gpt-4.1": "modelPicker.detail.opencode.gpt-4-1",
    "google/gemini-2.5-pro": "modelPicker.detail.opencode.gemini-2-5-pro"
  },
  cursor: {
    auto: "modelPicker.detail.cursor.auto",
    "composer-2.5": "modelPicker.detail.cursor.composer-2-5"
  }
}

const getProviderModelLabel = (
  providerKind: ProviderKind | null,
  model: ProviderModelOption,
  tShell: (key: string) => string
) => {
  if (providerKind && model.source !== "user-custom") {
    const labelKey = providerModelLabelKeyById[providerKind]?.[model.id]
    if (labelKey) {
      return tShell(labelKey)
    }
  }

  return model.label
}

const getProviderModelDetail = (
  providerKind: ProviderKind | null,
  model: ProviderModelOption,
  tShell: (key: string) => string
) => {
  if (providerKind && model.source !== "user-custom") {
    const detailKey = providerModelDetailKeyById[providerKind]?.[model.id]
    if (detailKey) {
      return tShell(detailKey)
    }
  }

  return model.detail
}

const getWorktreeDisplay = (worktree: WorktreeSummary | null, tShell: (key: string, opts?: Record<string, unknown>) => string) => {
  if (!worktree) {
    return tShell("shell.default-worktree")
  }

  return worktree.branch ?? getShortWorktreeName(worktree.rootPath)
}

const getFollowUpLauncherPrefill = (
  conversation: {
    provider: {
      kind: string
    }
    currentModel: string
    worktree: {
      id: string
      kind: WorktreeSummary["kind"]
    }
    worktreeId: string
  } | null,
  currentProject: {
    defaultWorktree: {
      id: string
    }
  } | null
): LauncherPrefill | null => {
  if (!conversation) {
    return null
  }

  const worktreeTarget = conversation.worktree.kind === "default" ? "default" : "existing-worktree"

  return {
    providerKind: conversation.provider.kind as ProviderKind,
    modelId: conversation.currentModel,
    worktreeTarget,
    worktreeId: worktreeTarget === "default"
      ? currentProject?.defaultWorktree.id ?? conversation.worktreeId
      : conversation.worktree.id
  }
}

const getComposerAccessModeLabel = (accessMode: ProviderAccessMode) => {
  if (accessMode === "read-only") {
    return "Read"
  }
  if (accessMode === "full-access") {
    return "Full"
  }
  return "WT write"
}

const renderRawDetails = (
  rawDetails: string | null,
  tChat: (key: string, opts?: Record<string, unknown>) => string
) => rawDetails ? (
  <details className="chat-raw-details">
    <summary>{tChat("render.raw-details")}</summary>
    <pre>{rawDetails}</pre>
  </details>
) : null

const renderChatInlineActions = (
  tChat: (key: string, opts?: Record<string, unknown>) => string,
  reviewDiff?: {
    block: InspectorDiffBlock
    onSelect: (block: InspectorDiffBlock) => void
    disabledReason?: string
    onOpenFile?: (filePath: string) => void
  }
) => {
  if (!reviewDiff) {
    return null
  }

  const openFile = reviewDiff.onOpenFile

  return (
    <div className="chat-inline-actions">
      <button
        className="chat-inline-action"
        type="button"
        data-testid={`chat-review-diff-${reviewDiff.block.artifactId}`}
        disabled={Boolean(reviewDiff.disabledReason)}
        title={reviewDiff.disabledReason}
        onClick={() => {
          if (!reviewDiff.disabledReason) {
            reviewDiff.onSelect(reviewDiff.block)
          }
        }}
      >
        {tChat("render.review-diff")}
      </button>
      {reviewDiff.block.filePath && openFile ? (
        <button
          className="chat-inline-action secondary"
          type="button"
          data-testid={`chat-open-editor-${reviewDiff.block.artifactId}`}
          disabled={Boolean(reviewDiff.disabledReason)}
          title={reviewDiff.disabledReason}
          onClick={() => {
            if (!reviewDiff.disabledReason && reviewDiff.block.filePath) {
              openFile(reviewDiff.block.filePath)
            }
          }}
        >
          {tChat("render.open-editor")}
        </button>
      ) : null}
    </div>
  )
}

const getRunOutcomeSummary = (
  item: Extract<ChatRenderItem, { kind: "run-outcome" }>,
  tChat: (key: string, opts?: Record<string, unknown>) => string
) => {
  if (item.status === "failed") {
    return tChat("render.outcome.failed", { count: item.diagnosticsCount })
  }

  if (item.status === "interrupted") {
    return tChat("render.outcome.interrupted", { count: item.diagnosticsCount })
  }

  if (item.status === "unavailable") {
    return tChat("render.outcome.unavailable", { count: item.diagnosticsCount })
  }

  if (item.status === "completed" && item.diagnosticsCount > 0) {
    return item.hasProviderOutput
      ? tChat("render.outcome.completed-with-diagnostics", { count: item.diagnosticsCount })
      : tChat("render.outcome.completed-no-output", { count: item.diagnosticsCount })
  }

  return tChat("render.outcome.running", { count: item.diagnosticsCount })
}

type ProviderActivityText = Pick<
  Extract<ChatRenderItem, { kind: "provider-activity" }>,
  "activityKind" | "label" | "phase"
>

type ImagePreviewTarget = {
  src: string
  name: string
}

const getProviderActivityKindLabel = (
  item: ProviderActivityText,
  tChat: (key: string, opts?: Record<string, unknown>) => string
) => {
  const fallback = item.label.replace(/[_-]+/g, " ")
  return tChat(`render.activity.kind.${item.activityKind}`, { defaultValue: fallback })
}

const getProviderActivitySummary = (
  item: ProviderActivityText,
  tChat: (key: string, opts?: Record<string, unknown>) => string
) =>
  tChat(`render.activity.phase.${item.phase}`, {
    activity: getProviderActivityKindLabel(item, tChat)
  })

const renderChatLoadingDots = () => (
  <span className="chat-live-dots" aria-hidden="true">
    <span />
    <span />
    <span />
  </span>
)

const renderChatItem = (
  item: ChatRenderItem,
  tChat: (key: string, opts?: Record<string, unknown>) => string,
  tCommon: (key: string, opts?: Record<string, unknown>) => string,
  reviewDiff?: {
    block: InspectorDiffBlock
    onSelect: (block: InspectorDiffBlock) => void
    disabledReason?: string
    onOpenFile?: (filePath: string) => void
  },
  permissionActions?: {
    onAllow: (item: PermissionRequestRenderItem) => void
    onDismiss: (item: PermissionRequestRenderItem) => void | Promise<void>
  },
  onPreviewImage?: (target: ImagePreviewTarget) => void
) => {
  if (item.kind === "user-message") {
    return (
      <article className="chat-message user" key={item.id} data-testid="chat-user-message">
        <div className="chat-message-meta">
          <span>{tChat("role.user")}</span>
          {item.model ? <span>{item.model}</span> : null}
        </div>
        {item.attachments && item.attachments.length > 0 ? (
          <div className="chat-message-attachments" data-testid="chat-message-attachments">
            {item.attachments.map((attachment) => attachment.kind === "image" ? (
              <figure className="chat-message-attachment image" key={attachment.id}>
                <button
                  type="button"
                  className="chat-message-attachment__preview-button"
                  aria-label={tChat("image.preview.open", { name: attachment.name })}
                  data-testid="chat-image-preview-trigger"
                  onClick={() => onPreviewImage?.({ src: attachment.uri, name: attachment.name })}
                >
                  <img src={attachment.uri} alt={attachment.name} loading="lazy" />
                </button>
                <figcaption>{attachment.name}</figcaption>
              </figure>
            ) : (
              <div className="chat-message-attachment file" key={attachment.id}>
                <FontAwesomeIcon icon={faFileLines} aria-hidden="true" />
                <span title={attachment.name}>{attachment.name}</span>
              </div>
            ))}
          </div>
        ) : null}
        {item.content ? <p>{item.content}</p> : null}
      </article>
    )
  }

  if (item.kind === "provider-message") {
    return (
      <article
        className={`chat-message provider ${item.phase}`}
        key={item.id}
        data-testid="chat-provider-message"
        data-authoritative={item.authoritative ? "true" : "false"}
      >
        <div className="chat-message-meta">
          <span>{tChat("role.assistant")}</span>
          <span className={item.isRunning ? "chat-live-state" : undefined}>
            {item.isRunning ? renderChatLoadingDots() : null}
            {tChat(item.phase === "final" ? "render.final-answer" : "render.live-response")}
          </span>
        </div>
        <MarkdownMessage content={item.content} />
      </article>
    )
  }

  if (item.kind === "provider-context") {
    return (
      <details
        className={`chat-provider-context ${item.contextKind}${item.isRunning ? " is-running" : ""}`}
        key={item.id}
        open={item.isRunning}
        data-testid={`chat-provider-${item.contextKind}`}
      >
        <summary>
          <span className="chat-provider-context-title">
            <span className="chat-provider-context-pulse" aria-hidden="true" />
            {tChat(`render.context.${item.contextKind}`)}
          </span>
          <span className={`chat-provider-context-state${item.isRunning ? " chat-live-state" : ""}`}>
            {item.isRunning ? renderChatLoadingDots() : null}
            {item.isRunning ? tChat("render.context.streaming") : tChat("render.context.completed")}
          </span>
        </summary>
        <div className="chat-provider-context-body">
          {item.contextKind === "reasoning" ? (
            <ol className="chat-provider-context-steps">
              {item.entries.map((entry, index) => (
                <li key={`${item.id}-${index}`}>
                  <MarkdownMessage content={entry} />
                </li>
              ))}
            </ol>
          ) : (
            <MarkdownMessage content={item.content} />
          )}
        </div>
      </details>
    )
  }

  if (item.kind === "provider-activity") {
    const activityIsRunning = item.phase === "starting" || item.phase === "running"
    return (
      <article
        className={`chat-message provider-activity ${item.phase}`}
        key={item.id}
        data-testid="chat-provider-activity"
      >
        <div className="provider-activity-mark" aria-hidden="true">
          <FontAwesomeIcon icon={faBolt} />
        </div>
        <div className="provider-activity-body">
          <div className="chat-message-meta">
            <span>{tChat("render.activity")}</span>
            <span className={activityIsRunning ? "chat-live-state" : undefined}>
              {activityIsRunning ? renderChatLoadingDots() : null}
              {item.phase === "starting" && item.eventCount === 0
                ? tChat("render.activity-starting")
                : tChat("render.activity-event-count", { count: item.eventCount })}
            </span>
          </div>
          <p>{getProviderActivitySummary(item, tChat)}</p>
          <ol className="provider-activity-steps">
            {item.steps.map((step) => (
              <li className="provider-activity-step" key={step.id}>
                <span className="provider-activity-step-dot" aria-hidden="true" />
                <div className="provider-activity-step-copy">
                  <strong>{getProviderActivitySummary(step, tChat)}</strong>
                  {step.detail ? <span>{step.detail}</span> : null}
                </div>
              </li>
            ))}
          </ol>
          {item.details.length > 0 ? (
            <details className="provider-activity-details" data-testid="chat-provider-activity-details">
              <summary>
                <span>{tChat("render.activity-details")}</span>
                <span>{tChat("render.activity-event-count", { count: item.details.length })}</span>
              </summary>
              <div className="provider-activity-detail-events">
                {item.details.map((event) => (
                  <section className="provider-activity-detail-event" key={event.id}>
                    <div className="chat-message-meta">
                      <span>{event.eventType}</span>
                      {event.status ? <span>{tCommon(`state.${event.status}`, { defaultValue: event.status })}</span> : null}
                    </div>
                    <p>{event.summary}</p>
                    {renderRawDetails(event.rawDetails, tChat)}
                  </section>
                ))}
              </div>
            </details>
          ) : null}
          {renderChatInlineActions(tChat, reviewDiff)}
        </div>
      </article>
    )
  }

  if (item.kind === "permission-request") {
    return (
      <article className="chat-message permission" key={item.id} data-testid="chat-permission-request">
        <div className="chat-message-meta">
          <span>{tChat("render.permission-request")}</span>
          <span>{tChat("render.permission-tools-count", { count: item.allowedTools.length })}</span>
        </div>
        <p>{tChat("render.permission-summary")}</p>
        <div className="chat-permission-list">
          {item.denials.map((denial) => (
            <div className="chat-permission-row" key={`${denial.toolName}-${denial.toolUseId ?? denial.target}`}>
              <strong>{denial.toolName}</strong>
              {denial.target ? <span>{denial.target}</span> : null}
            </div>
          ))}
        </div>
        <div className="chat-inline-actions">
          <button
            className="chat-inline-action"
            type="button"
            data-testid={`chat-permission-allow-${item.runId}`}
            onClick={() => permissionActions?.onAllow(item)}
          >
            {tChat("render.permission-allow")}
          </button>
          <button
            className="chat-inline-action secondary"
            type="button"
            data-testid={`chat-permission-dismiss-${item.runId}`}
            onClick={() => {
              void permissionActions?.onDismiss(item)
            }}
          >
            {tChat("render.permission-dismiss")}
          </button>
        </div>
      </article>
    )
  }

  if (item.kind === "tool-failure") {
    if (!item.isFatal) {
      const toolLabel = item.toolName ?? tChat("render.tool-unknown")
      return (
        <details
          className="chat-provider-context tool-warning"
          key={item.id}
          data-testid="chat-tool-warning"
        >
          <summary>
            <span className="chat-provider-context-title">
              <span className="chat-provider-context-pulse" aria-hidden="true" />
              {tChat("render.tool-warning-title", { tool: toolLabel })}
            </span>
            <span className="chat-provider-context-state">
              {tChat(item.isRunning ? "render.tool-warning-continuing" : "render.tool-warning-continued")}
            </span>
          </summary>
          <div className="chat-provider-context-body chat-tool-warning-details">
            <p>{tChat("render.tool-warning-summary")}</p>
            <div className="chat-tool-failure-body">
              {item.target ? <span>{item.target}</span> : null}
              <strong>{item.message}</strong>
            </div>
          </div>
        </details>
      )
    }

    return (
      <article className="chat-message tool-failure" key={item.id} data-testid="chat-tool-failure">
        <div className="chat-message-meta">
          <span>{tChat("render.tool-failure")}</span>
          {item.toolName ? <span>{item.toolName}</span> : null}
        </div>
        <p>{tChat("render.tool-failure-summary")}</p>
        <div className="chat-tool-failure-body">
          {item.target ? <span>{item.target}</span> : null}
          <strong>{item.message}</strong>
        </div>
      </article>
    )
  }

  if (item.kind === "tool-event") {
    return (
      <ToolCallCard
        key={item.id}
        item={item as ToolEventRenderItem}
        tChat={tChat}
        inlineActions={renderChatInlineActions(tChat, reviewDiff)}
      />
    )
  }

  if (item.kind === "run-outcome") {
    const statusLabel = tCommon(`state.${item.status}`, { defaultValue: item.status })
    return (
      <article
        className={`chat-message outcome ${getRunStatusTone(item.status)}`}
        key={item.id}
        data-testid="chat-run-outcome"
      >
        <div className="chat-message-meta">
          <span>{tChat("render.run-outcome")}</span>
          <span>{statusLabel}</span>
        </div>
        <p>{getRunOutcomeSummary(item, tChat)}</p>
      </article>
    )
  }

  if (item.kind === "raw-fallback") {
    return (
      <article className="chat-message raw" key={item.id} data-testid="chat-raw-fallback">
        <div className="chat-message-meta">
          <span>{tChat("render.raw-fallback")}</span>
          <span>{item.eventType}</span>
        </div>
        <p>{item.summary}</p>
        {renderChatInlineActions(tChat, reviewDiff)}
        {renderRawDetails(item.rawDetails, tChat)}
      </article>
    )
  }

  const statusLabel = item.status
    ? tCommon(`state.${item.status}`, { defaultValue: item.status })
    : tChat("render.system-summary")

  return (
    <article
      className={`chat-message system ${item.status ? getRunStatusTone(item.status) : "idle"}`}
      key={item.id}
      data-testid="chat-system-summary"
    >
      <div className="chat-message-meta">
        <span>{tChat("role.system")}</span>
        <span>{statusLabel}</span>
      </div>
      <p>{item.summary}</p>
      {renderChatInlineActions(tChat, reviewDiff)}
      {renderRawDetails(item.rawDetails, tChat)}
    </article>
  )
}

const compareTimestamp = (left: string, right: string) => {
  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return right.localeCompare(left)
  }

  return rightTime - leftTime
}

const getDefaultCompareTarget = (
  activeConversation: ConversationSummary | null,
  candidates: ConversationSummary[]
) => {
  if (!activeConversation || candidates.length === 0) {
    return null
  }

  return [...candidates].sort((left, right) =>
    compareTimestamp(left.updatedAt, right.updatedAt) ||
    compareTimestamp(left.createdAt, right.createdAt) ||
    left.title.localeCompare(right.title)
  )[0] ?? null
}

const getLatestSystemSummary = (timeline: ConversationTimeline | null) => {
  if (!timeline) {
    return null
  }

  return [...buildChatRenderItems(timeline)]
    .reverse()
    .find((item): item is SystemSummaryRenderItem => item.kind === "system-summary") ?? null
}

const readPayloadString = (value: unknown) => typeof value === "string" && value.trim().length > 0 ? value.trim() : null
const readPayloadNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null

const projectFilesMatchTarget = (
  projectFiles: InspectorProjectFiles | null,
  target: InspectorProjectFilesTarget | null
) => {
  if (!projectFiles || !target) {
    return false
  }

  if (target.kind === "conversation") {
    return "conversationId" in projectFiles && projectFiles.conversationId === target.conversationId
  }

  return "projectId" in projectFiles &&
    projectFiles.projectId === target.projectId &&
    projectFiles.worktreeId === target.worktreeId
}

const hasCollapsedProjectFileAncestor = (path: string, collapsedDirectories: Set<string>) => {
  const segments = path.split("/").filter(Boolean)
  for (let index = 1; index < segments.length; index += 1) {
    if (collapsedDirectories.has(segments.slice(0, index).join("/"))) {
      return true
    }
  }
  return false
}

const getProjectFileParentPath = (path: string) => {
  const segments = path.split("/").filter(Boolean)
  return segments.slice(0, -1).join("/")
}

const isProjectFileDescendantOf = (path: string, directoryPath: string) =>
  directoryPath.length > 0 && path.startsWith(`${directoryPath}/`)

const compareProjectFileSiblings = (left: ProjectFileTreeItem, right: ProjectFileTreeItem) => {
  if (left.kind !== right.kind) {
    return left.kind === "directory" ? -1 : 1
  }
  return left.name.localeCompare(right.name)
}

const sortProjectFilesForTree = (files: ProjectFileTreeItem[]) => {
  const childrenByParent = new Map<string, ProjectFileTreeItem[]>()
  for (const file of files) {
    const parentPath = getProjectFileParentPath(file.path)
    childrenByParent.set(parentPath, [
      ...(childrenByParent.get(parentPath) ?? []),
      file
    ])
  }

  const sorted: ProjectFileTreeItem[] = []
  const seen = new Set<string>()
  const appendChildren = (parentPath: string) => {
    const children = childrenByParent.get(parentPath) ?? []
    for (const child of [...children].sort(compareProjectFileSiblings)) {
      if (seen.has(child.path)) {
        continue
      }
      seen.add(child.path)
      sorted.push(child)
      if (child.kind === "directory") {
        appendChildren(child.path)
      }
    }
  }

  appendChildren("")

  const orphaned = files
    .filter((file) => !seen.has(file.path))
    .sort((left, right) => {
      const leftParent = getProjectFileParentPath(left.path)
      const rightParent = getProjectFileParentPath(right.path)
      if (leftParent === rightParent) {
        return compareProjectFileSiblings(left, right)
      }
      return left.path.localeCompare(right.path)
    })
  return [...sorted, ...orphaned]
}

const mergeProjectFileDirectory = (
  current: InspectorProjectFiles,
  next: InspectorProjectFiles
): InspectorProjectFiles => {
  if (next.directoryPath === "") {
    return next
  }

  const previousDirectChildren = current.files.filter((file) =>
    getProjectFileParentPath(file.path) === next.directoryPath
  )
  const nextDirectChildPaths = new Set(next.files.map((file) => file.path))
  const removedDirectChildren = previousDirectChildren
    .filter((file) => !nextDirectChildPaths.has(file.path))
    .map((file) => file.path)

  const mergedByPath = new Map<string, ProjectFileTreeItem>()
  for (const file of current.files) {
    const isReplacedDirectChild = getProjectFileParentPath(file.path) === next.directoryPath
    const isRemovedDescendant = removedDirectChildren.some((removedPath) =>
      file.path === removedPath || isProjectFileDescendantOf(file.path, removedPath)
    )
    if (!isReplacedDirectChild && !isRemovedDescendant) {
      mergedByPath.set(file.path, file)
    }
  }
  for (const file of next.files) {
    mergedByPath.set(file.path, file)
  }

  return {
    ...current,
    worktreeRootPath: next.worktreeRootPath,
    files: sortProjectFilesForTree([...mergedByPath.values()]),
    truncated: current.truncated || next.truncated,
    checkedAt: next.checkedAt
  }
}

const getDefaultCollapsedProjectFileDirectories = (files: InspectorProjectFiles["files"]) => {
  return new Set(
    files
      .filter((file) =>
        file.kind === "directory" &&
        !file.isSymlink
      )
      .map((file) => file.path)
  )
}

const getChangedFileLabel = (value: unknown) => {
  if (typeof value === "string") {
    return readPayloadString(value)
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const name =
    readPayloadString(record.path) ??
    readPayloadString(record.file) ??
    readPayloadString(record.name) ??
    readPayloadString(record.title)
  const status = readPayloadString(record.status) ?? readPayloadString(record.changeType)

  return name ? [name, status].filter(Boolean).join(" · ") : null
}

const artifactCanDescribeFiles = (artifact: ArtifactSummary) =>
  artifact.kind === "changed-files" || artifact.kind === "diff" || artifact.kind === "summary"

const getGitIdentityLabel = (
  identity: ConversationGitStatus["identity"],
  tInspector: (key: string, opts?: Record<string, unknown>) => string
) => {
  if (identity.name && identity.email) {
    return `${identity.name} <${identity.email}>`
  }

  if (identity.name) {
    return identity.name
  }

  if (identity.email) {
    return identity.email
  }

  return tInspector("git.identity.unset")
}

const getGitIdentitySourceLabel = (
  source: ConversationGitStatus["identity"]["source"],
  tInspector: (key: string, opts?: Record<string, unknown>) => string
) => {
  if (source === "local") {
    return tInspector("git.identity.source.local")
  }

  if (source === "global") {
    return tInspector("git.identity.source.global")
  }

  return tInspector("git.identity.source.unset")
}

const isInspectorGitUnavailableCode = (code: string) =>
  code === "GIT_NOT_INSTALLED" || code === "GIT_STATUS_FAILED" || code === "WORKTREE_NOT_FOUND"

const findConversationChangeByPath = (
  snapshot: ConversationChangesSnapshot,
  filePath: string
): InspectorChangeSelection | null => {
  if (snapshot.unstaged.some((file) => file.path === filePath)) {
    return { area: "unstaged", filePath }
  }
  if (snapshot.staged.some((file) => file.path === filePath)) {
    return { area: "staged", filePath }
  }
  return null
}

const conversationChangesSnapshotHasSelection = (
  snapshot: ConversationChangesSnapshot,
  selection: InspectorChangeSelection
) => snapshot[selection.area].some((file) => file.path === selection.filePath)

const conversationChangesScopesMatch = (
  left: ConversationChangesMutationScope,
  right: ConversationChangesMutationScope
) => left.type === right.type &&
  (left.type === "all" || (right.type === "file" && left.filePath === right.filePath))

const getChangedFileItems = (
  timeline: ConversationTimeline | null,
  tShell: (key: string, opts?: Record<string, unknown>) => string
) => {
  if (!timeline) {
    return []
  }

  const items: string[] = []

  for (const artifact of timeline.artifacts.filter(artifactCanDescribeFiles)) {
    const changedFiles = artifact.payload.changedFiles
    const files = artifact.payload.files
    const fileCount = readPayloadNumber(artifact.payload.fileCount)
    const diffSummary = readPayloadString(artifact.payload.diffSummary)

    if (Array.isArray(changedFiles)) {
      items.push(...changedFiles.map(getChangedFileLabel).filter((item): item is string => Boolean(item)))
    } else {
      const count = readPayloadNumber(changedFiles)
      if (count !== null) {
        items.push(tShell("compare.files.count", { count }))
      }
    }

    if (Array.isArray(files)) {
      items.push(...files.map(getChangedFileLabel).filter((item): item is string => Boolean(item)))
    }

    if (fileCount !== null) {
      items.push(tShell("compare.files.count", { count: fileCount }))
    }

    if (diffSummary) {
      items.push(diffSummary)
    }
  }

  return Array.from(new Set(items))
}

const getCompareSummaryCopy = (
  timeline: ConversationTimeline | null,
  timelineStatus: CompareTimelineStatus,
  tShell: (key: string, opts?: Record<string, unknown>) => string,
  tCommon: (key: string, opts?: Record<string, unknown>) => string
) => {
  if (timelineStatus === "loading") {
    return tShell("compare.summary.loading")
  }

  if (timelineStatus === "error") {
    return tShell("compare.summary.error")
  }

  const summary = getLatestSystemSummary(timeline)
  if (!summary) {
    return tShell("compare.summary.empty")
  }

  const status = summary.status
    ? tCommon(`state.${summary.status}`, { defaultValue: summary.status })
    : null
  return [status, summary.summary].filter(Boolean).join(" · ")
}

const AddCustomModelDialog = ({
  open,
  providerKind,
  onClose,
  onSubmit
}: {
  open: boolean
  providerKind: ProviderKind | null
  onClose: () => void
  onSubmit: (input: AddCustomModelInput) => Promise<void>
}) => {
  const { t } = useTranslation("shell")
  const [id, setId] = useState("")
  const [label, setLabel] = useState("")
  const [detail, setDetail] = useState("")
  const [busy, setBusy] = useState(false)

  if (!open || !providerKind) return null

  const handleConfirm = async () => {
    const trimmedId = id.trim()
    if (!trimmedId) return
    setBusy(true)
    try {
      await onSubmit({ providerKind, id: trimmedId, label: label.trim() || undefined, detail: detail.trim() || undefined })
      setId("")
      setLabel("")
      setDetail("")
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="model-picker__dialog" role="dialog" aria-modal="true">
      <div className="model-picker__dialog-inner">
        <h3>{t("modelPicker.dialog.title")}</h3>
        <label className="model-picker__dialog-field">
          {t("modelPicker.dialog.idLabel")}
          <input
            type="text"
            value={id}
            placeholder={t("modelPicker.dialog.idPlaceholder")}
            onChange={(event) => setId(event.target.value)}
          autoFocus
          />
        </label>
        <label className="model-picker__dialog-field">
          {t("modelPicker.dialog.labelLabel")}
          <input type="text" value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="model-picker__dialog-field">
          {t("modelPicker.dialog.detailLabel")}
          <input type="text" value={detail} onChange={(event) => setDetail(event.target.value)} />
        </label>
        <div className="model-picker__dialog-actions">
          <button type="button" onClick={onClose} disabled={busy}>{t("modelPicker.dialog.cancel")}</button>
          <button type="button" onClick={() => void handleConfirm()} disabled={busy || !id.trim()}>{t("modelPicker.dialog.confirm")}</button>
        </div>
      </div>
    </div>
  )
}

const CommandSelect = ({
  testId,
  label,
  value,
  placeholder,
  options,
  disabled,
  open,
  leadingIcon,
  leadingIconTestId,
  popoverPlacement = "bottom",
  onToggle,
  onSelect
}: {
  testId: string
  label: string
  value: LauncherSelectOption | null
  placeholder: string
  options: LauncherSelectOption[]
  disabled?: boolean
  open: boolean
  leadingIcon?: ReactNode
  leadingIconTestId?: string
  popoverPlacement?: "bottom" | "top"
  onToggle: () => void
  onSelect: (option: LauncherSelectOption) => void
}) => (
  <div className={`command-select is-placement-${popoverPlacement}${disabled ? " is-disabled" : ""}${open ? " is-open" : ""}`}>
    <button
      className={`command-select-trigger${leadingIcon ? " has-leading-icon" : ""}`}
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      data-testid={`${testId}-trigger`}
    >
      {leadingIcon ? (
        <span className="command-select-leading-icon" aria-hidden="true" data-testid={leadingIconTestId}>
          {leadingIcon}
        </span>
      ) : null}
      <span className="command-select-copy">
        <span className="command-select-label">{label}</span>
        <span className={`command-select-value${value ? "" : " is-placeholder"}`}>
          {value ? value.label : placeholder}
        </span>
        {value?.detail ? <span className="command-select-detail">{value.detail}</span> : null}
      </span>
      <FontAwesomeIcon className="command-select-chevron" icon={faChevronDown} />
    </button>

    {open ? (
      <div className={`command-select-popover is-placement-${popoverPlacement}`} role="listbox" aria-label={label} data-testid={`${testId}-popover`}>
        {options.map((option) => (
          <button
            key={option.id}
            className={`command-select-option${option.disabled ? " is-disabled" : ""}${value?.id === option.id ? " is-selected" : ""}`}
            type="button"
            disabled={option.disabled}
            onClick={() => onSelect(option)}
            data-testid={`${testId}-option-${option.id}`}
          >
            <div className="command-select-option-copy">
              <strong>{option.label}</strong>
              {option.detail ? <span>{option.detail}</span> : null}
            </div>
            <div className="command-select-option-meta">
              {option.meta ? <span>{option.meta}</span> : null}
              {value?.id === option.id ? <FontAwesomeIcon icon={faCheck} /> : null}
            </div>
          </button>
        ))}
      </div>
    ) : null}
  </div>
)

export const DesktopShell = () => {
  const { t: tShell, i18n } = useTranslation("shell")
  const { t: tChat } = useTranslation("chat")
  const { t: tInspector } = useTranslation("inspector")
  const { t: tCommon } = useTranslation("common")
  const { t: tErrors } = useTranslation("errors")
  const { t: tProvider } = useTranslation("provider")
  const { t: tSettings } = useTranslation("settings")
  const { resolved: resolvedTheme } = useTheme()
  const displayLocale = i18n.resolvedLanguage ?? i18n.language
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [selectedProviderKind, setSelectedProviderKind] = useState<ProviderKind | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string>("")
  const [availableWorktrees, setAvailableWorktrees] = useState<WorktreeSummary[]>([])
  const [selectedWorktreeTarget, setSelectedWorktreeTarget] = useState<WorktreeTargetKind | null>(null)
  const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(null)
  const [newWorktreeBranch, setNewWorktreeBranch] = useState("")
  const [launcherErrorMessage, setLauncherErrorMessage] = useState("")
  const [openSelectId, setOpenSelectId] = useState<"provider" | "model" | "worktree" | null>(null)
  const [composerModelMenuOpen, setComposerModelMenuOpen] = useState(false)
  const [composerAccessModeMenuOpen, setComposerAccessModeMenuOpen] = useState(false)
  const [composerDraft, setComposerDraft] = useState("")
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachmentDraft[]>([])
  const [pendingComposerSubmission, setPendingComposerSubmission] = useState<PendingComposerSubmission | null>(null)
  const [composerAttachmentError, setComposerAttachmentError] = useState<string | null>(null)
  const [composerCommandMessage, setComposerCommandMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null)
  const [slashCommandActiveIndex, setSlashCommandActiveIndex] = useState(0)
  const [slashCommandDismissedDraft, setSlashCommandDismissedDraft] = useState<string | null>(null)
  const [isReadingComposerAttachments, setIsReadingComposerAttachments] = useState(false)
  const [imagePreview, setImagePreview] = useState<ImagePreviewTarget | null>(null)
  const [projectWorktrees, setProjectWorktrees] = useState<ProjectWorktreeSummary[]>([])
  const [externalOpenOptions, setExternalOpenOptions] = useState<ExternalOpenOption[]>([])
  const [externalOpenMenuOpen, setExternalOpenMenuOpen] = useState(false)
  const [externalOpenPendingAppId, setExternalOpenPendingAppId] = useState<ExternalOpenAppId | null>(null)
  const [defaultExternalOpenAppId, setDefaultExternalOpenAppId] = useState<ExternalOpenAppId>("finder")
  const [externalOpenMessage, setExternalOpenMessage] = useState<{ tone: "error"; text: string } | null>(null)
  const [compareModeOpen, setCompareModeOpen] = useState(false)
  const [compareTargetConversationId, setCompareTargetConversationId] = useState<string | null>(null)
  const [compareTimeline, setCompareTimeline] = useState<ConversationTimeline | null>(null)
  const [compareTimelineStatus, setCompareTimelineStatus] = useState<CompareTimelineStatus>("idle")
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>("files")
  const [inspectorFocusMode, setInspectorFocusMode] = useState<InspectorFocusMode>("follow")
  const [pinnedInspectorContext, setPinnedInspectorContext] = useState<PinnedInspectorContext | null>(null)
  const [conversationChanges, setConversationChanges] = useState<ConversationChangesSnapshot | null>(null)
  const [conversationChangesStateConversationId, setConversationChangesStateConversationId] = useState<string | null>(null)
  const [conversationChangesLoadState, setConversationChangesLoadState] = useState<InspectorChangesLoadState>("idle")
  const [conversationChangesError, setConversationChangesError] = useState<string | null>(null)
  const [conversationChangesStale, setConversationChangesStale] = useState(false)
  const [selectedConversationChange, setSelectedConversationChange] = useState<InspectorChangeSelection | null>(null)
  const [conversationChangesPendingWorktreeIds, setConversationChangesPendingWorktreeIds] = useState<Set<string>>(() => new Set())
  const [conversationChangesCommitDraft, setConversationChangesCommitDraft] = useState<InspectorChangesCommitDraft | null>(null)
  const [conversationGitStatus, setConversationGitStatus] = useState<ConversationGitStatus | null>(null)
  const [conversationGitStatusLoadState, setConversationGitStatusLoadState] = useState<InspectorGitStatusLoadState>("idle")
  const [conversationGitStatusError, setConversationGitStatusError] = useState<string | null>(null)
  const [conversationGitStatusRefreshKey, setConversationGitStatusRefreshKey] = useState(0)
  const [gitCommitScope, setGitCommitScope] = useState<GitCommitScope>(DEFAULT_GIT_COMMIT_SCOPE)
  const [selectedGitRemoteName, setSelectedGitRemoteName] = useState<string | null>(null)
  const [conversationProjectFiles, setConversationProjectFiles] = useState<InspectorProjectFiles | null>(null)
  const [conversationProjectFilesLoadState, setConversationProjectFilesLoadState] = useState<InspectorProjectFilesLoadState>("idle")
  const [conversationProjectFilesError, setConversationProjectFilesError] = useState<string | null>(null)
  const [collapsedProjectFileDirectories, setCollapsedProjectFileDirectories] = useState<Set<string>>(new Set())
  const [loadedProjectFileDirectories, setLoadedProjectFileDirectories] = useState<Set<string>>(new Set())
  const [projectTreeViewport, setProjectTreeViewport] = useState({ scrollTop: 0, height: PROJECT_FILE_VIEWPORT_FALLBACK_HEIGHT, listTop: 0 })
  const [projectFileContextMenu, setProjectFileContextMenu] = useState<ProjectFileContextMenuState | null>(null)
  const [projectFileInlineEdit, setProjectFileInlineEdit] = useState<ProjectFileInlineEditState | null>(null)
  const [pendingProjectFileDelete, setPendingProjectFileDelete] = useState<ProjectFileTreeItem | null>(null)
  const [inspectorHandoffMessage, setInspectorHandoffMessage] = useState<InspectorHandoffMessage | null>(null)
  const [, setInspectorHandoffPending] = useState<HandoffRequestState | null>(null)
  const [terminalPanelState, setTerminalPanelState] = useState<TerminalPanelState>({
    session: null,
    status: "idle",
    message: null,
    conversationId: null
  })
  const [isCustomModelDialogOpen, setIsCustomModelDialogOpen] = useState(false)
  const [projectMenu, setProjectMenu] = useState<ProjectContextMenuState | null>(null)
  const [conversationMenu, setConversationMenu] = useState<{ conversationId: string; x: number; y: number } | null>(null)
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [pendingConversationDelete, setPendingConversationDelete] = useState<ConversationSummary | null>(null)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [expandedConversationProjects, setExpandedConversationProjects] = useState<Set<string>>(new Set())
  const [dismissedPermissionRequestIds, setDismissedPermissionRequestIds] = useState<Set<string>>(new Set())
  const [fileEditorState, setFileEditorState] = useState<ConversationFileEditorState>(() => createEmptyConversationFileEditorState())
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null)
  const composerAttachmentInputRef = useRef<HTMLInputElement | null>(null)
  const composerAccessModeMenuRef = useRef<HTMLDivElement | null>(null)
  const composerModelMenuRef = useRef<HTMLDivElement | null>(null)
  const composerSlashMenuRef = useRef<HTMLDivElement | null>(null)
  const externalOpenMenuRef = useRef<HTMLDivElement | null>(null)
  const currentProjectIdRef = useRef<string | null>(null)
  const projectWorktreeRequestRef = useRef(0)
  const compareTimelineRequestRef = useRef(0)
  const conversationGitStatusRequestRef = useRef(0)
  const conversationChangesRequestRef = useRef(0)
  const conversationChangesMutationRequestRef = useRef(0)
  const conversationChangesMutationPendingByWorktreeRef = useRef<Map<string, InspectorChangesMutationPending>>(new Map())
  const conversationChangesInFlightRef = useRef<Map<string, ConversationChangesInFlight>>(new Map())
  const conversationChangesRefreshRef = useRef<(
    conversationId: string,
    source?: ConversationChangesRefreshSource
  ) => Promise<void>>(async () => undefined)
  const conversationChangesContextRef = useRef({ conversationId: null as string | null, pinned: false, tab: "files" as InspectorTab })
  const conversationChangesSnapshotRef = useRef<ConversationChangesSnapshot | null>(null)
  const conversationChangesPresentationRef = useRef({
    loadState: "idle" as InspectorChangesLoadState,
    error: null as string | null,
    stale: false
  })
  const selectedConversationChangeRef = useRef<InspectorChangeSelection | null>(null)
  const conversationChangeSelectionIntentVersionRef = useRef(0)
  const preferredConversationChangePathRef = useRef<{
    conversationId: string
    filePath: string
    targetArea: ConversationChangeArea | null
    intentVersion: number
    minimumRequestId: number
  } | null>(null)
  const conversationProjectFilesRequestRef = useRef(0)
  const pendingProjectFileDirectoriesRef = useRef<Set<string>>(new Set())
  const projectFileDirectoryRequestSeqRef = useRef<Map<string, number>>(new Map())
  const handoffRequestRef = useRef(0)
  const terminalRequestRef = useRef(0)
  const inspectorStackPanelRef = useRef<HTMLDivElement | null>(null)
  const projectTreeListRef = useRef<HTMLDivElement | null>(null)
  const terminalContainerRef = useRef<HTMLDivElement | null>(null)
  const terminalInstanceRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const pendingConversationDeleteCancelRef = useRef<HTMLButtonElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const projectFileInlineInputRef = useRef<HTMLInputElement | null>(null)
  const inspectedConversationIdRef = useRef<string | null>(null)
  const chatScrollAnchorRef = useRef<HTMLDivElement | null>(null)
  const chatAutoScrollEnabledRef = useRef(true)
  const chatConversationIdRef = useRef<string | null>(null)
  const composerConversationIdRef = useRef<string | null>(null)
  const composerAttachmentReadRequestRef = useRef(0)
  const composerAttachmentReadingRef = useRef(false)
  const composerSubmissionRequestRef = useRef(0)
  const composerSubmissionPendingRef = useRef(false)

  const resetProjectFileDirectoryRequests = useCallback(() => {
    pendingProjectFileDirectoriesRef.current.clear()
    projectFileDirectoryRequestSeqRef.current.clear()
  }, [])

  const {
    context,
    conversationTimeline,
    conversationTimelineHasMore,
    conversationTimelineStatus,
    currentConversation,
    currentProject,
    createConversation,
    importProject,
    isBusy,
    isLoadingOlderTimeline,
    listProjectWorktrees,
    listWorktreesByProject,
    loadOlderConversationTimeline,
    loadProviderModels,
    moveProject,
    removeProject,
    revealProjectInFinder,
    notice,
    providerModelsByKind,
    projectSummaries,
    renameConversation,
    deleteConversation,
    selectConversation,
    selectProject,
    sendConversationMessage,
    deleteQueuedConversationMessage,
    retryConversationRunWithPermissions,
    cancelConversationRun,
    setConversationModel,
    setConversationAccessMode,
    addCustomModel,
    removeCustomModel
  } = useShellContext()

  const providerReadiness = useProviderReadiness()
  const hasProjects = projectSummaries.length > 0
  const activeConversation = currentConversation ?? null
  composerConversationIdRef.current = activeConversation?.id ?? null
  const resolveConversationSummary = useCallback((conversationId: string) => {
    const candidates = [
      activeConversation,
      pinnedInspectorContext?.conversation ?? null,
      ...(currentProject?.conversations ?? [])
    ]

    return candidates.find((conversation): conversation is ConversationSummary =>
      conversation !== null && conversation.id === conversationId
    ) ?? null
  }, [activeConversation, currentProject?.conversations, pinnedInspectorContext?.conversation])
  useEffect(() => {
    if (pinnedInspectorContext?.conversation.id) {
      return
    }
    setFileEditorState((current) => resetConversationFileTabsForConversation(current, activeConversation?.id ?? null))
  }, [activeConversation?.id, pinnedInspectorContext?.conversation.id])
  const availableExternalOpenOptions = useMemo(
    () => externalOpenOptions.filter((option) => option.isAvailable),
    [externalOpenOptions]
  )
  const resolvedDefaultExternalOpenOption = useMemo(
    () =>
      availableExternalOpenOptions.find((option) => option.id === defaultExternalOpenAppId) ??
      availableExternalOpenOptions.find((option) => option.id === "finder") ??
      availableExternalOpenOptions[0] ??
      null,
    [availableExternalOpenOptions, defaultExternalOpenAppId]
  )
  const externalOpenGroups = useMemo(() => {
    const groups: Array<{ id: ExternalOpenOption["group"]; label: string; options: ExternalOpenOption[] }> = [
      { id: "system", label: tShell("header.open-location-group.system"), options: [] },
      { id: "terminal", label: tShell("header.open-location-group.terminal"), options: [] },
      { id: "ide", label: tShell("header.open-location-group.ide"), options: [] }
    ]
    return groups
      .map((group) => ({
        ...group,
        options: availableExternalOpenOptions.filter((option) => option.group === group.id)
      }))
      .filter((group) => group.options.length > 0)
  }, [availableExternalOpenOptions, tShell])
  const activeProviderKind = (activeConversation?.provider.kind ?? null) as ProviderKind | null
  const activeProviderReadiness = activeConversation
    ? providerReadiness.snapshot.providers.find((provider) => provider.kind === activeProviderKind) ??
      getConversationProviderReadinessFallback(activeConversation)
    : null
  const activeProviderBoundaryCopy = activeProviderReadiness ? getProviderBoundaryCopy(activeProviderReadiness) : null
  const isComposerProviderBlocked = Boolean(activeConversation && activeProviderReadiness && activeProviderReadiness.availability !== "ready")
  const activeProviderIssueParams = activeProviderReadiness?.issues[0]?.params ?? {}
  const currentProjectId = currentProject?.id ?? null
  const isProjectConversationLandingState = Boolean(currentProject && !activeConversation)
  const activeTimeline = activeConversation && conversationTimeline?.conversationId === activeConversation.id
    ? conversationTimeline
    : null
  const activeTimelineArtifactFingerprint = useMemo(
    () => activeInspectorTab === "git" && activeTimeline
      ? activeTimeline.artifacts
          .map((artifact) => `${artifact.id}:${artifact.runId ?? ""}:${artifact.createdAt}:${JSON.stringify(artifact.payload)}`)
          .join("|")
      : "",
    [activeInspectorTab, activeTimeline]
  )
  const activeTimelineStatus = activeConversation ? conversationTimelineStatus : "idle"
  const activeQueuedMessages = activeTimeline?.queuedMessages ?? []
  const activeInspectorDiffBlocks = useMemo(() => getInspectorDiffBlocks(activeTimeline), [activeTimeline])
  const compareCandidates = useMemo(
    () => currentProject && activeConversation
      ? currentProject.conversations.filter((conversation) => conversation.id !== activeConversation.id)
      : [],
    [activeConversation, currentProject]
  )
  const defaultCompareTarget = useMemo(
    () => getDefaultCompareTarget(activeConversation, compareCandidates),
    [activeConversation, compareCandidates]
  )
  const compareTargetConversation = useMemo(
    () => compareCandidates.find((conversation) => conversation.id === compareTargetConversationId) ??
      defaultCompareTarget,
    [compareCandidates, compareTargetConversationId, defaultCompareTarget]
  )
  const canCompareConversations = Boolean(activeConversation && compareCandidates.length > 0)
  const compareTargetTimeline = compareTimeline?.conversationId === compareTargetConversation?.id
    ? compareTimeline
    : null
  const persistedChatRenderItems = useMemo(
    () => activeTimeline ? buildChatRenderItems(activeTimeline) : [],
    [activeTimeline]
  )
  const activePendingComposerSubmission = pendingComposerSubmission?.conversationId === activeConversation?.id
    ? pendingComposerSubmission
    : null
  const chatRenderItems = useMemo(() => {
    if (!activePendingComposerSubmission?.startsRun) {
      return persistedChatRenderItems
    }

    const knownMessageIds = new Set(activePendingComposerSubmission.knownMessageIds)
    const knownRunIds = new Set(activePendingComposerSubmission.knownRunIds)
    const hasPersistedUserMessage = activeTimeline?.messages.some((message) =>
      message.role === "user" &&
      !knownMessageIds.has(message.id) &&
      message.content === activePendingComposerSubmission.content &&
      message.createdAt >= activePendingComposerSubmission.createdAt
    ) ?? false
    const hasPersistedRun = activeTimeline?.runs.some((run) =>
      !knownRunIds.has(run.id) && run.startedAt >= activePendingComposerSubmission.createdAt
    ) ?? false
    const hasLiveProviderFeedback = persistedChatRenderItems.some((item) =>
      (item.kind === "provider-activity" && (item.phase === "starting" || item.phase === "running")) ||
      (item.kind === "provider-message" && item.isRunning) ||
      (item.kind === "provider-context" && item.isRunning)
    )
    const optimisticItems: ChatRenderItem[] = []

    if (!hasPersistedUserMessage) {
      optimisticItems.push({
        kind: "user-message",
        id: `pending-user-${activePendingComposerSubmission.requestId}`,
        runId: null,
        createdAt: activePendingComposerSubmission.createdAt,
        content: activePendingComposerSubmission.content,
        attachments: activePendingComposerSubmission.attachments.map((attachment) => {
          const isImage = attachment.mimeType.startsWith("image/")
          return {
            id: `pending-attachment-${attachment.draftId}`,
            kind: isImage ? "image" : "file",
            name: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            uri: isImage
              ? attachment.previewUri ?? `data:${attachment.mimeType};base64,${attachment.dataBase64}`
              : ""
          }
        }),
        model: activePendingComposerSubmission.model
      })
    }

    if (!hasPersistedRun && !hasLiveProviderFeedback) {
      optimisticItems.push({
        kind: "provider-activity",
        id: `pending-activity-${activePendingComposerSubmission.requestId}`,
        runId: null,
        createdAt: activePendingComposerSubmission.createdAt,
        displayClass: "tool_activity",
        phase: "starting",
        activityKind: "provider",
        label: "provider",
        detail: null,
        eventCount: 0,
        steps: [],
        details: []
      })
    }

    return [...persistedChatRenderItems, ...optimisticItems]
  }, [activePendingComposerSubmission, activeTimeline, persistedChatRenderItems])
  const chatScrollSignature = useMemo(() => {
    if (!activeConversation) {
      return ""
    }

    const lastItem = chatRenderItems.at(-1)
    const latestProviderMessage = [...chatRenderItems].reverse().find((item) => item.kind === "provider-message")
    const latestProviderActivity = [...chatRenderItems].reverse().find((item) => item.kind === "provider-activity")

    return [
      activeConversation.id,
      activeConversation.runStatus ?? "no-run-status",
      lastItem ? [lastItem.kind, lastItem.id, "content" in lastItem ? lastItem.content : "", "summary" in lastItem ? lastItem.summary : ""].join(":") : "empty",
      latestProviderMessage ? [latestProviderMessage.id, latestProviderMessage.content, latestProviderMessage.eventIds.join(",")].join(":") : "no-provider",
      latestProviderActivity
        ? [
            latestProviderActivity.id,
            latestProviderActivity.phase,
            latestProviderActivity.activityKind,
            latestProviderActivity.detail ?? "",
            latestProviderActivity.eventCount
          ].join(":")
        : "no-activity"
    ].join("|")
  }, [activeConversation, chatRenderItems])
  const activeWorktreeLabelById = useMemo(() => {
    const labels = new Map<string, string>()
    if (currentProject?.defaultWorktree) {
      labels.set(currentProject.defaultWorktree.id, currentProject.defaultWorktree.branch ?? getShortWorktreeName(currentProject.defaultWorktree.rootPath))
    }
    for (const worktree of projectWorktrees) {
      labels.set(worktree.id, worktree.branch ?? getShortWorktreeName(worktree.rootPath))
    }
    if (activeConversation) {
      labels.set(activeConversation.worktreeId, getConversationWorktreeLabel(activeConversation))
    }
    return labels
  }, [activeConversation, currentProject?.defaultWorktree, projectWorktrees])
  const activeHistorySummary = useMemo(() => {
    if (activeTimelineStatus === "loading") {
      return { status: "loading" as const }
    }

    if (activeTimelineStatus === "error") {
      return { status: "error" as const }
    }

    if (!activeTimeline) {
      return null
    }

    const artifactsByRunId = activeTimeline.artifacts.reduce((counts, artifact) => {
      if (!artifact.runId) {
        return counts
      }

      counts.set(artifact.runId, (counts.get(artifact.runId) ?? 0) + 1)
      return counts
    }, new Map<string, number>())
    const runs = activeTimeline.runs
      .map((run) => ({
        ...run,
        artifactCount: artifactsByRunId.get(run.id) ?? 0,
        worktreeLabel: activeWorktreeLabelById.get(run.worktreeId) ?? run.worktreeId
      }))
    const latestRun = runs.reduce<typeof runs[number] | null>(
      (latest, run) => !latest || compareRunsByTime(latest, run) < 0 ? run : latest,
      null
    )

    return {
      status: "ready" as const,
      runCount: activeTimeline.runs.length,
      artifactCount: activeTimeline.artifacts.length,
      latestRun,
      runs
    }
  }, [activeTimeline, activeTimelineStatus, activeWorktreeLabelById])
  const activeModelOptions = useMemo(
    () => getModelOptions(activeProviderKind, providerModelsByKind),
    [activeProviderKind, providerModelsByKind]
  )
  const activeModelOption = activeModelOptions.find((option) => option.id === activeConversation?.currentModel) ?? null
  const activeAccessMode = activeConversation?.accessMode ?? DEFAULT_PROVIDER_ACCESS_MODE
  const isActiveRunRunning = activeConversation?.runStatus === "running"
  const isComposerSubmitting = activePendingComposerSubmission !== null
  const isComposerLocked = Boolean(isComposerProviderBlocked && !isActiveRunRunning)
  const hasComposerContent = composerDraft.trim().length > 0 || composerAttachments.length > 0
  const canSubmitComposer = Boolean(
    activeConversation &&
    !isComposerLocked &&
    !isBusy &&
    !isComposerSubmitting &&
    !isReadingComposerAttachments &&
    hasComposerContent
  )
  const canSwitchComposerModel = Boolean(
    activeConversation &&
    !isActiveRunRunning &&
    !isComposerSubmitting &&
    !isComposerProviderBlocked &&
    activeModelOptions.length > 0
  )
  const canSwitchComposerAccessMode = Boolean(
    activeConversation &&
    !isActiveRunRunning &&
    !isComposerSubmitting
  )
  const slashCommandQuery = useMemo(() => {
    const match = composerDraft.match(/^\/([^\s/]*)$/)
    return match ? match[1].toLowerCase() : null
  }, [composerDraft])
  const filteredSlashCommands = useMemo(() => {
    if (!activeProviderKind || slashCommandQuery === null) {
      return []
    }
    const commands = getSlashCommandsForProvider(activeProviderKind)
    if (slashCommandQuery.length === 0) {
      return commands
    }
    return commands.filter((command) => command.name.includes(slashCommandQuery))
  }, [activeProviderKind, slashCommandQuery])
  const isSlashCommandMenuOpen = Boolean(
    activeConversation &&
    slashCommandQuery !== null &&
    slashCommandDismissedDraft !== composerDraft &&
    filteredSlashCommands.length > 0
  )
  useEffect(() => {
    setSlashCommandActiveIndex(0)
  }, [activeProviderKind, slashCommandQuery])
  useEffect(() => {
    if (composerCommandMessage?.tone !== "info") {
      return
    }
    const timeoutId = window.setTimeout(() => {
      setComposerCommandMessage((current) => current === composerCommandMessage ? null : current)
    }, 4_000)
    return () => window.clearTimeout(timeoutId)
  }, [composerCommandMessage])
  const isInspectorPinned = inspectorFocusMode === "pinned" && Boolean(pinnedInspectorContext)
  const inspectedConversation = isInspectorPinned ? pinnedInspectorContext?.conversation ?? null : activeConversation
  const inspectedConversationId = inspectedConversation?.id ?? null
  const inspectedInspectorTab = isInspectorPinned ? pinnedInspectorContext?.tab ?? activeInspectorTab : activeInspectorTab
  const liveChanges = conversationChanges?.conversationId === activeConversation?.id ? conversationChanges : null
  const liveChangesStateMatchesConversation = conversationChangesStateConversationId === activeConversation?.id
  const liveSelectedChange = liveChanges && selectedConversationChange &&
    conversationChangesSnapshotHasSelection(liveChanges, selectedConversationChange)
    ? selectedConversationChange
    : null
  const inspectedChanges = isInspectorPinned ? pinnedInspectorContext?.changesSnapshot ?? null : liveChanges
  const inspectedChangesLoadState = isInspectorPinned
    ? pinnedInspectorContext?.changesLoadState ?? "idle"
    : liveChangesStateMatchesConversation ? conversationChangesLoadState : "idle"
  const inspectedChangesError = isInspectorPinned
    ? pinnedInspectorContext?.changesError ?? null
    : liveChangesStateMatchesConversation ? conversationChangesError : null
  const inspectedChangesStale = isInspectorPinned
    ? pinnedInspectorContext?.changesStale ?? false
    : liveChangesStateMatchesConversation && liveChanges !== null ? conversationChangesStale : false
  const inspectedSelectedChange = isInspectorPinned ? pinnedInspectorContext?.selectedChange ?? null : liveSelectedChange
  const inspectedChangesCommitMessage = conversationChangesCommitDraft?.conversationId === inspectedConversationId
    ? conversationChangesCommitDraft.message
    : ""
  const inspectedChangesPendingMutation = Boolean(
    inspectedConversation && conversationChangesPendingWorktreeIds.has(inspectedConversation.worktree.id)
  )
  const inspectedGitStatus = isInspectorPinned ? pinnedInspectorContext?.gitStatus ?? null : conversationGitStatus
  const inspectedGitStatusLoadState = isInspectorPinned ? pinnedInspectorContext?.gitStatusLoadState ?? "idle" : conversationGitStatusLoadState
  const inspectedGitStatusError = isInspectorPinned ? pinnedInspectorContext?.gitStatusError ?? null : conversationGitStatusError
  const inspectedGitCommitScope = isInspectorPinned
    ? inspectedGitStatus?.commits.scope ?? DEFAULT_GIT_COMMIT_SCOPE
    : gitCommitScope
  const inspectorProjectFilesTarget = useMemo<InspectorProjectFilesTarget | null>(() => {
    if (inspectedConversationId) {
      return { kind: "conversation", conversationId: inspectedConversationId }
    }

    if (!isInspectorPinned && currentProjectId && currentProject?.defaultWorktree?.id) {
      return {
        kind: "worktree",
        projectId: currentProjectId,
        worktreeId: currentProject.defaultWorktree.id
      }
    }

    return null
  }, [currentProject?.defaultWorktree?.id, currentProjectId, inspectedConversationId, isInspectorPinned])
  const inspectedProjectFiles = projectFilesMatchTarget(conversationProjectFiles, inspectorProjectFilesTarget)
    ? conversationProjectFiles
    : null
  const inspectedProjectFilesLoadState = conversationProjectFilesLoadState
  const inspectedProjectFilesError = conversationProjectFilesError
  inspectedConversationIdRef.current = inspectedConversation?.id ?? null
  conversationChangesContextRef.current = {
    conversationId: inspectedConversationId,
    pinned: isInspectorPinned,
    tab: inspectedInspectorTab
  }
  conversationChangesSnapshotRef.current = conversationChanges
  conversationChangesPresentationRef.current = {
    loadState: conversationChangesLoadState,
    error: conversationChangesError,
    stale: conversationChangesStale
  }
  selectedConversationChangeRef.current = selectedConversationChange
  useLayoutEffect(() => {
    const chatScrollAnchor = chatScrollAnchorRef.current
    if (!activeConversation || !chatScrollAnchor) {
      return
    }

    if (chatConversationIdRef.current === activeConversation.id && !chatAutoScrollEnabledRef.current) {
      return
    }

    if (typeof chatScrollAnchor.scrollIntoView === "function") {
      chatScrollAnchor.scrollIntoView({ block: "end" })
    }
    chatAutoScrollEnabledRef.current = true
    chatConversationIdRef.current = activeConversation.id
  }, [activeConversation?.id, chatScrollSignature])
  const selectedGitRemote = inspectedGitStatus?.repository.remotes.find((remote) =>
    remote.name === selectedGitRemoteName
  ) ?? null
  const visibleInspectorProjectFiles = useMemo(
    () => inspectedProjectFiles
      ? inspectedProjectFiles.files.filter((file) => !hasCollapsedProjectFileAncestor(file.path, collapsedProjectFileDirectories))
      : [],
    [collapsedProjectFileDirectories, inspectedProjectFiles]
  )
  const visibleInspectorProjectFileRows = useMemo<ProjectFileRow[]>(() => {
    const rows: ProjectFileRow[] = visibleInspectorProjectFiles.map((file) => ({ kind: "existing", file }))
    if (projectFileInlineEdit?.mode !== "create") {
      return rows
    }

    const parentIndex = rows.findIndex((row) =>
      row.kind === "existing" && row.file.path === projectFileInlineEdit.parentPath
    )
    const inlineRow: ProjectFileRow = {
      kind: "inline-create",
      parentPath: projectFileInlineEdit.parentPath,
      parentDepth: projectFileInlineEdit.parentDepth
    }

    if (parentIndex === -1) {
      return [inlineRow, ...rows]
    }

    return [
      ...rows.slice(0, parentIndex + 1),
      inlineRow,
      ...rows.slice(parentIndex + 1)
    ]
  }, [projectFileInlineEdit, visibleInspectorProjectFiles])
  const projectTreeViewportTop = Math.max(0, projectTreeViewport.scrollTop - projectTreeViewport.listTop)
  const projectTreeViewportHeight = projectTreeViewport.height || PROJECT_FILE_VIEWPORT_FALLBACK_HEIGHT
  const projectTreeVirtualStart = Math.max(
    0,
    Math.floor(projectTreeViewportTop / PROJECT_FILE_ROW_HEIGHT) - PROJECT_FILE_VIRTUAL_OVERSCAN
  )
  const projectTreeVirtualEnd = Math.min(
    visibleInspectorProjectFileRows.length,
    Math.ceil((projectTreeViewportTop + projectTreeViewportHeight) / PROJECT_FILE_ROW_HEIGHT) + PROJECT_FILE_VIRTUAL_OVERSCAN
  )
  const projectTreeVirtualRows = useMemo(
    () => visibleInspectorProjectFileRows
      .slice(projectTreeVirtualStart, projectTreeVirtualEnd)
      .map((row, index) => ({ row, rowIndex: projectTreeVirtualStart + index })),
    [projectTreeVirtualEnd, projectTreeVirtualStart, visibleInspectorProjectFileRows]
  )
  const projectTreeHeight = visibleInspectorProjectFileRows.length * PROJECT_FILE_ROW_HEIGHT
  const projectFileInlineEditFocusKey = projectFileInlineEdit
    ? projectFileInlineEdit.mode === "create"
      ? `create:${projectFileInlineEdit.parentPath}:${projectFileInlineEdit.kind}`
      : `rename:${projectFileInlineEdit.sourcePath}`
    : null
  const inspectorPinnedActiveMismatch = isInspectorPinned &&
    activeConversation &&
    inspectedConversation &&
    activeConversation.id !== inspectedConversation.id
  const inspectorPinnedActiveMismatchCopy = inspectorPinnedActiveMismatch
    ? tInspector("pin.active-mismatch", {
        active: activeConversation.title,
        pinned: inspectedConversation.title
      })
    : ""
  const visibleInspectorHandoffMessage = inspectorHandoffMessage?.tab === inspectedInspectorTab &&
    inspectorHandoffMessage.conversationId === inspectedConversationId
    ? inspectorHandoffMessage
    : null
  const visibleTerminalPanelState: TerminalPanelState = terminalPanelState.conversationId === inspectedConversation?.id
    ? terminalPanelState
    : {
        session: null,
        status: "idle",
        message: null,
        conversationId: inspectedConversation?.id ?? null
      }
  const visibleTerminalSessionId = visibleTerminalPanelState.session?.sessionId ?? null
  const visibleTerminalStatus = visibleTerminalPanelState.status
  const canPinInspectorContext = Boolean(activeConversation) && !inspectedChangesPendingMutation && (
    activeInspectorTab === "terminal" ||
    (activeInspectorTab === "files" && conversationProjectFilesLoadState === "ready") ||
    (activeInspectorTab === "changes" && conversationChanges !== null &&
      conversationChanges.conversationId === activeConversation?.id &&
      conversationChangesLoadState !== "loading" &&
      (conversationChangesLoadState === "ready" || conversationChangesStale)) ||
    (activeInspectorTab === "git" && conversationGitStatusLoadState === "ready")
  )
  const activeProviderLabel = getProviderLabel(activeProviderKind, tProvider)
  const activeModelBoundaryCopy = activeConversation && isComposerProviderBlocked
    ? tShell("composer.model.provider-required", { provider: activeProviderLabel })
    : ""
  const composerModelLabel = activeConversation
    ? activeModelOption
      ? getProviderModelLabel(activeProviderKind, activeModelOption, tShell)
      : activeConversation.currentModel ?? tChat("composer.model.placeholder")
    : tChat("composer.model.disabled")
  const currentWorktreeLabel = getCurrentWorktreeLabel(
    activeConversation,
    currentProject,
    context.shell.worktreeBranch,
    context.shell.worktreePath
  )
  const currentWorktreePath =
    activeConversation?.worktree.rootPath ?? currentProject?.defaultWorktree.rootPath ?? context.shell.worktreePath ?? ""
  const currentWorktreePathDisplay = currentWorktreePath
    ? formatMiddleEllipsis(currentWorktreePath)
    : tShell("shell.default-worktree")

  const shellProjectDisplay = context.shell.projectName ?? tShell("shell.no-project")
  const shellConversationDisplay = context.shell.conversationTitle ??
    (context.shell.hasProjects
      ? context.shell.hasConversations
        ? tShell("shell.select-conversation")
        : tShell("shell.no-conversations")
      : tShell("shell.start-conversation"))
  const shellProviderDisplay = getProviderLabel(context.shell.providerKind, tProvider)
  const shellRunStatusDisplay = context.shell.runStatus
    ? tCommon(`state.${context.shell.runStatus}`, { defaultValue: context.shell.runStatus })
    : tCommon("state.idle")
  const composerPlaceholder = tChat("placeholder.input", {
    provider: activeConversation
      ? getProviderLabel(activeConversation.provider.kind, tProvider)
      : tProvider("badge.not-selected")
  })
  useEffect(() => {
    if (isActiveRunRunning || isComposerProviderBlocked) {
      setComposerModelMenuOpen(false)
    }
  }, [isActiveRunRunning, isComposerProviderBlocked])

  const handleChatStreamScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    chatAutoScrollEnabledRef.current = distanceToBottom < 80
  }, [])

  const updateProjectTreeViewport = useCallback(() => {
    const scrollContainer = inspectorStackPanelRef.current
    if (!scrollContainer) {
      return
    }

    const nextViewport = {
      scrollTop: scrollContainer.scrollTop,
      height: scrollContainer.clientHeight || PROJECT_FILE_VIEWPORT_FALLBACK_HEIGHT,
      listTop: projectTreeListRef.current?.offsetTop ?? 0
    }
    setProjectTreeViewport((current) =>
      current.scrollTop === nextViewport.scrollTop &&
      current.height === nextViewport.height &&
      current.listTop === nextViewport.listTop
        ? current
        : nextViewport
    )
  }, [])

  const handleInspectorStackScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    if (event.currentTarget === inspectorStackPanelRef.current) {
      updateProjectTreeViewport()
    }
  }, [updateProjectTreeViewport])

  const refreshConversationChanges = useCallback((
    conversationId: string,
    source: ConversationChangesRefreshSource = "foreground"
  ): Promise<void> => {
    const contextAtStart = conversationChangesContextRef.current
    if (
      contextAtStart.pinned ||
      contextAtStart.tab !== "changes" ||
      contextAtStart.conversationId !== conversationId
    ) {
      return Promise.resolve()
    }

    const existing = conversationChangesInFlightRef.current.get(conversationId)
    if (existing) {
      if (
        existing.queuedSource === null ||
        conversationChangesRefreshPriority[source] > conversationChangesRefreshPriority[existing.queuedSource]
      ) {
        existing.queuedSource = source
      }
      return existing.promise.then(() => {
        const trailing = conversationChangesInFlightRef.current.get(conversationId)
        return trailing && trailing.requestId !== existing.requestId
          ? trailing.promise
          : undefined
      })
    }

    const loadChanges = window.teamcow?.getConversationChanges
    if (!loadChanges) {
      conversationChangesSnapshotRef.current = null
      setConversationChanges(null)
      setConversationChangesStateConversationId(conversationId)
      setConversationChangesLoadState("unavailable")
      setConversationChangesError(tInspector("changes.unavailable"))
      setConversationChangesStale(false)
      return Promise.resolve()
    }

    const requestId = conversationChangesRequestRef.current + 1
    conversationChangesRequestRef.current = requestId
    const hasCurrentSnapshot = conversationChangesSnapshotRef.current?.conversationId === conversationId
    if (source === "foreground" || !hasCurrentSnapshot) {
      setConversationChangesStateConversationId(conversationId)
      setConversationChangesLoadState("loading")
      setConversationChangesError(null)
    }

    const isCurrentRequest = () => {
      const currentContext = conversationChangesContextRef.current
      return conversationChangesRequestRef.current === requestId &&
        currentContext.conversationId === conversationId &&
        currentContext.tab === "changes" &&
        !currentContext.pinned
    }

    const preserveOrClearSnapshotOnError = (
      message: string,
      loadState: Extract<InspectorChangesLoadState, "error" | "unavailable"> = "error"
    ) => {
      if (!isCurrentRequest()) {
        return
      }
      const canPreserve = conversationChangesSnapshotRef.current?.conversationId === conversationId
      if (!canPreserve) {
        setConversationChanges(null)
        setSelectedConversationChange(null)
      }
      setConversationChangesLoadState(loadState)
      setConversationChangesError(message)
      setConversationChangesStale(canPreserve)
    }

    let loadPromise: ReturnType<typeof loadChanges>
    try {
      loadPromise = loadChanges(conversationId)
    } catch (error) {
      loadPromise = Promise.reject(error)
    }
    const requestPromise = loadPromise
      .then((result) => {
        if (!isCurrentRequest()) {
          return
        }

        if (result.status === "error") {
          const suggestion = tErrors(`suggestion.${result.error.code}`, { defaultValue: "" })
          const unsupported = result.error.code === "GIT_NOT_INSTALLED" || result.error.code === "WORKTREE_NOT_FOUND"
          const unavailable = unsupported || result.error.code === "GIT_STATUS_FAILED"
          const message = unsupported
            ? tInspector("changes.unsupported")
            : [tErrors(result.error.code), suggestion].filter(Boolean).join(" ")
          preserveOrClearSnapshotOnError(message, unavailable ? "unavailable" : "error")
          return
        }

        if (result.changes.conversationId !== conversationId) {
          preserveOrClearSnapshotOnError(tInspector("changes.error"))
          return
        }

        const nextSnapshot = result.changes
        const currentSnapshot = conversationChangesSnapshotRef.current
        if (
          source === "background" &&
          currentSnapshot?.conversationId === nextSnapshot.conversationId &&
          currentSnapshot.worktreeId === nextSnapshot.worktreeId &&
          currentSnapshot.revision === nextSnapshot.revision
        ) {
          const presentation = conversationChangesPresentationRef.current
          if (presentation.loadState !== "ready" || presentation.error !== null || presentation.stale) {
            setConversationChangesLoadState("ready")
            setConversationChangesError(null)
            setConversationChangesStale(false)
          }
          return
        }

        const preferred = preferredConversationChangePathRef.current
        const currentSelection = selectedConversationChangeRef.current
        const preferredRequestIsReady = preferred?.conversationId === conversationId && requestId >= preferred.minimumRequestId
        const shouldApplyPreferred = preferredRequestIsReady &&
          preferred.intentVersion === conversationChangeSelectionIntentVersionRef.current
        const preferredSelection = shouldApplyPreferred
          ? preferred.targetArea
            ? { area: preferred.targetArea, filePath: preferred.filePath }
            : findConversationChangeByPath(nextSnapshot, preferred.filePath)
          : null
        const nextSelection = shouldApplyPreferred
          ? preferredSelection && conversationChangesSnapshotHasSelection(nextSnapshot, preferredSelection)
            ? preferredSelection
            : null
          : currentSelection && conversationChangesSnapshotHasSelection(nextSnapshot, currentSelection)
            ? currentSelection
            : null

        if (preferredRequestIsReady) {
          preferredConversationChangePathRef.current = null
        }

        conversationChangesSnapshotRef.current = nextSnapshot
        setConversationChanges(nextSnapshot)
        setSelectedConversationChange((current) =>
          current?.area === nextSelection?.area && current?.filePath === nextSelection?.filePath
            ? current
            : nextSelection
        )
        if (shouldApplyPreferred && nextSelection) {
          setFileEditorState((current) => openConversationChangeDiffTab(current, {
            conversationId,
            worktreeId: nextSnapshot.worktreeId,
            revision: nextSnapshot.revision,
            area: nextSelection.area,
            filePath: nextSelection.filePath,
            mode: "preview"
          }))
        }
        setConversationChangesLoadState("ready")
        setConversationChangesError(null)
        setConversationChangesStale(false)
      })
      .catch((error: unknown) => {
        preserveOrClearSnapshotOnError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        const current = conversationChangesInFlightRef.current.get(conversationId)
        if (!current || current.requestId !== requestId) {
          return
        }
        conversationChangesInFlightRef.current.delete(conversationId)
        const currentContext = conversationChangesContextRef.current
        if (
          current.queuedSource &&
          currentContext.conversationId === conversationId &&
          currentContext.tab === "changes" &&
          !currentContext.pinned
        ) {
          void conversationChangesRefreshRef.current(conversationId, current.queuedSource)
        }
      })
    conversationChangesInFlightRef.current.set(conversationId, {
      requestId,
      queuedSource: null,
      promise: requestPromise
    })
    return requestPromise
  }, [tErrors, tInspector])
  conversationChangesRefreshRef.current = refreshConversationChanges

  useEffect(() => {
    if (inspectorFocusMode !== "pinned" && activeInspectorTab === "changes" && activeConversation?.id) {
      const conversationId = activeConversation.id
      void refreshConversationChanges(conversationId)
      return () => {
        conversationChangesRequestRef.current += 1
      }
    }
  }, [
    activeConversation?.id,
    activeInspectorTab,
    inspectorFocusMode,
    refreshConversationChanges
  ])

  useEffect(() => {
    if (
      inspectorFocusMode === "pinned" ||
      activeInspectorTab !== "changes" ||
      !activeConversation?.id ||
      !window.teamcow?.onRunEvent
    ) {
      return
    }

    const conversationId = activeConversation.id
    return window.teamcow.onRunEvent((event) => {
      if (
        event.conversationId === conversationId &&
        (event.status === "completed" || event.status === "failed" || event.status === "interrupted" || event.status === "unavailable")
      ) {
        refreshConversationChanges(conversationId, "background")
      }
    })
  }, [activeConversation?.id, activeInspectorTab, inspectorFocusMode, refreshConversationChanges])

  useEffect(() => {
    if (
      inspectorFocusMode === "pinned" ||
      activeInspectorTab !== "changes" ||
      !activeConversation?.id ||
      !window.teamcow?.onWorktreeGitChanged
    ) {
      return
    }

    const conversationId = activeConversation.id
    const worktreeId = activeConversation.worktree.id
    return window.teamcow.onWorktreeGitChanged((event) => {
      if (event.worktreeId === worktreeId) {
        void refreshConversationChanges(conversationId, "background")
      }
    })
  }, [
    activeConversation?.id,
    activeConversation?.worktree.id,
    activeInspectorTab,
    inspectorFocusMode,
    refreshConversationChanges
  ])

  useEffect(() => {
    if (inspectorFocusMode === "pinned" || activeInspectorTab !== "changes" || !activeConversation?.id) {
      return
    }

    const conversationId = activeConversation.id
    const refreshOnFocus = () => {
      void refreshConversationChanges(conversationId, "background")
    }
    window.addEventListener("focus", refreshOnFocus)
    return () => {
      window.removeEventListener("focus", refreshOnFocus)
    }
  }, [activeConversation?.id, activeInspectorTab, inspectorFocusMode, refreshConversationChanges])

  useLayoutEffect(() => {
    if (inspectedInspectorTab === "files") {
      updateProjectTreeViewport()
    }
  }, [inspectedInspectorTab, updateProjectTreeViewport, visibleInspectorProjectFileRows.length])

  useEffect(() => {
    window.addEventListener("resize", updateProjectTreeViewport)
    return () => window.removeEventListener("resize", updateProjectTreeViewport)
  }, [updateProjectTreeViewport])

  useEffect(() => {
    if (activeProviderKind) {
      void loadProviderModels(activeProviderKind)
    }
  }, [activeProviderKind, loadProviderModels])

  useEffect(() => {
    if (isComposerProviderBlocked) {
      setComposerModelMenuOpen(false)
    }
  }, [isComposerProviderBlocked])

  useEffect(() => {
    composerAttachmentReadRequestRef.current += 1
    composerAttachmentReadingRef.current = false
    setComposerModelMenuOpen(false)
    setComposerDraft("")
    setComposerAttachments([])
    setPendingComposerSubmission(null)
    setComposerAttachmentError(null)
    setComposerCommandMessage(null)
    setSlashCommandActiveIndex(0)
    setSlashCommandDismissedDraft(null)
    setIsReadingComposerAttachments(false)
    setImagePreview(null)
    setCompareModeOpen(false)
    setCompareTargetConversationId(null)
    setCompareTimeline(null)
    setCompareTimelineStatus("idle")
    setGitCommitScope(DEFAULT_GIT_COMMIT_SCOPE)
    if (inspectorFocusMode !== "pinned") {
      conversationChangesRequestRef.current += 1
      conversationChangeSelectionIntentVersionRef.current += 1
      preferredConversationChangePathRef.current = null
      conversationChangesSnapshotRef.current = null
      selectedConversationChangeRef.current = null
      setConversationChanges(null)
      setConversationChangesStateConversationId(null)
      setConversationChangesLoadState("idle")
      setConversationChangesError(null)
      setConversationChangesStale(false)
      setSelectedConversationChange(null)
      setConversationChangesCommitDraft(null)
      setConversationGitStatus(null)
      setConversationGitStatusLoadState("idle")
      setConversationGitStatusError(null)
      setSelectedGitRemoteName(null)
      setConversationProjectFiles(null)
      setConversationProjectFilesLoadState("idle")
      setConversationProjectFilesError(null)
      setCollapsedProjectFileDirectories(new Set())
      setLoadedProjectFileDirectories(new Set())
      resetProjectFileDirectoryRequests()
      setActiveInspectorTab("files")
    }
  }, [activeConversation?.id, resetProjectFileDirectoryRequests])

  useEffect(() => {
    const target = inspectorProjectFilesTarget
    if (!target) {
      conversationProjectFilesRequestRef.current += 1
      resetProjectFileDirectoryRequests()
      setConversationProjectFiles(null)
      setConversationProjectFilesLoadState("idle")
      setConversationProjectFilesError(null)
      setCollapsedProjectFileDirectories(new Set())
      setLoadedProjectFileDirectories(new Set())
      return
    }

    const loadProjectFiles = target.kind === "conversation"
      ? window.teamcow?.getConversationProjectFiles
        ? () => window.teamcow.getConversationProjectFiles(target.conversationId)
        : null
      : window.teamcow?.getProjectWorktreeFiles
        ? () => window.teamcow.getProjectWorktreeFiles(target.projectId, target.worktreeId)
        : null

    if (!loadProjectFiles) {
      conversationProjectFilesRequestRef.current += 1
      resetProjectFileDirectoryRequests()
      setConversationProjectFiles(null)
      setConversationProjectFilesLoadState("unavailable")
      setConversationProjectFilesError(tInspector("files.unavailable"))
      setCollapsedProjectFileDirectories(new Set())
      setLoadedProjectFileDirectories(new Set())
      return
    }

    const requestId = conversationProjectFilesRequestRef.current + 1
    conversationProjectFilesRequestRef.current = requestId
    resetProjectFileDirectoryRequests()
    setConversationProjectFilesLoadState("loading")
    setConversationProjectFilesError(null)

    void loadProjectFiles()
      .then((result) => {
        if (conversationProjectFilesRequestRef.current !== requestId) {
          return
        }

        if (result.status === "error") {
          const suggestion = tErrors(`suggestion.${result.error.code}`, { defaultValue: "" })
          setConversationProjectFiles(null)
          setConversationProjectFilesLoadState(result.error.code === "WORKTREE_NOT_FOUND" ? "unavailable" : "error")
          setConversationProjectFilesError([tErrors(result.error.code), suggestion].filter(Boolean).join(" "))
          setCollapsedProjectFileDirectories(new Set())
          setLoadedProjectFileDirectories(new Set())
          resetProjectFileDirectoryRequests()
          return
        }

        if (!projectFilesMatchTarget(result.projectFiles, target)) {
          setConversationProjectFiles(null)
          setConversationProjectFilesLoadState("error")
          setConversationProjectFilesError(tInspector("files.error"))
          setCollapsedProjectFileDirectories(new Set())
          setLoadedProjectFileDirectories(new Set())
          resetProjectFileDirectoryRequests()
          return
        }

        setConversationProjectFiles(result.projectFiles)
        setCollapsedProjectFileDirectories(getDefaultCollapsedProjectFileDirectories(result.projectFiles.files))
        setLoadedProjectFileDirectories(new Set([""]))
        setConversationProjectFilesLoadState("ready")
      })
      .catch((error: unknown) => {
        if (conversationProjectFilesRequestRef.current !== requestId) {
          return
        }

        setConversationProjectFiles(null)
        setConversationProjectFilesLoadState("error")
        setConversationProjectFilesError(error instanceof Error ? error.message : String(error))
        setCollapsedProjectFileDirectories(new Set())
        setLoadedProjectFileDirectories(new Set())
        resetProjectFileDirectoryRequests()
      })
  }, [
    inspectorProjectFilesTarget,
    resetProjectFileDirectoryRequests,
    tErrors,
    tInspector
  ])

  useEffect(() => {
    setSelectedGitRemoteName(conversationGitStatus?.repository.selectedRemoteName ?? null)
  }, [conversationGitStatus?.repository.selectedRemoteName, conversationGitStatus?.conversationId])

  useEffect(() => {
    if (inspectorFocusMode === "pinned") {
      return
    }

    const conversationId = activeConversation?.id ?? null
    if (!conversationId) {
      conversationGitStatusRequestRef.current += 1
      setConversationGitStatus(null)
      setConversationGitStatusLoadState("idle")
      setConversationGitStatusError(null)
      return
    }

    if (!window.teamcow?.getConversationGitStatus) {
      conversationGitStatusRequestRef.current += 1
      setConversationGitStatus(null)
      setConversationGitStatusLoadState("unavailable")
      setConversationGitStatusError(tInspector("git.unavailable"))
      return
    }

    const requestId = conversationGitStatusRequestRef.current + 1
    conversationGitStatusRequestRef.current = requestId
    setConversationGitStatusLoadState("loading")
    setConversationGitStatusError(null)

    void window.teamcow.getConversationGitStatus(conversationId, gitCommitScope)
      .then((result) => {
        if (conversationGitStatusRequestRef.current !== requestId) {
          return
        }

        if (result.status === "error") {
          const suggestion = tErrors(`suggestion.${result.error.code}`, { defaultValue: "" })
          setConversationGitStatus(null)
          setConversationGitStatusLoadState(isInspectorGitUnavailableCode(result.error.code) ? "unavailable" : "error")
          setConversationGitStatusError([tErrors(result.error.code), suggestion].filter(Boolean).join(" "))
          return
        }

        if (result.git.conversationId !== conversationId) {
          setConversationGitStatus(null)
          setConversationGitStatusLoadState("error")
          setConversationGitStatusError(tInspector("git.error"))
          return
        }

        setConversationGitStatus(result.git)
        setConversationGitStatusLoadState("ready")
      })
      .catch((error: unknown) => {
        if (conversationGitStatusRequestRef.current !== requestId) {
          return
        }

        setConversationGitStatus(null)
        setConversationGitStatusLoadState("error")
        setConversationGitStatusError(error instanceof Error ? error.message : String(error))
      })
  }, [
    activeConversation?.id,
    activeConversation?.runStatus,
    activeTimelineArtifactFingerprint,
    conversationGitStatusRefreshKey,
    gitCommitScope,
    inspectorFocusMode,
    tErrors,
    tInspector
  ])

  useEffect(() => {
    if (!compareModeOpen || !defaultCompareTarget) {
      return
    }

    setCompareTargetConversationId((current) =>
      current && compareCandidates.some((conversation) => conversation.id === current)
        ? current
        : defaultCompareTarget.id
    )
  }, [compareCandidates, compareModeOpen, defaultCompareTarget])

  useEffect(() => {
    if (!compareModeOpen || !compareTargetConversation) {
      setCompareTimeline(null)
      setCompareTimelineStatus("idle")
      compareTimelineRequestRef.current += 1
      return
    }

    const requestId = ++compareTimelineRequestRef.current
    const conversationId = compareTargetConversation.id
    let cancelled = false
    setCompareTimeline(null)
    setCompareTimelineStatus("loading")

    const loadCompareTimeline = async () => {
      if (!window.teamcow?.getConversationTimeline) {
        setCompareTimeline(null)
        setCompareTimelineStatus("error")
        return
      }

      try {
        const result = await window.teamcow.getConversationTimeline(conversationId)
        if (cancelled || requestId !== compareTimelineRequestRef.current) {
          return
        }

        if (result.status === "ok" && result.timeline.conversationId === conversationId) {
          setCompareTimeline(result.timeline)
          setCompareTimelineStatus("ready")
        } else {
          setCompareTimeline(null)
          setCompareTimelineStatus("error")
        }
      } catch {
        if (!cancelled && requestId === compareTimelineRequestRef.current) {
          setCompareTimeline(null)
          setCompareTimelineStatus("error")
        }
      }
    }

    void loadCompareTimeline()

    return () => {
      cancelled = true
    }
  }, [compareModeOpen, compareTargetConversation?.id])

  useEffect(() => {
    currentProjectIdRef.current = currentProjectId
  }, [currentProjectId])

  const loadProjectWorktrees = useCallback(async (projectId = currentProjectId) => {
    const requestId = ++projectWorktreeRequestRef.current

    if (!projectId) {
      setProjectWorktrees([])
      return []
    }

    const targets = await listProjectWorktrees(projectId)
    const nextTargets = Array.isArray(targets) ? targets : []
    if (projectWorktreeRequestRef.current === requestId && currentProjectIdRef.current === projectId) {
      setProjectWorktrees(nextTargets)
    }
    return nextTargets
  }, [currentProjectId, listProjectWorktrees])

  useEffect(() => {
    void loadProjectWorktrees()
  }, [loadProjectWorktrees])

  useEffect(() => {
    let cancelled = false

    const loadExternalOpenOptions = async () => {
      try {
        const options = await window.teamcow.listExternalOpenOptions()
        if (!cancelled) {
          setExternalOpenOptions(options)
        }
      } catch {
        if (!cancelled) {
          setExternalOpenOptions([])
        }
      }
    }

    void loadExternalOpenOptions()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!externalOpenMenuOpen) {
      return
    }

    const handlePointerAway = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (externalOpenMenuRef.current?.contains(target)) {
        return
      }
      setExternalOpenMenuOpen(false)
    }

    document.addEventListener("mousedown", handlePointerAway)
    return () => {
      document.removeEventListener("mousedown", handlePointerAway)
    }
  }, [externalOpenMenuOpen])

  const addComposerFiles = async (files: File[]) => {
    if (!activeConversation || isComposerLocked || files.length === 0 || composerAttachmentReadingRef.current) {
      return
    }

    setComposerAttachmentError(null)
    if (composerAttachments.length + files.length > MAX_CONVERSATION_ATTACHMENTS) {
      setComposerAttachmentError(tChat("composer.attachment.error.count", {
        count: MAX_CONVERSATION_ATTACHMENTS
      }))
      return
    }

    const oversizedFile = files.find((file) => file.size > MAX_CONVERSATION_ATTACHMENT_BYTES)
    if (oversizedFile) {
      setComposerAttachmentError(tChat("composer.attachment.error.file-too-large", {
        name: oversizedFile.name,
        limit: Math.floor(MAX_CONVERSATION_ATTACHMENT_BYTES / 1024 / 1024)
      }))
      return
    }

    const currentBytes = composerAttachments.reduce((total, attachment) => total + attachment.sizeBytes, 0)
    const addedBytes = files.reduce((total, file) => total + file.size, 0)
    if (currentBytes + addedBytes > MAX_CONVERSATION_ATTACHMENTS_TOTAL_BYTES) {
      setComposerAttachmentError(tChat("composer.attachment.error.total-too-large", {
        limit: Math.floor(MAX_CONVERSATION_ATTACHMENTS_TOTAL_BYTES / 1024 / 1024)
      }))
      return
    }

    const conversationId = activeConversation.id
    const requestId = ++composerAttachmentReadRequestRef.current
    composerAttachmentReadingRef.current = true
    setIsReadingComposerAttachments(true)
    try {
      const attachments = await Promise.all(files.map((file, index) =>
        readComposerAttachment(file, tChat("composer.attachment.fallback-name", { index: index + 1 }))
      ))
      if (
        composerConversationIdRef.current !== conversationId ||
        composerAttachmentReadRequestRef.current !== requestId
      ) {
        return
      }
      setComposerAttachments((current) => [...current, ...attachments])
    } catch {
      if (
        composerConversationIdRef.current === conversationId &&
        composerAttachmentReadRequestRef.current === requestId
      ) {
        setComposerAttachmentError(tChat("composer.attachment.error.read"))
      }
    } finally {
      if (
        composerConversationIdRef.current === conversationId &&
        composerAttachmentReadRequestRef.current === requestId
      ) {
        composerAttachmentReadingRef.current = false
        setIsReadingComposerAttachments(false)
      }
    }
  }

  const handleComposerAttachmentInput = (event: ReactChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ""
    void addComposerFiles(files)
  }

  const handleComposerPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files)
    if (files.length > 0) {
      void addComposerFiles(files)
    }
  }

  const clearComposerText = () => {
    setComposerDraft("")
    setSlashCommandDismissedDraft(null)
    if (composerInputRef.current) {
      composerInputRef.current.value = ""
      composerInputRef.current.style.height = "auto"
      composerInputRef.current.style.overflowY = "hidden"
    }
  }

  const selectSlashCommand = (command: SlashCommandDefinition) => {
    const nextDraft = `/${command.name}${command.argumentKind === "none" ? "" : " "}`
    setComposerDraft(nextDraft)
    setComposerCommandMessage(null)
    setSlashCommandActiveIndex(0)
    setSlashCommandDismissedDraft(command.argumentKind === "none" ? nextDraft : null)
    queueMicrotask(() => {
      const input = composerInputRef.current
      if (!input) {
        return
      }
      input.focus()
      input.setSelectionRange(nextDraft.length, nextDraft.length)
    })
  }

  const executeLocalSlashCommand = async (
    parsedCommand: Extract<ReturnType<typeof parseProviderSlashCommand>, { status: "local" }>
  ) => {
    if (!activeConversation) {
      return
    }
    const { invocation, command } = parsedCommand
    const providerLabel = getProviderLabel(activeConversation.provider.kind, tProvider)
    if (composerAttachments.length > 0) {
      setComposerCommandMessage({ tone: "error", text: tChat("composer.slash.error.local-attachments") })
      return
    }
    if (!command.availableWhileRunning && isActiveRunRunning) {
      setComposerCommandMessage({
        tone: "error",
        text: tChat("composer.slash.error.running", { command: `/${invocation.name}` })
      })
      return
    }
    if (command.argumentKind === "none" && invocation.arguments.length > 0) {
      setComposerCommandMessage({
        tone: "error",
        text: tChat("composer.slash.error.no-arguments", { command: `/${invocation.name}` })
      })
      return
    }

    if (invocation.name === "help") {
      clearComposerText()
      setComposerCommandMessage({
        tone: "info",
        text: tChat("composer.slash.feedback.help", { provider: providerLabel })
      })
      return
    }

    if (invocation.name === "status") {
      clearComposerText()
      setComposerCommandMessage({
        tone: "info",
        text: tChat("composer.slash.feedback.status", {
          provider: providerLabel,
          model: activeConversation.currentModel,
          access: activeAccessMode,
          status: tCommon(`state.${activeConversation.runStatus}`, { defaultValue: activeConversation.runStatus })
        })
      })
      return
    }

    if (invocation.name === "stop") {
      if (!isActiveRunRunning) {
        setComposerCommandMessage({ tone: "error", text: tChat("composer.slash.error.no-running-run") })
        return
      }
      const result = await cancelConversationRun({ conversationId: activeConversation.id })
      if (!result || result.status !== "ok") {
        setComposerCommandMessage({ tone: "error", text: tChat("composer.slash.error.action-failed") })
        return
      }
      clearComposerText()
      setComposerCommandMessage({ tone: "info", text: tChat("composer.slash.feedback.stop") })
      return
    }

    if (invocation.name === "access") {
      const accessMode = providerAccessModeSchema.safeParse(invocation.arguments)
      if (!accessMode.success) {
        setComposerCommandMessage({
          tone: "error",
          text: tChat("composer.slash.error.invalid-argument", {
            command: "/access",
            expected: tChat("composer.slash.argument.access")
          })
        })
        return
      }
      const result = await setConversationAccessMode(activeConversation.id, accessMode.data)
      if (!result || result.status === "error") {
        setComposerCommandMessage({ tone: "error", text: tChat("composer.slash.error.action-failed") })
        return
      }
      clearComposerText()
      setComposerCommandMessage({
        tone: "info",
        text: tChat("composer.slash.feedback.access", { access: accessMode.data })
      })
    }
  }

  const handleComposerSubmit = async () => {
    const content = (composerDraft || composerInputRef.current?.value || "").trim()
    if (
      !activeConversation ||
      !activeProviderKind ||
      composerSubmissionPendingRef.current ||
      (content.length === 0 && composerAttachments.length === 0) ||
      (!isActiveRunRunning && isComposerProviderBlocked) ||
      isReadingComposerAttachments
    ) {
      return
    }

    const parsedSlashCommand = parseProviderSlashCommand(activeProviderKind, content)
    if (parsedSlashCommand.status === "error") {
      const command = `/${parsedSlashCommand.invocation.name}`
      const provider = getProviderLabel(activeConversation.provider.kind, tProvider)
      const key = parsedSlashCommand.code === "unknown-command"
        ? "composer.slash.error.unknown"
        : parsedSlashCommand.code === "unsupported-provider"
          ? "composer.slash.error.unsupported-provider"
          : parsedSlashCommand.code === "missing-argument"
            ? "composer.slash.error.missing-argument"
            : "composer.slash.error.invalid-argument"
      setComposerCommandMessage({
        tone: "error",
        text: tChat(key, {
          command,
          provider,
          expected: parsedSlashCommand.expected
            ? parsedSlashCommand.expected.startsWith("composer.")
              ? tChat(parsedSlashCommand.expected)
              : parsedSlashCommand.expected
            : ""
        })
      })
      return
    }
    if (parsedSlashCommand.status === "local") {
      await executeLocalSlashCommand(parsedSlashCommand)
      return
    }
    if (
      parsedSlashCommand.status === "run" &&
      parsedSlashCommand.prompt.length === 0 &&
      composerAttachments.length === 0
    ) {
      setComposerCommandMessage({
        tone: "error",
        text: tChat("composer.slash.error.prompt-required", {
          command: `/${parsedSlashCommand.invocation.name}`
        })
      })
      return
    }

    const conversationId = activeConversation.id
    const attachments = composerAttachments
    const requestId = composerSubmissionRequestRef.current + 1
    composerSubmissionRequestRef.current = requestId
    composerSubmissionPendingRef.current = true
    setPendingComposerSubmission({
      requestId,
      conversationId,
      content,
      attachments,
      model: activeConversation.currentModel,
      createdAt: new Date().toISOString(),
      knownMessageIds: activeTimeline?.messages.map((message) => message.id) ?? [],
      knownRunIds: activeTimeline?.runs.map((run) => run.id) ?? [],
      startsRun: !isActiveRunRunning
    })
    setComposerDraft("")
    setComposerAttachments([])
    setComposerAttachmentError(null)
    setComposerCommandMessage(null)
    if (composerInputRef.current) {
      composerInputRef.current.value = ""
      composerInputRef.current.style.height = "auto"
      composerInputRef.current.style.overflowY = "hidden"
    }

    const result = await sendConversationMessage({
      conversationId,
      content,
      ...(attachments.length > 0
        ? {
            attachments: attachments.map((attachment) => ({
              name: attachment.name,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              dataBase64: attachment.dataBase64
            }))
          }
        : {})
    })

    composerSubmissionPendingRef.current = false
    if (composerConversationIdRef.current !== conversationId) {
      return
    }

    setPendingComposerSubmission((current) => current?.requestId === requestId ? null : current)
    if (result?.status === "accepted" || result?.status === "queued") {
      setConversationGitStatusRefreshKey((current) => current + 1)
      return
    }

    setComposerDraft((current) => current.length > 0 ? `${content}\n${current}` : content)
    setComposerAttachments((current) => {
      const currentIds = new Set(current.map((attachment) => attachment.draftId))
      return [...attachments.filter((attachment) => !currentIds.has(attachment.draftId)), ...current]
    })
  }

  const handleComposerCancel = async () => {
    if (!activeConversation || activeConversation.runStatus !== "running") {
      return
    }

    await cancelConversationRun({ conversationId: activeConversation.id })
  }

  const handlePermissionRetry = async (item: PermissionRequestRenderItem) => {
    if (!activeConversation || !item.runId || item.allowedTools.length === 0) {
      return
    }

    await retryConversationRunWithPermissions({
      conversationId: activeConversation.id,
      runId: item.runId,
      allowedTools: item.allowedTools
    })
    setDismissedPermissionRequestIds((current) => new Set([...current, item.id]))
  }

  const handlePermissionDismiss = async (item: PermissionRequestRenderItem) => {
    if (!activeConversation || item.allowedTools.length === 0) {
      return
    }

    setDismissedPermissionRequestIds((current) => new Set([...current, item.id]))
    await sendConversationMessage({
      conversationId: activeConversation.id,
      content: tChat("render.permission-deny-prompt", {
        tools: item.allowedTools.join(", ")
      })
    })
  }

  const handleComposerModelSelect = async (option: ProviderModelOption) => {
    setComposerModelMenuOpen(false)
    if (
      !activeConversation ||
      activeConversation.runStatus === "running" ||
      isComposerProviderBlocked ||
      activeConversation.currentModel === option.id
    ) {
      return
    }

    await setConversationModel(activeConversation.id, option.id)
  }

  const handleComposerAccessModeSelect = async (option: LauncherSelectOption) => {
    setComposerAccessModeMenuOpen(false)
    if (
      !activeConversation ||
      activeConversation.runStatus === "running" ||
      activeAccessMode === option.id
    ) {
      return
    }

    await setConversationAccessMode(activeConversation.id, option.id as ProviderAccessMode)
  }

  useEffect(() => {
    if (!composerAccessModeMenuOpen && !composerModelMenuOpen && !isSlashCommandMenuOpen) {
      return
    }

    const handlePointerAway = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (
        composerAccessModeMenuRef.current?.contains(target) ||
        composerModelMenuRef.current?.contains(target) ||
        composerSlashMenuRef.current?.contains(target) ||
        composerInputRef.current?.contains(target)
      ) {
        return
      }

      setComposerAccessModeMenuOpen(false)
      setComposerModelMenuOpen(false)
      if (isSlashCommandMenuOpen) {
        setSlashCommandDismissedDraft(composerDraft)
      }
    }

    document.addEventListener("mousedown", handlePointerAway)
    return () => {
      document.removeEventListener("mousedown", handlePointerAway)
    }
  }, [composerAccessModeMenuOpen, composerDraft, composerModelMenuOpen, isSlashCommandMenuOpen])

  useEffect(() => {
    if (!launcherOpen || !currentProject) {
      return
    }

    let cancelled = false

    const loadWorktrees = async () => {
      const worktrees = await listWorktreesByProject(currentProject.id)
      if (cancelled) {
        return
      }

      setAvailableWorktrees(worktrees)

      if (selectedWorktreeTarget === "existing-worktree" && selectedWorktreeId) {
        const stillExists = worktrees.some((worktree) => worktree.id === selectedWorktreeId)
        if (!stillExists) {
          setSelectedWorktreeId(currentProject.defaultWorktree.id)
          setSelectedWorktreeTarget("default")
        }
      } else if (
        selectedWorktreeTarget === "default" &&
        selectedWorktreeId !== currentProject.defaultWorktree.id
      ) {
        setSelectedWorktreeId(currentProject.defaultWorktree.id)
      }
    }

    void loadWorktrees()

    return () => {
      cancelled = true
    }
  }, [currentProject, launcherOpen, listWorktreesByProject, selectedWorktreeId, selectedWorktreeTarget])

  useEffect(() => {
    if (launcherOpen && selectedProviderKind) {
      void loadProviderModels(selectedProviderKind)
    }
  }, [launcherOpen, loadProviderModels, selectedProviderKind])

  useEffect(() => {
    if (!launcherOpen || selectedProviderKind) {
      return
    }

    const firstReadyProviderKind = getFirstReadyProviderKind(providerReadiness.snapshot.providers)
    if (firstReadyProviderKind) {
      setSelectedProviderKind(firstReadyProviderKind)
      setSelectedModelId("")
      setLauncherErrorMessage("")
    }
  }, [launcherOpen, providerReadiness.snapshot.providers, selectedProviderKind])

  useEffect(() => {
    if (!launcherOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (openSelectId) {
          setOpenSelectId(null)
          return
        }

        setLauncherOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [launcherOpen, openSelectId])

  const selectedProvider = providerReadiness.snapshot.providers.find((provider) => provider.kind === selectedProviderKind) ?? null
  const selectedProviderCopy = selectedProvider ? getProviderReadinessCopy(selectedProvider) : null
  const selectedProviderBoundaryCopy = selectedProvider ? getProviderBoundaryCopy(selectedProvider) : null
  const modelOptions = useMemo(
    () => getModelOptions(selectedProviderKind, providerModelsByKind),
    [providerModelsByKind, selectedProviderKind]
  )
  const selectedWorktree = availableWorktrees.find((worktree) => worktree.id === selectedWorktreeId) ?? null
  const defaultWorktree = currentProject?.defaultWorktree ?? null
  const independentWorktrees = availableWorktrees.filter((worktree) => worktree.kind !== "default")
  const trimmedNewWorktreeBranch = newWorktreeBranch.trim()
  const isProviderReady = selectedProvider?.availability === "ready"
  const selectedProviderModelState = selectedProviderKind ? providerModelsByKind[selectedProviderKind] : null
  const isModelDisabled = !selectedProviderKind || !isProviderReady || selectedProviderModelState?.status === "loading"
  const isSelectedModelValid = selectedProviderKind
    ? modelOptions.some((model) => model.id === selectedModelId)
    : false
  const isStartDisabled = !currentProject ||
    !selectedProviderKind ||
    !isProviderReady ||
    !isSelectedModelValid ||
    !selectedWorktreeTarget ||
    (selectedWorktreeTarget === "existing-worktree" && !selectedWorktree) ||
    (selectedWorktreeTarget === "new-worktree" && trimmedNewWorktreeBranch.length === 0) ||
    isBusy

  useEffect(() => {
    if (
      !launcherOpen ||
      !selectedProviderKind ||
      !selectedProviderModelState ||
      selectedProviderModelState.status === "loading"
    ) {
      return
    }

    const firstModel = modelOptions[0]
    if (firstModel && !modelOptions.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(firstModel.id)
    }
  }, [launcherOpen, modelOptions, selectedModelId, selectedProviderKind, selectedProviderModelState])

  const openLauncher = async (projectId?: string, prefill: LauncherPrefill | null = null) => {
    let resolvedProjectId = projectId ?? currentProject?.id ?? context.selectedProjectId ?? projectSummaries[0]?.id ?? null
    let resolvedDefaultWorktreeId = projectSummaries.find((project) => project.id === resolvedProjectId)?.defaultWorktree.id ?? null

    if (!resolvedProjectId) {
      const importedProject = await importProject()
      if (
        importedProject?.status !== "imported" &&
        importedProject?.status !== "existing" &&
        importedProject?.status !== "restored"
      ) {
        return
      }

      resolvedProjectId = importedProject.project.id
      resolvedDefaultWorktreeId = importedProject.project.defaultWorktree.id
    }

    if (resolvedProjectId && currentProject?.id !== resolvedProjectId) {
      await selectProject(resolvedProjectId)
    }

    setLauncherOpen(true)
    if (prefill) {
      const prefilledModels = await loadProviderModels(prefill.providerKind)
      const prefilledModelId = prefilledModels.some((model) => model.id === prefill.modelId)
        ? prefill.modelId
        : ""
      setSelectedProviderKind(prefill.providerKind)
      setSelectedModelId(prefilledModelId)
      setSelectedWorktreeTarget(prefill.worktreeTarget)
      setSelectedWorktreeId(prefill.worktreeId)
    } else {
      setSelectedProviderKind(getFirstReadyProviderKind(providerReadiness.snapshot.providers))
      setSelectedModelId("")
      setSelectedWorktreeTarget("default")
      setSelectedWorktreeId(resolvedDefaultWorktreeId)
    }
    setNewWorktreeBranch("")
    setLauncherErrorMessage("")
    setOpenSelectId(null)
  }

  const closeLauncher = () => {
    setLauncherOpen(false)
    setSelectedProviderKind(null)
    setSelectedModelId("")
    setSelectedWorktreeTarget(null)
    setSelectedWorktreeId(null)
    setNewWorktreeBranch("")
    setLauncherErrorMessage("")
    setOpenSelectId(null)
  }

  const handleProviderChange = (providerKind: ProviderKind) => {
    setSelectedProviderKind(providerKind)
    setSelectedModelId("")
    setLauncherErrorMessage("")
    setOpenSelectId(null)
  }

  const handleStartConversation = async () => {
    if (!currentProject || !selectedProviderKind || !selectedModelId || !selectedWorktreeTarget) {
      return
    }

    const executionTarget =
      selectedWorktreeTarget === "default"
        ? { type: "default" as const }
        : selectedWorktreeTarget === "existing-worktree" && selectedWorktree
          ? { type: "existing-worktree" as const, worktreeId: selectedWorktree.id }
          : { type: "new-worktree" as const, branch: trimmedNewWorktreeBranch }

    const result = await createConversation({
      projectId: currentProject.id,
      providerKind: selectedProviderKind,
      model: selectedModelId,
      executionTarget
    })

    if (result?.status === "created") {
      closeLauncher()
      return
    }

    if (result?.status === "error") {
      const suggestion = tErrors(`suggestion.${result.error.code}`, { defaultValue: "" })
      setLauncherErrorMessage([tErrors(result.error.code), suggestion].filter(Boolean).join(" "))
    }
  }

  const openProjectMenu = (event: ReactMouseEvent, projectId: string) => {
    event.preventDefault()
    event.stopPropagation()
    setConversationMenu(null)
    setProjectMenu({ projectId, x: event.clientX, y: event.clientY })
  }

  const handleMoveProject = async (projectId: string, position: "top" | "bottom") => {
    setProjectMenu(null)
    await moveProject(projectId, position)
  }

  const handleRevealProjectInFinder = async (projectId: string) => {
    setProjectMenu(null)
    await revealProjectInFinder(projectId)
  }

  const handleRemoveProject = async (projectId: string) => {
    setProjectMenu(null)
    setCollapsedProjects((current) => {
      if (!current.has(projectId)) return current
      const next = new Set(current)
      next.delete(projectId)
      return next
    })
    setExpandedConversationProjects((current) => {
      if (!current.has(projectId)) return current
      const next = new Set(current)
      next.delete(projectId)
      return next
    })
    await removeProject(projectId)
  }

  const openConversationMenu = (event: ReactMouseEvent, conversationId: string) => {
    event.preventDefault()
    event.stopPropagation()
    setConversationMenu({ conversationId, x: event.clientX, y: event.clientY })
  }

  const startRenameConversation = (conversation: ConversationSummary) => {
    setRenamingConversationId(conversation.id)
    setRenameDraft(conversation.title)
    setConversationMenu(null)
  }

  const cancelRenameConversation = () => {
    setRenamingConversationId(null)
    setRenameDraft("")
  }

  const commitRenameConversation = async (conversation: ConversationSummary) => {
    const nextTitle = renameDraft.trim()
    if (!nextTitle || nextTitle === conversation.title) {
      cancelRenameConversation()
      return
    }

    const result = await renameConversation(conversation.id, nextTitle)
    if (result && result.status === "ok") {
      cancelRenameConversation()
    }
  }

  const requestDeleteConversation = (conversation: ConversationSummary) => {
    setPendingConversationDelete(conversation)
    setConversationMenu(null)
  }

  const cancelPendingConversationDelete = () => {
    setPendingConversationDelete(null)
  }

  const confirmPendingConversationDelete = async () => {
    const conversation = pendingConversationDelete
    if (!conversation) {
      return
    }

    const result = await deleteConversation(conversation.id)
    if (result && result.status === "deleted") {
      setPendingConversationDelete(null)
    }
  }

  useEffect(() => {
    if (!projectMenu) {
      return
    }

    const handlePointer = () => setProjectMenu(null)
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProjectMenu(null)
      }
    }

    window.addEventListener("click", handlePointer)
    window.addEventListener("contextmenu", handlePointer)
    window.addEventListener("keydown", handleKey)
    return () => {
      window.removeEventListener("click", handlePointer)
      window.removeEventListener("contextmenu", handlePointer)
      window.removeEventListener("keydown", handleKey)
    }
  }, [projectMenu])

  useEffect(() => {
    if (!conversationMenu) {
      return
    }

    const handlePointer = () => setConversationMenu(null)
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConversationMenu(null)
      }
    }

    window.addEventListener("click", handlePointer)
    window.addEventListener("contextmenu", handlePointer)
    window.addEventListener("keydown", handleKey)
    return () => {
      window.removeEventListener("click", handlePointer)
      window.removeEventListener("contextmenu", handlePointer)
      window.removeEventListener("keydown", handleKey)
    }
  }, [conversationMenu])

  useEffect(() => {
    if (!projectFileContextMenu) {
      return
    }

    const handlePointer = () => setProjectFileContextMenu(null)
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProjectFileContextMenu(null)
      }
    }

    window.addEventListener("click", handlePointer)
    window.addEventListener("contextmenu", handlePointer)
    window.addEventListener("keydown", handleKey)
    return () => {
      window.removeEventListener("click", handlePointer)
      window.removeEventListener("contextmenu", handlePointer)
      window.removeEventListener("keydown", handleKey)
    }
  }, [projectFileContextMenu])

  useEffect(() => {
    const input = projectFileInlineInputRef.current
    if (!projectFileInlineEdit || !input) {
      return
    }

    input.focus()
    const extensionIndex = projectFileInlineEdit.draft.lastIndexOf(".")
    if (projectFileInlineEdit.kind === "file" && extensionIndex > 0) {
      input.setSelectionRange(0, extensionIndex)
    } else {
      input.select()
    }
  }, [projectFileInlineEditFocusKey])

  useEffect(() => {
    if (pendingConversationDelete) {
      pendingConversationDeleteCancelRef.current?.focus()
    }
  }, [pendingConversationDelete])

  useEffect(() => {
    if (renamingConversationId) {
      const input = renameInputRef.current
      input?.focus()
      input?.select()
    }
  }, [renamingConversationId])

  const openCompareFollowUp = (conversation: ConversationSummary) => {
    const prefill = getFollowUpLauncherPrefill(conversation, currentProject)
    void openLauncher(currentProject?.id, prefill)
  }

  const selectInspectorDiff = (block: InspectorDiffBlock) => {
    if (isInspectorPinned || !activeConversation) {
      return
    }

    const intentVersion = conversationChangeSelectionIntentVersionRef.current + 1
    conversationChangeSelectionIntentVersionRef.current = intentVersion
    preferredConversationChangePathRef.current = block.filePath
      ? {
          conversationId: activeConversation.id,
          filePath: block.filePath,
          targetArea: null,
          intentVersion,
          minimumRequestId: conversationChangesRequestRef.current + 1
        }
      : null
    selectedConversationChangeRef.current = null
    setSelectedConversationChange(null)
    setActiveInspectorTab("changes")
    if (activeInspectorTab === "changes") {
      refreshConversationChanges(activeConversation.id)
    }
  }

  const openInspectorChanges = () => {
    if (isInspectorPinned || !activeConversation) {
      return
    }
    conversationChangeSelectionIntentVersionRef.current += 1
    preferredConversationChangePathRef.current = null
    selectedConversationChangeRef.current = null
    setSelectedConversationChange(null)
    setActiveInspectorTab("changes")
    if (activeInspectorTab === "changes") {
      refreshConversationChanges(activeConversation.id)
    }
  }

  const formatDesktopError = (error: AppError) => {
    const localizedSuggestion = tErrors(`suggestion.${error.code}`, { defaultValue: "" })
    const suggestion = localizedSuggestion || error.suggestion || ""
    return [tErrors(error.code), suggestion].filter(Boolean).join(" ")
  }

  const runConversationChangesMutation = async <TInput extends {
    conversationId: string
    scope: ConversationChangesMutationScope
  }>(
    scope: ConversationChangesMutationScope,
    sourceArea: ConversationChangeArea,
    targetArea: ConversationChangeArea | null,
    operation: (input: TInput) => Promise<ConversationChangesMutationResult>,
    buildInput: (
      input: { conversationId: string; scope: ConversationChangesMutationScope },
      revision: string
    ) => TInput
  ) => {
    if (
      isInspectorPinned ||
      !inspectedConversation ||
      conversationChangesLoadState === "loading" ||
      conversationChangesStale ||
      conversationChangesError !== null
    ) {
      return
    }

    const conversationId = inspectedConversation.id
    const currentSnapshot = conversationChangesSnapshotRef.current?.conversationId === conversationId
      ? conversationChangesSnapshotRef.current
      : null
    if (!currentSnapshot) {
      return
    }
    const { worktreeId, revision } = currentSnapshot
    const selectionAtMutationStart = selectedConversationChangeRef.current
    const selectionFollowUp = scope.type === "file" &&
      selectionAtMutationStart?.area === sourceArea &&
      selectionAtMutationStart.filePath === scope.filePath
      ? {
          sourceArea,
          targetArea,
          filePath: scope.filePath,
          intentVersion: conversationChangeSelectionIntentVersionRef.current
        }
      : null
    if (conversationChangesMutationPendingByWorktreeRef.current.has(worktreeId)) {
      return
    }
    const requestId = conversationChangesMutationRequestRef.current + 1
    conversationChangesMutationRequestRef.current = requestId
    const pendingMutation = { requestId, conversationId, worktreeId }
    conversationChangesMutationPendingByWorktreeRef.current.set(worktreeId, pendingMutation)
    setConversationChangesPendingWorktreeIds((current) => new Set(current).add(worktreeId))
    setInspectorHandoffMessage(null)
    const isCurrentMutationToken = () => {
      const current = conversationChangesMutationPendingByWorktreeRef.current.get(worktreeId)
      return current?.requestId === requestId &&
        current.conversationId === conversationId &&
        current.worktreeId === worktreeId
    }
    const isCurrentMutationContext = () =>
      isCurrentMutationToken() &&
      inspectedConversationIdRef.current === conversationId &&
      conversationChangesSnapshotRef.current?.conversationId === conversationId &&
      conversationChangesSnapshotRef.current.worktreeId === worktreeId
    try {
      const result = await operation(buildInput({ conversationId, scope }, revision))
      if (!isCurrentMutationContext()) {
        return
      }
      if (result.status === "error") {
        setInspectorHandoffMessage({ conversationId, tab: "changes", tone: "error", text: formatDesktopError(result.error) })
        return
      }
      if (
        result.conversationId !== conversationId ||
        result.worktreeId !== worktreeId ||
        !conversationChangesScopesMatch(result.scope, scope)
      ) {
        setInspectorHandoffMessage({ conversationId, tab: "changes", tone: "error", text: tInspector("changes.error") })
        return
      }
      if (result.status === "partial") {
        setInspectorHandoffMessage({
          conversationId,
          tab: "changes",
          tone: "error",
          text: result.failures.map((failure) => `${failure.filePath}: ${formatDesktopError(failure.error)}`).join(" ")
        })
        setConversationGitStatusRefreshKey((current) => current + 1)
        await refreshConversationChanges(conversationId, "mutation")
        if (
          result.changedPaths.length > 0 &&
          isCurrentMutationContext() &&
          conversationChangesSnapshotRef.current?.revision === revision
        ) {
          await refreshConversationChanges(conversationId, "mutation")
        }
        return
      }

      if (
        selectionFollowUp?.targetArea &&
        selectionFollowUp.intentVersion === conversationChangeSelectionIntentVersionRef.current
      ) {
        preferredConversationChangePathRef.current = {
          conversationId,
          filePath: selectionFollowUp.filePath,
          targetArea: selectionFollowUp.targetArea,
          intentVersion: selectionFollowUp.intentVersion,
          minimumRequestId: conversationChangesRequestRef.current + 1
        }
      }
      setConversationGitStatusRefreshKey((current) => current + 1)
      await refreshConversationChanges(conversationId, "mutation")
      if (
        result.changedPaths.length > 0 &&
        isCurrentMutationContext() &&
        conversationChangesSnapshotRef.current?.revision === revision
      ) {
        await refreshConversationChanges(conversationId, "mutation")
      }
      if (isCurrentMutationContext() && targetArea === "staged" && result.changedPaths.length > 0) {
        setInspectorHandoffMessage({
          conversationId,
          tab: "changes",
          tone: "success",
          text: scope.type === "file"
            ? tInspector("changes.stage.success-file", { path: scope.filePath })
            : tInspector("changes.stage.success-all")
        })
      }
    } catch {
      if (!isCurrentMutationContext()) {
        return
      }
      setInspectorHandoffMessage({
        conversationId,
        tab: "changes",
        tone: "error",
        text: formatDesktopError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          message: "Conversation changes mutation rejected.",
          suggestion: null,
          domain: "git"
        })
      })
    } finally {
      if (isCurrentMutationToken()) {
        conversationChangesMutationPendingByWorktreeRef.current.delete(worktreeId)
        setConversationChangesPendingWorktreeIds((current) => {
          if (!current.has(worktreeId)) {
            return current
          }
          const next = new Set(current)
          next.delete(worktreeId)
          return next
        })
      }
    }
  }

  const commitConversationChanges = async (message: string) => {
    if (
      isInspectorPinned ||
      !inspectedConversation ||
      conversationChangesLoadState === "loading" ||
      conversationChangesStale ||
      conversationChangesError !== null
    ) {
      return
    }

    const conversationId = inspectedConversation.id
    const worktreeId = conversationChangesSnapshotRef.current?.conversationId === conversationId
      ? conversationChangesSnapshotRef.current.worktreeId
      : null
    if (!worktreeId) {
      return
    }
    if (conversationChangesMutationPendingByWorktreeRef.current.has(worktreeId)) {
      return
    }
    const requestId = conversationChangesMutationRequestRef.current + 1
    conversationChangesMutationRequestRef.current = requestId
    const pendingMutation = { requestId, conversationId, worktreeId }
    conversationChangesMutationPendingByWorktreeRef.current.set(worktreeId, pendingMutation)
    setConversationChangesPendingWorktreeIds((current) => new Set(current).add(worktreeId))
    setInspectorHandoffMessage(null)
    const isCurrentMutationToken = () => {
      const current = conversationChangesMutationPendingByWorktreeRef.current.get(worktreeId)
      return current?.requestId === requestId &&
        current.conversationId === conversationId &&
        current.worktreeId === worktreeId
    }
    const isCurrentMutationContext = () =>
      isCurrentMutationToken() &&
      inspectedConversationIdRef.current === conversationId &&
      conversationChangesSnapshotRef.current?.conversationId === conversationId &&
      conversationChangesSnapshotRef.current.worktreeId === worktreeId
    try {
      const result = await window.teamcow.commitConversationChanges({ conversationId, message })
      if (!isCurrentMutationContext()) {
        return
      }
      if (result.status === "error") {
        setInspectorHandoffMessage({ conversationId, tab: "changes", tone: "error", text: formatDesktopError(result.error) })
        return
      }
      if (result.conversationId !== conversationId || result.worktreeId !== worktreeId) {
        setInspectorHandoffMessage({ conversationId, tab: "changes", tone: "error", text: tInspector("changes.error") })
        return
      }

      setConversationChangesCommitDraft((current) =>
        current?.conversationId === conversationId ? null : current
      )
      setConversationGitStatusRefreshKey((current) => current + 1)
      setInspectorHandoffMessage({
        conversationId,
        tab: "changes",
        tone: "success",
        text: tInspector("changes.commit.success", { hash: result.shortCommitHash })
      })
      refreshConversationChanges(conversationId)
    } catch {
      if (!isCurrentMutationContext()) {
        return
      }
      setInspectorHandoffMessage({
        conversationId,
        tab: "changes",
        tone: "error",
        text: formatDesktopError({
          code: "GIT_COMMIT_FAILED",
          message: "Conversation changes commit rejected.",
          suggestion: null,
          domain: "git"
        })
      })
    } finally {
      if (isCurrentMutationToken()) {
        conversationChangesMutationPendingByWorktreeRef.current.delete(worktreeId)
        setConversationChangesPendingWorktreeIds((current) => {
          if (!current.has(worktreeId)) {
            return current
          }
          const next = new Set(current)
          next.delete(worktreeId)
          return next
        })
      }
    }
  }

  const loadProjectFileDirectory = async (directoryPath: string, options: { force?: boolean } = {}) => {
    const target = inspectorProjectFilesTarget
    const isForceRefresh = Boolean(options.force)
    if (!target) {
      return
    }

    if (
      !isForceRefresh &&
      (loadedProjectFileDirectories.has(directoryPath) || pendingProjectFileDirectoriesRef.current.has(directoryPath))
    ) {
      return
    }

    const requestId = conversationProjectFilesRequestRef.current
    const messageConversationId = target.kind === "conversation" ? target.conversationId : null
    const directoryRequestSeq = (projectFileDirectoryRequestSeqRef.current.get(directoryPath) ?? 0) + 1
    projectFileDirectoryRequestSeqRef.current.set(directoryPath, directoryRequestSeq)
    pendingProjectFileDirectoriesRef.current.add(directoryPath)

    try {
      const result = target.kind === "conversation"
        ? await window.teamcow.getConversationProjectFiles(target.conversationId, directoryPath || undefined)
        : await window.teamcow.getProjectWorktreeFiles(target.projectId, target.worktreeId, directoryPath || undefined)

      if (
        conversationProjectFilesRequestRef.current !== requestId ||
        projectFileDirectoryRequestSeqRef.current.get(directoryPath) !== directoryRequestSeq
      ) {
        return
      }

      if (result.status === "error") {
        setInspectorHandoffMessage({
          conversationId: messageConversationId,
          tab: "files",
          tone: "error",
          text: formatDesktopError(result.error)
        })
        return
      }

      if (!projectFilesMatchTarget(result.projectFiles, target) || result.projectFiles.directoryPath !== directoryPath) {
        setInspectorHandoffMessage({
          conversationId: messageConversationId,
          tab: "files",
          tone: "error",
          text: tInspector("files.error")
        })
        return
      }

      setConversationProjectFiles((current) => {
        if (!current || !projectFilesMatchTarget(current, target)) {
          return result.projectFiles
        }
        return mergeProjectFileDirectory(current, result.projectFiles)
      })
      setLoadedProjectFileDirectories((current) => {
        const next = directoryPath === "" ? new Set([""]) : new Set(current)
        next.add(directoryPath)
        return next
      })
      setCollapsedProjectFileDirectories((current) => {
        const next = new Set(current)
        if (directoryPath === "") {
          return getDefaultCollapsedProjectFileDirectories(result.projectFiles.files)
        }
        next.delete(directoryPath)
        for (const file of result.projectFiles.files) {
          if (file.kind === "directory" && !file.isSymlink && !loadedProjectFileDirectories.has(file.path)) {
            next.add(file.path)
          }
        }
        return next
      })
    } catch (error) {
      if (
        conversationProjectFilesRequestRef.current === requestId &&
        projectFileDirectoryRequestSeqRef.current.get(directoryPath) === directoryRequestSeq
      ) {
        setInspectorHandoffMessage({
          conversationId: messageConversationId,
          tab: "files",
          tone: "error",
          text: error instanceof Error ? error.message : String(error)
        })
      }
    } finally {
      if (projectFileDirectoryRequestSeqRef.current.get(directoryPath) === directoryRequestSeq) {
        pendingProjectFileDirectoriesRef.current.delete(directoryPath)
      }
    }
  }

  const toggleProjectFileDirectory = (path: string) => {
    const willExpand = collapsedProjectFileDirectories.has(path)
    setCollapsedProjectFileDirectories((current) => {
      const next = new Set(current)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
    if (willExpand) {
      void loadProjectFileDirectory(path)
    }
  }

  const openActiveConversationLocation = async (appId: ExternalOpenAppId | null) => {
    if (!activeConversation || !appId || externalOpenPendingAppId) {
      return
    }

    setExternalOpenPendingAppId(appId)
    setExternalOpenMenuOpen(false)
    setExternalOpenMessage(null)

    try {
      const result = await window.teamcow.openConversationExternal({
        conversationId: activeConversation.id,
        appId
      })
      if (result.status === "error") {
        setExternalOpenMessage({
          tone: "error",
          text: formatDesktopError(result.error)
        })
        return
      }

      setDefaultExternalOpenAppId(result.appId)
    } catch {
      setExternalOpenMessage({
        tone: "error",
        text: [tErrors("EXTERNAL_OPEN_FAILED"), tErrors("fallback")].join(" ")
      })
    } finally {
      setExternalOpenPendingAppId(null)
    }
  }

  const openConversationHandoffTarget = async (
    input: Parameters<typeof window.teamcow.openConversationHandoff>[0]
  ) => {
    const sourceTab = inspectedInspectorTab
    const requestId = handoffRequestRef.current + 1
    handoffRequestRef.current = requestId
    setInspectorHandoffPending({
      requestId,
      conversationId: input.conversationId,
      target: input.target,
      filePath: input.target === "file" ? input.filePath : undefined
    })
    setInspectorHandoffMessage(null)

    try {
      const result = await window.teamcow.openConversationHandoff(input)
      if (handoffRequestRef.current !== requestId || inspectedConversationIdRef.current !== input.conversationId) {
        return
      }
      if (result.status === "error") {
        setInspectorHandoffMessage({
          conversationId: input.conversationId,
          tab: sourceTab,
          tone: "error",
          text: formatDesktopError(result.error)
        })
        return
      }

      setInspectorHandoffMessage({
        conversationId: input.conversationId,
        tab: sourceTab,
        tone: "success",
        text: tInspector(
          result.targetKind === "file" ? "handoff.success.file" : "handoff.success.worktree",
          { path: result.targetPath }
        )
      })
    } catch {
      if (handoffRequestRef.current !== requestId || inspectedConversationIdRef.current !== input.conversationId) {
        return
      }
      setInspectorHandoffMessage({
        conversationId: input.conversationId,
        tab: sourceTab,
        tone: "error",
        text: [tErrors("HANDOFF_OPEN_FAILED"), tErrors("fallback")].join(" ")
      })
    } finally {
      if (handoffRequestRef.current === requestId) {
        setInspectorHandoffPending(null)
      }
    }
  }

  const openFileInEditorWorkspace = (filePath: string, mode: "preview" | "pinned" = "preview") => {
    if (!inspectedConversation) {
      return
    }

    setFileEditorState((current) => openConversationFileTab(current, {
      conversationId: inspectedConversation.id,
      filePath,
      mode
    }))
  }

  const openChangeInEditorWorkspace = (
    selection: InspectorChangeSelection,
    mode: "preview" | "pinned" = "preview"
  ) => {
    if (!inspectedConversation || !inspectedChanges) return
    const exists = inspectedChanges[selection.area].some((file) => file.path === selection.filePath)
    if (!exists) return
    setFileEditorState((current) => openConversationChangeDiffTab(current, {
      conversationId: inspectedConversation.id,
      worktreeId: inspectedChanges.worktreeId,
      revision: inspectedChanges.revision,
      area: selection.area,
      filePath: selection.filePath,
      mode
    }))
  }

  const openEditorFileExternally = async (conversationId: string, filePath: string) => {
    try {
      const result = await window.teamcow.openConversationHandoff({
        conversationId,
        target: "file",
        filePath
      })
      if (result.status === "error") {
        return {
          tone: "error" as const,
          text: formatDesktopError(result.error)
        }
      }
      return null
    } catch {
      return {
        tone: "error" as const,
        text: [tErrors("HANDOFF_OPEN_FAILED"), tErrors("fallback")].join(" ")
      }
    }
  }

  const joinProjectFilePath = (parentPath: string, name: string) =>
    parentPath ? `${parentPath}/${name}` : name

  const getProjectFileAbsolutePath = (filePath: string) => {
    if (!inspectedProjectFiles?.worktreeRootPath) {
      return filePath
    }
    const root = inspectedProjectFiles.worktreeRootPath.replace(/\/+$/, "")
    return `${root}/${filePath}`
  }

  const formatProjectFileMutationError = (error: AppError) => {
    const suggestion = tErrors(`suggestion.${error.code}`, { defaultValue: "" })
    return [tErrors(error.code), suggestion].filter(Boolean).join(" ")
  }

  const openProjectFileContextMenu = (event: ReactMouseEvent, file: ProjectFileTreeItem) => {
    event.preventDefault()
    event.stopPropagation()
    setProjectFileContextMenu({ file, x: event.clientX, y: event.clientY })
  }

  const startProjectFileCreate = (parent: ProjectFileTreeItem, kind: ProjectFileTreeItem["kind"]) => {
    setProjectFileContextMenu(null)
    setCollapsedProjectFileDirectories((current) => {
      if (!current.has(parent.path)) {
        return current
      }
      const next = new Set(current)
      next.delete(parent.path)
      return next
    })
    void loadProjectFileDirectory(parent.path)
    setProjectFileInlineEdit({
      mode: "create",
      parentPath: parent.path,
      parentDepth: parent.depth,
      kind,
      draft: kind === "file" ? "untitled" : "untitled-folder",
      error: null,
      isSaving: false
    })
  }

  const startProjectFileRename = (file: ProjectFileTreeItem) => {
    setProjectFileContextMenu(null)
    setProjectFileInlineEdit({
      mode: "rename",
      sourcePath: file.path,
      sourceName: file.name,
      kind: file.kind,
      draft: file.name,
      error: null,
      isSaving: false
    })
  }

  const cancelProjectFileInlineEdit = () => {
    setProjectFileInlineEdit(null)
  }

  const cancelProjectFileInlineEditOnBlur = () => {
    setProjectFileInlineEdit((current) => current?.isSaving ? current : null)
  }

  const setProjectFileInlineError = (message: string) => {
    setProjectFileInlineEdit((current) => current
      ? { ...current, error: message, isSaving: false }
      : current)
  }

  const commitProjectFileInlineEdit = async () => {
    const edit = projectFileInlineEdit
    if (!edit || !inspectedConversation) {
      return
    }

    const nextName = edit.draft.trim()
    if (!nextName || nextName.includes("/") || nextName.includes("\\")) {
      setProjectFileInlineError(tInspector("files.inline.invalid-name"))
      return
    }

    setProjectFileInlineEdit((current) => current
      ? { ...current, draft: nextName, error: null, isSaving: true }
      : current)

    if (edit.mode === "create") {
      const filePath = joinProjectFilePath(edit.parentPath, nextName)
      const result = await window.teamcow.createConversationFileEntry({
        conversationId: inspectedConversation.id,
        filePath,
        kind: edit.kind
      })
      if (result.status === "error") {
        setProjectFileInlineError(formatProjectFileMutationError(result.error))
        return
      }

      setProjectFileInlineEdit(null)
      void loadProjectFileDirectory(edit.parentPath, { force: true })
      if (result.status === "created" && result.entry.kind === "file") {
        setFileEditorState((current) => openConversationFileTab(current, {
          conversationId: result.entry.conversationId,
          filePath: result.entry.filePath,
          mode: "pinned"
        }))
      }
      return
    }

    if (nextName === edit.sourceName) {
      setProjectFileInlineEdit(null)
      return
    }

    const parentPath = edit.sourcePath.split("/").slice(0, -1).join("/")
    const result = await window.teamcow.renameConversationFileEntry({
      conversationId: inspectedConversation.id,
      sourcePath: edit.sourcePath,
      destinationPath: joinProjectFilePath(parentPath, nextName),
      kind: edit.kind
    })
    if (result.status === "error") {
      setProjectFileInlineError(formatProjectFileMutationError(result.error))
      return
    }

    setProjectFileInlineEdit(null)
    void loadProjectFileDirectory(parentPath, { force: true })
  }

  const requestProjectFileDelete = (file: ProjectFileTreeItem) => {
    setProjectFileContextMenu(null)
    setPendingProjectFileDelete(file)
  }

  const cancelPendingProjectFileDelete = () => {
    setPendingProjectFileDelete(null)
  }

  const confirmPendingProjectFileDelete = async () => {
    const file = pendingProjectFileDelete
    if (!file || !inspectedConversation) {
      return
    }

    const result = await window.teamcow.deleteConversationFileEntry({
      conversationId: inspectedConversation.id,
      filePath: file.path,
      kind: file.kind
    })
    if (result.status === "error") {
      setInspectorHandoffMessage({
        conversationId: inspectedConversation.id,
        tab: "files",
        tone: "error",
        text: formatProjectFileMutationError(result.error)
      })
      return
    }

    setPendingProjectFileDelete(null)
    void loadProjectFileDirectory(getProjectFileParentPath(file.path), { force: true })
  }

  const copyProjectFilePath = (path: string) => {
    void navigator.clipboard?.writeText(path)
    setProjectFileContextMenu(null)
  }

  const revealProjectFileInFinder = () => {
    if (!inspectedConversation || !projectFileContextMenu) {
      return
    }
    const file = projectFileContextMenu.file
    setProjectFileContextMenu(null)
    void window.teamcow.revealConversationFileEntry({
      conversationId: inspectedConversation.id,
      filePath: file.path
    })
  }

  useEffect(() => {
    return window.teamcow.onTerminalOutput((event: TerminalOutputEvent) => {
      if (event.status === "exited") {
        setTerminalPanelState((current) => {
          if (current.session?.sessionId !== event.sessionId || current.conversationId !== event.conversationId) {
            return current
          }
          return {
            ...current,
            status: "exited",
            session: {
              ...current.session,
              status: "exited",
              exitedAt: event.receivedAt,
              exitCode: event.exitCode ?? null
            },
            message: tInspector("terminal.status.exited")
          }
        })
      } else {
        setTerminalPanelState((current) => {
          if (current.session?.sessionId !== event.sessionId || current.conversationId !== event.conversationId) {
            return current
          }
          if (current.status !== "idle" && current.status !== "starting" && current.status !== "running") {
            return current
          }
          return {
            ...current,
            status: current.status === "idle" || current.status === "starting" ? "running" : current.status
          }
        })
      }

      if (event.data) {
        terminalInstanceRef.current?.write(event.data)
      }
    })
  }, [tInspector])

  const syncTerminalSize = useCallback((sessionId: string) => {
    const fit = fitAddonRef.current
    const term = terminalInstanceRef.current
    if (!fit || !term) return
    fit.fit()
    void window.teamcow.resizeTerminal({ sessionId, cols: term.cols, rows: term.rows })
  }, [])

  const visibleTerminalSessionIdRef = useRef<string | null>(null)
  visibleTerminalSessionIdRef.current = visibleTerminalSessionId

  useEffect(() => {
    if (terminalInstanceRef.current) {
      // Refit when switching back to the terminal tab — the container was
      // hidden (display:none) so xterm dimensions may be stale.
      if (inspectedInspectorTab === "terminal") {
        const rafId = requestAnimationFrame(() => {
          fitAddonRef.current?.fit()
          const sessionId = visibleTerminalSessionIdRef.current
          const term = terminalInstanceRef.current
          if (sessionId && term) {
            void window.teamcow.resizeTerminal({ sessionId, cols: term.cols, rows: term.rows })
          }
        })
        return () => cancelAnimationFrame(rafId)
      }
      return
    }

    if (inspectedInspectorTab !== "terminal") {
      return
    }
    let rafId: number | null = null
    const initializeTerminal = () => {
      if (cancelled) return
      const container = terminalContainerRef.current
      if (!container || terminalInstanceRef.current) return false

      const term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: readCssThemeColor("--font-mono", "ui-monospace, monospace"),
        fontSize: 12,
        scrollback: 5000,
        theme: readTerminalTheme()
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(container)
      fit.fit()
      term.onData((data) => {
        const sessionId = visibleTerminalSessionIdRef.current
        if (sessionId) {
          void window.teamcow.writeTerminalInput({ sessionId, data })
        }
      })
      terminalInstanceRef.current = term
      fitAddonRef.current = fit
      const sessionId = visibleTerminalSessionIdRef.current
      if (sessionId) {
        void window.teamcow.resizeTerminal({ sessionId, cols: term.cols, rows: term.rows })
      }
      return true
    }

    let cancelled = false
    if (!initializeTerminal()) {
      rafId = requestAnimationFrame(() => {
        initializeTerminal()
      })
    }

    return () => {
      cancelled = true
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [inspectedInspectorTab])

  useEffect(() => {
    const term = terminalInstanceRef.current
    if (!term) return
    term.options.theme = readTerminalTheme()
  }, [resolvedTheme])

  const openInspectedTerminal = async () => {
    if (!inspectedConversation) {
      return
    }

    const conversationId = inspectedConversation.id
    const previousSessionId = terminalPanelState.session?.sessionId
    const requestId = terminalRequestRef.current + 1
    terminalRequestRef.current = requestId
    if (!isInspectorPinned) {
      setActiveInspectorTab("terminal")
    } else {
      setPinnedInspectorContext((current) =>
        current && current.conversation.id === conversationId
          ? { ...current, tab: "terminal" }
          : current
      )
    }
    setTerminalPanelState({
      session: null,
      status: "starting",
      message: tInspector("terminal.starting"),
      conversationId
    })
    terminalInstanceRef.current?.clear()

    try {
      if (previousSessionId) {
        await window.teamcow.closeTerminal({ sessionId: previousSessionId })
      }
      const result = await window.teamcow.openConversationTerminal({ conversationId })
      if (terminalRequestRef.current !== requestId || inspectedConversationIdRef.current !== conversationId) {
        return
      }
      if (result.status === "error") {
        setTerminalPanelState({
          session: null,
          status: "error",
          message: formatDesktopError(result.error),
          conversationId
        })
        return
      }
      setTerminalPanelState({
        session: result.session,
        status: "running",
        message: tInspector("terminal.running"),
        conversationId
      })
      if (result.initialOutput) {
        terminalInstanceRef.current?.write(result.initialOutput)
      }
      syncTerminalSize(result.session.sessionId)
    } catch {
      if (terminalRequestRef.current !== requestId || inspectedConversationIdRef.current !== conversationId) {
        return
      }
      setTerminalPanelState({
        session: null,
        status: "error",
        message: [tErrors("TERMINAL_START_FAILED"), tErrors("fallback")].join(" "),
        conversationId
      })
    }
  }

  // Auto-start the terminal session when the Terminal tab becomes active for a
  // conversation that has no live session yet. This follows the implicit
  // lifecycle model of modern terminals (Codex Desktop, Warp): the session is
  // tied to the inspected context, so users never have to press "Start".
  const autoStartTerminalRef = useRef(openInspectedTerminal)
  autoStartTerminalRef.current = openInspectedTerminal
  useEffect(() => {
    if (inspectedInspectorTab !== "terminal" || !inspectedConversation) {
      return
    }
    if (visibleTerminalPanelState.status === "idle") {
      void autoStartTerminalRef.current()
    }
  }, [inspectedInspectorTab, inspectedConversation, visibleTerminalPanelState.status])

  useEffect(() => {
    if (!visibleTerminalSessionId || visibleTerminalStatus !== "running") {
      return
    }

    const sessionId = visibleTerminalSessionId
    const handleResize = () => syncTerminalSize(sessionId)
    window.addEventListener("resize", handleResize)
    const container = terminalContainerRef.current
    const observer = typeof ResizeObserver !== "undefined" && container
      ? new ResizeObserver(handleResize)
      : null
    if (observer && container) {
      observer.observe(container)
    }
    return () => {
      window.removeEventListener("resize", handleResize)
      observer?.disconnect()
    }
  }, [syncTerminalSize, visibleTerminalSessionId, visibleTerminalStatus])

  const openInspectedFile = (filePath: string | null | undefined) => {
    if (!inspectedConversation || !filePath) {
      return
    }

    void openConversationHandoffTarget({
      conversationId: inspectedConversation.id,
      target: "file",
      filePath
    })
  }

  const unpinInspectorContext = () => {
    conversationChangesRequestRef.current += 1
    conversationChangeSelectionIntentVersionRef.current += 1
    preferredConversationChangePathRef.current = null
    conversationChangesSnapshotRef.current = null
    selectedConversationChangeRef.current = null
    conversationChangesContextRef.current = {
      conversationId: activeConversation?.id ?? null,
      pinned: false,
      tab: activeInspectorTab
    }
    setInspectorFocusMode("follow")
    setPinnedInspectorContext(null)
    setConversationChanges(null)
    setConversationChangesStateConversationId(null)
    setConversationChangesLoadState("idle")
    setConversationChangesError(null)
    setConversationChangesStale(false)
    setSelectedConversationChange(null)
    setConversationChangesCommitDraft(null)
    setConversationGitStatus(null)
    setConversationGitStatusLoadState("idle")
    setConversationGitStatusError(null)
    setConversationProjectFiles(null)
    setConversationProjectFilesLoadState("idle")
    setConversationProjectFilesError(null)
    setCollapsedProjectFileDirectories(new Set())
    setLoadedProjectFileDirectories(new Set())
    resetProjectFileDirectoryRequests()
  }

  const pinInspectorContext = () => {
    if (!activeConversation || !canPinInspectorContext) {
      return
    }

    conversationChangesRequestRef.current += 1
    conversationChangesContextRef.current = {
      conversationId: activeConversation.id,
      pinned: true,
      tab: activeInspectorTab
    }
    setPinnedInspectorContext({
      conversation: activeConversation,
      timeline: activeTimeline,
      timelineStatus: activeTimelineStatus,
      tab: activeInspectorTab,
      changesSnapshot: conversationChanges,
      changesLoadState: conversationChangesLoadState,
      changesError: conversationChangesError,
      changesStale: conversationChangesStale,
      selectedChange: selectedConversationChange,
      gitStatus: conversationGitStatus,
      gitStatusLoadState: conversationGitStatusLoadState,
      gitStatusError: conversationGitStatusError,
      pinnedAt: new Date().toISOString()
    })
    setInspectorFocusMode("pinned")
  }

  const toggleInspectorPin = () => {
    if (isInspectorPinned) {
      unpinInspectorContext()
      return
    }

    pinInspectorContext()
  }

  const renderCompareCard = (
    conversation: ConversationSummary,
    timeline: ConversationTimeline | null,
    side: "active" | "target",
    timelineStatus: CompareTimelineStatus
  ) => {
    const files = getChangedFileItems(timeline, tShell)
    const summary = getCompareSummaryCopy(timeline, timelineStatus, tShell, tCommon)
    const worktreeLabel = getConversationWorktreeLabel(conversation)
    const runStatusLabel = tCommon(`state.${conversation.runStatus}`, { defaultValue: conversation.runStatus })
    const shownFiles = files.slice(0, 6)
    const hiddenFileCount = files.length - shownFiles.length

    return (
      <section className={`compare-card ${side}`} data-testid={`compare-card-${conversation.id}`}>
        <div className="compare-card-head">
          <div className="compare-card-title">
            <span>{side === "active" ? tShell("compare.side.active") : tShell("compare.side.target")}</span>
            <strong>{conversation.title}</strong>
          </div>
          <button
            className="btn sm"
            type="button"
            data-testid={`compare-follow-up-${conversation.id}`}
            onClick={() => openCompareFollowUp(conversation)}
          >
            {tShell("compare.follow-up")}
          </button>
        </div>

        <div className="compare-meta-row">
          <span className={`ttag ${getProviderTone(conversation.provider.kind)}`}>
            {getProviderLabel(conversation.provider.kind, tProvider)}
          </span>
          <span className={`ttag status-chip ${getRunStatusTone(conversation.runStatus)}`}>
            {runStatusLabel}
          </span>
          <span className={`ttag ${conversation.worktree.kind === "default" ? "default" : "worktree"}`}>
            {getConversationWorktreeKindLabel(conversation, tShell)}
          </span>
        </div>

        <div className="compare-context-list">
          <div>
            <span>{tShell("chip.worktree")}</span>
            <strong title={conversation.worktree.rootPath}>{worktreeLabel}</strong>
          </div>
          <div>
            <span>{tShell("compare.worktree.path")}</span>
            <strong title={conversation.worktree.rootPath}>{conversation.worktree.rootPath}</strong>
          </div>
          <div>
            <span>{tShell("launcher.field.model")}</span>
            <strong>{conversation.currentModel}</strong>
          </div>
        </div>

        <div className="compare-section">
          <span className="compare-section-label">{tShell("compare.summary.title")}</span>
          <p>{summary}</p>
        </div>

        <div className="compare-section">
          <span className="compare-section-label">{tShell("compare.files.title")}</span>
          {timelineStatus === "loading" || timelineStatus === "error" ? (
            <p>{timelineStatus === "loading" ? tShell("compare.files.loading") : tShell("compare.files.error")}</p>
          ) : files.length > 0 ? (
            <ul className="compare-files-list">
              {shownFiles.map((file) => (
                <li data-testid={`compare-file-${conversation.id}-${file}`} key={file}>{file}</li>
              ))}
              {hiddenFileCount > 0 ? (
                <li className="compare-files-more">
                  {tShell("compare.files.more", { count: hiddenFileCount })}
                </li>
              ) : null}
            </ul>
          ) : (
            <p>{tShell("compare.files.empty")}</p>
          )}
        </div>
      </section>
    )
  }

  const accessModeOptions: LauncherSelectOption[] = [
    {
      id: "read-only",
      label: tShell("launcher.access-mode.read-only.label"),
      detail: tShell("launcher.access-mode.read-only.detail")
    },
    {
      id: "worktree-write",
      label: tShell("launcher.access-mode.worktree-write.label"),
      detail: tShell("launcher.access-mode.worktree-write.detail"),
      meta: tShell("launcher.access-mode.default")
    },
    {
      id: "full-access",
      label: tShell("launcher.access-mode.full-access.label"),
      detail: tShell("launcher.access-mode.full-access.detail"),
      meta: tShell("launcher.access-mode.high-trust")
    }
  ]

  const modalSummary = currentProject && selectedProviderKind && selectedModelId && selectedWorktreeTarget
    ? tShell("launcher.summary", {
        project: currentProject.name,
        worktree: selectedWorktreeTarget === "new-worktree"
          ? trimmedNewWorktreeBranch || tShell("launcher.target.branch-placeholder")
          : selectedWorktreeTarget === "existing-worktree"
            ? getWorktreeDisplay(selectedWorktree, tShell)
            : getWorktreeDisplay(defaultWorktree, tShell),
        provider: getProviderLabel(selectedProviderKind, tProvider),
        model: modelOptions.find((model) => model.id === selectedModelId)?.label ?? selectedModelId
      })
    : tShell("launcher.summary-idle")

  const inspectorTabs: Array<{ id: InspectorTab; label: string }> = [
    { id: "files", label: tInspector("tabs.files") },
    { id: "terminal", label: tInspector("tabs.terminal") },
    { id: "changes", label: tInspector("tabs.changes") },
    { id: "git", label: tInspector("tabs.git") }
  ]
  const providerOptions: LauncherSelectOption[] = providerReadiness.snapshot.providers.map((provider) => {
    const copy = getProviderReadinessCopy(provider)
    const boundaryCopy = getProviderBoundaryCopy(provider)
    const providerLabel = getProviderLabel(provider.kind, tProvider)
    const detailLines = [
      tProvider(copy.detailKey, {
        provider: providerLabel,
        ...(provider.issues[0]?.params ?? {})
      }),
      boundaryCopy.repairKey
        ? tProvider(boundaryCopy.repairKey, {
            provider: providerLabel,
            ...(provider.issues[0]?.params ?? {})
          })
        : null,
      provider.availability !== "ready" ? tProvider(boundaryCopy.localCapabilityKey) : null,
      provider.availability !== "ready" ? tProvider(boundaryCopy.providerRequiredKey) : null
    ].filter(Boolean).join(" ")
    return {
      id: provider.kind,
      label: providerLabel,
      detail: detailLines,
      meta: tProvider(`status.${provider.availability}`),
      disabled: provider.availability !== "ready"
    }
  })
  const modelSelectOptions: LauncherSelectOption[] = modelOptions.map((model) => ({
    id: model.id,
    label: getProviderModelLabel(selectedProviderKind, model, tShell),
    detail: getProviderModelDetail(selectedProviderKind, model, tShell)
  }))
  const selectedModelOption = modelSelectOptions.find((option) => option.id === selectedModelId) ?? null
  const selectedModelForDetail = selectedProviderKind && selectedModelId
    ? modelOptions.find((model) => model.id === selectedModelId)
    : null
  const worktreeOptions: LauncherSelectOption[] = [
    ...(defaultWorktree
      ? [{
          id: "default",
          label: defaultWorktree.branch ?? getShortWorktreeName(defaultWorktree.rootPath),
          detail: tShell("launcher.worktree.current-project"),
          meta: currentProject?.name ?? ""
        }]
      : []),
    ...independentWorktrees.map((worktree) => ({
      id: worktree.id,
      label: worktree.branch ?? getShortWorktreeName(worktree.rootPath),
      detail: worktree.rootPath,
      meta: tShell("launcher.target.existing")
    })),
    {
      id: "new-worktree",
      label: tShell("launcher.target.new"),
      detail: tShell("launcher.target.new-branch-hint"),
      meta: tShell("launcher.target.new-recommended")
    }
  ]
  const selectedWorktreeOption = worktreeOptions.find((option) =>
    selectedWorktreeTarget === "existing-worktree"
      ? option.id === selectedWorktreeId
      : option.id === selectedWorktreeTarget
  ) ?? null
  const runWithProviderLabel = selectedProviderKind
    ? getProviderLabel(selectedProviderKind, tProvider)
    : ""
  const runWithModelLabel = selectedModelOption?.label ?? (
    selectedProviderKind
      ? tShell("launcher.model.placeholder")
      : tShell("launcher.model.select-provider-first")
  )
  const runWithValue = runWithProviderLabel
    ? `${runWithProviderLabel} / ${runWithModelLabel}`
    : tShell("launcher.run-with.placeholder")
  const renderActiveChatItem = (item: ChatRenderItem) => renderChatItem(
    item,
    tChat,
    tCommon,
    item.kind === "provider-activity" || item.kind === "system-summary" || item.kind === "tool-event" || item.kind === "raw-fallback"
      ? (() => {
          const block = getReviewableDiffBlockForRun(activeInspectorDiffBlocks, item.runId)
          return block
            ? {
                block,
                onSelect: selectInspectorDiff,
                onOpenFile: openInspectedFile,
                disabledReason: isInspectorPinned ? tInspector("pin.review-blocked") : undefined
              }
            : undefined
        })()
      : undefined,
    {
      onAllow: handlePermissionRetry,
      onDismiss: handlePermissionDismiss
    },
    setImagePreview
  )

  return (
    <ShellLayout
      windowProject={context.shell.projectName ?? undefined}
      windowBranch={currentWorktreeLabel || undefined}
      windowStatus={shellRunStatusDisplay}
      headerActions={
        <>
          <div className="header-open-location" ref={externalOpenMenuRef}>
            <button
              className="header-open-location__main"
              type="button"
              data-testid="header-open-location"
              disabled={!activeConversation || !resolvedDefaultExternalOpenOption || externalOpenPendingAppId !== null}
              aria-busy={externalOpenPendingAppId !== null}
              title={activeConversation ? tShell("header.open-location") : tShell("header.open-location-disabled")}
              onClick={() => void openActiveConversationLocation(resolvedDefaultExternalOpenOption?.id ?? null)}
            >
              {resolvedDefaultExternalOpenOption?.iconDataUrl ? (
                <img
                  className="header-open-location__main-icon"
                  src={resolvedDefaultExternalOpenOption.iconDataUrl}
                  alt=""
                  aria-hidden="true"
                />
              ) : (
                <span className="header-open-location__main-icon-fallback" aria-hidden="true">
                  {resolvedDefaultExternalOpenOption?.label.slice(0, 1) ?? ""}
                </span>
              )}
              <span className="header-open-location__main-label">{tShell("header.open-location")}</span>
            </button>
            <button
              className="header-open-location__trigger"
              type="button"
              data-testid="header-open-location-menu-trigger"
              disabled={!activeConversation || externalOpenPendingAppId !== null}
              aria-expanded={externalOpenMenuOpen}
              aria-label={tShell("header.open-location-menu")}
              title={tShell("header.open-location-menu")}
              onClick={() => setExternalOpenMenuOpen((open) => !open)}
            >
              <FontAwesomeIcon icon={faChevronDown} />
            </button>
            {externalOpenMenuOpen ? (
              <div className="header-open-location__menu" data-testid="header-open-location-menu" role="menu">
                {externalOpenGroups.length > 0 ? (
                  externalOpenGroups.map((group) => (
                    <div className="header-open-location__group" key={group.id}>
                      <div className="header-open-location__group-label">{group.label}</div>
                      {group.options.map((option) => (
                        <button
                          className="header-open-location__item"
                          type="button"
                          role="menuitem"
                          data-testid={`header-open-location-option-${option.id}`}
                          key={option.id}
                          onClick={() => void openActiveConversationLocation(option.id)}
                        >
                          <span className="header-open-location__item-label">
                            {option.iconDataUrl ? (
                              <img
                                className="header-open-location__icon"
                                src={option.iconDataUrl}
                                alt=""
                                aria-hidden="true"
                              />
                            ) : (
                              <span className="header-open-location__icon-fallback" aria-hidden="true">
                                {option.label.slice(0, 1)}
                              </span>
                            )}
                            <span className="header-open-location__item-text">{option.label}</span>
                          </span>
                          {resolvedDefaultExternalOpenOption?.id === option.id ? <FontAwesomeIcon icon={faCheck} /> : null}
                        </button>
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="header-open-location__empty">{tShell("header.open-location-empty")}</div>
                )}
              </div>
            ) : null}
            {externalOpenMessage ? (
              <span className={`header-open-location__message ${externalOpenMessage.tone}`}>{externalOpenMessage.text}</span>
            ) : null}
          </div>
          <button
            className="settings-btn"
            type="button"
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-label={tSettings("title")}
            title={tSettings("title")}
          >
            <FontAwesomeIcon icon={faGear} />
          </button>
        </>
      }
      sidebar={
        <>
          <div className="brand-row">
            <div className="brand-icon" aria-hidden="true">
              <img className="brand-logo" src={teamCowLogoUrl} alt="" />
            </div>
            <div className="brand-info">
              <strong>{tCommon("app.name")}</strong>
              <span>{tCommon("app.tagline")}</span>
            </div>
            <button className="new-btn" type="button" disabled={isBusy} onClick={() => void importProject()}>
              + {tShell("sidebar.new-btn")}
            </button>
          </div>

          <div className="sidebar-scroll">
          <div className="sb-label">{tShell("sidebar.projects-label")}</div>
          {hasProjects ? (
            projectSummaries.map((project) => {
              const sortedProjectConversations = sortConversationsByRecentActivity(project.conversations)
              const hasConversationOverflow = sortedProjectConversations.length > SIDEBAR_CONVERSATION_PREVIEW_LIMIT
              const isConversationListExpanded = expandedConversationProjects.has(project.id)
              const visibleProjectConversations = hasConversationOverflow && !isConversationListExpanded
                ? sortedProjectConversations.slice(0, SIDEBAR_CONVERSATION_PREVIEW_LIMIT)
                : sortedProjectConversations
              const hiddenConversationCount = sortedProjectConversations.length - SIDEBAR_CONVERSATION_PREVIEW_LIMIT

              return (
              <div className={`proj-group${project.isCurrent ? " open" : ""}${project.isCurrent && collapsedProjects.has(project.id) ? " collapsed" : ""}`} key={project.id}>
                <div
                  className="proj-row proj-row-btn"
                  role="button"
                  tabIndex={0}
                  aria-disabled={isBusy}
                  onContextMenu={(event) => openProjectMenu(event, project.id)}
                  onClick={() => {
                    if (isBusy) return
                    if (project.isCurrent) {
                      setCollapsedProjects((prev) => {
                        const next = new Set(prev)
                        if (next.has(project.id)) {
                          next.delete(project.id)
                        } else {
                          next.add(project.id)
                        }
                        return next
                      })
                    } else {
                      setCollapsedProjects((prev) => {
                        if (!prev.has(project.id)) return prev
                        const next = new Set(prev)
                        next.delete(project.id)
                        return next
                      })
                      void selectProject(project.id)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (!isBusy && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault()
                      if (project.isCurrent) {
                        setCollapsedProjects((prev) => {
                          const next = new Set(prev)
                          if (next.has(project.id)) {
                            next.delete(project.id)
                          } else {
                            next.add(project.id)
                          }
                          return next
                        })
                      } else {
                        setCollapsedProjects((prev) => {
                          if (!prev.has(project.id)) return prev
                          const next = new Set(prev)
                          next.delete(project.id)
                          return next
                        })
                        void selectProject(project.id)
                      }
                    }
                  }}
                >
                  <div className="proj-icon" aria-hidden="true">
                    <FontAwesomeIcon icon={project.isCurrent && !collapsedProjects.has(project.id) ? faChevronDown : faChevronRight} />
                  </div>
                  <div className="proj-info" title={project.rootPath}>
                    <strong>{project.name}</strong>
                    <span>{getProjectSummary(project, tShell)}</span>
                  </div>
                  <button
                    className="proj-add-btn"
                    type="button"
                    aria-label={tShell("sidebar.new-conversation")}
                    title={tShell("sidebar.new-conversation")}
                    onClick={(event) => {
                      event.stopPropagation()
                      void openLauncher(project.id)
                    }}
                  >
                    <FontAwesomeIcon icon={faCirclePlus} />
                  </button>
                </div>

                {project.isCurrent ? (
                  <div className="conv-list">
                    {sortedProjectConversations.length > 0 ? (
                      <>
                      {visibleProjectConversations.map((conversation) => {
                        const isRenaming = renamingConversationId === conversation.id
                        const relativeUpdatedAt = formatConversationRelativeTime(conversation.updatedAt, displayLocale)
                        const isLinkedWorktree = conversation.worktree.kind !== "default"
                        return (
                        <div
                          className={`conv-item${conversation.isCurrent ? " active" : ""}`}
                          key={conversation.id}
                          role="button"
                          tabIndex={0}
                          aria-disabled={isBusy}
                          onClick={() => {
                            if (!isBusy && !isRenaming) {
                              void selectConversation(conversation.id)
                            }
                          }}
                          onContextMenu={(event) => openConversationMenu(event, conversation.id)}
                          onKeyDown={(event) => {
                            if (!isRenaming && !isBusy && (event.key === "Enter" || event.key === " ")) {
                              event.preventDefault()
                              void selectConversation(conversation.id)
                            }
                          }}
                        >
                          <div
                            className="conv-info"
                            title={`${conversation.worktree.rootPath}${conversation.worktree.branch ? ` (${conversation.worktree.branch})` : ""}`}
                          >
                            {isRenaming ? (
                              <input
                                ref={renameInputRef}
                                className="conv-rename-input"
                                type="text"
                                value={renameDraft}
                                aria-label={tShell("conversation.menu.rename")}
                                placeholder={tShell("conversation.rename.placeholder")}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => setRenameDraft(event.target.value)}
                                onBlur={() => void commitRenameConversation(conversation)}
                                onKeyDown={(event) => {
                                  event.stopPropagation()
                                  if (event.key === "Enter") {
                                    event.preventDefault()
                                    void commitRenameConversation(conversation)
                                  } else if (event.key === "Escape") {
                                    event.preventDefault()
                                    cancelRenameConversation()
                                  }
                                }}
                              />
                            ) : (
                              <strong>{conversation.title}</strong>
                            )}
                            <span className="conv-worktree-line">
                              <span className="conv-worktree-identity">
                                {isLinkedWorktree ? (
                                  <>
                                    <FontAwesomeIcon className="conv-worktree-icon" icon={faCodeBranch} aria-hidden="true" />
                                    <span className="conv-worktree-label">{tShell("conversation.worktree-marker")}</span>
                                    <span className="conv-worktree-separator" aria-hidden="true">·</span>
                                  </>
                                ) : null}
                                <span className="conv-worktree-branch">{getConversationWorktreeLabel(conversation)}</span>
                              </span>
                              {relativeUpdatedAt ? (
                                <time
                                  className="conv-updated-time"
                                  dateTime={conversation.updatedAt}
                                  title={formatConversationUpdatedTitle(conversation.updatedAt, displayLocale)}
                                >
                                  {relativeUpdatedAt}
                                </time>
                              ) : null}
                            </span>
                          </div>
                          <div className="conv-item-tags">
                            <span className={`ttag provider-tag ${getProviderTone(conversation.provider.kind)}`}>
                              <span className="provider-tag-label">
                                {getProviderLabel(conversation.provider.kind, tProvider)}
                              </span>
                            </span>
                            <span className={`ttag status-chip ${getRunStatusTone(conversation.runStatus)}`}>
                              {tCommon(`state.${conversation.runStatus}`, { defaultValue: conversation.runStatus })}
                            </span>
                          </div>
                        </div>
                        )
                      })}
                      {hasConversationOverflow ? (
                        <button
                          className="conv-list-toggle"
                          type="button"
                          aria-expanded={isConversationListExpanded}
                          data-testid={`sidebar-conversation-toggle-${project.id}`}
                          onClick={() => {
                            setExpandedConversationProjects((prev) => {
                              const next = new Set(prev)
                              if (next.has(project.id)) {
                                next.delete(project.id)
                              } else {
                                next.add(project.id)
                              }
                              return next
                            })
                          }}
                        >
                          <FontAwesomeIcon icon={isConversationListExpanded ? faChevronUp : faChevronDown} />
                          <span>
                            {isConversationListExpanded
                              ? tShell("sidebar.conversation-show-fewer")
                              : tShell("sidebar.conversation-show-more", { count: hiddenConversationCount })}
                          </span>
                        </button>
                      ) : null}
                      </>
                    ) : (
                      <div className="conv-empty">
                        <span>{tShell("sidebar.no-conversations")}</span>
                        <button className="conv-empty-btn" type="button" onClick={() => void openLauncher(project.id)}>
                          <FontAwesomeIcon icon={faPenToSquare} />
                          {tShell("sidebar.new-conversation")}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              )
            })
          ) : (
            <div className="conv-empty sidebar-empty">
              <span>{tShell("sidebar.no-projects")}</span>
              <button className="conv-empty-btn" type="button" disabled={isBusy} onClick={() => void importProject()}>
                {tShell("sidebar.import-project")}
              </button>
            </div>
          )}
          </div>
          <div className="sidebar-footer">
          <div className="sb-label sb-label-bottom">{tShell("sidebar.binding-label")}</div>
          <div className="binding-row">
            <div className="binding-info">
              <strong>{shellProjectDisplay}</strong>
              <span title={currentWorktreePath}>{currentWorktreePathDisplay}</span>
            </div>
            <span className="ttag status-chip idle">{hasProjects ? tCommon("state.ready") : tCommon("state.empty")}</span>
          </div>
          <div className="binding-row active">
            <div className="binding-info">
              <strong>{shellConversationDisplay}</strong>
              <span title={currentWorktreePath}>{currentWorktreeLabel || tShell("shell.default-worktree")}</span>
            </div>
            <span className={`ttag status-chip ${getRunStatusTone(context.shell.runStatus)}`}>{shellRunStatusDisplay}</span>
          </div>
          <div className="binding-row">
            <div className="binding-info">
              <strong>{shellProviderDisplay}</strong>
              <span>{tShell("sidebar.provider-label")}</span>
            </div>
            <span className="ttag status-chip idle">{tCommon("state.later")}</span>
          </div>
          </div>
        </>
      }
      inspector={
        <>
          <div className="inspector-tabbar">
            <div className="tabs" role="tablist">
              {inspectorTabs.map((tab) => (
                <button
                  className={`tab${inspectedInspectorTab === tab.id ? " active" : ""}`}
                  type="button"
                  key={tab.id}
                  role="tab"
                  aria-selected={inspectedInspectorTab === tab.id}
                  data-testid={`inspector-tab-${tab.id}`}
                  disabled={isInspectorPinned && inspectedInspectorTab !== tab.id}
                  onClick={() => {
                    if (!isInspectorPinned) {
                      setActiveInspectorTab(tab.id)
                    }
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              className="inspector-pin-toggle"
              type="button"
              aria-label={isInspectorPinned ? tInspector("pin.action.unpin") : tInspector("pin.action.pin")}
              aria-pressed={isInspectorPinned}
              title={isInspectorPinned ? tInspector("pin.action.unpin") : tInspector("pin.action.pin")}
              data-testid="inspector-pin-toggle"
              disabled={!isInspectorPinned && !canPinInspectorContext}
              onClick={toggleInspectorPin}
            >
              <FontAwesomeIcon icon={faThumbtack} />
            </button>
          </div>

          <div
            className="panel inspector-stack-panel"
            ref={inspectorStackPanelRef}
            onScroll={handleInspectorStackScroll}
          >
            {inspectorPinnedActiveMismatch ? (
              <p className="inspector-pin-mismatch" data-testid="inspector-pin-mismatch" title={inspectorPinnedActiveMismatchCopy}>
                {inspectorPinnedActiveMismatchCopy}
              </p>
            ) : null}
            {visibleInspectorHandoffMessage ? (
              <p className={`inspector-handoff-message ${visibleInspectorHandoffMessage.tone}`} data-testid="inspector-handoff-message">
                {visibleInspectorHandoffMessage.text}
              </p>
            ) : null}
            <div className="inspector-terminal-panel" data-testid="inspector-terminal-panel" hidden={inspectedInspectorTab !== "terminal"}>
              <div className="inspector-terminal-header">
                <div className="inspector-terminal-title">
                  <strong>{tInspector("terminal.title")}</strong>
                  {inspectedInspectorTab === "terminal" ? (
                    <span>
                      {isInspectorPinned && inspectedConversation
                        ? tInspector("terminal.pinned-context", { title: inspectedConversation.title })
                        : inspectedConversation
                          ? tInspector("terminal.follow-context", { title: inspectedConversation.title })
                          : tInspector("terminal.no-context")}
                    </span>
                  ) : null}
                </div>
                <div className="inspector-terminal-actions">
                  <button
                    className="inspector-terminal-icon-action"
                    type="button"
                    aria-label={tInspector("terminal.action.restart")}
                    title={tInspector("terminal.action.restart")}
                    data-testid="terminal-restart-session"
                    disabled={!inspectedConversation || terminalPanelState.status === "starting"}
                    aria-busy={terminalPanelState.status === "starting"}
                    onClick={() => void openInspectedTerminal()}
                  >
                    <FontAwesomeIcon icon={faRotateRight} />
                  </button>
                </div>
              </div>
              <div className="inspector-terminal-meta">
                {visibleTerminalPanelState.session ? (
                  <>
                    <span className="inspector-terminal-cwd" title={visibleTerminalPanelState.session.cwd}>
                      {tInspector("terminal.cwd", { cwd: visibleTerminalPanelState.session.cwd })}
                    </span>
                    <span className={`inspector-terminal-status ${visibleTerminalPanelState.session.status}`}>
                      {tInspector(`terminal.status.${visibleTerminalPanelState.session.status}`)}
                    </span>
                  </>
                ) : (
                  <span className="inspector-terminal-empty">{visibleTerminalPanelState.message ?? tInspector("terminal.empty")}</span>
                )}
              </div>
              {visibleTerminalPanelState.message && visibleTerminalPanelState.status !== "running" ? (
                <p className={`inspector-terminal-message ${visibleTerminalPanelState.status}`} data-testid="terminal-status-message">
                  {visibleTerminalPanelState.message}
                </p>
              ) : null}
              <div
                className="inspector-terminal-output"
                data-testid="terminal-output"
                ref={terminalContainerRef}
              />
            </div>
            <div className="inspector-files-panel" data-testid="inspector-files-panel" hidden={inspectedInspectorTab !== "files"}>
              {inspectedProjectFilesLoadState === "loading" ? (
                <p className="inspector-files-message">{tInspector("files.loading")}</p>
              ) : inspectedProjectFilesLoadState === "unavailable" ? (
                <p className="inspector-files-message">{inspectedProjectFilesError ?? tInspector("files.unavailable")}</p>
              ) : inspectedProjectFilesLoadState === "error" ? (
                <p className="inspector-files-message error">{inspectedProjectFilesError ?? tInspector("files.error")}</p>
              ) : inspectedProjectFiles && visibleInspectorProjectFiles.length > 0 ? (
                <>
                  <div
                    className="inspector-files-list project-tree virtualized"
                    role="tree"
                    ref={projectTreeListRef}
                    style={{ height: `${projectTreeHeight}px` }}
                  >
                    {projectTreeVirtualRows.map(({ row, rowIndex }) => {
                      if (row.kind === "inline-create") {
                        const edit = projectFileInlineEdit?.mode === "create" ? projectFileInlineEdit : null
                        if (!edit) {
                          return null
                        }
                        const rowStyle = {
                          paddingLeft: `${Math.min(row.parentDepth + 1, 8) * 14 + 8}px`,
                          top: `${rowIndex * PROJECT_FILE_ROW_HEIGHT}px`
                        }
                        return (
                          <div
                            className="inspector-file-row project-file inline-edit"
                            key={`inline-create-${row.parentPath}-${edit.kind}`}
                            data-testid="project-file-inline-row"
                            role="treeitem"
                            style={rowStyle}
                          >
                            <span className="project-file-chevron-spacer" aria-hidden="true" />
                            <FileIcon
                              fileName={edit.draft}
                              isDirectory={edit.kind === "directory"}
                              isOpen={edit.kind === "directory"}
                              className="project-file-icon"
                            />
                            <input
                              ref={projectFileInlineInputRef}
                              className="project-file-inline-input"
                              data-testid="project-file-inline-input"
                              value={edit.draft}
                              disabled={edit.isSaving}
                              aria-label={edit.kind === "directory" ? tInspector("files.inline.new-folder") : tInspector("files.inline.new-file")}
                              onChange={(event) => {
                                const nextValue = event.currentTarget.value
                                setProjectFileInlineEdit((current) => current
                                  ? { ...current, draft: nextValue, error: null }
                                  : current)
                              }}
                              onClick={(event) => event.stopPropagation()}
                              onBlur={cancelProjectFileInlineEditOnBlur}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault()
                                  void commitProjectFileInlineEdit()
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault()
                                  cancelProjectFileInlineEdit()
                                }
                              }}
                            />
                            {edit.error ? <span className="project-file-inline-error">{edit.error}</span> : null}
                          </div>
                        )
                      }

                      const file = row.file
                      const isFile = file.kind === "file"
                      const isExpandableDirectory = file.kind === "directory" &&
                        !file.isSymlink
                      const isCollapsed = collapsedProjectFileDirectories.has(file.path)
                      const rowStyle = {
                        paddingLeft: `${Math.min(file.depth, 8) * 14 + 8}px`,
                        top: `${rowIndex * PROJECT_FILE_ROW_HEIGHT}px`
                      }
                      const isRenaming = projectFileInlineEdit?.mode === "rename" &&
                        projectFileInlineEdit.sourcePath === file.path

                      if (isRenaming) {
                        const edit = projectFileInlineEdit
                        return (
                          <div
                            className={`inspector-file-row project-file inline-edit${file.kind === "directory" ? " directory" : ""}`}
                            key={file.path}
                            data-testid={`inspector-project-file-${file.path}`}
                            role="treeitem"
                            style={rowStyle}
                          >
                            <span className="project-file-chevron-spacer" aria-hidden="true" />
                            <FileIcon
                              fileName={file.name}
                              isDirectory={file.kind === "directory"}
                              isOpen={file.kind === "directory" && !isCollapsed}
                              className="project-file-icon"
                            />
                            <input
                              ref={projectFileInlineInputRef}
                              className="project-file-inline-input"
                              data-testid="project-file-inline-input"
                              value={edit.draft}
                              disabled={edit.isSaving}
                              aria-label={tInspector("files.inline.rename")}
                              onChange={(event) => {
                                const nextValue = event.currentTarget.value
                                setProjectFileInlineEdit((current) => current
                                  ? { ...current, draft: nextValue, error: null }
                                  : current)
                              }}
                              onClick={(event) => event.stopPropagation()}
                              onBlur={cancelProjectFileInlineEditOnBlur}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault()
                                  void commitProjectFileInlineEdit()
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault()
                                  cancelProjectFileInlineEdit()
                                }
                              }}
                            />
                            {edit.error ? <span className="project-file-inline-error">{edit.error}</span> : null}
                          </div>
                        )
                      }

                      if (!isFile) {
                        return (
                          <button
                            className="inspector-file-row project-file directory"
                            type="button"
                            key={file.path}
                            data-testid={`inspector-project-file-${file.path}`}
                            role="treeitem"
                            aria-expanded={isExpandableDirectory ? !isCollapsed : undefined}
                            style={rowStyle}
                            onContextMenu={(event) => openProjectFileContextMenu(event, file)}
                            onClick={() => {
                              if (isExpandableDirectory) {
                                toggleProjectFileDirectory(file.path)
                              }
                            }}
                          >
                            <FontAwesomeIcon icon={isCollapsed ? faChevronRight : faChevronDown} />
                            <FileIcon
                              fileName={file.name}
                              isDirectory={true}
                              isOpen={!isCollapsed}
                              className="project-file-icon"
                            />
                            <span className="inspector-project-file-name" title={file.path}>{file.name}</span>
                          </button>
                        )
                      }

                      return (
                        <button
                          className="inspector-file-row project-file"
                          type="button"
                          key={file.path}
                          data-testid={`inspector-project-file-${file.path}`}
                          role="treeitem"
                          style={rowStyle}
                          onContextMenu={(event) => openProjectFileContextMenu(event, file)}
                          onClick={() => openFileInEditorWorkspace(file.path, "preview")}
                          onDoubleClick={() => openFileInEditorWorkspace(file.path, "pinned")}
                        >
                          <span className="project-file-chevron-spacer" aria-hidden="true" />
                          <FileIcon fileName={file.name} className="project-file-icon" />
                          <span className="inspector-project-file-name" title={file.path}>{file.name}</span>
                        </button>
                      )
                    })}
                    {inspectedProjectFiles.truncated ? (
                      <p className="inspector-files-more">{tInspector("files.truncated")}</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="inspector-files-message">{tInspector("files.empty")}</p>
              )}
            </div>
            <div className="inspector-changes-panel-host" data-testid="inspector-changes-panel" hidden={inspectedInspectorTab !== "changes"}>
              <InspectorChangesPanel
                snapshot={inspectedChanges}
                selected={inspectedSelectedChange}
                listLoading={inspectedChangesLoadState === "loading"}
                stale={inspectedChangesStale}
                listError={inspectedChangesError}
                listUnavailable={inspectedChangesLoadState === "unavailable"}
                readOnly={isInspectorPinned}
                pendingMutation={inspectedChangesPendingMutation}
                commitMessage={inspectedChangesCommitMessage}
                onRefresh={() => {
                  if (!isInspectorPinned && inspectedConversationId) {
                    refreshConversationChanges(inspectedConversationId)
                  }
                }}
                onSelect={(selection) => {
                  if (isInspectorPinned) {
                    return
                  }
                  conversationChangeSelectionIntentVersionRef.current += 1
                  preferredConversationChangePathRef.current = null
                  selectedConversationChangeRef.current = selection
                  setSelectedConversationChange(selection)
                }}
                onStage={(scope) => {
                  void runConversationChangesMutation(
                    scope,
                    "unstaged",
                    "staged",
                    window.teamcow.stageConversationChanges,
                    (input) => input
                  )
                }}
                onUnstage={(scope) => {
                  void runConversationChangesMutation(
                    scope,
                    "staged",
                    "unstaged",
                    window.teamcow.unstageConversationChanges,
                    (input) => input
                  )
                }}
                onDiscard={(scope) => {
                  void runConversationChangesMutation(
                    scope,
                    "unstaged",
                    null,
                    window.teamcow.discardConversationChanges,
                    (input, expectedRevision) => ({ ...input, expectedRevision })
                  )
                }}
                onCommit={(message) => {
                  void commitConversationChanges(message)
                }}
                onCommitMessageChange={(message) => {
                  if (!isInspectorPinned && inspectedConversationId) {
                    setConversationChangesCommitDraft({ conversationId: inspectedConversationId, message })
                  }
                }}
                onOpenEditor={(filePath) => openFileInEditorWorkspace(filePath, "pinned")}
                onOpenChange={openChangeInEditorWorkspace}
              />
            </div>
            <div className="inspector-git-panel" data-testid="inspector-git-panel" hidden={inspectedInspectorTab !== "git"}>
              <div className="inspector-section-head inspector-git-head">
                <strong>
                  <FontAwesomeIcon icon={faCodeBranch} aria-hidden="true" />
                  <span>{tInspector("git.title")}</span>
                </strong>
                <span>
                  {inspectedGitStatus
                    ? inspectedGitStatus.branch.isClean
                      ? tInspector("git.clean")
                      : tInspector("git.count", { count: inspectedGitStatus.branch.changedCount })
                    : tInspector("git.label")}
                </span>
              </div>
              {inspectedInspectorTab === "git" ? (
                inspectedGitStatusLoadState === "loading" ? (
                  <p className="inspector-files-message">{tInspector("git.loading")}</p>
                ) : inspectedGitStatusLoadState === "unavailable" ? (
                  <p className="inspector-files-message">
                    {inspectedGitStatusError ?? tInspector("git.unavailable")}
                  </p>
                ) : inspectedGitStatusLoadState === "error" ? (
                  <p className="inspector-files-message error">
                    {inspectedGitStatusError ?? tInspector("git.error")}
                  </p>
                ) : inspectedGitStatus ? (
                  <>
                    <div className="inspector-git-overview">
                      <div className="inspector-git-status-row">
                        <span className="inspector-git-branch-chip">
                          <FontAwesomeIcon icon={faCodeBranch} aria-hidden="true" />
                          <span>{inspectedGitStatus.branch.current ?? tInspector("git.branch-unknown")}</span>
                        </span>
                        <strong className={inspectedGitStatus.branch.isClean ? "clean" : "dirty"}>
                          <span className="inspector-git-status-dot" aria-hidden="true" />
                          {inspectedGitStatus.branch.isClean ? tInspector("git.clean") : tInspector("git.dirty")}
                        </strong>
                      </div>
                      {!inspectedGitStatus.branch.isClean ? (
                        <p className="inspector-git-note">
                          {tInspector("git.dirty-note", { count: inspectedGitStatus.branch.changedCount })}
                          {" "}
                          <button className="inspector-inline-link" type="button" onClick={openInspectorChanges}>
                            {tInspector("git.actions.review-diff")}
                          </button>
                        </p>
                      ) : null}
                    </div>
                    <section className="inspector-git-section">
                      <div className="inspector-git-section-title">
                        <strong>{tInspector("git.repository.title")}</strong>
                      </div>
                      {inspectedGitStatus.repository.remotes.length > 0 ? (
                        <div className="inspector-git-field-card">
                          <label className="inspector-git-field-row">
                            <span>{tInspector("git.repository.remote")}</span>
                            <select
                              className="inspector-git-select"
                              data-testid="git-remote-select"
                              aria-label={tInspector("git.repository.remote")}
                              value={selectedGitRemoteName ?? inspectedGitStatus.repository.selectedRemoteName ?? ""}
                              onChange={(event) => setSelectedGitRemoteName(event.currentTarget.value || null)}
                            >
                              {inspectedGitStatus.repository.remotes.map((remote) => (
                                <option key={remote.name} value={remote.name}>
                                  {remote.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <code
                            className="inspector-git-url"
                            title={selectedGitRemote?.url ?? inspectedGitStatus.repository.selectedRemoteUrl ?? ""}
                          >
                            {selectedGitRemote?.url ??
                              inspectedGitStatus.repository.selectedRemoteUrl ??
                              tInspector("git.repository.no-remote")}
                          </code>
                        </div>
                      ) : (
                        <p className="inspector-files-message">{tInspector("git.repository.no-remote")}</p>
                      )}
                    </section>

                    <section className="inspector-git-section">
                      <div className="inspector-git-section-title">
                        <strong>{tInspector("git.identity.title")}</strong>
                        <span>{getGitIdentitySourceLabel(inspectedGitStatus.identity.source, tInspector)}</span>
                      </div>
                      <div className="inspector-git-field-card">
                        <code className="inspector-git-url">
                          {getGitIdentityLabel(inspectedGitStatus.identity, tInspector)}
                        </code>
                      </div>
                    </section>

                    <section className="inspector-git-section">
                      <div className="inspector-git-section-title">
                        <strong>{tInspector("git.branch")}</strong>
                      </div>
                      <div className="inspector-git-field-card inspector-git-branch-card">
                        <div className="inspector-git-kv">
                          <span>{tInspector("git.branch.current")}</span>
                          <strong>{inspectedGitStatus.branch.current ?? tInspector("git.branch-unknown")}</strong>
                        </div>
                        <div className="inspector-git-kv">
                          <span>{tInspector("git.branch.upstream")}</span>
                          <strong>{inspectedGitStatus.branch.upstream ?? tInspector("git.branch.no-upstream")}</strong>
                        </div>
                      </div>
                      {inspectedGitStatus.branch.current &&
                        inspectedGitStatus.branch.recorded &&
                        inspectedGitStatus.branch.current !== inspectedGitStatus.branch.recorded ? (
                        <p className="inspector-git-mismatch">
                          {tInspector("git.recorded-branch", { branch: inspectedGitStatus.branch.recorded })}
                        </p>
                      ) : null}
                    </section>

                    <section className="inspector-git-section">
                      <div className="inspector-git-section-title">
                        <strong>{tInspector("git.commits.title")}</strong>
                      </div>
                      <div className="inspector-git-scope" role="group" aria-label={tInspector("git.commits.scope")}>
                        <button
                          type="button"
                          data-testid="git-commit-scope-allRepository"
                          className={inspectedGitCommitScope === "allRepository" ? "active" : ""}
                          aria-pressed={inspectedGitCommitScope === "allRepository"}
                          disabled={isInspectorPinned}
                          onClick={() => setGitCommitScope("allRepository")}
                        >
                          {tInspector("git.commits.scope.all")}
                        </button>
                        <button
                          type="button"
                          data-testid="git-commit-scope-currentBranch"
                          className={inspectedGitCommitScope === "currentBranch" ? "active" : ""}
                          aria-pressed={inspectedGitCommitScope === "currentBranch"}
                          disabled={isInspectorPinned}
                          onClick={() => setGitCommitScope("currentBranch")}
                        >
                          {tInspector("git.commits.scope.current")}
                        </button>
                      </div>
                      {inspectedGitStatus.commits.status === "unavailable" ? (
                        <p className="inspector-files-message">{tInspector("git.commits.unavailable")}</p>
                      ) : inspectedGitStatus.commits.items.length > 0 ? (
                        <div className="inspector-git-commits">
                          {inspectedGitStatus.commits.items.map((commit) => (
                            <article className="inspector-git-commit-row inspector-git-commit-timeline-item" key={commit.hash}>
                              <span className="inspector-git-commit-dot" aria-hidden="true" />
                              <div className="inspector-git-commit-meta">
                                <code>{commit.shortHash}</code>
                                <span>{commit.authorName}</span>
                                <span>{commit.relativeTime}</span>
                              </div>
                              <strong title={commit.subject}>{commit.subject}</strong>
                            </article>
                          ))}
                          {inspectedGitStatus.commits.hasMore ? (
                            <p className="inspector-git-note">
                              {tInspector("git.commits.showing-latest", { count: 30 })}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="inspector-files-message">{tInspector("git.commits.empty")}</p>
                      )}
                    </section>
                  </>
                ) : (
                  <p className="inspector-files-message">{tInspector("git.empty")}</p>
                )
              ) : (
                null
              )}
            </div>
          </div>

        </>
      }
    >
      {projectMenu ? (() => {
        const menuProjectIndex = projectSummaries.findIndex((project) => project.id === projectMenu.projectId)
        const menuProject = menuProjectIndex >= 0 ? projectSummaries[menuProjectIndex] : null
        if (!menuProject) {
          return null
        }
        const menuPosition = getViewportMenuPosition(
          { x: projectMenu.x, y: projectMenu.y },
          { width: PROJECT_CONTEXT_MENU_WIDTH, height: PROJECT_CONTEXT_MENU_HEIGHT },
          {
            width: typeof window === "undefined" ? PROJECT_CONTEXT_MENU_WIDTH + (CONTEXT_MENU_EDGE_PADDING * 2) : window.innerWidth,
            height: typeof window === "undefined" ? PROJECT_CONTEXT_MENU_HEIGHT + (CONTEXT_MENU_EDGE_PADDING * 2) : window.innerHeight
          }
        )

        return (
          <div
            className="project-context-menu"
            role="menu"
            aria-label={tShell("project.menu.aria", { name: menuProject.name })}
            data-testid="project-context-menu"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              className="project-context-menu__item"
              data-testid="project-menu-move-top"
              disabled={isBusy || menuProjectIndex === 0}
              onClick={() => void handleMoveProject(menuProject.id, "top")}
            >
              <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
              <span>{tShell("project.menu.move-top")}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="project-context-menu__item"
              data-testid="project-menu-move-bottom"
              disabled={isBusy || menuProjectIndex === projectSummaries.length - 1}
              onClick={() => void handleMoveProject(menuProject.id, "bottom")}
            >
              <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
              <span>{tShell("project.menu.move-bottom")}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="project-context-menu__item"
              data-testid="project-menu-reveal-finder"
              disabled={isBusy}
              onClick={() => void handleRevealProjectInFinder(menuProject.id)}
            >
              <FontAwesomeIcon icon={faFolderOpen} aria-hidden="true" />
              <span>{tShell("project.menu.reveal-finder")}</span>
            </button>
            <div className="project-context-menu__separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="project-context-menu__item danger"
              data-testid="project-menu-remove"
              disabled={isBusy}
              onClick={() => void handleRemoveProject(menuProject.id)}
            >
              <FontAwesomeIcon icon={faEyeSlash} aria-hidden="true" />
              <span>{tShell("project.menu.remove")}</span>
            </button>
          </div>
        )
      })() : null}

      {conversationMenu ? (() => {
        const menuConversation = currentProject?.conversations.find(
          (conversation) => conversation.id === conversationMenu.conversationId
        )
        if (!menuConversation) {
          return null
        }
        return (
          <div
            className="conversation-context-menu"
            role="menu"
            data-testid="conversation-context-menu"
            style={{ top: conversationMenu.y, left: conversationMenu.x }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              className="conversation-context-menu__item"
              data-testid="conversation-menu-rename"
              onClick={() => startRenameConversation(menuConversation)}
            >
              {tShell("conversation.menu.rename")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="conversation-context-menu__item danger"
              data-testid="conversation-menu-delete"
              onClick={() => requestDeleteConversation(menuConversation)}
            >
              {tShell("conversation.menu.delete")}
            </button>
          </div>
        )
      })() : null}

      {projectFileContextMenu ? (() => {
        const menuFile = projectFileContextMenu.file
        const canMutate = Boolean(inspectedConversation)
        const menuPosition = getViewportMenuPosition(
          { x: projectFileContextMenu.x, y: projectFileContextMenu.y },
          { width: PROJECT_FILE_CONTEXT_MENU_WIDTH, height: PROJECT_FILE_CONTEXT_MENU_HEIGHT },
          {
            width: typeof window === "undefined" ? PROJECT_FILE_CONTEXT_MENU_WIDTH + (CONTEXT_MENU_EDGE_PADDING * 2) : window.innerWidth,
            height: typeof window === "undefined" ? PROJECT_FILE_CONTEXT_MENU_HEIGHT + (CONTEXT_MENU_EDGE_PADDING * 2) : window.innerHeight
          }
        )
        const menu = (
          <div
            className="project-file-context-menu"
            role="menu"
            data-testid="project-file-context-menu"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {menuFile.kind === "directory" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="project-file-context-menu__item"
                  data-testid="project-file-context-new-file"
                  disabled={!canMutate}
                  onClick={() => startProjectFileCreate(menuFile, "file")}
                >
                  <FontAwesomeIcon icon={faFileLines} />
                  {tInspector("files.menu.new-file")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="project-file-context-menu__item"
                  data-testid="project-file-context-new-folder"
                  disabled={!canMutate}
                  onClick={() => startProjectFileCreate(menuFile, "directory")}
                >
                  <FontAwesomeIcon icon={faFolderOpen} />
                  {tInspector("files.menu.new-folder")}
                </button>
                <div className="project-file-context-menu__separator" role="separator" />
              </>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="project-file-context-menu__item"
                  onClick={() => {
                    setProjectFileContextMenu(null)
                    openFileInEditorWorkspace(menuFile.path, "preview")
                  }}
                >
                  <FontAwesomeIcon icon={faFileLines} />
                  {tInspector("files.menu.open")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="project-file-context-menu__item"
                  onClick={() => {
                    setProjectFileContextMenu(null)
                    openFileInEditorWorkspace(menuFile.path, "pinned")
                  }}
                >
                  <FontAwesomeIcon icon={faCirclePlus} />
                  {tInspector("files.menu.open-tab")}
                </button>
                <div className="project-file-context-menu__separator" role="separator" />
              </>
            )}
            <button
              type="button"
              role="menuitem"
              className="project-file-context-menu__item"
              onClick={() => copyProjectFilePath(getProjectFileAbsolutePath(menuFile.path))}
            >
              <FontAwesomeIcon icon={faCopy} />
              {tInspector("files.menu.copy-path")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="project-file-context-menu__item"
              onClick={() => copyProjectFilePath(menuFile.path)}
            >
              <FontAwesomeIcon icon={faCopy} />
              {tInspector("files.menu.copy-relative-path")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="project-file-context-menu__item"
              disabled={!inspectedConversation}
              onClick={revealProjectFileInFinder}
            >
              <FontAwesomeIcon icon={faFolderOpen} />
              {tInspector("files.menu.reveal")}
            </button>
            {menuFile.kind === "file" ? (
              <button
                type="button"
                role="menuitem"
                className="project-file-context-menu__item"
                disabled={!inspectedConversation}
                onClick={() => {
                  if (inspectedConversation) {
                    setProjectFileContextMenu(null)
                    openEditorFileExternally(inspectedConversation.id, menuFile.path)
                  }
                }}
              >
                <FontAwesomeIcon icon={faPenToSquare} />
                {tInspector("files.menu.open-editor")}
              </button>
            ) : null}
            <div className="project-file-context-menu__separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="project-file-context-menu__item"
              data-testid="project-file-context-rename"
              disabled={!canMutate}
              onClick={() => startProjectFileRename(menuFile)}
            >
              <FontAwesomeIcon icon={faPenToSquare} />
              {tInspector("files.menu.rename")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="project-file-context-menu__item danger"
              data-testid="project-file-context-delete"
              disabled={!canMutate}
              onClick={() => requestProjectFileDelete(menuFile)}
            >
              <FontAwesomeIcon icon={faTrashCan} />
              {tInspector("files.menu.delete")}
            </button>
          </div>
        )
        return typeof document === "undefined" ? menu : createPortal(menu, document.body)
      })() : null}

      {pendingProjectFileDelete ? (
        <div className="danger-confirmation" role="dialog" aria-modal="true" aria-labelledby="project-file-delete-title">
          <div className="danger-confirmation__inner">
            <h3 id="project-file-delete-title">{tInspector("files.delete.confirm-title", { name: pendingProjectFileDelete.name })}</h3>
            <p>
              {tInspector("files.delete.confirm-message", {
                kind: tInspector(`files.kind.${pendingProjectFileDelete.kind}`),
                path: pendingProjectFileDelete.path
              })}
            </p>
            <div className="danger-confirmation__actions">
              <button
                type="button"
                onClick={cancelPendingProjectFileDelete}
                disabled={isBusy}
              >
                {tCommon("action.cancel")}
              </button>
              <button
                type="button"
                className="btn danger"
                data-testid="project-file-delete-confirm"
                onClick={() => void confirmPendingProjectFileDelete()}
                disabled={isBusy}
              >
                {tInspector("files.menu.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingConversationDelete ? (
        <div className="danger-confirmation" role="dialog" aria-modal="true" aria-labelledby="conversation-delete-title">
          <div className="danger-confirmation__inner">
            <h3 id="conversation-delete-title">{tShell("conversation.delete.confirm-title")}</h3>
            <p>
              {tShell("conversation.delete.confirm-message", {
                title: pendingConversationDelete.title
              })}
            </p>
            <div className="danger-confirmation__actions">
              <button
                type="button"
                ref={pendingConversationDeleteCancelRef}
                onClick={cancelPendingConversationDelete}
                disabled={isBusy}
              >
                {tShell("conversation.delete.cancel")}
              </button>
              <button
                type="button"
                className="btn danger"
                data-testid="conversation-delete-confirm"
                onClick={() => void confirmPendingConversationDelete()}
                disabled={isBusy}
              >
                {tShell("conversation.delete.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? <div className={`status-banner ${notice.tone}`}>{notice.message}</div> : null}

      <EditorWorkspace
        resolveConversation={resolveConversationSummary}
        editorState={fileEditorState}
        onEditorStateChange={setFileEditorState}
        onOpenExternalFile={openEditorFileExternally}
      >
        <div
          className={`chat-stream modern-chat-stream${activeConversation ? " has-conversation" : ""}`}
          onScroll={handleChatStreamScroll}
        >
          {activeConversation ? (
            <>
            <div className="conversation-toolbar">
              <div className="conversation-toolbar-copy">
                <strong title={activeConversation.title}>{activeConversation.title}</strong>
                {activeHistorySummary ? (
                  <div className="conversation-toolbar-meta" aria-label={tShell("history.local")}>
                    {activeHistorySummary.status === "loading" ? (
                      <span>{tShell("history.loading")}</span>
                    ) : null}
                    {activeHistorySummary.status === "error" ? (
                      <span>{tShell("history.unavailable")}</span>
                    ) : null}
                    {activeHistorySummary.status === "ready" ? (
                      <>
                        {activeHistorySummary.latestRun ? (
                          [
                            tCommon(`state.${activeHistorySummary.latestRun.status}`, {
                              defaultValue: activeHistorySummary.latestRun.status
                            }),
                            getProviderLabel(activeHistorySummary.latestRun.provider, tProvider),
                            activeHistorySummary.latestRun.model,
                            activeHistorySummary.latestRun.worktreeLabel,
                            tShell("history.artifacts", { count: activeHistorySummary.artifactCount }),
                            formatCompactDateTime(activeHistorySummary.latestRun.startedAt, i18n.language)
                          ].filter(Boolean).map((item, index) => <span key={`${index}-${item}`}>{item}</span>)
                        ) : (
                          <span>{tShell("history.no-runs")}</span>
                        )}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {canCompareConversations ? (
                <button
                  className={`btn sm${compareModeOpen ? " primary" : ""}`}
                  type="button"
                  data-testid="compare-toggle"
                  onClick={() => {
                    const nextOpen = !compareModeOpen
                    setCompareModeOpen(nextOpen)
                    if (nextOpen && defaultCompareTarget) {
                      setCompareTargetConversationId(defaultCompareTarget.id)
                    }
                  }}
                >
                  {compareModeOpen ? tShell("compare.action.close") : tShell("compare.action.open")}
                </button>
              ) : null}
            </div>

            {compareModeOpen && compareTargetConversation ? (
              <div className="compare-view" data-testid="compare-view">
                <div className="compare-toolbar">
                  <div>
                    <span>{tShell("compare.title")}</span>
                    <strong>{tShell("compare.subtitle")}</strong>
                  </div>
                  <div className="compare-target-options" aria-label={tShell("compare.target.label")}>
                    {compareCandidates.map((conversation) => (
                      <button
                        className={`compare-target-option${conversation.id === compareTargetConversation.id ? " active" : ""}`}
                        key={conversation.id}
                        type="button"
                        data-testid={`compare-target-option-${conversation.id}`}
                        onClick={() => setCompareTargetConversationId(conversation.id)}
                      >
                        {conversation.title}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="compare-grid">
                  {renderCompareCard(activeConversation, activeTimeline, "active", activeTimeline ? "ready" : "loading")}
                  {renderCompareCard(compareTargetConversation, compareTargetTimeline, "target", compareTimelineStatus)}
                </div>
              </div>
            ) : (
              <VirtualizedChatTimeline
                items={chatRenderItems}
                dismissedPermissionRequestIds={dismissedPermissionRequestIds}
                hasMore={conversationTimelineHasMore}
                isLoadingOlder={isLoadingOlderTimeline}
                loadOlderLabel={tChat("history.load-older")}
                loadingOlderLabel={tChat("history.loading-older")}
                onLoadOlder={() => void loadOlderConversationTimeline()}
                anchorRef={chatScrollAnchorRef}
                renderItem={renderActiveChatItem}
                emptyState={null}
              />
            )}
            </>
          ) : isProjectConversationLandingState && currentProject ? (
            <div className="chat-empty-center chat-project-landing-state" data-testid="project-conversation-landing-state">
              <span className="chat-project-landing-icon" aria-hidden="true">
                <FontAwesomeIcon icon={faCommentMedical} />
              </span>
              <h2 className="chat-greeting">{tChat("project-landing.title")}</h2>
              <p className="chat-greeting-sub">
                {tChat("project-landing.description", { project: currentProject.name })}
              </p>
              <button
                className="btn primary chat-project-landing-action"
                type="button"
                data-testid="project-landing-new-conversation"
                onClick={() => void openLauncher()}
              >
                {tChat("hero.new-conversation")}
              </button>
            </div>
          ) : (
            <div className="chat-empty-center">
            <h2 className="chat-greeting">{tChat("hero.title")}</h2>
            <p className="chat-greeting-sub">{tChat("hero.description")}</p>

            <div className="chat-suggestion-grid">
              <button className="chat-suggestion-card" type="button" onClick={() => void openLauncher()}>
                <span className="chat-suggestion-icon">
                  <FontAwesomeIcon icon={faPenToSquare} />
                </span>
                <span className="chat-suggestion-label">{tChat("hero.new-conversation")}</span>
              </button>
              <button className="chat-suggestion-card" type="button" disabled={isBusy} onClick={() => void importProject()}>
                <span className="chat-suggestion-icon">
                  <FontAwesomeIcon icon={faCirclePlus} />
                </span>
                <span className="chat-suggestion-label">{tChat("hero.import-project")}</span>
              </button>
            </div>
            </div>
          )}
        </div>

      {!isProjectConversationLandingState ? (
      <div className="composer-modern">
        {activeConversation && activeQueuedMessages.length > 0 ? (
          <section className="composer-queue" aria-label={tChat("composer.queue.title")} data-testid="composer-queue">
            <div className="composer-queue__header">
              <span>{tChat("composer.queue.title")}</span>
              <span className="composer-queue__count">{activeQueuedMessages.length}</span>
            </div>
            <div className="composer-queue__list">
              {activeQueuedMessages.map((message, index) => {
                const attachmentNames = (message.attachments ?? []).map((attachment) => attachment.name).join(", ")
                const summary = [message.content.trim(), attachmentNames]
                  .filter(Boolean)
                  .join(" · ") || tChat("composer.queue.attachment-only")
                return (
                  <div className="composer-queue__item" key={message.id} data-testid={`composer-queue-item-${message.id}`}>
                    <span className="composer-queue__position" aria-hidden="true">{index + 1}</span>
                    <div className="composer-queue__copy">
                      <span className="composer-queue__summary" title={summary}>{summary}</span>
                      <span className="composer-queue__status">
                        {index === 0 ? tChat("composer.queue.next") : tChat("composer.queue.waiting")}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="composer-queue__remove"
                      aria-label={tChat("composer.queue.remove")}
                      title={tChat("composer.queue.remove")}
                      data-testid={`composer-queue-remove-${message.id}`}
                      onClick={() => void deleteQueuedConversationMessage({
                        conversationId: activeConversation.id,
                        queuedMessageId: message.id
                      })}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}
        <div className="composer-modern-inner">
          {isSlashCommandMenuOpen ? (
            <div
              ref={composerSlashMenuRef}
              className="composer-slash-menu"
              role="listbox"
              aria-label={tChat("composer.slash.menu.aria", {
                provider: activeConversation
                  ? getProviderLabel(activeConversation.provider.kind, tProvider)
                  : ""
              })}
              data-testid="composer-slash-menu"
            >
              <div className="composer-slash-menu__header">
                <span>{tChat("composer.slash.menu.title")}</span>
                <span>{activeConversation ? getProviderLabel(activeConversation.provider.kind, tProvider) : ""}</span>
              </div>
              <div className="composer-slash-menu__list">
                {filteredSlashCommands.map((command, index) => {
                  const isUnavailable = isActiveRunRunning && !command.availableWhileRunning
                  const argumentHint = command.argumentHintKey
                    ? tChat(command.argumentHintKey)
                    : null
                  return (
                    <button
                      id={`composer-slash-option-${command.name}-${command.scope}`}
                      key={`${command.scope}-${command.provider ?? "teamcow"}-${command.name}`}
                      type="button"
                      role="option"
                      aria-selected={index === slashCommandActiveIndex}
                      className={`composer-slash-menu__option${index === slashCommandActiveIndex ? " is-active" : ""}`}
                      disabled={isUnavailable}
                      data-testid={`composer-slash-command-${command.name}`}
                      onMouseEnter={() => setSlashCommandActiveIndex(index)}
                      onClick={() => selectSlashCommand(command)}
                    >
                      <span className="composer-slash-menu__command">
                        <code>/{command.name}</code>
                        {argumentHint ? <span>{argumentHint}</span> : null}
                      </span>
                      <span className="composer-slash-menu__description">{tChat(command.descriptionKey)}</span>
                      <span className="composer-slash-menu__scope">
                        {command.scope === "teamcow"
                          ? tChat("composer.slash.scope.teamcow")
                          : tChat("composer.slash.scope.provider")}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="composer-slash-menu__footer">{tChat("composer.slash.menu.hint")}</div>
            </div>
          ) : null}
          {activeConversation && composerAttachments.length > 0 ? (
            <div className="composer-attachments" data-testid="composer-attachments">
              {composerAttachments.map((attachment) => (
                <div className={`composer-attachment${attachment.previewUri ? " is-image" : ""}`} key={attachment.draftId}>
                  {attachment.previewUri ? (
                    <button
                      type="button"
                      className="composer-attachment__preview-button"
                      aria-label={tChat("image.preview.open", { name: attachment.name })}
                      data-testid="composer-image-preview-trigger"
                      disabled={isComposerLocked || isReadingComposerAttachments}
                      onClick={() => setImagePreview({ src: attachment.previewUri!, name: attachment.name })}
                    >
                      <img src={attachment.previewUri} alt={attachment.name} />
                    </button>
                  ) : (
                    <span className="composer-attachment__file-icon" aria-hidden="true">
                      <FontAwesomeIcon icon={faFileLines} />
                    </span>
                  )}
                  <span className="composer-attachment__name" title={attachment.name}>{attachment.name}</span>
                  <button
                    type="button"
                    className="composer-attachment__remove"
                    aria-label={tChat("composer.attachment.remove", { name: attachment.name })}
                    title={tChat("composer.attachment.remove", { name: attachment.name })}
                    disabled={isComposerLocked || isReadingComposerAttachments}
                    onClick={() => {
                      setComposerAttachments((current) => current.filter((candidate) => candidate.draftId !== attachment.draftId))
                      setComposerAttachmentError(null)
                    }}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="composer-modern-input-row">
            {activeConversation ? (
              <textarea
                ref={composerInputRef}
                className="composer-modern-input"
                value={composerDraft}
                onChange={(event) => {
                  setComposerDraft(event.target.value)
                  setComposerCommandMessage(null)
                  setSlashCommandDismissedDraft(null)
                  const element = event.target
                  element.style.height = "auto"
                  element.style.overflowY = "hidden"
                  const maxH = 120
                  const newHeight = Math.min(element.scrollHeight, maxH)
                  element.style.height = `${newHeight}px`
                  if (element.scrollHeight > maxH) {
                    element.style.overflowY = "auto"
                  }
                }}
                onInput={(event) => {
                  const element = event.currentTarget
                  setComposerDraft(element.value)
                  setSlashCommandDismissedDraft(null)
                  element.style.height = "auto"
                  element.style.overflowY = "hidden"
                  const maxH = 120
                  const newHeight = Math.min(element.scrollHeight, maxH)
                  element.style.height = `${newHeight}px`
                  if (element.scrollHeight > maxH) {
                    element.style.overflowY = "auto"
                  }
                }}
                onKeyDown={(event) => {
                  if (isSlashCommandMenuOpen) {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault()
                      const direction = event.key === "ArrowDown" ? 1 : -1
                      setSlashCommandActiveIndex((current) =>
                        (current + direction + filteredSlashCommands.length) % filteredSlashCommands.length
                      )
                      return
                    }
                    if (event.key === "Escape") {
                      event.preventDefault()
                      setSlashCommandDismissedDraft(composerDraft)
                      return
                    }
                    if ((event.key === "Enter" || event.key === "Tab") && !event.nativeEvent.isComposing) {
                      const selectedCommand = filteredSlashCommands[slashCommandActiveIndex]
                      if (selectedCommand && isActiveRunRunning && !selectedCommand.availableWhileRunning) {
                        event.preventDefault()
                        setComposerCommandMessage({
                          tone: "error",
                          text: tChat("composer.slash.error.running", { command: `/${selectedCommand.name}` })
                        })
                        return
                      }
                      const shouldSubmitCompleteCommand = Boolean(
                        selectedCommand &&
                        event.key === "Enter" &&
                        selectedCommand.argumentKind === "none" &&
                        composerDraft.trim() === `/${selectedCommand.name}`
                      )
                      if (selectedCommand && !shouldSubmitCompleteCommand) {
                        event.preventDefault()
                        selectSlashCommand(selectedCommand)
                        return
                      }
                    }
                  }
                  if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    if (canSubmitComposer) {
                      void handleComposerSubmit()
                    }
                  }
                }}
                onPaste={handleComposerPaste}
                placeholder={composerPlaceholder}
                readOnly={isComposerLocked}
                aria-disabled={isComposerLocked}
                rows={1}
                data-testid="composer-input"
              />
            ) : (
              <span className="composer-modern-placeholder">{composerPlaceholder}</span>
            )}
          </div>
          {composerAttachmentError ? (
            <div className="composer-attachment-error" role="status">{composerAttachmentError}</div>
          ) : null}
          {composerCommandMessage ? (
            <div
              className={`composer-command-message is-${composerCommandMessage.tone}`}
              role={composerCommandMessage.tone === "error" ? "alert" : "status"}
              aria-live="polite"
              data-testid="composer-command-message"
            >
              <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
              <span>{composerCommandMessage.text}</span>
            </div>
          ) : null}
          <div className="composer-modern-toolbar">
            <div className="composer-modern-toolbar-left">
              <input
                ref={composerAttachmentInputRef}
                className="composer-attachment-input"
                type="file"
                multiple
                tabIndex={-1}
                aria-hidden="true"
                onChange={handleComposerAttachmentInput}
              />
              <button
                className="composer-action-btn"
                type="button"
                aria-label={tChat("composer.attachment.add")}
                title={tChat("composer.attachment.add")}
                data-testid="composer-attachment-add"
                disabled={!activeConversation || isComposerLocked || isReadingComposerAttachments}
                onClick={() => composerAttachmentInputRef.current?.click()}
              >
                <FontAwesomeIcon icon={faCirclePlus} />
              </button>
              {activeConversation ? (
                <div ref={composerAccessModeMenuRef} className={`composer-model-select composer-access-mode-select${composerAccessModeMenuOpen ? " is-open" : ""}`}>
                  <button
                    className="composer-model-trigger"
                    type="button"
                    onClick={() => {
                      setComposerAccessModeMenuOpen((current) => !current)
                      setComposerModelMenuOpen(false)
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={composerAccessModeMenuOpen}
                    aria-label={tChat("composer.access-mode.aria")}
                    title={tChat("composer.access-mode.aria")}
                    data-testid="composer-access-mode-trigger"
                    disabled={!canSwitchComposerAccessMode}
                  >
                    <FontAwesomeIcon className="composer-model-icon" icon={faShieldHalved} />
                    <span className="composer-model-label">{getComposerAccessModeLabel(activeAccessMode)}</span>
                    <FontAwesomeIcon className="composer-model-chevron" icon={faChevronDown} />
                  </button>
                  {composerAccessModeMenuOpen ? (
                    <div className="composer-model-popover composer-model-popover--access" role="listbox" data-testid="composer-access-mode-popover">
                      {accessModeOptions.map((option) => {
                        const selected = activeAccessMode === option.id
                        const badge = option.id === "read-only"
                          ? tShell("composer.access-mode.safe")
                          : option.id === "full-access"
                            ? tShell("composer.access-mode.powerful")
                            : tShell("launcher.access-mode.default")
                        const icon = option.id === "full-access"
                          ? faShield
                          : option.id === "worktree-write"
                            ? faShieldHalved
                            : faShield

                        return (
                          <button
                            key={option.id}
                            className={`composer-model-option composer-model-option--access${selected ? " is-selected" : ""}`}
                            type="button"
                            onClick={() => void handleComposerAccessModeSelect(option)}
                            data-testid={`composer-access-mode-option-${option.id}`}
                          >
                            <span className={`composer-option-icon composer-option-icon--access${option.id === "read-only" ? " composer-option-icon--read-only" : ""}`} aria-hidden="true">
                              <FontAwesomeIcon icon={icon} />
                            </span>
                            <strong className="composer-access-option-title">{option.label}</strong>
                            <span className="composer-access-option-detail">{tShell(`composer.access-mode.${option.id}.detail`)}</span>
                            <div className="command-select-option-meta">
                              <span className="model-picker__badge">{badge}</span>
                              {selected ? (
                                <FontAwesomeIcon icon={faCheck} />
                              ) : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="composer-modern-toolbar-right">
              {activeConversation ? (
                <div ref={composerModelMenuRef} className={`composer-model-select${composerModelMenuOpen ? " is-open" : ""}`}>
                  <button
                    className="composer-model-trigger"
                    type="button"
                    onClick={() => {
                      setComposerModelMenuOpen((current) => !current)
                      setComposerAccessModeMenuOpen(false)
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={composerModelMenuOpen}
                    aria-label={tChat("composer.model.aria")}
                    title={activeModelBoundaryCopy || tChat("composer.model.aria")}
                    data-testid="composer-model-trigger"
                    disabled={!canSwitchComposerModel}
                  >
                    <FontAwesomeIcon className="composer-model-icon" icon={faBolt} />
                    <span className="composer-model-label">{composerModelLabel}</span>
                    <FontAwesomeIcon className="composer-model-chevron" icon={faChevronDown} />
                  </button>
                  {composerModelMenuOpen && activeModelOptions.length > 0 ? (
                    <div className="composer-model-popover composer-model-popover--models" role="listbox" data-testid="composer-model-popover">
                      <div className="composer-model-popover-header">
                        <span>{tShell("composer.model.menu-title")}</span>
                        <button className="composer-model-provider-filter" type="button" disabled>
                          {tShell("composer.model.all-providers")}
                          <FontAwesomeIcon icon={faChevronDown} />
                        </button>
                      </div>
                      <div className="composer-model-popover-list">
                        {groupModelsForPicker(activeModelOptions).map((group) => (
                          <div key={group.key} className="model-picker__section composer-model-popover-group">
                            {group.models.map((option) => {
                              const badgeKey = sourceBadgeKeyFor(option.source)
                              const selected = activeConversation.currentModel === option.id
                              return (
                                <button
                                  key={option.id}
                                  className={`composer-model-option composer-model-option--model${selected ? " is-selected" : ""}`}
                                  type="button"
                                  onClick={() => void handleComposerModelSelect(option)}
                                  data-testid={`composer-model-option-${option.id}`}
                                >
                                  <span className="composer-option-icon composer-option-icon--model" aria-hidden="true">
                                    <FontAwesomeIcon icon={option.id.includes("codex") ? faCube : faBolt} />
                                  </span>
                                  <div className="composer-model-option-copy">
                                    <strong>{getProviderModelLabel(activeProviderKind, option, tShell)}</strong>
                                    <span>{getProviderModelDetail(activeProviderKind, option, tShell)}</span>
                                  </div>
                                  <div className="command-select-option-meta">
                                    {badgeKey ? <span className="model-picker__badge">{tShell(badgeKey)}</span> : null}
                                    {selected ? (
                                      <FontAwesomeIcon icon={faCheck} />
                                    ) : null}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                      <button
                        className="composer-model-popover-footer"
                        type="button"
                        onClick={() => {
                          setComposerModelMenuOpen(false)
                          setSettingsOpen(true)
                        }}
                      >
                        <span>
                          <FontAwesomeIcon icon={faCircleInfo} />
                          {tShell("composer.model.more-in-settings")}
                        </span>
                        <kbd>{tShell("composer.model.settings-shortcut")}</kbd>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {activeConversation ? (
                activeConversation.runStatus === "running" && !hasComposerContent ? (
                  <button
                    className="composer-send-icon-btn"
                    type="button"
                    aria-label={tChat("composer.stop")}
                    title={tChat("composer.stop")}
                    data-testid="composer-stop"
                    onClick={() => void handleComposerCancel()}
                  >
                    <FontAwesomeIcon icon={faStop} />
                  </button>
                ) : (
                  <button
                    className="composer-send-icon-btn"
                    type="button"
                    disabled={!canSubmitComposer}
                    aria-label={isActiveRunRunning ? tChat("composer.queue.send") : tChat("composer.send.aria")}
                    title={!isActiveRunRunning && isComposerProviderBlocked && activeProviderBoundaryCopy
                      ? tProvider(activeProviderBoundaryCopy.providerRequiredKey)
                      : isActiveRunRunning ? tChat("composer.queue.send") : tChat("composer.send.aria")}
                    data-testid="composer-send"
                    onClick={() => void handleComposerSubmit()}
                  >
                    <FontAwesomeIcon icon={faArrowUp} />
                  </button>
                )
              ) : (
                <button className="composer-send-btn" type="button" onClick={() => void openLauncher()}>
                  {tChat("hero.new-conversation")}
                </button>
              )}
            </div>
          </div>
        </div>
        {isComposerProviderBlocked && activeProviderBoundaryCopy ? (
          <p className="composer-boundary-note">
            <span>
              {tShell("composer.provider-required", {
                provider: activeProviderLabel
              })}
            </span>
            {activeProviderBoundaryCopy.repairKey ? (
              <span>
                {tProvider(activeProviderBoundaryCopy.repairKey, {
                  provider: activeProviderLabel,
                  ...activeProviderIssueParams
                })}
              </span>
            ) : null}
            {activeModelBoundaryCopy ? <span>{activeModelBoundaryCopy}</span> : null}
          </p>
          ) : null}
      </div>
      ) : null}
      </EditorWorkspace>

      {launcherOpen && currentProject ? (
        <div className="launcher-modal-layer" role="presentation">
          <button className="launcher-modal-backdrop" type="button" aria-label={tCommon("action.close")} onClick={closeLauncher} />
          <div className="launcher-modal launcher-command-sheet" role="dialog" aria-modal="true" aria-label={tShell("launcher.title")}>
            <div className="launcher-modal-header">
              <div>
                <strong>{tShell("launcher.title")}</strong>
                <p>{tShell("launcher.modal-description")}</p>
              </div>
              <button className="launcher-modal-close" type="button" onClick={closeLauncher} aria-label={tCommon("action.close")}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="launcher-form launcher-command-form">
              <div className="launcher-field launcher-run-with-field">
                <span className="launcher-field-label">{tShell("launcher.run-with")}</span>
                <div className={`command-select launcher-run-with-select${isModelDisabled ? " is-disabled" : ""}${openSelectId === "model" ? " is-open" : ""}`}>
                  <button
                    className="command-select-trigger launcher-run-with-trigger"
                    type="button"
                    onClick={() => setOpenSelectId((current) => current === "model" ? null : "model")}
                    disabled={isModelDisabled}
                    aria-haspopup="listbox"
                    aria-expanded={openSelectId === "model"}
                    data-testid="launcher-model-trigger"
                  >
                    <span className="launcher-run-with-icon" aria-hidden="true">
                      <FontAwesomeIcon icon={faBolt} />
                    </span>
                    <span className="launcher-run-with-copy">
                      <span className={`command-select-value${selectedProviderKind ? "" : " is-placeholder"}`} data-testid="launcher-provider-trigger">
                        {runWithValue}
                      </span>
                      {selectedModelForDetail && selectedProviderKind ? (
                        <span className="command-select-detail">
                          {getProviderModelDetail(selectedProviderKind, selectedModelForDetail, tShell)}
                        </span>
                      ) : null}
                    </span>
                    <FontAwesomeIcon className="command-select-chevron" icon={faChevronDown} />
                  </button>
                  {openSelectId === "model" ? (
                    <div className="command-select-popover" role="listbox" aria-label={tShell("launcher.field.model")} data-testid="launcher-model-popover">
                      {groupModelsForPicker(modelOptions).map((group) => (
                        <div key={group.key} className="model-picker__section">
                          <div className="model-picker__section-title">{tShell(`modelPicker.section.${group.key}`)}</div>
                          {group.models.map((model) => {
                            const badgeKey = sourceBadgeKeyFor(model.source)
                            return (
                              <button
                                key={model.id}
                                type="button"
                                className={`command-select-option model-picker__option${selectedModelId === model.id ? " is-selected" : ""}`}
                                onClick={() => { setSelectedModelId(model.id); setOpenSelectId(null) }}
                                data-testid={`launcher-model-option-${model.id}`}
                              >
                                <div className="command-select-option-copy">
                                  <strong>{getProviderModelLabel(selectedProviderKind, model, tShell)}</strong>
                                  {model.detail ? <span>{getProviderModelDetail(selectedProviderKind, model, tShell)}</span> : null}
                                </div>
                                <div className="command-select-option-meta">
                                  {badgeKey ? <span className="model-picker__badge">{tShell(badgeKey)}</span> : null}
                                  {selectedModelId === model.id ? <FontAwesomeIcon icon={faCheck} /> : null}
                                  {model.source === "user-custom" ? (
                                    <button
                                      type="button"
                                      className="model-picker__remove"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        if (selectedProviderKind) void removeCustomModel({ providerKind: selectedProviderKind, id: model.id })
                                      }}
                                      aria-label={tShell("modelPicker.removeCustom")}
                                    >✕</button>
                                  ) : null}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      ))}
                      {modelOptions.length === 0 ? (
                        <div className="command-select-option is-disabled">
                          <div className="command-select-option-copy"><span>{tShell("launcher.model.placeholder")}</span></div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="model-picker__add-custom"
                        onClick={() => { setOpenSelectId(null); setIsCustomModelDialogOpen(true) }}
                      >
                        <FontAwesomeIcon icon={faCirclePlus} /> {tShell("modelPicker.addCustom")}
                      </button>
                    </div>
                  ) : null}
                </div>
                <AddCustomModelDialog
                  open={isCustomModelDialogOpen}
                  providerKind={selectedProviderKind}
                  onClose={() => setIsCustomModelDialogOpen(false)}
                  onSubmit={async (input) => { await addCustomModel(input) }}
                />
              </div>

              <div className="launcher-field launcher-provider-field">
                <div className="launcher-field-row">
                  <span className="launcher-field-label">{tShell("launcher.field.provider")}</span>
                  <div className="launcher-modal-meta">
                    <span className="badge">
                      {providerReadiness.snapshot.checkedAt && !providerReadiness.isLoading
                        ? tProvider("launcher.last-checked", {
                            time: formatProviderCheckedAt(providerReadiness.snapshot.checkedAt)
                          })
                        : tProvider("launcher.loading")}
                    </span>
                    <button
                      className="launcher-refresh-btn"
                      type="button"
                      onClick={() => void providerReadiness.refresh()}
                      disabled={providerReadiness.isFetching}
                      aria-label={providerReadiness.isFetching ? tProvider("launcher.refreshing") : tProvider("launcher.refresh")}
                      title={providerReadiness.isFetching ? tProvider("launcher.refreshing") : tProvider("launcher.refresh")}
                    >
                      <FontAwesomeIcon icon={faRotateRight} />
                    </button>
                  </div>
                </div>
                <div className="launcher-provider-list" role="radiogroup" aria-label={tShell("launcher.field.provider")} data-testid="launcher-provider-list">
                  {providerOptions.map((option) => {
                    const provider = providerReadiness.snapshot.providers.find((item) => item.kind === option.id)
                    const tone = provider ? getAvailabilityTone(provider.availability) : "idle"
                    const isSelected = selectedProviderKind === option.id
                    const providerKind = option.id as ProviderKind
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`launcher-provider-row ${tone}${isSelected ? " is-selected" : ""}${option.disabled ? " is-unavailable" : ""}`}
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => handleProviderChange(option.id as ProviderKind)}
                        data-testid={`launcher-provider-option-${option.id}`}
                      >
                        <span className={`launcher-provider-mark ${option.id}`} aria-hidden="true">
                          <img
                            className="launcher-provider-logo"
                            src={providerLogoUrls[providerKind]}
                            alt=""
                            data-testid={`launcher-provider-logo-${option.id}`}
                          />
                        </span>
                        <span className="launcher-provider-name">{option.label}</span>
                        <span className={`launcher-provider-status ${tone}`}>{option.meta}</span>
                        <span className="launcher-provider-check" aria-hidden="true">
                          {isSelected ? <FontAwesomeIcon icon={faCheck} /> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {selectedProvider ? (
                  <div className="launcher-boundary-copy">
                    <small className={`launcher-inline-state ${getAvailabilityTone(selectedProvider.availability)}`}>
                      {tProvider(selectedProviderCopy?.detailKey ?? "detail.unknown", {
                        provider: getProviderLabel(selectedProvider.kind, tProvider),
                        ...(selectedProvider.issues[0]?.params ?? {})
                      })}
                    </small>
                    {selectedProviderBoundaryCopy?.repairKey ? (
                      <small className="launcher-inline-detail">
                        {tProvider(selectedProviderBoundaryCopy.repairKey, {
                          provider: getProviderLabel(selectedProvider.kind, tProvider),
                          ...(selectedProvider.issues[0]?.params ?? {})
                        })}
                      </small>
                    ) : null}
                    {selectedProviderBoundaryCopy ? (
                      <>
                        <small className="launcher-inline-detail">
                          {tProvider(selectedProviderBoundaryCopy.localCapabilityKey)}
                        </small>
                        <small className={`launcher-inline-state ${getAvailabilityTone(selectedProvider.availability)}`}>
                          {tProvider(selectedProviderBoundaryCopy.providerRequiredKey)}
                        </small>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="launcher-field launcher-worktree-field">
                <span className="launcher-field-label">{tShell("launcher.field.worktree")}</span>
                <CommandSelect
                  testId="launcher-worktree"
                  label={tShell("launcher.field.worktree")}
                  value={selectedWorktreeOption}
                  placeholder={tShell("launcher.worktree.placeholder")}
                  options={worktreeOptions}
                  open={openSelectId === "worktree"}
                  leadingIcon={<FontAwesomeIcon icon={faCodeBranch} />}
                  leadingIconTestId="launcher-worktree-icon"
                  popoverPlacement="top"
                  onToggle={() => setOpenSelectId((current) => current === "worktree" ? null : "worktree")}
                  onSelect={(option) => {
                    if (option.id === "default") {
                      setSelectedWorktreeTarget("default")
                      setSelectedWorktreeId(defaultWorktree?.id ?? null)
                    } else if (option.id === "new-worktree") {
                      setSelectedWorktreeTarget("new-worktree")
                      setSelectedWorktreeId(null)
                    } else {
                      setSelectedWorktreeTarget("existing-worktree")
                      setSelectedWorktreeId(option.id)
                    }
                    setLauncherErrorMessage("")
                    setOpenSelectId(null)
                  }}
                />
                {selectedWorktreeTarget === "new-worktree" ? (
                  <input
                    className="launcher-input"
                    type="text"
                    value={newWorktreeBranch}
                    onChange={(event) => setNewWorktreeBranch(event.target.value)}
                    placeholder={tShell("launcher.target.branch-placeholder")}
                  />
                ) : null}
                {independentWorktrees.length === 0 ? (
                  <small className="launcher-inline-detail">{tShell("launcher.target.existing-empty")}</small>
                ) : null}
              </div>
            </div>

            {launcherErrorMessage ? (
              <div className="status-banner error launcher-modal-error">{launcherErrorMessage}</div>
            ) : null}

            <div className="launcher-modal-footer">
              <p>{selectedProviderKind && selectedModelId && selectedWorktreeTarget ? tShell("launcher.footer-ready") : modalSummary}</p>
              <div className="hero-actions">
                <button className="btn" type="button" onClick={closeLauncher}>
                  {tCommon("action.cancel")}
                </button>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => void handleStartConversation()}
                  disabled={isStartDisabled}
                >
                  {isBusy ? tShell("launcher.starting") : tShell("launcher.start")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {imagePreview && typeof document !== "undefined" ? createPortal(
        <ImagePreviewDialog
          src={imagePreview.src}
          name={imagePreview.name}
          onClose={() => setImagePreview(null)}
        />,
        document.body
      ) : null}

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </ShellLayout>
  )
}
