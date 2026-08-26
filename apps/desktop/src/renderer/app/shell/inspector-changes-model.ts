import type {
  ConversationChangeArea,
  ConversationChangeFile,
  ConversationChangesSnapshot
} from "@shared/index"

// This pure model only contains typed Git/renderer machine values; it never emits user-facing copy.
/* eslint-disable i18next/no-literal-string */

export type InspectorChangeSelection = {
  area: ConversationChangeArea
  filePath: string
}

export type InspectorChangePatchLineKind = "added" | "removed" | "context" | "hunk" | "meta"

export type InspectorChangePatchLine = {
  key: string
  kind: InspectorChangePatchLineKind
  content: string
}

export type InspectorChangeRow = ConversationChangeFile & {
  area: ConversationChangeArea
  key: string
  directory: string
  basename: string
  oldDirectory: string | null
  oldBasename: string | null
}

export type InspectorChangesViewModel = {
  unstaged: InspectorChangeRow[]
  staged: InspectorChangeRow[]
  summary: {
    rowCount: number
    additions: number
    deletions: number
  }
}

export const getChangeRowKey = (area: ConversationChangeArea, filePath: string) =>
  `${area}:${filePath}`

export const splitChangeDisplayPath = (filePath: string) => {
  const lastSlash = filePath.lastIndexOf("/")
  if (lastSlash < 0) {
    return { directory: "", basename: filePath }
  }

  return {
    directory: filePath.slice(0, lastSlash + 1),
    basename: filePath.slice(lastSlash + 1)
  }
}

const toRow = (area: ConversationChangeArea, file: ConversationChangeFile): InspectorChangeRow => {
  const displayPath = splitChangeDisplayPath(file.path)
  const oldDisplayPath = file.oldPath === null ? null : splitChangeDisplayPath(file.oldPath)

  return {
    ...file,
    area,
    key: getChangeRowKey(area, file.path),
    ...displayPath,
    oldDirectory: oldDisplayPath?.directory ?? null,
    oldBasename: oldDisplayPath?.basename ?? null
  }
}

export const getChangesViewModel = (
  snapshot: ConversationChangesSnapshot
): InspectorChangesViewModel => {
  const unstaged = snapshot.unstaged.map((file) => toRow("unstaged", file))
  const staged = snapshot.staged.map((file) => toRow("staged", file))
  const rows = [...unstaged, ...staged]

  return {
    unstaged,
    staged,
    summary: {
      rowCount: rows.length,
      additions: rows.reduce((total, row) => total + row.additions, 0),
      deletions: rows.reduce((total, row) => total + row.deletions, 0)
    }
  }
}

const isPatchMetadata = (line: string) =>
  /^(?:---|\+\+\+)(?:[\t ]|$)/.test(line) ||
  /^(?:diff --git |index |new file mode |deleted file mode |old mode |new mode |similarity index |dissimilarity index |rename from |rename to |copy from |copy to |Binary files |GIT binary patch$|literal \d+$|delta \d+$|\\ No newline at end of file$)/.test(
    line
  )

const classifyPatchLine = (line: string): InspectorChangePatchLineKind => {
  if (line.startsWith("@@")) {
    return "hunk"
  }
  if (isPatchMetadata(line)) {
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

export const parseConversationChangePatch = (patch: string): InspectorChangePatchLine[] => {
  if (patch.length === 0) {
    return []
  }

  return patch.split("\n").map((content, index) => ({
    key: `${index}:${content}`,
    kind: classifyPatchLine(content),
    content
  }))
}
