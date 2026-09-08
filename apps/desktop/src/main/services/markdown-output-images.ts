import { createHash } from "node:crypto"
import { fromMarkdown } from "mdast-util-from-markdown"
import type { Nodes } from "mdast"
import type { ProviderImageSource } from "./provider-image-source"

export type MarkdownOutputImage = {
  source: ProviderImageSource
  start: number
  end: number
  alt: string
}

export const readMarkdownOutputImages = (text: string): MarkdownOutputImage[] => {
  if (!text.includes("![")) return []
  const tree = fromMarkdown(text)
  const definitions = new Map<string, string>()
  const walk = (node: Nodes, visit: (node: Nodes) => void) => {
    visit(node)
    if ("children" in node) node.children.forEach((child) => walk(child, visit))
  }
  walk(tree, (node) => { if (node.type === "definition") definitions.set(node.identifier, node.url) })
  const images: MarkdownOutputImage[] = []
  walk(tree, (node) => {
    if (node.type !== "image" && node.type !== "imageReference") return
    const url = node.type === "image" ? node.url : definitions.get(node.identifier)
    if (!url || url.startsWith("#") || url.startsWith("//") ||
      (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(?:file:|data:image\/)/i.test(url))) return
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) return
    const id = `markdown:${createHash("sha256").update(url).digest("hex")}`
    images.push({ source: { id, uri: url }, start, end, alt: node.alt ?? "" })
  })
  return images
}

export const rewriteMarkdownOutputImages = (text: string, images: MarkdownOutputImage[], uris: string[]) => {
  let rewritten = text
  for (let index = images.length - 1; index >= 0; index -= 1) {
    const image = images[index]
    const alt = image.alt.replace(/[\\[\]]/g, "\\$&")
    rewritten = `${rewritten.slice(0, image.start)}![${alt}](${uris[index]})${rewritten.slice(image.end)}`
  }
  return rewritten
}
