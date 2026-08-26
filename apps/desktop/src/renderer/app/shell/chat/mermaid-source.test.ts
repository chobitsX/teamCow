// @vitest-environment jsdom
import mermaid from "mermaid"
import { describe, expect, it } from "vitest"
import {
  getMermaidRenderCandidates,
  looksLikeMermaidSource,
  normalizeMermaidSourceForRender
} from "./mermaid-source"

describe("normalizeMermaidSourceForRender", () => {
  it("normalizes and parses provider flowcharts containing function-call labels", async () => {
    const source = [
      "flowchart TD",
      "A[业务页面启动] --> B{yum.needShowPrivacy()}",
      "B -->|否| C[直接进入业务页面]",
      "B -->|是| D[加载 StartPrivacy 组件]"
    ].join("\n")

    const normalizedSource = normalizeMermaidSourceForRender(source)

    expect(normalizedSource).toContain('B{"yum.needShowPrivacy()"}')
    await expect(mermaid.parse(normalizedSource)).resolves.toMatchObject({ diagramType: "flowchart-v2" })
  })

  it("quotes labels without flattening Mermaid shape delimiters", async () => {
    const source = [
      "flowchart LR",
      "A[rectangle] --> B(rounded)",
      "B --> C{decision}",
      "C --> D((circle))",
      "D --> E[(database)]",
      "E --> F([stadium])",
      "F --> G{{hexagon}}",
      "G --> H[[subroutine]]"
    ].join("\n")

    const normalizedSource = normalizeMermaidSourceForRender(source, { quoteSafeLabels: true })

    expect(normalizedSource).toBe(
      [
        "flowchart LR",
        'A["rectangle"] --> B("rounded")',
        'B --> C{"decision"}',
        'C --> D(("circle"))',
        'D --> E[("database")]',
        'E --> F(["stadium"])',
        'F --> G{{"hexagon"}}',
        'G --> H[["subroutine"]]'
      ].join("\n")
    )
    await expect(mermaid.parse(normalizedSource)).resolves.toMatchObject({ diagramType: "flowchart-v2" })
  })

  it("handles nested delimiters in labels and leaves quoted labels unchanged", () => {
    const source = [
      "flowchart TD",
      "A(call(value)) --> B{payload[key]}",
      'B --> C["already (quoted)"]'
    ].join("\n")

    expect(normalizeMermaidSourceForRender(source)).toBe(
      [
        "flowchart TD",
        'A("call(value)") --> B{"payload[key]"}',
        'B --> C["already (quoted)"]'
      ].join("\n")
    )
  })

  it("repairs an incomplete slash label without consuming a later node", () => {
    const source = ["flowchart TD", "A --> B[/login/magicboxLogin]", "B --> C[/valid slanted/]"].join(
      "\n"
    )

    expect(normalizeMermaidSourceForRender(source)).toBe(
      ["flowchart TD", 'A --> B["/login/magicboxLogin"]', "B --> C[/valid slanted/]"].join("\n")
    )
  })

  it("normalizes flowcharts that use supported Mermaid frontmatter", async () => {
    const source = [
      "---",
      "title: A(Privacy flow)",
      "config:",
      "  flowchart:",
      "    curve: linear",
      "---",
      "flowchart TD",
      "A --> B{yum.needShowPrivacy()}"
    ].join("\n")

    const normalizedSource = normalizeMermaidSourceForRender(source)

    expect(normalizedSource).toContain("title: A(Privacy flow)")
    expect(normalizedSource).toContain('B{"yum.needShowPrivacy()"}')
    await expect(mermaid.parse(normalizedSource)).resolves.toMatchObject({ diagramType: "flowchart-v2" })
  })

  it.each([
    {
      expectedType: "swimlane",
      source: [
        "swimlane-beta LR",
        "subgraph Review",
        "  decision{yum.needShowPrivacy()}",
        "end"
      ].join("\n")
    },
    {
      expectedType: "kanban",
      source: ["kanban", "  todo[Todo]", "    privacy[Check yum.needShowPrivacy()]"].join("\n")
    }
  ])("normalizes flowchart-style labels in $expectedType diagrams", async ({ expectedType, source }) => {
    const normalizedSource = normalizeMermaidSourceForRender(source)

    expect(normalizedSource).toContain('"')
    await expect(mermaid.parse(normalizedSource)).resolves.toMatchObject({ diagramType: expectedType })
  })

  it("removes a redundant Mermaid preamble from render candidates", () => {
    const source = ["mermaid", "flowchart TD", "A --> B{check()}"].join("\n")

    expect(looksLikeMermaidSource(source)).toBe(true)
    expect(getMermaidRenderCandidates(source)[0]).toBe(['flowchart TD', 'A --> B{"check()"}'].join("\n"))
  })

  it("removes a redundant Mermaid preamble after frontmatter and directives", () => {
    const source = [
      "---",
      "title: Example",
      "---",
      "%%{init: { 'flowchart': { 'curve': 'linear' } }}%%",
      "mermaid",
      "flowchart TD",
      "A --> B{check()}"
    ].join("\n")

    const candidate = getMermaidRenderCandidates(source)[0]

    expect(candidate).not.toContain("\nmermaid\n")
    expect(candidate).toContain('B{"check()"}')
  })

  it.each([
    "flowchart TD",
    "graph LR",
    "swimlane-beta LR",
    "sequenceDiagram",
    "classDiagram-v2",
    "stateDiagram-v2",
    "erDiagram",
    "journey",
    "gantt",
    "pie",
    "gitGraph",
    "mindmap",
    "timeline",
    "quadrantChart",
    "requirementDiagram",
    "C4Deployment",
    "xychart",
    "block-beta",
    "packet-beta",
    "architecture-beta",
    "sankey-beta",
    "kanban",
    "radar-beta",
    "treeView-beta",
    "eventmodeling",
    "ishikawa-beta",
    "venn-beta",
    "treemap-beta",
    "wardley-beta",
    "cynefin-beta",
    "railroad-beta",
    "railroad-ebnf-beta",
    "railroad-abnf-beta",
    "railroad-peg-beta"
  ])("recognizes bundled Mermaid diagram declaration %s", (declaration) => {
    expect(looksLikeMermaidSource(`${declaration}\nexample`)).toBe(true)
  })

  it("does not classify ordinary code mentioning a graph as Mermaid", () => {
    expect(looksLikeMermaidSource('const graph = createGraph("LR")')).toBe(false)
  })
})
