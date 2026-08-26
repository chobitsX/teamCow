/* eslint-disable i18next/no-literal-string -- This pure renderer model emits machine enum values and raw artifact text; DesktopShell translates user-facing labels. */
import type { ArtifactSummary, ConversationTimeline } from "@shared/index"

export type InspectorDiffLineKind = "added" | "removed" | "context" | "hunk" | "meta"

export type InspectorDiffLine = {
  id: string
  kind: InspectorDiffLineKind
  content: string
}

export type InspectorDiffBlock = {
  id: string
  artifactId: string
  artifactKind: ArtifactSummary["kind"]
  runId: string | null
  filePath: string | null
  displayName: string
  status: string | null
  summary: string | null
  summaryKey: "diff.summary.changed-files" | "diff.summary.files" | "diff.summary.counts" | null
  summaryParams: Record<string, unknown> | null
  lines: InspectorDiffLine[]
  truncatedLineCount: number
  source: "artifact" | "summary"
}

const DIFF_PREVIEW_LINE_LIMIT = 64
const DIFF_PREVIEW_BLOCK_LIMIT = 24

const readPayloadString = (value: unknown) => typeof value === "string" && value.trim().length > 0 ? value.trim() : null
const readPayloadInteger = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null

const readRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null

const getFileDisplayName = (path: string | null) => {
  if (!path) {
    return ""
  }

  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) ?? path
}

const readFilePath = (value: unknown) => {
  const record = readRecord(value)
  if (!record) {
    return typeof value === "string" ? readPayloadString(value) : null
  }

  return readPayloadString(record.path) ??
    readPayloadString(record.file) ??
    readPayloadString(record.name) ??
    readPayloadString(record.title)
}

const readFileStatus = (value: unknown) => {
  const record = readRecord(value)
  if (!record) {
    return null
  }

  return readPayloadString(record.status) ??
    readPayloadString(record.changeType) ??
    readPayloadString(record.kind)
}

const getPayloadRows = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === "string" || readRecord(value)) {
    return [value]
  }

  return []
}

const getArtifactSummary = (artifact: ArtifactSummary) =>
  readPayloadString(artifact.payload.diffSummary) ??
  readPayloadString(artifact.payload.summary) ??
  readPayloadString(artifact.payload.preview) ??
  readPayloadString(artifact.payload.snippet) ??
  null

const getArtifactDiffText = (artifact: ArtifactSummary) =>
  readPayloadString(artifact.payload.diff) ??
  readPayloadString(artifact.payload.patch) ??
  readPayloadString(artifact.payload.unifiedDiff) ??
  readPayloadString(artifact.payload.diffText) ??
  null

const getRowDiffText = (row: unknown) => {
  const record = readRecord(row)
  if (!record) {
    return null
  }

  return readPayloadString(record.diff) ??
    readPayloadString(record.patch) ??
    readPayloadString(record.unifiedDiff) ??
    readPayloadString(record.diffText) ??
    null
}

const normalizeDiffFilePath = (line: string) => {
  const raw = line.replace(/^(---|\+\+\+)\s+/, "").trim()
  if (raw === "/dev/null") {
    return null
  }

  return raw.replace(/^[ab]\//, "")
}

const filePathFromDiffLines = (lines: string[]) => {
  const plusHeader = lines.find((line) => line.startsWith("+++ "))
  const minusHeader = lines.find((line) => line.startsWith("--- "))
  const plusPath = plusHeader ? normalizeDiffFilePath(plusHeader) : null
  return plusPath ?? (minusHeader ? normalizeDiffFilePath(minusHeader) : null)
}

const splitDiffIntoFileChunks = (diffText: string) => {
  const chunks: string[][] = []
  let current: string[] = []
  let truncatedLineCount = 0
  let acceptingChunks = true

  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("diff --git ") && current.length > 0) {
      if (chunks.length < DIFF_PREVIEW_BLOCK_LIMIT) {
        chunks.push(current)
      } else {
        truncatedLineCount += current.length
        acceptingChunks = false
      }
      current = []
    }

    if (acceptingChunks) {
      current.push(line)
    } else {
      truncatedLineCount += 1
    }
  }

  if (current.length > 0) {
    if (chunks.length < DIFF_PREVIEW_BLOCK_LIMIT) {
      chunks.push(current)
    } else {
      truncatedLineCount += current.length
    }
  }

  return { chunks, truncatedLineCount }
}

