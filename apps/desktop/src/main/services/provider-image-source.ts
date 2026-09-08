import { createHash } from "node:crypto"
import { z } from "zod"

export const providerImageSourceSchema = z.object({
  id: z.string().min(1),
  savedPath: z.string().nullish(),
  result: z.string().nullish(),
  uri: z.string().nullish(),
  mimeType: z.string().optional()
})
export type ProviderImageSource = z.infer<typeof providerImageSourceSchema>

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
const string = (value: unknown) => typeof value === "string" ? value : undefined

// Only inspect protocol content blocks, never tool inputs or arbitrary object fields.
export const readContentImageSources = (content: unknown, prefix: string): ProviderImageSource[] => {
  const images: ProviderImageSource[] = []
  const seen = new Set<string>()
  const visit = (value: unknown, depth = 0) => {
    if (depth > 6) return
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, depth + 1))
      return
    }
    const block = record(value)
    if (!block) return
    if (block.type === "content" || block.type === "tool_result") {
      visit(block.content, depth + 1)
      return
    }
    const source = record(block.source)
    const resource = record(block.resource)
    const mimeType = string(source?.media_type) ?? string(block.mimeType) ?? string(block.mime) ?? string(resource?.mimeType)
    if (block.type !== "image" && !(["file", "resource", "resource_link"].includes(String(block.type)) && mimeType?.startsWith("image/"))) return
    const result = string(block.data) ?? (source?.type === "base64" ? string(source.data) : undefined) ?? string(resource?.blob)
    const uri = string(block.url) ?? string(block.uri) ?? string(source?.url) ?? string(resource?.uri)
    const key = createHash("sha256").update(result ?? uri ?? "unavailable").digest("hex").slice(0, 16)
    if (seen.has(key)) return
    seen.add(key)
    images.push(providerImageSourceSchema.parse({ id: `${prefix}:${images.length}:${key}`, result, uri, mimeType }))
  }
  visit(content)
  return images
}

export const readLegacyContentImageSources = (payload: Record<string, unknown>): ProviderImageSource[] => {
  const prefix = string(payload.toolCallId) ?? string(payload.partId) ?? string(payload.messageId) ?? "legacy-image"
  const raw = record(payload.raw)
  if (payload.rawType === "cursor/generate_image") {
    return [providerImageSourceSchema.parse({ id: prefix, savedPath: string(payload.path) ?? string(raw?.filePath) })]
  }
  if (payload.provider === "claude" && payload.contentType === "tool_result") {
    return readContentImageSources(record(payload.toolResult)?.content, prefix)
  }
  if (payload.provider === "cursor") {
    const update = record(raw?.update)
    if (["agent_message_chunk", "tool_call", "tool_call_update"].includes(String(payload.rawType))) {
      return readContentImageSources(payload.content ?? update?.content, prefix)
    }
  }
  if (payload.provider === "opencode") {
    const part = record(payload.part) ?? record(raw?.part)
    const state = record(part?.state)
    if (part?.type === "tool" && state?.status === "completed") return readContentImageSources(state.attachments, prefix)
  }
  return []
}
