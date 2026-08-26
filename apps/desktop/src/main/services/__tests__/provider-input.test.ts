// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  buildCodexUserInput,
  buildCursorPromptBlocks,
  buildOpenCodePromptParts,
  buildPromptWithAttachmentReferences,
  getAttachmentDirectories,
  type ProviderInputAttachment
} from "../provider-input"

const temporaryDirectories: string[] = []

const createAttachments = () => {
  const directory = mkdtempSync(join(tmpdir(), "teamcow-provider-input-"))
  temporaryDirectories.push(directory)
  const imagePath = join(directory, "screen.png")
  const filePath = join(directory, "notes.txt")
  writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  writeFileSync(filePath, "attachment notes")

  return [
    {
      id: "image-1",
      kind: "image",
      name: "screen.png",
      mimeType: "image/png",
      sizeBytes: 4,
      path: imagePath
    },
    {
      id: "file-1",
      kind: "file",
      name: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 16,
      path: filePath
    }
  ] satisfies ProviderInputAttachment[]
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
  }
})

describe("provider attachment input adapters", () => {
  it("maps Codex images and files to native app-server user inputs", () => {
    const attachments = createAttachments()
    expect(buildCodexUserInput("Inspect these", attachments)).toEqual([
      { type: "text", text: "Inspect these" },
      { type: "localImage", path: attachments[0].path },
      { type: "mention", name: "notes.txt", path: attachments[1].path }
    ])
  })

  it("maps every OpenCode attachment to a data-backed file part", () => {
    const parts = buildOpenCodePromptParts("Inspect these", createAttachments())
    expect(parts[0]).toEqual({ type: "text", text: "Inspect these" })
    expect(parts.slice(1)).toEqual([
      expect.objectContaining({ type: "file", mime: "image/png", filename: "screen.png" }),
      expect.objectContaining({ type: "file", mime: "text/plain", filename: "notes.txt" })
    ])
    expect(parts.slice(1).every((part) => "url" in part && part.url.startsWith("data:"))).toBe(true)
  })

  it("uses Cursor image blocks when advertised and resource links for ordinary files", () => {
    const blocks = buildCursorPromptBlocks("Inspect these", createAttachments(), true)
    expect(blocks[1]).toMatchObject({ type: "image", mimeType: "image/png" })
    expect(blocks[2]).toMatchObject({ type: "resource_link", name: "notes.txt", mimeType: "text/plain" })

    const fallback = buildCursorPromptBlocks("Inspect these", createAttachments(), false)
    expect(fallback.slice(1).map((block) => block.type)).toEqual(["resource_link", "resource_link"])
  })

  it("builds Claude-readable path context without exposing it when no attachment exists", () => {
    const attachments = createAttachments()
    expect(buildPromptWithAttachmentReferences("Inspect these", [])).toBe("Inspect these")
    expect(buildPromptWithAttachmentReferences("Inspect these", attachments)).toContain(attachments[0].path)
    expect(getAttachmentDirectories(attachments)).toEqual([temporaryDirectories[0]])
  })
})
