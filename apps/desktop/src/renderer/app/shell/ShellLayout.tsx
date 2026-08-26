import type { CSSProperties, PropsWithChildren, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useResizableColumns } from "./use-resizable-columns"

type ShellLayoutProps = PropsWithChildren<{
  sidebar: ReactNode
  inspector: ReactNode
  headerActions?: ReactNode
  windowProject?: string
  windowBranch?: string
  windowStatus?: string
}>

export const ShellLayout = ({
  sidebar,
  inspector,
  headerActions,
  children,
  windowProject,
  windowBranch,
  windowStatus
}: ShellLayoutProps) => {
  const { t } = useTranslation("common")
  const { sidebarWidth, inspectorWidth, startResize, isResizing } = useResizableColumns()
  const titleParts = [t("app.name"), windowProject, windowBranch].filter(Boolean)
  const title = titleParts.join(" · ")
  const effectiveWindowStatus = windowStatus ?? t("state.ready")

  const workspaceStyle = {
    // eslint-disable-next-line i18next/no-literal-string -- CSS custom property names and pixel values are machine values.
    "--sidebar-width": `${sidebarWidth}px`,
    // eslint-disable-next-line i18next/no-literal-string -- CSS custom property names and pixel values are machine values.
    "--inspector-width": `${inspectorWidth}px`
  } as CSSProperties

  return (
    <div className="shell-frame">
      <div className="shell-noise" />
      <div className="shell-aura shell-aura-left" />
      <div className="shell-aura shell-aura-right" />
      <div className="app-frame">
        <div className="win-chrome">
          <div className="win-traffic-zone" />
          <div className="win-title">{title}</div>
          <div className="win-status">
            <span className="win-status-dot" />
            <span>{effectiveWindowStatus}</span>
            {headerActions}
          </div>
        </div>
        <div className={`ws${isResizing ? " ws-resizing" : ""}`} style={workspaceStyle}>
          <aside className="sidebar">{sidebar}</aside>
          <div
            className="ws-divider ws-divider-sidebar"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("layout.resizeSidebar")}
            onPointerDown={startResize("sidebar")}
          />
          <main className="main-area">{children}</main>
          <div
            className="ws-divider ws-divider-inspector"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("layout.resizeInspector")}
            onPointerDown={startResize("inspector")}
          />
          <aside className="inspector">{inspector}</aside>
        </div>
      </div>
    </div>
  )
}
