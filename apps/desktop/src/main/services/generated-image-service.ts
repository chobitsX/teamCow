import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { generatedImageSummarySchema } from "@shared/index"
import { providerImageSourceSchema, type ProviderImageSource } from "./provider-image-source"

const MAX_IMAGE_BYTES = 32 * 1024 * 1024

// Also recognizes the progress events saved by older TeamCow releases.
export const readGeneratedImageSource = (payload: Record<string, unknown>) => {
  if (payload.contentType !== "imageGeneration" || payload.phase !== "completed") return null
  const parsed = providerImageSourceSchema.safeParse(payload.imageSource ?? payload.item)
  return parsed.success ? parsed.data : null
}

export const generatedImageId = (conversationId: string, runId: string, itemId: string) =>
  createHash("sha256").update(JSON.stringify([conversationId, runId, itemId])).digest("hex")

const containedPath = (root: string, path: string) => {
  const child = relative(root, path)
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

const detectImageType = (bytes: Buffer) => {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mimeType: "image/png", extension: "png" }
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return { mimeType: "image/jpeg", extension: "jpg" }
  }
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) {
    return { mimeType: "image/gif", extension: "gif" }
  }
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" }
  }
  return null
}

export const storeGeneratedImage = (input: {
  source: ProviderImageSource
  id: string
  directory: string
  uri: string
  allowedSourceRoots: string[]
  worktreeRoot?: string
}) => {
  try {
    let bytes: Buffer | null = null
    const inline = (input.source.result ?? input.source.uri)?.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]*)$/i)
    const encoded = inline?.[2] ?? input.source.result
    // Historical raw payloads can contain a truncated base64 value; use savedPath then.
    if (encoded && encoded.length <= Math.ceil(MAX_IMAGE_BYTES / 3) * 4 &&
      encoded.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      const decoded = Buffer.from(encoded, "base64")
      if (decoded.length <= MAX_IMAGE_BYTES && detectImageType(decoded)) bytes = decoded
    }
    const sourceUri = input.source.uri
    if (!bytes && sourceUri && /^https?:\/\//i.test(sourceUri)) {
      const url = new URL(sourceUri)
      if (url.username || url.password) throw new Error("Image URL must not include credentials")
      return {
        image: generatedImageSummarySchema.parse({ status: "ready", attachment: {
          id: input.id, kind: "image", name: `image-${input.id.slice(0, 8)}`,
          mimeType: input.source.mimeType ?? "image/png", sizeBytes: 0, uri: url.href
        } }),
        storagePath: null
      }
    }
    const savedPath = input.source.savedPath ?? (sourceUri?.startsWith("file:") ? fileURLToPath(sourceUri)
      : sourceUri && !/^[a-z][a-z0-9+.-]*:/i.test(sourceUri) ? decodeURIComponent(sourceUri.split(/[?#]/, 1)[0]) : undefined)
    if (!bytes && savedPath) {
      const path = realpathSync(isAbsolute(savedPath) ? savedPath : resolve(input.worktreeRoot ?? ".", savedPath))
      const allowed = input.allowedSourceRoots.some((root) => {
        try { return containedPath(realpathSync(root), path) } catch { return false }
      })
      if (!allowed) throw new Error("Image source is outside provider output roots")
      const stat = statSync(path)
      if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw new Error("Invalid image size")
      bytes = readFileSync(path)
    }
    const imageType = bytes && bytes.length <= MAX_IMAGE_BYTES ? detectImageType(bytes) : null
    if (!bytes || !imageType) throw new Error("Image data is missing or unsupported")
    mkdirSync(input.directory, { recursive: true })
    const name = `image-${input.id.slice(0, 8)}.${imageType.extension}`
    const storagePath = join(input.directory, `${input.id}.${imageType.extension}`)
    writeFileSync(storagePath, bytes, { mode: 0o600 })
    return {
      image: generatedImageSummarySchema.parse({
        status: "ready",
        attachment: { id: input.id, kind: "image", name, mimeType: imageType.mimeType, sizeBytes: bytes.length, uri: input.uri }
      }),
      storagePath
    }
  } catch {
    // Image failures must not discard the rest of a successful provider turn.
    return { image: generatedImageSummarySchema.parse({ status: "unavailable" }), storagePath: null }
  }
}

export const compactGeneratedImagePayload = (
  payload: Record<string, unknown>,
  image: z.infer<typeof generatedImageSummarySchema>
): Record<string, unknown> => ({
  provider: payload.provider,
  rawType: payload.rawType,
  transport: payload.transport,
  itemId: payload.itemId,
  providerEventId: payload.providerEventId,
  contentType: "imageGeneration",
  phase: "completed",
  image
})