const toDiffLineKind = (line: string): InspectorDiffLineKind => {
  if (line.startsWith("@@")) {
    return "hunk"
  }

  if (line.startsWith("diff --git ") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
    return "meta"
  }

  if (line.startsWith("+")) {
    return "added"
  }

  if (line.startsWith("-")) {
    return "removed"
  }

  return "context"
}

const parseDiffLines = (blockId: string, lines: string[]) => {
  const visibleLines = lines.slice(0, DIFF_PREVIEW_LINE_LIMIT)
  return {
    lines: visibleLines.map((line, index) => ({
      id: `${blockId}-line-${index}`,
      kind: toDiffLineKind(line),
      content: line
    })),
    truncatedLineCount: Math.max(0, lines.length - visibleLines.length)
  }
}

const createBlock = ({
  artifact,
  index,
  filePath,
  status,
  summary,
  summaryKey = null,
  summaryParams = null,
  lines,
  source
}: {
  artifact: ArtifactSummary
  index: number
  filePath: string | null
  status: string | null
  summary: string | null
  summaryKey?: InspectorDiffBlock["summaryKey"]
  summaryParams?: InspectorDiffBlock["summaryParams"]
  lines: string[]
  source: InspectorDiffBlock["source"]
}): InspectorDiffBlock => {
  const id = `${artifact.id}-${index}`
  const parsedLines = parseDiffLines(id, lines)

  return {
    id,
    artifactId: artifact.id,
    artifactKind: artifact.kind,
    runId: artifact.runId,
    filePath,
    displayName: getFileDisplayName(filePath),
    status,
    summary,
    summaryKey,
    summaryParams,
    source,
    ...parsedLines
  }
}

const fileRowsForArtifact = (artifact: ArtifactSummary) => [
  ...getPayloadRows(artifact.payload.changedFiles),
  ...getPayloadRows(artifact.payload.files)
]

const findRowForFilePath = (rows: unknown[], filePath: string | null) => {
  if (!filePath) {
    return null
  }

  return rows.find((row) => readFilePath(row) === filePath) ?? null
}

const countSummaryForArtifact = (artifact: ArtifactSummary): Pick<InspectorDiffBlock, "summaryKey" | "summaryParams"> => {
  const changedFiles = readPayloadInteger(artifact.payload.changedFiles)
  const fileCount = readPayloadInteger(artifact.payload.fileCount)
  const additions = readPayloadInteger(artifact.payload.additions) ?? readPayloadInteger(artifact.payload.linesAdded)
  const deletions = readPayloadInteger(artifact.payload.deletions) ?? readPayloadInteger(artifact.payload.linesRemoved)

  if (changedFiles !== null && (additions !== null || deletions !== null)) {
    return {
      summaryKey: "diff.summary.counts",
      summaryParams: { count: changedFiles, additions: additions ?? 0, deletions: deletions ?? 0 }
    }
  }

  if (changedFiles !== null) {
    return {
      summaryKey: "diff.summary.changed-files",
      summaryParams: { count: changedFiles }
    }
  }

  if (fileCount !== null) {
    return {
      summaryKey: "diff.summary.files",
      summaryParams: { count: fileCount }
    }
  }

  return { summaryKey: null, summaryParams: null }
}

