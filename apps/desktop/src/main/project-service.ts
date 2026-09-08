import {
  accessSync,
  closeSync,
  constants,
  type Dirent,
  existsSync,
  type BigIntStats,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  type Stats
} from "node:fs"
import {
  access as accessAsync,
  lstat as lstatAsync,
  readdir as readdirAsync,
  realpath as realpathAsync,
  stat as statAsync
} from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { and, desc, eq, inArray, lt, or } from "drizzle-orm"
import {
  appSettingsTable,
  artifactsTable,
  conversationMessageAttachmentsTable,
  conversationMessagesTable,
  conversationsTable,
  createAppDatabase,
  executionRunsTable,
  projectsTable,
  queuedConversationMessageAttachmentsTable,
  queuedConversationMessagesTable,
  runEventsTable,
  worktreesTable
} from "@db"
import { createCustomModelsService } from "./services/custom-models-service"
import { createBackgroundTaskSupervisor } from "./services/background-task-supervisor"
import { createGitProcessRunner } from "./services/git-process-runner"
import type { LoggingService } from "./services/logging-service"
import { recoverInterruptedRuns } from "./services/run-recovery-service"
import { createRunEventStore } from "./services/run-event-store"
import { compactGeneratedImagePayload, generatedImageId, readGeneratedImageSource, storeGeneratedImage } from "./services/generated-image-service"
import { providerImageSourceSchema, readLegacyContentImageSources } from "./services/provider-image-source"
import { readMarkdownOutputImages, rewriteMarkdownOutputImages } from "./services/markdown-output-images"
import { createWorktreeGitWatcherService, type WorktreeGitWatcher } from "./services/worktree-git-watcher-service"
import {
  appContextSnapshotSchema,
  artifactSummarySchema,
  appErrorSchema,
  canonicalRunEventSchema,
  cancelConversationRunInputSchema,
  cancelConversationRunResultSchema,
  conversationAttachmentSummarySchema,
  generatedImageSummarySchema,
  conversationMessageSummarySchema,
  CONVERSATION_FILE_AUTOMATIC_OPEN_MAX_BYTES,
  CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES,
  conversationFileEntryMutationResultSchema,
  conversationFileEntryRevealResultSchema,
  conversationFileReadInputSchema,
  conversationFileReadResultSchema,
  conversationFileWriteInputSchema,
  conversationFileWriteResultSchema,
  conversationProjectFilesSchema,
  conversationSummarySchema,
  conversationTimelineSchema,
  conversationGitStatusSchema,
  createConversationInputSchema,
  createConversationResultSchema,
  createConversationFileEntryInputSchema,
  DEFAULT_GIT_COMMIT_SCOPE,
  DEFAULT_PROVIDER_ACCESS_MODE,
  deleteConversationFileEntryInputSchema,
  deleteQueuedConversationMessageInputSchema,
  deleteQueuedConversationMessageResultSchema,
  deleteWorktreeInputSchema,
  deleteWorktreeResultSchema,
  editorOptionSchema,
  externalOpenOptionSchema,
  executionTargetSchema,
  executionRunSummarySchema,
  getConversationProjectFilesResultSchema,
  getConversationTimelineResultSchema,
  getConversationTimelinePageInputSchema,
  getConversationTimelinePageResultSchema,
  getConversationGitStatusResultSchema,
  getConversationChangesInputSchema,
  getConversationChangesResultSchema,
  getConversationChangeDiffInputSchema,
  getConversationChangeDiffResultSchema,
  getConversationChangeDiffDocumentInputSchema,
  getConversationChangeDiffDocumentResultSchema,
  stageConversationChangesInputSchema,
  stageConversationChangesResultSchema,
  unstageConversationChangesInputSchema,
  unstageConversationChangesResultSchema,
  discardConversationChangesInputSchema,
  discardConversationChangesResultSchema,
  commitConversationChangesInputSchema,
  commitConversationChangesResultSchema,
  getProjectWorktreeFilesResultSchema,
  importedProjectSummarySchema,
  importProjectInputSchema,
  importProjectResultSchema,
  moveProjectInputSchema,
  projectMutationResultSchema,
  revealProjectInFinderResultSchema,
  openConversationHandoffInputSchema,
  openConversationHandoffResultSchema,
  openConversationExternalInputSchema,
  openConversationExternalResultSchema,
  openConversationTerminalInputSchema,
  openConversationTerminalResultSchema,
  selectedEditorResultSchema,
  isValidModelForProvider,
  providerBadgeSchema,
  providerAccessModeSchema,
  providerKindSchema,
  parseProviderSlashCommand,
  queuedConversationMessageSummarySchema,
  runEventSummarySchema,
  runEventPushPayloadSchema,
  retryConversationRunWithPermissionsInputSchema,
  retryConversationRunWithPermissionsResultSchema,
  sendConversationMessageInputSchema,
  sendConversationMessageResultSchema,
  setConversationAccessModeInputSchema,
  setConversationAccessModeResultSchema,
  setConversationModelInputSchema,
  setConversationModelResultSchema,
  renameConversationInputSchema,
  renameConversationFileEntryInputSchema,
  renameConversationResultSchema,
  revealConversationFileEntryInputSchema,
  deleteConversationInputSchema,
  deleteConversationResultSchema,
  terminalActionResultSchema,
  terminalCloseInputSchema,
  terminalOutputEventSchema,
  terminalResizeInputSchema,
  terminalSessionSummarySchema,
  terminalWriteInputSchema,
  type AppContextSnapshot,
  type AppError,
  type AppThemePreference,
  type ArtifactSummary,
  type CancelConversationRunInput,
  type CancelConversationRunResult,
  type CanonicalRunEventType,
  type ConversationAttachmentInput,
  type ConversationAttachmentSummary,
  type ConversationGitFileDisplayStatus,
  type ConversationGitFileStatus,
  type ConversationChangeFile,
  type ConversationChangesSnapshot,
  type ConversationFileEntryKind,
  type ConversationFileEntryMutationResult,
  type ConversationFileEntryRevealResult,
  type ConversationFileMetadata,
  type ConversationFileReadInput,
  type ConversationFileReadResult,
  type ConversationFileWriteInput,
  type ConversationFileWriteResult,
  type ConversationMessageSummary,
  type ConversationRunStatus,
  type ConversationSummary,
  type ConversationTimeline,
  type CreateConversationInput,
  type CreateConversationResult,
  type CreateConversationFileEntryInput,
  type DeleteConversationFileEntryInput,
  type DeleteQueuedConversationMessageInput,
  type DeleteQueuedConversationMessageResult,
  type DeleteWorktreeInput,
  type DeleteWorktreeResult,
  type EditorOption,
  type ErrorDomain,
  type ExternalOpenAppId,
  type ExternalOpenOption,
  type ExecutionRunSummary,
  type ExecutionTarget,
  type GetConversationGitStatusInput,
  type GetConversationChangesInput,
  type GetConversationChangesResult,
  type GetConversationChangeDiffInput,
  type GetConversationChangeDiffResult,
  type GetConversationChangeDiffDocumentInput,
  type GetConversationChangeDiffDocumentResult,
  type StageConversationChangesInput,
  type StageConversationChangesResult,
  type UnstageConversationChangesInput,
  type UnstageConversationChangesResult,
  type DiscardConversationChangesInput,
  type DiscardConversationChangesResult,
  type CommitConversationChangesInput,
  type CommitConversationChangesResult,
  type GetConversationTimelineResult,
  type GetConversationTimelinePageInput,
  type GetConversationTimelinePageResult,
  type GetConversationGitStatusResult,
  type GetConversationProjectFilesResult,
  type GetProjectWorktreeFilesResult,
  type GitCommitScope,
  type ImportProjectInput,
  type ImportProjectResult,
  type ImportedProjectSummary,
  type Locale,
  type MoveProjectInput,
  type OpenConversationHandoffInput,
  type OpenConversationHandoffResult,
  type OpenConversationExternalInput,
  type OpenConversationExternalResult,
  type OpenConversationTerminalInput,
  type OpenConversationTerminalResult,
  type ProviderBadge,
  type ProviderAccessMode,
  type ProviderKind,
  type ProviderModelOption,
  type ProjectMutationResult,
  type ProjectFileTreeItem,
  type ProviderReadinessSnapshot,
  type ProjectWorktreeSummary,
  type QueuedConversationMessageSummary,
  type RunEventSummary,
  type SelectedEditorResult,
  type SelectProjectResult,
  type SelectConversationResult,
  type SendConversationMessageInput,
  type SendConversationMessageResult,
  type SetConversationAccessModeInput,
  type SetConversationAccessModeResult,
  type SetSelectedEditorInput,
  type SetConversationModelInput,
  type SetConversationModelResult,
  type RenameConversationInput,
  type RenameConversationFileEntryInput,
  type RenameConversationResult,
  type RevealProjectInFinderResult,
  type RevealConversationFileEntryInput,
  type DeleteConversationInput,
  type DeleteConversationResult,
  type TerminalActionResult,
  type TerminalCloseInput,
  type TerminalOutputEvent,
  type TerminalResizeInput,
  type TerminalSessionSummary,
  type TerminalWriteInput,
  type WorktreeKind,
  type WorktreeSummary,
  type WorktreeGitChangedEvent,
  type HostNotificationPayload,
  type RunEventPushPayload,
} from "@shared/index"
import type { ProviderRunInput, ProviderRunResult } from "./services/provider-runtime-service"
import {
  buildConversationChangeGroups,
  countConversationChangeTextLines,
  parseGitNumstat,
  parseGitPorcelainStatus,
  truncateUnifiedPatch,
  type ChangeStats
} from "./conversation-changes-git"

const CURRENT_PROJECT_SETTING_KEY = "current_project_id"
const CURRENT_CONVERSATION_SETTING_KEY = "current_conversation_id"
const HIDDEN_PROJECT_IDS_SETTING_KEY = "hidden_project_ids"
const PROJECT_ORDER_SETTING_KEY = "project_order"
const LOCALE_SETTING_KEY = "locale"
const APP_THEME_SETTING_KEY = "app_theme"
const SELECTED_EDITOR_SETTING_KEY = "selected_coding_editor_id"
const DEFAULT_WORKTREE_KIND: WorktreeKind = "default"
const GIT_WORKTREE_KIND: WorktreeKind = "git_worktree"
const DEFAULT_LOCALE: Locale = "en"
const DEFAULT_APP_THEME: AppThemePreference = "dark"
const DEFAULT_TERMINAL_COLS = 80
const DEFAULT_TERMINAL_ROWS = 24
const RUN_IN_PROGRESS_SENTINEL = "TEAMCOW_CONVERSATION_RUN_IN_PROGRESS"
const QUEUED_MESSAGE_NOT_FOUND_SENTINEL = "TEAMCOW_QUEUED_MESSAGE_NOT_FOUND"
export const CONVERSATION_ATTACHMENT_SCHEME = "teamcow-attachment"
const CONVERSATION_ATTACHMENT_DIRECTORY = "conversation-attachments"
const DEFAULT_ATTACHMENT_MIME_TYPE = "application/octet-stream"
const INLINE_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])
const ATTACHMENT_MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".yaml": "application/yaml",
  ".yml": "application/yaml"
}
const requireFromProjectService = createRequire(import.meta.url)

const resolveAttachmentMimeType = (attachment: ConversationAttachmentInput) =>
  attachment.mimeType.trim().toLowerCase() ||
  ATTACHMENT_MIME_TYPE_BY_EXTENSION[extname(attachment.name).toLowerCase()] ||
  DEFAULT_ATTACHMENT_MIME_TYPE

const getAttachmentStorageSuffix = (name: string, mimeType: string) => {
  const originalSuffix = extname(name).toLowerCase()
  if (/^\.[a-z0-9]{1,16}$/.test(originalSuffix)) {
    return originalSuffix
  }

  return Object.entries(ATTACHMENT_MIME_TYPE_BY_EXTENSION)
    .find(([, candidateMimeType]) => candidateMimeType === mimeType)?.[0] ?? ""
}

const createConversationAttachmentUri = (conversationId: string, attachmentId: string) =>
  `${CONVERSATION_ATTACHMENT_SCHEME}://conversation/${encodeURIComponent(conversationId)}/${encodeURIComponent(attachmentId)}`

type TimestampFactory = () => string
type EditorPathOpener = (input: { editorId: string; appName: string; bundleId?: string | null; targetPath: string }) => Promise<string>
type InstalledEditorDetector = () => string[]
type ExternalAppPathOpener = (input: { appId: ExternalOpenAppId; appName: string; bundleId?: string | null; targetPath: string }) => Promise<string>
type InstalledExternalAppDetector = () => ExternalOpenAppId[]
type ExternalAppIconResolver = (input: { appId: ExternalOpenAppId; appName: string; bundleId?: string | null }) => string | null
type TerminalDisposable = {
  dispose: () => void
}
type TerminalPtyProcess = {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  onData: (callback: (data: string) => void) => TerminalDisposable
  onExit: (callback: (event: { exitCode: number; signal?: number }) => void) => TerminalDisposable
}
type TerminalPtySpawnInput = {
  shell: string
  cwd: string
  cols: number
  rows: number
}
type TerminalPtySpawnResult =
  | {
      status: "ok"
      pty: TerminalPtyProcess
    }
  | {
      status: "error"
      error: AppError
    }
type TerminalPtySpawner = (input: TerminalPtySpawnInput) => TerminalPtySpawnResult
type TerminalShellResolver = () => string | null

type ConfirmGitInitDetails = {
  directoryPath: string
  projectName: string
}

type NativeConversationFileAtomicWriteInput = {
  rootPath: string
  relativeParentPath: string
  targetBaseName: string
  tempName: string
  content: string | Buffer
  targetKind?: "file" | "symlink"
  targetMode: number
  expectedRootDev: string
  expectedRootIno: string
  expectedTargetDev: string
  expectedTargetIno: string
  expectedTargetMode?: string
  expectedTargetSize?: string
  expectedTargetMtimeNs?: string
  expectedTargetCtimeNs?: string
  expectedTargetMissing?: boolean
  createParentDirectories?: boolean
}

type NativeConversationFileAtomicWriteResult =
  | {
      status: "ok"
    }
  | {
      status: "error"
      error: AppError
      nativeStatus?: string
      didMutate?: boolean
    }

type ConversationFileAtomicWriter = (input: NativeConversationFileAtomicWriteInput) => NativeConversationFileAtomicWriteResult

type NativeConversationChangeRemoveInput = {
  conversationId: string
  worktreeId: string
  rootPath: string
  relativeParentPath: string
  targetBaseName: string
  expectedRootDev: string
  expectedRootIno: string
  expectedTargetDev: string
  expectedTargetIno: string
  expectedTargetMode: string
  expectedTargetSize: string
  expectedTargetMtimeNs: string
  expectedTargetCtimeNs: string
  manifest: Array<{
    path: string
    kind: "directory" | "file" | "symlink" | "other"
    dev: string
    ino: string
    mode: string
    size: string
    mtimeNs: string
    ctimeNs: string
  }>
}

type NativeConversationChangeRemoveResult =
  | { status: "ok"; didMutate: boolean }
  | { status: "error"; error: AppError; didMutate: boolean; nativeStatus?: string }

type ConversationChangeRemover = (input: NativeConversationChangeRemoveInput) => NativeConversationChangeRemoveResult

type ProjectServiceDeps = {
  userDataPath: string
  pickProjectDirectory: () => Promise<string | null>
  confirmGitInit: (details: ConfirmGitInitDetails) => Promise<boolean>
  getProviderReadinessSnapshot?: () => ProviderReadinessSnapshot
  listProviderModels?: (providerKind: ProviderKind) => Promise<ProviderModelOption[]>
  gitBinaryAvailable?: () => MaybePromise<boolean>
  initializeGit?: (directoryPath: string) => MaybePromise<AppError | null>
  createGitWorktree?: (projectRootPath: string, branch: string, targetPath: string) => MaybePromise<AppError | null>
  removeGitWorktree?: (projectRootPath: string, worktreeRootPath: string) => MaybePromise<AppError | null>
  readGitStatus?: (worktreeRootPath: string) => MaybePromise<GitStatusReadResult>
  readGitCommand?: GitCommandRunner
  readGitBlob?: GitBlobReader
  openEditorPath?: EditorPathOpener
  listInstalledEditors?: InstalledEditorDetector
  openExternalAppPath?: ExternalAppPathOpener
  listInstalledExternalOpenApps?: InstalledExternalAppDetector
  getExternalAppIconDataUrl?: ExternalAppIconResolver
  getTerminalShell?: TerminalShellResolver
  spawnTerminalPty?: TerminalPtySpawner
  onTerminalOutput?: (event: TerminalOutputEvent) => void
  onRunEvent?: (event: RunEventPushPayload) => void
  onWorktreeGitChanged?: (event: WorktreeGitChangedEvent) => void
  worktreeGitWatcher?: WorktreeGitWatcher
  isAppFocused?: () => boolean
  runProvider?: (input: ProviderRunInput) => Promise<ProviderRunResult>
  cancelProviderRun?: (conversationId: string) => boolean
  cancelProviderRunById?: (runId: string, conversationId: string) => boolean
  afterCreateConversationPersist?: (details: { conversationId: string; worktreeId: string }) => void
  afterSendConversationMessagePersist?: (details: { conversationId: string; runId: string; messageId: string }) => void
  onRunNotificationCandidate?: (payload: RunNotificationCandidate) => void
  log?: Pick<LoggingService, "error" | "info" | "warn">
  now?: TimestampFactory
  beforeOpenConversationChangesUntrackedFile?: (details: {
    worktreeRootPath: string
    filePath: string
    targetPath: string
    realTargetPath: string
  }) => void
  beforeDiscardConversationChange?: (details: {
    worktreeRootPath: string
    filePath: string
    targetPath: string
  }) => void
  beforeNativeConversationChangeRemove?: (details: {
    worktreeRootPath: string
    filePath: string
    targetPath: string
  }) => void
  beforeNativeTrackedDiscardApply?: (details: {
    worktreeRootPath: string
    filePath: string
    targetPath: string
  }) => void
  conversationChangeRemover?: ConversationChangeRemover
  beforeConversationFileAtomicWrite?: () => void
  conversationFileAtomicWriter?: ConversationFileAtomicWriter
}

type ConversationFileRevisionStats = {
  birthtimeMs: number
  birthtimeNs: bigint | null
  ctimeMs: number
  ctimeNs: bigint | null
  dev: number
  ino: number
  isDirectory: Stats["isDirectory"]
  isFile: Stats["isFile"]
  mtime: Date
  mtimeMs: number
  mtimeNs: bigint | null
  size: number
}

type CandidateProjectResolution =
  | {
      status: "cancelled"
    }
  | {
      status: "error"
      error: AppError
    }
  | {
      status: "ready"
      rootPath: string
      initializedGit: boolean
    }

type ProjectRow = typeof projectsTable.$inferSelect
type WorktreeRow = typeof worktreesTable.$inferSelect
type ConversationRow = typeof conversationsTable.$inferSelect
type ConversationMessageRow = typeof conversationMessagesTable.$inferSelect
type ConversationMessageAttachmentRow = typeof conversationMessageAttachmentsTable.$inferSelect
type PreparedConversationAttachment = ConversationMessageAttachmentRow
type QueuedConversationMessageRow = typeof queuedConversationMessagesTable.$inferSelect
type QueuedConversationMessageAttachmentRow = typeof queuedConversationMessageAttachmentsTable.$inferSelect
type ExecutionRunRow = typeof executionRunsTable.$inferSelect
type RunEventRow = typeof runEventsTable.$inferSelect
type ArtifactRow = typeof artifactsTable.$inferSelect

type RunNotificationCandidate = Pick<HostNotificationPayload, "kind" | "context" | "params">

type AppendRunArtifactInput = {
  conversationId: string
  runId: string
  kind: string
  title?: string | null
  uri?: string | null
  payload: Record<string, unknown>
}

type AppendRunEventInput = {
  conversationId: string
  runId: string
  type: CanonicalRunEventType
  payload: Record<string, unknown>
  status?: ConversationRunStatus
  providerEventId?: string
}

type GitStatusReadResult =
  | {
      status: "ok"
      stdout: string
      stderr?: string
    }
  | {
      status: "error"
      error: AppError
    }

type GitCommandReadResult = GitStatusReadResult
type GitCommandOptions = {
  timeoutMs?: number
  mutation?: boolean
  cacheTtlMs?: number
}
type MaybePromise<T> = T | Promise<T>
type GitCommandRunner = (
  worktreeRootPath: string,
  args: string[],
  options?: GitCommandOptions
) => MaybePromise<GitCommandReadResult & {
  stdoutByteLength?: number
  stdoutTruncated?: boolean
}>

type GitBlobReader = (
  worktreeRootPath: string,
  objectId: string
) => MaybePromise<{ status: "ok"; content: Buffer } | { status: "error"; error: AppError }>

const createProviderRunEventKey = (event: ProviderRunResult["events"][number]) =>
  JSON.stringify({
    type: event.type,
    status: event.status ?? null,
    payload: event.payload
  })

const buildAppError = (
  code: AppError["code"],
  message: string,
  suggestion?: string | null,
  details?: {
    domain?: ErrorDomain
    context?: Record<string, unknown>
  }
): AppError =>
  appErrorSchema.parse({
    code,
    message,
    suggestion: suggestion ?? null,
    domain: details?.domain,
    context: details?.context
      ? {
          ...details.context,
          errorCode: code
        }
      : undefined
  })

const nativeConversationFileAtomicWriteName = "conversation-file-atomic-write"
const nativeConversationFileAtomicWriteSource = "src/main/native/conversation-file-atomic-write.c"

const readProcessResourcesPath = () => (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath

const findDesktopRootForNativeHelper = () => {
  let currentPath = dirname(fileURLToPath(import.meta.url))

  while (true) {
    if (existsSync(join(currentPath, nativeConversationFileAtomicWriteSource))) {
      return currentPath
    }

    const nextPath = dirname(currentPath)
    if (nextPath === currentPath) {
      return null
    }
    currentPath = nextPath
  }
}

const compileNativeConversationFileAtomicWriteHelper = (desktopRoot: string) => {
  if (process.platform !== "darwin") {
    return {
      status: "error" as const,
      error: buildAppError("FILE_WRITE_FAILED", "Native conversation file writer is only available on macOS", null, {
        domain: "filesystem",
        context: { platform: process.platform }
      })
    }
  }

  const sourcePath = join(desktopRoot, nativeConversationFileAtomicWriteSource)
  const sourceMtime = (() => {
    try {
      return String(Math.trunc(statSync(sourcePath).mtimeMs))
    } catch {
      return "missing"
    }
  })()

  const outputDir = join(tmpdir(), "teamcow-native-helpers", process.arch, sourceMtime)
  const outputPath = join(outputDir, nativeConversationFileAtomicWriteName)
  if (existsSync(outputPath)) {
    return { status: "ok" as const, helperPath: outputPath }
  }

  try {
    mkdirSync(outputDir, { recursive: true })
  } catch (err) {
    return {
      status: "error" as const,
      error: buildAppError("FILE_WRITE_FAILED", "Native conversation file writer output directory could not be prepared", err instanceof Error ? err.message : String(err), {
        domain: "filesystem",
        context: { outputDir }
      })
    }
  }

  const result = spawnSync("clang", ["-O2", "-Wall", "-Wextra", sourcePath, "-o", outputPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  })

  if (result.error || result.status !== 0) {
    return {
      status: "error" as const,
      error: buildAppError(
        "FILE_WRITE_FAILED",
        "Native conversation file writer could not be built",
        result.error?.message ?? (result.stderr.trim() || result.stdout.trim() || null),
        {
          domain: "filesystem",
          context: { sourcePath, outputPath, exitCode: result.status }
        }
      )
    }
  }

  return { status: "ok" as const, helperPath: outputPath }
}

const resolveNativeConversationFileAtomicWriteHelper = () => {
  const resourcesPath = readProcessResourcesPath()
  const packagedPath = resourcesPath ? join(resourcesPath, "native", nativeConversationFileAtomicWriteName) : null
  if (packagedPath && existsSync(packagedPath)) {
    return { status: "ok" as const, helperPath: packagedPath }
  }

  const desktopRoot = findDesktopRootForNativeHelper()
  if (!desktopRoot) {
    return {
      status: "error" as const,
      error: buildAppError("FILE_WRITE_FAILED", "Native conversation file writer source could not be located", null, {
        domain: "filesystem"
      })
    }
  }

  const devPath = join(desktopRoot, "out/native", nativeConversationFileAtomicWriteName)
  if (existsSync(devPath)) {
    return { status: "ok" as const, helperPath: devPath }
  }

  return compileNativeConversationFileAtomicWriteHelper(desktopRoot)
}

const parseNativeConversationFileAtomicWriteOutput = (stdout: string, stderr: string) => {
  const output = stdout.trim() || stderr.trim()
  if (!output) {
    return null
  }

  try {
    return JSON.parse(output) as { status?: string; errnoName?: string; message?: string; didMutate?: boolean }
  } catch {
    return null
  }
}

const mapNativeConversationFileAtomicWriteError = (
  result: { status?: string; errnoName?: string; message?: string } | null
) => {
  const nativeStatus = result?.status ?? "unknown"
  const errnoName = result?.errnoName ?? "UNKNOWN"
  const message = result?.message ?? "Native conversation file writer failed"

  if (
    nativeStatus === "root_changed" ||
    nativeStatus === "root_open_failed" ||
    nativeStatus === "parent_open_failed" ||
    nativeStatus === "parent_create_failed"
  ) {
    return buildAppError("FILE_PATH_OUTSIDE_WORKTREE", "File parent directory could not be safely opened while saving", message, {
      domain: "filesystem",
      context: { nativeStatus, errnoName }
    })
  }

  if (nativeStatus === "target_changed") {
    return buildAppError("FILE_WRITE_FAILED", "File target changed while saving", message, {
      domain: "filesystem",
      context: { nativeStatus, errnoName }
    })
  }

  return buildAppError("FILE_WRITE_FAILED", "File could not be saved by the native atomic writer", message, {
    domain: "filesystem",
    context: { nativeStatus, errnoName }
  })
}

const writeConversationFileWithNativeHelper: ConversationFileAtomicWriter = (input) => {
  const helper = resolveNativeConversationFileAtomicWriteHelper()
  if (helper.status === "error") {
    return helper
  }

  const result = spawnSync(
    helper.helperPath,
    [
      input.rootPath,
      input.relativeParentPath,
      input.targetBaseName,
      input.tempName,
      input.targetKind ?? "file",
      String(input.targetMode),
      input.expectedRootDev,
      input.expectedRootIno,
      input.expectedTargetMissing ? "missing" : "present",
      input.expectedTargetDev,
      input.expectedTargetIno,
      input.expectedTargetMode ?? "0",
      input.expectedTargetSize ?? "0",
      input.expectedTargetMtimeNs ?? "0",
      input.expectedTargetCtimeNs ?? "0",
      input.createParentDirectories ? "create" : "existing"
    ],
    {
      input: typeof input.content === "string" ? Buffer.from(input.content, "utf8") : input.content,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    }
  )
  const parsedOutput = parseNativeConversationFileAtomicWriteOutput(result.stdout, result.stderr)

  if (result.error || result.status !== 0 || parsedOutput?.status !== "ok") {
    return {
      status: "error",
      error: result.error
        ? buildAppError("FILE_WRITE_FAILED", "Native conversation file writer could not be started", result.error.message, {
            domain: "filesystem",
            context: { helperPath: helper.helperPath }
          })
        : mapNativeConversationFileAtomicWriteError(parsedOutput),
      nativeStatus: parsedOutput?.status,
      didMutate: parsedOutput?.didMutate === true
    }
  }

  return { status: "ok" }
}

const nativeConversationChangeRemoveName = "conversation-change-remove"
const nativeConversationChangeRemoveSource = "src/main/native/conversation-change-remove.c"

const compileNativeConversationChangeRemoveHelper = (desktopRoot: string) => {
  if (process.platform !== "darwin") {
    return {
      status: "error" as const,
      error: buildAppError("GIT_CHANGE_OPERATION_FAILED", "Native conversation change removal is only available on macOS", null, {
        domain: "git",
        context: { platform: process.platform, command: "conversation-change-remove" }
      })
    }
  }

  const sourcePath = join(desktopRoot, nativeConversationChangeRemoveSource)
  const sourceMtime = (() => {
    try {
      return String(Math.trunc(statSync(sourcePath).mtimeMs))
    } catch {
      return "missing"
    }
  })()
  const outputDir = join(tmpdir(), "teamcow-native-helpers", process.arch, `change-remove-${sourceMtime}`)
  const outputPath = join(outputDir, nativeConversationChangeRemoveName)
  if (existsSync(outputPath)) {
    return { status: "ok" as const, helperPath: outputPath }
  }

  try {
    mkdirSync(outputDir, { recursive: true })
  } catch (err) {
    return {
      status: "error" as const,
      error: buildAppError(
        "GIT_CHANGE_OPERATION_FAILED",
        "Native conversation change removal output directory could not be prepared",
        err instanceof Error ? err.message : String(err),
        { domain: "git", context: { worktreeRootPath: desktopRoot, command: "conversation-change-remove" } }
      )
    }
  }

  const result = spawnSync("clang", ["-O2", "-Wall", "-Wextra", sourcePath, "-o", outputPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  })
  if (result.error || result.status !== 0) {
    return {
      status: "error" as const,
      error: buildAppError(
        "GIT_CHANGE_OPERATION_FAILED",
        "Native conversation change remover could not be built",
        result.error?.message ?? (result.stderr.trim() || result.stdout.trim() || null),
        { domain: "git", context: { worktreeRootPath: desktopRoot, command: "conversation-change-remove" } }
      )
    }
  }
  return { status: "ok" as const, helperPath: outputPath }
}

const resolveNativeConversationChangeRemoveHelper = () => {
  const resourcesPath = readProcessResourcesPath()
  const packagedPath = resourcesPath ? join(resourcesPath, "native", nativeConversationChangeRemoveName) : null
  if (packagedPath && existsSync(packagedPath)) {
    return { status: "ok" as const, helperPath: packagedPath }
  }

  const desktopRoot = findDesktopRootForNativeHelper()
  if (!desktopRoot) {
    return {
      status: "error" as const,
      error: buildAppError("GIT_CHANGE_OPERATION_FAILED", "Native conversation change remover source could not be located", null, {
        domain: "git",
        context: { command: "conversation-change-remove" }
      })
    }
  }

  const devPath = join(desktopRoot, "out/native", nativeConversationChangeRemoveName)
  if (existsSync(devPath)) {
    return { status: "ok" as const, helperPath: devPath }
  }
  return compileNativeConversationChangeRemoveHelper(desktopRoot)
}

const removeConversationChangeWithNativeHelper: ConversationChangeRemover = (input) => {
  const helper = resolveNativeConversationChangeRemoveHelper()
  if (helper.status === "error") {
    return { ...helper, didMutate: false }
  }

  const manifestInput = [
    `TCREMOVE2\t${input.manifest.length}`,
    ...input.manifest.map((entry) => [
      Buffer.from(entry.path, "utf8").toString("hex"),
      entry.kind === "directory" ? "d" : entry.kind === "file" ? "f" : entry.kind === "symlink" ? "l" : "o",
      entry.dev,
      entry.ino,
      entry.mode,
      entry.size,
      entry.mtimeNs,
      entry.ctimeNs
    ].join("\t"))
  ].join("\n") + "\n"
  const result = spawnSync(
    helper.helperPath,
    [
      input.rootPath,
      input.relativeParentPath,
      input.targetBaseName,
      input.expectedRootDev,
      input.expectedRootIno,
      input.expectedTargetDev,
      input.expectedTargetIno,
      input.expectedTargetMode,
      input.expectedTargetSize,
      input.expectedTargetMtimeNs,
      input.expectedTargetCtimeNs
    ],
    {
      input: manifestInput,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024
    }
  )
  const parsedOutput = parseNativeConversationFileAtomicWriteOutput(result.stdout, result.stderr)
  if (result.error || result.status !== 0 || parsedOutput?.status !== "ok") {
    const nativeStatus = parsedOutput?.status ?? "unknown"
    const errnoName = parsedOutput?.errnoName ?? "UNKNOWN"
    const message = parsedOutput?.message ?? result.error?.message ?? "Native conversation change removal failed"
    return {
      status: "error",
      error: buildAppError(
        "GIT_CHANGE_OPERATION_FAILED",
        "Untracked conversation change could not be safely removed",
        `${nativeStatus}/${errnoName}: ${message}`,
        {
          domain: "git",
          context: {
            conversationId: input.conversationId,
            worktreeId: input.worktreeId,
            worktreeRootPath: input.rootPath,
            command: nativeConversationChangeRemoveName
          }
        }
      ),
      didMutate: parsedOutput?.didMutate === true,
      nativeStatus
    }
  }
  return { status: "ok", didMutate: parsedOutput.didMutate === true }
}

const addAppErrorContext = (
  error: AppError,
  domain: ErrorDomain,
  context: Record<string, unknown>
): AppError =>
  appErrorSchema.parse({
    ...error,
    domain: error.domain ?? domain,
    context: {
      ...context,
      ...error.context,
      errorCode: error.code
    }
  })

const getDefaultTerminalShell = () => process.env.SHELL?.trim() || "/bin/zsh"

const defaultSpawnTerminalPty: TerminalPtySpawner = ({ shell, cwd, cols, rows }) => {
  let nodePty: {
    spawn: (
      file: string,
      args: string[],
      options: {
        name: string
        cwd: string
        cols: number
        rows: number
        env: NodeJS.ProcessEnv
      }
    ) => TerminalPtyProcess
  }

  try {
    nodePty = requireFromProjectService("node-pty") as typeof nodePty
  } catch (err) {
    return {
      status: "error",
      error: buildAppError(
        "TERMINAL_NATIVE_MODULE_FAILED",
        "Terminal PTY native module could not be loaded",
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  try {
    return {
      status: "ok",
      pty: nodePty.spawn(shell, [], {
        name: "xterm-256color",
        cwd,
        cols,
        rows,
        env: process.env
      })
    }
  } catch (err) {
    return {
      status: "error",
      error: buildAppError(
        "TERMINAL_START_FAILED",
        `Terminal PTY could not be started with ${shell}`,
        err instanceof Error ? err.message : String(err)
      )
    }
  }
}

const buildStableConversationTitle = (provider: string, createdAt: string) => {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) {
    return `${provider} conversation`
  }

  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  return `${provider} ${hour}:${minute}`
}

const parseJsonRecord = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {
      raw: parsed,
      parseError: "non-object-json"
    }
  } catch {
    return {
      raw: value,
      parseError: "invalid-json"
    }
  }
}

const readStringValue = (value: unknown) => typeof value === "string" ? value : null

const readRecordValue = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null

const readToolResultText = (value: unknown): string | null => {
  const text = readStringValue(value)
  if (text !== null) {
    return text
  }

  if (!Array.isArray(value)) {
    return null
  }

  const blockText = value
    .map((entry) => {
      const block = readRecordValue(entry)
      return readStringValue(block?.text) ?? readStringValue(block?.content) ?? ""
    })
    .join("")

  return blockText.length > 0 ? blockText : null
}

const isClaudePermissionDeniedEvent = (event: ProviderRunResult["events"][number]) => {
  if (
    event.type !== "run.progress" ||
    event.payload.provider !== "claude" ||
    readStringValue(event.payload.contentType) !== "tool_result"
  ) {
    return false
  }

  const toolResult = readRecordValue(event.payload.toolResult)
  const content = readToolResultText(toolResult?.content)
  return Boolean(content?.trim().match(/^Claude requested permissions to use [^,]+, but you haven't granted it yet\.?$/))
}

const isClaudePermissionGatedToolName = (toolName: string) =>
  toolName.startsWith("mcp__") ||
  toolName === "WebFetch" ||
  toolName === "WebSearch"

const expandClaudeAllowedTool = (toolName: string): string[] => {
  if (toolName === "WebFetch" || toolName === "mcp__web-reader__webReader" || toolName.includes("__web-reader__")) {
    return [toolName, "WebFetch", "mcp__web-reader__webReader"]
  }

  if (toolName === "WebSearch" || toolName === "mcp__web-search-prime__web_search_prime" || toolName.includes("__web-search")) {
    return [toolName, "WebSearch", "mcp__web-search-prime__web_search_prime"]
  }

  return [toolName]
}

const expandClaudeAllowedTools = (allowedTools: ProviderRunInput["allowedTools"]) =>
  new Set(
    (allowedTools ?? [])
      .map((tool) => tool.trim())
      .filter(Boolean)
      .flatMap(expandClaudeAllowedTool)
  )

const isAllowedClaudeTool = (toolName: string, allowedTools: ProviderRunInput["allowedTools"]) =>
  expandClaudeAllowedTools(allowedTools).has(toolName)

const isClaudePermissionPromptEvent = (
  event: ProviderRunResult["events"][number],
  allowedTools: ProviderRunInput["allowedTools"]
) => {
  if (
    event.type !== "run.progress" ||
    event.payload.provider !== "claude" ||
    readStringValue(event.payload.contentType) !== "tool_use"
  ) {
    return false
  }

  const toolUse = readRecordValue(event.payload.toolUse)
  const toolName = readStringValue(toolUse?.name)
  return Boolean(
    toolName &&
    isClaudePermissionGatedToolName(toolName) &&
    !isAllowedClaudeTool(toolName, allowedTools)
  )
}

const compareTimelineText = (left: string, right: string) => left.localeCompare(right)

const isTerminalRunStatus = (status: ConversationRunStatus) =>
  status === "completed" || status === "failed" || status === "interrupted" || status === "unavailable"

const toRunNotificationKind = (status: ConversationRunStatus): RunNotificationCandidate["kind"] | null => {
  switch (status) {
    case "completed":
      return "run-completed"
    case "failed":
    case "interrupted":
      return "run-failed"
    case "unavailable":
      return "run-unavailable"
    default:
      return null
  }
}

const getShortWorktreeName = (rootPath: string) => {
  const trimmed = rootPath.replace(/[\\/]+$/, "")
  const segments = trimmed.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) ?? rootPath
}

const buildProviderBadge = (provider: string): ProviderBadge => {
  if (provider === "codex") {
    return providerBadgeSchema.parse({
      kind: provider,
      label: provider,
      status: "ready"
    })
  }

  if (provider === "claude") {
    return providerBadgeSchema.parse({
      kind: provider,
      label: provider,
      status: "ready"
    })
  }

  if (provider === "opencode" || provider === "cursor") {
    return providerBadgeSchema.parse({
      kind: provider,
      label: provider,
      status: "ready"
    })
  }

  return providerBadgeSchema.parse({
    kind: provider,
    label: "not-selected",
    status: "unknown"
  })
}

const normalizeProviderAccessMode = (value: unknown): ProviderAccessMode => {
  const parsed = providerAccessModeSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_PROVIDER_ACCESS_MODE
}

const assertReadableDirectory = (candidatePath: string): string | AppError => {
  const resolvedPath = resolve(candidatePath)

  if (!existsSync(resolvedPath)) {
    return buildAppError("PATH_NOT_FOUND", `Resolved path does not exist: ${resolvedPath}`)
  }

  const stats = statSync(resolvedPath)
  if (!stats.isDirectory()) {
    return buildAppError("NOT_A_DIRECTORY", `Resolved path is not a directory: ${resolvedPath}`)
  }

  try {
    accessSync(resolvedPath, constants.R_OK | constants.X_OK)
  } catch {
    return buildAppError("PATH_NOT_READABLE", `Cannot access directory: ${resolvedPath}`)
  }

  return realpathSync(resolvedPath)
}

const findGitRoot = (candidatePath: string): string | null => {
  let currentPath = candidatePath

  while (true) {
    if (existsSync(join(currentPath, ".git"))) {
      return currentPath
    }

    const parentPath = dirname(currentPath)
    if (parentPath === currentPath) {
      return null
    }

    currentPath = parentPath
  }
}

const MAX_GIT_FILE_BYTES = 4096
const MAX_PACKAGE_JSON_BYTES = 65536

const resolveGitDir = (rootPath: string): string | null => {
  const dotGitPath = join(rootPath, ".git")
  if (!existsSync(dotGitPath)) {
    return null
  }

  let dotGitStats: ReturnType<typeof lstatSync>
  try {
    dotGitStats = lstatSync(dotGitPath)
  } catch {
    return null
  }

  if (dotGitStats.isSymbolicLink()) {
    try {
      statSync(dotGitPath)
    } catch {
      return null
    }
  }

  if (dotGitStats.isDirectory() || dotGitStats.isSymbolicLink()) {
    return dotGitPath
  }

  if (dotGitStats.size > MAX_GIT_FILE_BYTES) {
    return null
  }

  const gitPointer = readFileSync(dotGitPath, "utf8").trim()
  if (!gitPointer.startsWith("gitdir:")) {
    return null
  }

  const rawGitDir = gitPointer.slice("gitdir:".length).trim()
  if (rawGitDir.includes("\0")) {
    return null
  }

  const resolved = resolve(rootPath, rawGitDir)
  // Git worktree pointers are commonly absolute paths, so validate existence rather than forcing relativity.
  try {
    if (!statSync(resolved).isDirectory()) {
      return null
    }
  } catch {
    return null
  }

  return resolved
}

const readGitBranch = (rootPath: string): string | null => {
  const gitDir = resolveGitDir(rootPath)
  if (!gitDir) {
    return null
  }

  const headPath = join(gitDir, "HEAD")
  if (!existsSync(headPath)) {
    return null
  }

  const headContents = readFileSync(headPath, "utf8").trim()
  if (headContents.startsWith("ref: ")) {
    return headContents.slice("ref: ".length).replace(/^refs\/heads\//, "")
  }

  return headContents.length > 12 ? headContents.slice(0, 12) : headContents
}

const createWorktreeRootPath = (projectRootPath: string, branch: string) => {
  const safeBranch = branch
    .trim()
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/[\\/]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return join(dirname(projectRootPath), `${basename(projectRootPath)}-${safeBranch || "worktree"}`)
}

const hasGitBinary = async () => {
  const probe = await gitProcessRunner.run({
    worktreeRootPath: process.cwd(),
    args: ["--version"],
    timeoutMs: 5_000,
    maximumStdoutBytes: 1024
  })
  return !probe.error && probe.exitCode === 0
}

const initializeGitRepository = async (directoryPath: string): Promise<AppError | null> => {
  const result = await gitProcessRunner.run({
    worktreeRootPath: directoryPath,
    args: ["init"],
    mutation: true
  })

  if (result.error || result.exitCode !== 0) {
    return buildAppError(
      "GIT_INIT_FAILED",
      `git init failed in ${directoryPath}`,
      result.stderr.toString("utf8").trim() || result.error?.message || null
    )
  }

  return null
}

const createGitWorktree = async (
  projectRootPath: string,
  branch: string,
  targetPath: string
): Promise<AppError | null> => {
  const result = await gitProcessRunner.run({
    worktreeRootPath: projectRootPath,
    args: ["worktree", "add", "-b", branch, targetPath],
    timeoutMs: 30_000,
    mutation: true
  })

  if (result.error || result.exitCode !== 0) {
    return buildAppError(
      "WORKTREE_CREATE_FAILED",
      `git worktree add failed for branch ${branch}`,
      result.stderr.toString("utf8").trim() || result.error?.message || null
    )
  }

  return null
}

const removeGitWorktree = async (
  projectRootPath: string,
  worktreeRootPath: string
): Promise<AppError | null> => {
  const result = await gitProcessRunner.run({
    worktreeRootPath: projectRootPath,
    args: ["worktree", "remove", worktreeRootPath],
    timeoutMs: 30_000,
    mutation: true
  })

  if (result.error || result.exitCode !== 0) {
    return buildAppError(
      "WORKTREE_DELETE_FAILED",
      `git worktree remove failed for ${worktreeRootPath}`,
      result.stderr.toString("utf8").trim() || result.error?.message || null
    )
  }

  return null
}

const gitProcessRunner = createGitProcessRunner({ maximumConcurrency: 4 })

const readGitStatusFromHost = async (
  worktreeRootPath: string,
  includeAllUntracked = false
): Promise<GitStatusReadResult> => {
  const statusArgs = ["-C", worktreeRootPath, "status", "--porcelain=v1", "-z", "--branch"]
  if (includeAllUntracked) {
    statusArgs.push("--untracked-files=all")
  }
  const result = await gitProcessRunner.run({
    worktreeRootPath: process.cwd(),
    args: statusArgs,
    timeoutMs: 10_000,
    maximumStdoutBytes: 32 * 1024 * 1024
  })

  if (result.error) {
    const nodeError = result.error
    if (nodeError.code === "ENOENT") {
      return {
        status: "error",
        error: buildAppError("GIT_NOT_INSTALLED", "git is required to read worktree status")
      }
    }

    return {
      status: "error",
      error: buildAppError("GIT_STATUS_FAILED", `git status failed for ${worktreeRootPath}`, result.error.message)
    }
  }

  if (result.exitCode !== 0) {
    return {
      status: "error",
      error: buildAppError(
        "GIT_STATUS_FAILED",
        `git status failed for ${worktreeRootPath}`,
        result.stderr.toString("utf8") || result.stdout.toString("utf8") || null
      )
    }
  }

  return {
    status: "ok",
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8")
  }
}

const readGitCommandFromHost: GitCommandRunner = async (worktreeRootPath, args, options) => {
  const isPatchRead = args[0] === "diff" && !args.includes("--numstat")
  const result = await gitProcessRunner.run({
    worktreeRootPath,
    args,
    timeoutMs: options?.timeoutMs ?? 10_000,
    maximumStdoutBytes: isPatchRead ? 2 * 1024 * 1024 : 32 * 1024 * 1024,
    cacheTtlMs: options?.mutation ? 0 : options?.cacheTtlMs ?? 0,
    mutation: options?.mutation
  })

  if (result.error) {
    const nodeError = result.error as NodeJS.ErrnoException
    if (nodeError.code === "ENOENT") {
      return {
        status: "error",
        error: buildAppError("GIT_NOT_INSTALLED", "git is required to read repository metadata")
      }
    }

    return {
      status: "error",
      error: buildAppError("GIT_STATUS_FAILED", `git ${args.join(" ")} failed for ${worktreeRootPath}`, result.error.message)
    }
  }

  if (result.exitCode !== 0) {
    return {
      status: "error",
      error: buildAppError(
        "GIT_STATUS_FAILED",
        `git ${args.join(" ")} failed for ${worktreeRootPath}`,
        result.stderr.toString("utf8") || result.stdout.toString("utf8") || null
      )
    }
  }

  return {
    status: "ok",
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
    stdoutByteLength: result.stdoutByteLength,
    stdoutTruncated: result.stdoutTruncated
  }
}

const readGitBlobFromHost = async (
  worktreeRootPath: string,
  objectId: string,
  maximumBlobBytes = 64 * 1024 * 1024
): Promise<Awaited<ReturnType<GitBlobReader>> | { status: "error"; error: AppError; oversizedByteLength: number }> => {
  const sizeResult = await gitProcessRunner.run({
    worktreeRootPath,
    args: ["cat-file", "-s", objectId],
    timeoutMs: 10_000,
    maximumStdoutBytes: 1024 * 1024,
    cacheTtlMs: 1_000
  })
  const size = Number.parseInt(sizeResult.stdout.toString("utf8").trim(), 10)
  if (sizeResult.error || sizeResult.exitCode !== 0 || !Number.isSafeInteger(size) || size < 0) {
    return {
      status: "error",
      error: buildAppError(
        "GIT_STATUS_FAILED",
        `Git index blob ${objectId} could not be measured`,
        sizeResult.stderr.toString("utf8").trim() || sizeResult.error?.message || null,
        { domain: "git", context: { worktreeRootPath, objectId } }
      )
    }
  }
  if (size > maximumBlobBytes) {
    return {
      status: "error",
      oversizedByteLength: size,
      error: buildAppError(
        "GIT_STATUS_FAILED",
        `Git blob ${objectId} exceeds the safe materialization limit`,
        null,
        { domain: "git", context: { worktreeRootPath, objectId, size, maximumBlobBytes } }
      )
    }
  }

  const blobResult = await gitProcessRunner.run({
    worktreeRootPath,
    args: ["cat-file", "blob", objectId],
    timeoutMs: 30_000,
    maximumStdoutBytes: maximumBlobBytes + 1
  })
  if (blobResult.error || blobResult.exitCode !== 0 || blobResult.stdoutTruncated) {
    return {
      status: "error",
      error: buildAppError(
        "GIT_STATUS_FAILED",
        `Git index blob ${objectId} could not be read`,
        blobResult.stderr.toString("utf8").trim() || blobResult.error?.message || null,
        { domain: "git", context: { worktreeRootPath, objectId } }
      )
    }
  }
  if (blobResult.stdout.length !== size) {
    return {
      status: "error",
      error: buildAppError(
        "GIT_STATUS_FAILED",
        `Git index blob ${objectId} changed while being materialized`,
        null,
        { domain: "git", context: { worktreeRootPath, objectId, expectedSize: size, actualSize: blobResult.stdout.length } }
      )
    }
  }
  return { status: "ok", content: blobResult.stdout }
}

const editorCatalog: Array<Omit<EditorOption, "isAvailable">> = [
  { id: "cursor", label: "Cursor", appName: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92" },
  { id: "antigravity-ide", label: "Antigravity IDE", appName: "Antigravity IDE", bundleId: "com.google.antigravity-ide" },
  { id: "vscode", label: "Visual Studio Code", appName: "Visual Studio Code", bundleId: "com.microsoft.VSCode" },
  { id: "windsurf", label: "Windsurf", appName: "Windsurf", bundleId: "com.exafunction.windsurf" },
  { id: "zed", label: "Zed", appName: "Zed", bundleId: "dev.zed.Zed" },
  { id: "sublime-text", label: "Sublime Text", appName: "Sublime Text", bundleId: "com.sublimetext.4" },
  { id: "webstorm", label: "WebStorm", appName: "WebStorm", bundleId: "com.jetbrains.WebStorm" },
  { id: "intellij-idea", label: "IntelliJ IDEA", appName: "IntelliJ IDEA", bundleId: "com.jetbrains.intellij" }
]

const externalOpenCatalog: Array<Omit<ExternalOpenOption, "isAvailable">> = [
  { id: "finder", label: "Finder", appName: "Finder", bundleId: "com.apple.finder", group: "system" },
  { id: "terminal", label: "Terminal", appName: "Terminal", bundleId: "com.apple.Terminal", group: "terminal" },
  { id: "cmux", label: "cmux", appName: "cmux", bundleId: "com.cmuxterm.app", group: "terminal" },
  { id: "iterm2", label: "iTerm2", appName: "iTerm", bundleId: "com.googlecode.iterm2", group: "terminal" },
  { id: "ghostty", label: "Ghostty", appName: "Ghostty", bundleId: "com.mitchellh.ghostty", group: "terminal" },
  { id: "warp", label: "Warp", appName: "Warp", bundleId: "dev.warp.Warp-Stable", group: "terminal" },
  { id: "cursor", label: "Cursor", appName: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92", group: "ide" },
  { id: "antigravity-ide", label: "Antigravity IDE", appName: "Antigravity IDE", bundleId: "com.google.antigravity-ide", group: "ide" },
  { id: "vscode", label: "Visual Studio Code", appName: "Visual Studio Code", bundleId: "com.microsoft.VSCode", group: "ide" },
  { id: "windsurf", label: "Windsurf", appName: "Windsurf", bundleId: "com.exafunction.windsurf", group: "ide" },
  { id: "zed", label: "Zed", appName: "Zed", bundleId: "dev.zed.Zed", group: "ide" },
  { id: "sublime-text", label: "Sublime Text", appName: "Sublime Text", bundleId: "com.sublimetext.4", group: "ide" },
  { id: "webstorm", label: "WebStorm", appName: "WebStorm", bundleId: "com.jetbrains.WebStorm", group: "ide" },
  { id: "intellij-idea", label: "IntelliJ IDEA", appName: "IntelliJ IDEA", bundleId: "com.jetbrains.intellij", group: "ide" }
]

const alwaysAvailableExternalOpenAppIds = new Set<ExternalOpenAppId>(["finder", "terminal"])
const externalAppIconCache = new Map<string, string | null>()
const appSpecificIconResourceCandidates: Partial<Record<ExternalOpenAppId, string[]>> = {
  "antigravity-ide": [
    "Contents/Resources/app/out/vs/platform/browserOnboarding/static/antigravity.svg"
  ]
}

const findAppBundlePathFromHost = (bundleId?: string | null): string | null => {
  if (!bundleId || process.platform !== "darwin") {
    return null
  }

  const result = spawnSync("mdfind", [`kMDItemCFBundleIdentifier == '${bundleId}'`], {
    encoding: "utf8",
    timeout: 2000
  })
  if (result.error || result.status !== 0) {
    return null
  }

  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.endsWith(".app") && existsSync(line)) ?? null
}

const readPlistString = (plistPath: string, key: string): string | null => {
  if (!existsSync(plistPath)) {
    return null
  }

  const result = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Print ${key}`, plistPath], {
    encoding: "utf8",
    timeout: 2000
  })
  if (result.error || result.status !== 0) {
    return null
  }

  const value = result.stdout.trim()
  return value.length > 0 ? value : null
}

const iconFileCandidates = (iconFileName: string | null): string[] => {
  if (!iconFileName) {
    return []
  }

  const trimmed = iconFileName.trim()
  if (!trimmed) {
    return []
  }

  return extname(trimmed) ? [trimmed] : [`${trimmed}.icns`, trimmed]
}

const resolveExternalAppIconSourcePath = (input: {
  appId: ExternalOpenAppId
  appName: string
  appBundlePath: string
}): string | null => {
  const resourcesPath = join(input.appBundlePath, "Contents", "Resources")
  const plistIconFileName = readPlistString(join(input.appBundlePath, "Contents", "Info.plist"), "CFBundleIconFile")
  const relativeCandidates = [
    ...iconFileCandidates(plistIconFileName),
    `${input.appName}.icns`,
    `${basename(input.appBundlePath, ".app")}.icns`,
    ...(appSpecificIconResourceCandidates[input.appId] ?? []),
    "icon.icns"
  ]

  for (const candidate of relativeCandidates) {
    const candidatePath = candidate.startsWith("Contents/")
      ? join(input.appBundlePath, candidate)
      : join(resourcesPath, candidate)
    if (existsSync(candidatePath)) {
      return candidatePath
    }
  }

  return null
}

const pngDataUrlFromIconset = (iconPath: string): string | null => {
  const tempDir = mkdtempSync(join(tmpdir(), "teamcow-icon-"))
  try {
    const iconsetPath = join(tempDir, "icon.iconset")
    const result = spawnSync("iconutil", ["-c", "iconset", iconPath, "-o", iconsetPath], {
      encoding: "utf8",
      timeout: 2000
    })
    if (result.error || result.status !== 0) {
      return null
    }

    const pngCandidates = [
      "icon_32x32@2x.png",
      "icon_32x32.png",
      "icon_16x16@2x.png",
      "icon_128x128.png",
      "icon_16x16.png"
    ].map((fileName) => join(iconsetPath, fileName))
    const pngPath = pngCandidates.find((candidate) => existsSync(candidate))
    if (!pngPath) {
      return null
    }

    return `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

const externalAppIconDataUrlFromSource = (sourcePath: string): string | null => {
  const extension = extname(sourcePath).toLowerCase()
  if (extension === ".icns") {
    return pngDataUrlFromIconset(sourcePath)
  }

  if (extension === ".svg") {
    return `data:image/svg+xml;base64,${readFileSync(sourcePath).toString("base64")}`
  }

  if (extension === ".png") {
    return `data:image/png;base64,${readFileSync(sourcePath).toString("base64")}`
  }

  return null
}

const getExternalAppIconDataUrlFromHost: ExternalAppIconResolver = ({ appId, appName, bundleId }) => {
  const cacheKey = bundleId ?? appId
  if (externalAppIconCache.has(cacheKey)) {
    return externalAppIconCache.get(cacheKey) ?? null
  }

  const appBundlePath = findAppBundlePathFromHost(bundleId)
  const sourcePath = appBundlePath
    ? resolveExternalAppIconSourcePath({ appId, appName, appBundlePath })
    : null
  const iconDataUrl = sourcePath ? externalAppIconDataUrlFromSource(sourcePath) : null
  externalAppIconCache.set(cacheKey, iconDataUrl)
  return iconDataUrl
}

const listInstalledEditorsFromHost: InstalledEditorDetector = () =>
  editorCatalog
    .filter((editor) => {
      const result = spawnSync("mdfind", [`kMDItemCFBundleIdentifier == '${editor.bundleId ?? ""}'`], {
        encoding: "utf8",
        timeout: 2000
      })
      return !result.error && result.status === 0 && (result.stdout ?? "").trim().length > 0
    })
    .map((editor) => editor.id)

const openEditorPathFromHost: EditorPathOpener = async ({ appName, bundleId, targetPath }) => {
  const openArgs = bundleId ? ["-b", bundleId, targetPath] : ["-a", appName, targetPath]
  const result = spawnSync("/usr/bin/open", openArgs, {
    encoding: "utf8"
  })

  if (result.error) {
    return result.error.message
  }

  if (result.status !== 0) {
    return result.stderr?.trim() || result.stdout?.trim() || `open ${openArgs.slice(0, 2).join(" ")} failed`
  }

  return ""
}

const listInstalledExternalOpenAppsFromHost: InstalledExternalAppDetector = () =>
  externalOpenCatalog
    .filter((option) => option.bundleId && !alwaysAvailableExternalOpenAppIds.has(option.id))
    .filter((option) => {
      const result = spawnSync("mdfind", [`kMDItemCFBundleIdentifier == '${option.bundleId ?? ""}'`], {
        encoding: "utf8",
        timeout: 2000
      })
      return !result.error && result.status === 0 && (result.stdout ?? "").trim().length > 0
    })
    .map((option) => option.id)

const openExternalAppPathFromHost: ExternalAppPathOpener = async ({ appId, appName, bundleId, targetPath }) => {
  const openArgs = appId === "finder"
    ? [targetPath]
    : bundleId
      ? ["-b", bundleId, targetPath]
      : ["-a", appName, targetPath]
  const result = spawnSync("/usr/bin/open", openArgs, {
    encoding: "utf8"
  })

  if (result.error) {
    return result.error.message
  }

  if (result.status !== 0) {
    return result.stderr?.trim() || result.stdout?.trim() || `open ${appName} failed`
  }

  return ""
}

const parseGitBranchStatusLine = (line: string) => {
  const branchStatus = line.replace(/^##\s+/, "").trim()
  if (branchStatus.startsWith("No commits yet on ")) {
    return branchStatus.replace("No commits yet on ", "").trim() || null
  }

  const branchWithoutTracking = branchStatus.split("...")[0]
  const branch = branchWithoutTracking.replace(/\s+\[.*\]$/, "").trim()
  return branch.length > 0 ? branch : null
}

const normalizeGitStatusCode = (code: string) => code === " " ? null : code

const porcelainStatusCodes = new Set([" ", "M", "A", "D", "R", "C", "U", "?", "!"])
const unmergedGitStatusPairs = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"])

const displayStatusForGitCodes = (
  indexStatus: string | null,
  worktreeStatus: string | null
): ConversationGitFileDisplayStatus => {
  const codes = [indexStatus, worktreeStatus].filter((code): code is string => Boolean(code))
  const statusPair = `${indexStatus ?? " "}${worktreeStatus ?? " "}`

  if (unmergedGitStatusPairs.has(statusPair) || codes.includes("U")) {
    return "conflicted"
  }

  if (indexStatus === "?" && worktreeStatus === "?") {
    return "untracked"
  }

  if (codes.includes("R")) {
    return "renamed"
  }

  if (codes.includes("C")) {
    return "copied"
  }

  if (codes.includes("D")) {
    return "deleted"
  }

  if (codes.includes("A")) {
    return "added"
  }

  if (codes.includes("M")) {
    return "modified"
  }

  return "unknown"
}

const buildGitStatusParseError = (line: string) =>
  buildAppError("GIT_STATUS_PARSE_FAILED", "git status returned output TeamCow could not parse", line)

const parseGitStatusFiles = (stdout: string) => {
  const files: ConversationGitFileStatus[] = []
  const records = stdout.includes("\0")
    ? stdout.split("\0")
    : stdout.split("\n").map((row) => row.endsWith("\r") ? row.slice(0, -1) : row)

  for (let index = 0; index < records.length; index += 1) {
    const line = records[index] ?? ""
    if (line.length === 0 || line.startsWith("##")) {
      continue
    }

    if (
      line.length < 4 ||
      line[2] !== " " ||
      !porcelainStatusCodes.has(line[0] ?? "") ||
      !porcelainStatusCodes.has(line[1] ?? "")
    ) {
      return {
        status: "error" as const,
        error: buildGitStatusParseError(line)
      }
    }

    const indexStatus = normalizeGitStatusCode(line[0] ?? " ")
    const worktreeStatus = normalizeGitStatusCode(line[1] ?? " ")
    const rawPath = line.slice(3)
    const isRenameOrCopy = indexStatus === "R" || indexStatus === "C" || worktreeStatus === "R" || worktreeStatus === "C"
    const nulRenamedPath = isRenameOrCopy && stdout.includes("\0")
      ? records[index + 1] ?? ""
      : null
    const path = nulRenamedPath !== null
      ? rawPath
      : isRenameOrCopy && rawPath.includes(" -> ")
      ? rawPath.split(" -> ").at(-1) ?? rawPath
      : rawPath

    if (path.length === 0) {
      return {
        status: "error" as const,
        error: buildGitStatusParseError(line)
      }
    }

    if (nulRenamedPath !== null) {
      if (nulRenamedPath.length === 0) {
        return {
          status: "error" as const,
          error: buildGitStatusParseError(line)
        }
      }
      index += 1
    }

    files.push({
      path,
      indexStatus,
      worktreeStatus,
      displayStatus: displayStatusForGitCodes(indexStatus, worktreeStatus)
    })
  }

  return {
    status: "ok" as const,
    files
  }
}

const parseGitStatusBranch = (stdout: string) => {
  const branchLine = stdout.includes("\0")
    ? stdout.split("\0").find((line) => line.startsWith("## "))
    : stdout.split(/\r?\n/).find((line) => line.startsWith("## "))
  return branchLine ? parseGitBranchStatusLine(branchLine) : null
}

const gitLogFormat = "%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1f%ar%x1e"
const gitLogLimit = 31
const gitLogDisplayLimit = 30

const parseGitRemoteRows = (stdout: string) => {
  const remotesByName = new Map<string, { name: string; url: string; isUpstreamDefault: boolean }>()

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const match = /^([^\s]+)\s+(.+?)\s+\((fetch|push)\)$/.exec(trimmed)
    if (!match) {
      continue
    }

    const [, name, url, direction] = match
    if (!name || !url) {
      continue
    }

    const existing = remotesByName.get(name)
    if (!existing || direction === "fetch") {
      remotesByName.set(name, {
        name,
        url,
        isUpstreamDefault: false
      })
    }
  }

  return Array.from(remotesByName.values())
}

const parseGitUpstream = (stdout: string, configuredRemoteNames: string[] = []) => {
  const upstream = stdout.trim()
  if (!upstream) {
    return {
      upstream: null,
      upstreamRemoteName: null,
      upstreamBranchName: null
    }
  }

  const matchingRemoteNames = configuredRemoteNames
    .filter((remoteName) => upstream.startsWith(`${remoteName}/`))
    .sort((left, right) => right.length - left.length)
  const matchedRemoteName = matchingRemoteNames[0] ?? null
  if (matchedRemoteName) {
    const upstreamBranchName = upstream.slice(matchedRemoteName.length + 1)
    return {
      upstream,
      upstreamRemoteName: matchedRemoteName,
      upstreamBranchName: upstreamBranchName.length > 0 ? upstreamBranchName : null
    }
  }

  const slashIndex = upstream.indexOf("/")
  if (slashIndex <= 0 || slashIndex === upstream.length - 1) {
    return {
      upstream,
      upstreamRemoteName: null,
      upstreamBranchName: upstream
    }
  }

  return {
    upstream,
    upstreamRemoteName: upstream.slice(0, slashIndex),
    upstreamBranchName: upstream.slice(slashIndex + 1)
  }
}

const selectGitRemote = (
  remotes: Array<{ name: string; url: string; isUpstreamDefault: boolean }>,
  upstreamRemoteName: string | null
) => {
  const selected = remotes.find((remote) => remote.name === upstreamRemoteName)
    ?? remotes.find((remote) => remote.name === "origin")
    ?? remotes[0]
    ?? null

  return {
    selectedRemoteName: selected?.name ?? null,
    selectedRemoteUrl: selected?.url ?? null
  }
}

const parseGitLog = (stdout: string, scope: GitCommitScope) => {
  const commits = stdout
    .split("\u001e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash = "", shortHash = "", subject = "", authorName = "", authoredAt = "", relativeTime = ""] = record.split("\u001f")
      return {
        hash,
        shortHash,
        subject,
        authorName,
        authoredAt,
        relativeTime
      }
    })
    .filter((commit) => commit.hash.length > 0 && commit.shortHash.length > 0)

  return {
    status: "ok" as const,
    scope,
    items: commits.slice(0, gitLogDisplayLimit),
    hasMore: commits.length > gitLogDisplayLimit
  }
}

const projectFileExcludedNames = new Set([
  ".DS_Store",
  ".git",
  ".hg",
  ".svn",
  "Thumbs.db"
])

const projectPathErrorFor = (err: unknown, fallbackCode: AppError["code"], message: string) => {
  const nodeError = err as NodeJS.ErrnoException
  if (nodeError?.code === "ENOENT" || nodeError?.code === "ELOOP") {
    return buildAppError("PATH_NOT_FOUND", message, nodeError.message)
  }
  if (nodeError?.code === "EACCES" || nodeError?.code === "EPERM") {
    return buildAppError("PATH_NOT_READABLE", message, nodeError.message)
  }
  if (nodeError?.code === "ENOTDIR") {
    return buildAppError("NOT_A_DIRECTORY", message, nodeError.message)
  }
  return buildAppError(fallbackCode, message, err instanceof Error ? err.message : String(err))
}

const worktreeRootPathErrorFor = (err: unknown, message: string) => {
  const nodeError = err as NodeJS.ErrnoException
  if (nodeError?.code === "ENOENT" || nodeError?.code === "ENOTDIR" || nodeError?.code === "ELOOP") {
    return buildAppError("WORKTREE_NOT_FOUND", message, nodeError.message)
  }
  return projectPathErrorFor(err, "WORKTREE_NOT_FOUND", message)
}

const normalizeProjectFilePath = (path: string) => path.split(sep).join("/")

const getProjectFileDepth = (path: string) => path.length > 0 ? path.split("/").length - 1 : 0

const getProjectFileKindAsync = async (path: string): Promise<ProjectFileTreeItem["kind"]> => {
  const stats = await statAsync(path)
  return stats.isDirectory() ? "directory" : "file"
}

const getProjectFileKindForDirectoryEntry = async (absolutePath: string, entry: Dirent): Promise<ProjectFileTreeItem["kind"]> => {
  if (!entry.isSymbolicLink()) {
    return entry.isDirectory() ? "directory" : "file"
  }

  try {
    return await getProjectFileKindAsync(absolutePath)
  } catch {
    return "file"
  }
}

const normalizeProjectDirectoryPath = (directoryPath?: string | null) => {
  const normalized = (directoryPath ?? "").trim().split(/[\\/]+/).filter(Boolean)
  if (normalized.length === 0) {
    return {
      status: "ok" as const,
      directoryPath: ""
    }
  }

  if (isAbsolute(directoryPath ?? "") || /^[A-Za-z]:[\\/]/.test(directoryPath ?? "")) {
    return {
      status: "error" as const,
      error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `Project file directory must be relative: ${directoryPath}`)
    }
  }

  if (normalized.some((segment) => segment === "." || segment === "..")) {
    return {
      status: "error" as const,
      error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `Project file directory is outside worktree: ${directoryPath}`)
    }
  }

  return {
    status: "ok" as const,
    directoryPath: normalized.join("/")
  }
}

const resolveProjectDirectoryPath = async (rootPath: string, directoryPath?: string | null) => {
  const normalized = normalizeProjectDirectoryPath(directoryPath)
  if (normalized.status === "error") {
    return normalized
  }

  const segments = normalized.directoryPath ? normalized.directoryPath.split("/") : []
  let absolutePath = rootPath
  for (const segment of segments) {
    absolutePath = join(absolutePath, segment)
    let segmentStats
    try {
      segmentStats = await lstatAsync(absolutePath)
    } catch (err) {
      return {
        status: "error" as const,
        error: projectPathErrorFor(err, "PATH_NOT_FOUND", `Project file directory was not found: ${normalized.directoryPath || "."}`)
      }
    }

    if (segmentStats.isSymbolicLink()) {
      return {
        status: "error" as const,
        error: buildAppError("NOT_A_DIRECTORY", `Project file directory is a symlink and cannot be expanded: ${normalized.directoryPath}`)
      }
    }

    if (!segmentStats.isDirectory()) {
      return {
        status: "error" as const,
        error: buildAppError("NOT_A_DIRECTORY", `Project file path is not a directory: ${normalized.directoryPath}`)
      }
    }
  }

  const relativeToRoot = relative(rootPath, absolutePath)
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    return {
      status: "error" as const,
      error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `Project file directory resolved outside worktree: ${directoryPath}`)
    }
  }

  return {
    status: "ok" as const,
    directoryPath: normalized.directoryPath,
    absolutePath
  }
}

const scanProjectFiles = async (rootPath: string, directoryPath?: string | null) => {
  const target = await resolveProjectDirectoryPath(rootPath, directoryPath)
  if (target.status === "error") {
    return target
  }

  const files: ProjectFileTreeItem[] = []
  let fileCount = 0
  let directoryCount = 0

  const pushItem = (item: ProjectFileTreeItem) => {
    files.push(item)
    if (item.kind === "directory") {
      directoryCount += 1
    } else {
      fileCount += 1
    }
  }

  const directoryEntries = await readdirAsync(target.absolutePath, { withFileTypes: true })
  const entries = (await Promise.all(directoryEntries
      .filter((entry) => !projectFileExcludedNames.has(entry.name))
      .map(async (entry) => {
        const absolutePath = join(target.absolutePath, entry.name)
        const isSymlink = entry.isSymbolicLink()
        const kind = await getProjectFileKindForDirectoryEntry(absolutePath, entry)
        const path = normalizeProjectFilePath(relative(rootPath, absolutePath))
        return {
          absolutePath,
          item: {
            path,
            name: entry.name,
            kind,
            depth: getProjectFileDepth(path),
            isSymlink
          } satisfies ProjectFileTreeItem
        }
      })))
      .sort((left, right) => {
        if (left.item.kind !== right.item.kind) {
          return left.item.kind === "directory" ? -1 : 1
        }
        return left.item.name.localeCompare(right.item.name)
      })

  for (const entry of entries) {
    pushItem(entry.item)
  }

  return {
    status: "ok" as const,
    directoryPath: target.directoryPath,
    files,
    fileCount,
    directoryCount,
    truncated: false
  }
}

const isReadyProviderKind = (providerKind: string) => {
  return providerKind === "codex" || providerKind === "claude" || providerKind === "opencode" || providerKind === "cursor"
}

const readProjectName = (rootPath: string) => {
  const packageJsonPath = join(rootPath, "package.json")
  if (existsSync(packageJsonPath)) {
    try {
      const stats = statSync(packageJsonPath)
      if (stats.size <= MAX_PACKAGE_JSON_BYTES) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
          name?: unknown
        }
        if (typeof packageJson.name === "string" && packageJson.name.trim().length > 0) {
          return packageJson.name.trim()
        }
      }
    } catch {
      // fall through to directory basename
    }
  }

  return basename(rootPath)
}

const createProjectSummary = (
  project: ProjectRow,
  defaultWorktree: WorktreeRow,
  conversations: ConversationSummary[],
  isCurrent: boolean
): ImportedProjectSummary =>
  importedProjectSummarySchema.parse({
    id: project.id,
    name: project.name,
    rootPath: project.rootPath,
    status: project.status,
    isCurrent,
    defaultWorktree: {
      id: defaultWorktree.id,
      projectId: defaultWorktree.projectId,
      kind: defaultWorktree.kind,
      rootPath: defaultWorktree.rootPath,
      branch: defaultWorktree.branch,
      status: defaultWorktree.status
    },
    conversations
  })

const createConversationSummary = (
  conversation: ConversationRow,
  worktree: WorktreeRow,
  isCurrent: boolean
): ConversationSummary =>
  conversationSummarySchema.parse({
    id: conversation.id,
    projectId: conversation.projectId,
    title: conversation.title,
    worktreeId: conversation.worktreeId,
    worktree: {
      id: worktree.id,
      projectId: worktree.projectId,
      kind: worktree.kind,
      rootPath: worktree.rootPath,
      branch: worktree.branch,
      status: worktree.status
    },
    provider: buildProviderBadge(conversation.provider),
    currentModel: conversation.currentModel ?? "",
    accessMode: normalizeProviderAccessMode(conversation.accessMode),
    runStatus: conversation.runStatus as ConversationRunStatus,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    isCurrent
  })

const sortConversationsByRecentActivity = (conversations: ConversationSummary[]) => {
  conversations.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  )
}

const createWorktreeSummary = (worktree: WorktreeRow): WorktreeSummary => ({
  id: worktree.id,
  projectId: worktree.projectId,
  kind: worktree.kind as WorktreeKind,
  rootPath: worktree.rootPath,
  branch: worktree.branch,
  status: worktree.status as WorktreeSummary["status"]
})

const createConversationAttachmentSummary = (
  attachment: Pick<
    ConversationMessageAttachmentRow,
    "id" | "conversationId" | "kind" | "name" | "mimeType" | "sizeBytes"
  >
): ConversationAttachmentSummary => conversationAttachmentSummarySchema.parse({
  id: attachment.id,
  kind: attachment.kind,
  name: attachment.name,
  mimeType: attachment.mimeType,
  sizeBytes: attachment.sizeBytes,
  uri: createConversationAttachmentUri(attachment.conversationId, attachment.id)
})

const createConversationMessageSummary = (
  message: ConversationMessageRow,
  attachments: ConversationMessageAttachmentRow[] = []
): ConversationMessageSummary => conversationMessageSummarySchema.parse({
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    attachments: [...attachments]
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
      .map(createConversationAttachmentSummary),
    model: message.model,
    runId: message.runId,
    createdAt: message.createdAt
  })

const createQueuedConversationMessageSummary = (
  message: QueuedConversationMessageRow,
  attachments: QueuedConversationMessageAttachmentRow[] = []
): QueuedConversationMessageSummary => queuedConversationMessageSummarySchema.parse({
  id: message.id,
  conversationId: message.conversationId,
  content: message.content,
  attachments: [...attachments]
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map(createConversationAttachmentSummary),
  createdAt: message.createdAt
})

const createExecutionRunSummary = (run: ExecutionRunRow): ExecutionRunSummary =>
  executionRunSummarySchema.parse({
    id: run.id,
    conversationId: run.conversationId,
    provider: run.provider,
    model: run.model,
    worktreeId: run.worktreeId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  })

const createRunEventSummary = (event: RunEventRow, provider: string): RunEventSummary => {
  const payload = parseJsonRecord(event.payload)
  const canonicalEvent = canonicalRunEventSchema.safeParse({
    type: event.type,
    payload
  })
  const normalizedEvent = canonicalEvent.success
    ? canonicalEvent.data
    : canonicalRunEventSchema.parse({
        type: "provider.raw",
        payload: {
          ...payload,
          originalEventType: event.type
        }
      })

  return runEventSummarySchema.parse({
    id: event.id,
    conversationId: event.conversationId,
    runId: event.runId,
    sequence: event.sequence,
    schemaVersion: event.schemaVersion,
    provider,
    ...normalizedEvent,
    createdAt: event.createdAt
  })
}

const createArtifactSummary = (artifact: ArtifactRow): ArtifactSummary =>
  artifactSummarySchema.parse({
    id: artifact.id,
    conversationId: artifact.conversationId,
    runId: artifact.runId,
    kind: artifact.kind,
    title: artifact.title,
    uri: artifact.uri,
    payload: parseJsonRecord(artifact.payload),
    createdAt: artifact.createdAt
  })

const buildAppContext = (
  mode: AppContextSnapshot["mode"],
  platform: string,
  version: string,
  projects: ImportedProjectSummary[],
  selectedProjectId: string | null,
  selectedConversationId: string | null
): AppContextSnapshot => {
  const currentProject = projects.find((project) => project.id === selectedProjectId) ?? null
  const currentConversation =
    currentProject?.conversations.find((conversation) => conversation.id === selectedConversationId) ??
    null

  const shellProjectName = currentProject?.name ?? null
  const shellConversationTitle = currentConversation?.title ?? null
  const shellProviderKind = currentConversation?.provider.kind ?? null
  const shellWorktreeBranch =
    (currentConversation ? currentConversation.worktree.branch : currentProject ? currentProject.defaultWorktree.branch : null)
  const shellWorktreePath =
    currentConversation?.worktree.rootPath ?? currentProject?.defaultWorktree.rootPath ?? null
  const shellRunStatus = currentConversation ? currentConversation.runStatus as ConversationRunStatus : null

  return appContextSnapshotSchema.parse({
    mode,
    platform,
    version,
    selectedProjectId,
    selectedConversationId: currentConversation?.id ?? null,
    projects,
    shell: {
      projectName: shellProjectName,
      conversationTitle: shellConversationTitle,
      providerKind: shellProviderKind,
      worktreeBranch: shellWorktreeBranch,
      worktreePath: shellWorktreePath,
      runStatus: shellRunStatus,
      hasProjects: projects.length > 0,
      hasConversations: currentProject ? currentProject.conversations.length > 0 : false
    },
    chips: [
      { kind: "project", value: shellProjectName ?? "" },
      { kind: "conversation", value: shellConversationTitle ?? "" },
      { kind: "provider", value: shellProviderKind ?? "" },
      { kind: "worktree", value: shellWorktreeBranch ?? (shellWorktreePath ? getShortWorktreeName(shellWorktreePath) : "") },
      { kind: "run-status", value: shellRunStatus ?? "" }
    ]
  })
}

const resolveImportCandidate = async (
  input: ImportProjectInput,
  deps: Pick<
    ProjectServiceDeps,
    "confirmGitInit" | "gitBinaryAvailable" | "initializeGit" | "pickProjectDirectory"
  >
): Promise<CandidateProjectResolution> => {
  const chosenPath = input.directoryPath ?? (await deps.pickProjectDirectory())
  if (!chosenPath) {
    return { status: "cancelled" }
  }

  const readableDirectory = assertReadableDirectory(chosenPath)
  if (typeof readableDirectory !== "string") {
    return {
      status: "error",
      error: readableDirectory
    }
  }

  const gitRoot = findGitRoot(readableDirectory)
  if (gitRoot) {
    return {
      status: "ready",
      rootPath: gitRoot,
      initializedGit: false
    }
  }

  const gitBinaryAvailable = deps.gitBinaryAvailable ?? hasGitBinary
  const initializeGit = deps.initializeGit ?? initializeGitRepository

  if (!(await gitBinaryAvailable())) {
    return {
      status: "error",
      error: buildAppError("GIT_NOT_INSTALLED", `git --version probe failed before importing ${readableDirectory}`)
    }
  }

  const confirmed = await deps.confirmGitInit({
    directoryPath: readableDirectory,
    projectName: readProjectName(readableDirectory)
  })

  if (!confirmed) {
    return { status: "cancelled" }
  }

  const initError = await initializeGit(readableDirectory)
  if (initError) {
    return {
      status: "error",
      error: initError
    }
  }

  return {
    status: "ready",
    rootPath: readableDirectory,
    initializedGit: true
  }
}

export const createProjectService = (deps: ProjectServiceDeps) => {
  const database = createAppDatabase(join(deps.userDataPath, "teamcow.sqlite"))
  const now = deps.now ?? (() => new Date().toISOString())
  const conversationAttachmentRoot = join(deps.userDataPath, CONVERSATION_ATTACHMENT_DIRECTORY)
  const runEventStore = createRunEventStore({ database, now })

  const prepareGeneratedImageEvent = (input: AppendRunEventInput, createdAt = now()): AppendRunEventInput => {
    const singleSource = readGeneratedImageSource(input.payload)
    const markdownImages = input.type === "run.message.completed" && typeof input.payload.text === "string"
      ? readMarkdownOutputImages(input.payload.text) : []
    const sources = markdownImages.length > 0 ? markdownImages.map((image) => image.source) : singleSource ? [singleSource]
      : Array.isArray(input.payload.imageSources)
        ? input.payload.imageSources.flatMap((source) => {
            const parsed = providerImageSourceSchema.safeParse(source)
            return parsed.success ? [parsed.data] : []
          })
        : input.payload.images ? [] : readLegacyContentImageSources(input.payload)
    if (sources.length === 0) return input
    canonicalRunEventSchema.parse({ type: input.type, payload: input.payload, status: input.status })
    const run = database.db.select().from(executionRunsTable)
      .where(eq(executionRunsTable.id, input.runId)).get() as ExecutionRunRow | undefined
    if (!run || run.conversationId !== input.conversationId) {
      throw new Error(`Run ${input.runId} was not found for conversation ${input.conversationId}`)
    }
    const worktree = database.db.select().from(worktreesTable)
      .where(eq(worktreesTable.id, run.worktreeId)).get() as WorktreeRow | undefined
    const images = sources.map((source) => {
      const id = generatedImageId(input.conversationId, input.runId, source.id)
      const existing = database.db.select().from(artifactsTable)
        .where(eq(artifactsTable.id, id)).get() as ArtifactRow | undefined
      const cachedImage = generatedImageSummarySchema.safeParse(existing ? parseJsonRecord(existing.payload).image : null)
      if (cachedImage.success && cachedImage.data.status === "ready") return cachedImage.data
      const stored = storeGeneratedImage({
        source,
        id,
        directory: join(conversationAttachmentRoot, input.conversationId, "generated"),
        uri: createConversationAttachmentUri(input.conversationId, id),
        worktreeRoot: worktree?.rootPath,
        allowedSourceRoots: [
          ...(run.provider === "codex" ? [join(process.env.CODEX_HOME || join(homedir(), ".codex"), "generated_images")] : []),
          tmpdir(),
          ...(process.platform === "win32" ? [] : ["/tmp"]),
          ...(worktree ? [worktree.rootPath] : [])
        ]
      })
      if (stored.image.status === "ready") {
        database.db.insert(artifactsTable).values({
          id,
          conversationId: input.conversationId,
          runId: input.runId,
          kind: "image",
          title: stored.image.attachment.name,
          uri: stored.image.attachment.uri,
          payload: JSON.stringify({ image: stored.image, storagePath: stored.storagePath }),
          createdAt
        }).onConflictDoNothing().run()
      }
      return stored.image
    })
    if (markdownImages.length > 0) {
      const uris = images.map((image, index) => image.status === "ready" ? image.attachment.uri
        : createConversationAttachmentUri(input.conversationId, generatedImageId(input.conversationId, input.runId, sources[index].id)))
      return { ...input, payload: { ...input.payload,
        text: rewriteMarkdownOutputImages(String(input.payload.text), markdownImages, uris) } }
    }
    if (!singleSource) {
      const payload: Record<string, unknown> = { ...input.payload, images }
      delete payload.imageSources
      return { ...input, payload }
    }
    const payload = compactGeneratedImagePayload(input.payload, images[0])
    if (images[0].status === "unavailable" && singleSource.savedPath) {
      // Retain a recovery reference if the provider file becomes available later.
      payload.imageSource = { id: singleSource.id, savedPath: singleSource.savedPath }
    }
    return { ...input, type: "run.artifact.changed", payload }
  }

  const recoverGeneratedImageEvent = (event: RunEventRow, provider: ProviderKind): RunEventSummary => {
    const summary = createRunEventSummary(event, provider)
    const prepared = prepareGeneratedImageEvent(summary, event.createdAt)
    if (prepared !== summary) {
      const payload = JSON.stringify(prepared.payload)
      if (payload !== event.payload || prepared.type !== event.type) {
        database.db.update(runEventsTable).set({ type: prepared.type, payload })
          .where(eq(runEventsTable.id, event.id)).run()
      }
      return runEventSummarySchema.parse({ ...summary, type: prepared.type, payload: prepared.payload })
    }
    return summary
  }
  const customModelsService = createCustomModelsService({
    store: {
      get: (key: string) => {
        const row = database.db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).get() as typeof appSettingsTable.$inferSelect | undefined
        return row ? { value: row.value } : null
      },
      upsert: (key: string, value: string, updatedAt: string) => {
        database.db.insert(appSettingsTable).values({ key, value, updatedAt }).onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt } }).run()
      },
      delete: (key: string) => {
        database.db.delete(appSettingsTable).where(eq(appSettingsTable.key, key)).run()
      }
    }
  })
  const getProviderReadinessSnapshot = deps.getProviderReadinessSnapshot
  const listProviderModels = deps.listProviderModels
  const gitBinaryAvailable = deps.gitBinaryAvailable ?? hasGitBinary
  const createWorktree = deps.createGitWorktree ?? createGitWorktree
  const removeWorktree = deps.removeGitWorktree ?? removeGitWorktree
  const listInstalledEditors = deps.listInstalledEditors ?? listInstalledEditorsFromHost
  const openEditorPath = deps.openEditorPath ?? openEditorPathFromHost
  const listInstalledExternalOpenApps = deps.listInstalledExternalOpenApps ?? listInstalledExternalOpenAppsFromHost
  const openExternalAppPath = deps.openExternalAppPath ?? openExternalAppPathFromHost
  const getExternalAppIconDataUrl = deps.getExternalAppIconDataUrl ?? getExternalAppIconDataUrlFromHost
  const getTerminalShell = deps.getTerminalShell ?? getDefaultTerminalShell
  const spawnTerminalPty = deps.spawnTerminalPty ?? defaultSpawnTerminalPty
  const onTerminalOutput = deps.onTerminalOutput
  const runProvider = deps.runProvider
  const requestProviderCancellation = (runId: string, conversationId: string) =>
    deps.cancelProviderRunById?.(runId, conversationId) ?? deps.cancelProviderRun?.(conversationId) ?? false
  const worktreeGitWatcher = deps.worktreeGitWatcher ?? (deps.onWorktreeGitChanged
    ? createWorktreeGitWatcherService({
        onChanged: deps.onWorktreeGitChanged,
        log: deps.log
      })
    : null)
  const safelyUnwatchWorktree = (worktreeId: string) => {
    try {
      worktreeGitWatcher?.unwatchWorktree(worktreeId)
    } catch (error) {
      deps.log?.warn("git", "git.watch.unwatch.failed", {
        worktreeId,
        errorCode: "GIT_WATCH_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    }
  }
  const safelyCloseWorktreeWatcher = () => {
    try {
      worktreeGitWatcher?.close()
    } catch (error) {
      deps.log?.warn("git", "git.watch.close.failed", {
        errorCode: "GIT_WATCH_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    }
  }
  const getMessageAttachmentRows = (messageIds: string[]) => {
    if (messageIds.length === 0) {
      return []
    }

    return database.db
      .select()
      .from(conversationMessageAttachmentsTable)
      .where(inArray(conversationMessageAttachmentsTable.messageId, messageIds))
      .all() as ConversationMessageAttachmentRow[]
  }
  const getQueuedMessageAttachmentRows = (queuedMessageIds: string[]) => {
    if (queuedMessageIds.length === 0) {
      return []
    }

    return database.db
      .select()
      .from(queuedConversationMessageAttachmentsTable)
      .where(inArray(queuedConversationMessageAttachmentsTable.queuedMessageId, queuedMessageIds))
      .all() as QueuedConversationMessageAttachmentRow[]
  }
  const listQueuedConversationMessages = (conversationId: string) => {
    const rows = (database.db
      .select()
      .from(queuedConversationMessagesTable)
      .where(eq(queuedConversationMessagesTable.conversationId, conversationId))
      .all() as QueuedConversationMessageRow[])
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    const attachmentsByMessageId = getQueuedMessageAttachmentRows(rows.map((message) => message.id))
      .reduce((grouped, attachment) => {
        const current = grouped.get(attachment.queuedMessageId) ?? []
        current.push(attachment)
        grouped.set(attachment.queuedMessageId, current)
        return grouped
      }, new Map<string, QueuedConversationMessageAttachmentRow[]>())

    return rows.map((message) => createQueuedConversationMessageSummary(
      message,
      attachmentsByMessageId.get(message.id) ?? []
    ))
  }
  const getProviderAttachmentsForMessage = (
    messageId: string
  ): NonNullable<ProviderRunInput["attachments"]> => getMessageAttachmentRows([messageId])
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind as "image" | "file",
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      path: realpathSync(attachment.storagePath)
    }))
  const prepareConversationAttachments = (
    conversationId: string,
    messageId: string,
    inputs: ConversationAttachmentInput[],
    createdAt: string
  ): { attachments: PreparedConversationAttachment[]; directory: string | null; error: AppError | null } => {
    if (inputs.length === 0) {
      return { attachments: [], directory: null, error: null }
    }

    const directory = join(conversationAttachmentRoot, conversationId, messageId)
    const attachments: PreparedConversationAttachment[] = []
    try {
      mkdirSync(directory, { recursive: true })
      for (const [position, input] of inputs.entries()) {
        const content = Buffer.from(input.dataBase64, "base64")
        if (content.byteLength !== input.sizeBytes) {
          throw new Error(`Attachment byte length did not match metadata for ${input.name}`)
        }

        const id = randomUUID()
        const mimeType = resolveAttachmentMimeType(input)
        const storagePath = join(directory, `${id}${getAttachmentStorageSuffix(input.name, mimeType)}`)
        writeFileSync(storagePath, content, { flag: "wx", mode: 0o600 })
        attachments.push({
          id,
          messageId,
          conversationId,
          kind: INLINE_IMAGE_MIME_TYPES.has(mimeType) ? "image" : "file",
          name: input.name,
          mimeType,
          sizeBytes: content.byteLength,
          position,
          storagePath,
          createdAt
        })
      }
      return { attachments, directory, error: null }
    } catch (error) {
      rmSync(directory, { recursive: true, force: true })
      return {
        attachments: [],
        directory: null,
        error: buildAppError(
          "FILE_WRITE_FAILED",
          error instanceof Error ? error.message : String(error),
          null,
          { domain: "filesystem", context: { conversationId } }
        )
      }
    }
  }
  const resolveConversationAttachment = (rawUrl: string): { path: string; mimeType: string } | null => {
    try {
      const url = new URL(rawUrl)
      const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent)
      if (url.protocol !== `${CONVERSATION_ATTACHMENT_SCHEME}:` || url.hostname !== "conversation" || segments.length !== 2) {
        return null
      }

      const [conversationId, attachmentId] = segments
      let attachment: { storagePath: string; mimeType: string } | undefined = (database.db
        .select()
        .from(conversationMessageAttachmentsTable)
        .where(and(
          eq(conversationMessageAttachmentsTable.id, attachmentId),
          eq(conversationMessageAttachmentsTable.conversationId, conversationId)
        ))
        .get() as ConversationMessageAttachmentRow | undefined) ?? (database.db
          .select()
          .from(queuedConversationMessageAttachmentsTable)
          .where(and(
            eq(queuedConversationMessageAttachmentsTable.id, attachmentId),
            eq(queuedConversationMessageAttachmentsTable.conversationId, conversationId)
          ))
          .get() as QueuedConversationMessageAttachmentRow | undefined)
      if (!attachment) {
        const artifact = database.db.select().from(artifactsTable).where(and(
          eq(artifactsTable.id, attachmentId),
          eq(artifactsTable.conversationId, conversationId),
          eq(artifactsTable.kind, "image")
        )).get() as ArtifactRow | undefined
        const payload = artifact ? parseJsonRecord(artifact.payload) : {}
        const image = generatedImageSummarySchema.safeParse(payload.image)
        if (image.success && image.data.status === "ready" && typeof payload.storagePath === "string") {
          attachment = { storagePath: payload.storagePath, mimeType: image.data.attachment.mimeType }
        }
      }
      if (!attachment || !existsSync(conversationAttachmentRoot) || !existsSync(attachment.storagePath)) {
        return null
      }

      const canonicalRoot = realpathSync(conversationAttachmentRoot)
      const canonicalPath = realpathSync(attachment.storagePath)
      const relativePath = relative(canonicalRoot, canonicalPath)
      if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
        return null
      }

      return { path: canonicalPath, mimeType: attachment.mimeType }
    } catch {
      return null
    }
  }
  const runtimeMode = process.env.NODE_ENV === "development" ? "development" : "production"
  const terminalSessions = new Map<string, {
    summary: TerminalSessionSummary
    pty: TerminalPtyProcess
    disposables: TerminalDisposable[]
  }>()

  const logInfo = (domain: ErrorDomain, event: string, context?: Record<string, unknown>) => {
    deps.log?.info(domain, event, context)
  }

  const logError = (
    domain: ErrorDomain,
    event: string,
    error: AppError,
    context: Record<string, unknown> = {}
  ) => {
    deps.log?.error(domain, event, {
      ...context,
      errorCode: error.code,
      errorMessage: error.message
    })
  }

  const providerRunTasks = createBackgroundTaskSupervisor({
    onError: (runId, error) => {
      deps.log?.error("provider", "provider.run.background-task.failed", {
        runId,
        errorCode: "INTERNAL_ERROR",
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    }
  })

  const recovery = recoverInterruptedRuns({ database, now })
  if (recovery.recoveredRunIds.length > 0) {
    logInfo("provider", "provider.run.recovered-after-restart", {
      recoveredRunCount: recovery.recoveredRunIds.length,
      recoveredConversationCount: recovery.recoveredConversationIds.length
    })
  }

  const isAllowedModelForProvider = async (providerKind: ProviderKind, model: string) => {
    if (isValidModelForProvider(providerKind, model)) {
      return true
    }

    if (!listProviderModels) {
      return false
    }

    try {
      const models = await listProviderModels(providerKind)
      return models.some((option) => option.id === model)
    } catch {
      return false
    }
  }

  const getCurrentProjectId = () => {
    const row = database.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, CURRENT_PROJECT_SETTING_KEY))
      .get() as typeof appSettingsTable.$inferSelect | undefined

    return row?.value ?? null
  }

  const setCurrentProjectId = (projectId: string | null) => {
    if (!projectId) {
      database.db.delete(appSettingsTable).where(eq(appSettingsTable.key, CURRENT_PROJECT_SETTING_KEY)).run()
      return
    }

    database.db
      .insert(appSettingsTable)
      .values({
        key: CURRENT_PROJECT_SETTING_KEY,
        value: projectId,
        updatedAt: now()
      })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: {
          value: projectId,
          updatedAt: now()
        }
      })
      .run()
  }

  const readStringListSetting = (key: string): string[] => {
    const row = database.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, key))
      .get() as typeof appSettingsTable.$inferSelect | undefined

    if (!row) {
      return []
    }

    try {
      const value = JSON.parse(row.value) as unknown
      return Array.isArray(value)
        ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
        : []
    } catch {
      return []
    }
  }

  const persistStringListSetting = (key: string, values: string[]) => {
    database.db
      .insert(appSettingsTable)
      .values({
        key,
        value: JSON.stringify([...new Set(values)]),
        updatedAt: now()
      })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: {
          value: JSON.stringify([...new Set(values)]),
          updatedAt: now()
        }
      })
      .run()
  }

  const getOrderedProjectRows = (projectRows: ProjectRow[]) => {
    const projectOrder = readStringListSetting(PROJECT_ORDER_SETTING_KEY)
    const projectOrderIndex = new Map(projectOrder.map((projectId, index) => [projectId, index] as const))

    return [...projectRows].sort((left, right) => {
      const leftIndex = projectOrderIndex.get(left.id)
      const rightIndex = projectOrderIndex.get(right.id)
      if (leftIndex !== undefined || rightIndex !== undefined) {
        if (leftIndex === undefined) return 1
        if (rightIndex === undefined) return -1
        if (leftIndex !== rightIndex) return leftIndex - rightIndex
      }

      return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    })
  }

  const getSelectedEditorId = () => {
    const row = database.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, SELECTED_EDITOR_SETTING_KEY))
      .get() as typeof appSettingsTable.$inferSelect | undefined

    return row?.value ?? null
  }

  const persistSelectedEditorId = (editorId: string | null) => {
    if (!editorId) {
      database.db.delete(appSettingsTable).where(eq(appSettingsTable.key, SELECTED_EDITOR_SETTING_KEY)).run()
      return
    }

    database.db
      .insert(appSettingsTable)
      .values({
        key: SELECTED_EDITOR_SETTING_KEY,
        value: editorId,
        updatedAt: now()
      })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: {
          value: editorId,
          updatedAt: now()
        }
      })
      .run()
  }

  const listEditorOptions = (): EditorOption[] => {
    const installedIds = new Set(listInstalledEditors())
    return editorOptionSchema.array().parse(
      editorCatalog.map((editor) => ({
        ...editor,
        isAvailable: installedIds.has(editor.id)
      }))
    )
  }

  const resolveEffectiveEditorSelection = (editors: EditorOption[]) => {
    const persistedEditorId = getSelectedEditorId()
    const persistedEditor = persistedEditorId ? editors.find((editor) => editor.id === persistedEditorId) ?? null : null
    const effectiveEditor = persistedEditor?.isAvailable ? persistedEditor : editors.find((editor) => editor.isAvailable) ?? null
    return { persistedEditorId, effectiveEditor }
  }

  const listExternalOpenOptions = (): ExternalOpenOption[] => {
    const installedIds = new Set<ExternalOpenAppId>([
      ...alwaysAvailableExternalOpenAppIds,
      ...listInstalledExternalOpenApps()
    ])
    return externalOpenOptionSchema.array().parse(
      externalOpenCatalog.map((option) => {
        const isAvailable = installedIds.has(option.id)
        const iconDataUrl = isAvailable
          ? getExternalAppIconDataUrl({
              appId: option.id,
              appName: option.appName,
              bundleId: option.bundleId
            })
          : null
        return {
          ...option,
          ...(iconDataUrl ? { iconDataUrl } : {}),
          isAvailable
        }
      })
    )
  }

  const getSelectedEditor = (): SelectedEditorResult => {
    const editors = listEditorOptions()
    const { effectiveEditor } = resolveEffectiveEditorSelection(editors)
    return selectedEditorResultSchema.parse({
      status: "ok",
      selectedEditorId: effectiveEditor?.id ?? null,
      editors
    })
  }

  const setSelectedEditor = (input: SetSelectedEditorInput): SelectedEditorResult => {
    if (input.editorId === null) {
      persistSelectedEditorId(null)
      return getSelectedEditor()
    }

    const editors = listEditorOptions()
    const editor = editors.find((option) => option.id === input.editorId)
    if (!editor || !editor.isAvailable) {
      return selectedEditorResultSchema.parse({
        status: "error",
        error: buildAppError("HANDOFF_EDITOR_UNAVAILABLE", `Editor is not available: ${input.editorId}`)
      })
    }

    persistSelectedEditorId(editor.id)
    return selectedEditorResultSchema.parse({
      status: "ok",
      selectedEditorId: editor.id,
      editors
    })
  }

  const getCurrentConversationId = () => {
    const row = database.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, CURRENT_CONVERSATION_SETTING_KEY))
      .get() as typeof appSettingsTable.$inferSelect | undefined

    return row?.value ?? null
  }

  const setCurrentConversationId = (conversationId: string | null) => {
    if (!conversationId) {
      database.db.delete(appSettingsTable).where(eq(appSettingsTable.key, CURRENT_CONVERSATION_SETTING_KEY)).run()
      return
    }

    database.db
      .insert(appSettingsTable)
      .values({
        key: CURRENT_CONVERSATION_SETTING_KEY,
        value: conversationId,
        updatedAt: now()
      })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: {
          value: conversationId,
          updatedAt: now()
        }
      })
      .run()
  }

  const readWorkspaceState = () => {
    const hiddenProjectIds = new Set(readStringListSetting(HIDDEN_PROJECT_IDS_SETTING_KEY))
    const allProjectRows = database.db.select().from(projectsTable).all() as ProjectRow[]
    const projectRows = getOrderedProjectRows(allProjectRows)
      .filter((project) => !hiddenProjectIds.has(project.id))
    const worktreeRows = database.db.select().from(worktreesTable).all() as WorktreeRow[]
    const conversationRows = database.db.select().from(conversationsTable).all() as ConversationRow[]

    let selectedProjectId = getCurrentProjectId()
    if (selectedProjectId && !projectRows.some((project) => project.id === selectedProjectId)) {
      selectedProjectId = null
    }
    if (!selectedProjectId && projectRows.length > 0) {
      selectedProjectId = projectRows[0].id
    }
    if (getCurrentProjectId() !== selectedProjectId) {
      setCurrentProjectId(selectedProjectId)
    }

    let selectedConversationId = getCurrentConversationId()
    if (
      selectedConversationId &&
      !conversationRows.some(
        (conversation) => conversation.id === selectedConversationId && conversation.projectId === selectedProjectId
      )
    ) {
      selectedConversationId = null
      setCurrentConversationId(null)
    }

    return {
      projectRows,
      worktreeRows,
      conversationRows,
      selectedProjectId,
      selectedConversationId
    }
  }

  const listProjects = (): ImportedProjectSummary[] => {
    const state = readWorkspaceState()
    const defaultWorktreeByProjectId = new Map(
      state.worktreeRows
        .filter((worktree) => worktree.kind === DEFAULT_WORKTREE_KIND)
        .map((worktree) => [worktree.projectId, worktree] as const)
    )
    const worktreeById = new Map(state.worktreeRows.map((worktree) => [worktree.id, worktree] as const))
    const conversationsByProjectId = new Map<string, ConversationSummary[]>()

    for (const conversationRow of state.conversationRows) {
      const worktree = worktreeById.get(conversationRow.worktreeId)
      if (!worktree) {
        continue
      }

      const conversations = conversationsByProjectId.get(conversationRow.projectId) ?? []
      conversations.push(
        createConversationSummary(
          conversationRow,
          worktree,
          state.selectedProjectId === conversationRow.projectId &&
            state.selectedConversationId === conversationRow.id
        )
      )
      conversationsByProjectId.set(conversationRow.projectId, conversations)
    }

    for (const conversations of conversationsByProjectId.values()) {
      sortConversationsByRecentActivity(conversations)
    }

    return state.projectRows
      .map((project: ProjectRow) => {
        const defaultWorktree = defaultWorktreeByProjectId.get(project.id)
        if (!defaultWorktree) {
          return null
        }

        return createProjectSummary(
          project,
          defaultWorktree,
          conversationsByProjectId.get(project.id) ?? [],
          state.selectedProjectId === project.id
        )
      })
      .filter((project: ImportedProjectSummary | null): project is ImportedProjectSummary => project !== null)
  }

  const getConversationById = (conversationId: string) => {
    return database.db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId)).get() as
      | ConversationRow
      | undefined
  }

  const getWorktreeById = (worktreeId: string) =>
    database.db.select().from(worktreesTable).where(eq(worktreesTable.id, worktreeId)).get() as
      | WorktreeRow
      | undefined

  const hasRunningExecutionRun = (conversationId: string) =>
    (database.db
      .select()
      .from(executionRunsTable)
      .where(eq(executionRunsTable.conversationId, conversationId))
      .all() as ExecutionRunRow[])
      .some((run) => run.status === "running")

  const buildConversationRunInProgressError = (conversationId: string) =>
    buildAppError(
      "CONVERSATION_RUN_IN_PROGRESS",
      `Conversation ${conversationId} already has a provider run in progress`,
      "Stop the current run before sending another message or changing the model.",
      {
        domain: "conversation",
        context: { conversationId }
      }
    )

  const assertConversationNotRunningForTransaction = (conversation: ConversationRow | undefined, runs: ExecutionRunRow[]) => {
    if (!conversation) {
      return
    }

    if (conversation.runStatus === "running" || runs.some((run) => run.status === "running")) {
      throw new Error(RUN_IN_PROGRESS_SENTINEL)
    }
  }

  const getAppContext = (): AppContextSnapshot =>
    buildAppContext(
      runtimeMode,
      process.platform,
      process.versions.electron ?? process.versions.node,
      listProjects(),
      getCurrentProjectId(),
      getCurrentConversationId()
    )

  const getProjectByRootPath = (rootPath: string) =>
    database.db.select().from(projectsTable).where(eq(projectsTable.rootPath, rootPath)).get() as
      | ProjectRow
      | undefined

  const getProjectById = (projectId: string) =>
    database.db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).get() as
      | ProjectRow
      | undefined

  const getProjectSummaryById = (projectId: string): ImportedProjectSummary | null => {
    return listProjects().find((project) => project.id === projectId) ?? null
  }

  const emitRunNotificationCandidate = (input: { conversationId: string; runId: string; status: ConversationRunStatus }) => {
    const kind = toRunNotificationKind(input.status)
    if (!kind || !deps.onRunNotificationCandidate) {
      return
    }

    const currentConversationId = getCurrentConversationId()
    if (input.status === "completed" && input.conversationId === currentConversationId && deps.isAppFocused?.()) {
      return
    }

    const conversation = getConversationById(input.conversationId)
    if (!conversation || !providerKindSchema.safeParse(conversation.provider).success) {
      return
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    const project = getProjectById(conversation.projectId)
    if (!worktree || !project) {
      return
    }

    try {
      deps.onRunNotificationCandidate({
        kind,
        context: {
          projectName: project.name,
          conversationTitle: conversation.title,
          providerKind: conversation.provider as ProviderKind,
          worktreeLabel: worktree.branch ?? getShortWorktreeName(worktree.rootPath),
          runStatus: input.status
        },
        params: {
          conversationId: conversation.id,
          runId: input.runId,
          worktreeId: worktree.id
        }
      })
    } catch {
      // Notifications are best-effort host integration. Persistence must remain authoritative.
    }
  }

  const listConversationsByProject = (projectId: string): ConversationSummary[] => {
    const state = readWorkspaceState()
    const worktreeById = new Map(state.worktreeRows.map((worktree) => [worktree.id, worktree] as const))

    return state.conversationRows
      .filter((conversation) => conversation.projectId === projectId)
      .map((conversation) => {
        const worktree = worktreeById.get(conversation.worktreeId)
        if (!worktree) {
          return null
        }

        return createConversationSummary(
          conversation,
          worktree,
          state.selectedProjectId === conversation.projectId &&
            state.selectedConversationId === conversation.id
        )
      })
      .filter((conversation): conversation is ConversationSummary => conversation !== null)
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id)
      )
  }

  const listWorktreesByProject = (projectId: string): WorktreeSummary[] => {
    const worktrees = (database.db.select().from(worktreesTable).where(eq(worktreesTable.projectId, projectId)).all() as WorktreeRow[])
      .map(createWorktreeSummary)
      .sort((left, right) => {
        if (left.kind === DEFAULT_WORKTREE_KIND && right.kind !== DEFAULT_WORKTREE_KIND) {
          return -1
        }
        if (left.kind !== DEFAULT_WORKTREE_KIND && right.kind === DEFAULT_WORKTREE_KIND) {
          return 1
        }
        return (left.branch ?? left.rootPath).localeCompare(right.branch ?? right.rootPath)
      })

    return worktrees
  }

  const listProjectWorktrees = (projectId: string): ProjectWorktreeSummary[] => {
    const worktreeRows = (database.db
      .select()
      .from(worktreesTable)
      .where(eq(worktreesTable.projectId, projectId))
      .all() as WorktreeRow[])
    const conversationRows = (database.db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.projectId, projectId))
      .all() as ConversationRow[])

    const conversationCountByWorktreeId = new Map<string, number>()
    for (const conversation of conversationRows) {
      conversationCountByWorktreeId.set(
        conversation.worktreeId,
        (conversationCountByWorktreeId.get(conversation.worktreeId) ?? 0) + 1
      )
    }

    return worktreeRows
      .map((worktree) => {
        const conversationCount = conversationCountByWorktreeId.get(worktree.id) ?? 0
        const isDefault = worktree.kind === DEFAULT_WORKTREE_KIND
        const deleteBlockedReason: ProjectWorktreeSummary["deleteBlockedReason"] = isDefault
          ? "default"
          : conversationCount > 0
            ? "in-use"
            : null

        return {
          ...createWorktreeSummary(worktree),
          conversationCount,
          canDelete: deleteBlockedReason === null,
          deleteBlockedReason
        }
      })
      .sort((left, right) => {
        if (left.kind === DEFAULT_WORKTREE_KIND && right.kind !== DEFAULT_WORKTREE_KIND) {
          return -1
        }
        if (left.kind !== DEFAULT_WORKTREE_KIND && right.kind === DEFAULT_WORKTREE_KIND) {
          return 1
        }
        return (left.branch ?? left.rootPath).localeCompare(right.branch ?? right.rootPath)
      })
  }

  const getCurrentConversation = (): ConversationSummary | null => {
    const state = readWorkspaceState()
    if (!state.selectedProjectId || !state.selectedConversationId) {
      return null
    }

    const conversation = state.conversationRows.find(
      (row) => row.id === state.selectedConversationId && row.projectId === state.selectedProjectId
    )
    if (!conversation) {
      return null
    }

    const worktree = state.worktreeRows.find((row) => row.id === conversation.worktreeId)
    if (!worktree) {
      return null
    }

    return createConversationSummary(conversation, worktree, true)
  }

  const buildConversationTimeline = (conversationId: string): ConversationTimeline => {
    const runs = (database.db
      .select()
      .from(executionRunsTable)
      .where(eq(executionRunsTable.conversationId, conversationId))
      .all() as ExecutionRunRow[])
      .map(createExecutionRunSummary)
      .sort((left, right) =>
        compareTimelineText(left.startedAt, right.startedAt) ||
        compareTimelineText(left.createdAt, right.createdAt) ||
        compareTimelineText(left.id, right.id)
      )
    const runOrder = new Map(runs.map((run, index) => [run.id, index]))
    const runProvider = new Map(runs.map((run) => [run.id, run.provider] as const))

    const messageRows = database.db
      .select()
      .from(conversationMessagesTable)
      .where(eq(conversationMessagesTable.conversationId, conversationId))
      .all() as ConversationMessageRow[]
    const attachmentRowsByMessageId = getMessageAttachmentRows(messageRows.map((message) => message.id))
      .reduce((grouped, attachment) => {
        const current = grouped.get(attachment.messageId) ?? []
        current.push(attachment)
        grouped.set(attachment.messageId, current)
        return grouped
      }, new Map<string, ConversationMessageAttachmentRow[]>())
    const messages = messageRows
      .map((message) => createConversationMessageSummary(
        message,
        attachmentRowsByMessageId.get(message.id) ?? []
      ))
      .sort((left, right) =>
        compareTimelineText(left.createdAt, right.createdAt) ||
        compareTimelineText(left.id, right.id)
      )

    const queuedMessages = listQueuedConversationMessages(conversationId)

    const events = (database.db
      .select()
      .from(runEventsTable)
      .where(eq(runEventsTable.conversationId, conversationId))
      .all() as RunEventRow[])
      .map((event) => recoverGeneratedImageEvent(event, runProvider.get(event.runId) ?? "codex"))
      .sort((left, right) => {
        const leftRunOrder = runOrder.get(left.runId) ?? Number.MAX_SAFE_INTEGER
        const rightRunOrder = runOrder.get(right.runId) ?? Number.MAX_SAFE_INTEGER
        return leftRunOrder - rightRunOrder ||
          left.sequence - right.sequence ||
          compareTimelineText(left.createdAt, right.createdAt) ||
          compareTimelineText(left.id, right.id)
      })

    const artifacts = (database.db
      .select()
      .from(artifactsTable)
      .where(eq(artifactsTable.conversationId, conversationId))
      .all() as ArtifactRow[])
      .map(createArtifactSummary)
      .sort((left, right) =>
        compareTimelineText(left.createdAt, right.createdAt) ||
        compareTimelineText(left.id, right.id)
      )

    return conversationTimelineSchema.parse({
      conversationId,
      messages,
      queuedMessages,
      runs,
      events,
      artifacts
    })
  }

  const getConversationTimeline = (conversationId: string): GetConversationTimelineResult => {
    const conversation = getConversationById(conversationId)
    if (!conversation) {
      return getConversationTimelineResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${conversationId}`)
      })
    }

    return getConversationTimelineResultSchema.parse({
      status: "ok",
      timeline: buildConversationTimeline(conversationId)
    })
  }

  const getConversationTimelinePage = (
    rawInput: GetConversationTimelinePageInput
  ): GetConversationTimelinePageResult => {
    const input = getConversationTimelinePageInputSchema.parse(rawInput)
    if (!getConversationById(input.conversationId)) {
      return getConversationTimelinePageResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_NOT_FOUND",
          `Conversation id was not found: ${input.conversationId}`
        )
      })
    }

    const cursor = input.beforeRunId
      ? database.db
          .select()
          .from(executionRunsTable)
          .where(and(
            eq(executionRunsTable.id, input.beforeRunId),
            eq(executionRunsTable.conversationId, input.conversationId)
          ))
          .get() as ExecutionRunRow | undefined
      : undefined
    if (input.beforeRunId && !cursor) {
      return getConversationTimelinePageResultSchema.parse({
        status: "error",
        error: buildAppError("INTERNAL_ERROR", "Timeline cursor is no longer available")
      })
    }

    const cursorPredicate = cursor
      ? or(
          lt(executionRunsTable.startedAt, cursor.startedAt),
          and(
            eq(executionRunsTable.startedAt, cursor.startedAt),
            lt(executionRunsTable.id, cursor.id)
          )
        )
      : undefined
    const runRows = database.db
      .select()
      .from(executionRunsTable)
      .where(cursorPredicate
        ? and(eq(executionRunsTable.conversationId, input.conversationId), cursorPredicate)
        : eq(executionRunsTable.conversationId, input.conversationId))
      .orderBy(desc(executionRunsTable.startedAt), desc(executionRunsTable.id))
      .limit(input.limit + 1)
      .all() as ExecutionRunRow[]
    const hasMore = runRows.length > input.limit
    const selectedRows = runRows.slice(0, input.limit)
    const runIds = selectedRows.map((run) => run.id)
    const runs = selectedRows
      .map(createExecutionRunSummary)
      .sort((left, right) =>
        compareTimelineText(left.startedAt, right.startedAt) ||
        compareTimelineText(left.createdAt, right.createdAt) ||
        compareTimelineText(left.id, right.id)
      )
    const runOrder = new Map(runs.map((run, index) => [run.id, index]))
    const runProvider = new Map(runs.map((run) => [run.id, run.provider] as const))

    const messageRows = runIds.length === 0
      ? []
      : database.db.select().from(conversationMessagesTable)
          .where(inArray(conversationMessagesTable.runId, runIds)).all() as ConversationMessageRow[]
    const attachmentRowsByMessageId = getMessageAttachmentRows(messageRows.map((message) => message.id))
      .reduce((grouped, attachment) => {
        const current = grouped.get(attachment.messageId) ?? []
        current.push(attachment)
        grouped.set(attachment.messageId, current)
        return grouped
      }, new Map<string, ConversationMessageAttachmentRow[]>())
    const messages = messageRows
          .map((message) => createConversationMessageSummary(
            message,
            attachmentRowsByMessageId.get(message.id) ?? []
          ))
          .sort((left, right) =>
            compareTimelineText(left.createdAt, right.createdAt) || compareTimelineText(left.id, right.id)
          )
    const events = runIds.length === 0
      ? []
      : (database.db.select().from(runEventsTable)
          .where(inArray(runEventsTable.runId, runIds)).all() as RunEventRow[])
          .map((event) => recoverGeneratedImageEvent(event, runProvider.get(event.runId) ?? "codex"))
          .sort((left, right) =>
            (runOrder.get(left.runId) ?? Number.MAX_SAFE_INTEGER) -
              (runOrder.get(right.runId) ?? Number.MAX_SAFE_INTEGER) ||
            left.sequence - right.sequence ||
            compareTimelineText(left.createdAt, right.createdAt) ||
            compareTimelineText(left.id, right.id)
          )
    const queuedMessages = listQueuedConversationMessages(input.conversationId)
    const artifacts = runIds.length === 0
      ? []
      : (database.db.select().from(artifactsTable)
          .where(inArray(artifactsTable.runId, runIds)).all() as ArtifactRow[])
          .map(createArtifactSummary)
          .sort((left, right) =>
            compareTimelineText(left.createdAt, right.createdAt) || compareTimelineText(left.id, right.id)
          )

    return getConversationTimelinePageResultSchema.parse({
      status: "ok",
      timeline: { conversationId: input.conversationId, messages, queuedMessages, runs, events, artifacts },
      pageInfo: {
        nextCursor: hasMore ? selectedRows.at(-1)?.id ?? null : null,
        hasMore
      }
    })
  }

  const getConversationGitStatus = async (
    input: GetConversationGitStatusInput | string
  ): Promise<GetConversationGitStatusResult> => {
    const normalizedInput = typeof input === "string" ? { conversationId: input } : input
    const conversationId = normalizedInput.conversationId
    const conversation = getConversationById(conversationId)
    if (!conversation) {
      return getConversationGitStatusResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${conversationId}`)
      })
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return getConversationGitStatusResultSchema.parse({
        status: "error",
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${conversation.worktreeId} was not found`)
      })
    }

    if (!existsSync(worktree.rootPath)) {
      return getConversationGitStatusResultSchema.parse({
        status: "error",
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree path was not found: ${worktree.rootPath}`)
      })
    }

    const readGitStatus = deps.readGitStatus ?? readGitStatusFromHost
    const readGitCommand = deps.readGitCommand ?? readGitCommandFromHost
    const gitStatus = await readGitStatus(worktree.rootPath)
    if (gitStatus.status === "error") {
      return getConversationGitStatusResultSchema.parse(gitStatus)
    }

    const parsedFiles = parseGitStatusFiles(gitStatus.stdout)
    if (parsedFiles.status === "error") {
      return getConversationGitStatusResultSchema.parse(parsedFiles)
    }

    const files = parsedFiles.files
    const commitScope = normalizedInput.commitScope ?? DEFAULT_GIT_COMMIT_SCOPE
    const metadataOptions = { cacheTtlMs: 500 }
    const [remotesResult, upstreamResult, localName, localEmail, globalName, globalEmail] = await Promise.all([
      readGitCommand(worktree.rootPath, ["remote", "-v"], metadataOptions),
      readGitCommand(worktree.rootPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], metadataOptions),
      readGitCommand(worktree.rootPath, ["config", "--local", "user.name"], metadataOptions),
      readGitCommand(worktree.rootPath, ["config", "--local", "user.email"], metadataOptions),
      readGitCommand(worktree.rootPath, ["config", "--global", "user.name"], metadataOptions),
      readGitCommand(worktree.rootPath, ["config", "--global", "user.email"], metadataOptions)
    ])
    const remotes = remotesResult.status === "ok"
      ? parseGitRemoteRows(remotesResult.stdout)
      : []
    const upstream = upstreamResult.status === "ok"
      ? parseGitUpstream(upstreamResult.stdout, remotes.map((remote) => remote.name))
      : parseGitUpstream("")
    const repositoryRemotes = remotes.map((remote) => ({
      ...remote,
      isUpstreamDefault: remote.name === upstream.upstreamRemoteName
    }))
    const selectedRemote = selectGitRemote(repositoryRemotes, upstream.upstreamRemoteName)

    const identityName = localName.status === "ok" && localName.stdout.trim()
      ? localName.stdout.trim()
      : globalName?.status === "ok"
        ? globalName.stdout.trim() || null
        : null
    const identityEmail = localEmail.status === "ok" && localEmail.stdout.trim()
      ? localEmail.stdout.trim()
      : globalEmail?.status === "ok"
        ? globalEmail.stdout.trim() || null
        : null
    const identitySource = localName.status === "ok" && localName.stdout.trim() || localEmail.status === "ok" && localEmail.stdout.trim()
      ? "local"
      : identityName || identityEmail
        ? "global"
        : "unset"

    const logArgs = commitScope === "currentBranch"
      ? ["log", `--format=${gitLogFormat}`, "-n", String(gitLogLimit), "HEAD"]
      : ["log", "--all", `--format=${gitLogFormat}`, "-n", String(gitLogLimit)]
    const logResult = await readGitCommand(worktree.rootPath, logArgs, metadataOptions)
    const commits = logResult.status === "ok"
      ? parseGitLog(logResult.stdout, commitScope)
      : { status: "unavailable" as const, scope: commitScope, items: [], hasMore: false }

    return getConversationGitStatusResultSchema.parse({
      status: "ok",
      git: conversationGitStatusSchema.parse({
        conversationId,
        worktreeId: worktree.id,
        worktreeRootPath: worktree.rootPath,
        worktreeKind: worktree.kind,
        repository: {
          remotes: repositoryRemotes,
          selectedRemoteName: selectedRemote.selectedRemoteName,
          selectedRemoteUrl: selectedRemote.selectedRemoteUrl,
          upstreamRemoteName: upstream.upstreamRemoteName,
          upstreamBranchName: upstream.upstreamBranchName
        },
        identity: {
          name: identityName,
          email: identityEmail,
          source: identitySource
        },
        branch: {
          current: parseGitStatusBranch(gitStatus.stdout) ?? worktree.branch,
          recorded: worktree.branch,
          upstream: upstream.upstream,
          isClean: files.length === 0,
          changedCount: files.length
        },
        commits,
        checkedAt: now()
      })
    })
  }

  const conversationChangesPatchMaxBytes = 512 * 1024
  const conversationChangesBinaryProbeBytes = 8192
  const conversationChangesUntrackedStatsMaxTotalBytes = 8 * 1024 * 1024
  const conversationChangesUntrackedStatsMaxFiles = 256
  const emptyChangeStats: ChangeStats = { additions: 0, deletions: 0, isBinary: false }

  type UntrackedFileInspection =
    | {
        status: "text"
        content: string
        executable: boolean
        originalByteLength: number
        truncated: boolean
        revisionIdentity: string
        stats: ChangeStats
      }
    | { status: "binary"; revisionIdentity: string; stats: ChangeStats }
    | { status: "missing" | "too-large" | "unavailable"; reason: string; stats: ChangeStats }

  const resolveConversationChangesWorktree = (conversationId: string) => {
    const conversation = getConversationById(conversationId)
    if (!conversation) {
      return {
        status: "error" as const,
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${conversationId}`, null, {
          domain: "git",
          context: { conversationId }
        })
      }
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return {
        status: "error" as const,
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${conversation.worktreeId} was not found`, null, {
          domain: "git",
          context: { conversationId, worktreeId: conversation.worktreeId }
        })
      }
    }

    let worktreeRootPath: string
    try {
      worktreeRootPath = realpathSync(worktree.rootPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: buildAppError(
          "WORKTREE_NOT_FOUND",
          `Worktree path could not be resolved: ${worktree.rootPath}`,
          err instanceof Error ? err.message : String(err),
          {
            domain: "git",
            context: { conversationId, worktreeId: worktree.id, worktreeRootPath: worktree.rootPath }
          }
        )
      }
    }

    try {
      if (!statSync(worktreeRootPath).isDirectory()) {
        return {
          status: "error" as const,
          error: buildAppError("WORKTREE_NOT_FOUND", `Worktree path is not a directory: ${worktreeRootPath}`, null, {
            domain: "git",
            context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
          })
        }
      }
    } catch (err) {
      return {
        status: "error" as const,
        error: buildAppError(
          "WORKTREE_NOT_FOUND",
          `Worktree path could not be inspected: ${worktreeRootPath}`,
          err instanceof Error ? err.message : String(err),
          {
            domain: "git",
            context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
          }
        )
      }
    }

    return { status: "ok" as const, conversation, worktree, worktreeRootPath }
  }

  const inspectUntrackedFile = (
    worktreeRootPath: string,
    filePath: string,
    options: {
      notifyBeforeOpen?: boolean
      expectedByteLength?: number
      maximumReadBytes?: number
    } = {}
  ): UntrackedFileInspection => {
    const targetPath = resolve(worktreeRootPath, filePath)
    if (!isPathInsideRoot(worktreeRootPath, targetPath)) {
      return {
        status: "unavailable",
        reason: `Untracked path resolved outside the worktree: ${filePath}`,
        stats: emptyChangeStats
      }
    }

    let verifiedStats: BigIntStats
    let realTargetPath: string
    try {
      const linkStats = lstatSync(targetPath)
      if (linkStats.isSymbolicLink()) {
        return {
          status: "unavailable",
          reason: `Untracked symbolic links are not read as file content: ${filePath}`,
          stats: emptyChangeStats
        }
      }
      realTargetPath = realpathSync(targetPath)
      if (!isPathInsideRoot(worktreeRootPath, realTargetPath)) {
        return {
          status: "unavailable",
          reason: `Untracked path resolved outside the worktree: ${filePath}`,
          stats: emptyChangeStats
        }
      }
      verifiedStats = lstatSync(realTargetPath, { bigint: true })
    } catch (err) {
      const nodeError = err as NodeJS.ErrnoException
      if (nodeError.code === "ENOENT" || nodeError.code === "ELOOP") {
        return {
          status: "missing",
          reason: `Untracked file is no longer present: ${filePath}`,
          stats: emptyChangeStats
        }
      }
      return {
        status: "unavailable",
        reason: err instanceof Error ? err.message : String(err),
        stats: emptyChangeStats
      }
    }

    if (!verifiedStats.isFile()) {
      return {
        status: "unavailable",
        reason: `Untracked path is not a regular file: ${filePath}`,
        stats: emptyChangeStats
      }
    }

    const verifiedByteLength = Number(verifiedStats.size)
    if (
      !Number.isSafeInteger(verifiedByteLength) ||
      (options.expectedByteLength !== undefined && verifiedByteLength !== options.expectedByteLength)
    ) {
      return {
        status: "unavailable",
        reason: `Untracked file changed before inspection: ${filePath}`,
        stats: emptyChangeStats
      }
    }

    let openedFileSize: number
    let contentBuffer: Buffer
    let fileDescriptor: number | null = null
    let bytesRead: number
    try {
      if (options.notifyBeforeOpen !== false) {
        deps.beforeOpenConversationChangesUntrackedFile?.({
          worktreeRootPath,
          filePath,
          targetPath,
          realTargetPath
        })
      }
      fileDescriptor = openSync(realTargetPath, constants.O_RDONLY | constants.O_NOFOLLOW)
      const openedStats = fstatSync(fileDescriptor, { bigint: true })
      const currentPathStats = lstatSync(realTargetPath, { bigint: true })
      const openedVerifiedFile = openedStats.isFile() &&
        openedStats.dev === verifiedStats.dev &&
        openedStats.ino === verifiedStats.ino &&
        openedStats.size === verifiedStats.size &&
        openedStats.mtimeNs === verifiedStats.mtimeNs &&
        openedStats.ctimeNs === verifiedStats.ctimeNs &&
        currentPathStats.isFile() &&
        currentPathStats.dev === openedStats.dev &&
        currentPathStats.ino === openedStats.ino &&
        currentPathStats.size === openedStats.size &&
        currentPathStats.mtimeNs === openedStats.mtimeNs &&
        currentPathStats.ctimeNs === openedStats.ctimeNs
      if (!openedVerifiedFile) {
        return {
          status: "unavailable",
          reason: `Untracked file changed after validation: ${filePath}`,
          stats: emptyChangeStats
        }
      }
      openedFileSize = Number(openedStats.size)
      const maximumReadBytes = options.maximumReadBytes ?? conversationChangesPatchMaxBytes + 4
      const readLength = Math.min(openedFileSize, maximumReadBytes)
      contentBuffer = Buffer.alloc(readLength)
      bytesRead = readLength > 0 ? readSync(fileDescriptor, contentBuffer, 0, readLength, 0) : 0
      const afterReadStats = fstatSync(fileDescriptor, { bigint: true })
      const afterReadPathStats = lstatSync(realTargetPath, { bigint: true })
      if (
        afterReadStats.dev !== openedStats.dev ||
        afterReadStats.ino !== openedStats.ino ||
        afterReadStats.size !== openedStats.size ||
        afterReadStats.mode !== openedStats.mode ||
        afterReadStats.mtimeNs !== openedStats.mtimeNs ||
        afterReadStats.ctimeNs !== openedStats.ctimeNs ||
        afterReadPathStats.dev !== openedStats.dev ||
        afterReadPathStats.ino !== openedStats.ino ||
        afterReadPathStats.size !== openedStats.size ||
        afterReadPathStats.mtimeNs !== openedStats.mtimeNs ||
        afterReadPathStats.ctimeNs !== openedStats.ctimeNs
      ) {
        return {
          status: "unavailable",
          reason: `Untracked file changed while it was being read: ${filePath}`,
          stats: emptyChangeStats
        }
      }
    } catch (err) {
      return {
        status: "unavailable",
        reason: err instanceof Error ? err.message : String(err),
        stats: emptyChangeStats
      }
    } finally {
      if (fileDescriptor !== null) {
        closeSync(fileDescriptor)
      }
    }

    const content = contentBuffer.subarray(0, bytesRead)
    const revisionIdentity = [
      verifiedStats.dev,
      verifiedStats.ino,
      verifiedStats.mode,
      verifiedStats.size,
      verifiedStats.mtimeNs,
      verifiedStats.ctimeNs
    ].join(":")
    const binaryProbe = content.subarray(0, conversationChangesBinaryProbeBytes)
    if (binaryProbe.includes(0)) {
      return {
        status: "binary",
        revisionIdentity,
        stats: { additions: 0, deletions: 0, isBinary: true }
      }
    }
    const maximumTextBytes = Math.min(content.length, conversationChangesPatchMaxBytes)
    let text: string | null = null
    let decodedByteLength = maximumTextBytes
    const maximumSuffixBytes = openedFileSize > maximumTextBytes
      ? Math.min(4, maximumTextBytes)
      : 0
    for (let suffixBytes = 0; suffixBytes <= maximumSuffixBytes; suffixBytes += 1) {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(content.subarray(0, maximumTextBytes - suffixBytes))
        decodedByteLength = maximumTextBytes - suffixBytes
        break
      } catch {
        // A large valid UTF-8 file can be cut in the middle of one code point.
      }
    }
    if (text === null) {
      return {
        status: "binary",
        revisionIdentity,
        stats: { additions: 0, deletions: 0, isBinary: true }
      }
    }

    return {
      status: "text",
      content: text,
      executable: (Number(verifiedStats.mode) & 0o111) !== 0,
      originalByteLength: openedFileSize,
      truncated: decodedByteLength < openedFileSize,
      revisionIdentity,
      stats: {
        additions: countConversationChangeTextLines(content.subarray(0, decodedByteLength)),
        deletions: 0,
        isBinary: false
      }
    }
  }

  const hydrateUntrackedChangeStats = (
    worktreeRootPath: string,
    files: ConversationChangeFile[]
  ) => {
    let consumedBytes = 0
    let attemptedFiles = 0
    const hydratedRevisions = new Map<string, string>()

    for (const file of files) {
      if (file.status !== "untracked") {
        continue
      }
      if (attemptedFiles >= conversationChangesUntrackedStatsMaxFiles) {
        break
      }
      attemptedFiles += 1

      const targetPath = resolve(worktreeRootPath, file.path)
      let byteLength: number
      try {
        if (targetPath === worktreeRootPath || !isPathInsideRoot(worktreeRootPath, targetPath)) {
          continue
        }
        const candidateStats = lstatSync(targetPath)
        if (candidateStats.isSymbolicLink() || !candidateStats.isFile()) {
          continue
        }
        byteLength = candidateStats.size
      } catch {
        continue
      }

      const requestedBytes = byteLength > conversationChangesPatchMaxBytes
        ? Math.min(byteLength, conversationChangesBinaryProbeBytes)
        : byteLength
      if (consumedBytes + requestedBytes > conversationChangesUntrackedStatsMaxTotalBytes) {
        continue
      }

      consumedBytes += requestedBytes
      const inspection = inspectUntrackedFile(worktreeRootPath, file.path, {
        notifyBeforeOpen: false,
        expectedByteLength: byteLength,
        maximumReadBytes: requestedBytes
      })
      if (inspection.status === "binary" || (inspection.status === "text" && !inspection.truncated)) {
        Object.assign(file, inspection.stats)
        hydratedRevisions.set(file.path, inspection.revisionIdentity)
      }
    }

    return hydratedRevisions
  }

  const buildGitChangesReadError = (
    conversationId: string,
    worktreeId: string,
    message: string,
    error: AppError
  ) => buildAppError("GIT_CHANGES_READ_FAILED", message, error.suggestion, {
    domain: "git",
    context: { conversationId, worktreeId, causeCode: error.code }
  })

  const buildConversationChangesRevision = (input: {
    worktreeRootPath: string
    statusOutput: string
    stagedNumstatOutput: string
    unstagedNumstatOutput: string
    stagedRawOutput: string
    files: Array<{ path: string; oldPath?: string | null }>
    expectedPathRevisions?: ReadonlyMap<string, string>
  }) => {
    const maximumPaths = 10_000
    const maximumPathBytes = 1024 * 1024
    const paths = [...new Set(input.files.flatMap((file) => file.oldPath ? [file.oldPath, file.path] : [file.path]))].sort()
    const pathBytes = paths.reduce((total, path) => total + Buffer.byteLength(path, "utf8"), 0)
    if (paths.length > maximumPaths || pathBytes > maximumPathBytes) {
      throw new Error("Conversation changes exceed the revision metadata safety budget")
    }

    const hash = createHash("sha256")
    const updatePart = (label: string, value: string) => {
      hash.update(`${label}\0${Buffer.byteLength(value, "utf8")}\0`)
      hash.update(value)
      hash.update("\0")
    }
    updatePart("status", input.statusOutput)
    updatePart("staged-numstat", input.stagedNumstatOutput)
    updatePart("unstaged-numstat", input.unstagedNumstatOutput)
    updatePart("staged-raw", input.stagedRawOutput)

    for (const filePath of paths) {
      const targetPath = resolve(input.worktreeRootPath, filePath)
      if (targetPath === input.worktreeRootPath || !isPathInsideRoot(input.worktreeRootPath, targetPath)) {
        throw new Error(`Git reported a change path outside the worktree: ${filePath}`)
      }
      let revision: string
      try {
        const stats = lstatSync(targetPath, { bigint: true })
        revision = [
          stats.dev,
          stats.ino,
          stats.mode,
          stats.size,
          stats.mtimeNs,
          stats.ctimeNs
        ].join(":")
        if (input.expectedPathRevisions?.get(filePath) !== undefined &&
          input.expectedPathRevisions.get(filePath) !== revision) {
          throw new Error(`Changed file moved after its statistics were read: ${filePath}`)
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
        revision = "missing"
      }
      updatePart(`path:${filePath}`, revision)
    }

    return `changes-v1:${hash.digest("hex")}`
  }

  const getConversationChanges = async (
    rawInput: GetConversationChangesInput
  ): Promise<GetConversationChangesResult> => {
    const input = getConversationChangesInputSchema.parse(rawInput)
    const target = resolveConversationChangesWorktree(input.conversationId)
    if (target.status === "error") {
      return getConversationChangesResultSchema.parse({ status: "error", error: target.error })
    }

    try {
      await worktreeGitWatcher?.watchWorktree({
        worktreeId: target.worktree.id,
        rootPath: target.worktreeRootPath
      })
    } catch (error) {
      deps.log?.warn("git", "git.watch.register.failed", {
        conversationId: input.conversationId,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.worktreeRootPath,
        errorCode: "GIT_WATCH_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    }

    const readGitStatus = deps.readGitStatus ?? ((worktreeRootPath: string) => readGitStatusFromHost(worktreeRootPath, true))
    const readGitCommand = deps.readGitCommand ?? readGitCommandFromHost
    const gitStatus = await readGitStatus(target.worktreeRootPath)
    if (gitStatus.status === "error") {
      return getConversationChangesResultSchema.parse({ status: "error", error: gitStatus.error })
    }

    const parsedStatus = parseGitPorcelainStatus(gitStatus.stdout)
    if (parsedStatus.status === "error") {
      return getConversationChangesResultSchema.parse({
        status: "error",
        error: buildAppError(
          "GIT_STATUS_PARSE_FAILED",
          "git status returned output TeamCow could not parse",
          parsedStatus.invalidRecord,
          {
            domain: "git",
            context: { conversationId: input.conversationId, worktreeId: target.worktree.id }
          }
        )
      })
    }
    for (const file of parsedStatus.files) {
      if (file.indexStatus === "?" && file.worktreeStatus === "?" && file.path.endsWith("/")) {
        file.path = file.path.replace(/\/+$/, "")
      }
    }

    const [stagedNumstat, unstagedNumstat, stagedRaw] = await Promise.all([
      readGitCommand(target.worktreeRootPath, [
        "diff",
        "--numstat",
        "-z",
        "-M",
        "-C",
        "--find-copies-harder",
        "--cached",
        "--"
      ]),
      readGitCommand(target.worktreeRootPath, [
        "diff",
        "--numstat",
        "-z",
        "-M",
        "-C",
        "--find-copies-harder",
        "--"
      ]),
      readGitCommand(target.worktreeRootPath, [
        "diff",
        "--cached",
        "--raw",
        "-z",
        "--full-index",
        "--no-renames",
        "--"
      ])
    ])
    if (stagedNumstat.status === "error") {
      return getConversationChangesResultSchema.parse({
        status: "error",
        error: buildGitChangesReadError(
          input.conversationId,
          target.worktree.id,
          `Could not read staged changes for worktree ${target.worktreeRootPath}`,
          stagedNumstat.error
        )
      })
    }

    if (unstagedNumstat.status === "error") {
      return getConversationChangesResultSchema.parse({
        status: "error",
        error: buildGitChangesReadError(
          input.conversationId,
          target.worktree.id,
          `Could not read unstaged changes for worktree ${target.worktreeRootPath}`,
          unstagedNumstat.error
        )
      })
    }

    if (stagedRaw.status === "error") {
      return getConversationChangesResultSchema.parse({
        status: "error",
        error: buildGitChangesReadError(
          input.conversationId,
          target.worktree.id,
          `Could not read staged index identities for worktree ${target.worktreeRootPath}`,
          stagedRaw.error
        )
      })
    }

    const stagedStats = parseGitNumstat(stagedNumstat.stdout)
    const unstagedStats = parseGitNumstat(unstagedNumstat.stdout)
    // Hydrate a bounded prefix of untracked statistics. The captured file
    // identities are checked again while constructing the snapshot revision.
    const groups = buildConversationChangeGroups({
      statusFiles: parsedStatus.files,
      stagedStats,
      unstagedStats
    })
    const hydratedRevisions = hydrateUntrackedChangeStats(target.worktreeRootPath, groups.unstaged)
    let revision: string
    try {
      revision = buildConversationChangesRevision({
        worktreeRootPath: target.worktreeRootPath,
        statusOutput: gitStatus.stdout,
        stagedNumstatOutput: stagedNumstat.stdout,
        unstagedNumstatOutput: unstagedNumstat.stdout,
        stagedRawOutput: stagedRaw.stdout,
        files: parsedStatus.files,
        expectedPathRevisions: hydratedRevisions
      })
    } catch (err) {
      return getConversationChangesResultSchema.parse({
        status: "error",
        error: buildAppError(
          "GIT_CHANGES_READ_FAILED",
          `Could not establish a stable changes revision for worktree ${target.worktreeRootPath}`,
          err instanceof Error ? err.message : String(err),
          {
            domain: "git",
            context: { conversationId: input.conversationId, worktreeId: target.worktree.id }
          }
        )
      })
    }

    return getConversationChangesResultSchema.parse({
      status: "ok",
      changes: {
        conversationId: input.conversationId,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.worktreeRootPath,
        revision,
        ...groups,
        checkedAt: now()
      }
    })
  }

  const quoteGitPatchPath = (path: string) => /[\t\n\r"\\]/.test(path) ? JSON.stringify(path) : path

  const buildUntrackedPatch = (filePath: string, content: string, executable: boolean) => {
    const oldPath = quoteGitPatchPath(`a/${filePath}`)
    const newPath = quoteGitPatchPath(`b/${filePath}`)
    const contentLines = content.length === 0 ? [] : content.split("\n")
    const hasFinalNewline = content.endsWith("\n")
    if (hasFinalNewline) {
      contentLines.pop()
    }
    const patchLines = [
      `diff --git ${oldPath} ${newPath}`,
      `new file mode ${executable ? "100755" : "100644"}`,
      "--- /dev/null",
      `+++ ${newPath}`
    ]
    if (contentLines.length > 0) {
      patchLines.push(`@@ -0,0 +1,${contentLines.length} @@`)
      patchLines.push(...contentLines.map((line) => `+${line}`))
      if (!hasFinalNewline) {
        patchLines.push("\\ No newline at end of file")
      }
    }
    return `${patchLines.join("\n")}\n`
  }

  const textConversationChangeDiff = (input: {
    conversationId: string
    worktreeId: string
    filePath: string
    area: GetConversationChangeDiffInput["area"]
    patch: string
    originalByteLength?: number
    sourceTruncated?: boolean
  }): GetConversationChangeDiffResult => {
    const originalByteLength = input.originalByteLength ?? Buffer.byteLength(input.patch, "utf8")
    const truncated = truncateUnifiedPatch(input.patch, conversationChangesPatchMaxBytes)
    const returnedByteLength = Buffer.byteLength(truncated.patch, "utf8")
    return getConversationChangeDiffResultSchema.parse({
      status: "text",
      conversationId: input.conversationId,
      worktreeId: input.worktreeId,
      filePath: input.filePath,
      area: input.area,
      patch: truncated.patch,
      truncated: Boolean(input.sourceTruncated) || truncated.truncatedLineCount > 0,
      originalByteLength,
      returnedByteLength
    })
  }

  const getConversationChangeDiff = async (
    rawInput: GetConversationChangeDiffInput
  ): Promise<GetConversationChangeDiffResult> => {
    const input = getConversationChangeDiffInputSchema.parse(rawInput)
    const changesResult = await getConversationChanges({ conversationId: input.conversationId })
    if (changesResult.status === "error") {
      return getConversationChangeDiffResultSchema.parse({
        status: "error",
        conversationId: input.conversationId,
        filePath: input.filePath,
        area: input.area,
        error: changesResult.error
      })
    }

    const selectedGroup = changesResult.changes[input.area]
    const selectedFile = selectedGroup.find((file) => file.path === input.filePath)
    if (!selectedFile) {
      const targetPath = resolve(changesResult.changes.worktreeRootPath, input.filePath)
      return getConversationChangeDiffResultSchema.parse({
        status: "missing",
        conversationId: input.conversationId,
        worktreeId: changesResult.changes.worktreeId,
        filePath: input.filePath,
        area: input.area,
        reason: existsSync(targetPath) ? "area-changed" : "file-missing"
      })
    }

    const identity = {
      conversationId: input.conversationId,
      worktreeId: changesResult.changes.worktreeId,
      filePath: input.filePath,
      area: input.area
    }
    if (selectedFile.isBinary) {
      return getConversationChangeDiffResultSchema.parse({ status: "binary", ...identity })
    }

    if (selectedFile.status === "untracked") {
      const inspection = inspectUntrackedFile(changesResult.changes.worktreeRootPath, input.filePath)
      if (inspection.status === "missing") {
        return getConversationChangeDiffResultSchema.parse({
          status: "missing",
          ...identity,
          reason: "file-missing"
        })
      }
      if (inspection.status === "binary") {
        return getConversationChangeDiffResultSchema.parse({ status: "binary", ...identity })
      }
      if (inspection.status !== "text") {
        return getConversationChangeDiffResultSchema.parse({
          status: "unavailable",
          ...identity,
          reason: inspection.reason
        })
      }
      return textConversationChangeDiff({
        ...identity,
        patch: buildUntrackedPatch(input.filePath, inspection.content, inspection.executable),
        originalByteLength: inspection.originalByteLength,
        sourceTruncated: inspection.truncated
      })
    }

    const readGitCommand = deps.readGitCommand ?? readGitCommandFromHost
    const selectedPaths = selectedFile.oldPath && (selectedFile.status === "renamed" || selectedFile.status === "copied")
      ? [selectedFile.oldPath, input.filePath]
      : [input.filePath]
    const diffOptions = [
      "--no-ext-diff",
      "--binary",
      "--unified=3",
      "-M",
      "-C",
      "--find-copies-harder"
    ]
    const args = input.area === "staged"
      ? ["diff", "--cached", ...diffOptions, "--", ...selectedPaths]
      : ["diff", ...diffOptions, "--", ...selectedPaths]
    const diffResult = await readGitCommand(changesResult.changes.worktreeRootPath, args)
    if (diffResult.status === "error") {
      return getConversationChangeDiffResultSchema.parse({
        status: "unavailable",
        ...identity,
        reason: diffResult.error.suggestion ?? diffResult.error.message
      })
    }
    if (/^(?:GIT binary patch|Binary files .*)$/m.test(diffResult.stdout)) {
      return getConversationChangeDiffResultSchema.parse({ status: "binary", ...identity })
    }
    if (!diffResult.stdout) {
      return getConversationChangeDiffResultSchema.parse({
        status: "unavailable",
        ...identity,
        reason: `Git returned no ${input.area} patch for ${input.filePath}`
      })
    }

    return textConversationChangeDiff({
      ...identity,
      patch: diffResult.stdout,
      originalByteLength: diffResult.stdoutByteLength,
      sourceTruncated: diffResult.stdoutTruncated
    })
  }

  const conversationChangeDiffDocumentMaxSideBytes = 2 * 1024 * 1024

  type ConversationChangeDocumentSide =
    | { status: "text"; content: string; byteLength: number; mode: string | null }
    | { status: "binary"; mode: string | null }
    | { status: "too-large"; byteLength: number; mode: string | null }
    | { status: "missing"; mode: null }
    | { status: "unavailable"; reason: string; mode: string | null }

  const decodeConversationChangeDocumentBuffer = (
    content: Buffer,
    mode: string | null
  ): ConversationChangeDocumentSide => {
    if (content.length > conversationChangeDiffDocumentMaxSideBytes) {
      return { status: "too-large", byteLength: content.length, mode }
    }
    if (content.subarray(0, conversationChangesBinaryProbeBytes).includes(0)) {
      return { status: "binary", mode }
    }
    try {
      return {
        status: "text",
        content: new TextDecoder("utf-8", { fatal: true }).decode(content),
        byteLength: content.length,
        mode
      }
    } catch {
      return { status: "binary", mode }
    }
  }

  const readConversationChangeBlob = async (
    worktreeRootPath: string,
    objectId: string,
    mode: string
  ): Promise<ConversationChangeDocumentSide> => {
    const blob = await (deps.readGitBlob
      ? deps.readGitBlob(worktreeRootPath, objectId)
      : readGitBlobFromHost(worktreeRootPath, objectId, conversationChangeDiffDocumentMaxSideBytes))
    if (blob.status === "error") {
      const measuredSize = "oversizedByteLength" in blob ? blob.oversizedByteLength : null
      if (typeof measuredSize === "number" && measuredSize > conversationChangeDiffDocumentMaxSideBytes) {
        return { status: "too-large", byteLength: measuredSize, mode }
      }
    }
    return blob.status === "ok"
      ? decodeConversationChangeDocumentBuffer(blob.content, mode)
      : { status: "unavailable", reason: blob.error.suggestion ?? blob.error.message, mode }
  }

  const readConversationChangeTreeSide = async (
    worktreeRootPath: string,
    filePath: string
  ): Promise<ConversationChangeDocumentSide> => {
    const result = await (deps.readGitCommand ?? readGitCommandFromHost)(worktreeRootPath, [
      "--literal-pathspecs",
      "ls-tree",
      "-z",
      "HEAD",
      "--",
      filePath
    ])
    if (result.status === "error") {
      return { status: "unavailable", reason: result.error.suggestion ?? result.error.message, mode: null }
    }
    const records = result.stdout.split("\0").filter(Boolean)
    if (records.length === 0) return { status: "missing", mode: null }
    if (records.length !== 1) {
      return { status: "unavailable", reason: `Git returned an ambiguous HEAD entry for ${filePath}`, mode: null }
    }
    const separatorIndex = records[0].indexOf("\t")
    const metadata = separatorIndex >= 0 ? records[0].slice(0, separatorIndex) : ""
    const listedPath = separatorIndex >= 0 ? records[0].slice(separatorIndex + 1) : ""
    const matched = /^([0-7]{6}) blob ([0-9a-f]{40}|[0-9a-f]{64})$/.exec(metadata)
    if (!matched || listedPath !== filePath) {
      return { status: "unavailable", reason: `Git returned an invalid HEAD entry for ${filePath}`, mode: null }
    }
    return readConversationChangeBlob(worktreeRootPath, matched[2], matched[1])
  }

  const readConversationChangeIndexSide = async (
    worktreeRootPath: string,
    filePath: string
  ): Promise<ConversationChangeDocumentSide> => {
    const result = await (deps.readGitCommand ?? readGitCommandFromHost)(worktreeRootPath, [
      "--literal-pathspecs",
      "ls-files",
      "--stage",
      "-z",
      "--",
      filePath
    ])
    if (result.status === "error") {
      return { status: "unavailable", reason: result.error.suggestion ?? result.error.message, mode: null }
    }
    const records = result.stdout.split("\0").filter(Boolean)
    if (records.length === 0) return { status: "missing", mode: null }
    if (records.length !== 1) {
      return { status: "unavailable", reason: `Git returned ambiguous index entries for ${filePath}`, mode: null }
    }
    const separatorIndex = records[0].indexOf("\t")
    const metadata = separatorIndex >= 0 ? records[0].slice(0, separatorIndex) : ""
    const listedPath = separatorIndex >= 0 ? records[0].slice(separatorIndex + 1) : ""
    const matched = /^([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) 0$/.exec(metadata)
    if (!matched || listedPath !== filePath) {
      return { status: "unavailable", reason: `Git returned an invalid index entry for ${filePath}`, mode: null }
    }
    return readConversationChangeBlob(worktreeRootPath, matched[2], matched[1])
  }

  const readConversationChangeWorktreeSide = (
    worktreeRootPath: string,
    filePath: string
  ): ConversationChangeDocumentSide => {
    const targetPath = resolve(worktreeRootPath, filePath)
    if (targetPath === worktreeRootPath || !isPathInsideRoot(worktreeRootPath, targetPath)) {
      return { status: "unavailable", reason: `Change path resolved outside the worktree: ${filePath}`, mode: null }
    }

    let fileDescriptor: number | null = null
    try {
      const linkStats = lstatSync(targetPath, { bigint: true })
      if (linkStats.isSymbolicLink() || !linkStats.isFile()) {
        return { status: "unavailable", reason: `Change path is not a regular file: ${filePath}`, mode: null }
      }
      const realTargetPath = realpathSync(targetPath)
      if (!isPathInsideRoot(worktreeRootPath, realTargetPath)) {
        return { status: "unavailable", reason: `Change path resolved outside the worktree: ${filePath}`, mode: null }
      }
      fileDescriptor = openSync(realTargetPath, constants.O_RDONLY | constants.O_NOFOLLOW)
      const openedStats = fstatSync(fileDescriptor, { bigint: true })
      const currentStats = lstatSync(realTargetPath, { bigint: true })
      if (
        !openedStats.isFile() ||
        openedStats.dev !== linkStats.dev ||
        openedStats.ino !== linkStats.ino ||
        openedStats.size !== linkStats.size ||
        openedStats.mtimeNs !== linkStats.mtimeNs ||
        currentStats.dev !== openedStats.dev ||
        currentStats.ino !== openedStats.ino
      ) {
        return { status: "unavailable", reason: `Change file changed after validation: ${filePath}`, mode: null }
      }
      const byteLength = Number(openedStats.size)
      const mode = (Number(openedStats.mode) & 0o111) !== 0 ? "100755" : "100644"
      if (byteLength > conversationChangeDiffDocumentMaxSideBytes) {
        return { status: "too-large", byteLength, mode }
      }
      const content = Buffer.alloc(byteLength)
      const bytesRead = byteLength > 0 ? readSync(fileDescriptor, content, 0, byteLength, 0) : 0
      const afterReadStats = fstatSync(fileDescriptor, { bigint: true })
      if (
        bytesRead !== byteLength ||
        afterReadStats.dev !== openedStats.dev ||
        afterReadStats.ino !== openedStats.ino ||
        afterReadStats.size !== openedStats.size ||
        afterReadStats.mtimeNs !== openedStats.mtimeNs ||
        afterReadStats.ctimeNs !== openedStats.ctimeNs
      ) {
        return { status: "unavailable", reason: `Change file changed while it was being read: ${filePath}`, mode }
      }
      return decodeConversationChangeDocumentBuffer(content, mode)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      return code === "ENOENT" || code === "ELOOP"
        ? { status: "missing", mode: null }
        : { status: "unavailable", reason: err instanceof Error ? err.message : String(err), mode: null }
    } finally {
      if (fileDescriptor !== null) closeSync(fileDescriptor)
    }
  }

  const getConversationChangeDiffDocument = async (
    rawInput: GetConversationChangeDiffDocumentInput
  ): Promise<GetConversationChangeDiffDocumentResult> => {
    const input = getConversationChangeDiffDocumentInputSchema.parse(rawInput)
    const identity = { ...input }
    const changesResult = await getConversationChanges({ conversationId: input.conversationId })
    if (changesResult.status === "error") {
      return getConversationChangeDiffDocumentResultSchema.parse({
        status: "error",
        ...identity,
        error: changesResult.error
      })
    }
    if (
      changesResult.changes.worktreeId !== input.worktreeId ||
      changesResult.changes.revision !== input.revision
    ) {
      return getConversationChangeDiffDocumentResultSchema.parse({
        status: "stale",
        ...identity,
        actualRevision: changesResult.changes.revision
      })
    }

    const selectedFile = changesResult.changes[input.area].find((file) => file.path === input.filePath)
    if (!selectedFile) {
      const targetPath = resolve(changesResult.changes.worktreeRootPath, input.filePath)
      return getConversationChangeDiffDocumentResultSchema.parse({
        status: "missing",
        ...identity,
        reason: existsSync(targetPath) ? "area-changed" : "file-missing"
      })
    }
    if (selectedFile.status === "conflicted") {
      return getConversationChangeDiffDocumentResultSchema.parse({
        status: "conflicted",
        ...identity,
        oldPath: selectedFile.oldPath
      })
    }

    const emptySide: ConversationChangeDocumentSide = { status: "text", content: "", byteLength: 0, mode: null }
    const originalPath = selectedFile.oldPath ?? selectedFile.path
    let original: ConversationChangeDocumentSide
    let modified: ConversationChangeDocumentSide
    if (input.area === "staged") {
      original = selectedFile.status === "added"
        ? emptySide
        : await readConversationChangeTreeSide(changesResult.changes.worktreeRootPath, originalPath)
      modified = selectedFile.status === "deleted"
        ? emptySide
        : await readConversationChangeIndexSide(changesResult.changes.worktreeRootPath, selectedFile.path)
    } else {
      original = selectedFile.status === "untracked"
        ? emptySide
        : await readConversationChangeIndexSide(changesResult.changes.worktreeRootPath, originalPath)
      modified = selectedFile.status === "deleted"
        ? emptySide
        : readConversationChangeWorktreeSide(changesResult.changes.worktreeRootPath, selectedFile.path)
    }

    // HEAD/index/worktree content can change after the first status read. Re-read
    // the snapshot only after materialization so content is never returned under
    // a revision identity that no longer describes it.
    const verifiedChangesResult = await getConversationChanges({ conversationId: input.conversationId })
    if (verifiedChangesResult.status === "error") {
      return getConversationChangeDiffDocumentResultSchema.parse({
        status: "error",
        ...identity,
        error: verifiedChangesResult.error
      })
    }
    if (
      verifiedChangesResult.changes.worktreeId !== input.worktreeId ||
      verifiedChangesResult.changes.revision !== input.revision
    ) {
      return getConversationChangeDiffDocumentResultSchema.parse({
        status: "stale",
        ...identity,
        actualRevision: verifiedChangesResult.changes.revision
      })
    }

    // An expected empty side may not exist in Git. Any other missing side means
    // the revision no longer identifies materializable content.
    if (original.status === "missing" || modified.status === "missing") {
      return getConversationChangeDiffDocumentResultSchema.parse({
        status: "missing",
        ...identity,
        reason: "file-missing"
      })
    }
    if (original.status === "binary" || modified.status === "binary") {
      return getConversationChangeDiffDocumentResultSchema.parse({
        status: "binary",
        ...identity,
        oldPath: selectedFile.oldPath
      })
    }
    if (original.status === "too-large" || modified.status === "too-large") {
      const tooLarge = original.status === "too-large" ? original : modified as Extract<ConversationChangeDocumentSide, { status: "too-large" }>
      return getConversationChangeDiffDocumentResultSchema.parse({
        status: "too-large",
        ...identity,
        oldPath: selectedFile.oldPath,
        side: original.status === "too-large" ? "original" : "modified",
        byteLength: tooLarge.byteLength,
        limitBytes: conversationChangeDiffDocumentMaxSideBytes
      })
    }
    if (original.status === "unavailable" || modified.status === "unavailable") {
      const unavailable = original.status === "unavailable" ? original : modified as Extract<ConversationChangeDocumentSide, { status: "unavailable" }>
      return getConversationChangeDiffDocumentResultSchema.parse({
        status: "unavailable",
        ...identity,
        reason: unavailable.reason
      })
    }

    return getConversationChangeDiffDocumentResultSchema.parse({
      status: "text",
      ...identity,
      oldPath: selectedFile.oldPath,
      original: original.content,
      modified: modified.content,
      originalMode: original.mode,
      modifiedMode: modified.mode,
      originalByteLength: original.byteLength,
      modifiedByteLength: modified.byteLength
    })
  }

  type ConversationChangesMutationTarget = {
    changes: ConversationChangesSnapshot
    files: ConversationChangeFile[]
  }

  const buildChangesGitError = (input: {
    code:
      | "GIT_CHANGE_OPERATION_FAILED"
      | "GIT_COMMIT_EMPTY_INDEX"
      | "GIT_COMMIT_IDENTITY_INVALID"
      | "GIT_COMMIT_REJECTED"
      | "GIT_COMMIT_FAILED"
    conversationId: string
    message: string
    command: string
    cause?: AppError | unknown
    worktreeId?: string
    worktreeRootPath?: string
  }) => {
    const cause = input.cause
    const causeError = cause && typeof cause === "object" && "code" in cause
      ? cause as AppError
      : null
    const context: Record<string, unknown> = {
      conversationId: input.conversationId,
      command: input.command
    }
    if (input.worktreeId) {
      context.worktreeId = input.worktreeId
    }
    if (input.worktreeRootPath) {
      context.worktreeRootPath = input.worktreeRootPath
    }

    return buildAppError(
      input.code,
      input.message,
      causeError?.suggestion ?? causeError?.message ?? (cause instanceof Error ? cause.message : cause ? String(cause) : null),
      { domain: "git", context }
    )
  }

  const changesMutationErrorFromRead = (
    conversationId: string,
    command: string,
    error: AppError
  ) => buildChangesGitError({
    code: "GIT_CHANGE_OPERATION_FAILED",
    conversationId,
    message: `Could not refresh conversation changes before ${command}`,
    command,
    cause: error,
    worktreeId: error.context?.worktreeId,
    worktreeRootPath: error.context?.worktreeRootPath
  })

  const runConversationChangesGitCommand = async (
    worktreeRootPath: string,
    args: string[],
    options?: GitCommandOptions
  ): Promise<Awaited<ReturnType<GitCommandRunner>>> => {
    try {
      return await (deps.readGitCommand ?? readGitCommandFromHost)(worktreeRootPath, args, options)
    } catch (err) {
      return {
        status: "error",
        error: buildAppError(
          "GIT_STATUS_FAILED",
          `git ${args[0] ?? "command"} could not be started for ${worktreeRootPath}`,
          err instanceof Error ? err.message : String(err),
          {
            domain: "git",
            context: { worktreeRootPath, command: args[0] ?? "git" }
          }
        )
      }
    }
  }

  const runLiteralConversationChangesGitCommand = (
    worktreeRootPath: string,
    args: string[],
    options?: GitCommandOptions
  ) => runConversationChangesGitCommand(worktreeRootPath, ["--literal-pathspecs", ...args], options)

  const selectConversationChangesMutationTargets = async (input: {
    conversationId: string
    scope: StageConversationChangesInput["scope"]
    area: "staged" | "unstaged"
    command: string
  }): Promise<{ status: "ok"; target: ConversationChangesMutationTarget } | { status: "error"; error: AppError }> => {
    const changesResult = await getConversationChanges({ conversationId: input.conversationId })
    if (changesResult.status === "error") {
      return {
        status: "error",
        error: changesMutationErrorFromRead(input.conversationId, input.command, changesResult.error)
      }
    }

    const currentFiles = changesResult.changes[input.area]
    if (input.scope.type === "all") {
      return { status: "ok", target: { changes: changesResult.changes, files: currentFiles } }
    }

    const filePath = input.scope.filePath
    const currentFile = currentFiles.find((file) => file.path === filePath)
    if (!currentFile) {
      return {
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: changesResult.changes.worktreeId,
          worktreeRootPath: changesResult.changes.worktreeRootPath,
          command: input.command,
          message: `${filePath} is not a current ${input.area} conversation change`
        })
      }
    }

    return { status: "ok", target: { changes: changesResult.changes, files: [currentFile] } }
  }

  const uniqueConversationChangePaths = (files: ConversationChangeFile[]) =>
    [...new Set(files.flatMap((file) => {
      const oldPath = file.oldPath && file.status === "renamed"
        ? [file.oldPath]
        : []
      return [...oldPath, file.path]
    }))]

  const mutationSuccessIdentity = (input: {
    conversationId: string
    worktreeId: string
    scope: StageConversationChangesInput["scope"]
    changedPaths: string[]
  }) => ({
    status: "ok" as const,
    conversationId: input.conversationId,
    worktreeId: input.worktreeId,
    scope: input.scope,
    changedPaths: input.changedPaths
  })

  const stageConversationChanges = async (
    rawInput: StageConversationChangesInput
  ): Promise<StageConversationChangesResult> => {
    const input = stageConversationChangesInputSchema.parse(rawInput)
    const selected = await selectConversationChangesMutationTargets({
      ...input,
      area: "unstaged",
      command: "stage conversation changes"
    })
    if (selected.status === "error") {
      return stageConversationChangesResultSchema.parse({ status: "error", error: selected.error })
    }

    const changedPaths = uniqueConversationChangePaths(selected.target.files)
    if (changedPaths.length === 0) {
      return stageConversationChangesResultSchema.parse(mutationSuccessIdentity({
        ...input,
        worktreeId: selected.target.changes.worktreeId,
        changedPaths
      }))
    }

    const pathspecs = input.scope.type === "all" ? ["."] : changedPaths
    const result = await runLiteralConversationChangesGitCommand(
      selected.target.changes.worktreeRootPath,
      ["add", "-A", "--", ...pathspecs],
      { timeoutMs: 30_000, mutation: true }
    )
    if (result.status === "error") {
      return stageConversationChangesResultSchema.parse({
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: selected.target.changes.worktreeId,
          worktreeRootPath: selected.target.changes.worktreeRootPath,
          command: "git add -A",
          message: "Could not stage conversation changes",
          cause: result.error
        })
      })
    }

    return stageConversationChangesResultSchema.parse(mutationSuccessIdentity({
      ...input,
      worktreeId: selected.target.changes.worktreeId,
      changedPaths
    }))
  }

  const unstageConversationChanges = async (
    rawInput: UnstageConversationChangesInput
  ): Promise<UnstageConversationChangesResult> => {
    const input = unstageConversationChangesInputSchema.parse(rawInput)
    const selected = await selectConversationChangesMutationTargets({
      ...input,
      area: "staged",
      command: "unstage conversation changes"
    })
    if (selected.status === "error") {
      return unstageConversationChangesResultSchema.parse({ status: "error", error: selected.error })
    }

    const changedPaths = uniqueConversationChangePaths(selected.target.files)
    if (changedPaths.length === 0) {
      return unstageConversationChangesResultSchema.parse(mutationSuccessIdentity({
        ...input,
        worktreeId: selected.target.changes.worktreeId,
        changedPaths
      }))
    }

    const pathspecs = input.scope.type === "all" ? ["."] : changedPaths
    const result = await runLiteralConversationChangesGitCommand(
      selected.target.changes.worktreeRootPath,
      ["reset", "-q", "--", ...pathspecs],
      { timeoutMs: 30_000, mutation: true }
    )
    if (result.status === "error") {
      return unstageConversationChangesResultSchema.parse({
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: selected.target.changes.worktreeId,
          worktreeRootPath: selected.target.changes.worktreeRootPath,
          command: "git reset",
          message: "Could not unstage conversation changes",
          cause: result.error
        })
      })
    }

    return unstageConversationChangesResultSchema.parse(mutationSuccessIdentity({
      ...input,
      worktreeId: selected.target.changes.worktreeId,
      changedPaths
    }))
  }

  const readCurrentUntrackedDirectoryMembership = async (
    worktreeRootPath: string,
    filePath: string
  ): Promise<{ status: "ok"; isMember: boolean } | { status: "error"; error: AppError }> => {
    const status = await runConversationChangesGitCommand(worktreeRootPath, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=normal",
      "--"
    ])
    if (status.status === "error") {
      return status
    }
    const parsed = parseGitPorcelainStatus(status.stdout)
    if (parsed.status === "error") {
      return {
        status: "error",
        error: buildAppError("GIT_STATUS_PARSE_FAILED", "git status returned output TeamCow could not parse", parsed.invalidRecord, {
          domain: "git"
        })
      }
    }
    return {
      status: "ok",
      isMember: parsed.files.some((file) =>
        file.indexStatus === "?" &&
        file.worktreeStatus === "?" &&
        file.path.replace(/\/+$/, "") === filePath
      )
    }
  }

  const selectDiscardTargets = async (
    input: DiscardConversationChangesInput
  ): Promise<{ status: "ok"; target: ConversationChangesMutationTarget } | { status: "error"; error: AppError }> => {
    const selected = await selectConversationChangesMutationTargets({
      ...input,
      area: "unstaged",
      command: "discard conversation changes"
    })
    if (selected.status === "ok" || input.scope.type === "all") {
      return selected
    }

    const changesResult = await getConversationChanges({ conversationId: input.conversationId })
    if (changesResult.status === "error") {
      return {
        status: "error",
        error: changesMutationErrorFromRead(input.conversationId, "discard conversation changes", changesResult.error)
      }
    }
    const directoryMembership = await readCurrentUntrackedDirectoryMembership(
      changesResult.changes.worktreeRootPath,
      input.scope.filePath
    )
    if (directoryMembership.status === "error") {
      return {
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: changesResult.changes.worktreeId,
          worktreeRootPath: changesResult.changes.worktreeRootPath,
          command: "git status --untracked-files=normal",
          message: "Could not verify the untracked directory before discard",
          cause: directoryMembership.error
        })
      }
    }
    if (!directoryMembership.isMember) {
      return selected
    }

    return {
      status: "ok",
      target: {
        changes: changesResult.changes,
        files: [{
          path: input.scope.filePath,
          oldPath: null,
          status: "untracked",
          additions: 0,
          deletions: 0,
          isBinary: false
        }]
      }
    }
  }

  const sameFileSystemEntry = (before: Stats, after: Stats) =>
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.isDirectory() === after.isDirectory() &&
    before.isFile() === after.isFile() &&
    before.isSymbolicLink() === after.isSymbolicLink()

  const sameFileRevision = (before: BigIntStats, after: BigIntStats) =>
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.mode === after.mode &&
    before.size === after.size &&
    before.mtimeNs === after.mtimeNs &&
    before.ctimeNs === after.ctimeNs

  const readDiscardPathRevision = (targetPath: string) => {
    try {
      const before = lstatSync(targetPath, { bigint: true })
      const hash = createHash("sha256")
      if (before.isSymbolicLink()) {
        hash.update(readlinkSync(targetPath))
      } else if (before.isFile()) {
        const descriptor = openSync(targetPath, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          const chunk = Buffer.alloc(64 * 1024)
          let position = 0
          for (;;) {
            const bytesRead = readSync(descriptor, chunk, 0, chunk.length, position)
            if (bytesRead === 0) break
            hash.update(chunk.subarray(0, bytesRead))
            position += bytesRead
          }
          const afterRead = fstatSync(descriptor, { bigint: true })
          if (!sameFileRevision(before, afterRead)) {
            throw new Error(`Tracked file changed while its discard revision was read: ${targetPath}`)
          }
        } finally {
          closeSync(descriptor)
        }
      } else {
        hash.update(before.isDirectory() ? "directory" : "other")
      }
      const after = lstatSync(targetPath, { bigint: true })
      if (!sameFileRevision(before, after)) {
        throw new Error(`Tracked path changed while its discard revision was read: ${targetPath}`)
      }
      return [before.dev, before.ino, before.mode, before.size, before.mtimeNs, before.ctimeNs, hash.digest("hex")].join(":")
    } catch (err) {
      const nodeError = err as NodeJS.ErrnoException
      if (nodeError.code === "ENOENT") return "missing"
      throw err
    }
  }

  const readTrackedDiscardRevision = (worktreeRootPath: string, file: ConversationChangeFile) =>
    uniqueConversationChangePaths([file])
      .map((filePath) => `${filePath}\0${readDiscardPathRevision(resolve(worktreeRootPath, filePath))}`)
      .join("\n")

  const scanUntrackedDirectory = (worktreeRootPath: string, directoryPath: string) => {
    const maximumDepth = 64
    const maximumEntries = 10_000
    const maximumPathBytes = 1024 * 1024
    const signatures: string[] = []
    const leafPaths: string[] = []
    const emptyDirectoryPaths: string[] = []
    const manifest: NativeConversationChangeRemoveInput["manifest"] = []
    let entryCount = 0
    let pathBytes = 0
    const visit = (currentDirectoryPath: string, depth: number) => {
      if (depth > maximumDepth) {
        throw new Error(`Untracked directory exceeds the ${maximumDepth}-level safety limit`)
      }
      const entries = readdirSync(currentDirectoryPath, { withFileTypes: true })
      if (entries.length === 0 && currentDirectoryPath !== directoryPath) {
        emptyDirectoryPaths.push(relative(directoryPath, currentDirectoryPath).split(sep).join("/"))
      }
      for (const entry of entries) {
        const entryPath = join(currentDirectoryPath, entry.name)
        const stats = lstatSync(entryPath, { bigint: true })
        const worktreeRelativePath = relative(worktreeRootPath, entryPath).split(sep).join("/")
        const targetRelativePath = relative(directoryPath, entryPath).split(sep).join("/")
        entryCount += 1
        pathBytes += Buffer.byteLength(targetRelativePath, "utf8")
        if (entryCount > maximumEntries || pathBytes > maximumPathBytes) {
          throw new Error("Untracked directory exceeds the safe entry or path-size budget")
        }
        const kind = stats.isSymbolicLink()
          ? "symlink" as const
          : stats.isDirectory()
            ? "directory" as const
            : stats.isFile()
              ? "file" as const
              : "other" as const
        signatures.push([
          targetRelativePath,
          kind,
          stats.dev,
          stats.ino,
          stats.mode,
          stats.size,
          stats.mtimeNs,
          stats.ctimeNs
        ].join("\0"))
        manifest.push({
          path: targetRelativePath,
          kind,
          dev: String(stats.dev),
          ino: String(stats.ino),
          mode: String(stats.mode),
          size: String(stats.size),
          mtimeNs: String(stats.mtimeNs),
          ctimeNs: String(stats.ctimeNs)
        })
        if (stats.isDirectory() && !stats.isSymbolicLink()) {
          visit(entryPath, depth + 1)
        } else {
          leafPaths.push(worktreeRelativePath)
        }
      }
    }

    visit(directoryPath, 0)
    signatures.sort()
    leafPaths.sort()
    manifest.sort((left, right) => left.path.localeCompare(right.path))
    return { signature: signatures.join("\n"), leafPaths, emptyDirectoryPaths, manifest }
  }

  const verifyUntrackedDirectoryContents = async (input: {
    conversationId: string
    changes: ConversationChangesSnapshot
    filePath: string
    targetPath: string
  }): Promise<{
    status: "ok"
    signature: string
    manifest: NativeConversationChangeRemoveInput["manifest"]
  } | { status: "error"; error: AppError }> => {
    let scanned: ReturnType<typeof scanUntrackedDirectory>
    try {
      scanned = scanUntrackedDirectory(input.changes.worktreeRootPath, input.targetPath)
    } catch (err) {
      return {
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: input.changes.worktreeId,
          worktreeRootPath: input.changes.worktreeRootPath,
          command: "scan untracked directory",
          message: `Could not inspect untracked directory contents before discard: ${input.filePath}`,
          cause: err
        })
      }
    }

    const listed = await runLiteralConversationChangesGitCommand(input.changes.worktreeRootPath, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      input.filePath
    ])
    if (listed.status === "error") {
      return {
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: input.changes.worktreeId,
          worktreeRootPath: input.changes.worktreeRootPath,
          command: "git ls-files --others",
          message: `Could not verify untracked directory contents before discard: ${input.filePath}`,
          cause: listed.error
        })
      }
    }

    const listedPaths = listed.stdout.split("\0").filter(Boolean).sort()
    if (
      scanned.emptyDirectoryPaths.length > 0 ||
      listedPaths.length !== scanned.leafPaths.length ||
      listedPaths.some((path, index) => path !== scanned.leafPaths[index])
    ) {
      return {
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: input.changes.worktreeId,
          worktreeRootPath: input.changes.worktreeRootPath,
          command: "verify untracked directory contents",
          message: `Untracked directory contains empty, ignored, nested-repository, or otherwise hidden content: ${input.filePath}`
        })
      }
    }

    return { status: "ok", signature: scanned.signature, manifest: scanned.manifest }
  }

  type DiscardUntrackedConversationChangeOutcome =
    | { status: "ok" }
    | { status: "error"; error: AppError; didMutate: boolean }

  const discardUntrackedFailure = (error: AppError, didMutate = false): DiscardUntrackedConversationChangeOutcome => ({
    status: "error",
    error,
    didMutate
  })

  const discardUntrackedConversationChange = async (input: {
    conversationId: string
    changes: ConversationChangesSnapshot
    file: ConversationChangeFile
  }): Promise<DiscardUntrackedConversationChangeOutcome> => {
    const { changes, file } = input
    const targetPath = resolve(changes.worktreeRootPath, file.path)
    if (targetPath === changes.worktreeRootPath || !isPathInsideRoot(changes.worktreeRootPath, targetPath)) {
      return discardUntrackedFailure(buildChangesGitError({
        code: "GIT_CHANGE_OPERATION_FAILED",
        conversationId: input.conversationId,
        worktreeId: changes.worktreeId,
        worktreeRootPath: changes.worktreeRootPath,
        command: "discard untracked entry",
        message: `Untracked discard target is outside the conversation worktree: ${file.path}`
      }))
    }

    let verifiedParentPath: string
    let verifiedParentStats: Stats
    let verifiedStats: Stats
    let verifiedBigIntStats: BigIntStats
    try {
      verifiedParentPath = realpathSync(dirname(targetPath))
      if (!isPathInsideRoot(changes.worktreeRootPath, verifiedParentPath)) {
        throw new Error(`Untracked discard parent resolved outside the worktree: ${file.path}`)
      }
      verifiedParentStats = lstatSync(verifiedParentPath)
      if (!verifiedParentStats.isDirectory()) {
        throw new Error(`Untracked discard parent is not a directory: ${file.path}`)
      }
      verifiedStats = lstatSync(targetPath)
      verifiedBigIntStats = lstatSync(targetPath, { bigint: true })
      if (!verifiedStats.isSymbolicLink()) {
        const canonicalTarget = realpathSync(targetPath)
        if (!isPathInsideRoot(changes.worktreeRootPath, canonicalTarget)) {
          throw new Error(`Untracked discard target resolved outside the worktree: ${file.path}`)
        }
      }
    } catch (err) {
      return discardUntrackedFailure(buildChangesGitError({
        code: "GIT_CHANGE_OPERATION_FAILED",
        conversationId: input.conversationId,
        worktreeId: changes.worktreeId,
        worktreeRootPath: changes.worktreeRootPath,
        command: "lstat untracked entry",
        message: `Could not safely inspect untracked discard target: ${file.path}`,
        cause: err
      }))
    }

    let verifiedDirectorySignature: string | null = null
    let verifiedDirectoryManifest: NativeConversationChangeRemoveInput["manifest"] = []
    if (verifiedStats.isDirectory()) {
      const membership = await readCurrentUntrackedDirectoryMembership(changes.worktreeRootPath, file.path)
      if (membership.status === "error" || !membership.isMember) {
        return discardUntrackedFailure(buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: changes.worktreeId,
          worktreeRootPath: changes.worktreeRootPath,
          command: "git status --untracked-files=normal",
          message: `Untracked directory membership changed before discard: ${file.path}`,
          cause: membership.status === "error" ? membership.error : undefined
        }))
      }
      const contents = await verifyUntrackedDirectoryContents({
        conversationId: input.conversationId,
        changes,
        filePath: file.path,
        targetPath
      })
      if (contents.status === "error") {
        return discardUntrackedFailure(contents.error)
      }
      verifiedDirectorySignature = contents.signature
      verifiedDirectoryManifest = contents.manifest
    } else {
      const freshChanges = await getConversationChanges({ conversationId: input.conversationId })
      const isStillUntracked = freshChanges.status === "ok" && freshChanges.changes.unstaged.some((current) =>
        current.path === file.path && current.status === "untracked"
      )
      if (!isStillUntracked) {
        return discardUntrackedFailure(buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: changes.worktreeId,
          worktreeRootPath: changes.worktreeRootPath,
          command: "refresh untracked entry",
          message: `Untracked membership changed before discard: ${file.path}`,
          cause: freshChanges.status === "error" ? freshChanges.error : undefined
        }))
      }
    }

    deps.beforeDiscardConversationChange?.({
      worktreeRootPath: changes.worktreeRootPath,
      filePath: file.path,
      targetPath
    })

    try {
      const currentRootStats = lstatSync(changes.worktreeRootPath)
      const currentRootBigIntStats = lstatSync(changes.worktreeRootPath, { bigint: true })
      if (!currentRootStats.isDirectory() || currentRootStats.isSymbolicLink()) {
        throw new Error(`Conversation worktree root changed before discard: ${file.path}`)
      }
      const currentParentPath = realpathSync(dirname(targetPath))
      const currentParentStats = lstatSync(currentParentPath)
      if (
        currentParentPath !== verifiedParentPath ||
        !sameFileSystemEntry(verifiedParentStats, currentParentStats)
      ) {
        throw new Error(`Untracked discard parent changed after validation: ${file.path}`)
      }
      if (
        verifiedDirectorySignature !== null &&
        scanUntrackedDirectory(changes.worktreeRootPath, targetPath).signature !== verifiedDirectorySignature
      ) {
        throw new Error(`Untracked directory contents changed after validation: ${file.path}`)
      }
      const currentStats = lstatSync(targetPath)
      const currentBigIntStats = lstatSync(targetPath, { bigint: true })
      if (!sameFileSystemEntry(verifiedStats, currentStats)) {
        throw new Error(`Untracked discard target changed after validation: ${file.path}`)
      }
      if (
        !sameFileRevision(verifiedBigIntStats, currentBigIntStats)
      ) {
        throw new Error(`Untracked discard target content or identity changed after validation: ${file.path}`)
      }
      deps.beforeNativeConversationChangeRemove?.({
        worktreeRootPath: changes.worktreeRootPath,
        filePath: file.path,
        targetPath
      })
      const nativeRemove = (deps.conversationChangeRemover ?? removeConversationChangeWithNativeHelper)({
        conversationId: input.conversationId,
        worktreeId: changes.worktreeId,
        rootPath: changes.worktreeRootPath,
        relativeParentPath: relative(changes.worktreeRootPath, dirname(targetPath)).split(sep).join("/") || ".",
        targetBaseName: basename(targetPath),
        expectedRootDev: String(currentRootBigIntStats.dev),
        expectedRootIno: String(currentRootBigIntStats.ino),
        expectedTargetDev: String(currentBigIntStats.dev),
        expectedTargetIno: String(currentBigIntStats.ino),
        expectedTargetMode: String(currentBigIntStats.mode),
        expectedTargetSize: String(currentBigIntStats.size),
        expectedTargetMtimeNs: String(currentBigIntStats.mtimeNs),
        expectedTargetCtimeNs: String(currentBigIntStats.ctimeNs),
        manifest: verifiedDirectoryManifest
      })
      return nativeRemove.status === "error"
        ? discardUntrackedFailure(nativeRemove.error, nativeRemove.didMutate)
        : { status: "ok" }
    } catch (err) {
      return discardUntrackedFailure(buildChangesGitError({
        code: "GIT_CHANGE_OPERATION_FAILED",
        conversationId: input.conversationId,
        worktreeId: changes.worktreeId,
        worktreeRootPath: changes.worktreeRootPath,
        command: "remove untracked entry",
        message: `Could not discard untracked entry: ${file.path}`,
        cause: err
      }))
    }
  }

  type TrackedIndexMaterialization = {
    filePath: string
    indexEntry: null | {
      kind: "file" | "symlink"
      mode: number
      objectId: string
      content: Buffer
    }
  }

  const readTrackedIndexMaterialization = async (input: {
    conversationId: string
    changes: ConversationChangesSnapshot
    filePath: string
  }): Promise<{ status: "ok"; materialization: TrackedIndexMaterialization } | { status: "error"; error: AppError }> => {
    const listed = await runLiteralConversationChangesGitCommand(input.changes.worktreeRootPath, [
      "ls-files",
      "--stage",
      "-z",
      "--",
      input.filePath
    ])
    if (listed.status === "error") {
      return {
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: input.changes.worktreeId,
          worktreeRootPath: input.changes.worktreeRootPath,
          command: "git ls-files --stage",
          message: `Could not read the index entry for tracked discard: ${input.filePath}`,
          cause: listed.error
        })
      }
    }
    const records = listed.stdout.split("\0").filter(Boolean)
    if (records.length === 0) {
      return { status: "ok", materialization: { filePath: input.filePath, indexEntry: null } }
    }
    if (records.length !== 1) {
      return {
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: input.changes.worktreeId,
          worktreeRootPath: input.changes.worktreeRootPath,
          command: "parse git ls-files --stage",
          message: `Conflicted or ambiguous index entries cannot be safely discarded: ${input.filePath}`
        })
      }
    }
    const separatorIndex = records[0].indexOf("\t")
    const metadata = separatorIndex >= 0 ? records[0].slice(0, separatorIndex) : ""
    const listedPath = separatorIndex >= 0 ? records[0].slice(separatorIndex + 1) : ""
    const matched = /^([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])$/.exec(metadata)
    if (!matched || matched[3] !== "0" || listedPath !== input.filePath) {
      return {
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: input.changes.worktreeId,
          worktreeRootPath: input.changes.worktreeRootPath,
          command: "parse git ls-files --stage",
          message: `Git index entry cannot be safely materialized: ${input.filePath}`
        })
      }
    }

    const gitMode = matched[1]
    const target = gitMode === "100644"
      ? { kind: "file" as const, mode: 0o644 }
      : gitMode === "100755"
        ? { kind: "file" as const, mode: 0o755 }
        : gitMode === "120000"
          ? { kind: "symlink" as const, mode: 0o777 }
          : null
    if (!target) {
      return {
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: input.changes.worktreeId,
          worktreeRootPath: input.changes.worktreeRootPath,
          command: "materialize tracked index entry",
          message: `Git index mode ${gitMode} is not safe for tracked discard: ${input.filePath}`
        })
      }
    }
    const objectId = matched[2]
    const blob = await (deps.readGitBlob ?? readGitBlobFromHost)(input.changes.worktreeRootPath, objectId)
    if (blob.status === "error") {
      return {
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: input.changes.worktreeId,
          worktreeRootPath: input.changes.worktreeRootPath,
          command: "git cat-file blob",
          message: `Could not materialize the index content for tracked discard: ${input.filePath}`,
          cause: blob.error
        })
      }
    }
    return {
      status: "ok",
      materialization: {
        filePath: input.filePath,
        indexEntry: { ...target, objectId, content: blob.content }
      }
    }
  }

  const applyTrackedIndexMaterialization = (input: {
    conversationId: string
    changes: ConversationChangesSnapshot
    materialization: TrackedIndexMaterialization
  }): { status: "ok"; didMutate: boolean } | { status: "error"; error: AppError; didMutate: boolean } => {
    const targetPath = resolve(input.changes.worktreeRootPath, input.materialization.filePath)
    if (targetPath === input.changes.worktreeRootPath || !isPathInsideRoot(input.changes.worktreeRootPath, targetPath)) {
      return { status: "error", didMutate: false, error: buildChangesGitError({
        code: "GIT_CHANGE_OPERATION_FAILED",
        conversationId: input.conversationId,
        worktreeId: input.changes.worktreeId,
        worktreeRootPath: input.changes.worktreeRootPath,
        command: "apply tracked index entry",
        message: `Tracked discard target is outside the conversation worktree: ${input.materialization.filePath}`
      }) }
    }

    try {
      const rootStats = lstatSync(input.changes.worktreeRootPath, { bigint: true })
      if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
        throw new Error("Conversation worktree root is not a stable directory")
      }
      const currentStats = (() => {
        try {
          return lstatSync(targetPath, { bigint: true })
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
          throw err
        }
      })()

      deps.beforeNativeTrackedDiscardApply?.({
        worktreeRootPath: input.changes.worktreeRootPath,
        filePath: input.materialization.filePath,
        targetPath
      })

      if (!input.materialization.indexEntry) {
        if (!currentStats) return { status: "ok", didMutate: false }
        if (!currentStats.isFile() && !currentStats.isSymbolicLink()) {
          throw new Error(`Index-absent tracked discard refuses non-file target: ${input.materialization.filePath}`)
        }
        const removed = (deps.conversationChangeRemover ?? removeConversationChangeWithNativeHelper)({
          conversationId: input.conversationId,
          worktreeId: input.changes.worktreeId,
          rootPath: input.changes.worktreeRootPath,
          relativeParentPath: relative(input.changes.worktreeRootPath, dirname(targetPath)).split(sep).join("/") || ".",
          targetBaseName: basename(targetPath),
          expectedRootDev: String(rootStats.dev),
          expectedRootIno: String(rootStats.ino),
          expectedTargetDev: String(currentStats.dev),
          expectedTargetIno: String(currentStats.ino),
          expectedTargetMode: String(currentStats.mode),
          expectedTargetSize: String(currentStats.size),
          expectedTargetMtimeNs: String(currentStats.mtimeNs),
          expectedTargetCtimeNs: String(currentStats.ctimeNs),
          manifest: []
        })
        if (removed.status === "error") {
          return { status: "error", didMutate: removed.didMutate, error: buildChangesGitError({
            code: "GIT_CHANGE_OPERATION_FAILED",
            conversationId: input.conversationId,
            worktreeId: input.changes.worktreeId,
            worktreeRootPath: input.changes.worktreeRootPath,
            command: "remove index-absent tracked path",
            message: `Could not safely remove the index-absent tracked path: ${input.materialization.filePath}`,
            cause: removed.error
          }) }
        }
        return { status: "ok", didMutate: removed.didMutate }
      }

      let parentRealPath: string | null = null
      try {
        parentRealPath = realpathSync(dirname(targetPath))
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
      }
      if (parentRealPath && !isPathInsideRoot(input.changes.worktreeRootPath, parentRealPath)) {
        throw new Error(`Tracked discard parent resolved outside the worktree: ${input.materialization.filePath}`)
      }
      const written = (deps.conversationFileAtomicWriter ?? writeConversationFileWithNativeHelper)({
        rootPath: input.changes.worktreeRootPath,
        relativeParentPath: relative(input.changes.worktreeRootPath, dirname(targetPath)).split(sep).join("/") || ".",
        targetBaseName: basename(targetPath),
        tempName: `.teamcow-discard-${randomUUID()}`,
        content: input.materialization.indexEntry.content,
        targetKind: input.materialization.indexEntry.kind,
        targetMode: input.materialization.indexEntry.mode,
        expectedRootDev: String(rootStats.dev),
        expectedRootIno: String(rootStats.ino),
        expectedTargetDev: currentStats ? String(currentStats.dev) : "0",
        expectedTargetIno: currentStats ? String(currentStats.ino) : "0",
        expectedTargetMode: currentStats ? String(currentStats.mode) : "0",
        expectedTargetSize: currentStats ? String(currentStats.size) : "0",
        expectedTargetMtimeNs: currentStats ? String(currentStats.mtimeNs) : "0",
        expectedTargetCtimeNs: currentStats ? String(currentStats.ctimeNs) : "0",
        expectedTargetMissing: currentStats === null,
        createParentDirectories: true
      })
      if (written.status === "error") {
        return { status: "error", didMutate: written.didMutate ?? false, error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: input.changes.worktreeId,
          worktreeRootPath: input.changes.worktreeRootPath,
          command: "conditionally materialize tracked index entry",
          message: `Could not safely restore tracked worktree content: ${input.materialization.filePath}`,
          cause: written.error
        }) }
      }
      return { status: "ok", didMutate: true }
    } catch (err) {
      return { status: "error", didMutate: false, error: buildChangesGitError({
        code: "GIT_CHANGE_OPERATION_FAILED",
        conversationId: input.conversationId,
        worktreeId: input.changes.worktreeId,
        worktreeRootPath: input.changes.worktreeRootPath,
        command: "conditionally apply tracked index entry",
        message: `Could not safely apply tracked discard: ${input.materialization.filePath}`,
        cause: err
      }) }
    }
  }

  const discardTrackedConversationChange = async (input: {
    conversationId: string
    changes: ConversationChangesSnapshot
    file: ConversationChangeFile
    onApplied: (filePath: string) => void
  }): Promise<AppError | null> => {
    let verifiedRevision: string
    try {
      verifiedRevision = readTrackedDiscardRevision(input.changes.worktreeRootPath, input.file)
    } catch (err) {
      return buildChangesGitError({
        code: "GIT_CHANGE_OPERATION_FAILED",
        conversationId: input.conversationId,
        worktreeId: input.changes.worktreeId,
        worktreeRootPath: input.changes.worktreeRootPath,
        command: "inspect tracked entry",
        message: `Could not inspect tracked content before discard: ${input.file.path}`,
        cause: err
      })
    }
    deps.beforeDiscardConversationChange?.({
      worktreeRootPath: input.changes.worktreeRootPath,
      filePath: input.file.path,
      targetPath: resolve(input.changes.worktreeRootPath, input.file.path)
    })
    const freshChanges = await getConversationChanges({ conversationId: input.conversationId })
    const freshFile = freshChanges.status === "ok"
      ? freshChanges.changes.unstaged.find((file) => file.path === input.file.path)
      : null
    if (!freshFile || freshFile.status === "untracked" || freshFile.status === "conflicted") {
      return buildChangesGitError({
        code: "GIT_CHANGE_OPERATION_FAILED",
        conversationId: input.conversationId,
        worktreeId: input.changes.worktreeId,
        worktreeRootPath: input.changes.worktreeRootPath,
        command: "refresh tracked entry",
        message: `Tracked membership changed before discard: ${input.file.path}`,
        cause: freshChanges.status === "error" ? freshChanges.error : undefined
      })
    }

    try {
      if (readTrackedDiscardRevision(input.changes.worktreeRootPath, freshFile) !== verifiedRevision) {
        throw new Error(`Tracked content changed after discard confirmation: ${input.file.path}`)
      }
    } catch (err) {
      return buildChangesGitError({
        code: "GIT_CHANGE_OPERATION_FAILED",
        conversationId: input.conversationId,
        worktreeId: input.changes.worktreeId,
        worktreeRootPath: input.changes.worktreeRootPath,
        command: "verify tracked entry",
        message: `Tracked content changed before discard: ${input.file.path}`,
        cause: err
      })
    }

    const materializations: TrackedIndexMaterialization[] = []
    for (const filePath of uniqueConversationChangePaths([freshFile])) {
      const read = await readTrackedIndexMaterialization({
        conversationId: input.conversationId,
        changes: input.changes,
        filePath
      })
      if (read.status === "error") return read.error
      materializations.push(read.materialization)
    }
    for (const materialization of materializations) {
      const applied = applyTrackedIndexMaterialization({
        conversationId: input.conversationId,
        changes: input.changes,
        materialization
      })
      if (applied.didMutate) input.onApplied(materialization.filePath)
      if (applied.status === "error") return applied.error
    }
    return null
  }

  const discardConversationChanges = async (
    rawInput: DiscardConversationChangesInput
  ): Promise<DiscardConversationChangesResult> => {
    const input = discardConversationChangesInputSchema.parse(rawInput)
    const selected = await selectDiscardTargets(input)
    if (selected.status === "error") {
      return discardConversationChangesResultSchema.parse({ status: "error", error: selected.error })
    }
    if (selected.target.changes.revision !== input.expectedRevision) {
      return discardConversationChangesResultSchema.parse({
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: selected.target.changes.worktreeId,
          worktreeRootPath: selected.target.changes.worktreeRootPath,
          command: "verify discard revision",
          message: "Conversation changes changed after discard confirmation"
        })
      })
    }

    const conflicted = selected.target.files.find((file) => file.status === "conflicted")
    if (conflicted) {
      return discardConversationChangesResultSchema.parse({
        status: "error",
        error: buildChangesGitError({
          code: "GIT_CHANGE_OPERATION_FAILED",
          conversationId: input.conversationId,
          worktreeId: selected.target.changes.worktreeId,
          worktreeRootPath: selected.target.changes.worktreeRootPath,
          command: "discard conversation changes",
          message: `Conflicted changes must be resolved before discard: ${conflicted.path}`
        })
      })
    }

    const changedPaths: string[] = []
    const failures: Array<{ filePath: string; error: AppError }> = []
    const recordChangedPaths = (file: ConversationChangeFile) => {
      for (const changedPath of uniqueConversationChangePaths([file])) {
        if (!changedPaths.includes(changedPath)) {
          changedPaths.push(changedPath)
        }
      }
    }
    for (const file of selected.target.files) {
      if (file.status === "untracked") {
        const outcome = await discardUntrackedConversationChange({
          conversationId: input.conversationId,
          changes: selected.target.changes,
          file
        })
        if (outcome.status === "error") {
          if (outcome.didMutate) {
            recordChangedPaths(file)
          }
          failures.push({ filePath: file.path, error: outcome.error })
        } else {
          recordChangedPaths(file)
        }
      } else {
        const appliedPaths: string[] = []
        const error = await discardTrackedConversationChange({
          conversationId: input.conversationId,
          changes: selected.target.changes,
          file,
          onApplied: (filePath) => appliedPaths.push(filePath)
        })
        if (error) {
          for (const appliedPath of appliedPaths) {
            if (!changedPaths.includes(appliedPath)) changedPaths.push(appliedPath)
          }
          failures.push({ filePath: file.path, error })
        } else {
          recordChangedPaths(file)
        }
      }
    }

    if (failures.length > 0 && changedPaths.length === 0) {
      return discardConversationChangesResultSchema.parse({ status: "error", error: failures[0].error })
    }
    if (failures.length > 0) {
      return discardConversationChangesResultSchema.parse({
        status: "partial",
        conversationId: input.conversationId,
        worktreeId: selected.target.changes.worktreeId,
        scope: input.scope,
        changedPaths,
        failures
      })
    }
    return discardConversationChangesResultSchema.parse(mutationSuccessIdentity({
      ...input,
      worktreeId: selected.target.changes.worktreeId,
      changedPaths
    }))
  }

  const commitConversationChanges = async (
    rawInput: CommitConversationChangesInput
  ): Promise<CommitConversationChangesResult> => {
    const input = commitConversationChangesInputSchema.parse(rawInput)
    const changesResult = await getConversationChanges({ conversationId: input.conversationId })
    if (changesResult.status === "error") {
      return commitConversationChangesResultSchema.parse({
        status: "error",
        error: buildChangesGitError({
          code: "GIT_COMMIT_FAILED",
          conversationId: input.conversationId,
          worktreeId: changesResult.error.context?.worktreeId,
          worktreeRootPath: changesResult.error.context?.worktreeRootPath,
          command: "refresh staged changes",
          message: "Could not refresh staged changes before commit",
          cause: changesResult.error
        })
      })
    }

    if (changesResult.changes.staged.length === 0) {
      return commitConversationChangesResultSchema.parse({
        status: "error",
        error: buildChangesGitError({
          code: "GIT_COMMIT_EMPTY_INDEX",
          conversationId: input.conversationId,
          worktreeId: changesResult.changes.worktreeId,
          worktreeRootPath: changesResult.changes.worktreeRootPath,
          command: "git commit",
          message: "Cannot commit because the conversation worktree index is empty"
        })
      })
    }

    const beforeHead = await runConversationChangesGitCommand(
      changesResult.changes.worktreeRootPath,
      ["rev-parse", "--verify", "HEAD"]
    )
    let previousCommitHash: string | null
    if (beforeHead.status === "ok" && beforeHead.stdout.trim()) {
      previousCommitHash = beforeHead.stdout.trim()
    } else {
      const branchStatus = await runConversationChangesGitCommand(
        changesResult.changes.worktreeRootPath,
        ["status", "--porcelain=v2", "--branch", "--untracked-files=no"]
      )
      const isProvenUnborn = branchStatus.status === "ok" && branchStatus.stdout
        .split("\n")
        .some((line) => line === "# branch.oid (initial)")
      if (!isProvenUnborn) {
        return commitConversationChangesResultSchema.parse({
          status: "error",
          error: buildChangesGitError({
            code: "GIT_COMMIT_FAILED",
            conversationId: input.conversationId,
            worktreeId: changesResult.changes.worktreeId,
            worktreeRootPath: changesResult.changes.worktreeRootPath,
            command: "git rev-parse --verify HEAD",
            message: "Could not establish the current HEAD before commit",
            cause: beforeHead.status === "error" ? beforeHead.error : undefined
          })
        })
      }
      previousCommitHash = null
    }
    const commit = await runConversationChangesGitCommand(
      changesResult.changes.worktreeRootPath,
      ["commit", "--no-quiet", "-m", input.message],
      { timeoutMs: 120_000, mutation: true }
    )
    const afterHead = await runConversationChangesGitCommand(
      changesResult.changes.worktreeRootPath,
      ["rev-parse", "--verify", "HEAD"]
    )
    const commitHash = afterHead.status === "ok" ? afterHead.stdout.trim() : null
    const didCreateCommit = Boolean(commitHash && commitHash !== previousCommitHash)
    if (commit.status === "error" && !didCreateCommit) {
      const causeText = `${commit.error.message}\n${commit.error.suggestion ?? ""}`
      const code = /user\.name|user\.email|author identity unknown|unable to auto-detect email/i.test(causeText)
        ? "GIT_COMMIT_IDENTITY_INVALID" as const
        : /hook|rejected|declined|pre-commit|commit-msg/i.test(causeText)
          ? "GIT_COMMIT_REJECTED" as const
          : "GIT_COMMIT_FAILED" as const
      return commitConversationChangesResultSchema.parse({
        status: "error",
        error: buildChangesGitError({
          code,
          conversationId: input.conversationId,
          worktreeId: changesResult.changes.worktreeId,
          worktreeRootPath: changesResult.changes.worktreeRootPath,
          command: "git commit",
          message: "Could not commit the existing conversation worktree index",
          cause: commit.error
        })
      })
    }

    if (!commitHash) {
      return commitConversationChangesResultSchema.parse({
        status: "error",
        error: buildChangesGitError({
          code: "GIT_COMMIT_FAILED",
          conversationId: input.conversationId,
          worktreeId: changesResult.changes.worktreeId,
          worktreeRootPath: changesResult.changes.worktreeRootPath,
          command: "git commit",
          message: "Git commit command completed but HEAD could not be resolved"
        })
      })
    }
    const shortCommitHash = commitHash.slice(0, 12)

    return commitConversationChangesResultSchema.parse({
      status: "committed",
      conversationId: input.conversationId,
      worktreeId: changesResult.changes.worktreeId,
      commitHash,
      shortCommitHash
    })
  }

  const pathErrorFor = (err: unknown, fallbackCode: AppError["code"], message: string) => {
    const nodeError = err as NodeJS.ErrnoException
    if (nodeError?.code === "ENOENT" || nodeError?.code === "ELOOP") {
      return buildAppError("PATH_NOT_FOUND", message, nodeError.message)
    }
    if (nodeError?.code === "EACCES" || nodeError?.code === "EPERM") {
      return buildAppError("PATH_NOT_READABLE", message, nodeError.message)
    }
    if (nodeError?.code === "ENOTDIR") {
      return buildAppError("NOT_A_DIRECTORY", message, nodeError.message)
    }
    return buildAppError(fallbackCode, message, err instanceof Error ? err.message : String(err))
  }

  const isPathInsideRoot = (rootPath: string, targetPath: string) => {
    const relativePath = relative(rootPath, targetPath)
    return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  }

  const binaryProbeBytes = 8192
  const conversationFileAtomicWriter = deps.conversationFileAtomicWriter ?? writeConversationFileWithNativeHelper

  const normalizeConversationFilePath = (filePath: string) => filePath.split(/[\\/]+/).filter(Boolean).join("/")

  const readBigIntStats = (reader: () => BigIntStats): BigIntStats | null => {
    try {
      return reader()
    } catch {
      return null
    }
  }

  const buildConversationFileRevisionStats = (
    stats: Stats,
    bigintStats: BigIntStats | null
  ): ConversationFileRevisionStats => ({
    birthtimeMs: stats.birthtimeMs,
    birthtimeNs: bigintStats?.birthtimeNs ?? null,
    ctimeMs: stats.ctimeMs,
    ctimeNs: bigintStats?.ctimeNs ?? null,
    dev: stats.dev,
    ino: stats.ino,
    isDirectory: stats.isDirectory.bind(stats),
    isFile: stats.isFile.bind(stats),
    mtime: stats.mtime,
    mtimeMs: stats.mtimeMs,
    mtimeNs: bigintStats?.mtimeNs ?? null,
    size: stats.size
  })

  const readConversationFileRevisionStats = (absolutePath: string, statReader: typeof statSync = statSync) =>
    buildConversationFileRevisionStats(
      statReader(absolutePath),
      readBigIntStats(() => statReader(absolutePath, { bigint: true }))
    )

  const readConversationFileRevisionStatsFromFd = (fd: number) =>
    buildConversationFileRevisionStats(
      fstatSync(fd),
      readBigIntStats(() => fstatSync(fd, { bigint: true }))
    )

  const doStatsReferenceSameFile = (
    left: Pick<ConversationFileRevisionStats, "dev" | "ino">,
    right: Pick<ConversationFileRevisionStats, "dev" | "ino">
  ) => left.dev === right.dev && left.ino === right.ino

  const buildConversationFileOutsideWorktreeError = (input: {
    conversationId: string
    worktreeId: string
    worktreeRootPath: string
    filePath: string
    message: string
  }) =>
    buildAppError("FILE_PATH_OUTSIDE_WORKTREE", input.message, null, {
      domain: "filesystem",
      context: {
        conversationId: input.conversationId,
        worktreeId: input.worktreeId,
        worktreeRootPath: input.worktreeRootPath,
        filePath: input.filePath
      }
    })

  const formatRevisionValue = (value: bigint | number | string | null | undefined) =>
    value === null || value === undefined ? "na" : typeof value === "bigint" ? value.toString() : String(value)

  const buildConversationFileMetadata = (input: {
    conversationId: string
    worktreeId: string
    filePath: string
    absolutePath: string
    stats: ConversationFileRevisionStats
  }): ConversationFileMetadata => ({
    conversationId: input.conversationId,
    worktreeId: input.worktreeId,
    filePath: input.filePath,
    absolutePath: input.absolutePath,
    byteLength: input.stats.size,
    modifiedAt: input.stats.mtime.toISOString(),
    revision: buildFileRevision(input.absolutePath, input.stats)
  })

  const buildFileRevision = (realPath: string, stats: ConversationFileRevisionStats) =>
    [
      "mtimeNs",
      formatRevisionValue(stats.mtimeNs),
      "mtimeMs",
      formatRevisionValue(stats.mtimeMs),
      "ctimeNs",
      formatRevisionValue(stats.ctimeNs),
      "ctimeMs",
      formatRevisionValue(stats.ctimeMs),
      "birthtimeNs",
      formatRevisionValue(stats.birthtimeNs),
      "birthtimeMs",
      formatRevisionValue(stats.birthtimeMs),
      "size",
      formatRevisionValue(stats.size),
      "dev",
      formatRevisionValue(stats.dev),
      "ino",
      formatRevisionValue(stats.ino ?? 0),
      "path",
      realPath
    ].join(":")

  const isBinaryBuffer = (buffer: Buffer) => {
    const limit = Math.min(buffer.length, binaryProbeBytes)
    for (let index = 0; index < limit; index += 1) {
      if (buffer[index] === 0) {
        return true
      }
    }
    return false
  }

  const writeConversationFileAtomically = (input: {
    conversationId: string
    worktreeId: string
    worktreeRootPath: string
    filePath: string
    writeTargetPath: string
    content: string
    targetMode: number
    expectedTargetDev: string
    expectedTargetIno: string
    expectedTargetMode: string
    expectedTargetSize: string
    expectedTargetMtimeNs: string
    expectedTargetCtimeNs: string
  }) => {
    const parentPath = dirname(input.writeTargetPath)
    let initialParentRealPath: string
    try {
      initialParentRealPath = realpathSync(parentPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "FILE_WRITE_FAILED", `File parent directory could not be resolved before saving: ${parentPath}`)
      }
    }

    if (!isPathInsideRoot(input.worktreeRootPath, initialParentRealPath)) {
      return {
        status: "error" as const,
        error: buildConversationFileOutsideWorktreeError({
          conversationId: input.conversationId,
          worktreeId: input.worktreeId,
          worktreeRootPath: input.worktreeRootPath,
          filePath: input.filePath,
          message: `File parent directory resolved outside worktree while saving: ${input.filePath}`
        })
      }
    }

    let currentParentRealPath: string
    try {
      currentParentRealPath = realpathSync(parentPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "FILE_WRITE_FAILED", `File parent directory could not be resolved while saving: ${parentPath}`)
      }
    }

    if (!isPathInsideRoot(input.worktreeRootPath, currentParentRealPath)) {
      return {
        status: "error" as const,
        error: buildConversationFileOutsideWorktreeError({
          conversationId: input.conversationId,
          worktreeId: input.worktreeId,
          worktreeRootPath: input.worktreeRootPath,
          filePath: input.filePath,
          message: `File parent directory resolved outside worktree while saving: ${input.filePath}`
        })
      }
    }

    if (currentParentRealPath !== initialParentRealPath) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_WRITE_FAILED", `File parent directory changed while saving: ${input.filePath}`, null, {
          domain: "filesystem",
          context: {
            conversationId: input.conversationId,
            worktreeId: input.worktreeId,
            worktreeRootPath: input.worktreeRootPath,
            filePath: input.filePath
          }
        })
      }
    }

    let currentRealTargetPath: string
    try {
      currentRealTargetPath = realpathSync(input.writeTargetPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "FILE_WRITE_FAILED", `File target path could not be resolved while saving: ${input.writeTargetPath}`)
      }
    }

    if (!isPathInsideRoot(input.worktreeRootPath, currentRealTargetPath)) {
      return {
        status: "error" as const,
        error: buildConversationFileOutsideWorktreeError({
          conversationId: input.conversationId,
          worktreeId: input.worktreeId,
          worktreeRootPath: input.worktreeRootPath,
          filePath: input.filePath,
          message: `File target resolved outside worktree while saving: ${input.filePath}`
        })
      }
    }

    let rootStats: Stats
    let rootBigintStats: BigIntStats | null
    try {
      rootStats = statSync(input.worktreeRootPath)
      rootBigintStats = readBigIntStats(() => statSync(input.worktreeRootPath, { bigint: true }))
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "WORKTREE_NOT_FOUND", `Worktree root could not be inspected before saving: ${input.worktreeRootPath}`)
      }
    }

    deps.beforeConversationFileAtomicWrite?.()

    const nativeWrite = conversationFileAtomicWriter({
      rootPath: input.worktreeRootPath,
      relativeParentPath: dirname(input.filePath),
      targetBaseName: basename(input.writeTargetPath),
      tempName: `.teamcow-write-${randomUUID()}${extname(input.writeTargetPath)}`,
      content: input.content,
      targetMode: input.targetMode,
      expectedRootDev: rootBigintStats?.dev.toString() ?? String(rootStats.dev),
      expectedRootIno: rootBigintStats?.ino.toString() ?? String(rootStats.ino),
      expectedTargetDev: input.expectedTargetDev,
      expectedTargetIno: input.expectedTargetIno,
      expectedTargetMode: input.expectedTargetMode,
      expectedTargetSize: input.expectedTargetSize,
      expectedTargetMtimeNs: input.expectedTargetMtimeNs,
      expectedTargetCtimeNs: input.expectedTargetCtimeNs
    })

    if (nativeWrite.status === "error") {
      return nativeWrite
    }

    let nextParentRealPath: string
    try {
      nextParentRealPath = realpathSync(parentPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "FILE_WRITE_FAILED", `File parent directory could not be resolved after saving: ${parentPath}`)
      }
    }

    if (!isPathInsideRoot(input.worktreeRootPath, nextParentRealPath)) {
      return {
        status: "error" as const,
        error: buildConversationFileOutsideWorktreeError({
          conversationId: input.conversationId,
          worktreeId: input.worktreeId,
          worktreeRootPath: input.worktreeRootPath,
          filePath: input.filePath,
          message: `File parent directory resolved outside worktree after saving: ${input.filePath}`
        })
      }
    }

    let nextRealTargetPath: string
    try {
      nextRealTargetPath = realpathSync(input.writeTargetPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "FILE_WRITE_FAILED", `File target path could not be resolved after saving: ${input.writeTargetPath}`)
      }
    }

    if (!isPathInsideRoot(input.worktreeRootPath, nextRealTargetPath)) {
      return {
        status: "error" as const,
        error: buildConversationFileOutsideWorktreeError({
          conversationId: input.conversationId,
          worktreeId: input.worktreeId,
          worktreeRootPath: input.worktreeRootPath,
          filePath: input.filePath,
          message: `File target resolved outside worktree while saving: ${input.filePath}`
        })
      }
    }

    return {
      status: "ok" as const,
      file: {
        absolutePath: nextRealTargetPath,
        stats: readConversationFileRevisionStats(nextRealTargetPath)
      }
    }
  }

  const readProjectFilesForWorktree = async (worktree: WorktreeRow, directoryPath?: string) => {
    let worktreeRootPath: string
    try {
      worktreeRootPath = await realpathAsync(worktree.rootPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: worktreeRootPathErrorFor(err, `Worktree path could not be resolved: ${worktree.rootPath}`)
      }
    }

    let rootStats
    try {
      rootStats = await statAsync(worktreeRootPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: worktreeRootPathErrorFor(err, `Worktree path could not be inspected: ${worktreeRootPath}`)
      }
    }

    if (!rootStats.isDirectory()) {
      return {
        status: "error" as const,
        error: buildAppError("NOT_A_DIRECTORY", `Worktree path is not a directory: ${worktreeRootPath}`)
      }
    }

    try {
      await accessAsync(worktreeRootPath, constants.R_OK)
      const scanned = await scanProjectFiles(worktreeRootPath, directoryPath)
      if (scanned.status === "error") {
        return {
          status: "error" as const,
          error: scanned.error
        }
      }
      return {
        status: "ok" as const,
        worktreeRootPath,
        scanned: {
          directoryPath: scanned.directoryPath,
          files: scanned.files,
          fileCount: scanned.fileCount,
          directoryCount: scanned.directoryCount,
          truncated: scanned.truncated
        }
      }
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "PATH_NOT_READABLE", `Project files could not be read: ${worktreeRootPath}`)
      }
    }
  }

  const getConversationProjectFiles = async (conversationId: string, directoryPath?: string): Promise<GetConversationProjectFilesResult> => {
    const conversation = getConversationById(conversationId)
    if (!conversation) {
      return getConversationProjectFilesResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${conversationId}`)
      })
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return getConversationProjectFilesResultSchema.parse({
        status: "error",
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${conversation.worktreeId} was not found`)
      })
    }

    const readResult = await readProjectFilesForWorktree(worktree, directoryPath)
    if (readResult.status === "error") {
      return getConversationProjectFilesResultSchema.parse({
        status: "error",
        error: readResult.error
      })
    }

    return getConversationProjectFilesResultSchema.parse({
      status: "ok",
      projectFiles: conversationProjectFilesSchema.parse({
        conversationId,
        worktreeId: worktree.id,
        worktreeRootPath: readResult.worktreeRootPath,
        ...readResult.scanned,
        checkedAt: now()
      })
    })
  }

  const getProjectWorktreeFiles = async (projectId: string, worktreeId: string, directoryPath?: string): Promise<GetProjectWorktreeFilesResult> => {
    const project = getProjectById(projectId)
    if (!project) {
      return getProjectWorktreeFilesResultSchema.parse({
        status: "error",
        error: buildAppError("PROJECT_NOT_FOUND", `Project ${projectId} was not found`)
      })
    }

    const worktree = getWorktreeById(worktreeId)
    if (!worktree || worktree.projectId !== project.id) {
      return getProjectWorktreeFilesResultSchema.parse({
        status: "error",
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${worktreeId} was not found`)
      })
    }

    const readResult = await readProjectFilesForWorktree(worktree, directoryPath)
    if (readResult.status === "error") {
      return getProjectWorktreeFilesResultSchema.parse({
        status: "error",
        error: readResult.error
      })
    }

    return getProjectWorktreeFilesResultSchema.parse({
      status: "ok",
      projectFiles: {
        projectId,
        worktreeId: worktree.id,
        worktreeRootPath: readResult.worktreeRootPath,
        ...readResult.scanned,
        checkedAt: now()
      }
    })
  }

  const resolveConversationFileTarget = (conversationId: string, filePath: string) => {
    const conversation = getConversationById(conversationId)
    if (!conversation) {
      return {
        status: "error" as const,
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${conversationId}`, null, {
          domain: "filesystem",
          context: { conversationId }
        })
      }
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return {
        status: "error" as const,
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${conversation.worktreeId} was not found`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: conversation.worktreeId }
        })
      }
    }

    let worktreeRootPath: string
    try {
      worktreeRootPath = realpathSync(worktree.rootPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "WORKTREE_NOT_FOUND", `Worktree path could not be resolved: ${worktree.rootPath}`)
      }
    }

    if (isAbsolute(filePath)) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target must be relative: ${filePath}`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
        })
      }
    }

    const normalizedFilePath = normalizeConversationFilePath(filePath)
    const targetPath = resolve(worktreeRootPath, normalizedFilePath)
    if (!isPathInsideRoot(worktreeRootPath, targetPath)) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target is outside worktree: ${filePath}`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
        })
      }
    }

    if (!existsSync(targetPath)) {
      return {
        status: "not-found" as const,
        conversation,
        worktree,
        filePath: normalizedFilePath
      }
    }

    let realTargetPath: string
    try {
      realTargetPath = realpathSync(targetPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "PATH_NOT_FOUND", `File target path could not be resolved: ${targetPath}`)
      }
    }

    if (!isPathInsideRoot(worktreeRootPath, realTargetPath)) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target resolved outside worktree: ${filePath}`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
        })
      }
    }

    let stats: ConversationFileRevisionStats
    try {
      stats = readConversationFileRevisionStats(realTargetPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "PATH_NOT_FOUND", `File target path could not be inspected: ${realTargetPath}`)
      }
    }

    if (stats.isDirectory()) {
      return {
        status: "is-directory" as const,
        conversation,
        worktree,
        filePath: normalizedFilePath
      }
    }

    if (!stats.isFile()) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_NOT_READABLE", `File target is not a regular file: ${realTargetPath}`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
        })
      }
    }

    const file = buildConversationFileMetadata({
      conversationId,
      worktreeId: worktree.id,
      filePath: normalizedFilePath,
      absolutePath: realTargetPath,
      stats
    })

    return {
      status: "ok" as const,
      conversation,
      worktree,
      worktreeRootPath,
      file
    }
  }

  const readConversationFile = (rawInput: ConversationFileReadInput): ConversationFileReadResult => {
    const parsedInput = conversationFileReadInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      const hasFilePathIssue = parsedInput.error.issues.some((issue) => issue.path[0] === "filePath")
      if (!hasFilePathIssue) {
        throw parsedInput.error
      }

      const conversationId =
        typeof rawInput === "object" && rawInput !== null && "conversationId" in rawInput && typeof rawInput.conversationId === "string"
          ? rawInput.conversationId
          : ""
      const filePath =
        typeof rawInput === "object" && rawInput !== null && "filePath" in rawInput && typeof rawInput.filePath === "string"
          ? rawInput.filePath
          : ""

      return conversationFileReadResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target is outside worktree: ${filePath}`, null, {
          domain: "filesystem",
          context: { conversationId, filePath }
        })
      })
    }

    const input = parsedInput.data
    const target = resolveConversationFileTarget(input.conversationId, input.filePath)

    if (target.status === "not-found") {
      return conversationFileReadResultSchema.parse({
        status: "not-found",
        conversationId: input.conversationId,
        filePath: input.filePath
      })
    }

    if (target.status === "is-directory") {
      return conversationFileReadResultSchema.parse({
        status: "is-directory",
        conversationId: input.conversationId,
        filePath: input.filePath
      })
    }

    if (target.status === "error") {
      return conversationFileReadResultSchema.parse({
        status: "error",
        error: target.error
      })
    }

    const readTargetPath = resolve(target.worktreeRootPath, target.file.filePath)
    let fd: number
    try {
      fd = openSync(readTargetPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch (err) {
      const nodeError = err as NodeJS.ErrnoException
      if (nodeError?.code === "ENOENT") {
        return conversationFileReadResultSchema.parse({
          status: "not-found",
          conversationId: input.conversationId,
          filePath: input.filePath
        })
      }

      if (nodeError?.code === "ELOOP") {
        return conversationFileReadResultSchema.parse({
          status: "error",
          error: buildConversationFileOutsideWorktreeError({
            conversationId: target.conversation.id,
            worktreeId: target.worktree.id,
            worktreeRootPath: target.worktreeRootPath,
            filePath: input.filePath,
            message: `File target became a symlink while reading: ${input.filePath}`
          })
        })
      }

      if (nodeError?.code === "EACCES" || nodeError?.code === "EPERM" || nodeError?.code === "EISDIR") {
        return conversationFileReadResultSchema.parse({
          status: "error",
          error: buildAppError("FILE_NOT_READABLE", `File could not be opened for reading: ${input.filePath}`, nodeError.message, {
            domain: "filesystem",
            context: {
              conversationId: target.conversation.id,
              worktreeId: target.worktree.id,
              worktreeRootPath: target.worktreeRootPath
            }
          })
        })
      }

      return conversationFileReadResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "FILE_READ_FAILED", `File could not be opened before reading: ${readTargetPath}`)
      })
    }

    try {
      const currentStats = readConversationFileRevisionStatsFromFd(fd)
      if (!currentStats.isFile()) {
        return conversationFileReadResultSchema.parse({
          status: "error",
          error: buildAppError("FILE_NOT_READABLE", `File target is not a regular file: ${input.filePath}`, null, {
            domain: "filesystem",
            context: { conversationId: target.conversation.id, worktreeId: target.worktree.id }
          })
        })
      }

      const currentPathStats = readConversationFileRevisionStats(readTargetPath)
      if (!doStatsReferenceSameFile(currentPathStats, currentStats)) {
        return conversationFileReadResultSchema.parse({
          status: "error",
          error: buildAppError("FILE_READ_FAILED", `File target changed while reading: ${input.filePath}`, null, {
            domain: "filesystem",
            context: {
              conversationId: target.conversation.id,
              worktreeId: target.worktree.id,
              worktreeRootPath: target.worktreeRootPath
            }
          })
        })
      }

      const currentRealTargetPath = realpathSync(readTargetPath)
      if (!isPathInsideRoot(target.worktreeRootPath, currentRealTargetPath)) {
        return conversationFileReadResultSchema.parse({
          status: "error",
          error: buildConversationFileOutsideWorktreeError({
            conversationId: target.conversation.id,
            worktreeId: target.worktree.id,
            worktreeRootPath: target.worktreeRootPath,
            filePath: input.filePath,
            message: `File target resolved outside worktree while reading: ${input.filePath}`
          })
        })
      }

      const currentFile = buildConversationFileMetadata({
        conversationId: target.conversation.id,
        worktreeId: target.worktree.id,
        filePath: target.file.filePath,
        absolutePath: currentRealTargetPath,
        stats: currentStats
      })
      const limitBytes = input.maxBytes ?? CONVERSATION_FILE_AUTOMATIC_OPEN_MAX_BYTES
      if (currentFile.byteLength > limitBytes) {
        return conversationFileReadResultSchema.parse({
          status: "too-large",
          file: currentFile,
          limitBytes
        })
      }

      const buffer = readFileSync(fd)
      if (isBinaryBuffer(buffer)) {
        return conversationFileReadResultSchema.parse({
          status: "binary",
          file: currentFile
        })
      }

      return conversationFileReadResultSchema.parse({
        status: "text",
        file: currentFile,
        content: buffer.toString("utf8"),
        encoding: "utf-8"
      })
    } catch (err) {
      return conversationFileReadResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "FILE_READ_FAILED", `File could not be read: ${readTargetPath}`)
      })
    } finally {
      closeSync(fd)
    }
  }

  const writeConversationFile = (rawInput: ConversationFileWriteInput): ConversationFileWriteResult => {
    const parsedInput = conversationFileWriteInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      const hasFilePathIssue = parsedInput.error.issues.some((issue) => issue.path[0] === "filePath")
      if (!hasFilePathIssue) {
        throw parsedInput.error
      }

      const conversationId =
        typeof rawInput === "object" && rawInput !== null && "conversationId" in rawInput && typeof rawInput.conversationId === "string"
          ? rawInput.conversationId
          : ""
      const filePath =
        typeof rawInput === "object" && rawInput !== null && "filePath" in rawInput && typeof rawInput.filePath === "string"
          ? rawInput.filePath
          : ""

      return conversationFileWriteResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target is outside worktree: ${filePath}`, null, {
          domain: "filesystem",
          context: { conversationId, filePath }
        })
      })
    }

    const input = parsedInput.data
    const target = resolveConversationFileTarget(input.conversationId, input.filePath)

    if (target.status === "not-found") {
      return conversationFileWriteResultSchema.parse({
        status: "not-found",
        conversationId: input.conversationId,
        filePath: input.filePath
      })
    }

    if (target.status === "is-directory") {
      return conversationFileWriteResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_NOT_WRITABLE", `File target is a directory: ${input.filePath}`, null, {
          domain: "filesystem",
          context: { conversationId: input.conversationId }
        })
      })
    }

    if (target.status === "error") {
      return conversationFileWriteResultSchema.parse({
        status: "error",
        error: target.error
      })
    }

    if (target.conversation.runStatus === "running" || hasRunningExecutionRun(target.conversation.id)) {
      return conversationFileWriteResultSchema.parse({
        status: "readonly",
        error: buildAppError("FILE_RUN_ACTIVE_READONLY", "Conversation has an active provider run", null, {
          domain: "filesystem",
          context: {
            conversationId: target.conversation.id,
            conversationTitle: target.conversation.title,
            worktreeId: target.worktree.id,
            worktreeRootPath: target.worktree.rootPath
          }
        })
      })
    }

    const nextContentByteLength = Buffer.byteLength(input.content, "utf8")
    if (nextContentByteLength > CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES) {
      return conversationFileWriteResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_TOO_LARGE", `File content is too large to save in TeamCow: ${input.filePath}`, null, {
          domain: "filesystem",
          context: {
            conversationId: target.conversation.id,
            worktreeId: target.worktree.id,
            worktreeRootPath: target.worktreeRootPath,
            filePath: input.filePath,
            sizeBytes: nextContentByteLength,
            limitBytes: CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES
          }
        })
      })
    }

    const writeTargetPath = resolve(target.worktreeRootPath, target.file.filePath)
    let fd: number
    try {
      fd = openSync(writeTargetPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch (err) {
      const nodeError = err as NodeJS.ErrnoException
      if (nodeError?.code === "ENOENT") {
        return conversationFileWriteResultSchema.parse({
          status: "not-found",
          conversationId: input.conversationId,
          filePath: input.filePath
        })
      }

      if (nodeError?.code === "ELOOP") {
        return conversationFileWriteResultSchema.parse({
          status: "error",
          error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target became a symlink while saving: ${input.filePath}`, null, {
            domain: "filesystem",
            context: {
              conversationId: target.conversation.id,
              worktreeId: target.worktree.id,
              worktreeRootPath: target.worktreeRootPath
            }
          })
        })
      }

      if (nodeError?.code === "EACCES" || nodeError?.code === "EPERM" || nodeError?.code === "EISDIR") {
        return conversationFileWriteResultSchema.parse({
          status: "error",
          error: buildAppError("FILE_NOT_WRITABLE", `File could not be opened for writing: ${input.filePath}`, nodeError.message, {
            domain: "filesystem",
            context: {
              conversationId: target.conversation.id,
              worktreeId: target.worktree.id,
              worktreeRootPath: target.worktreeRootPath
            }
          })
        })
      }

      return conversationFileWriteResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "FILE_WRITE_FAILED", `File could not be opened before saving: ${writeTargetPath}`)
      })
    }

    try {
      const currentStats = readConversationFileRevisionStatsFromFd(fd)
      if (!currentStats.isFile()) {
        return conversationFileWriteResultSchema.parse({
          status: "error",
          error: buildAppError("FILE_NOT_WRITABLE", `File target is not a regular file: ${input.filePath}`, null, {
            domain: "filesystem",
            context: { conversationId: target.conversation.id, worktreeId: target.worktree.id }
          })
        })
      }

      if (currentStats.size > CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES) {
        return conversationFileWriteResultSchema.parse({
          status: "error",
          error: buildAppError("FILE_TOO_LARGE", `File is too large to save in TeamCow: ${input.filePath}`, null, {
            domain: "filesystem",
            context: {
              conversationId: target.conversation.id,
              worktreeId: target.worktree.id,
              worktreeRootPath: target.worktreeRootPath,
              filePath: input.filePath,
              sizeBytes: currentStats.size,
              limitBytes: CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES
            }
          })
        })
      }

      const currentPathStats = statSync(writeTargetPath)
      if (!doStatsReferenceSameFile(currentPathStats, currentStats)) {
        return conversationFileWriteResultSchema.parse({
          status: "error",
          error: buildAppError("FILE_WRITE_FAILED", `File target changed while saving: ${input.filePath}`, null, {
            domain: "filesystem",
            context: {
              conversationId: target.conversation.id,
              worktreeId: target.worktree.id,
              worktreeRootPath: target.worktreeRootPath
            }
          })
        })
      }

      const currentRealTargetPath = realpathSync(writeTargetPath)
      if (!isPathInsideRoot(target.worktreeRootPath, currentRealTargetPath)) {
        return conversationFileWriteResultSchema.parse({
          status: "error",
          error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target resolved outside worktree while saving: ${input.filePath}`, null, {
            domain: "filesystem",
            context: {
              conversationId: target.conversation.id,
              worktreeId: target.worktree.id,
              worktreeRootPath: target.worktreeRootPath
            }
          })
        })
      }

      const targetMode = currentPathStats.mode & 0o7777
      const currentPathBigintStats = readBigIntStats(() => statSync(writeTargetPath, { bigint: true }))
      const currentBuffer = readFileSync(fd)
      const currentFile = buildConversationFileMetadata({
        conversationId: target.conversation.id,
        worktreeId: target.worktree.id,
        filePath: target.file.filePath,
        absolutePath: currentRealTargetPath,
        stats: currentStats
      })

      if (isBinaryBuffer(currentBuffer)) {
        return conversationFileWriteResultSchema.parse({
          status: "error",
          error: buildAppError("FILE_BINARY", `Binary file cannot be edited: ${target.file.filePath}`, null, {
            domain: "filesystem",
            context: { conversationId: target.conversation.id, worktreeId: target.worktree.id }
          })
        })
      }

      if (input.precondition?.ifMatch && input.precondition.ifMatch !== currentFile.revision) {
        return conversationFileWriteResultSchema.parse({
          status: "conflict",
          file: currentFile,
          currentContent: currentBuffer.length <= CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES ? currentBuffer.toString("utf8") : null
        })
      }

      const nextFile = writeConversationFileAtomically({
        conversationId: target.conversation.id,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.worktreeRootPath,
        filePath: input.filePath,
        writeTargetPath,
        content: input.content,
        targetMode,
        expectedTargetDev: currentPathBigintStats?.dev.toString() ?? String(currentPathStats.dev),
        expectedTargetIno: currentPathBigintStats?.ino.toString() ?? String(currentPathStats.ino),
        expectedTargetMode: currentPathBigintStats?.mode.toString() ?? String(currentPathStats.mode),
        expectedTargetSize: currentPathBigintStats?.size.toString() ?? String(currentPathStats.size),
        expectedTargetMtimeNs: currentPathBigintStats?.mtimeNs.toString() ?? String(Math.trunc(currentPathStats.mtimeMs * 1_000_000)),
        expectedTargetCtimeNs: currentPathBigintStats?.ctimeNs.toString() ?? String(Math.trunc(currentPathStats.ctimeMs * 1_000_000))
      })
      if (nextFile.status === "error") {
        return conversationFileWriteResultSchema.parse({
          status: "error",
          error: nextFile.error
        })
      }

      return conversationFileWriteResultSchema.parse({
        status: "saved",
        file: buildConversationFileMetadata({
          conversationId: target.conversation.id,
          worktreeId: target.worktree.id,
          filePath: target.file.filePath,
          absolutePath: nextFile.file.absolutePath,
          stats: nextFile.file.stats
        })
      })
    } catch (err) {
      return conversationFileWriteResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "FILE_WRITE_FAILED", `File could not be saved: ${writeTargetPath}`)
      })
    } finally {
      closeSync(fd)
    }
  }

  const buildConversationFileMutationPathError = (input: {
    conversationId: string
    filePath: string
    message: string
  }): ConversationFileEntryMutationResult =>
    conversationFileEntryMutationResultSchema.parse({
      status: "error",
      error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", input.message, null, {
        domain: "filesystem",
        context: { conversationId: input.conversationId, filePath: input.filePath }
      })
    })

  const resolveConversationFileEntryMutationTarget = (conversationId: string, filePath: string) => {
    const conversation = getConversationById(conversationId)
    if (!conversation) {
      return {
        status: "error" as const,
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${conversationId}`, null, {
          domain: "filesystem",
          context: { conversationId }
        })
      }
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return {
        status: "error" as const,
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${conversation.worktreeId} was not found`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: conversation.worktreeId }
        })
      }
    }

    let worktreeRootPath: string
    try {
      worktreeRootPath = realpathSync(worktree.rootPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "WORKTREE_NOT_FOUND", `Worktree path could not be resolved: ${worktree.rootPath}`)
      }
    }

    if (isAbsolute(filePath)) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target must be relative: ${filePath}`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
        })
      }
    }

    const normalizedFilePath = normalizeConversationFilePath(filePath)
    const targetPath = resolve(worktreeRootPath, normalizedFilePath)
    if (!isPathInsideRoot(worktreeRootPath, targetPath)) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target is outside worktree: ${filePath}`, null, {
          domain: "filesystem",
          context: { conversationId, worktreeId: worktree.id, worktreeRootPath }
        })
      }
    }

    return {
      status: "ok" as const,
      conversation,
      worktree,
      worktreeRootPath,
      filePath: normalizedFilePath,
      targetPath
    }
  }

  const readConversationFileEntryKind = (targetPath: string): ConversationFileEntryKind => {
    const stats = statSync(targetPath)
    return stats.isDirectory() ? "directory" : "file"
  }

  const buildConversationFileEntry = (input: {
    conversation: ConversationRow
    worktree: WorktreeRow
    filePath: string
    targetPath: string
  }) => {
    const realTargetPath = realpathSync(input.targetPath)
    return {
      conversationId: input.conversation.id,
      worktreeId: input.worktree.id,
      filePath: input.filePath,
      absolutePath: realTargetPath,
      kind: readConversationFileEntryKind(input.targetPath)
    }
  }

  const validateConversationFileEntryParent = (input: {
    worktreeRootPath: string
    targetPath: string
    filePath: string
  }) => {
    const parentPath = dirname(input.targetPath)
    let realParentPath: string
    try {
      realParentPath = realpathSync(parentPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "PATH_NOT_FOUND", `File parent directory could not be resolved: ${parentPath}`)
      }
    }

    if (!isPathInsideRoot(input.worktreeRootPath, realParentPath)) {
      return {
        status: "error" as const,
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File parent resolved outside worktree: ${input.filePath}`, null, {
          domain: "filesystem",
          context: { worktreeRootPath: input.worktreeRootPath, filePath: input.filePath }
        })
      }
    }

    const parentStats = statSync(realParentPath)
    if (!parentStats.isDirectory()) {
      return {
        status: "error" as const,
        error: buildAppError("NOT_A_DIRECTORY", `File parent is not a directory: ${parentPath}`, null, {
          domain: "filesystem",
          context: { worktreeRootPath: input.worktreeRootPath, filePath: input.filePath }
        })
      }
    }

    return { status: "ok" as const }
  }

  const buildConversationFileEntryMutationReadonlyError = (conversation: ConversationRow, worktree: WorktreeRow, worktreeRootPath: string) =>
    conversationFileEntryMutationResultSchema.parse({
      status: "error",
      error: buildAppError("FILE_RUN_ACTIVE_READONLY", "Conversation has an active provider run", null, {
        domain: "filesystem",
        context: {
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          worktreeId: worktree.id,
          worktreeRootPath
        }
      })
    })

  const createConversationFileEntry = (rawInput: CreateConversationFileEntryInput): ConversationFileEntryMutationResult => {
    const parsedInput = createConversationFileEntryInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      const conversationId =
        typeof rawInput === "object" && rawInput !== null && "conversationId" in rawInput && typeof rawInput.conversationId === "string"
          ? rawInput.conversationId
          : ""
      const filePath =
        typeof rawInput === "object" && rawInput !== null && "filePath" in rawInput && typeof rawInput.filePath === "string"
          ? rawInput.filePath
          : ""
      return buildConversationFileMutationPathError({
        conversationId,
        filePath,
        message: `File target is outside worktree: ${filePath}`
      })
    }

    const input = parsedInput.data
    const target = resolveConversationFileEntryMutationTarget(input.conversationId, input.filePath)
    if (target.status === "error") {
      return conversationFileEntryMutationResultSchema.parse({ status: "error", error: target.error })
    }

    if (target.conversation.runStatus === "running" || hasRunningExecutionRun(target.conversation.id)) {
      return buildConversationFileEntryMutationReadonlyError(target.conversation, target.worktree, target.worktreeRootPath)
    }

    const parentResult = validateConversationFileEntryParent(target)
    if (parentResult.status === "error") {
      return conversationFileEntryMutationResultSchema.parse({ status: "error", error: parentResult.error })
    }

    if (existsSync(target.targetPath)) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_WRITE_FAILED", `File target already exists: ${target.filePath}`, null, {
          domain: "filesystem",
          context: { conversationId: target.conversation.id, worktreeId: target.worktree.id, filePath: target.filePath }
        })
      })
    }

    try {
      if (input.kind === "directory") {
        mkdirSync(target.targetPath)
      } else {
        const fd = openSync(target.targetPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666)
        closeSync(fd)
      }

      const realTargetPath = realpathSync(target.targetPath)
      if (!isPathInsideRoot(target.worktreeRootPath, realTargetPath)) {
        return conversationFileEntryMutationResultSchema.parse({
          status: "error",
          error: buildConversationFileOutsideWorktreeError({
            conversationId: target.conversation.id,
            worktreeId: target.worktree.id,
            worktreeRootPath: target.worktreeRootPath,
            filePath: target.filePath,
            message: `Created file resolved outside worktree: ${target.filePath}`
          })
        })
      }

      return conversationFileEntryMutationResultSchema.parse({
        status: "created",
        entry: buildConversationFileEntry(target)
      })
    } catch (err) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "FILE_WRITE_FAILED", `File target could not be created: ${target.targetPath}`)
      })
    }
  }

  const renameConversationFileEntry = (rawInput: RenameConversationFileEntryInput): ConversationFileEntryMutationResult => {
    const parsedInput = renameConversationFileEntryInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      const conversationId =
        typeof rawInput === "object" && rawInput !== null && "conversationId" in rawInput && typeof rawInput.conversationId === "string"
          ? rawInput.conversationId
          : ""
      const filePath =
        typeof rawInput === "object" && rawInput !== null && "destinationPath" in rawInput && typeof rawInput.destinationPath === "string"
          ? rawInput.destinationPath
          : ""
      return buildConversationFileMutationPathError({
        conversationId,
        filePath,
        message: `File target is outside worktree: ${filePath}`
      })
    }

    const input = parsedInput.data
    const source = resolveConversationFileEntryMutationTarget(input.conversationId, input.sourcePath)
    if (source.status === "error") {
      return conversationFileEntryMutationResultSchema.parse({ status: "error", error: source.error })
    }
    const destination = resolveConversationFileEntryMutationTarget(input.conversationId, input.destinationPath)
    if (destination.status === "error") {
      return conversationFileEntryMutationResultSchema.parse({ status: "error", error: destination.error })
    }

    if (source.conversation.runStatus === "running" || hasRunningExecutionRun(source.conversation.id)) {
      return buildConversationFileEntryMutationReadonlyError(source.conversation, source.worktree, source.worktreeRootPath)
    }

    if (!existsSync(source.targetPath)) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "not-found",
        conversationId: input.conversationId,
        filePath: source.filePath
      })
    }

    let sourceRealPath: string
    try {
      sourceRealPath = realpathSync(source.targetPath)
    } catch (err) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "PATH_NOT_FOUND", `File source path could not be resolved: ${source.targetPath}`)
      })
    }

    if (!isPathInsideRoot(source.worktreeRootPath, sourceRealPath)) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: buildConversationFileOutsideWorktreeError({
          conversationId: source.conversation.id,
          worktreeId: source.worktree.id,
          worktreeRootPath: source.worktreeRootPath,
          filePath: source.filePath,
          message: `File source resolved outside worktree: ${source.filePath}`
        })
      })
    }

    const sourceKind = readConversationFileEntryKind(source.targetPath)
    if (sourceKind !== input.kind) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_WRITE_FAILED", `File source kind changed before rename: ${source.filePath}`, null, {
          domain: "filesystem",
          context: { conversationId: source.conversation.id, filePath: source.filePath }
        })
      })
    }

    if (sourceKind === "directory" && isPathInsideRoot(source.targetPath, destination.targetPath)) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_WRITE_FAILED", `Folder cannot be renamed into itself: ${source.filePath}`, null, {
          domain: "filesystem",
          context: { conversationId: source.conversation.id, filePath: source.filePath }
        })
      })
    }

    const parentResult = validateConversationFileEntryParent(destination)
    if (parentResult.status === "error") {
      return conversationFileEntryMutationResultSchema.parse({ status: "error", error: parentResult.error })
    }

    if (existsSync(destination.targetPath)) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_WRITE_FAILED", `Rename destination already exists: ${destination.filePath}`, null, {
          domain: "filesystem",
          context: { conversationId: source.conversation.id, filePath: destination.filePath }
        })
      })
    }

    try {
      renameSync(source.targetPath, destination.targetPath)
      const realDestinationPath = realpathSync(destination.targetPath)
      if (!isPathInsideRoot(destination.worktreeRootPath, realDestinationPath)) {
        return conversationFileEntryMutationResultSchema.parse({
          status: "error",
          error: buildConversationFileOutsideWorktreeError({
            conversationId: destination.conversation.id,
            worktreeId: destination.worktree.id,
            worktreeRootPath: destination.worktreeRootPath,
            filePath: destination.filePath,
            message: `Renamed file resolved outside worktree: ${destination.filePath}`
          })
        })
      }

      return conversationFileEntryMutationResultSchema.parse({
        status: "renamed",
        entry: buildConversationFileEntry(destination)
      })
    } catch (err) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "FILE_WRITE_FAILED", `File target could not be renamed: ${source.targetPath}`)
      })
    }
  }

  const deleteConversationFileEntry = (rawInput: DeleteConversationFileEntryInput): ConversationFileEntryMutationResult => {
    const parsedInput = deleteConversationFileEntryInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      const conversationId =
        typeof rawInput === "object" && rawInput !== null && "conversationId" in rawInput && typeof rawInput.conversationId === "string"
          ? rawInput.conversationId
          : ""
      const filePath =
        typeof rawInput === "object" && rawInput !== null && "filePath" in rawInput && typeof rawInput.filePath === "string"
          ? rawInput.filePath
          : ""
      return buildConversationFileMutationPathError({
        conversationId,
        filePath,
        message: `File target is outside worktree: ${filePath}`
      })
    }

    const input = parsedInput.data
    const target = resolveConversationFileEntryMutationTarget(input.conversationId, input.filePath)
    if (target.status === "error") {
      return conversationFileEntryMutationResultSchema.parse({ status: "error", error: target.error })
    }

    if (target.conversation.runStatus === "running" || hasRunningExecutionRun(target.conversation.id)) {
      return buildConversationFileEntryMutationReadonlyError(target.conversation, target.worktree, target.worktreeRootPath)
    }

    if (!existsSync(target.targetPath)) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "not-found",
        conversationId: input.conversationId,
        filePath: target.filePath
      })
    }

    let realTargetPath: string
    try {
      realTargetPath = realpathSync(target.targetPath)
    } catch (err) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "PATH_NOT_FOUND", `File target path could not be resolved: ${target.targetPath}`)
      })
    }

    if (!isPathInsideRoot(target.worktreeRootPath, realTargetPath)) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: buildConversationFileOutsideWorktreeError({
          conversationId: target.conversation.id,
          worktreeId: target.worktree.id,
          worktreeRootPath: target.worktreeRootPath,
          filePath: target.filePath,
          message: `File target resolved outside worktree: ${target.filePath}`
        })
      })
    }

    const targetKind = readConversationFileEntryKind(target.targetPath)
    if (targetKind !== input.kind) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_WRITE_FAILED", `File target kind changed before delete: ${target.filePath}`, null, {
          domain: "filesystem",
          context: { conversationId: target.conversation.id, filePath: target.filePath }
        })
      })
    }

    try {
      rmSync(target.targetPath, { recursive: targetKind === "directory", force: false })
      return conversationFileEntryMutationResultSchema.parse({
        status: "deleted",
        conversationId: target.conversation.id,
        worktreeId: target.worktree.id,
        filePath: target.filePath,
        kind: input.kind
      })
    } catch (err) {
      return conversationFileEntryMutationResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "FILE_WRITE_FAILED", `File target could not be deleted: ${target.targetPath}`)
      })
    }
  }

  const revealConversationFileEntry = async (rawInput: RevealConversationFileEntryInput): Promise<ConversationFileEntryRevealResult> => {
    const parsedInput = revealConversationFileEntryInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      const conversationId =
        typeof rawInput === "object" && rawInput !== null && "conversationId" in rawInput && typeof rawInput.conversationId === "string"
          ? rawInput.conversationId
          : ""
      const filePath =
        typeof rawInput === "object" && rawInput !== null && "filePath" in rawInput && typeof rawInput.filePath === "string"
          ? rawInput.filePath
          : ""
      return conversationFileEntryRevealResultSchema.parse({
        status: "error",
        error: buildAppError("FILE_PATH_OUTSIDE_WORKTREE", `File target is outside worktree: ${filePath}`, null, {
          domain: "filesystem",
          context: { conversationId, filePath }
        })
      })
    }

    const input = parsedInput.data
    const target = resolveConversationFileEntryMutationTarget(input.conversationId, input.filePath)
    if (target.status === "error") {
      return conversationFileEntryRevealResultSchema.parse({ status: "error", error: target.error })
    }

    if (!existsSync(target.targetPath)) {
      return conversationFileEntryRevealResultSchema.parse({
        status: "not-found",
        conversationId: input.conversationId,
        filePath: target.filePath
      })
    }

    let realTargetPath: string
    try {
      realTargetPath = realpathSync(target.targetPath)
    } catch (err) {
      return conversationFileEntryRevealResultSchema.parse({
        status: "error",
        error: pathErrorFor(err, "PATH_NOT_FOUND", `File target path could not be resolved: ${target.targetPath}`)
      })
    }

    if (!isPathInsideRoot(target.worktreeRootPath, realTargetPath)) {
      return conversationFileEntryRevealResultSchema.parse({
        status: "error",
        error: buildConversationFileOutsideWorktreeError({
          conversationId: target.conversation.id,
          worktreeId: target.worktree.id,
          worktreeRootPath: target.worktreeRootPath,
          filePath: target.filePath,
          message: `File target resolved outside worktree: ${target.filePath}`
        })
      })
    }

    const result = spawnSync("/usr/bin/open", ["-R", realTargetPath], { encoding: "utf8" })
    if (result.error || result.status !== 0) {
      const message = result.error?.message ?? result.stderr?.trim() ?? result.stdout?.trim() ?? "Finder reveal failed"
      return conversationFileEntryRevealResultSchema.parse({
        status: "error",
        error: buildAppError("EXTERNAL_OPEN_FAILED", `Finder reveal failed for ${realTargetPath}: ${message}`, message, {
          domain: "filesystem",
          context: {
            conversationId: target.conversation.id,
            worktreeId: target.worktree.id,
            worktreeRootPath: target.worktreeRootPath,
            filePath: target.filePath
          }
        })
      })
    }

    return conversationFileEntryRevealResultSchema.parse({
      status: "opened",
      conversationId: target.conversation.id,
      worktreeId: target.worktree.id,
      filePath: target.filePath,
      targetPath: realTargetPath
    })
  }

  const resolveConversationHandoffTarget = (input: OpenConversationHandoffInput) => {
    const conversation = getConversationById(input.conversationId)
    if (!conversation) {
      return {
        status: "error" as const,
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${input.conversationId}`)
      }
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return {
        status: "error" as const,
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${conversation.worktreeId} was not found`)
      }
    }

    if (!existsSync(worktree.rootPath)) {
      return {
        status: "error" as const,
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree path was not found: ${worktree.rootPath}`)
      }
    }

    let worktreeRootPath: string
    try {
      worktreeRootPath = realpathSync(worktree.rootPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "WORKTREE_NOT_FOUND", `Worktree path could not be resolved: ${worktree.rootPath}`)
      }
    }
    if (input.target === "worktree") {
      let stats
      try {
        stats = statSync(worktreeRootPath)
      } catch (err) {
        return {
          status: "error" as const,
          error: pathErrorFor(err, "WORKTREE_NOT_FOUND", `Worktree path could not be inspected: ${worktreeRootPath}`)
        }
      }
      if (!stats.isDirectory()) {
        return {
          status: "error" as const,
          error: buildAppError("NOT_A_DIRECTORY", `Worktree path is not a directory: ${worktreeRootPath}`)
        }
      }

      return {
        status: "ok" as const,
        conversation,
        worktree,
        targetKind: "worktree" as const,
        targetPath: worktreeRootPath
      }
    }

    if (isAbsolute(input.filePath)) {
      return {
        status: "error" as const,
        error: buildAppError("HANDOFF_PATH_OUTSIDE_WORKTREE", `Handoff target must be relative: ${input.filePath}`)
      }
    }

    const targetPath = resolve(worktreeRootPath, input.filePath)
    if (!isPathInsideRoot(worktreeRootPath, targetPath)) {
      return {
        status: "error" as const,
        error: buildAppError("HANDOFF_PATH_OUTSIDE_WORKTREE", `Handoff target is outside worktree: ${input.filePath}`)
      }
    }

    if (!existsSync(targetPath)) {
      return {
        status: "error" as const,
        error: buildAppError("PATH_NOT_FOUND", `Handoff target path was not found: ${targetPath}`)
      }
    }

    let realTargetPath: string
    try {
      realTargetPath = realpathSync(targetPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "PATH_NOT_FOUND", `Handoff target path could not be resolved: ${targetPath}`)
      }
    }
    if (!isPathInsideRoot(worktreeRootPath, realTargetPath)) {
      return {
        status: "error" as const,
        error: buildAppError("HANDOFF_PATH_OUTSIDE_WORKTREE", `Handoff target resolved outside worktree: ${input.filePath}`)
      }
    }

    let targetStats
    try {
      targetStats = statSync(realTargetPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "PATH_NOT_FOUND", `Handoff target path could not be inspected: ${realTargetPath}`)
      }
    }

    if (!targetStats.isFile()) {
      return {
        status: "error" as const,
        error: buildAppError("HANDOFF_TARGET_NOT_FILE", `Handoff file target is not a file: ${realTargetPath}`)
      }
    }

    return {
      status: "ok" as const,
      conversation,
      worktree,
      targetKind: "file" as const,
      targetPath: realTargetPath
    }
  }

  const openConversationExternal = async (
    rawInput: OpenConversationExternalInput
  ): Promise<OpenConversationExternalResult> => {
    const input = openConversationExternalInputSchema.parse(rawInput)
    const target = resolveConversationHandoffTarget({
      conversationId: input.conversationId,
      target: "worktree"
    })
    if (target.status === "error") {
      logError("handoff", "external-open.resolve.failed", target.error, {
        conversationId: input.conversationId,
        appId: input.appId
      })
      return openConversationExternalResultSchema.parse(target)
    }

    const selectedApp = listExternalOpenOptions().find((option) => option.id === input.appId)
    if (!selectedApp?.isAvailable) {
      const error = buildAppError(
        "EXTERNAL_OPEN_APP_UNAVAILABLE",
        `External app is not available: ${input.appId}`,
        null,
        {
          domain: "handoff",
          context: {
            conversationId: target.conversation.id,
            worktreeId: target.worktree.id,
            worktreeRootPath: target.targetPath,
            appId: input.appId
          }
        }
      )
      logError("handoff", "external-open.failed", error, {
        conversationId: target.conversation.id,
        conversationTitle: target.conversation.title,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.targetPath,
        appId: input.appId
      })
      return openConversationExternalResultSchema.parse({
        status: "error",
        error
      })
    }

    try {
      const openError = await openExternalAppPath({
        appId: selectedApp.id,
        appName: selectedApp.appName,
        bundleId: selectedApp.bundleId ?? null,
        targetPath: target.targetPath
      })
      if (openError.length > 0) {
        const error = buildAppError(
          "EXTERNAL_OPEN_FAILED",
          `External app open failed for ${target.targetPath}: ${openError}`,
          openError,
          {
            domain: "handoff",
            context: {
              conversationId: target.conversation.id,
              worktreeId: target.worktree.id,
              worktreeRootPath: target.targetPath,
              appId: selectedApp.id
            }
          }
        )
        logError("handoff", "external-open.failed", error, {
          conversationId: target.conversation.id,
          conversationTitle: target.conversation.title,
          worktreeId: target.worktree.id,
          worktreeRootPath: target.targetPath,
          appId: selectedApp.id
        })
        return openConversationExternalResultSchema.parse({
          status: "error",
          error
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const error = buildAppError(
        "EXTERNAL_OPEN_FAILED",
        `External app open failed for ${target.targetPath}: ${message}`,
        message,
        {
          domain: "handoff",
          context: {
            conversationId: target.conversation.id,
            worktreeId: target.worktree.id,
            worktreeRootPath: target.targetPath,
            appId: selectedApp.id
          }
        }
      )
      logError("handoff", "external-open.failed", error, {
        conversationId: target.conversation.id,
        conversationTitle: target.conversation.title,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.targetPath,
        appId: selectedApp.id
      })
      return openConversationExternalResultSchema.parse({
        status: "error",
        error
      })
    }

    logInfo("handoff", "external-open.opened", {
      conversationId: target.conversation.id,
      conversationTitle: target.conversation.title,
      worktreeId: target.worktree.id,
      worktreeRootPath: target.targetPath,
      appId: selectedApp.id
    })
    return openConversationExternalResultSchema.parse({
      status: "opened",
      conversationId: target.conversation.id,
      worktreeId: target.worktree.id,
      appId: selectedApp.id,
      appLabel: selectedApp.label,
      targetPath: target.targetPath
    })
  }

  const openConversationHandoff = async (
    rawInput: OpenConversationHandoffInput
  ): Promise<OpenConversationHandoffResult> => {
    const input = openConversationHandoffInputSchema.parse(rawInput)
    const target = resolveConversationHandoffTarget(input)
    if (target.status === "error") {
      logError("handoff", "handoff.resolve.failed", target.error, {
        conversationId: input.conversationId
      })
      return openConversationHandoffResultSchema.parse(target)
    }

    const editors = listEditorOptions()
    const { persistedEditorId, effectiveEditor: selectedEditor } = resolveEffectiveEditorSelection(editors)
    if (!selectedEditor) {
      const error = persistedEditorId
        ? buildAppError("HANDOFF_EDITOR_UNAVAILABLE", `Selected editor is not available: ${persistedEditorId}`)
        : buildAppError("HANDOFF_EDITOR_NOT_SELECTED", "No coding editor has been selected")
      logError("handoff", "handoff.open.failed", error, {
        conversationId: target.conversation.id,
        conversationTitle: target.conversation.title,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.worktree.rootPath
      })
      return openConversationHandoffResultSchema.parse({
        status: "error",
        error
      })
    }

    try {
      const openError = await openEditorPath({
        editorId: selectedEditor.id,
        appName: selectedEditor.appName,
        bundleId: selectedEditor.bundleId ?? null,
        targetPath: target.targetPath
      })
      if (openError.length > 0) {
        const error = buildAppError("HANDOFF_OPEN_FAILED", `Editor open failed for ${target.targetPath}: ${openError}`)
        logError("handoff", "handoff.open.failed", error, {
          conversationId: target.conversation.id,
          conversationTitle: target.conversation.title,
          worktreeId: target.worktree.id,
          worktreeRootPath: target.worktree.rootPath
        })
        return openConversationHandoffResultSchema.parse({
          status: "error",
          error
        })
      }
    } catch (err) {
      const error = buildAppError(
        "HANDOFF_OPEN_FAILED",
        `Editor open failed for ${target.targetPath}: ${err instanceof Error ? err.message : String(err)}`
      )
      logError("handoff", "handoff.open.failed", error, {
        conversationId: target.conversation.id,
        conversationTitle: target.conversation.title,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.worktree.rootPath
      })
      return openConversationHandoffResultSchema.parse({
        status: "error",
        error
      })
    }

    logInfo("handoff", "handoff.opened", {
      conversationId: target.conversation.id,
      conversationTitle: target.conversation.title,
      worktreeId: target.worktree.id,
      worktreeRootPath: target.worktree.rootPath
    })
    return openConversationHandoffResultSchema.parse({
      status: "opened",
      conversationId: target.conversation.id,
      worktreeId: target.worktree.id,
      targetKind: target.targetKind,
      targetPath: target.targetPath
    })
  }

  const resolveConversationTerminalTarget = (conversationId: string) => {
    const conversation = getConversationById(conversationId)
    if (!conversation) {
      return {
        status: "error" as const,
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${conversationId}`)
      }
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return {
        status: "error" as const,
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${conversation.worktreeId} was not found`)
      }
    }

    if (!existsSync(worktree.rootPath)) {
      return {
        status: "error" as const,
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree path was not found: ${worktree.rootPath}`)
      }
    }

    let worktreeRootPath: string
    try {
      worktreeRootPath = realpathSync(worktree.rootPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "WORKTREE_NOT_FOUND", `Worktree path could not be resolved: ${worktree.rootPath}`)
      }
    }

    let stats
    try {
      stats = statSync(worktreeRootPath)
    } catch (err) {
      return {
        status: "error" as const,
        error: pathErrorFor(err, "WORKTREE_NOT_FOUND", `Worktree path could not be inspected: ${worktreeRootPath}`)
      }
    }

    if (!stats.isDirectory()) {
      return {
        status: "error" as const,
        error: buildAppError("NOT_A_DIRECTORY", `Worktree path is not a directory: ${worktreeRootPath}`)
      }
    }

    return {
      status: "ok" as const,
      conversation,
      worktree,
      cwd: worktreeRootPath
    }
  }

  const actionResultForMissingTerminalSession = (sessionId: string): TerminalActionResult =>
    terminalActionResultSchema.parse({
      status: "error",
      error: buildAppError("TERMINAL_SESSION_NOT_FOUND", `Terminal session was not found: ${sessionId}`)
    })

  const cleanupTerminalSession = (sessionId: string, options: { kill: boolean }): AppError | null => {
    const session = terminalSessions.get(sessionId)
    if (!session) {
      return buildAppError("TERMINAL_SESSION_NOT_FOUND", `Terminal session was not found: ${sessionId}`)
    }

    terminalSessions.delete(sessionId)
    let cleanupError: unknown = null
    for (const disposable of session.disposables) {
      try {
        disposable.dispose()
      } catch (err) {
        cleanupError ??= err
      }
    }

    if (options.kill) {
      try {
        session.pty.kill()
      } catch (err) {
        cleanupError ??= err
      }
    }

    if (cleanupError) {
      return buildAppError(
        "INTERNAL_ERROR",
        `Terminal session cleanup failed: ${sessionId}`,
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      )
    }

    return null
  }

  const openConversationTerminal = async (
    rawInput: OpenConversationTerminalInput
  ): Promise<OpenConversationTerminalResult> => {
    const input = openConversationTerminalInputSchema.parse(rawInput)
    const target = resolveConversationTerminalTarget(input.conversationId)
    if (target.status === "error") {
      logError("terminal", "terminal.resolve.failed", target.error, {
        conversationId: input.conversationId
      })
      return openConversationTerminalResultSchema.parse(target)
    }

    const shell = getTerminalShell()?.trim() || "/bin/zsh"
    if (!existsSync(shell)) {
      const error = buildAppError("TERMINAL_SHELL_UNAVAILABLE", `Terminal shell was not found: ${shell}`)
      logError("terminal", "terminal.start.failed", error, {
        conversationId: target.conversation.id,
        conversationTitle: target.conversation.title,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.cwd
      })
      return openConversationTerminalResultSchema.parse({
        status: "error",
        error
      })
    }

    let shellStats
    try {
      shellStats = statSync(shell)
    } catch (err) {
      const error = pathErrorFor(err, "TERMINAL_SHELL_UNAVAILABLE", `Terminal shell could not be inspected: ${shell}`)
      logError("terminal", "terminal.start.failed", error, {
        conversationId: target.conversation.id,
        conversationTitle: target.conversation.title,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.cwd
      })
      return openConversationTerminalResultSchema.parse({
        status: "error",
        error
      })
    }
    if (!shellStats.isFile()) {
      const error = buildAppError("TERMINAL_SHELL_UNAVAILABLE", `Terminal shell is not a file: ${shell}`)
      logError("terminal", "terminal.start.failed", error, {
        conversationId: target.conversation.id,
        conversationTitle: target.conversation.title,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.cwd
      })
      return openConversationTerminalResultSchema.parse({
        status: "error",
        error
      })
    }
    try {
      accessSync(shell, constants.X_OK)
    } catch (err) {
      const error = buildAppError(
        "TERMINAL_SHELL_UNAVAILABLE",
        `Terminal shell is not executable: ${shell}`,
        err instanceof Error ? err.message : String(err)
      )
      logError("terminal", "terminal.start.failed", error, {
        conversationId: target.conversation.id,
        conversationTitle: target.conversation.title,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.cwd
      })
      return openConversationTerminalResultSchema.parse({
        status: "error",
        error
      })
    }

    const spawned = spawnTerminalPty({
      shell,
      cwd: target.cwd,
      cols: DEFAULT_TERMINAL_COLS,
      rows: DEFAULT_TERMINAL_ROWS
    })
    if (spawned.status === "error") {
      const error = spawned.error.code === "TERMINAL_NATIVE_MODULE_FAILED"
        ? spawned.error
        : buildAppError("TERMINAL_START_FAILED", spawned.error.message, spawned.error.suggestion)
      logError("terminal", "terminal.start.failed", error, {
        conversationId: target.conversation.id,
        conversationTitle: target.conversation.title,
        worktreeId: target.worktree.id,
        worktreeRootPath: target.cwd
      })
      return openConversationTerminalResultSchema.parse({
        status: "error",
        error
      })
    }

    const sessionId = randomUUID()
    const session = terminalSessionSummarySchema.parse({
      sessionId,
      conversationId: target.conversation.id,
      worktreeId: target.worktree.id,
      cwd: target.cwd,
      shell,
      status: "running",
      startedAt: now()
    })
    const disposables: TerminalDisposable[] = []
    let initialOutput = ""
    let streamOutputEvents = false

    disposables.push(spawned.pty.onData((data) => {
      const event = terminalOutputEventSchema.parse({
        sessionId,
        conversationId: target.conversation.id,
        data,
        receivedAt: now()
      })
      if (!streamOutputEvents) {
        initialOutput += data
        return
      }
      onTerminalOutput?.(event)
    }))
    disposables.push(spawned.pty.onExit((event) => {
      const existing = terminalSessions.get(sessionId)
      if (!existing) {
        return
      }
      const exitedAt = now()
      existing.summary = terminalSessionSummarySchema.parse({
        ...existing.summary,
        status: "exited",
        exitedAt,
        exitCode: event.exitCode
      })
      onTerminalOutput?.(terminalOutputEventSchema.parse({
        sessionId,
        conversationId: existing.summary.conversationId,
        data: "",
        status: "exited",
        exitCode: event.exitCode,
        receivedAt: exitedAt
      }))
      logInfo("terminal", "terminal.exited", {
        conversationId: existing.summary.conversationId,
        worktreeId: existing.summary.worktreeId,
        worktreeRootPath: existing.summary.cwd,
        terminalSessionId: sessionId
      })
      cleanupTerminalSession(sessionId, { kill: false })
    }))

    terminalSessions.set(sessionId, {
      summary: session,
      pty: spawned.pty,
      disposables
    })
    streamOutputEvents = true

    logInfo("terminal", "terminal.opened", {
      conversationId: session.conversationId,
      worktreeId: session.worktreeId,
      worktreeRootPath: session.cwd,
      terminalSessionId: session.sessionId
    })
    return openConversationTerminalResultSchema.parse({
      status: "ok",
      session,
      initialOutput: initialOutput || undefined
    })
  }

  const writeTerminalInput = (rawInput: TerminalWriteInput): TerminalActionResult => {
    const input = terminalWriteInputSchema.parse(rawInput)
    const session = terminalSessions.get(input.sessionId)
    if (!session) {
      return actionResultForMissingTerminalSession(input.sessionId)
    }
    session.pty.write(input.data)
    return terminalActionResultSchema.parse({
      status: "ok",
      sessionId: input.sessionId
    })
  }

  const resizeTerminal = (rawInput: TerminalResizeInput): TerminalActionResult => {
    const input = terminalResizeInputSchema.parse(rawInput)
    const session = terminalSessions.get(input.sessionId)
    if (!session) {
      return actionResultForMissingTerminalSession(input.sessionId)
    }
    session.pty.resize(input.cols, input.rows)
    return terminalActionResultSchema.parse({
      status: "ok",
      sessionId: input.sessionId
    })
  }

  const closeTerminal = (rawInput: TerminalCloseInput): TerminalActionResult => {
    const input = terminalCloseInputSchema.parse(rawInput)
    const session = terminalSessions.get(input.sessionId)
    if (!session) {
      logError("terminal", "terminal.close.failed", buildAppError("TERMINAL_SESSION_NOT_FOUND", `Terminal session was not found: ${input.sessionId}`), {
        terminalSessionId: input.sessionId
      })
      return actionResultForMissingTerminalSession(input.sessionId)
    }
    const cleanupError = cleanupTerminalSession(input.sessionId, { kill: true })
    if (cleanupError) {
      logError("terminal", "terminal.close.failed", cleanupError, {
        conversationId: session.summary.conversationId,
        worktreeId: session.summary.worktreeId,
        worktreeRootPath: session.summary.cwd,
        terminalSessionId: input.sessionId
      })
      return terminalActionResultSchema.parse({
        status: "error",
        error: cleanupError
      })
    }
    logInfo("terminal", "terminal.closed", {
      conversationId: session.summary.conversationId,
      worktreeId: session.summary.worktreeId,
      worktreeRootPath: session.summary.cwd,
      terminalSessionId: input.sessionId
    })
    return terminalActionResultSchema.parse({
      status: "ok",
      sessionId: input.sessionId
    })
  }

  const closeAllTerminalSessions = () => {
    for (const sessionId of Array.from(terminalSessions.keys())) {
      closeTerminal({ sessionId })
    }
  }

  const isPersistedCodexAgentMessageEvent = (event: RunEventSummary) => {
    if (event.type !== "run.progress" || event.payload.rawType !== "item.completed") {
      return false
    }

    const raw = readRecordValue(event.payload.raw)
    const item = readRecordValue(raw?.item)
    return item?.type === "agent_message"
  }

  const getProviderMessageText = (event: RunEventSummary) => {
    const directText = readStringValue(event.payload.text) ?? readStringValue(event.payload.delta)
    if (directText !== null) {
      return directText
    }

    const raw = readRecordValue(event.payload.raw)
    const item = readRecordValue(raw?.item)
    return readStringValue(item?.text) ?? readStringValue(item?.message)
  }

  const persistAssistantCacheFromRunEvents = (conversationId: string, runId: string) => {
    const run = database.db.select().from(executionRunsTable).where(eq(executionRunsTable.id, runId)).get() as
      | ExecutionRunRow
      | undefined
    if (!run || run.conversationId !== conversationId || run.status !== "completed") {
      return
    }

    const existingAssistantMessage = (database.db
      .select()
      .from(conversationMessagesTable)
      .where(eq(conversationMessagesTable.runId, runId))
      .all() as ConversationMessageRow[])
      .some((message) => message.conversationId === conversationId && message.role === "assistant")
    if (existingAssistantMessage) {
      return
    }

    const events = (database.db
      .select()
      .from(runEventsTable)
      .where(eq(runEventsTable.runId, runId))
      .all() as RunEventRow[])
      .map((event) => createRunEventSummary(event, run.provider))
      .sort((left, right) => left.sequence - right.sequence)

    const authoritativeFinalEvents = events.filter((event) =>
      event.type === "run.message.completed" &&
      event.payload.authoritative === true &&
      (getProviderMessageText(event) ?? "").trim().length > 0
    )
    const phaseFinalEvents = events.filter((event) =>
      (event.type === "run.message.delta" || event.type === "run.message.completed") &&
      (event.payload.phase === "final" || event.payload.phase === "final_answer") &&
      (getProviderMessageText(event) ?? "").trim().length > 0
    )
    const deltaEvents = events.filter((event) =>
      event.type === "run.message.delta" && (getProviderMessageText(event) ?? "").trim().length > 0
    )
    const completedEvents = events.filter((event) =>
      (event.type === "run.message.completed" || isPersistedCodexAgentMessageEvent(event)) &&
      (getProviderMessageText(event) ?? "").trim().length > 0
    )
    const assistantText = authoritativeFinalEvents.length > 0
      ? getProviderMessageText(authoritativeFinalEvents[authoritativeFinalEvents.length - 1]) ?? ""
      : phaseFinalEvents.length > 0
        ? phaseFinalEvents.map((event) => getProviderMessageText(event) ?? "").join("")
        : deltaEvents.length > 0
          ? deltaEvents.map((event) => getProviderMessageText(event) ?? "").join("")
          : completedEvents.map((event) => getProviderMessageText(event) ?? "").join("")

    if (assistantText.trim().length === 0) {
      return
    }

    database.db.insert(conversationMessagesTable).values({
      id: randomUUID(),
      conversationId,
      role: "assistant",
      content: assistantText,
      model: run.model,
      runId,
      createdAt: now()
    }).run()
  }

  const appendRunEvent = (input: AppendRunEventInput): RunEventSummary => {
    const result = runEventStore.append(prepareGeneratedImageEvent(input))
    const nextStatus = result.nextStatus
    const previousWasTerminal = isTerminalRunStatus(result.previousStatus)
    const nextIsTerminal = nextStatus ? isTerminalRunStatus(nextStatus) : false
    const shouldEmitRunNotification = Boolean(nextStatus && nextIsTerminal && (
      !previousWasTerminal ||
      ((nextStatus === "failed" || nextStatus === "interrupted" || nextStatus === "unavailable") &&
        nextStatus !== result.previousStatus)
    ))

    const summary = createRunEventSummary(result.event, result.provider)
    if (!result.inserted) {
      return summary
    }
    deps.onRunEvent?.(runEventPushPayloadSchema.parse({
      ...summary,
      ...(nextStatus ? { status: nextStatus } : {})
    }))

    if (nextStatus && shouldEmitRunNotification) {
      emitRunNotificationCandidate({
        conversationId: input.conversationId,
        runId: input.runId,
        status: nextStatus
      })
    }

    if (nextStatus === "completed") {
      persistAssistantCacheFromRunEvents(input.conversationId, input.runId)
    }

    return summary
  }

  const appendRunArtifact = (input: AppendRunArtifactInput): ArtifactSummary => {
    const run = database.db.select().from(executionRunsTable).where(eq(executionRunsTable.id, input.runId)).get() as
      | ExecutionRunRow
      | undefined
    if (!run || run.conversationId !== input.conversationId) {
      throw new Error(`Run ${input.runId} was not found for conversation ${input.conversationId}`)
    }

    const timestamp = now()
    const artifactId = randomUUID()
    database.db
      .insert(artifactsTable)
      .values({
        id: artifactId,
        conversationId: input.conversationId,
        runId: input.runId,
        kind: input.kind,
        title: input.title ?? null,
        uri: input.uri ?? null,
        payload: JSON.stringify(input.payload),
        createdAt: timestamp
      })
      .run()

    const artifact = database.db.select().from(artifactsTable).where(eq(artifactsTable.id, artifactId)).get() as ArtifactRow
    return createArtifactSummary(artifact)
  }

  const persistProviderRun = async (providerInput: ProviderRunInput) => {
    if (!runProvider) {
      return
    }

    const providerLogContext = {
      providerKind: providerInput.provider,
      accessMode: normalizeProviderAccessMode(providerInput.accessMode),
      conversationId: providerInput.conversationId,
      worktreeId: providerInput.worktreeId,
      worktreeRootPath: providerInput.worktreeRootPath,
      runId: providerInput.runId
    }

    try {
      logInfo("provider", "provider.run.started", providerLogContext)
      const streamedEventKeys = new Set<string>()
      let permissionCancelRequested = false
      const requestPermissionPause = () => {
        if (permissionCancelRequested) {
          return
        }

        permissionCancelRequested = true
        requestProviderCancellation(providerInput.runId, providerInput.conversationId)
        appendRunEvent({
          conversationId: providerInput.conversationId,
          runId: providerInput.runId,
          type: "run.status",
          payload: {
            status: "unavailable",
            reason: "provider-permission-required"
          },
          status: "unavailable"
        })
      }
      const providerRun = await runProvider({
        ...providerInput,
        onEvent: async (event) => {
          if (permissionCancelRequested) {
            return
          }

          appendRunEvent({
            conversationId: providerInput.conversationId,
            runId: providerInput.runId,
            type: event.type,
            payload: event.payload,
            status: event.status,
            providerEventId: readStringValue(event.payload.providerEventId) ?? undefined
          })
          streamedEventKeys.add(createProviderRunEventKey(event))

          if (
            isClaudePermissionPromptEvent(event, providerInput.allowedTools) ||
            isClaudePermissionDeniedEvent(event)
          ) {
            requestPermissionPause()
          }
        }
      })

      if (providerRun.sessionId) {
        database.db
          .update(conversationsTable)
          .set({ providerSessionId: providerRun.sessionId })
          .where(eq(conversationsTable.id, providerInput.conversationId))
          .run()
      }

      for (const event of providerRun.events) {
        if (streamedEventKeys.has(createProviderRunEventKey(event))) {
          continue
        }

        appendRunEvent({
          conversationId: providerInput.conversationId,
          runId: providerInput.runId,
          type: event.type,
          payload: event.payload,
          status: event.status,
          providerEventId: readStringValue(event.payload.providerEventId) ?? undefined
        })
      }

      const finalRunStatus = permissionCancelRequested ? "unavailable" : providerRun.status
      const latest = getConversationById(providerInput.conversationId)
      if (latest && latest.runStatus !== finalRunStatus) {
        appendRunEvent({
          conversationId: providerInput.conversationId,
          runId: providerInput.runId,
          type: "run.status",
          payload: {
            status: finalRunStatus,
            ...(permissionCancelRequested ? { reason: "provider-permission-required" } : {})
          },
          status: finalRunStatus
        })
      }
      logInfo("provider", `provider.run.${finalRunStatus}`, providerLogContext)
    } catch (error) {
      logError("provider", "provider.run.failed", buildAppError(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : String(error)
      ), providerLogContext)
      appendRunEvent({
        conversationId: providerInput.conversationId,
        runId: providerInput.runId,
        type: "run.error",
        payload: {
          provider: providerInput.provider,
          conversationId: providerInput.conversationId,
          worktreeId: providerInput.worktreeId,
          worktreeRootPath: providerInput.worktreeRootPath,
          runId: providerInput.runId,
          rawType: "provider-runtime.exception",
          raw: error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
          message: error instanceof Error ? error.message : String(error)
        },
        status: "failed"
      })
    } finally {
      await dispatchNextQueuedConversationMessage(providerInput.conversationId)
    }
  }

  const startProviderRun = (providerInput: ProviderRunInput) => {
    const started = providerRunTasks.start(providerInput.runId, async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      await persistProviderRun(providerInput)
    })
    if (!started) {
      logError("provider", "provider.run.background-task.rejected", buildAppError(
        "INTERNAL_ERROR",
        `Provider run ${providerInput.runId} could not be scheduled`
      ), {
        conversationId: providerInput.conversationId,
        runId: providerInput.runId
      })
    }
  }

  const enqueueConversationMessage = (
    conversation: ConversationRow,
    input: SendConversationMessageInput
  ): SendConversationMessageResult => {
    const timestamp = now()
    const queuedMessageId = randomUUID()
    const preparedAttachments = prepareConversationAttachments(
      conversation.id,
      queuedMessageId,
      input.attachments ?? [],
      timestamp
    )
    if (preparedAttachments.error) {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: preparedAttachments.error
      })
    }

    const queuedAttachments: QueuedConversationMessageAttachmentRow[] = preparedAttachments.attachments.map((attachment) => ({
      id: attachment.id,
      queuedMessageId,
      conversationId: attachment.conversationId,
      kind: attachment.kind,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      position: attachment.position,
      storagePath: attachment.storagePath,
      createdAt: attachment.createdAt
    }))
    let queuedMessage: QueuedConversationMessageRow | null = null

    try {
      database.db.transaction((tx) => {
        const existingRows = tx
          .select()
          .from(queuedConversationMessagesTable)
          .where(eq(queuedConversationMessagesTable.conversationId, conversation.id))
          .all() as QueuedConversationMessageRow[]
        const position = existingRows.reduce((largest, row) => Math.max(largest, row.position), 0) + 1
        queuedMessage = {
          id: queuedMessageId,
          conversationId: conversation.id,
          content: input.content,
          position,
          createdAt: timestamp
        }

        tx.insert(queuedConversationMessagesTable).values(queuedMessage).run()
        if (queuedAttachments.length > 0) {
          tx.insert(queuedConversationMessageAttachmentsTable).values(queuedAttachments).run()
        }
      })
    } catch (error) {
      if (preparedAttachments.directory) {
        rmSync(preparedAttachments.directory, { recursive: true, force: true })
      }
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          error instanceof Error ? error.message : String(error)
        )
      })
    }
    if (!queuedMessage) {
      if (preparedAttachments.directory) {
        rmSync(preparedAttachments.directory, { recursive: true, force: true })
      }
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError("INTERNAL_ERROR", "Queued message was not persisted")
      })
    }

    return sendConversationMessageResultSchema.parse({
      status: "queued",
      queuedMessage: createQueuedConversationMessageSummary(queuedMessage, queuedAttachments),
      timeline: buildConversationTimeline(conversation.id),
      context: getAppContext()
    })
  }

  const deleteQueuedConversationMessage = async (
    rawInput: DeleteQueuedConversationMessageInput
  ): Promise<DeleteQueuedConversationMessageResult> => {
    const input = deleteQueuedConversationMessageInputSchema.parse(rawInput)
    const conversation = getConversationById(input.conversationId)
    if (!conversation) {
      return deleteQueuedConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${input.conversationId}`)
      })
    }

    const queuedMessage = database.db
      .select()
      .from(queuedConversationMessagesTable)
      .where(and(
        eq(queuedConversationMessagesTable.id, input.queuedMessageId),
        eq(queuedConversationMessagesTable.conversationId, input.conversationId)
      ))
      .get() as QueuedConversationMessageRow | undefined
    if (queuedMessage) {
      database.db
        .delete(queuedConversationMessagesTable)
        .where(eq(queuedConversationMessagesTable.id, queuedMessage.id))
        .run()
      rmSync(join(conversationAttachmentRoot, input.conversationId, input.queuedMessageId), {
        recursive: true,
        force: true
      })
    }

    if (conversation.runStatus !== "running" && conversation.runStatus !== "unavailable") {
      await dispatchNextQueuedConversationMessage(conversation.id)
    }

    return deleteQueuedConversationMessageResultSchema.parse({
      status: "ok",
      timeline: buildConversationTimeline(input.conversationId)
    })
  }

  const queuedConversationDispatches = new Set<string>()
  let queueDispatchEnabled = true

  const getNextConversationRunTimestamp = (conversationId: string) => {
    const candidate = now()
    const latestRun = database.db
      .select()
      .from(executionRunsTable)
      .where(eq(executionRunsTable.conversationId, conversationId))
      .orderBy(desc(executionRunsTable.createdAt))
      .limit(1)
      .get() as ExecutionRunRow | undefined
    if (!latestRun || candidate > latestRun.createdAt) {
      return candidate
    }

    const latestEpoch = Date.parse(latestRun.createdAt)
    return Number.isFinite(latestEpoch) ? new Date(latestEpoch + 1).toISOString() : candidate
  }

  const sendConversationMessage = async (
    rawInput: SendConversationMessageInput,
    options: { queuedMessageId?: string } = {}
  ): Promise<SendConversationMessageResult> => {
    const queuedMessage = options.queuedMessageId
      ? database.db
          .select()
          .from(queuedConversationMessagesTable)
          .where(eq(queuedConversationMessagesTable.id, options.queuedMessageId))
          .get() as QueuedConversationMessageRow | undefined
      : undefined
    if (options.queuedMessageId && !queuedMessage) {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_SELECTION_FAILED", QUEUED_MESSAGE_NOT_FOUND_SENTINEL)
      })
    }

    const input: SendConversationMessageInput = queuedMessage
      ? {
          conversationId: queuedMessage.conversationId,
          content: queuedMessage.content
        }
      : sendConversationMessageInputSchema.parse(rawInput)
    const messageAttachments = queuedMessage ? [] : input.attachments ?? []
    const queuedAttachments = queuedMessage ? getQueuedMessageAttachmentRows([queuedMessage.id]) : []
    const conversation = getConversationById(input.conversationId)
    if (!conversation) {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${input.conversationId}`)
      })
    }
    const parsedProvider = providerKindSchema.safeParse(conversation.provider)
    if (!parsedProvider.success) {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Conversation ${input.conversationId} has unknown provider ${conversation.provider}`
        )
      })
    }
    const parsedSlashCommand = parseProviderSlashCommand(parsedProvider.data, input.content)
    if (parsedSlashCommand.status === "local") {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Slash command /${parsedSlashCommand.invocation.name} must be handled by TeamCow before provider dispatch`
        )
      })
    }
    if (parsedSlashCommand.status === "error") {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Slash command /${parsedSlashCommand.invocation.name} is invalid for ${parsedProvider.data}: ${parsedSlashCommand.code}${parsedSlashCommand.expected ? ` (${parsedSlashCommand.expected})` : ""}`
        )
      })
    }
    const providerPrompt = parsedSlashCommand.status === "run"
      ? parsedSlashCommand.prompt
      : input.content.trim()
    const hasMessageAttachments = queuedMessage ? queuedAttachments.length > 0 : messageAttachments.length > 0
    if (parsedSlashCommand.status === "run" && providerPrompt.length === 0 && !hasMessageAttachments) {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Slash command /${parsedSlashCommand.invocation.name} requires a prompt or attachment`
        )
      })
    }
    const hasActiveRun = conversation.runStatus === "running" || hasRunningExecutionRun(conversation.id)
    const hasPendingQueue = Boolean(database.db
      .select()
      .from(queuedConversationMessagesTable)
      .where(eq(queuedConversationMessagesTable.conversationId, conversation.id))
      .get())
    if (!queuedMessage && (hasActiveRun || hasPendingQueue)) {
      const result = enqueueConversationMessage(conversation, input)
      if (result.status === "queued" && !hasActiveRun) {
        await dispatchNextQueuedConversationMessage(conversation.id)
        return sendConversationMessageResultSchema.parse({
          ...result,
          timeline: buildConversationTimeline(conversation.id),
          context: getAppContext()
        })
      }
      return result
    }
    if (hasActiveRun) {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildConversationRunInProgressError(conversation.id)
      })
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Conversation ${input.conversationId} is missing worktree ${conversation.worktreeId}`
        )
      })
    }
    const model = conversation.currentModel
    if (!model || !(await isAllowedModelForProvider(parsedProvider.data, model))) {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Conversation ${input.conversationId} has no valid model for provider ${parsedProvider.data}`
        )
      })
    }

    const timestamp = getNextConversationRunTimestamp(conversation.id)
    const messageId = queuedMessage?.id ?? randomUUID()
    const runId = randomUUID()
    const eventId = randomUUID()
    const preparedAttachments = queuedMessage
      ? {
          attachments: queuedAttachments.map((attachment): PreparedConversationAttachment => ({
            id: attachment.id,
            messageId,
            conversationId: attachment.conversationId,
            kind: attachment.kind,
            name: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            position: attachment.position,
            storagePath: attachment.storagePath,
            createdAt: attachment.createdAt
          })),
          directory: null,
          error: null
        }
      : prepareConversationAttachments(
          conversation.id,
          messageId,
          messageAttachments,
          timestamp
        )
    if (preparedAttachments.error) {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: preparedAttachments.error
      })
    }

    // Use the first user message as the conversation title so the sidebar
    // shows meaningful context instead of the auto-generated "provider HH:MM".
    const hasExistingMessages = Boolean(
      database.db.select().from(conversationMessagesTable)
        .where(eq(conversationMessagesTable.conversationId, conversation.id))
        .get()
    )
    const autoTitle = hasExistingMessages
      ? null
      : (providerPrompt || queuedAttachments[0]?.name || messageAttachments[0]?.name || "").slice(0, 80)

    try {
      database.db.transaction((tx) => {
        const liveConversation = tx
          .select()
          .from(conversationsTable)
          .where(eq(conversationsTable.id, conversation.id))
          .get() as ConversationRow | undefined
        const liveRuns = tx
          .select()
          .from(executionRunsTable)
          .where(eq(executionRunsTable.conversationId, conversation.id))
          .all() as ExecutionRunRow[]
        assertConversationNotRunningForTransaction(liveConversation, liveRuns)
        if (queuedMessage) {
          const liveQueuedMessage = tx
            .select()
            .from(queuedConversationMessagesTable)
            .where(and(
              eq(queuedConversationMessagesTable.id, queuedMessage.id),
              eq(queuedConversationMessagesTable.conversationId, conversation.id)
            ))
            .get() as QueuedConversationMessageRow | undefined
          if (!liveQueuedMessage) {
            throw new Error(QUEUED_MESSAGE_NOT_FOUND_SENTINEL)
          }
        }

        tx
          .insert(executionRunsTable)
          .values({
            id: runId,
            conversationId: conversation.id,
            provider: parsedProvider.data,
            model,
            worktreeId: conversation.worktreeId,
            status: runProvider ? "running" : "unavailable",
            startedAt: timestamp,
            completedAt: runProvider ? null : timestamp,
            createdAt: timestamp,
            updatedAt: timestamp
          })
          .run()

        tx
          .insert(conversationMessagesTable)
          .values({
            id: messageId,
            conversationId: conversation.id,
            role: "user",
            content: input.content,
            model,
            runId,
            createdAt: timestamp
          })
          .run()

        if (preparedAttachments.attachments.length > 0) {
          tx
            .insert(conversationMessageAttachmentsTable)
            .values(preparedAttachments.attachments)
            .run()
        }

        if (queuedMessage) {
          tx
            .delete(queuedConversationMessagesTable)
            .where(eq(queuedConversationMessagesTable.id, queuedMessage.id))
            .run()
        }

        tx
          .insert(runEventsTable)
          .values({
            id: eventId,
            conversationId: conversation.id,
            runId,
            sequence: 1,
            type: "system.status",
            payload: JSON.stringify({
              status: "unavailable",
              reason: runProvider ? "provider-runtime-starting" : "provider-runtime-not-connected"
            }),
            createdAt: timestamp
          })
          .run()

        tx
          .update(conversationsTable)
          .set({
            runStatus: runProvider ? "running" : "unavailable",
            updatedAt: timestamp,
            ...(autoTitle ? { title: autoTitle } : {})
          })
          .where(eq(conversationsTable.id, conversation.id))
          .run()

        deps.afterSendConversationMessagePersist?.({
          conversationId: conversation.id,
          runId,
          messageId
        })
      })
    } catch (error) {
      if (preparedAttachments.directory) {
        rmSync(preparedAttachments.directory, { recursive: true, force: true })
      }
      if (error instanceof Error && error.message === RUN_IN_PROGRESS_SENTINEL) {
        if (!queuedMessage) {
          return enqueueConversationMessage(conversation, input)
        }
        return sendConversationMessageResultSchema.parse({
          status: "error",
          error: buildConversationRunInProgressError(conversation.id)
        })
      }

      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          error instanceof Error ? error.message : String(error)
        )
      })
    }

    const initialEvent = database.db
      .select()
      .from(runEventsTable)
      .where(eq(runEventsTable.id, eventId))
      .get() as RunEventRow | undefined
    if (initialEvent) {
      deps.onRunEvent?.(runEventPushPayloadSchema.parse({
        ...createRunEventSummary(initialEvent, parsedProvider.data),
        status: runProvider ? "running" : "unavailable"
      }))
    }

    if (runProvider) {
      const providerInput: ProviderRunInput = {
        provider: parsedProvider.data,
        model,
        accessMode: normalizeProviderAccessMode(conversation.accessMode),
        prompt: providerPrompt || "Review the attached file or image.",
        attachments: getProviderAttachmentsForMessage(messageId),
        ...(parsedSlashCommand.status === "run" ? { options: parsedSlashCommand.options } : {}),
        worktreeRootPath: worktree.rootPath,
        worktreeId: worktree.id,
        conversationId: conversation.id,
        runId,
        sessionId: conversation.providerSessionId ?? undefined
      }

      startProviderRun(providerInput)
    }

    const updated = getConversationById(conversation.id)
    if (!updated) {
      return sendConversationMessageResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation ${conversation.id} could not be reloaded`)
      })
    }

    const isCurrent =
      getCurrentProjectId() === updated.projectId && getCurrentConversationId() === updated.id

    return sendConversationMessageResultSchema.parse({
      status: "accepted",
      conversation: createConversationSummary(updated, worktree, isCurrent),
      timeline: buildConversationTimeline(conversation.id),
      context: getAppContext()
    })
  }

  const dispatchNextQueuedConversationMessage = async (conversationId: string) => {
    if (!queueDispatchEnabled || !runProvider || queuedConversationDispatches.has(conversationId)) {
      return
    }

    queuedConversationDispatches.add(conversationId)
    let retryAfterMissingMessage = false
    try {
      const conversation = getConversationById(conversationId)
      if (
        !conversation ||
        conversation.runStatus === "running" ||
        conversation.runStatus === "unavailable" ||
        hasRunningExecutionRun(conversationId)
      ) {
        return
      }

      const nextMessage = (database.db
        .select()
        .from(queuedConversationMessagesTable)
        .where(eq(queuedConversationMessagesTable.conversationId, conversationId))
        .all() as QueuedConversationMessageRow[])
        .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))[0]
      if (!nextMessage) {
        return
      }

      const result = await sendConversationMessage({
        conversationId,
        content: nextMessage.content
      }, { queuedMessageId: nextMessage.id })
      if (result.status === "error" && result.error.message === QUEUED_MESSAGE_NOT_FOUND_SENTINEL) {
        retryAfterMissingMessage = true
      } else if (result.status === "error") {
        logError("provider", "provider.queue.dispatch.failed", result.error, {
          conversationId,
          queuedMessageId: nextMessage.id
        })
      }
    } finally {
      queuedConversationDispatches.delete(conversationId)
      if (retryAfterMissingMessage) {
        queueMicrotask(() => void dispatchNextQueuedConversationMessage(conversationId))
      }
    }
  }

  const retryConversationRunWithPermissions = async (
    rawInput: unknown
  ) => {
    const input = retryConversationRunWithPermissionsInputSchema.parse(rawInput)
    const conversation = getConversationById(input.conversationId)
    if (!conversation) {
      return retryConversationRunWithPermissionsResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${input.conversationId}`)
      })
    }
    if (conversation.runStatus === "running" || hasRunningExecutionRun(conversation.id)) {
      return retryConversationRunWithPermissionsResultSchema.parse({
        status: "error",
        error: buildConversationRunInProgressError(conversation.id)
      })
    }

    const previousRun = database.db
      .select()
      .from(executionRunsTable)
      .where(eq(executionRunsTable.id, input.runId))
      .get() as ExecutionRunRow | undefined
    if (!previousRun || previousRun.conversationId !== conversation.id) {
      return retryConversationRunWithPermissionsResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_SELECTION_FAILED", `Run ${input.runId} was not found for conversation ${conversation.id}`)
      })
    }

    const originalMessage = (database.db
      .select()
      .from(conversationMessagesTable)
      .where(eq(conversationMessagesTable.runId, input.runId))
      .all() as ConversationMessageRow[])
      .find((message) => message.conversationId === conversation.id && message.role === "user")
    if (!originalMessage) {
      return retryConversationRunWithPermissionsResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_SELECTION_FAILED", `Run ${input.runId} has no user prompt to retry`)
      })
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return retryConversationRunWithPermissionsResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Conversation ${input.conversationId} is missing worktree ${conversation.worktreeId}`
        )
      })
    }

    const parsedProvider = providerKindSchema.safeParse(conversation.provider)
    if (!parsedProvider.success) {
      return retryConversationRunWithPermissionsResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Conversation ${input.conversationId} has unknown provider ${conversation.provider}`
        )
      })
    }

    const parsedSlashCommand = parseProviderSlashCommand(parsedProvider.data, originalMessage.content)
    if (parsedSlashCommand.status === "local" || parsedSlashCommand.status === "error") {
      return retryConversationRunWithPermissionsResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Run ${input.runId} contains a slash command that cannot be retried for ${parsedProvider.data}`
        )
      })
    }
    const providerPrompt = parsedSlashCommand.status === "run"
      ? parsedSlashCommand.prompt
      : originalMessage.content.trim()

    const model = conversation.currentModel
    if (!model || !(await isAllowedModelForProvider(parsedProvider.data, model))) {
      return retryConversationRunWithPermissionsResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Conversation ${input.conversationId} has no valid model for provider ${parsedProvider.data}`
        )
      })
    }

    const timestamp = now()
    const runId = randomUUID()
    const eventId = randomUUID()

    try {
      database.db.transaction((tx) => {
        const liveConversation = tx
          .select()
          .from(conversationsTable)
          .where(eq(conversationsTable.id, conversation.id))
          .get() as ConversationRow | undefined
        const liveRuns = tx
          .select()
          .from(executionRunsTable)
          .where(eq(executionRunsTable.conversationId, conversation.id))
          .all() as ExecutionRunRow[]
        assertConversationNotRunningForTransaction(liveConversation, liveRuns)

        tx
          .insert(executionRunsTable)
          .values({
            id: runId,
            conversationId: conversation.id,
            provider: parsedProvider.data,
            model,
            worktreeId: conversation.worktreeId,
            status: runProvider ? "running" : "unavailable",
            startedAt: timestamp,
            completedAt: runProvider ? null : timestamp,
            createdAt: timestamp,
            updatedAt: timestamp
          })
          .run()

        tx
          .insert(runEventsTable)
          .values({
            id: eventId,
            conversationId: conversation.id,
            runId,
            sequence: 1,
            type: "system.status",
            payload: JSON.stringify({
              status: "unavailable",
              reason: runProvider ? "provider-permission-retry-starting" : "provider-runtime-not-connected",
              allowedTools: input.allowedTools
            }),
            createdAt: timestamp
          })
          .run()

        tx
          .update(conversationsTable)
          .set({
            runStatus: runProvider ? "running" : "unavailable",
            updatedAt: timestamp
          })
          .where(eq(conversationsTable.id, conversation.id))
          .run()
      })
    } catch (error) {
      if (error instanceof Error && error.message === RUN_IN_PROGRESS_SENTINEL) {
        return retryConversationRunWithPermissionsResultSchema.parse({
          status: "error",
          error: buildConversationRunInProgressError(conversation.id)
        })
      }

      return retryConversationRunWithPermissionsResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          error instanceof Error ? error.message : String(error)
        )
      })
    }

    if (runProvider) {
      const providerInput: ProviderRunInput = {
        provider: parsedProvider.data,
        model,
        accessMode: normalizeProviderAccessMode(conversation.accessMode),
        prompt: providerPrompt || "Review the attached file or image.",
        attachments: getProviderAttachmentsForMessage(originalMessage.id),
        ...(parsedSlashCommand.status === "run" ? { options: parsedSlashCommand.options } : {}),
        allowedTools: input.allowedTools,
        worktreeRootPath: worktree.rootPath,
        worktreeId: worktree.id,
        conversationId: conversation.id,
        runId,
        sessionId: conversation.providerSessionId ?? undefined
      }

      startProviderRun(providerInput)
    }

    const updated = getConversationById(conversation.id)
    if (!updated) {
      return retryConversationRunWithPermissionsResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation ${conversation.id} could not be reloaded`)
      })
    }

    const isCurrent =
      getCurrentProjectId() === updated.projectId && getCurrentConversationId() === updated.id

    return retryConversationRunWithPermissionsResultSchema.parse({
      status: "accepted",
      conversation: createConversationSummary(updated, worktree, isCurrent),
      timeline: buildConversationTimeline(conversation.id),
      context: getAppContext()
    })
  }

  const cancelConversationRun = async (
    rawInput: CancelConversationRunInput
  ): Promise<CancelConversationRunResult> => {
    const input = cancelConversationRunInputSchema.parse(rawInput)
    const conversation = getConversationById(input.conversationId)
    if (!conversation || conversation.runStatus !== "running") {
      return cancelConversationRunResultSchema.parse({ status: "not-running" })
    }

    const activeRun = (database.db
      .select()
      .from(executionRunsTable)
      .where(eq(executionRunsTable.conversationId, input.conversationId))
      .all() as ExecutionRunRow[])
      .filter((run) => run.status === "running")
      .sort((left, right) => compareTimelineText(right.startedAt, left.startedAt))[0]

    if (!activeRun) {
      return cancelConversationRunResultSchema.parse({ status: "not-running" })
    }

    const cancelled = requestProviderCancellation(activeRun.id, input.conversationId)
    if (!cancelled) {
      appendRunEvent({
        conversationId: input.conversationId,
        runId: activeRun.id,
        type: "run.interrupted",
        payload: {
          status: "interrupted",
          reason: "provider-process-missing"
        },
        status: "interrupted"
      })
      await dispatchNextQueuedConversationMessage(input.conversationId)
      return cancelConversationRunResultSchema.parse({ status: "ok" })
    }

    appendRunEvent({
      conversationId: input.conversationId,
      runId: activeRun.id,
      type: "run.interrupted",
      payload: {
        status: "interrupted",
        reason: "cancelled-by-user"
      },
      status: "interrupted"
    })

    return cancelConversationRunResultSchema.parse({ status: "ok" })
  }

  const selectConversation = async (conversationId: string): Promise<SelectConversationResult> => {
    const conversation = getConversationById(conversationId)
    if (!conversation) {
      return {
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${conversationId}`)
      }
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return {
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Conversation ${conversationId} is missing worktree ${conversation.worktreeId}`
        )
      }
    }

    setCurrentProjectId(conversation.projectId)
    setCurrentConversationId(conversation.id)

    return {
      status: "ok",
      context: getAppContext()
    }
  }

  const setConversationModel = async (rawInput: SetConversationModelInput): Promise<SetConversationModelResult> => {
    const input = setConversationModelInputSchema.parse(rawInput)
    const conversation = getConversationById(input.conversationId)
    if (!conversation) {
      return setConversationModelResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${input.conversationId}`)
      })
    }
    if (conversation.runStatus === "running" || hasRunningExecutionRun(conversation.id)) {
      return setConversationModelResultSchema.parse({
        status: "error",
        error: buildConversationRunInProgressError(conversation.id)
      })
    }

    const parsedProvider = providerKindSchema.safeParse(conversation.provider)
    if (!parsedProvider.success) {
      return setConversationModelResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Conversation ${input.conversationId} has unknown provider ${conversation.provider}`
        )
      })
    }

    const providerKind: ProviderKind = parsedProvider.data
    if (!(await isAllowedModelForProvider(providerKind, input.model))) {
      return setConversationModelResultSchema.parse({
        status: "error",
        error: buildAppError(
          "PROVIDER_NOT_READY",
          `Model ${input.model} is not registered for provider ${providerKind}`
        )
      })
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return setConversationModelResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Conversation ${input.conversationId} is missing worktree ${conversation.worktreeId}`
        )
      })
    }

    const timestamp = now()
    try {
      database.db.transaction((tx) => {
        const liveConversation = tx
          .select()
          .from(conversationsTable)
          .where(eq(conversationsTable.id, input.conversationId))
          .get() as ConversationRow | undefined
        const liveRuns = tx
          .select()
          .from(executionRunsTable)
          .where(eq(executionRunsTable.conversationId, input.conversationId))
          .all() as ExecutionRunRow[]
        assertConversationNotRunningForTransaction(liveConversation, liveRuns)

        tx
          .update(conversationsTable)
          .set({
            currentModel: input.model,
            updatedAt: timestamp
          })
          .where(eq(conversationsTable.id, input.conversationId))
          .run()
      })
    } catch (error) {
      if (error instanceof Error && error.message === RUN_IN_PROGRESS_SENTINEL) {
        return setConversationModelResultSchema.parse({
          status: "error",
          error: buildConversationRunInProgressError(conversation.id)
        })
      }

      return setConversationModelResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          error instanceof Error ? error.message : String(error)
        )
      })
    }

    const updated = getConversationById(input.conversationId)
    if (!updated) {
      return setConversationModelResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_NOT_FOUND",
          `Conversation ${input.conversationId} could not be reloaded after model update`
        )
      })
    }

    const isCurrent =
      getCurrentProjectId() === updated.projectId && getCurrentConversationId() === updated.id

    return setConversationModelResultSchema.parse({
      status: "ok",
      conversation: createConversationSummary(updated, worktree, isCurrent),
      context: getAppContext()
    })
  }

  const setConversationAccessMode = async (
    rawInput: SetConversationAccessModeInput
  ): Promise<SetConversationAccessModeResult> => {
    const input = setConversationAccessModeInputSchema.parse(rawInput)
    const conversation = getConversationById(input.conversationId)
    if (!conversation) {
      return setConversationAccessModeResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${input.conversationId}`)
      })
    }
    if (conversation.runStatus === "running" || hasRunningExecutionRun(conversation.id)) {
      return setConversationAccessModeResultSchema.parse({
        status: "error",
        error: buildConversationRunInProgressError(conversation.id)
      })
    }

    const worktree = getWorktreeById(conversation.worktreeId)
    if (!worktree) {
      return setConversationAccessModeResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          `Conversation ${input.conversationId} is missing worktree ${conversation.worktreeId}`
        )
      })
    }

    const timestamp = now()
    try {
      database.db.transaction((tx) => {
        const liveConversation = tx
          .select()
          .from(conversationsTable)
          .where(eq(conversationsTable.id, input.conversationId))
          .get() as ConversationRow | undefined
        const liveRuns = tx
          .select()
          .from(executionRunsTable)
          .where(eq(executionRunsTable.conversationId, input.conversationId))
          .all() as ExecutionRunRow[]
        assertConversationNotRunningForTransaction(liveConversation, liveRuns)

        tx
          .update(conversationsTable)
          .set({
            accessMode: input.accessMode,
            updatedAt: timestamp
          })
          .where(eq(conversationsTable.id, input.conversationId))
          .run()
      })
    } catch (error) {
      if (error instanceof Error && error.message === RUN_IN_PROGRESS_SENTINEL) {
        return setConversationAccessModeResultSchema.parse({
          status: "error",
          error: buildConversationRunInProgressError(conversation.id)
        })
      }

      return setConversationAccessModeResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          error instanceof Error ? error.message : String(error)
        )
      })
    }

    const updated = getConversationById(input.conversationId)
    if (!updated) {
      return setConversationAccessModeResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_NOT_FOUND",
          `Conversation ${input.conversationId} could not be reloaded after access mode update`
        )
      })
    }

    const isCurrent =
      getCurrentProjectId() === updated.projectId && getCurrentConversationId() === updated.id

    return setConversationAccessModeResultSchema.parse({
      status: "ok",
      conversation: createConversationSummary(updated, worktree, isCurrent),
      context: getAppContext()
    })
  }

  const renameConversation = async (
    rawInput: RenameConversationInput
  ): Promise<RenameConversationResult> => {
    const input = renameConversationInputSchema.parse(rawInput)
    const conversation = getConversationById(input.conversationId)
    if (!conversation) {
      return renameConversationResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${input.conversationId}`, null, {
          domain: "conversation",
          context: { conversationId: input.conversationId }
        })
      })
    }

    const timestamp = now()
    database.db
      .update(conversationsTable)
      .set({
        title: input.title,
        updatedAt: timestamp
      })
      .where(eq(conversationsTable.id, input.conversationId))
      .run()

    const updated = getConversationById(input.conversationId)
    if (!updated) {
      return renameConversationResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_RENAME_FAILED",
          `Conversation ${input.conversationId} could not be reloaded after rename`,
          null,
          { domain: "conversation", context: { conversationId: input.conversationId } }
        )
      })
    }

    const worktree = getWorktreeById(updated.worktreeId)
    if (!worktree) {
      return renameConversationResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_RENAME_FAILED",
          `Conversation ${input.conversationId} is missing worktree ${updated.worktreeId}`,
          null,
          { domain: "conversation", context: { conversationId: input.conversationId } }
        )
      })
    }

    const isCurrent =
      getCurrentProjectId() === updated.projectId && getCurrentConversationId() === updated.id

    return renameConversationResultSchema.parse({
      status: "ok",
      conversation: createConversationSummary(updated, worktree, isCurrent),
      context: getAppContext()
    })
  }

  const deleteConversation = async (
    rawInput: DeleteConversationInput
  ): Promise<DeleteConversationResult> => {
    const input = deleteConversationInputSchema.parse(rawInput)
    const conversation = getConversationById(input.conversationId)
    if (!conversation) {
      return deleteConversationResultSchema.parse({
        status: "error",
        error: buildAppError("CONVERSATION_NOT_FOUND", `Conversation id was not found: ${input.conversationId}`, null, {
          domain: "conversation",
          context: { conversationId: input.conversationId }
        })
      })
    }

    // Terminate any in-flight provider run before tearing down its data.
    if (conversation.runStatus === "running") {
      const activeRun = (database.db
        .select()
        .from(executionRunsTable)
        .where(eq(executionRunsTable.conversationId, input.conversationId))
        .all() as ExecutionRunRow[])
        .filter((run) => run.status === "running")
        .sort((left, right) => compareTimelineText(right.startedAt, left.startedAt))[0]
      if (activeRun) {
        requestProviderCancellation(activeRun.id, input.conversationId)
      } else {
        deps.cancelProviderRun?.(input.conversationId)
      }
    }

    const conversationId = conversation.id
    const projectId = conversation.projectId

    // Cascade-delete conversation-scoped rows. Worktree is intentionally
    // preserved: it may hold unmerged work and is decoupled from the
    // conversation lifecycle.
    database.db.transaction((tx) => {
      tx.delete(runEventsTable).where(eq(runEventsTable.conversationId, conversationId)).run()
      tx.delete(artifactsTable).where(eq(artifactsTable.conversationId, conversationId)).run()
      tx
        .delete(conversationMessageAttachmentsTable)
        .where(eq(conversationMessageAttachmentsTable.conversationId, conversationId))
        .run()
      tx
        .delete(conversationMessagesTable)
        .where(eq(conversationMessagesTable.conversationId, conversationId))
        .run()
      tx.delete(executionRunsTable).where(eq(executionRunsTable.conversationId, conversationId)).run()
      tx.delete(conversationsTable).where(eq(conversationsTable.id, conversationId)).run()
    })
    rmSync(join(conversationAttachmentRoot, conversationId), { recursive: true, force: true })

    // If the deleted conversation was selected, fall back to another
    // conversation in the same project, else clear the selection.
    if (getCurrentConversationId() === conversationId) {
      const remaining = (database.db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.projectId, projectId))
        .all() as ConversationRow[]
      ).filter((row) => row.id !== conversationId)
      setCurrentConversationId(remaining[0]?.id ?? null)
    }

    return deleteConversationResultSchema.parse({
      status: "deleted",
      conversationId,
      context: getAppContext()
    })
  }



  const resolveExecutionTargetWorktree = async (
    project: ProjectRow,
    executionTarget: ExecutionTarget
  ): Promise<{
    worktree: WorktreeRow | null
    error: AppError | null
    cleanup?: () => Promise<void>
  }> => {
    if (executionTarget.type === "default") {
      const defaultWorktree = (database.db
        .select()
        .from(worktreesTable)
        .where(eq(worktreesTable.projectId, project.id))
        .all() as WorktreeRow[]
      ).find((worktree) => worktree.kind === DEFAULT_WORKTREE_KIND)

      return defaultWorktree
        ? { worktree: defaultWorktree, error: null }
        : {
            worktree: null,
            error: buildAppError("WORKTREE_NOT_FOUND", `Default worktree missing for project ${project.id}`)
          }
    }

    if (executionTarget.type === "existing-worktree") {
      const worktree = getWorktreeById(executionTarget.worktreeId)
      if (!worktree || worktree.projectId !== project.id) {
        return {
          worktree: null,
          error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${executionTarget.worktreeId} was not found`)
        }
      }
      return { worktree, error: null }
    }

    const branch = executionTarget.branch.trim()
    const existingWorktrees = listWorktreesByProject(project.id)
    if (existingWorktrees.some((worktree) => worktree.branch === branch)) {
      return {
        worktree: null,
        error: buildAppError("WORKTREE_BRANCH_EXISTS", `Worktree branch already exists: ${branch}`)
      }
    }

    const targetPath = createWorktreeRootPath(project.rootPath, branch)
    if (existsSync(targetPath)) {
      return {
        worktree: null,
        error: buildAppError("WORKTREE_PATH_EXISTS", `Worktree path already exists: ${targetPath}`)
      }
    }

    if (!(await gitBinaryAvailable())) {
      return {
        worktree: null,
        error: buildAppError("GIT_NOT_INSTALLED", "git is required to create a new worktree")
      }
    }

    const createError = await createWorktree(project.rootPath, branch, targetPath)
    if (createError) {
      logError("worktree", "worktree.create.failed", createError, {
        projectId: project.id,
        projectName: project.name,
        worktreeRootPath: targetPath,
        worktreeLabel: branch
      })
      return {
        worktree: null,
        error: createError
      }
    }

    const timestamp = now()
    const worktreeId = randomUUID()
    const persistedBranch = readGitBranch(targetPath) ?? branch

    database.db
      .insert(worktreesTable)
      .values({
        id: worktreeId,
        projectId: project.id,
        kind: GIT_WORKTREE_KIND,
        rootPath: targetPath,
        branch: persistedBranch,
        status: "ready",
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .run()

    const cleanup = async () => {
      database.db.delete(worktreesTable).where(eq(worktreesTable.id, worktreeId)).run()

      try {
        const cleanupError = await removeWorktree(project.rootPath, targetPath)
        if (cleanupError && existsSync(targetPath)) {
          rmSync(targetPath, { recursive: true, force: true })
        }
      } catch {
        // Best effort cleanup only. Surface the original error to the caller.
      }
    }

    const persistedWorktree = getWorktreeById(worktreeId) ?? null
    if (persistedWorktree) {
      logInfo("worktree", "worktree.create.completed", {
        projectId: project.id,
        projectName: project.name,
        worktreeId: persistedWorktree.id,
        worktreeRootPath: persistedWorktree.rootPath,
        worktreeLabel: persistedWorktree.branch ?? undefined
      })
    }

    return {
      worktree: persistedWorktree,
      error: null,
      cleanup
    }
  }

  const deleteWorktree = async (rawInput: DeleteWorktreeInput): Promise<DeleteWorktreeResult> => {
    const input = deleteWorktreeInputSchema.parse(rawInput)
    const project = getProjectById(input.projectId)
    if (!project) {
      return deleteWorktreeResultSchema.parse({
        status: "error",
        error: buildAppError("PROJECT_NOT_FOUND", `Project ${input.projectId} was not found`, null, {
          domain: "project",
          context: {
            projectId: input.projectId
          }
        })
      })
    }

    const worktree = getWorktreeById(input.worktreeId)
    if (!worktree || worktree.projectId !== project.id) {
      return deleteWorktreeResultSchema.parse({
        status: "error",
        error: buildAppError("WORKTREE_NOT_FOUND", `Worktree ${input.worktreeId} was not found`, null, {
          domain: "worktree",
          context: {
            projectId: project.id,
            projectName: project.name,
            worktreeId: input.worktreeId
          }
        })
      })
    }

    const worktreeSummary = listProjectWorktrees(project.id).find((candidate) => candidate.id === worktree.id)
    if (!worktreeSummary?.canDelete) {
      return deleteWorktreeResultSchema.parse({
        status: "error",
        error: buildAppError(
          "WORKTREE_IN_USE",
          worktree.kind === DEFAULT_WORKTREE_KIND
            ? `Default worktree cannot be deleted for project ${project.id}`
            : `Worktree ${worktree.id} is bound to ${worktreeSummary?.conversationCount ?? 0} conversation(s)`,
          null,
          {
            domain: "worktree",
            context: {
              projectId: project.id,
              projectName: project.name,
              worktreeId: worktree.id,
              worktreeRootPath: worktree.rootPath,
              worktreeLabel: worktree.branch ?? undefined
            }
          }
        )
      })
    }

    if (!deps.removeGitWorktree && !(await gitBinaryAvailable())) {
      return deleteWorktreeResultSchema.parse({
        status: "error",
        error: buildAppError("GIT_NOT_INSTALLED", "git is required to delete a worktree", null, {
          domain: "git",
          context: {
            projectId: project.id,
            projectName: project.name,
            worktreeId: worktree.id,
            worktreeRootPath: worktree.rootPath,
            worktreeLabel: worktree.branch ?? undefined
          }
        })
      })
    }

    const removeError = await removeWorktree(project.rootPath, worktree.rootPath)
    if (removeError) {
      deps.log?.error("worktree", "worktree.delete.failed", {
        projectId: project.id,
        projectName: project.name,
        worktreeId: worktree.id,
        worktreeRootPath: worktree.rootPath,
        errorCode: removeError.code,
        errorMessage: removeError.message
      })
      return deleteWorktreeResultSchema.parse({
        status: "error",
        error: addAppErrorContext(removeError, "worktree", {
          projectId: project.id,
          projectName: project.name,
          worktreeId: worktree.id,
          worktreeRootPath: worktree.rootPath,
          worktreeLabel: worktree.branch ?? undefined
        })
      })
    }

    try {
      database.db.delete(worktreesTable).where(eq(worktreesTable.id, worktree.id)).run()
    } finally {
      safelyUnwatchWorktree(worktree.id)
    }
    deps.log?.info("worktree", "worktree.delete.completed", {
      projectId: project.id,
      projectName: project.name,
      worktreeId: worktree.id,
      worktreeRootPath: worktree.rootPath
    })

    return deleteWorktreeResultSchema.parse({
      status: "deleted",
      projectId: project.id,
      worktreeId: worktree.id
    })
  }

  const createConversation = async (rawInput: CreateConversationInput): Promise<CreateConversationResult> => {
    const input = createConversationInputSchema.parse(rawInput)
    const project = getProjectById(input.projectId)

    if (!project) {
      return createConversationResultSchema.parse({
        status: "error",
        error: buildAppError("PROJECT_NOT_FOUND", `Project ${input.projectId} was not found`)
      })
    }

    const providerSnapshot = getProviderReadinessSnapshot?.()
    if (providerSnapshot) {
      const selectedProvider = providerSnapshot.providers.find((provider) => provider.kind === input.providerKind)
      if (!selectedProvider || selectedProvider.availability !== "ready") {
        return createConversationResultSchema.parse({
          status: "error",
          error: buildAppError("PROVIDER_NOT_READY", `Provider ${input.providerKind} is not ready`)
        })
      }
    } else if (!isReadyProviderKind(input.providerKind)) {
      return createConversationResultSchema.parse({
        status: "error",
        error: buildAppError("PROVIDER_NOT_READY", `Provider ${input.providerKind} is not ready`)
      })
    }

    if (!(await isAllowedModelForProvider(input.providerKind, input.model))) {
      return createConversationResultSchema.parse({
        status: "error",
        error: buildAppError(
          "PROVIDER_NOT_READY",
          `Model ${input.model} is not registered for provider ${input.providerKind}`
        )
      })
    }

    const target = await resolveExecutionTargetWorktree(project, executionTargetSchema.parse(input.executionTarget))
    if (target.error || !target.worktree) {
      return createConversationResultSchema.parse({
        status: "error",
        error: target.error ?? buildAppError("WORKTREE_NOT_FOUND", "Unable to resolve execution target")
      })
    }

    const timestamp = now()
    const conversationId = randomUUID()
    const accessMode = input.accessMode ?? DEFAULT_PROVIDER_ACCESS_MODE

    try {
      database.db
        .insert(conversationsTable)
        .values({
          id: conversationId,
          projectId: project.id,
          title: buildStableConversationTitle(input.providerKind, timestamp),
          worktreeId: target.worktree.id,
          provider: input.providerKind,
          currentModel: input.model,
          accessMode,
          runStatus: "idle",
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .run()

      setCurrentProjectId(project.id)
      setCurrentConversationId(conversationId)
      deps.afterCreateConversationPersist?.({
        conversationId,
        worktreeId: target.worktree.id
      })

      const conversation = getCurrentConversation()
      if (!conversation) {
        await target.cleanup?.()

        return createConversationResultSchema.parse({
          status: "error",
          error: buildAppError("CONVERSATION_SELECTION_FAILED", `Conversation ${conversationId} could not be loaded`)
        })
      }

      return createConversationResultSchema.parse({
        status: "created",
        conversation,
        context: getAppContext()
      })
    } catch (error) {
      await target.cleanup?.()

      return createConversationResultSchema.parse({
        status: "error",
        error: buildAppError(
          "CONVERSATION_SELECTION_FAILED",
          error instanceof Error ? error.message : String(error)
        )
      })
    }
  }

  const persistImportedProject = (
    rootPath: string,
    initializedGit: boolean,
    hooks?: {
      afterProjectInsert?: () => void
    }
  ) => {
    const timestamp = now()
    const projectId = randomUUID()
    const worktreeId = randomUUID()
    const projectName = readProjectName(rootPath)
    const branch = readGitBranch(rootPath)

    database.db.transaction((tx) => {
      tx
        .insert(projectsTable)
        .values({
          id: projectId,
          name: projectName,
          rootPath,
          status: "ready",
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .run()

      hooks?.afterProjectInsert?.()

      tx
        .insert(worktreesTable)
        .values({
          id: worktreeId,
          projectId,
          kind: DEFAULT_WORKTREE_KIND,
          rootPath,
          branch,
          status: "ready",
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .run()

      tx
        .insert(appSettingsTable)
        .values({
          key: CURRENT_PROJECT_SETTING_KEY,
          value: projectId,
          updatedAt: now()
        })
        .onConflictDoUpdate({
          target: appSettingsTable.key,
          set: {
            value: projectId,
            updatedAt: now()
          }
        })
        .run()
    })

    return {
      initializedGit,
      projectId
    }
  }

  const importProject = async (rawInput?: ImportProjectInput): Promise<ImportProjectResult> => {
    const input = importProjectInputSchema.parse(rawInput ?? {})
    const candidate = await resolveImportCandidate(input, deps)

    if (candidate.status === "cancelled") {
      return importProjectResultSchema.parse({
        status: "cancelled"
      })
    }

    if (candidate.status === "error") {
      return importProjectResultSchema.parse({
        status: "error",
        error: candidate.error
      })
    }

    const existingProject = getProjectByRootPath(candidate.rootPath)
    if (existingProject) {
      const hiddenProjectIds = readStringListSetting(HIDDEN_PROJECT_IDS_SETTING_KEY)
      const wasHidden = hiddenProjectIds.includes(existingProject.id)
      if (wasHidden) {
        persistStringListSetting(
          HIDDEN_PROJECT_IDS_SETTING_KEY,
          hiddenProjectIds.filter((projectId) => projectId !== existingProject.id)
        )
        setCurrentConversationId(null)
      }
      setCurrentProjectId(existingProject.id)
      const project = getProjectSummaryById(existingProject.id)
      if (!project) {
        return importProjectResultSchema.parse({
          status: "error",
          error: buildAppError(
            "PROJECT_NOT_FOUND",
            `Existing project ${existingProject.id} is missing its default worktree summary`
          )
        })
      }

      return importProjectResultSchema.parse({
        status: wasHidden ? "restored" : "existing",
        initializedGit: candidate.initializedGit,
        project,
        context: getAppContext()
      })
    }

    const persisted = persistImportedProject(candidate.rootPath, candidate.initializedGit)
    const project = getProjectSummaryById(persisted.projectId)
    if (!project) {
      return importProjectResultSchema.parse({
        status: "error",
        error: buildAppError("PROJECT_NOT_FOUND", `Imported project ${persisted.projectId} could not be reloaded`)
      })
    }

    return importProjectResultSchema.parse({
      status: "imported",
      initializedGit: persisted.initializedGit,
      project,
      context: getAppContext()
    })
  }

  const selectProject = async (projectId: string): Promise<SelectProjectResult> => {
    const project = getProjectById(projectId)
    const hiddenProjectIds = new Set(readStringListSetting(HIDDEN_PROJECT_IDS_SETTING_KEY))
    if (!project || hiddenProjectIds.has(projectId)) {
      return {
        status: "error",
        error: buildAppError("PROJECT_NOT_FOUND", `Selected project id was not found: ${projectId}`)
      }
    }

    setCurrentProjectId(project.id)
    return {
      status: "ok",
      context: getAppContext()
    }
  }

  const moveProject = (rawInput: MoveProjectInput): ProjectMutationResult => {
    const input = moveProjectInputSchema.parse(rawInput)
    const project = getProjectById(input.projectId)
    const hiddenProjectIds = new Set(readStringListSetting(HIDDEN_PROJECT_IDS_SETTING_KEY))
    if (!project || hiddenProjectIds.has(input.projectId)) {
      return projectMutationResultSchema.parse({
        status: "error",
        error: buildAppError("PROJECT_NOT_FOUND", `Project id was not found: ${input.projectId}`)
      })
    }

    const projectIds = getOrderedProjectRows(
      database.db.select().from(projectsTable).all() as ProjectRow[]
    ).map((projectRow) => projectRow.id)
    const remainingProjectIds = projectIds.filter((projectId) => projectId !== input.projectId)
    persistStringListSetting(
      PROJECT_ORDER_SETTING_KEY,
      input.position === "top"
        ? [input.projectId, ...remainingProjectIds]
        : [...remainingProjectIds, input.projectId]
    )

    return projectMutationResultSchema.parse({
      status: "ok",
      context: getAppContext()
    })
  }

  const removeProject = (projectId: string): ProjectMutationResult => {
    const project = getProjectById(projectId)
    const hiddenProjectIds = readStringListSetting(HIDDEN_PROJECT_IDS_SETTING_KEY)
    if (!project || hiddenProjectIds.includes(projectId)) {
      return projectMutationResultSchema.parse({
        status: "error",
        error: buildAppError("PROJECT_NOT_FOUND", `Project id was not found: ${projectId}`)
      })
    }

    persistStringListSetting(HIDDEN_PROJECT_IDS_SETTING_KEY, [...hiddenProjectIds, projectId])
    if (getCurrentProjectId() === projectId) {
      setCurrentProjectId(null)
      setCurrentConversationId(null)
    }

    return projectMutationResultSchema.parse({
      status: "ok",
      context: getAppContext()
    })
  }

  const revealProjectInFinder = async (projectId: string): Promise<RevealProjectInFinderResult> => {
    const project = getProjectById(projectId)
    const hiddenProjectIds = new Set(readStringListSetting(HIDDEN_PROJECT_IDS_SETTING_KEY))
    if (!project || hiddenProjectIds.has(projectId)) {
      return revealProjectInFinderResultSchema.parse({
        status: "error",
        error: buildAppError("PROJECT_NOT_FOUND", `Project id was not found: ${projectId}`)
      })
    }

    try {
      if (!statSync(project.rootPath).isDirectory()) {
        return revealProjectInFinderResultSchema.parse({
          status: "error",
          error: buildAppError("NOT_A_DIRECTORY", `Project path is not a directory: ${project.rootPath}`)
        })
      }
    } catch (error) {
      return revealProjectInFinderResultSchema.parse({
        status: "error",
        error: pathErrorFor(error, "PATH_NOT_FOUND", `Project path could not be inspected: ${project.rootPath}`)
      })
    }

    try {
      const openError = await openExternalAppPath({
        appId: "finder",
        appName: "Finder",
        bundleId: "com.apple.finder",
        targetPath: project.rootPath
      })
      if (openError.length > 0) {
        return revealProjectInFinderResultSchema.parse({
          status: "error",
          error: buildAppError(
            "EXTERNAL_OPEN_FAILED",
            `Finder could not open ${project.rootPath}: ${openError}`,
            openError,
            { domain: "project", context: { projectId: project.id, projectName: project.name } }
          )
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return revealProjectInFinderResultSchema.parse({
        status: "error",
        error: buildAppError(
          "EXTERNAL_OPEN_FAILED",
          `Finder could not open ${project.rootPath}: ${message}`,
          message,
          { domain: "project", context: { projectId: project.id, projectName: project.name } }
        )
      })
    }

    return revealProjectInFinderResultSchema.parse({
      status: "opened",
      projectId: project.id,
      targetPath: project.rootPath
    })
  }

  const getLocale = (): Locale => {
    const row = database.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, LOCALE_SETTING_KEY))
      .get() as typeof appSettingsTable.$inferSelect | undefined

    const value = row?.value
    if (value === "en" || value === "zh") {
      return value
    }

    setLocale(DEFAULT_LOCALE)
    return DEFAULT_LOCALE
  }

  const setLocale = (locale: Locale) => {
    database.db
      .insert(appSettingsTable)
      .values({
        key: LOCALE_SETTING_KEY,
        value: locale,
        updatedAt: now()
      })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: {
          value: locale,
          updatedAt: now()
        }
      })
      .run()
  }

  const getAppTheme = (): AppThemePreference => {
    const row = database.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, APP_THEME_SETTING_KEY))
      .get() as typeof appSettingsTable.$inferSelect | undefined

    const value = row?.value
    if (value === "dark" || value === "light" || value === "system") {
      return value
    }

    setAppTheme(DEFAULT_APP_THEME)
    return DEFAULT_APP_THEME
  }

  const setAppTheme = (theme: AppThemePreference) => {
    database.db
      .insert(appSettingsTable)
      .values({
        key: APP_THEME_SETTING_KEY,
        value: theme,
        updatedAt: now()
      })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: {
          value: theme,
          updatedAt: now()
        }
      })
      .run()
  }

  let resourcesClosed = false
  let databaseClosed = false
  const closeResources = () => {
    if (resourcesClosed) {
      return
    }
    resourcesClosed = true
    closeAllTerminalSessions()
    safelyCloseWorktreeWatcher()
  }
  const closeDatabase = () => {
    if (databaseClosed) {
      return
    }
    databaseClosed = true
    database.close()
  }
  const shutdown = async (timeoutMs = 5_000) => {
    queueDispatchEnabled = false
    providerRunTasks.stopAccepting()
    closeResources()
    const result = await providerRunTasks.awaitIdle(timeoutMs)
    if (result.timedOut) {
      deps.log?.warn("provider", "provider.run.shutdown.timeout", {
        errorCode: "INTERNAL_ERROR",
        pendingRunIds: result.pendingKeys
      })
      return result
    }
    closeDatabase()
    return result
  }

  queueMicrotask(() => {
    if (databaseClosed || !runProvider) {
      return
    }
    const queuedConversationIds = new Set(
      (database.db.select().from(queuedConversationMessagesTable).all() as QueuedConversationMessageRow[])
        .map((message) => message.conversationId)
    )
    for (const conversationId of queuedConversationIds) {
      void dispatchNextQueuedConversationMessage(conversationId)
    }
  })

  return {
    close: () => {
      queueDispatchEnabled = false
      providerRunTasks.stopAccepting()
      closeResources()
      if (providerRunTasks.listPendingKeys().length === 0) {
        closeDatabase()
        return
      }

      void providerRunTasks.awaitIdle().then((result) => {
        if (!result.timedOut) {
          closeDatabase()
        }
      })
    },
    shutdown,
    appendRunArtifact,
    appendRunEvent,
    commitConversationChanges,
    createConversation,
    discardConversationChanges,
    getConversationChanges,
    getConversationChangeDiff,
    getConversationChangeDiffDocument,
    getConversationGitStatus,
    getConversationProjectFiles,
    getProjectWorktreeFiles,
    readConversationFile,
    writeConversationFile,
    createConversationFileEntry,
    renameConversationFileEntry,
    deleteConversationFileEntry,
    revealConversationFileEntry,
    getConversationTimeline,
    getConversationTimelinePage,
    getSelectedEditor,
    listExternalOpenOptions,
    listEditorOptions,
    openConversationExternal,
    openConversationHandoff,
    openConversationTerminal,
    writeTerminalInput,
    resizeTerminal,
    closeTerminal,
    setSelectedEditor,
    stageConversationChanges,
    unstageConversationChanges,
    getAppContext,
    getCurrentConversation,
    listProjects,
    listConversationsByProject,
    listProjectWorktrees,
    listWorktreesByProject,
    deleteWorktree,
    importProject,
    persistImportedProject,
    selectProject,
    moveProject,
    removeProject,
    revealProjectInFinder,
    selectConversation,
    sendConversationMessage,
    deleteQueuedConversationMessage,
    retryConversationRunWithPermissions,
    cancelConversationRun,
    setConversationModel,
    setConversationAccessMode,
    renameConversation,
    deleteConversation,
    resolveConversationAttachment,
    getLocale,
    setLocale,
    getAppTheme,
    setAppTheme,
    customModelsService
  }
}

export type ProjectService = ReturnType<typeof createProjectService>
