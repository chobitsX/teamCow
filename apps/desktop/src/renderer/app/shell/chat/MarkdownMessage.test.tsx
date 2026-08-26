// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { i18n } from "../../providers/I18nProvider"
import { MarkdownMessage } from "./MarkdownMessage"
import { clearMermaidRenderCache } from "./mermaid-render-cache"

const { parseMermaidMock, renderMermaidMock } = vi.hoisted(() => ({
  parseMermaidMock: vi.fn(),
  renderMermaidMock: vi.fn()
}))

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: parseMermaidMock,
    render: renderMermaidMock
  }
}))

const renderMarkdownMessage = (content: string) =>
  render(
    <I18nextProvider i18n={i18n}>
      <MarkdownMessage content={content} />
    </I18nextProvider>
  )

const dispatchPointerEvent = (
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  options: { pointerId: number; clientX: number; clientY: number }
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX,
    clientY: options.clientY
  }) as MouseEvent & { pointerId: number }
  Object.defineProperty(event, "pointerId", { value: options.pointerId })
  target.dispatchEvent(event)
  return event
}

beforeEach(async () => {
  await i18n.changeLanguage("en")
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
  clearMermaidRenderCache()
  parseMermaidMock.mockReset()
  parseMermaidMock.mockResolvedValue({ diagramType: "flowchart-v2" })
  renderMermaidMock.mockReset()
  renderMermaidMock.mockResolvedValue({
    svg: '<svg role="img" aria-label="Rendered Mermaid diagram"><text>A to B</text></svg>'
  })
})

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
})

