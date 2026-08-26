import { readFileSync } from "node:fs"
import { dirname } from "node:path"
import { pathToFileURL } from "node:url"

export type ProviderInputAttachment = {
  id: string
  kind: "image" | "file"
  name: string
  mimeType: string
  sizeBytes: number
  path: string
}

export type CodexUserInput =
  | { type: "text"; text: string }
  | { type: "localImage"; path: string }
  | { type: "mention"; name: string; path: string }

export type OpenCodePromptPart =
  | { type: "text"; text: string }
  | { type: "file"; mime: string; filename: string; url: string }

export type CursorPromptBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string; uri: string }
  | {
      type: "resource_link"
      name: string
      uri: string
      mimeType: string
      size: number
    }

export const buildCodexUserInput = (
  prompt: string,
  attachments: ProviderInputAttachment[] = []
): CodexUserInput[] => [
  { type: "text", text: prompt },
  ...attachments.map((attachment): CodexUserInput => attachment.kind === "image"
    ? { type: "localImage", path: attachment.path }
    : { type: "mention", name: attachment.name, path: attachment.path })
]

const toDataUrl = (attachment: ProviderInputAttachment) =>
  `data:${attachment.mimeType || "application/octet-stream"};base64,${readFileSync(attachment.path).toString("base64")}`

export const buildOpenCodePromptParts = (
  prompt: string,
  attachments: ProviderInputAttachment[] = []
): OpenCodePromptPart[] => [
  { type: "text", text: prompt },
  ...attachments.map((attachment) => ({
    type: "file" as const,
    mime: attachment.mimeType || "application/octet-stream",
    filename: attachment.name,
    url: toDataUrl(attachment)
  }))
]

export const buildCursorPromptBlocks = (
  prompt: string,
  attachments: ProviderInputAttachment[] = [],
  supportsImages = false
): CursorPromptBlock[] => [
  { type: "text", text: prompt },
  ...attachments.map((attachment): CursorPromptBlock => {
    const uri = pathToFileURL(attachment.path).toString()
    if (attachment.kind === "image" && supportsImages) {
      return {
        type: "image",
        data: readFileSync(attachment.path).toString("base64"),
        mimeType: attachment.mimeType,
        uri
      }
    }

    return {
      type: "resource_link",
      name: attachment.name,
      uri,
      mimeType: attachment.mimeType,
      size: attachment.sizeBytes
    }
  })
]

export const buildPromptWithAttachmentReferences = (
  prompt: string,
  attachments: ProviderInputAttachment[] = []
) => {
  if (attachments.length === 0) {
    return prompt
  }

  const references = attachments.map((attachment) =>
    `- ${JSON.stringify(attachment.name)} (${attachment.mimeType || "application/octet-stream"}): ${JSON.stringify(attachment.path)}`
  )

  return [
    prompt,
    "",
    "<teamcow_attachments>",
    "The user attached the following local files. Treat them as user-provided context and read them when needed:",
    ...references,
    "</teamcow_attachments>"
  ].join("\n")
}

export const getAttachmentDirectories = (attachments: ProviderInputAttachment[] = []) =>
  [...new Set(attachments.map((attachment) => dirname(attachment.path)))]

export const getImageAttachmentPaths = (attachments: ProviderInputAttachment[] = []) =>
  attachments.filter((attachment) => attachment.kind === "image").map((attachment) => attachment.path)
