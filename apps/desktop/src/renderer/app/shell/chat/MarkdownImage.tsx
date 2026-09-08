import { useState } from "react"
import { useTranslation } from "react-i18next"

export const MarkdownImage = ({ src, alt, onPreview }: {
  src?: string
  alt?: string
  onPreview?: (target: { src: string; name: string }) => void
}) => {
  const { t } = useTranslation("chat")
  const [failedUri, setFailedUri] = useState<string | null>(null)
  const name = alt || t("image.generated")
  if (!src || failedUri === src) return <span role="status">{t("image.unavailable")}</span>
  return (
    <button type="button" className="chat-markdown-image" aria-label={t("image.preview.open", { name })}
      onClick={() => onPreview?.({ src, name })}>
      <img src={src} alt={name} loading="lazy" onError={() => setFailedUri(src)} />
    </button>
  )
}
