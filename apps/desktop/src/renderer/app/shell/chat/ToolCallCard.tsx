import { useState } from "react"
import type React from "react"
import type { ToolEventRenderItem } from "../chat-render-model"

export const ToolCallCard = ({
  item,
  tChat,
  inlineActions
}: {
  item: ToolEventRenderItem
  tChat: (key: string) => string
  inlineActions?: React.ReactNode
}) => {
  const [expanded, setExpanded] = useState(false)

  const inputSummary = item.toolInput
    ? JSON.stringify(item.toolInput).slice(0, 100)
    : item.summary.slice(0, 100)

  return (
    <article className="chat-message tool" data-testid="chat-tool-event">
      <div className="chat-message-meta">
        <span>{tChat("render.tool-event")}</span>
        <span>{item.toolName ?? item.eventType}</span>
        {item.toolStatus ? <span>{item.toolStatus}</span> : null}
      </div>
      <p>{inputSummary}</p>
      {inlineActions}
      <button
        type="button"
        className="chat-inline-action"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? tChat("render.collapse") : tChat("render.expand")}
      </button>
      {expanded ? (
        <details open className="chat-raw-details">
          <summary>{tChat("render.tool-details")}</summary>
          <section>
            <strong>{tChat("render.tool-input")}</strong>
            <pre>{item.toolInput ? JSON.stringify(item.toolInput, null, 2) : item.summary}</pre>
          </section>
          {item.toolOutput ? (
            <section>
              <strong>{tChat("render.tool-output")}</strong>
              <pre>{item.toolOutput}</pre>
            </section>
          ) : null}
          {item.isToolError ? (
            <p className="tool-error">{tChat("render.tool-error")}</p>
          ) : null}
        </details>
      ) : null}
    </article>
  )
}
