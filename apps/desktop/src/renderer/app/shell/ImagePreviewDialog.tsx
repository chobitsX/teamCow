/* eslint-disable i18next/no-literal-string -- CSS dimensions and transform values are machine values; visible copy uses chat i18n keys. */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type WheelEvent
} from "react"
import {
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faRotateRight,
  faXmark
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { useTranslation } from "react-i18next"

type ImagePreviewDialogProps = {
  src: string
  name: string
  onClose: () => void
}

type PreviewPoint = {
  x: number
  y: number
}

type PreviewSize = {
  width: number
  height: number
}

type PreviewView = {
  scale: number
  offset: PreviewPoint
}

type PreviewDragState = {
  pointerId: number
  start: PreviewPoint
  origin: PreviewPoint
}

const DEFAULT_PREVIEW_VIEW: PreviewView = {
  scale: 1,
  offset: { x: 0, y: 0 }
}
const MIN_PREVIEW_SCALE = 0.05
const MAX_PREVIEW_SCALE = 4
const PREVIEW_SCALE_STEP = 0.25
const PREVIEW_FIT_PADDING = 20

const roundPreviewNumber = (value: number) => Number(value.toFixed(2))

const clampPreviewScale = (value: number) =>
  Math.min(MAX_PREVIEW_SCALE, Math.max(MIN_PREVIEW_SCALE, roundPreviewNumber(value)))

const calculateCenteredView = (
  viewportSize: PreviewSize,
  imageSize: PreviewSize,
  scale: number
): PreviewView => ({
  scale,
  offset: {
    x: roundPreviewNumber((viewportSize.width - imageSize.width * scale) / 2),
    y: roundPreviewNumber((viewportSize.height - imageSize.height * scale) / 2)
  }
})

const calculateFitView = (viewportSize: PreviewSize, imageSize: PreviewSize): PreviewView => {
  const availableWidth = Math.max(1, viewportSize.width - PREVIEW_FIT_PADDING * 2)
  const availableHeight = Math.max(1, viewportSize.height - PREVIEW_FIT_PADDING * 2)
  const scale = clampPreviewScale(Math.min(
    availableWidth / imageSize.width,
    availableHeight / imageSize.height,
    1
  ))

  return calculateCenteredView(viewportSize, imageSize, scale)
}

const isSameView = (first: PreviewView, second: PreviewView) =>
  Math.abs(first.scale - second.scale) < 0.01
  && Math.abs(first.offset.x - second.offset.x) < 1
  && Math.abs(first.offset.y - second.offset.y) < 1

export const ImagePreviewDialog = ({ src, name, onClose }: ImagePreviewDialogProps) => {
  const { t } = useTranslation("chat")
  const viewportRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const returnFocusTargetRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  )
  const [imageSize, setImageSize] = useState<PreviewSize | null>(null)
  const [fitView, setFitView] = useState<PreviewView>(DEFAULT_PREVIEW_VIEW)
  const [previewView, setPreviewView] = useState<PreviewView>(DEFAULT_PREVIEW_VIEW)
  const [dragState, setDragState] = useState<PreviewDragState | null>(null)
  const { scale, offset } = previewView
  const zoomPercent = `${Math.round(scale * 100)}%`
  const canvasStyle: CSSProperties = {
    width: imageSize ? `${imageSize.width}px` : undefined,
    height: imageSize ? `${imageSize.height}px` : undefined,
    opacity: imageSize ? 1 : 0,
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
  }

  const fitImageToViewport = useCallback(() => {
    const image = imageRef.current
    const viewportRect = viewportRef.current?.getBoundingClientRect()
    if (
      !image
      || !viewportRect
      || viewportRect.width <= 0
      || viewportRect.height <= 0
      || image.naturalWidth <= 0
      || image.naturalHeight <= 0
    ) {
      return
    }

    const nextImageSize = { width: image.naturalWidth, height: image.naturalHeight }
    const nextFitView = calculateFitView(
      { width: viewportRect.width, height: viewportRect.height },
      nextImageSize
    )
    setImageSize(nextImageSize)
    setFitView(nextFitView)
    setPreviewView(nextFitView)
  }, [])

  const zoomBy = useCallback((delta: number, anchor?: PreviewPoint) => {
    const viewportRect = viewportRef.current?.getBoundingClientRect()
    if (!viewportRect || viewportRect.width <= 0 || viewportRect.height <= 0) return

    const zoomAnchor = anchor ?? {
      x: viewportRect.width / 2,
      y: viewportRect.height / 2
    }
    setPreviewView((currentView) => {
      const nextScale = clampPreviewScale(currentView.scale + delta)
      if (nextScale === currentView.scale) return currentView

      return {
        scale: nextScale,
        offset: {
          x: roundPreviewNumber(
            zoomAnchor.x - ((zoomAnchor.x - currentView.offset.x) / currentView.scale) * nextScale
          ),
          y: roundPreviewNumber(
            zoomAnchor.y - ((zoomAnchor.y - currentView.offset.y) / currentView.scale) * nextScale
          )
        }
      }
    })
  }, [])

  const resetView = useCallback(() => {
    setPreviewView(fitView)
  }, [fitView])

  const toggleActualSize = useCallback(() => {
    const viewportRect = viewportRef.current?.getBoundingClientRect()
    if (!viewportRect || !imageSize) return

    setPreviewView((currentView) => {
      if (!isSameView(currentView, fitView)) return fitView

      const actualScale = fitView.scale >= 0.99 ? 2 : 1
      return calculateCenteredView(
        { width: viewportRect.width, height: viewportRect.height },
        imageSize,
        actualScale
      )
    })
  }, [fitView, imageSize])

  useLayoutEffect(() => {
    fitImageToViewport()
  }, [fitImageToViewport, src])

  useEffect(() => {
    window.addEventListener("resize", fitImageToViewport)
    return () => window.removeEventListener("resize", fitImageToViewport)
  }, [fitImageToViewport])

  useEffect(() => () => {
    returnFocusTargetRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
        return
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault()
        zoomBy(PREVIEW_SCALE_STEP)
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault()
        zoomBy(-PREVIEW_SCALE_STEP)
      } else if (event.key === "0") {
        event.preventDefault()
        resetView()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, resetView, zoomBy])

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const viewportRect = event.currentTarget.getBoundingClientRect()
    zoomBy(event.deltaY > 0 ? -PREVIEW_SCALE_STEP : PREVIEW_SCALE_STEP, {
      x: event.clientX - viewportRect.left,
      y: event.clientY - viewportRect.top
    })
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !imageSize) return

    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDragState({
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: previewView.offset
    })
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return

    setPreviewView((currentView) => ({
      ...currentView,
      offset: {
        x: roundPreviewNumber(dragState.origin.x + event.clientX - dragState.start.x),
        y: roundPreviewNumber(dragState.origin.y + event.clientY - dragState.start.y)
      }
    }))
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragState?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragState(null)
  }

  return (
    <div className="image-preview-layer" role="presentation" data-testid="image-preview-layer">
      <button
        className="image-preview-backdrop"
        type="button"
        aria-label={t("image.preview.close")}
        data-testid="image-preview-backdrop"
        onClick={onClose}
      />
      <div
        className="image-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-preview-title"
        aria-describedby="image-preview-instructions"
      >
        <span id="image-preview-instructions" className="visually-hidden">
          {t("image.preview.instructions")}
        </span>
        <div className="image-preview-toolbar">
          <strong id="image-preview-title" title={name}>{name}</strong>
          <div className="image-preview-controls" role="group" aria-label={t("image.preview.controls")}>
            <button
              type="button"
              aria-label={t("image.preview.zoom-out")}
              title={t("image.preview.zoom-out")}
              disabled={scale <= MIN_PREVIEW_SCALE}
              data-testid="image-preview-zoom-out"
              onClick={() => zoomBy(-PREVIEW_SCALE_STEP)}
            >
              <FontAwesomeIcon icon={faMagnifyingGlassMinus} />
            </button>
            <span
              aria-label={t("image.preview.zoom-level", { percent: zoomPercent })}
              aria-live="polite"
              data-testid="image-preview-zoom-level"
            >
              {zoomPercent}
            </span>
            <button
              type="button"
              aria-label={t("image.preview.zoom-in")}
              title={t("image.preview.zoom-in")}
              disabled={scale >= MAX_PREVIEW_SCALE}
              data-testid="image-preview-zoom-in"
              onClick={() => zoomBy(PREVIEW_SCALE_STEP)}
            >
              <FontAwesomeIcon icon={faMagnifyingGlassPlus} />
            </button>
            <button
              type="button"
              aria-label={t("image.preview.fit")}
              title={t("image.preview.fit")}
              data-testid="image-preview-fit"
              onClick={resetView}
            >
              <FontAwesomeIcon icon={faRotateRight} />
            </button>
            <button
              type="button"
              autoFocus
              aria-label={t("image.preview.close")}
              title={t("image.preview.close")}
              onClick={onClose}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        </div>
        <div
          ref={viewportRef}
          className={`image-preview-viewport${dragState ? " is-dragging" : ""}`}
          data-testid="image-preview-viewport"
          title={t("image.preview.instructions")}
          onDoubleClick={toggleActualSize}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div
            className="image-preview-canvas"
            data-testid="image-preview-canvas"
            style={canvasStyle}
          >
            <img
              ref={imageRef}
              src={src}
              alt={name}
              draggable={false}
              data-testid="image-preview-image"
              onLoad={fitImageToViewport}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