const blocksForFullDiff = (artifact: ArtifactSummary, diffText: string): InspectorDiffBlock[] => {
  const rows = fileRowsForArtifact(artifact)
  const split = splitDiffIntoFileChunks(diffText)
  const blocks = split.chunks.map((chunk, index) => {
    const parsedFilePath = filePathFromDiffLines(chunk)
    const row = findRowForFilePath(rows, parsedFilePath) ?? rows[index]
    const filePath = parsedFilePath ?? readFilePath(row)

    return createBlock({
      artifact,
      index,
      filePath,
      status: readFileStatus(row),
      summary: getArtifactSummary(artifact),
      lines: chunk,
      source: "artifact"
    })
  })

  if (split.truncatedLineCount > 0 && blocks.length > 0) {
    const lastBlock = blocks[blocks.length - 1]
    blocks[blocks.length - 1] = {
      ...lastBlock,
      truncatedLineCount: lastBlock.truncatedLineCount + split.truncatedLineCount
    }
  }

  return blocks
}

const blocksForSummary = (artifact: ArtifactSummary): InspectorDiffBlock[] => {
  const rows = fileRowsForArtifact(artifact)
  const artifactSummary = getArtifactSummary(artifact)
  const countSummary = countSummaryForArtifact(artifact)

  if (rows.length === 0) {
    return artifactSummary || countSummary.summaryKey
      ? [
          createBlock({
            artifact,
            index: 0,
            filePath: null,
            status: null,
            summary: artifactSummary,
            summaryKey: artifactSummary ? null : countSummary.summaryKey,
            summaryParams: artifactSummary ? null : countSummary.summaryParams,
            lines: [],
            source: "summary"
          })
        ]
      : []
  }

  return rows.map((row, index) =>
    {
      const rowDiffText = getRowDiffText(row)
      return createBlock({
        artifact,
        index,
        filePath: readFilePath(row),
        status: readFileStatus(row),
        summary: artifactSummary,
        summaryKey: artifactSummary ? null : countSummary.summaryKey,
        summaryParams: artifactSummary ? null : countSummary.summaryParams,
        lines: rowDiffText ? rowDiffText.split(/\r?\n/) : [],
        source: rowDiffText ? "artifact" : "summary"
      })
    }
  )
}

const artifactHasDiffSignal = (artifact: ArtifactSummary) =>
  Boolean(
    getArtifactDiffText(artifact) ||
    readPayloadString(artifact.payload.diffSummary) ||
    artifact.payload.files !== undefined ||
    artifact.payload.changedFiles !== undefined ||
    artifact.payload.fileCount !== undefined ||
    artifact.payload.additions !== undefined ||
    artifact.payload.deletions !== undefined ||
    artifact.payload.linesAdded !== undefined ||
    artifact.payload.linesRemoved !== undefined
  )

const artifactCanDescribeDiff = (artifact: ArtifactSummary) =>
  (artifact.kind === "diff" || artifact.kind === "changed-files") && artifactHasDiffSignal(artifact) ||
  artifact.kind === "summary" && artifactHasDiffSignal(artifact)

export const getInspectorDiffBlocks = (timeline: ConversationTimeline | null): InspectorDiffBlock[] => {
  if (!timeline) {
    return []
  }

  return timeline.artifacts
    .filter(artifactCanDescribeDiff)
    .flatMap((artifact) => {
      const diffText = getArtifactDiffText(artifact)
      return diffText ? blocksForFullDiff(artifact, diffText) : blocksForSummary(artifact)
    })
}

export const getReviewableDiffBlockForRun = (
  blocks: InspectorDiffBlock[],
  runId: string | null
) => {
  if (!runId) {
    return null
  }

  const rankBlock = (block: InspectorDiffBlock) => {
    if (block.artifactKind === "diff" && block.lines.length > 0) {
      return 0
    }

    if (block.artifactKind === "diff") {
      return 1
    }

    if (block.artifactKind === "changed-files") {
      return 2
    }

    return 3
  }

  return blocks
    .filter((block) => block.runId === runId)
    .sort((left, right) => rankBlock(left) - rankBlock(right))[0] ?? null
}
