import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent
} from "react"
import { useTranslation } from "react-i18next"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowRotateLeft,
  faArrowRight,
  faCheck,
  faFileCode,
  faChevronDown,
  faChevronRight,
  faMinus,
  faPlus,
  faRotateRight,
  faTrashCan
} from "@fortawesome/free-solid-svg-icons"
import {
  MAX_GIT_COMMIT_MESSAGE_LENGTH,
  type ConversationChangeArea,
  type ConversationChangesMutationScope,
  type ConversationChangesSnapshot
} from "@shared/index"
import { FileIcon } from "./file-icons/FileIcon"
import {
  getChangesViewModel,
  type InspectorChangeRow,
  type InspectorChangeSelection
} from "./inspector-changes-model"

export type InspectorChangesPanelProps = {
  snapshot: ConversationChangesSnapshot | null
  selected: InspectorChangeSelection | null
  listLoading: boolean
  stale: boolean
  listError: string | null
  listUnavailable: boolean
  readOnly: boolean
  pendingMutation: boolean
  commitMessage: string
  onRefresh: () => void
  onSelect: (selection: InspectorChangeSelection) => void
  onStage: (scope: ConversationChangesMutationScope) => void
  onUnstage: (scope: ConversationChangesMutationScope) => void
  onDiscard: (scope: ConversationChangesMutationScope) => void
  onCommit: (message: string) => void
  onCommitMessageChange: (message: string) => void
  onOpenEditor: (filePath: string) => void
  onOpenChange?: (selection: InspectorChangeSelection, mode: "preview" | "pinned") => void
}

type DiscardRequest = {
  scope: ConversationChangesMutationScope
  filePath: string | null
}

type DiscardConfirmation = DiscardRequest & {
  snapshotIdentity: {
    conversationId: string
    worktreeId: string
    area: typeof UNSTAGED_AREA
    revision: string
  }
}

// These are typed Git area discriminants, not user-visible copy.
const UNSTAGED_AREA: ConversationChangeArea = "unstaged"
const STAGED_AREA: ConversationChangeArea = "staged"

type ChangesSectionProps = {
  area: ConversationChangeArea
  rows: InspectorChangeRow[]
  selected: InspectorChangeSelection | null
  readOnly: boolean
  pendingMutation: boolean
  onSelect: (selection: InspectorChangeSelection) => void
  onStage: (scope: ConversationChangesMutationScope) => void
  onUnstage: (scope: ConversationChangesMutationScope) => void
  onRequestDiscard: (request: DiscardRequest, opener: HTMLButtonElement) => void
  onOpenEditor: (filePath: string) => void
  onOpenChange?: (selection: InspectorChangeSelection, mode: "preview" | "pinned") => void
}

const selectionMatches = (
  selection: InspectorChangeSelection | null,
  area: ConversationChangeArea,
  filePath: string
) => selection?.area === area && selection.filePath === filePath

const discardConfirmationMatchesSnapshot = (
  confirmation: DiscardConfirmation | null,
  snapshot: ConversationChangesSnapshot | null
) => confirmation !== null &&
  snapshot !== null &&
  confirmation.snapshotIdentity.conversationId === snapshot.conversationId &&
  confirmation.snapshotIdentity.worktreeId === snapshot.worktreeId &&
  confirmation.snapshotIdentity.area === UNSTAGED_AREA &&
  confirmation.snapshotIdentity.revision === snapshot.revision

const TAB_KEY = "Tab"
const ESCAPE_KEY = "Escape"
const ENABLED_DIALOG_BUTTON_SELECTOR = "button:not(:disabled)"

