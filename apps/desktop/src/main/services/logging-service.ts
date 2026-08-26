import {
  diagnosticLogEntrySchema,
  type DiagnosticLogEntry,
  type DiagnosticLogLevel,
  type ErrorContext,
  type ErrorDomain
} from "@shared/index"

type LoggingSink = (entry: DiagnosticLogEntry) => void

type LoggingServiceOptions = {
  now?: () => string
  maxEntries?: number
  maxStringLength?: number
  sinks?: LoggingSink[]
}

type LogFilter = {
  domain?: ErrorDomain
}

export type LoggingService = ReturnType<typeof createLoggingService>

const DEFAULT_MAX_ENTRIES = 500
const DEFAULT_MAX_STRING_LENGTH = 500

const allowedContextKeys = new Set<keyof ErrorContext>([
  "projectId",
  "projectName",
  "conversationId",
  "conversationTitle",
  "providerKind",
  "accessMode",
  "worktreeId",
  "worktreeRootPath",
  "worktreeLabel",
  "runId",
  "terminalSessionId",
  "updateStatus",
  "command",
  "errorCode",
  "errorMessage",
  "appRuntimeMode"
])

const sensitiveKeyPattern = /(raw|env|headers|token|key|authorization|stdout|stderr|prompt|diff|filecontent|config|auth)/i

const redactSensitiveText = (value: string) => value
  .replace(/\btoken\s+sk-[A-Za-z0-9_-]+/gi, "[redacted]")
  .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, "[redacted]")
  .replace(/\b(authorization|api[_-]?key|secret|password)\b\s*[:=]?\s*\S+/gi, "[redacted]")
  .replace(/\b(prompt|stdout|stderr|diff|filecontent|raw)\b\s*:?\s*Please inspect private project context/gi, "[redacted]: [redacted]")

const truncateString = (value: string, maxStringLength: number) => {
  const redacted = redactSensitiveText(value)
  return redacted.length > maxStringLength ? `${redacted.slice(0, maxStringLength)}...` : redacted
}

const sanitizeContext = (
  context: Record<string, unknown> | undefined,
  maxStringLength: number
): ErrorContext | undefined => {
  if (!context) {
    return undefined
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    if (!allowedContextKeys.has(key as keyof ErrorContext) || sensitiveKeyPattern.test(key)) {
      continue
    }

    if (value === null || value === undefined) {
      continue
    }

    if (typeof value === "string") {
      sanitized[key] = truncateString(value, maxStringLength)
      continue
    }

    if (typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = String(value)
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return undefined
  }

  const parsed = diagnosticLogEntrySchema.shape.context.safeParse(sanitized)
  return parsed.success ? parsed.data : undefined
}

export const createLoggingService = ({
  now = () => new Date().toISOString(),
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxStringLength = DEFAULT_MAX_STRING_LENGTH,
  sinks = []
}: LoggingServiceOptions = {}) => {
  const entries: DiagnosticLogEntry[] = []

  const write = (level: DiagnosticLogLevel, domain: ErrorDomain, event: string, context?: Record<string, unknown>) => {
    const entry = diagnosticLogEntrySchema.parse({
      timestamp: now(),
      level,
      domain,
      event,
      context: sanitizeContext(context, maxStringLength)
    })

    entries.push(entry)
    if (entries.length > maxEntries) {
      entries.splice(0, entries.length - maxEntries)
    }

    for (const sink of sinks) {
      try {
        sink(entry)
      } catch {
        // Remote sinks must never break local diagnostic logging.
      }
    }

    return entry
  }

  const getEntries = (filter: LogFilter = {}) =>
    entries.filter((entry) => !filter.domain || entry.domain === filter.domain)

  return {
    debug: (domain: ErrorDomain, event: string, context?: Record<string, unknown>) =>
      write("debug", domain, event, context),
    info: (domain: ErrorDomain, event: string, context?: Record<string, unknown>) =>
      write("info", domain, event, context),
    warn: (domain: ErrorDomain, event: string, context?: Record<string, unknown>) =>
      write("warn", domain, event, context),
    error: (domain: ErrorDomain, event: string, context?: Record<string, unknown>) =>
      write("error", domain, event, context),
    getEntries
  }
}
