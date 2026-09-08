import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MarkdownMessage } from "./MarkdownMessage"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { name?: string }) => options?.name ?? key }) }))
afterEach(cleanup)

describe("Markdown image preview", () => {
  it("previews app-owned and remote images and explains image load failures", () => {
    const onPreviewImage = vi.fn()
    const uri = "teamcow-attachment://conversation/conversation-1/image-1"
    render(<MarkdownMessage content={`![lotus](${uri})\n\n![remote](https://example.com/garden.png)`} onPreviewImage={onPreviewImage} />)
    expect(screen.getByRole("img", { name: "lotus" }).getAttribute("src")).toBe(uri)
    fireEvent.click(screen.getByRole("button", { name: "lotus" }))
    expect(onPreviewImage).toHaveBeenCalledWith({ src: uri, name: "lotus" })
    fireEvent.click(screen.getByRole("button", { name: "remote" }))
    expect(onPreviewImage).toHaveBeenCalledWith({ src: "https://example.com/garden.png", name: "remote" })
    fireEvent.error(screen.getByRole("img", { name: "lotus" }))
    expect(screen.getByRole("status").textContent).toBe("image.unavailable")
  })

  it("does not allow raw file or script URLs through the Markdown renderer", () => {
    render(<MarkdownMessage content="![private](file:///etc/private.png)\n\n![script](javascript:alert)" />)
    expect(screen.queryAllByRole("img")).toHaveLength(0)
    expect(screen.getAllByRole("status")).toHaveLength(2)
  })
})