const ChangeFileRow = ({
  row,
  selected,
  readOnly,
  pendingMutation,
  onSelect,
  onStage,
  onUnstage,
  onRequestDiscard,
  onOpenEditor,
  onOpenChange
}: {
  row: InspectorChangeRow
  selected: InspectorChangeSelection | null
  readOnly: boolean
  pendingMutation: boolean
  onSelect: (selection: InspectorChangeSelection) => void
  onStage: (scope: ConversationChangesMutationScope) => void
  onUnstage: (scope: ConversationChangesMutationScope) => void
  onRequestDiscard: (request: DiscardRequest, opener: HTMLButtonElement) => void
  onOpenEditor: (filePath: string) => void
  onOpenChange?: (selection: InspectorChangeSelection, mode: "preview" | "pinned") => void
}) => {
  const { t } = useTranslation("inspector")
  const isSelected = selectionMatches(selected, row.area, row.path)
  const mutationDisabled = readOnly || pendingMutation
  const areaLabel = t(`changes.section.${row.area}`)
  const statusLabel = t(`changes.status.${row.status}`)
  const statisticsDescriptionId = useId()
  const statisticLabels = [
    row.isBinary ? t("changes.row.binary") : null,
    row.additions > 0 ? t("changes.row.additions", { count: row.additions }) : null,
    row.deletions > 0 ? t("changes.row.deletions", { count: row.deletions }) : null
  ].filter((label): label is string => label !== null)
  const reviewLabel = t("changes.action.review-file", {
    path: row.path,
    area: areaLabel.toLocaleLowerCase()
  })

  return (
    <li className={`changes-file-item changes-file-item-${row.area}`}>
      <div className="changes-file-row">
        <button
          type="button"
          className="changes-file-review"
          aria-label={reviewLabel}
          aria-describedby={statisticsDescriptionId}
          aria-current={isSelected ? "true" : undefined}
          onClick={() => {
            const selection = { area: row.area, filePath: row.path }
            onSelect(selection)
            onOpenChange?.(selection, "preview")
          }}
          onDoubleClick={() => onOpenChange?.({ area: row.area, filePath: row.path }, "pinned")}
        >
          <FileIcon fileName={row.basename} className="changes-file-icon" />
          <span className="changes-file-paths">
            {row.oldPath !== null ? (
              <span className="changes-file-old-path">{row.oldPath}</span>
            ) : null}
            {row.oldPath !== null ? (
              <FontAwesomeIcon className="changes-file-rename-arrow" icon={faArrowRight} aria-hidden="true" />
            ) : null}
            <span className="changes-file-path" title={row.path}>
              <span className="changes-file-directory">{row.directory}</span>
              <span className="changes-file-basename">{row.basename}</span>
            </span>
            <span className="changes-file-inline-stats">
              {row.isBinary ? <span className="changes-file-binary">{t("changes.row.binary")}</span> : null}
              {row.additions > 0 ? (
                <span className="changes-file-additions">{t("changes.row.additions", { count: row.additions })}</span>
              ) : null}
              {row.deletions > 0 ? (
                <span className="changes-file-deletions">{t("changes.row.deletions", { count: row.deletions })}</span>
              ) : null}
            </span>
            <span id={statisticsDescriptionId} className="visually-hidden">
              {[statusLabel, ...statisticLabels].join(", ")}
            </span>
          </span>
        </button>
        <div className="changes-file-actions">
          {row.area === "unstaged" ? (
            <button
              type="button"
              className="changes-action changes-action-stage"
              aria-label={t("changes.action.stage-file", { path: row.path })}
              title={t("changes.action.stage-file-title")}
              data-tooltip={t("changes.action.stage-file-title")}
              disabled={mutationDisabled}
              onClick={() => onStage({ type: "file", filePath: row.path })}
            >
              <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="changes-action changes-action-unstage"
              aria-label={t("changes.action.unstage-file", { path: row.path })}
              title={t("changes.action.unstage-file-title")}
              data-tooltip={t("changes.action.unstage-file-title")}
              disabled={mutationDisabled}
              onClick={() => onUnstage({ type: "file", filePath: row.path })}
            >
              <FontAwesomeIcon icon={faMinus} aria-hidden="true" />
            </button>
          )}
          {row.area === "unstaged" && row.status !== "conflicted" ? (
            <button
              type="button"
              className="changes-action changes-action-discard"
              aria-label={t("changes.action.discard-file", { path: row.path })}
              title={t("changes.action.discard-file-title")}
              data-tooltip={t("changes.action.discard-file-title")}
              disabled={mutationDisabled}
              onClick={(event) => onRequestDiscard(
                {
                  scope: { type: "file", filePath: row.path },
                  filePath: row.path
                },
                event.currentTarget
              )}
            >
              <FontAwesomeIcon icon={faArrowRotateLeft} aria-hidden="true" />
            </button>
          ) : null}
          {row.status !== "deleted" ? (
            <button
              type="button"
              className="changes-action changes-action-open-editor"
              aria-label={t("changes.action.open-editor", { path: row.path })}
              title={t("changes.action.open-editor-title")}
              data-tooltip={t("changes.action.open-editor-title")}
              onClick={() => onOpenEditor(row.path)}
            >
              <FontAwesomeIcon icon={faFileCode} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <span
          className={`changes-file-status changes-file-status-${row.status}`}
          aria-hidden="true"
          title={statusLabel}
        >
          {t(`changes.status.short.${row.status}`)}
        </span>
      </div>
    </li>
  )
}

const ChangeDirectoryGroup = ({
  directory,
  rows,
  selected,
  readOnly,
  pendingMutation,
  onSelect,
  onStage,
  onUnstage,
  onRequestDiscard,
  onOpenEditor,
  onOpenChange
}: Omit<ChangesSectionProps, "area" | "rows"> & {
  directory: string
  rows: InspectorChangeRow[]
}) => {
  const { t } = useTranslation("inspector")
  const [collapsed, setCollapsed] = useState(false)
  const contentId = useId()
  const directoryLabel = directory || t("changes.directory.root")

  return (
    <section className="changes-directory-group">
      <button
        type="button"
        className="changes-directory-header"
        aria-expanded={!collapsed}
        aria-controls={contentId}
        aria-label={t(collapsed ? "changes.action.expand" : "changes.action.collapse", {
          section: directoryLabel
        })}
        onClick={() => setCollapsed((value) => !value)}
      >
        <FontAwesomeIcon
          className="changes-directory-chevron"
          icon={collapsed ? faChevronRight : faChevronDown}
          aria-hidden="true"
        />
        <span>{directoryLabel}</span>
        <span>{rows.length}</span>
      </button>
      <ul id={contentId} className="changes-file-list" hidden={collapsed}>
        {rows.map((row) => (
          <ChangeFileRow
            key={row.key}
            row={row}
            selected={selected}
            readOnly={readOnly}
            pendingMutation={pendingMutation}
            onSelect={onSelect}
            onStage={onStage}
            onUnstage={onUnstage}
            onRequestDiscard={onRequestDiscard}
            onOpenEditor={onOpenEditor}
            onOpenChange={onOpenChange}
          />
        ))}
      </ul>
    </section>
  )
}

const ChangesSection = ({
  area,
  rows,
  selected,
  readOnly,
  pendingMutation,
  onSelect,
  onStage,
  onUnstage,
  onRequestDiscard,
  onOpenEditor,
  onOpenChange
}: ChangesSectionProps) => {
  const { t } = useTranslation("inspector")
  const [collapsed, setCollapsed] = useState(false)
  const label = t(`changes.section.${area}`)
  const countLabel = t("changes.count", { count: rows.length })
  const mutationDisabled = readOnly || pendingMutation
  const containsConflict = rows.some((row) => row.status === "conflicted")
  const contentId = useId()

  return (
    <section className={`changes-section changes-section-${area}`} aria-label={label}>
      <header className="changes-section-header">
        <button
          type="button"
          className="changes-section-toggle"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          aria-label={`${label}, ${countLabel}`}
          onClick={() => setCollapsed((value) => !value)}
        >
          <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronDown} aria-hidden="true" />
          <span>{label}</span>
          <span className="changes-section-count">{rows.length}</span>
        </button>
        <div className="changes-section-actions">
          {area === "unstaged" ? (
            <>
              <button
                type="button"
                className="changes-action changes-action-discard-all"
                aria-label={t("changes.action.discard-all")}
                disabled={mutationDisabled || containsConflict || rows.length === 0}
                onClick={(event) => onRequestDiscard(
                  { scope: { type: "all" }, filePath: null },
                  event.currentTarget
                )}
              >
                <FontAwesomeIcon icon={faTrashCan} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="changes-action changes-action-stage-all"
                aria-label={t("changes.action.stage-all")}
                disabled={mutationDisabled || rows.length === 0}
                onClick={() => onStage({ type: "all" })}
              >
                <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="changes-action changes-action-unstage-all"
              aria-label={t("changes.action.unstage-all")}
              disabled={mutationDisabled || rows.length === 0}
              onClick={() => onUnstage({ type: "all" })}
            >
              <FontAwesomeIcon icon={faMinus} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      {!collapsed ? (
        <div id={contentId} className="changes-directory-list">
          {[...Map.groupBy(rows, (row) => row.directory).entries()].map(([directory, directoryRows]) => (
            <ChangeDirectoryGroup
              key={directory || "root"}
              directory={directory}
              rows={directoryRows}
              selected={selected}
              readOnly={readOnly}
              pendingMutation={pendingMutation}
              onSelect={onSelect}
              onStage={onStage}
              onUnstage={onUnstage}
              onRequestDiscard={onRequestDiscard}
              onOpenEditor={onOpenEditor}
              onOpenChange={onOpenChange}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export const InspectorChangesPanel = ({
  snapshot,
  selected,
  listLoading,
  stale,
  listError,
  listUnavailable,
  readOnly,
  pendingMutation,
  commitMessage,
  onRefresh,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
  onCommit,
  onCommitMessageChange,
  onOpenEditor,
  onOpenChange
}: InspectorChangesPanelProps) => {
  const { t } = useTranslation("inspector")
  const [discardConfirmation, setDiscardConfirmation] = useState<DiscardConfirmation | null>(null)
  const discardOpenerRef = useRef<HTMLButtonElement | null>(null)
  const discardCancelRef = useRef<HTMLButtonElement | null>(null)
  const shouldRestoreDiscardFocusRef = useRef(false)
  const model = useMemo(() => snapshot === null ? null : getChangesViewModel(snapshot), [snapshot])
  const titleId = useId()
  const commitMessageId = useId()
  const confirmationTitleId = useId()
  const confirmationDescriptionId = useId()
  const hasStagedRows = (model?.staged.length ?? 0) > 0
  const trimmedCommitMessageLength = commitMessage.trim().length
  const hasCommitMessage = trimmedCommitMessageLength > 0
  const commitMessageTooLong = commitMessage.length > MAX_GIT_COMMIT_MESSAGE_LENGTH
  const mutationBlocked = readOnly || pendingMutation || listLoading || stale || listError !== null || listUnavailable
  const commitDisabled = mutationBlocked || !hasStagedRows || !hasCommitMessage || commitMessageTooLong
  const discardSnapshotIsCurrent = discardConfirmationMatchesSnapshot(discardConfirmation, snapshot)
  const discardTargetIsCurrent = discardConfirmation?.scope.type === "all"
    ? (model?.unstaged.length ?? 0) > 0 && !model?.unstaged.some((row) => row.status === "conflicted")
    : model?.unstaged.some(
      (row) => row.path === discardConfirmation?.filePath && row.status !== "conflicted"
    ) === true
  const canConfirmDiscard = discardConfirmation !== null &&
    discardSnapshotIsCurrent &&
    !readOnly &&
    !pendingMutation &&
    !listLoading &&
    !stale &&
    listError === null &&
    !listUnavailable &&
    discardTargetIsCurrent

  useEffect(() => {
    setDiscardConfirmation((current) => {
      if (current !== null && !discardConfirmationMatchesSnapshot(current, snapshot)) {
        shouldRestoreDiscardFocusRef.current = true
        return null
      }
      return current
    })
  }, [snapshot])

  useEffect(() => {
    if (discardConfirmation !== null) {
      discardCancelRef.current?.focus()
    }
  }, [discardConfirmation])

  useEffect(() => {
    if (discardConfirmation === null && shouldRestoreDiscardFocusRef.current) {
      const opener = discardOpenerRef.current
      shouldRestoreDiscardFocusRef.current = false
      discardOpenerRef.current = null
      if (opener?.isConnected) {
        opener.focus()
      }
    }
  }, [discardConfirmation])

  const requestDiscard = (request: DiscardRequest, opener: HTMLButtonElement) => {
    if (snapshot !== null) {
      discardOpenerRef.current = opener
      shouldRestoreDiscardFocusRef.current = false
      setDiscardConfirmation({
        ...request,
        snapshotIdentity: {
          conversationId: snapshot.conversationId,
          worktreeId: snapshot.worktreeId,
          area: UNSTAGED_AREA,
          revision: snapshot.revision
        }
      })
    }
  }

  const closeDiscardConfirmation = () => {
    shouldRestoreDiscardFocusRef.current = true
    setDiscardConfirmation(null)
  }

  const handleDiscardDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === ESCAPE_KEY) {
      event.preventDefault()
      event.stopPropagation()
      closeDiscardConfirmation()
      return
    }

    if (event.key !== TAB_KEY) {
      return
    }

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(ENABLED_DIALOG_BUTTON_SELECTOR)
    )
    if (buttons.length === 0) {
      return
    }

    const activeElement = event.currentTarget.ownerDocument.activeElement
    const currentIndex = buttons.findIndex((button) => button === activeElement)
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1)
      : (currentIndex < 0 || currentIndex === buttons.length - 1 ? 0 : currentIndex + 1)
    event.preventDefault()
    buttons[nextIndex]?.focus()
  }

  const blockModalBackgroundInteraction = (event: SyntheticEvent) => {
    if (discardConfirmation !== null) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const redirectModalBackgroundFocus = (event: SyntheticEvent) => {
    if (discardConfirmation !== null) {
      event.stopPropagation()
      discardCancelRef.current?.focus()
    }
  }

  const submitCommit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!commitDisabled) {
      onCommit(commitMessage)
    }
  }

  const confirmDiscard = () => {
    if (!canConfirmDiscard || discardConfirmation === null) {
      return
    }
    onDiscard(discardConfirmation.scope)
    closeDiscardConfirmation()
  }

  const discardTitle = discardConfirmation?.filePath === null
    ? t("changes.discard.all.title")
    : t("changes.discard.file.title", { path: discardConfirmation?.filePath })
  const discardDescription = discardConfirmation?.filePath === null
    ? t("changes.discard.all.description")
    : t("changes.discard.file.description", { path: discardConfirmation?.filePath })

  return (
    <section className="inspector-changes-panel" aria-labelledby={titleId}>
      <div
        className="changes-panel-content"
        role="group"
        aria-label={t("changes.label")}
        aria-hidden={discardConfirmation !== null ? true : undefined}
        inert={discardConfirmation !== null ? true : undefined}
        onClickCapture={blockModalBackgroundInteraction}
        onSubmitCapture={blockModalBackgroundInteraction}
        onChangeCapture={blockModalBackgroundInteraction}
        onKeyDownCapture={blockModalBackgroundInteraction}
        onFocusCapture={redirectModalBackgroundFocus}
      >
        <header className="changes-summary-header">
          <div className="changes-summary-copy">
            <h2 id={titleId}>{t("changes.title")}</h2>
            {model !== null ? (
              <div
                className="changes-summary-totals"
                role="group"
                aria-label={t("changes.summary", {
                  count: model.summary.rowCount,
                  additions: model.summary.additions,
                  deletions: model.summary.deletions
                })}
              >
                <span
                  className="changes-summary-count"
                  aria-label={t("changes.count", { count: model.summary.rowCount })}
                >
                  {model.summary.rowCount}
                </span>
                <span
                  className="changes-summary-additions"
                  aria-label={t("changes.total.additions", { count: model.summary.additions })}
                >
                  {t("changes.row.additions", { count: model.summary.additions })}
                </span>
                <span
                  className="changes-summary-deletions"
                  aria-label={t("changes.total.deletions", { count: model.summary.deletions })}
                >
                  {t("changes.row.deletions", { count: model.summary.deletions })}
                </span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="changes-action changes-action-refresh"
            aria-label={t("changes.action.refresh")}
            disabled={readOnly}
            onClick={onRefresh}
          >
            <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" />
          </button>
        </header>

        <div className="changes-panel-status" aria-live="polite">
        {readOnly ? <p className="changes-readonly-status">{t("changes.readonly.pinned")}</p> : null}
        {stale ? <p className="changes-stale-status">{t("changes.stale")}</p> : null}
        {listUnavailable ? <p className="changes-error-status">{t("changes.unavailable")}</p> : null}
        {!listUnavailable && listError !== null ? <p className="changes-error-status">{t("changes.error")}</p> : null}
        {listError !== null && listError !== t("changes.error") && listError !== t("changes.unavailable") ? (
          <p className="changes-error-status changes-error-detail">{listError}</p>
        ) : null}
        {listLoading ? (
          <p className="changes-loading-status">
            {snapshot === null ? t("changes.loading") : t("changes.refreshing")}
          </p>
        ) : null}
        </div>

        <form className="changes-commit-area" onSubmit={submitCommit}>
          <label className="visually-hidden" htmlFor={commitMessageId}>{t("changes.commit.message")}</label>
          <div className="changes-commit-controls">
            <textarea
              id={commitMessageId}
              value={commitMessage}
              placeholder={t("changes.commit.placeholder")}
              readOnly={readOnly}
              disabled={pendingMutation}
              maxLength={MAX_GIT_COMMIT_MESSAGE_LENGTH}
              aria-invalid={commitMessageTooLong || undefined}
              onChange={(event) => {
                if (!readOnly && !pendingMutation) {
                  onCommitMessageChange(event.target.value)
                }
              }}
            />
            <button type="submit" disabled={commitDisabled}>
              <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
              <span className="visually-hidden">
                {pendingMutation ? t("changes.commit.pending") : t("changes.commit.action")}
              </span>
            </button>
          </div>
          {!readOnly && !pendingMutation && !hasStagedRows ? (
            <p className="changes-commit-requirement">{t("changes.commit.requires-staged")}</p>
          ) : null}
          {!readOnly && !pendingMutation && hasStagedRows && !hasCommitMessage ? (
            <p className="changes-commit-requirement">{t("changes.commit.requires-message")}</p>
          ) : null}
          {commitMessageTooLong ? (
            <p className="changes-commit-requirement">
              {t("changes.commit.too-long", { maxLength: MAX_GIT_COMMIT_MESSAGE_LENGTH })}
            </p>
          ) : null}
        </form>

        <div className="changes-sections-scroll">
        {snapshot === null && !listLoading && listError === null ? (
          <p className="changes-empty-state">{t("changes.no-conversation")}</p>
        ) : null}
        {model?.summary.rowCount === 0 ? (
          <p className="changes-empty-state">{t("changes.clean")}</p>
        ) : null}
        {model !== null && model.summary.rowCount > 0 ? (
          <>
            <ChangesSection
              area={STAGED_AREA}
              rows={model.staged}
              selected={selected}
              readOnly={readOnly}
              pendingMutation={mutationBlocked}
              onSelect={onSelect}
              onStage={onStage}
              onUnstage={onUnstage}
              onRequestDiscard={requestDiscard}
              onOpenEditor={onOpenEditor}
              onOpenChange={onOpenChange}
            />
            <ChangesSection
              area={UNSTAGED_AREA}
              rows={model.unstaged}
              selected={selected}
              readOnly={readOnly}
              pendingMutation={mutationBlocked}
              onSelect={onSelect}
              onStage={onStage}
              onUnstage={onUnstage}
              onRequestDiscard={requestDiscard}
              onOpenEditor={onOpenEditor}
              onOpenChange={onOpenChange}
            />
          </>
        ) : null}
        </div>

      </div>

      {discardConfirmation !== null ? (
        <div className="changes-confirmation-backdrop">
          <section
            className="changes-confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmationTitleId}
            aria-describedby={confirmationDescriptionId}
            onKeyDown={handleDiscardDialogKeyDown}
          >
            <h3 id={confirmationTitleId}>{discardTitle}</h3>
            <p id={confirmationDescriptionId}>{discardDescription}</p>
            <div className="changes-confirmation-actions">
              <button ref={discardCancelRef} type="button" onClick={closeDiscardConfirmation}>
                {t("changes.action.cancel")}
              </button>
              <button
                type="button"
                className="changes-confirmation-destructive"
                disabled={!canConfirmDiscard}
                onClick={confirmDiscard}
              >
                {t("changes.action.confirm-discard")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
