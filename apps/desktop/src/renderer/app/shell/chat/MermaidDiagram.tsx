/* eslint-disable i18next/no-literal-string -- Mermaid config values, generated DOM ids, and CSS class names are machine values; visible copy uses chat i18n keys. */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react"
import { createPortal } from "react-dom"
import { faMagnifyingGlassMinus, faMagnifyingGlassPlus, faRotateRight, faUpRightAndDownLeftFromCenter, faXmark } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { useTranslation } from "react-i18next"
import {
  acquireCachedMermaidSvg,
  releaseRenderedMermaidSvg,
  retainRenderedMermaidSvg
} from "./mermaid-render-cache"
import { getMermaidRenderCandidates } from "./mermaid-source"

type MermaidDiagramProps = {
  source: string
}

type MermaidRenderState =
  | { status: "rendering" }
  | { status: "rendered"; svg: string }
  | { status: "failed" }

type MermaidPreviewProps = {
  svg: string
  onClose: () => void
}

type PreviewOffset = {
  x: number
  y: number
}

type PreviewSize = {
  width: number
  height: number
}

type PreviewView = {
  scale: number
  offset: PreviewOffset
}

type PreviewDragState = {
  pointerId: number
  startX: number
  startY: number
  origin: PreviewOffset
}

const DEFAULT_PREVIEW_VIEW: PreviewView = {
  scale: 1,
  offset: { x: 0, y: 0 }
}
const MIN_PREVIEW_SCALE = 0.1
const MAX_PREVIEW_SCALE = 4
const MAX_PREVIEW_FIT_SCALE = 2
const PREVIEW_FIT_PADDING = 50
const PREVIEW_SCALE_STEP = 0.2
const MERMAID_RENDER_DEBOUNCE_MS = 140

let mermaidInitialized = false
let mermaidApi: (typeof import("mermaid"))["default"] | null = null

const loadMermaid = async () => {
  const loadedMermaid = mermaidApi ?? (await import("mermaid")).default
  mermaidApi = loadedMermaid

  if (!mermaidInitialized) {
    loadedMermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "dark"
    })
    mermaidInitialized = true
  }

  return loadedMermaid
}

const removeMermaidRenderContainer = (diagramId: string) => {
  document.getElementById(`d${diagramId}`)?.remove()
}

const renderMermaidSvg = async (
  mermaid: (typeof import("mermaid"))["default"],
  diagramId: string,
  source: string
) => {
  const candidates = getMermaidRenderCandidates(source)
  let lastRenderError: unknown = null

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const candidateDiagramId = `${diagramId}-${candidateIndex + 1}`

    try {
      const parseResult = await mermaid.parse(candidate, { suppressErrors: true })
      if (!parseResult) continue

      const { svg } = await mermaid.render(candidateDiagramId, candidate)
      return svg
    } catch (error) {
      lastRenderError = error
    } finally {
      removeMermaidRenderContainer(candidateDiagramId)
    }
  }

  throw lastRenderError ?? new Error("Mermaid syntax validation failed")
}

const clampPreviewScale = (value: number) =>
  Math.min(MAX_PREVIEW_SCALE, Math.max(MIN_PREVIEW_SCALE, Number(value.toFixed(2))))

const roundPreviewNumber = (value: number) => Number(value.toFixed(2))

const parseSvgNumber = (value: string | null) => {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const readSvgSize = (canvasElement: HTMLDivElement | null): PreviewSize | null => {
  const svgElement = canvasElement?.querySelector("svg")
  if (!svgElement) return null

  const viewBox = svgElement.getAttribute("viewBox")
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number)
    const [, , width, height] = parts
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height }
    }
  }

  const width = parseSvgNumber(svgElement.getAttribute("width"))
  const height = parseSvgNumber(svgElement.getAttribute("height"))
  if (width && height) {
    return { width, height }
  }

  const rect = svgElement.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height }
  }

  return null
}

const calculatePreviewFit = (viewportSize: PreviewSize, diagramSize: PreviewSize): PreviewView => {
  const availableWidth = Math.max(1, viewportSize.width - PREVIEW_FIT_PADDING * 2)
  const availableHeight = Math.max(1, viewportSize.height - PREVIEW_FIT_PADDING * 2)
  const scale = clampPreviewScale(
    Math.min(availableWidth / diagramSize.width, availableHeight / diagramSize.height, MAX_PREVIEW_FIT_SCALE)
  )

  return {
    scale,
    offset: {
      x: roundPreviewNumber((viewportSize.width - diagramSize.width * scale) / 2),
      y: roundPreviewNumber((viewportSize.height - diagramSize.height * scale) / 2)
    }
  }
}