describe("MarkdownMessage", () => {
  it("renders web links so Electron opens them outside the app window", () => {
    renderMarkdownMessage("Read the [README](https://github.com/teamcow/app#readme).")

    const link = screen.getByRole("link", { name: "README" })

    expect(link.getAttribute("href")).toBe("https://github.com/teamcow/app#readme")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noreferrer noopener")
  })

  it("renders GitHub-flavored markdown tables from provider output", () => {
    renderMarkdownMessage(
      ["| 维度 | n8n | Dify |", "|---|---|---|", "| 核心定位 | 自动化流程 | AI 应用平台 |"].join(
        "\n"
      )
    )

    expect(screen.getByRole("table")).toBeTruthy()
    expect(screen.getByRole("columnheader", { name: "维度" })).toBeTruthy()
    expect(screen.getByRole("cell", { name: "自动化流程" })).toBeTruthy()
  })

  it("renders Mermaid fenced code blocks as diagrams", async () => {
    renderMarkdownMessage(["```mermaid", "flowchart TD", "A --> B", "```"].join("\n"))

    expect(screen.getByRole("figure", { name: "Mermaid diagram" })).toBeTruthy()
    await waitFor(() =>
      expect(renderMermaidMock).toHaveBeenCalledWith(expect.any(String), "flowchart TD\nA --> B\n")
    )
    await screen.findByRole("img", { name: "Rendered Mermaid diagram" })
  })

  it("recognizes Mermaid fence language without case sensitivity", async () => {
    renderMarkdownMessage(["```Mermaid", "flowchart TD", "A --> B", "```"].join("\n"))

    await screen.findByRole("img", { name: "Rendered Mermaid diagram" })
  })

  it("keeps rendered Mermaid diagrams stable when the parent rerenders unchanged content", async () => {
    const content = ["```mermaid", "flowchart TD", "A --> B", "```"].join("\n")
    const view = renderMarkdownMessage(content)

    await screen.findByRole("img", { name: "Rendered Mermaid diagram" })
    expect(renderMermaidMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      view.rerender(
        <I18nextProvider i18n={i18n}>
          <MarkdownMessage content={content} />
        </I18nextProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(renderMermaidMock).toHaveBeenCalledTimes(1)
  })

  it("debounces Mermaid rendering until a streaming diagram source settles", async () => {
    const partial = ["```mermaid", "mindmap", "  root((Recent commits))"].join("\n")
    const complete = [partial, "    Overview", "```"].join("\n")
    const view = renderMarkdownMessage(partial)

    await act(async () => {
      view.rerender(
        <I18nextProvider i18n={i18n}>
          <MarkdownMessage content={complete} />
        </I18nextProvider>
      )
      await Promise.resolve()
    })

    await waitFor(() => expect(renderMermaidMock).toHaveBeenCalledTimes(1))
    expect(renderMermaidMock).toHaveBeenCalledWith(
      expect.any(String),
      "mindmap\n  root((Recent commits))\n    Overview\n"
    )
  })

  it("reuses rendered Mermaid SVG when a diagram remounts with unchanged content", async () => {
    const content = ["```mermaid", "flowchart TD", "A --> B", "```"].join("\n")
    const view = renderMarkdownMessage(content)

    await screen.findByRole("img", { name: "Rendered Mermaid diagram" })
    expect(renderMermaidMock).toHaveBeenCalledTimes(1)

    view.unmount()
    renderMarkdownMessage(content)

    await screen.findByRole("img", { name: "Rendered Mermaid diagram" })
    expect(renderMermaidMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      lines: ["flowchart TD", "A --> B"],
      source: "flowchart TD\nA --> B\n"
    },
    {
      lines: ["graph LR", "A --> B"],
      source: "graph LR\nA --> B\n"
    },
    {
      lines: ["sequenceDiagram", "participant A", "participant B", "A->>B: hello"],
      source: "sequenceDiagram\nparticipant A\nparticipant B\nA->>B: hello\n"
    }
  ])("auto-detects unlabeled Mermaid code blocks that start with $lines.0", async ({ lines, source }) => {
    renderMarkdownMessage(["```", ...lines, "```"].join("\n"))

    expect(screen.getByRole("figure", { name: "Mermaid diagram" })).toBeTruthy()
    await waitFor(() => expect(renderMermaidMock).toHaveBeenCalledWith(expect.any(String), source))
  })

  it("keeps ordinary unlabeled code blocks as code", () => {
    renderMarkdownMessage(["```", 'const value = "flowchart TD"', "console.log(value)", "```"].join("\n"))

    expect(screen.queryByRole("figure", { name: "Mermaid diagram" })).toBeNull()
    expect(document.querySelector(".markdown-message pre code")?.textContent).toContain(
      'const value = "flowchart TD"'
    )
    expect(renderMermaidMock).not.toHaveBeenCalled()
  })

  it("quotes unsafe flowchart labels before rendering Mermaid diagrams", async () => {
    renderMarkdownMessage(
      ["```mermaid", "flowchart TD", "M8 --> M81[@ant-design/x 聊天界面]", "```"].join("\n")
    )

    expect(screen.getByRole("figure", { name: "Mermaid diagram" })).toBeTruthy()
    await waitFor(() =>
      expect(renderMermaidMock).toHaveBeenCalledWith(
        expect.any(String),
        'flowchart TD\nM8 --> M81["@ant-design/x 聊天界面"]\n'
      )
    )
  })

  it("quotes flowchart labels that Mermaid mistakes for shape syntax", async () => {
    renderMarkdownMessage(
      ["```mermaid", "flowchart TD", "B --> C[/login/magicboxLogin]", "```"].join("\n")
    )

    expect(screen.getByRole("figure", { name: "Mermaid diagram" })).toBeTruthy()
    await waitFor(() =>
      expect(renderMermaidMock).toHaveBeenCalledWith(
        expect.any(String),
        'flowchart TD\nB --> C["/login/magicboxLogin"]\n'
      )
    )
  })

  it("quotes function calls inside decision labels before rendering Mermaid diagrams", async () => {
    renderMarkdownMessage(
      [
        "```mermaid",
        "flowchart TD",
        "A[业务页面启动] --> B{yum.needShowPrivacy()}",
        "B -->|否| C[直接进入业务页面]",
        "B -->|是| D[加载 StartPrivacy 组件]",
        "```"
      ].join("\n")
    )

    await waitFor(() =>
      expect(renderMermaidMock).toHaveBeenCalledWith(
        expect.any(String),
        [
          "flowchart TD",
          'A[业务页面启动] --> B{"yum.needShowPrivacy()"}',
          "B -->|否| C[直接进入业务页面]",
          "B -->|是| D[加载 StartPrivacy 组件]",
          ""
        ].join("\n")
      )
    )
  })

  it("retries failed flowchart renders with quoted labels", async () => {
    renderMermaidMock
      .mockRejectedValueOnce(new Error("parser rejected unquoted label"))
      .mockResolvedValueOnce({
        svg: '<svg role="img" aria-label="Rendered Mermaid diagram"><text>A to B</text></svg>'
      })

    renderMarkdownMessage(
      [
        "```mermaid",
        "flowchart TD",
        "A[Ant Design Pro 运营平台] --> B[PC CMS 管理端]",
        "B --> B1[权限管理 RBAC]",
        "```"
      ].join("\n")
    )

    await screen.findByRole("img", { name: "Rendered Mermaid diagram" })
    expect(renderMermaidMock).toHaveBeenCalledTimes(2)
    expect(renderMermaidMock).toHaveBeenLastCalledWith(
      expect.any(String),
      [
        "flowchart TD",
        'A["Ant Design Pro 运营平台"] --> B["PC CMS 管理端"]',
        'B --> B1["权限管理 RBAC"]',
        ""
      ].join("\n")
    )
  })

  it("validates candidates before rendering and skips rejected Mermaid syntax", async () => {
    parseMermaidMock.mockResolvedValueOnce(false).mockResolvedValueOnce({ diagramType: "flowchart-v2" })

    renderMarkdownMessage(
      ["```mermaid", "flowchart TD", "A[Ant Design Pro 运营平台] --> B[PC CMS 管理端]", "```"].join(
        "\n"
      )
    )

    await screen.findByRole("img", { name: "Rendered Mermaid diagram" })
    expect(parseMermaidMock).toHaveBeenCalledTimes(2)
    expect(renderMermaidMock).toHaveBeenCalledTimes(1)
    expect(renderMermaidMock).toHaveBeenCalledWith(
      expect.any(String),
      ['flowchart TD', 'A["Ant Design Pro 运营平台"] --> B["PC CMS 管理端"]', ""].join("\n")
    )
  })

  it("keeps Mermaid source visible when diagram rendering fails", async () => {
    renderMermaidMock.mockRejectedValueOnce(new Error("invalid syntax"))

    renderMarkdownMessage(["```mermaid", "flowchart TD", "A -->", "```"].join("\n"))

    await screen.findByText("Unable to render Mermaid diagram.")
    expect(screen.getByText(/flowchart TD/)).toBeTruthy()
  })

  it("removes Mermaid error DOM left behind by failed renders", async () => {
    renderMermaidMock.mockImplementationOnce((diagramId: string) => {
      const leakedErrorContainer = document.createElement("div")
      leakedErrorContainer.id = `d${diagramId}`
      leakedErrorContainer.textContent = "Syntax error in text"
      document.body.appendChild(leakedErrorContainer)

      return Promise.reject(new Error("invalid syntax"))
    })

    renderMarkdownMessage(["```mermaid", "flowchart TD", "A -->", "```"].join("\n"))

    await screen.findByText("Unable to render Mermaid diagram.")
    expect(document.querySelector('[id^="dteamcow-mermaid-"]')).toBeNull()
    expect(document.body.textContent).not.toContain("Syntax error in text")
  })

  it("opens rendered Mermaid diagrams in a pannable zoom preview", async () => {
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this instanceof HTMLElement && this.classList.contains("mermaid-preview__viewport")) {
        return {
          bottom: 600,
          height: 600,
          left: 0,
          right: 1000,
          top: 0,
          width: 1000,
          x: 0,
          y: 0,
          toJSON: () => ({})
        }
      }
      return originalGetBoundingClientRect.call(this)
    }
    renderMermaidMock.mockResolvedValueOnce({
      svg: '<svg role="img" aria-label="Rendered Mermaid diagram" viewBox="0 0 2000 300"><text>A to B</text></svg>'
    })

    renderMarkdownMessage(["```mermaid", "flowchart TD", "A --> B", "```"].join("\n"))

    await screen.findByRole("img", { name: "Rendered Mermaid diagram" })
    fireEvent.click(screen.getByRole("button", { name: "Open Mermaid preview" }))

    const dialog = screen.getByRole("dialog", { name: "Mermaid preview" })
    expect(dialog).toBeTruthy()
    expect(document.querySelector(".markdown-message")?.contains(dialog)).toBe(false)
    expect(dialog.parentElement).toBe(document.body.querySelector(".mermaid-preview-layer"))
    await screen.findByText("45%")

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(screen.getByText("65%")).toBeTruthy()
    expect(screen.getByTestId("mermaid-preview-canvas").getAttribute("style")).toContain("scale(0.65)")

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }))
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }))
    expect(screen.getByText("45%")).toBeTruthy()
    expect(screen.getByTestId("mermaid-preview-canvas").getAttribute("style")).toContain("translate(50px, 232.5px)")

    const viewport = screen.getByTestId("mermaid-preview-viewport")
    const outsideWheelHandler = vi.fn()
    document.body.addEventListener("wheel", outsideWheelHandler)
    const zoomInWheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 250,
      clientY: 300,
      deltaY: -100
    })
    act(() => viewport.dispatchEvent(zoomInWheelEvent))
    expect(zoomInWheelEvent.defaultPrevented).toBe(true)
    expect(outsideWheelHandler).not.toHaveBeenCalled()
    expect(screen.getByText("65%")).toBeTruthy()
    expect(screen.getByTestId("mermaid-preview-canvas").getAttribute("style")).toContain("translate(-38.89px, 202.5px)")
    fireEvent.wheel(viewport, { clientX: 250, clientY: 300, deltaY: 100 })
    document.body.removeEventListener("wheel", outsideWheelHandler)
    expect(screen.getByText("45%")).toBeTruthy()
    expect(screen.getByTestId("mermaid-preview-canvas").getAttribute("style")).toContain("translate(50px, 232.5px)")

    let pointerDownEvent!: MouseEvent
    act(() => {
      pointerDownEvent = dispatchPointerEvent(viewport, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 })
    })
    expect(pointerDownEvent.defaultPrevented).toBe(true)
    act(() => dispatchPointerEvent(viewport, "pointermove", { pointerId: 1, clientX: 124, clientY: 132 }))
    act(() => dispatchPointerEvent(viewport, "pointerup", { pointerId: 1, clientX: 124, clientY: 132 }))
    await waitFor(() =>
      expect(screen.getByTestId("mermaid-preview-canvas").getAttribute("style")).toContain("translate(74px, 264.5px)")
    )

    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Mermaid preview" })).toBeNull()
  })
})
