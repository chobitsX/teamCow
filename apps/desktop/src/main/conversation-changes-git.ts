import type {
  ConversationChangeArea,
  ConversationChangeFile,
  ConversationChangesSnapshot,
  ConversationGitFileDisplayStatus,
  ConversationGitFileStatus
} from "@shared/index"

export type ChangeStats = {
  additions: number
  deletions: number
  isBinary: boolean
}

export type ParsedStatusFile = ConversationGitFileStatus & {
  oldPath: string | null
}

export type ParsedGitPorcelainStatusResult =
  | {
      status: "ok"
      files: ParsedStatusFile[]
    }
  | {
      status: "error"
      invalidRecord: string
    }

export const countConversationChangeTextLines = (content: Uint8Array) => {
  if (content.length === 0) {
    return 0
  }

  let newlineCount = 0
  for (const byte of content) {
    if (byte === 0x0a) {
      newlineCount += 1
    }
  }

  return content[content.length - 1] === 0x0a ? newlineCount : newlineCount + 1
}

const porcelainStatusCodes = new Set([" ", "M", "A", "D", "R", "C", "T", "U", "?", "!"])
const unmergedGitStatusPairs = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"])

const normalizeGitStatusCode = (code: string) => code === " " ? null : code

const displayStatusForGitCodes = (
  indexStatus: string | null,
  worktreeStatus: string | null
): ConversationGitFileDisplayStatus => {
  const codes = [indexStatus, worktreeStatus].filter((code): code is string => Boolean(code))
  const statusPair = `${indexStatus ?? " "}${worktreeStatus ?? " "}`

  if (unmergedGitStatusPairs.has(statusPair) || codes.includes("U")) {
    return "conflicted"
  }
  if (indexStatus === "?" && worktreeStatus === "?") {
    return "untracked"
  }
  if (codes.includes("R")) {
    return "renamed"
  }
  if (codes.includes("C")) {
    return "copied"
  }
  if (codes.includes("D")) {
    return "deleted"
  }
  if (codes.includes("A")) {
    return "added"
  }
  if (codes.includes("M")) {
    return "modified"
  }
  return "unknown"
}

export const parseGitPorcelainStatus = (raw: string): ParsedGitPorcelainStatusResult => {
  const files: ParsedStatusFile[] = []
  const isNulDelimited = raw.includes("\0")
  const records = isNulDelimited
    ? raw.split("\0")
    : raw.split("\n").map((row) => row.endsWith("\r") ? row.slice(0, -1) : row)

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? ""
    if (!record || record.startsWith("##")) {
      continue
    }

    if (
      record.length < 4 ||
      record[2] !== " " ||
      !porcelainStatusCodes.has(record[0] ?? "") ||
      !porcelainStatusCodes.has(record[1] ?? "")
    ) {
      return { status: "error", invalidRecord: record }
    }

    const indexStatus = normalizeGitStatusCode(record[0] ?? " ")
    const worktreeStatus = normalizeGitStatusCode(record[1] ?? " ")
    const rawPath = record.slice(3)
    const isRenameOrCopy = [indexStatus, worktreeStatus].some((code) => code === "R" || code === "C")
    let path = rawPath
    let oldPath: string | null = null

    if (isRenameOrCopy && isNulDelimited) {
      oldPath = records[index + 1] ?? ""
      index += 1
    } else if (isRenameOrCopy && rawPath.includes(" -> ")) {
      const pathParts = rawPath.split(" -> ")
      oldPath = pathParts.slice(0, -1).join(" -> ")
      path = pathParts.at(-1) ?? ""
    }

    if (!path || (isRenameOrCopy && !oldPath)) {
      return { status: "error", invalidRecord: record }
    }

    files.push({
      path,
      oldPath,
      indexStatus,
      worktreeStatus,
      displayStatus: displayStatusForGitCodes(indexStatus, worktreeStatus)
    })
  }

  return { status: "ok", files }
}

