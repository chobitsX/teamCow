import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { changeLocale } from "../providers/I18nProvider"
import { useTheme } from "../providers/ThemeProvider"
import type { AppThemePreference, EditorOption, Locale, UpdateState } from "@shared/index"

type SettingsDrawerProps = {
  open: boolean
  onClose: () => void
}

export const SettingsDrawer = ({ open, onClose }: SettingsDrawerProps) => {
  const { t, i18n } = useTranslation("settings")
  const currentLocale = i18n.language as Locale
  const { preference: themePreference, setPreference: setThemePreference } = useTheme()
  const [themeErrorMessage, setThemeErrorMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editorErrorMessage, setEditorErrorMessage] = useState<string | null>(null)
  const [editors, setEditors] = useState<EditorOption[]>([])
  const [selectedEditorId, setSelectedEditorId] = useState<string>("")
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "idle" })
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateErrorMessage, setUpdateErrorMessage] = useState<string | null>(null)
  const drawerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    drawerRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open || !window.teamcow?.getSelectedEditor) return

    let cancelled = false
    void window.teamcow.getSelectedEditor()
      .then((result) => {
        if (cancelled) return
        if (result.status === "ok") {
          setEditors(result.editors)
          setSelectedEditorId(result.selectedEditorId ?? "")
          setEditorErrorMessage(null)
          return
        }
        setEditorErrorMessage(t("editor.change-failed"))
      })
      .catch(() => {
        if (!cancelled) {
          setEditorErrorMessage(t("editor.change-failed"))
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, t])

  useEffect(() => {
    if (!open || !window.teamcow?.getUpdateState) return

    let cancelled = false
    void window.teamcow.getUpdateState()
      .then((state) => {
        if (cancelled) return
        setUpdateState(state)
        setUpdateErrorMessage(null)
      })
      .catch(() => {
        if (!cancelled) {
          setUpdateErrorMessage(t("updates.error"))
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, t])

  useEffect(() => {
    if (!open || !window.teamcow?.onUpdateState) return

    return window.teamcow.onUpdateState((state) => {
      setUpdateState(state)
      if (state.status !== "error") {
        setUpdateErrorMessage(null)
      }
    })
  }, [open])

  const handleLocaleChange = async (locale: Locale) => {
    if (locale === currentLocale) return
    setErrorMessage(null)

    try {
      await changeLocale(locale)
    } catch {
      setErrorMessage(t("locale.change-failed", { ns: "notifications" }))
    }
  }

  const handleThemeChange = async (next: AppThemePreference) => {
    if (next === themePreference) return
    setThemeErrorMessage(null)
    try {
      await setThemePreference(next)
    } catch {
      setThemeErrorMessage(t("theme.change-failed"))
    }
  }

  const handleEditorChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const editorId = event.currentTarget.value
    setEditorErrorMessage(null)

    try {
      const result = await window.teamcow.setSelectedEditor({ editorId: editorId || null })
      if (result.status === "error") {
        setEditorErrorMessage(t("editor.change-failed"))
        return
      }
      setEditors(result.editors)
      setSelectedEditorId(result.selectedEditorId ?? "")
    } catch {
      setEditorErrorMessage(t("editor.change-failed"))
    }
  }

  const handleCheckForUpdates = async () => {
    setUpdateBusy(true)
    setUpdateErrorMessage(null)

    try {
      const result = await window.teamcow.checkForUpdates()
      setUpdateState(result.state)
      if (result.status === "error") {
        setUpdateErrorMessage(t("updates.error"))
      }
    } catch {
      setUpdateErrorMessage(t("updates.error"))
    } finally {
      setUpdateBusy(false)
    }
  }

  const handleInstallUpdate = async () => {
    setUpdateBusy(true)
    setUpdateErrorMessage(null)

    try {
      const result = await window.teamcow.installUpdateAndRestart()
      setUpdateState(result.state)
      if (result.status === "error") {
        setUpdateErrorMessage(t("updates.install-failed"))
      }
    } catch {
      setUpdateErrorMessage(t("updates.install-failed"))
    } finally {
      setUpdateBusy(false)
    }
  }

  const handleBackdropClick = () => {
    onClose()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose()
    }
  }

  if (!open) return null

  const firstAvailableEditorId = editors.find((editor) => editor.isAvailable)?.id ?? ""
  const effectiveSelectedEditorId = selectedEditorId || firstAvailableEditorId
  const updateCheckDisabled = updateBusy || updateState.status === "disabled"
  const updateRestartDisabled = updateBusy || updateState.status !== "downloaded"

  return (
    <>
      <div className="settings-backdrop" onClick={handleBackdropClick} />
      <div
        ref={drawerRef}
        className="settings-drawer"
        role="dialog"
        aria-label={t("title")}
        aria-modal="false"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <div className="settings-drawer-header">
          <strong>{t("title")}</strong>
          <button className="settings-close-btn" type="button" onClick={onClose} aria-label={t("action.close", { ns: "common" })}>
            &times;
          </button>
        </div>
        <div className="settings-drawer-body">
          <div className="settings-group-title">{t("group.general")}</div>
          <div className="settings-section">
            <div className="settings-section-title">{t("language.title")}</div>
            <p className="settings-section-desc">{t("language.description")}</p>
            <div className="segmented-control" role="radiogroup" aria-label={t("language.title")}>
              <button
                className={`segmented-cell${currentLocale === "en" ? " active" : ""}`}
                type="button"
                role="radio"
                aria-checked={currentLocale === "en"}
                onClick={() => void handleLocaleChange("en")}
              >
                {t("language.option.en")}
              </button>
              <button
                className={`segmented-cell${currentLocale === "zh" ? " active" : ""}`}
                type="button"
                role="radio"
                aria-checked={currentLocale === "zh"}
                onClick={() => void handleLocaleChange("zh")}
              >
                {t("language.option.zh")}
              </button>
            </div>
            {errorMessage ? <p className="settings-section-error">{errorMessage}</p> : null}
            <p className="settings-section-note">{t("language.note")}</p>
          </div>
          <div className="settings-section">
            <div className="settings-section-title">{t("theme.title")}</div>
            <p className="settings-section-desc">{t("theme.description")}</p>
            <div className="segmented-control segmented-control--theme" role="radiogroup" aria-label={t("theme.title")}>
              {/* eslint-disable-next-line i18next/no-literal-string -- theme keys are typed machine values */}
              {(["dark", "light", "system"] as const).map((option) => (
                <button
                  key={option}
                  className={`segmented-cell${themePreference === option ? " active" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={themePreference === option}
                  data-testid={`settings-theme-${option}`}
                  onClick={() => void handleThemeChange(option)}
                >
                  {t(`theme.option.${option}`)}
                </button>
              ))}
            </div>
            {themeErrorMessage ? <p className="settings-section-error">{themeErrorMessage}</p> : null}
            <p className="settings-section-note">{t("theme.note")}</p>
          </div>
          <div className="settings-section">
            <div className="settings-section-title">{t("editor.title")}</div>
            <p className="settings-section-desc">{t("editor.description")}</p>
            <select
              className="settings-select"
              data-testid="settings-editor-select"
              value={effectiveSelectedEditorId}
              aria-label={t("editor.title")}
              onChange={(event) => void handleEditorChange(event)}
            >
              <option value="">{t("editor.placeholder")}</option>
              {editors.map((editor) => (
                <option key={editor.id} value={editor.id} disabled={!editor.isAvailable}>
                  {editor.isAvailable ? editor.label : t("editor.unavailable", { editor: editor.label })}
                </option>
              ))}
            </select>
            {editorErrorMessage ? <p className="settings-section-error">{editorErrorMessage}</p> : null}
            <p className="settings-section-note">{t("editor.note")}</p>
          </div>
          <div className="settings-section">
            <div className="settings-section-title">{t("updates.title")}</div>
            <p className="settings-section-desc">{t("updates.description")}</p>
            <div className="settings-update-panel" data-status={updateState.status}>
              <div className="settings-update-status">
                <span className="settings-update-dot" aria-hidden="true" />
                <span>
                  {t(`updates.status.${updateState.status}`)}
                  {updateState.version ? ` · ${t("updates.version", { version: updateState.version })}` : null}
                </span>
              </div>
              <div className="settings-actions">
                <button
                  className="btn settings-action-btn"
                  type="button"
                  data-testid="settings-check-updates"
                  disabled={updateCheckDisabled}
                  onClick={() => void handleCheckForUpdates()}
                >
                  {t("updates.action.check")}
                </button>
                <button
                  className={`btn settings-action-btn${updateState.status === "downloaded" ? " primary" : ""}`}
                  type="button"
                  data-testid="settings-restart-update"
                  disabled={updateRestartDisabled}
                  onClick={() => void handleInstallUpdate()}
                >
                  {t("updates.action.restart")}
                </button>
              </div>
            </div>
            {updateErrorMessage ? <p className="settings-section-error">{updateErrorMessage}</p> : null}
            <p className="settings-section-note">{t("updates.note")}</p>
          </div>
        </div>
      </div>
    </>
  )
}
