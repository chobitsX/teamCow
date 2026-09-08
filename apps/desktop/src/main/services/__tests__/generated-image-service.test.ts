// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { storeGeneratedImage } from "../generated-image-service"

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jg1sAAAAASUVORK5CYII=", "base64")
const roots: string[] = []
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "teamcow-generated-image-"))
  roots.push(root)
  const sourceRoot = join(root, "source")
  mkdirSync(sourceRoot)
  return { root, sourceRoot, directory: join(root, "stored"), id: "image-1", uri: "teamcow-attachment://conversation/c/image-1", allowedSourceRoots: [sourceRoot] }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe("storeGeneratedImage", () => {
  it("stores large inline results intact without relying on a provider file", () => {
    const input = setup()
    const bytes = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)])
    const result = storeGeneratedImage({ ...input, source: { id: "native-1", result: bytes.toString("base64") } })
    expect(result.image).toMatchObject({ status: "ready", attachment: { mimeType: "image/png", sizeBytes: bytes.length } })
    expect(readFileSync(result.storagePath!).equals(bytes)).toBe(true)
  })

  it("recovers truncated legacy results from the saved provider file", () => {
    const input = setup()
    const savedPath = join(input.sourceRoot, "lotus.png")
    writeFileSync(savedPath, png)
    const result = storeGeneratedImage({ ...input, source: { id: "native-1", savedPath, result: "iVBOR...[TRUNCATED]" } })
    expect(result.image.status).toBe("ready")
    expect(readFileSync(result.storagePath!)).toEqual(png)
  })

  it("rejects outside paths and symlinks escaping provider roots", () => {
    const input = setup()
    const outside = join(input.root, "private.png")
    const link = join(input.sourceRoot, "link.png")
    writeFileSync(outside, png)
    symlinkSync(outside, link)
    for (const savedPath of [outside, link]) {
      expect(storeGeneratedImage({ ...input, source: { id: "native-1", savedPath } }).image.status).toBe("unavailable")
    }
  })

  it("keeps unreadable or non-image output as an unavailable image", () => {
    const input = setup()
    const savedPath = join(input.sourceRoot, "invalid.png")
    writeFileSync(savedPath, "not an image")
    for (const path of [savedPath, join(input.sourceRoot, "missing.png")]) {
      expect(storeGeneratedImage({ ...input, source: { id: "native-1", savedPath: path } }).image.status).toBe("unavailable")
    }
  })

  it("preserves remote image URLs as references without fetching them in main", () => {
    const input = setup()
    const result = storeGeneratedImage({ ...input, source: { id: "remote-1", uri: "https://example.com/image.png", mimeType: "image/png" } })
    expect(result).toMatchObject({ storagePath: null, image: { status: "ready", attachment: { uri: "https://example.com/image.png" } } })
    expect(storeGeneratedImage({ ...input, source: { id: "remote-2", uri: "https://secret:password@example.com/image.png" } }).image.status).toBe("unavailable")
  })

  it("resolves escaped relative image URLs and inline data URLs", () => {
    const input = setup()
    writeFileSync(join(input.sourceRoot, "garden (1).png"), png)
    for (const source of [
      { id: "relative", uri: "garden%20%281%29.png" },
      { id: "inline", result: `data:image/png;base64,${png.toString("base64")}` }
    ]) {
      const result = storeGeneratedImage({ ...input, worktreeRoot: input.sourceRoot, source })
      expect(result.image.status).toBe("ready")
      expect(readFileSync(result.storagePath!)).toEqual(png)
    }
  })
})
