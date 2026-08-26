import type { ConversationAttachmentInput } from "@shared/index"

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  csv: "text/csv",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  md: "text/markdown",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  webp: "image/webp",
  yaml: "application/yaml",
  yml: "application/yaml"
}

const PREVIEW_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

export type ComposerAttachmentDraft = ConversationAttachmentInput & {
  draftId: string
  previewUri: string | null
}

const inferMimeType = (file: File) => {
  if (file.type.trim()) {
    return file.type.trim().toLowerCase()
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  // eslint-disable-next-line i18next/no-literal-string -- MIME type is protocol metadata, not user-visible copy.
  return MIME_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream"
}

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.addEventListener("load", () => {
    if (typeof reader.result === "string") {
      resolve(reader.result)
    } else {
      reject(new Error("Attachment reader did not return a data URL"))
    }
  })
  reader.addEventListener("error", () => reject(reader.error ?? new Error("Attachment reader failed")))
  reader.readAsDataURL(file)
})

export const readComposerAttachment = async (
  file: File,
  fallbackName: string
): Promise<ComposerAttachmentDraft> => {
  const dataUrl = await readFileAsDataUrl(file)
  const separatorIndex = dataUrl.indexOf(",")
  if (separatorIndex < 0) {
    // eslint-disable-next-line i18next/no-literal-string -- Internal diagnostic; localized UI copy is supplied by the caller.
    throw new Error("Attachment data URL was malformed")
  }

  const mimeType = inferMimeType(file)
  return {
    draftId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: file.name.trim() || fallbackName,
    mimeType,
    sizeBytes: file.size,
    dataBase64: dataUrl.slice(separatorIndex + 1),
    previewUri: PREVIEW_IMAGE_MIME_TYPES.has(mimeType) ? dataUrl : null
  }
}