const MermaidPreview = ({ svg, onClose }: MermaidPreviewProps) => {
  const { t } = useTranslation("chat")
  const layerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [previewView, setPreviewView] = useState<PreviewView>(DEFAULT_PREVIEW_VIEW)
  const [fitView, setFitView] = useState<PreviewView>(DEFAULT_PREVIEW_VIEW)
  const [diagramSize, setDiagramSize] = useState<PreviewSize | null>(null)
  const [dragState, setDragState] = useState<PreviewDragState | null>(null)
  const { scale, offset } = previewView
  const zoomPercent = `${Math.round(scale * 100)}%`
  const canvasStyle: CSSProperties = {
    width: diagramSize ? `${diagramSize.width}px` : undefined,
    height: diagramSize ? `${diagramSize.height}px` : undefined,
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
  }

  const fitPreviewToViewport = useCallback(() => {
    const viewportRect = viewportRef.current?.getBoundingClientRect()
    const nextDiagramSize = readSvgSize(canvasRef.current)
    if (!viewportRect || viewportRect.width <= 0 || viewportRect.height <= 0 || !nextDiagramSize) return

    const nextFitView = calculatePreviewFit(
      { width: viewportRect.width, height: viewportRect.height },
      nextDiagramSize
    )
    setDiagramSize(nextDiagramSize)
    setFitView(nextFitView)
    setPreviewView(nextFitView)
  }, [])

  useLayoutEffect(() => {
    fitPreviewToViewport()
  }, [fitPreviewToViewport, svg])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  useEffect(() => {
    window.addEventListener("resize", fitPreviewToViewport)
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fitPreviewToViewport)
    if (viewportRef.current) resizeObserver?.observe(viewportRef.current)

    return () => {
      window.removeEventListener("resize", fitPreviewToViewport)
      resizeObserver?.disconnect()
    }
  }, [fitPreviewToViewport])

  const zoomBy = useCallback((delta: number, anchor?: PreviewOffset) => {
    setPreviewView((currentView) => {
      const nextScale = clampPreviewScale(currentView.scale + delta)
      const nextOffset = anchor
        ? {
            x: roundPreviewNumber(anchor.x - ((anchor.x - currentView.offset.x) / currentView.scale) * nextScale),
            y: roundPreviewNumber(anchor.y - ((anchor.y - currentView.offset.y) / currentView.scale) * nextScale)
          }
        : currentView.offset

      return {
        ...currentView,
        scale: nextScale,
        offset: nextOffset
      }
    })
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    const viewport = viewportRef.current
    if (!layer || !viewport) return

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const eventTarget = event.target
      if (!(eventTarget instanceof Node) || !viewport.contains(eventTarget)) return

      const viewportRect = viewport.getBoundingClientRect()
      zoomBy(event.deltaY > 0 ? -PREVIEW_SCALE_STEP : PREVIEW_SCALE_STEP, {
        x: event.clientX - viewportRect.left,
        y: event.clientY - viewportRect.top
      })
    }

    layer.addEventListener("wheel", handleWheel, { passive: false })
    return () => layer.removeEventListener("wheel", handleWheel)
  }, [zoomBy])

  const resetView = () => {
    setPreviewView(fitView)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: previewView.offset
    })
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return

    setPreviewView((currentView) => ({
      ...currentView,
      offset: {
        x: roundPreviewNumber(dragState.origin.x + event.clientX - dragState.startX),
        y: roundPreviewNumber(dragState.origin.y + event.clientY - dragState.startY)
      }
    })
    )
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragState?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragState(null)
  }

  return createPortal(
    <div ref={layerRef} className="mermaid-preview-layer" role="presentation">
      <button
        className="mermaid-preview-backdrop"
        type="button"
        aria-label={t("mermaid.preview.close")}
        onClick={onClose}
      />
      <div className="mermaid-preview" role="dialog" aria-modal="true" aria-label={t("mermaid.preview.title")}>
        <div className="mermaid-preview__toolbar">
          <strong>{t("mermaid.preview.title")}</strong>
          <div className="mermaid-preview__controls">
            <button type="button" onClick={() => zoomBy(-PREVIEW_SCALE_STEP)} aria-label={t("mermaid.preview.zoomOut")}>
              <FontAwesomeIcon icon={faMagnifyingGlassMinus} />
            </button>
            <span>{zoomPercent}</span>
            <button type="button" onClick={() => zoomBy(PREVIEW_SCALE_STEP)} aria-label={t("mermaid.preview.zoomIn")}>
              <FontAwesomeIcon icon={faMagnifyingGlassPlus} />
            </button>
            <button type="button" onClick={resetView} aria-label={t("mermaid.preview.reset")}>
              <FontAwesomeIcon icon={faRotateRight} />
            </button>
            <button type="button" onClick={onClose} aria-label={t("mermaid.preview.close")}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        </div>
        <div
          ref={viewportRef}
          className="mermaid-preview__viewport"
          data-testid="mermaid-preview-viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div
            ref={canvasRef}
            className="mermaid-preview__canvas"
            data-testid="mermaid-preview-canvas"
            style={canvasStyle}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}

