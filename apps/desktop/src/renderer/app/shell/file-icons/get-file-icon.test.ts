import { describe, expect, it } from "vitest"
import { getFileIcon, resolveFileIconAssetUrl } from "./get-file-icon"

const baseHref = "http://localhost:5173/"

describe("getFileIcon", () => {
  it("resolves common language and config file icons", () => {
    expect(getFileIcon("index.ts", false, false, baseHref).src).toContain("/file-icons/typescript.svg")
    expect(getFileIcon("package.json", false, false, baseHref).src).toContain("/file-icons/nodejs.svg")
    expect(getFileIcon(".gitignore", false, false, baseHref).src).toContain("/file-icons/git.svg")
    expect(getFileIcon(".env", false, false, baseHref).src).toContain("/file-icons/tune.svg")
  })

  it("uses specific folder icons and open folder variants", () => {
    expect(getFileIcon(".git", true, false, baseHref).src).toContain("/file-icons/folder-git.svg")
    expect(getFileIcon(".git", true, true, baseHref).src).toContain("/file-icons/folder-git-open.svg")
    expect(getFileIcon("src", true, false, baseHref).src).toContain("/file-icons/folder-src.svg")
  })

  it("falls back to default file and folder icons", () => {
    expect(getFileIcon("unknown.thing", false, false, baseHref).src).toContain("/file-icons/file.svg")
    expect(getFileIcon("ordinary-folder", true, false, baseHref).src).toContain("/file-icons/folder.svg")
    expect(getFileIcon("ordinary-folder", true, true, baseHref).src).toContain("/file-icons/folder-open.svg")
  })

  it("builds stable public asset urls", () => {
    expect(resolveFileIconAssetUrl("typescript", baseHref)).toBe("http://localhost:5173/file-icons/typescript.svg")
  })
})
