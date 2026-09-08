import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { GeneratedImageSummary } from "@shared/index"

export const GeneratedImageMessage = ({ image, onPreview }: {
  image: GeneratedImageSummary
  onPreview?: (target: { src: string; name: string }) => void
}) => {
  const { t } = useTranslation("chat")
  const [failedUri, setFailedUri] = useState<string | null>(null)
  const attachment = image.status === "ready" ? image.attachment : null
  return (
    <article className="chat-message provider generated-image" data-testid="chat-provider-image">
      <div className="chat-message-meta"><span>{t("image.generated")}</span></div>
      {attachment && failedUri !== attachment.uri ? (
        <figure className="chat-message-attachment image">
          <button
            type="button"
            className="chat-message-attachment__preview-button"
            aria-label={t("image.preview.open", { name: attachment.name })}
            data-testid="chat-image-preview-trigger"
            onClick={() => onPreview?.({ src: attachment.uri, name: attachment.name })}
          >
            <img src={attachment.uri} alt={attachment.name} loading="lazy" onError={() => setFailedUri(attachment.uri)} />
          </button>
          <figcaption>{attachment.name}</figcaption>
        </figure>
      ) : <p role="status">{t("image.unavailable")}</p>}
    </article>
  )
}