export const MermaidDiagram = ({ source }: MermaidDiagramProps) => {
  const { t } = useTranslation("chat")
  const reactId = useId()
  const diagramId = useMemo(
    () => `teamcow-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId]
  )
  const [renderState, setRenderState] = useState<MermaidRenderState>({ status: "rendering" })
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const renderAttemptRef = useRef(0)

  useEffect(() => {
    let isMounted = true
    let retainedSource: string | null = null
    renderAttemptRef.current += 1
    const renderAttemptId = `${diagramId}-${renderAttemptRef.current}`

    if (!source.trim()) {
      setRenderState({ status: "failed" })
      return () => {
        isMounted = false
      }
    }

    const cachedSvg = acquireCachedMermaidSvg(source)
    if (cachedSvg) {
      retainedSource = source
      setRenderState({ status: "rendered", svg: cachedSvg })
      return () => {
        isMounted = false
        releaseRenderedMermaidSvg(source)
      }
    }

    setRenderState({ status: "rendering" })

    const renderDiagram = async () => {
      try {
        const mermaid = await loadMermaid()
        const svg = await renderMermaidSvg(mermaid, renderAttemptId, source)

        if (isMounted) {
          retainedSource = source
          retainRenderedMermaidSvg(source, svg)
          setRenderState({ status: "rendered", svg })
        }
      } catch {
        removeMermaidRenderContainer(renderAttemptId)

        if (isMounted) {
          setRenderState({ status: "failed" })
        }
      }
    }

    const renderTimer = window.setTimeout(() => {
      void renderDiagram()
    }, MERMAID_RENDER_DEBOUNCE_MS)

    return () => {
      isMounted = false
      window.clearTimeout(renderTimer)
      removeMermaidRenderContainer(renderAttemptId)
      if (retainedSource) {
        releaseRenderedMermaidSvg(retainedSource)
      }
    }
  }, [diagramId, source])

  return (
    <figure className="mermaid-diagram" aria-label={t("mermaid.label")}>
      {renderState.status === "rendering" ? (
        <div className="mermaid-diagram__status">{t("mermaid.rendering")}</div>
      ) : null}
      {renderState.status === "rendered" ? (
        <>
          <button
            className="mermaid-diagram__preview-button"
            type="button"
            aria-label={t("mermaid.preview.open")}
            onClick={() => setIsPreviewOpen(true)}
          >
            <span
              className="mermaid-diagram__svg"
              dangerouslySetInnerHTML={{ __html: renderState.svg }}
            />
            <span className="mermaid-diagram__open-indicator" aria-hidden="true">
              <FontAwesomeIcon icon={faUpRightAndDownLeftFromCenter} />
            </span>
          </button>
          {isPreviewOpen ? (
            <MermaidPreview svg={renderState.svg} onClose={() => setIsPreviewOpen(false)} />
          ) : null}
        </>
      ) : null}
      {renderState.status === "failed" ? (
        <div className="mermaid-diagram__fallback">
          <p>{t("mermaid.error")}</p>
          <pre>
            <code>{source}</code>
          </pre>
        </div>
      ) : null}
    </figure>
  )
}
