import { useCallback, useEffect, useRef, useState } from "react"

// Layout column sizing is a local UI preference; persisted to localStorage only.
const SIDEBAR_STORAGE_KEY = "teamcow.layout.sidebarWidth"
const INSPECTOR_STORAGE_KEY = "teamcow.layout.inspectorWidth"

const SIDEBAR_BOUNDS = { default: 266, min: 266, max: 480 }
const INSPECTOR_BOUNDS = { default: 320, min: 320, max: 560 }

export type ResizableColumn = "sidebar" | "inspector"

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const readStoredWidth = (key: string, bounds: { default: number; min: number; max: number }): number => {
  if (typeof window === "undefined" || !window.localStorage) {
    return bounds.default
  }

  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return bounds.default
  }

  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) {
    return bounds.default
  }

  return clamp(parsed, bounds.min, bounds.max)
}

const writeStoredWidth = (key: string, value: number): void => {
  if (typeof window === "undefined" || !window.localStorage) {
    return
  }
  window.localStorage.setItem(key, String(Math.round(value)))
}

export type ResizableColumns = {
  sidebarWidth: number
  inspectorWidth: number
  /** Returns a pointer-down handler that begins dragging the given divider. */
  startResize: (column: ResizableColumn) => (event: React.PointerEvent) => void
  isResizing: boolean
}

export const useResizableColumns = (): ResizableColumns => {
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredWidth(SIDEBAR_STORAGE_KEY, SIDEBAR_BOUNDS))
  const [inspectorWidth, setInspectorWidth] = useState(() => readStoredWidth(INSPECTOR_STORAGE_KEY, INSPECTOR_BOUNDS))
  const [isResizing, setIsResizing] = useState(false)

  const dragRef = useRef<{
    column: ResizableColumn
    startX: number
    startWidth: number
    pointerId: number
    target: HTMLElement
  } | null>(null)

  const startResize = useCallback(
    (column: ResizableColumn) => (event: React.PointerEvent) => {
      event.preventDefault()
      const target = event.currentTarget as HTMLElement
      target.setPointerCapture(event.pointerId)
      dragRef.current = {
        column,
        startX: event.clientX,
        startWidth: column === "sidebar" ? sidebarWidth : inspectorWidth,
        pointerId: event.pointerId,
        target
      }
      setIsResizing(true)
    },
    [sidebarWidth, inspectorWidth]
  )

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }

      const delta = event.clientX - drag.startX
      if (drag.column === "sidebar") {
        // Sidebar grows as the pointer moves right.
        setSidebarWidth(clamp(drag.startWidth + delta, SIDEBAR_BOUNDS.min, SIDEBAR_BOUNDS.max))
      } else {
        // Inspector grows as the pointer moves left.
        setInspectorWidth(clamp(drag.startWidth - delta, INSPECTOR_BOUNDS.min, INSPECTOR_BOUNDS.max))
      }
    }

    const endDrag = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }

      if (drag.target.hasPointerCapture(event.pointerId)) {
        drag.target.releasePointerCapture(event.pointerId)
      }
      dragRef.current = null
      setIsResizing(false)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", endDrag)
    window.addEventListener("pointercancel", endDrag)

    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", endDrag)
      window.removeEventListener("pointercancel", endDrag)
    }
  }, [])

  useEffect(() => {
    writeStoredWidth(SIDEBAR_STORAGE_KEY, sidebarWidth)
  }, [sidebarWidth])

  useEffect(() => {
    writeStoredWidth(INSPECTOR_STORAGE_KEY, inspectorWidth)
  }, [inspectorWidth])

  return { sidebarWidth, inspectorWidth, startResize, isResizing }
}
