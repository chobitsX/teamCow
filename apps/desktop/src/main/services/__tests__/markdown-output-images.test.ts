// @vitest-environment node
import { describe, expect, it } from "vitest"
import { readMarkdownOutputImages, rewriteMarkdownOutputImages } from "../markdown-output-images"

describe("Markdown image references", () => {
  it("handles spaces, parentheses, definitions and file URLs without parsing code examples", () => {
    const text = '![a](<folder/a (1).png>)\n![b][picture]\n\n[picture]: file:///tmp/b.png\n\n`![example](no.png)`\n```md\n![example](no.png)\n```\n![remote](https://example.com/a.png)'
    const images = readMarkdownOutputImages(text)
    expect(images.map((image) => image.source.uri)).toEqual(["folder/a (1).png", "file:///tmp/b.png"])
    const rewritten = rewriteMarkdownOutputImages(text, images, ["teamcow-attachment://conversation/c/a", "teamcow-attachment://conversation/c/b"])
    expect(rewritten).toContain("![a](teamcow-attachment://conversation/c/a)")
    expect(rewritten).toContain("![b](teamcow-attachment://conversation/c/b)")
    expect(rewritten).toContain("`![example](no.png)`")
    expect(readMarkdownOutputImages(rewritten)).toHaveLength(0)
  })
})
