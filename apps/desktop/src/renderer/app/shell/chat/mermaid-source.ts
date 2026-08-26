/* eslint-disable i18next/no-literal-string -- Mermaid keywords, delimiters, and escaped entities are machine syntax, not user-visible copy. */
type FlowchartLabel = {
  contentStart: number
  contentEnd: number
  end: number
  opener: string
  closer: string
}

type MermaidSourceLine = {
  text: string
  start: number
  end: number
}

type MermaidDiagramStart = {
  declaration: string
  declarationStart: number
  preamble?: MermaidSourceLine
}

const FLOWCHART_START_PATTERN = /^(?:flowchart(?:-elk)?|graph|swimlane-beta|kanban)\b/
const FLOWCHART_NODE_START_PATTERN = /\b[A-Za-z_][A-Za-z0-9_-]*(?=[[(>{])/g
const MERMAID_DIAGRAM_START_PATTERN =
  /^(?:(?:flowchart(?:-elk)?)(?:\s+(?:TB|TD|BT|RL|LR))?\b|graph\s+(?:TB|TD|BT|RL|LR)\b|swimlane-beta\b|erDiagram\b|gitGraph\b|gantt\b|info\b|pie\b|quadrantChart\b|xychart(?:-beta)?\b|requirement(?:Diagram)?\b|sequenceDiagram\b|classDiagram(?:-v2)?\b|stateDiagram(?:-v2)?\b|journey\b|timeline\b|mindmap\b|kanban\b|sankey(?:-beta)?\b|packet(?:-beta)?\b|radar-beta\b|block(?:-beta)?\b|treeView-beta\b|architecture(?:-beta)?\b|eventmodeling\b|ishikawa(?:-beta)?\b|venn-beta\b|treemap(?:-beta)?\b|wardley-beta\b|cynefin-beta\b|railroad-(?:ebnf-|abnf-|peg-)?beta\b|C4(?:Context|Container|Component|Dynamic|Deployment)\b)/
const BALANCED_FLOWCHART_OPENERS = ["(((", "((", "([", "[[", "[(", "{{", "[", "(", "{"] as const
const FLOWCHART_BRACKET_PAIRS = {
  "(": ")",
  "[": "]",
  "{": "}"
} as const

const splitMermaidSourceLines = (source: string): MermaidSourceLine[] => {
  const segments = source.match(/[^\r\n]*(?:\r\n|\n|$)/g)?.filter((segment) => segment.length > 0) ?? []
  let offset = 0

  return segments.map((segment) => {
    const line = {
      text: segment.replace(/\r?\n$/, ""),
      start: offset,
      end: offset + segment.length
    }
    offset = line.end
    return line
  })
}

const findNextMermaidContentLine = (lines: MermaidSourceLine[], startIndex: number) => {
  let lineIndex = startIndex

  while (lineIndex < lines.length) {
    const trimmedLine = lines[lineIndex].text.trim()
    if (trimmedLine.length === 0) {
      lineIndex += 1
      continue
    }

    if (trimmedLine.startsWith("%%{")) {
      while (lineIndex < lines.length && !lines[lineIndex].text.includes("}%%")) lineIndex += 1
      lineIndex += 1
      continue
    }

    if (trimmedLine.startsWith("%%")) {
      lineIndex += 1
      continue
    }

    return lineIndex
  }

  return -1
}

const getMermaidDiagramStart = (source: string): MermaidDiagramStart | null => {
  const lines = splitMermaidSourceLines(source)
  let lineIndex = findNextMermaidContentLine(lines, 0)
  if (lineIndex < 0) return null

  if (lines[lineIndex].text.trim() === "---") {
    lineIndex = lines.findIndex((line, index) => index > lineIndex && line.text.trim() === "---")
    if (lineIndex < 0) return null
    lineIndex = findNextMermaidContentLine(lines, lineIndex + 1)
    if (lineIndex < 0) return null
  }

  let preamble: MermaidSourceLine | undefined
  if (/^mermaid$/i.test(lines[lineIndex].text.trim())) {
    preamble = lines[lineIndex]
    lineIndex = findNextMermaidContentLine(lines, lineIndex + 1)
    if (lineIndex < 0) return null
  }

  return {
    declaration: lines[lineIndex].text.trim(),
    declarationStart: lines[lineIndex].start,
    preamble
  }
}

const removeStandaloneMermaidPreamble = (source: string) => {
  const diagramStart = getMermaidDiagramStart(source)
  if (!diagramStart?.preamble || !MERMAID_DIAGRAM_START_PATTERN.test(diagramStart.declaration)) return source

  return `${source.slice(0, diagramStart.preamble.start)}${source.slice(diagramStart.preamble.end)}`
}

export const looksLikeMermaidSource = (source: string) => {
  const diagramStart = getMermaidDiagramStart(source)
  return diagramStart ? MERMAID_DIAGRAM_START_PATTERN.test(diagramStart.declaration) : false
}

const getLineEnd = (source: string, start: number) => {
  const newlineIndex = source.indexOf("\n", start)
  return newlineIndex < 0 ? source.length : newlineIndex
}

const readBalancedFlowchartLabel = (
  source: string,
  start: number,
  opener: (typeof BALANCED_FLOWCHART_OPENERS)[number]
): FlowchartLabel | null => {
  const stack = [...opener] as Array<keyof typeof FLOWCHART_BRACKET_PAIRS>
  const initialDepth = stack.length
  const contentStart = start + opener.length
  let contentEnd = -1
  let inDoubleQuotes = false

  for (let index = contentStart; index < source.length; index += 1) {
    const character = source[index]
    if (character === "\n" || character === "\r") return null

    if (character === '"') {
      inDoubleQuotes = !inDoubleQuotes
      continue
    }
    if (inDoubleQuotes) continue

    if (character === "(" || character === "[" || character === "{") {
      stack.push(character)
      continue
    }

    if (character !== ")" && character !== "]" && character !== "}") continue

    const currentOpener = stack.at(-1)
    if (!currentOpener || FLOWCHART_BRACKET_PAIRS[currentOpener] !== character) return null
    if (stack.length === initialDepth) contentEnd = index

    stack.pop()
    if (stack.length === 0) {
      if (contentEnd < 0) return null

      return {
        contentStart,
        contentEnd,
        end: index + 1,
        opener,
        closer: source.slice(contentEnd, index + 1)
      }
    }
  }

  return null
}

const readSlantedFlowchartLabel = (source: string, start: number): FlowchartLabel | null => {
  const opener = source.slice(start, start + 2)
  if (opener !== "[/" && opener !== "[\\") return null

  const contentStart = start + opener.length
  const lineEnd = getLineEnd(source, contentStart)
  const closingCandidates = ["/]", "\\]"]
    .map((closer) => ({ closer, index: source.indexOf(closer, contentStart) }))
    .filter((candidate) => candidate.index >= 0 && candidate.index < lineEnd)
    .sort((left, right) => left.index - right.index)
  const closingCandidate = closingCandidates[0]
  if (!closingCandidate) return null

  return {
    contentStart,
    contentEnd: closingCandidate.index,
    end: closingCandidate.index + closingCandidate.closer.length,
    opener,
    closer: closingCandidate.closer
  }
}

const readAsymmetricFlowchartLabel = (source: string, start: number): FlowchartLabel | null => {
  if (source[start] !== ">") return null

  const contentStart = start + 1
  const contentEnd = source.indexOf("]", contentStart)
  if (contentEnd < 0 || contentEnd >= getLineEnd(source, contentStart)) return null

  return {
    contentStart,
    contentEnd,
    end: contentEnd + 1,
    opener: ">",
    closer: "]"
  }
}

const readFlowchartLabel = (source: string, start: number): FlowchartLabel | null => {
  const slantedLabel = readSlantedFlowchartLabel(source, start)
  if (slantedLabel) return slantedLabel

  if (source[start] === ">") return readAsymmetricFlowchartLabel(source, start)

  for (const opener of BALANCED_FLOWCHART_OPENERS) {
    if (!source.startsWith(opener, start)) continue

    const label = readBalancedFlowchartLabel(source, start, opener)
    if (label) return label
  }

  return null
}

const shouldQuoteFlowchartLabel = (label: FlowchartLabel, content: string) => {
  const trimmedContent = content.trimStart()
  const hasReservedDelimiter = /[()[\]{}]/.test(content)
  const hasBareLinkToken = content.includes("@")
  const hasIncompleteSlashShape =
    label.opener === "[" && trimmedContent.startsWith("/") && !content.trimEnd().endsWith("/")

  return hasReservedDelimiter || hasBareLinkToken || hasIncompleteSlashShape
}

const quoteFlowchartLabel = (content: string) => `"${content.replace(/"/g, "#quot;")}"`

export const normalizeMermaidSourceForRender = (
  source: string,
  options: { quoteSafeLabels?: boolean } = {}
) => {
  const diagramStart = getMermaidDiagramStart(source)
  if (!diagramStart || !FLOWCHART_START_PATTERN.test(diagramStart.declaration)) return source

  let cursor = 0
  let normalizedSource = ""
  FLOWCHART_NODE_START_PATTERN.lastIndex = diagramStart.declarationStart

  let match = FLOWCHART_NODE_START_PATTERN.exec(source)
  while (match) {
    const nodeIdStart = match.index
    const labelStart = nodeIdStart + match[0].length
    const label = readFlowchartLabel(source, labelStart)
    if (!label) {
      match = FLOWCHART_NODE_START_PATTERN.exec(source)
      continue
    }

    const content = source.slice(label.contentStart, label.contentEnd)
    const isAlreadyQuoted = content.trimStart().startsWith('"')
    const shouldQuote =
      !isAlreadyQuoted && (options.quoteSafeLabels || shouldQuoteFlowchartLabel(label, content))

    normalizedSource += source.slice(cursor, label.contentStart)
    normalizedSource += shouldQuote ? quoteFlowchartLabel(content) : content
    cursor = label.contentEnd
    FLOWCHART_NODE_START_PATTERN.lastIndex = label.end
    match = FLOWCHART_NODE_START_PATTERN.exec(source)
  }

  return `${normalizedSource}${source.slice(cursor)}`
}

export const getMermaidRenderCandidates = (source: string) => {
  const sourceWithoutPreamble = removeStandaloneMermaidPreamble(source)
  return [
    normalizeMermaidSourceForRender(sourceWithoutPreamble),
    normalizeMermaidSourceForRender(sourceWithoutPreamble, { quoteSafeLabels: true })
  ].filter((candidate, index, candidates) => candidates.indexOf(candidate) === index)
}