export const parseGitNumstat = (raw: string): Map<string, ChangeStats> => {
  const result = new Map<string, ChangeStats>()
  const entries = raw.split("\0")

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? ""
    if (!entry) {
      continue
    }

    const firstTab = entry.indexOf("\t")
    const secondTab = firstTab >= 0 ? entry.indexOf("\t", firstTab + 1) : -1
    if (firstTab < 0 || secondTab < 0) {
      continue
    }

    const rawAdditions = entry.slice(0, firstTab)
    const rawDeletions = entry.slice(firstTab + 1, secondTab)
    const inlinePath = entry.slice(secondTab + 1)
    const stats: ChangeStats = {
      additions: rawAdditions === "-" ? 0 : Number.parseInt(rawAdditions || "0", 10),
      deletions: rawDeletions === "-" ? 0 : Number.parseInt(rawDeletions || "0", 10),
      isBinary: rawAdditions === "-" && rawDeletions === "-"
    }

    if (inlinePath) {
      result.set(inlinePath, stats)
      continue
    }

    const oldPath = entries[index + 1] ?? ""
    const newPath = entries[index + 2] ?? ""
    index += 2
    if (oldPath) {
      result.set(oldPath, stats)
    }
    if (newPath) {
      result.set(newPath, stats)
    }
  }

  return result
}

const statusForCode = (
  file: ParsedStatusFile,
  code: string | null,
  area: ConversationChangeArea
): ConversationChangeFile["status"] => {
  if (file.displayStatus === "conflicted") {
    return "conflicted"
  }
  if (area === "unstaged" && file.indexStatus === "?" && file.worktreeStatus === "?") {
    return "untracked"
  }
  if (code === "A") {
    return "added"
  }
  if (code === "M") {
    return "modified"
  }
  if (code === "D") {
    return "deleted"
  }
  if (code === "R") {
    return "renamed"
  }
  if (code === "C") {
    return "copied"
  }
  return "unknown"
}

const toChangeFile = (
  file: ParsedStatusFile,
  area: ConversationChangeArea,
  stats: Map<string, ChangeStats>
): ConversationChangeFile => {
  const areaStatus = area === "staged" ? file.indexStatus : file.worktreeStatus
  return {
    path: file.path,
    oldPath: areaStatus === "R" || areaStatus === "C" ? file.oldPath : null,
    status: statusForCode(file, areaStatus, area),
    ...(file.displayStatus === "conflicted"
      ? { additions: 0, deletions: 0, isBinary: false }
      : stats.get(file.path) ?? { additions: 0, deletions: 0, isBinary: false })
  }
}

export const buildConversationChangeGroups = (input: {
  statusFiles: ParsedStatusFile[]
  stagedStats: Map<string, ChangeStats>
  unstagedStats: Map<string, ChangeStats>
}): Pick<ConversationChangesSnapshot, "staged" | "unstaged"> => ({
  staged: input.statusFiles
    .filter((file) => Boolean(file.indexStatus) && file.indexStatus !== "?" && file.indexStatus !== "!")
    .map((file) => toChangeFile(file, "staged", input.stagedStats)),
  unstaged: input.statusFiles
    .filter((file) => Boolean(file.worktreeStatus) && file.worktreeStatus !== "!")
    .map((file) => toChangeFile(file, "unstaged", input.unstagedStats))
})

export const truncateUnifiedPatch = (patch: string, maxBytes = 512 * 1024) => {
  const lines = patch.split(/\r?\n/)
  const visible: string[] = []
  let byteLength = 0

  for (const line of lines) {
    const nextLength = Buffer.byteLength(`${line}\n`, "utf8")
    if (byteLength + nextLength > maxBytes) {
      break
    }
    visible.push(line)
    byteLength += nextLength
  }

  return {
    patch: visible.join("\n"),
    truncatedLineCount: Math.max(0, lines.length - visible.length)
  }
}
