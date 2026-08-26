import { z } from "zod"

export type AppRuntimeMode = "development" | "production"

export const localeSchema = z.enum(["en", "zh"])
export type Locale = z.infer<typeof localeSchema>

export const appThemePreferenceSchema = z.enum(["dark", "light", "system"])
export type AppThemePreference = z.infer<typeof appThemePreferenceSchema>

export const providerKindSchema = z.enum(["codex", "claude", "opencode", "cursor"])
export type ProviderKind = z.infer<typeof providerKindSchema>

export const providerAccessModeSchema = z.enum(["read-only", "worktree-write", "full-access"])
export type ProviderAccessMode = z.infer<typeof providerAccessModeSchema>
export const DEFAULT_PROVIDER_ACCESS_MODE: ProviderAccessMode = "worktree-write"

export const providerRunModeSchema = z.enum(["plan", "ask", "agent"])
export type ProviderRunMode = z.infer<typeof providerRunModeSchema>

export const providerReasoningEffortSchema = z.enum(["low", "medium", "high", "xhigh", "max", "ultra"])
export type ProviderReasoningEffort = z.infer<typeof providerReasoningEffortSchema>

export const providerRunOptionsSchema = z.object({
  mode: providerRunModeSchema.optional(),
  reasoningEffort: providerReasoningEffortSchema.optional(),
  maxBudgetUsd: z.number().finite().positive().max(10_000).optional(),
  agent: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/).optional()
}).strict()
export type ProviderRunOptions = z.infer<typeof providerRunOptionsSchema>

export type SlashCommandScope = "teamcow" | "provider-run"
export type SlashCommandArgumentKind =
  | "none"
  | "access-mode"
  | "prompt"
  | "reasoning-and-prompt"
  | "effort-and-prompt"
  | "budget-and-prompt"
  | "agent-and-prompt"

export type SlashCommandDefinition = {
  name: string
  scope: SlashCommandScope
  provider?: ProviderKind
  argumentKind: SlashCommandArgumentKind
  availableWhileRunning: boolean
  descriptionKey: string
  argumentHintKey?: string
}

const TEAMCOW_SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    name: "help",
    scope: "teamcow",
    argumentKind: "none",
    availableWhileRunning: true,
    descriptionKey: "composer.slash.command.help"
  },
  {
    name: "access",
    scope: "teamcow",
    argumentKind: "access-mode",
    availableWhileRunning: false,
    descriptionKey: "composer.slash.command.access",
    argumentHintKey: "composer.slash.argument.access"
  },
  {
    name: "status",
    scope: "teamcow",
    argumentKind: "none",
    availableWhileRunning: true,
    descriptionKey: "composer.slash.command.status"
  },
  {
    name: "stop",
    scope: "teamcow",
    argumentKind: "none",
    availableWhileRunning: true,
    descriptionKey: "composer.slash.command.stop"
  }
]

const PROVIDER_SLASH_COMMANDS: Record<ProviderKind, SlashCommandDefinition[]> = {
  codex: [
    {
      name: "plan",
      scope: "provider-run",
      provider: "codex",
      argumentKind: "prompt",
      availableWhileRunning: true,
      descriptionKey: "composer.slash.command.codex.plan",
      argumentHintKey: "composer.slash.argument.prompt"
    },
    {
      name: "reasoning",
      scope: "provider-run",
      provider: "codex",
      argumentKind: "reasoning-and-prompt",
      availableWhileRunning: true,
      descriptionKey: "composer.slash.command.codex.reasoning",
      argumentHintKey: "composer.slash.argument.reasoning"
    }
  ],
  claude: [
    {
      name: "plan",
      scope: "provider-run",
      provider: "claude",
      argumentKind: "prompt",
      availableWhileRunning: true,
      descriptionKey: "composer.slash.command.claude.plan",
      argumentHintKey: "composer.slash.argument.prompt"
    },
    {
      name: "effort",
      scope: "provider-run",
      provider: "claude",
      argumentKind: "effort-and-prompt",
      availableWhileRunning: true,
      descriptionKey: "composer.slash.command.claude.effort",
      argumentHintKey: "composer.slash.argument.effort"
    },
    {
      name: "budget",
      scope: "provider-run",
      provider: "claude",
      argumentKind: "budget-and-prompt",
      availableWhileRunning: true,
      descriptionKey: "composer.slash.command.claude.budget",
      argumentHintKey: "composer.slash.argument.budget"
    },
    {
      name: "agent",
      scope: "provider-run",
      provider: "claude",
      argumentKind: "agent-and-prompt",
      availableWhileRunning: true,
      descriptionKey: "composer.slash.command.claude.agent",
      argumentHintKey: "composer.slash.argument.agent"
    }
  ],
  opencode: [
    {
      name: "agent",
      scope: "provider-run",
      provider: "opencode",
      argumentKind: "agent-and-prompt",
      availableWhileRunning: true,
      descriptionKey: "composer.slash.command.opencode.agent",
      argumentHintKey: "composer.slash.argument.agent"
    }
  ],
  cursor: [
    {
      name: "plan",
      scope: "provider-run",
      provider: "cursor",
      argumentKind: "prompt",
      availableWhileRunning: true,
      descriptionKey: "composer.slash.command.cursor.plan",
      argumentHintKey: "composer.slash.argument.prompt"
    },
    {
      name: "ask",
      scope: "provider-run",
      provider: "cursor",
      argumentKind: "prompt",
      availableWhileRunning: true,
      descriptionKey: "composer.slash.command.cursor.ask",
      argumentHintKey: "composer.slash.argument.prompt"
    }
  ]
}

export const getSlashCommandsForProvider = (provider: ProviderKind): SlashCommandDefinition[] => [
  ...TEAMCOW_SLASH_COMMANDS,
  ...PROVIDER_SLASH_COMMANDS[provider]
]

export type SlashInvocation = {
  name: string
  arguments: string
}

export const parseSlashInvocation = (content: string): SlashInvocation | null => {
  const match = content.trim().match(/^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/i)
  return match
    ? { name: match[1].toLowerCase(), arguments: (match[2] ?? "").trim() }
    : null
}

export type ProviderSlashCommandParseResult =
  | { status: "not-command" }
  | { status: "local"; invocation: SlashInvocation; command: SlashCommandDefinition }
  | {
      status: "error"
      invocation: SlashInvocation
      code: "unknown-command" | "unsupported-provider" | "missing-argument" | "invalid-argument"
      expected?: string
    }
  | {
      status: "run"
      invocation: SlashInvocation
      command: SlashCommandDefinition
      prompt: string
      options: ProviderRunOptions
    }

const splitSlashArgument = (value: string): { value: string; rest: string } | null => {
  const match = value.match(/^(\S+)(?:\s+([\s\S]*))?$/)
  return match ? { value: match[1], rest: (match[2] ?? "").trim() } : null
}

const ALL_PROVIDER_SLASH_COMMANDS = Object.values(PROVIDER_SLASH_COMMANDS).flat()

export const parseProviderSlashCommand = (
  provider: ProviderKind,
  content: string
): ProviderSlashCommandParseResult => {
  const invocation = parseSlashInvocation(content)
  if (!invocation) {
    return { status: "not-command" }
  }

  const localCommand = TEAMCOW_SLASH_COMMANDS.find((command) => command.name === invocation.name)
  if (localCommand) {
    return { status: "local", invocation, command: localCommand }
  }

  const command = PROVIDER_SLASH_COMMANDS[provider].find((candidate) => candidate.name === invocation.name)
  if (!command) {
    return {
      status: "error",
      invocation,
      code: ALL_PROVIDER_SLASH_COMMANDS.some((candidate) => candidate.name === invocation.name)
        ? "unsupported-provider"
        : "unknown-command"
    }
  }

  if (command.argumentKind === "prompt") {
    const mode = invocation.name === "ask" ? "ask" : "plan"
    return { status: "run", invocation, command, prompt: invocation.arguments, options: { mode } }
  }

  const argument = splitSlashArgument(invocation.arguments)
  if (!argument) {
    return { status: "error", invocation, code: "missing-argument", expected: command.argumentHintKey }
  }

  if (command.argumentKind === "reasoning-and-prompt") {
    const allowed = ["low", "medium", "high", "xhigh"] as const
    if (!allowed.includes(argument.value as typeof allowed[number])) {
      return { status: "error", invocation, code: "invalid-argument", expected: "low | medium | high | xhigh" }
    }
    return {
      status: "run",
      invocation,
      command,
      prompt: argument.rest,
      options: { reasoningEffort: argument.value as ProviderReasoningEffort }
    }
  }

  if (command.argumentKind === "effort-and-prompt") {
    const allowed = ["low", "medium", "high", "xhigh", "max"] as const
    if (!allowed.includes(argument.value as typeof allowed[number])) {
      return { status: "error", invocation, code: "invalid-argument", expected: "low | medium | high | xhigh | max" }
    }
    return {
      status: "run",
      invocation,
      command,
      prompt: argument.rest,
      options: { reasoningEffort: argument.value as ProviderReasoningEffort }
    }
  }

  if (command.argumentKind === "budget-and-prompt") {
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(argument.value)) {
      return { status: "error", invocation, code: "invalid-argument", expected: "0.01–10000" }
    }
    const budget = Number(argument.value)
    if (!Number.isFinite(budget) || budget <= 0 || budget > 10_000) {
      return { status: "error", invocation, code: "invalid-argument", expected: "0.01–10000" }
    }
    return {
      status: "run",
      invocation,
      command,
      prompt: argument.rest,
      options: providerRunOptionsSchema.parse({ maxBudgetUsd: budget })
    }
  }

  if (command.argumentKind === "agent-and-prompt") {
    const agentResult = providerRunOptionsSchema.shape.agent.safeParse(argument.value)
    if (!agentResult.success) {
      return { status: "error", invocation, code: "invalid-argument", expected: "agent-name" }
    }
    return {
      status: "run",
      invocation,
      command,
      prompt: argument.rest,
      options: { agent: agentResult.data }
    }
  }

  return { status: "error", invocation, code: "invalid-argument" }
}

export const providerModelSourceSchema = z.enum(["native-list", "config-derived", "fallback", "user-custom"])
export type ProviderModelSource = z.infer<typeof providerModelSourceSchema>

export const providerModelOptionSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  detail: z.string().trim().min(1),
  source: providerModelSourceSchema.optional(),
  cliModel: z.string().trim().min(1).optional(),
  isDefault: z.boolean().optional(),
  addedAt: z.string().datetime().optional()
})
export type ProviderModelOption = z.infer<typeof providerModelOptionSchema>

export const PROVIDER_MODEL_CATALOG: Record<ProviderKind, ProviderModelOption[]> = {
  claude: [
    {
      id: "default",
      label: "Auto",
      detail: "Follow the recommended Claude Code model for this account.",
      isDefault: true
    },
    {
      id: "claude-fable-5",
      label: "Fable 5",
      detail: "Claude Fable 5 for the hardest long-running tasks."
    },
    {
      id: "claude-opus-5",
      label: "Opus 5",
      detail: "Claude Opus 5 for complex agentic coding and reasoning."
    },
    {
      id: "claude-opus-4-8",
      label: "Opus 4.8",
      detail: "Claude Opus 4.8 for broad Claude Code compatibility."
    },
    {
      id: "claude-sonnet-5",
      label: "Sonnet 5",
      detail: "Claude Sonnet 5 for daily coding tasks."
    },
    {
      id: "claude-haiku-4-5",
      label: "Haiku 4.5",
      detail: "Claude Haiku 4.5 for simple fast tasks."
    }
  ],
  codex: [
    { id: "gpt-5.5", label: "GPT-5.5", detail: "Flagship model for complex coding and reasoning.", isDefault: true },
    { id: "gpt-5.4", label: "GPT-5.4", detail: "Strong reasoning for professional coding." },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", detail: "Fast lightweight model for iteration and subagents." },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", detail: "Specialized software engineering model." }
  ],
  opencode: [
    {
      id: "anthropic/claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      detail: "Anthropic everyday coding model.",
      isDefault: true
    },
    {
      id: "anthropic/claude-opus-4-7",
      label: "Claude Opus 4.7",
      detail: "Anthropic high-reasoning model."
    },
    { id: "openai/gpt-4.1", label: "GPT-4.1", detail: "OpenAI general coding model." },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", detail: "Google reasoning model." }
  ],
  cursor: [
    {
      id: "auto",
      label: "Auto",
      detail: "Follow the recommended Cursor model for this account.",
      isDefault: true
    },
    {
      id: "composer-2.5",
      label: "Composer 2.5",
      detail: "Cursor's coding model for agentic software development."
    }
  ]
}

export const isValidModelForProvider = (providerKind: ProviderKind, modelId: string): boolean =>
  PROVIDER_MODEL_CATALOG[providerKind]?.some((option) => option.id === modelId) ?? false

export const customModelEntrySchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  detail: z.string().trim().min(1).optional(),
  addedAt: z.string()
})
export type CustomModelEntry = z.infer<typeof customModelEntrySchema>

export const addCustomModelInputSchema = z.object({
  providerKind: providerKindSchema,
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(80).optional(),
  detail: z.string().trim().min(1).max(200).optional()
})
export type AddCustomModelInput = z.infer<typeof addCustomModelInputSchema>

export const removeCustomModelInputSchema = z.object({
  providerKind: providerKindSchema,
  id: z.string().trim().min(1)
})
export type RemoveCustomModelInput = z.infer<typeof removeCustomModelInputSchema>

export const readinessIssueKindSchema = z.enum([
  "binary-not-found",
  "version-check-failed",
  "version-unsupported",
  "capability-missing",
  "auth-missing",
  "network-unreachable",
  "config-invalid"
])
export type ReadinessIssueKind = z.infer<typeof readinessIssueKindSchema>

export const readinessIssueSchema = z.object({
  kind: readinessIssueKindSchema,
  params: z.record(z.string(), z.string()).optional()
})
export type ReadinessIssue = z.infer<typeof readinessIssueSchema>

export const conversationRunStatusSchema = z.enum([
  "idle",
  "running",
  "completed",
  "failed",
  "interrupted",
  "unavailable"
])
export type ConversationRunStatus = z.infer<typeof conversationRunStatusSchema>

export const updateStatusSchema = z.enum([
  "idle",
  "checking",
  "available",
  "not-available",
  "downloaded",
  "error",
  "disabled"
])
export type UpdateStatus = z.infer<typeof updateStatusSchema>

export const hostNotificationKindSchema = z.enum([
  "run-completed",
  "run-failed",
  "run-unavailable",
  "update-available",
  "update-downloaded",
  "provider-readiness-changed",
  "system-error"
])
export type HostNotificationKind = z.infer<typeof hostNotificationKindSchema>

export const hostNotificationContextSchema = z.object({
  projectName: z.string().trim().min(1),
  conversationTitle: z.string().trim().min(1),
  providerKind: providerKindSchema,
  worktreeLabel: z.string().trim().min(1),
  runStatus: conversationRunStatusSchema
})
export type HostNotificationContext = z.infer<typeof hostNotificationContextSchema>

export const hostNotificationPayloadSchema = z.object({
  kind: hostNotificationKindSchema,
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  context: hostNotificationContextSchema.optional(),
  params: z.record(z.string(), z.string()).optional()
}).superRefine((payload, context) => {
  if (
    (payload.kind === "run-completed" ||
      payload.kind === "run-failed" ||
      payload.kind === "run-unavailable") &&
    !payload.context
  ) {
    context.addIssue({
      code: "custom",
      path: ["context"],
      message: "run notifications require project, conversation, provider, worktree, and run status context"
    })
  }
})
export type HostNotificationPayload = z.infer<typeof hostNotificationPayloadSchema>

export const hostNotificationResultSchema = z.union([
  z.object({
    status: z.literal("shown")
  }),
  z.object({
    status: z.literal("unsupported")
  }),
  z.object({
    status: z.literal("error"),
    error: z.lazy(() => appErrorSchema)
  })
])
export type HostNotificationResult = z.infer<typeof hostNotificationResultSchema>

export const projectStatusSchema = z.enum(["ready", "importing", "unavailable"])
export type ProjectStatus = z.infer<typeof projectStatusSchema>

export const worktreeKindSchema = z.enum(["default", "git_worktree"])
export type WorktreeKind = z.infer<typeof worktreeKindSchema>

export const worktreeStatusSchema = z.enum(["ready", "unavailable"])
export type WorktreeStatus = z.infer<typeof worktreeStatusSchema>

export const providerAvailabilitySchema = z.enum(["ready", "unavailable", "unknown"])
export type ProviderAvailability = z.infer<typeof providerAvailabilitySchema>

export const appErrorCodeSchema = z.enum([
  "PATH_NOT_FOUND",
  "NOT_A_DIRECTORY",
  "PATH_NOT_READABLE",
  "DIALOG_CANCELLED",
  "GIT_NOT_INSTALLED",
  "GIT_INIT_FAILED",
  "GIT_STATUS_FAILED",
  "GIT_STATUS_PARSE_FAILED",
  "GIT_CHANGES_READ_FAILED",
  "GIT_CHANGE_OPERATION_FAILED",
  "GIT_COMMIT_EMPTY_INDEX",
  "GIT_COMMIT_IDENTITY_INVALID",
  "GIT_COMMIT_REJECTED",
  "GIT_COMMIT_FAILED",
  "DUPLICATE_PROJECT",
  "PROJECT_NOT_FOUND",
  "PROJECT_SELECTION_FAILED",
  "CONVERSATION_NOT_FOUND",
  "CONVERSATION_SELECTION_FAILED",
  "CONVERSATION_RENAME_FAILED",
  "CONVERSATION_DELETE_FAILED",
  "CONVERSATION_RUN_IN_PROGRESS",
  "PROVIDER_NOT_READY",
  "WORKTREE_NOT_FOUND",
  "WORKTREE_BRANCH_EXISTS",
  "WORKTREE_PATH_EXISTS",
  "WORKTREE_CREATE_FAILED",
  "WORKTREE_IN_USE",
  "WORKTREE_DELETE_FAILED",
  "HANDOFF_EDITOR_NOT_SELECTED",
  "HANDOFF_EDITOR_UNAVAILABLE",
  "HANDOFF_TARGET_NOT_FILE",
  "HANDOFF_OPEN_FAILED",
  "HANDOFF_PATH_OUTSIDE_WORKTREE",
  "EXTERNAL_OPEN_APP_UNAVAILABLE",
  "EXTERNAL_OPEN_FAILED",
  "FILE_PATH_OUTSIDE_WORKTREE",
  "FILE_NOT_READABLE",
  "FILE_NOT_WRITABLE",
  "FILE_BINARY",
  "FILE_TOO_LARGE",
  "FILE_SAVE_CONFLICT",
  "FILE_RUN_ACTIVE_READONLY",
  "FILE_READ_FAILED",
  "FILE_WRITE_FAILED",
  "TERMINAL_SHELL_UNAVAILABLE",
  "TERMINAL_START_FAILED",
  "TERMINAL_SESSION_NOT_FOUND",
  "TERMINAL_NATIVE_MODULE_FAILED",
  "NOTIFICATION_UNAVAILABLE",
  "NOTIFICATION_SEND_FAILED",
  "UPDATE_CHECK_FAILED",
  "UPDATE_INSTALL_FAILED",
  "CUSTOM_MODEL_DUPLICATE",
  "CUSTOM_MODEL_NOT_FOUND",
  "CUSTOM_MODEL_LIMIT_EXCEEDED",
  "INTERNAL_ERROR"
])
export type AppErrorCode = z.infer<typeof appErrorCodeSchema>

export const errorDomainSchema = z.enum([
  "app-startup",
  "conversation",
  "filesystem",
  "git",
  "handoff",
  "internal",
  "model",
  "notification",
  "project",
  "provider",
  "settings",
  "terminal",
  "update",
  "worktree"
])
export type ErrorDomain = z.infer<typeof errorDomainSchema>

export const errorContextSchema = z.object({
  projectId: z.string().min(1).optional(),
  projectName: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  conversationTitle: z.string().min(1).optional(),
  providerKind: providerKindSchema.optional(),
  accessMode: providerAccessModeSchema.optional(),
  worktreeId: z.string().min(1).optional(),
  worktreeRootPath: z.string().min(1).optional(),
  worktreeLabel: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  terminalSessionId: z.string().min(1).optional(),
  updateStatus: updateStatusSchema.optional(),
  command: z.string().min(1).optional(),
  errorCode: appErrorCodeSchema.optional(),
  errorMessage: z.string().min(1).optional(),
  appRuntimeMode: z.enum(["development", "production"]).optional()
})
export type ErrorContext = z.infer<typeof errorContextSchema>

export const appErrorSchema = z.object({
  code: appErrorCodeSchema,
  message: z.string(),
  suggestion: z.string().nullable().optional(),
  domain: errorDomainSchema.optional(),
  context: errorContextSchema.optional()
})
export type AppError = z.infer<typeof appErrorSchema>

export const diagnosticLogLevelSchema = z.enum(["debug", "info", "warn", "error"])
export type DiagnosticLogLevel = z.infer<typeof diagnosticLogLevelSchema>

export const diagnosticLogEntrySchema = z.object({
  timestamp: z.string().datetime(),
  level: diagnosticLogLevelSchema,
  domain: errorDomainSchema,
  event: z.string().min(1),
  context: errorContextSchema.optional()
})
export type DiagnosticLogEntry = z.infer<typeof diagnosticLogEntrySchema>

export const customModelMutationResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    models: z.array(providerModelOptionSchema)
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type CustomModelMutationResult = z.infer<typeof customModelMutationResultSchema>

export const conversationGitFileDisplayStatusSchema = z.enum([
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "untracked",
  "conflicted",
  "unknown"
])
export type ConversationGitFileDisplayStatus = z.infer<typeof conversationGitFileDisplayStatusSchema>

export const conversationGitFileStatusSchema = z.object({
  path: z.string().min(1),
  indexStatus: z.string().min(1).nullable(),
  worktreeStatus: z.string().min(1).nullable(),
  displayStatus: conversationGitFileDisplayStatusSchema
})
export type ConversationGitFileStatus = z.infer<typeof conversationGitFileStatusSchema>

export const worktreeSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: worktreeKindSchema,
  rootPath: z.string(),
  branch: z.string().nullable(),
  status: worktreeStatusSchema
})
export type WorktreeSummary = z.infer<typeof worktreeSummarySchema>

export const worktreeDeleteBlockedReasonSchema = z.enum(["default", "in-use"])
export type WorktreeDeleteBlockedReason = z.infer<typeof worktreeDeleteBlockedReasonSchema>

export const projectWorktreeSummarySchema = worktreeSummarySchema.extend({
  conversationCount: z.number().int().nonnegative(),
  canDelete: z.boolean(),
  deleteBlockedReason: worktreeDeleteBlockedReasonSchema.nullable()
}).superRefine((summary, context) => {
  if (summary.canDelete && summary.deleteBlockedReason !== null) {
    context.addIssue({
      code: "custom",
      path: ["deleteBlockedReason"],
      message: "deletable worktrees cannot have a delete blocked reason"
    })
  }

  if (!summary.canDelete && summary.deleteBlockedReason === null) {
    context.addIssue({
      code: "custom",
      path: ["deleteBlockedReason"],
      message: "blocked worktrees must include a delete blocked reason"
    })
  }
})
export type ProjectWorktreeSummary = z.infer<typeof projectWorktreeSummarySchema>

export const providerBadgeSchema = z.object({
  kind: z.string(),
  label: z.string(),
  status: providerAvailabilitySchema
})
export type ProviderBadge = z.infer<typeof providerBadgeSchema>

export const providerReadinessSchema = z.object({
  kind: providerKindSchema,
  availability: providerAvailabilitySchema,
  badge: providerBadgeSchema,
  version: z.string().optional(),
  issues: z.array(readinessIssueSchema)
})
export type ProviderReadiness = z.infer<typeof providerReadinessSchema>

export const providerReadinessSnapshotSchema = z.object({
  checkedAt: z.string(),
  providers: z.array(providerReadinessSchema)
})
export type ProviderReadinessSnapshot = z.infer<typeof providerReadinessSnapshotSchema>

export const conversationSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  worktreeId: z.string(),
  worktree: worktreeSummarySchema,
  provider: providerBadgeSchema,
  currentModel: z.string(),
  accessMode: providerAccessModeSchema.optional(),
  runStatus: conversationRunStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  isCurrent: z.boolean()
})
export type ConversationSummary = z.infer<typeof conversationSummarySchema>

export const importedProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  rootPath: z.string(),
  status: projectStatusSchema,
  defaultWorktree: worktreeSummarySchema,
  isCurrent: z.boolean(),
  conversations: z.array(conversationSummarySchema)
})
export type ImportedProjectSummary = z.infer<typeof importedProjectSummarySchema>

export const importProjectInputSchema = z.object({
  directoryPath: z.string().min(1).optional()
})
export type ImportProjectInput = z.infer<typeof importProjectInputSchema>

export const executionTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("default")
  }),
  z.object({
    type: z.literal("existing-worktree"),
    worktreeId: z.string().min(1)
  }),
  z.object({
    type: z.literal("new-worktree"),
    branch: z.string().min(1)
  })
])
export type ExecutionTarget = z.infer<typeof executionTargetSchema>

export const createConversationInputSchema = z.object({
  projectId: z.string().min(1),
  providerKind: providerKindSchema,
  model: z.string().min(1),
  accessMode: providerAccessModeSchema.optional(),
  executionTarget: executionTargetSchema
})
export type CreateConversationInput = z.infer<typeof createConversationInputSchema>

export const appContextChipSchema = z.object({
  kind: z.string(),
  value: z.string()
})
export type AppContextChip = z.infer<typeof appContextChipSchema>

export const shellStateSchema = z.object({
  projectName: z.string().nullable(),
  conversationTitle: z.string().nullable(),
  providerKind: z.string().nullable(),
  worktreeBranch: z.string().nullable(),
  worktreePath: z.string().nullable(),
  runStatus: conversationRunStatusSchema.nullable(),
  hasProjects: z.boolean(),
  hasConversations: z.boolean()
})
export type ShellState = z.infer<typeof shellStateSchema>

export const appContextSnapshotSchema = z.object({
  mode: z.enum(["development", "production"]),
  platform: z.string(),
  version: z.string(),
  selectedProjectId: z.string().nullable(),
  selectedConversationId: z.string().nullable(),
  projects: z.array(importedProjectSummarySchema),
  shell: shellStateSchema,
  chips: z.array(appContextChipSchema)
})
export type AppContextSnapshot = z.infer<typeof appContextSnapshotSchema>

export const importProjectResultSchema = z.union([
  z.object({
    status: z.literal("cancelled")
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  }),
  z.object({
    status: z.union([z.literal("imported"), z.literal("existing"), z.literal("restored")]),
    initializedGit: z.boolean(),
    project: importedProjectSummarySchema,
    context: appContextSnapshotSchema
  })
])
export type ImportProjectResult = z.infer<typeof importProjectResultSchema>

export const selectProjectResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    context: appContextSnapshotSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type SelectProjectResult = z.infer<typeof selectProjectResultSchema>

export const projectMovePositionSchema = z.enum(["top", "bottom"])
export type ProjectMovePosition = z.infer<typeof projectMovePositionSchema>

export const moveProjectInputSchema = z.object({
  projectId: z.string().min(1),
  position: projectMovePositionSchema
})
export type MoveProjectInput = z.infer<typeof moveProjectInputSchema>

export const projectMutationResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    context: appContextSnapshotSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type ProjectMutationResult = z.infer<typeof projectMutationResultSchema>

export const revealProjectInFinderResultSchema = z.union([
  z.object({
    status: z.literal("opened"),
    projectId: z.string(),
    targetPath: z.string()
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type RevealProjectInFinderResult = z.infer<typeof revealProjectInFinderResultSchema>

export const selectConversationResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    context: appContextSnapshotSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type SelectConversationResult = z.infer<typeof selectConversationResultSchema>

export const createConversationResultSchema = z.union([
  z.object({
    status: z.literal("created"),
    conversation: conversationSummarySchema,
    context: appContextSnapshotSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type CreateConversationResult = z.infer<typeof createConversationResultSchema>

export const setConversationModelInputSchema = z.object({
  conversationId: z.string().min(1),
  model: z.string().min(1)
})
export type SetConversationModelInput = z.infer<typeof setConversationModelInputSchema>

export const setConversationModelResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    conversation: conversationSummarySchema,
    context: appContextSnapshotSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type SetConversationModelResult = z.infer<typeof setConversationModelResultSchema>

export const setConversationAccessModeInputSchema = z.object({
  conversationId: z.string().min(1),
  accessMode: providerAccessModeSchema
})
export type SetConversationAccessModeInput = z.infer<typeof setConversationAccessModeInputSchema>

export const setConversationAccessModeResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    conversation: conversationSummarySchema,
    context: appContextSnapshotSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type SetConversationAccessModeResult = z.infer<typeof setConversationAccessModeResultSchema>

export const renameConversationInputSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().trim().min(1).max(200)
})
export type RenameConversationInput = z.infer<typeof renameConversationInputSchema>

export const renameConversationResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    conversation: conversationSummarySchema,
    context: appContextSnapshotSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type RenameConversationResult = z.infer<typeof renameConversationResultSchema>

export const deleteConversationInputSchema = z.object({
  conversationId: z.string().min(1)
})
export type DeleteConversationInput = z.infer<typeof deleteConversationInputSchema>

export const deleteConversationResultSchema = z.union([
  z.object({
    status: z.literal("deleted"),
    conversationId: z.string(),
    context: appContextSnapshotSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type DeleteConversationResult = z.infer<typeof deleteConversationResultSchema>


export const conversationMessageRoleSchema = z.enum(["user", "assistant", "system"])
export type ConversationMessageRole = z.infer<typeof conversationMessageRoleSchema>

export const MAX_CONVERSATION_ATTACHMENTS = 10
export const MAX_CONVERSATION_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const MAX_CONVERSATION_ATTACHMENTS_TOTAL_BYTES = 50 * 1024 * 1024
const MAX_CONVERSATION_ATTACHMENT_BASE64_LENGTH = Math.ceil(MAX_CONVERSATION_ATTACHMENT_BYTES / 3) * 4

export const conversationAttachmentKindSchema = z.enum(["image", "file"])
export type ConversationAttachmentKind = z.infer<typeof conversationAttachmentKindSchema>

export const conversationAttachmentInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(200),
  sizeBytes: z.number().int().nonnegative().max(MAX_CONVERSATION_ATTACHMENT_BYTES),
  dataBase64: z.string()
    .max(MAX_CONVERSATION_ATTACHMENT_BASE64_LENGTH)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
}).strict()
export type ConversationAttachmentInput = z.infer<typeof conversationAttachmentInputSchema>

export const conversationAttachmentSummarySchema = z.object({
  id: z.string(),
  kind: conversationAttachmentKindSchema,
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uri: z.string()
})
export type ConversationAttachmentSummary = z.infer<typeof conversationAttachmentSummarySchema>

export const conversationMessageSummarySchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: conversationMessageRoleSchema,
  content: z.string(),
  attachments: z.array(conversationAttachmentSummarySchema).optional(),
  model: z.string().nullable(),
  runId: z.string().nullable(),
  createdAt: z.string()
})
export type ConversationMessageSummary = z.infer<typeof conversationMessageSummarySchema>

export const queuedConversationMessageSummarySchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  content: z.string(),
  attachments: z.array(conversationAttachmentSummarySchema).optional(),
  createdAt: z.string()
})
export type QueuedConversationMessageSummary = z.infer<typeof queuedConversationMessageSummarySchema>

export const executionRunSummarySchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  provider: providerKindSchema,
  model: z.string(),
  worktreeId: z.string(),
  status: conversationRunStatusSchema,
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type ExecutionRunSummary = z.infer<typeof executionRunSummarySchema>

export const RUN_EVENT_SCHEMA_VERSION = 1 as const

export const canonicalRunEventTypeSchema = z.enum([
  "system.status",
  "run.status",
  "run.started",
  "run.progress",
  "run.message.delta",
  "run.message.completed",
  "run.reasoning.delta",
  "run.reasoning.raw.delta",
  "run.reasoning.completed",
  "run.tool.started",
  "run.tool.completed",
  "run.tool.failed",
  "run.approval.requested",
  "run.approval.resolved",
  "run.artifact.changed",
  "run.completed",
  "run.failed",
  "run.error",
  "run.interrupted",
  "provider.notice",
  "provider.raw"
])
export type CanonicalRunEventType = z.infer<typeof canonicalRunEventTypeSchema>

const canonicalRunEventPayloadSchema = z.object({
  provider: providerKindSchema.optional(),
  conversationId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  worktreeId: z.string().min(1).optional(),
  status: z.unknown().optional(),
  reason: z.unknown().optional(),
  rawType: z.string().optional(),
  providerEventId: z.string().min(1).optional()
}).catchall(z.unknown())

const canonicalMessagePayloadSchema = canonicalRunEventPayloadSchema.extend({
  messageId: z.string().min(1).nullable().optional(),
  text: z.string().optional(),
  delta: z.string().optional(),
  phase: z.string().optional(),
  authoritative: z.boolean().optional()
})

const canonicalStatusPayloadSchema = canonicalRunEventPayloadSchema.extend({
  status: conversationRunStatusSchema.optional(),
  reason: z.string().optional()
})

const canonicalToolPayloadSchema = canonicalRunEventPayloadSchema.extend({
  toolCallId: z.string().min(1).optional(),
  toolName: z.string().min(1).optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.unknown().optional()
})

const canonicalApprovalPayloadSchema = canonicalRunEventPayloadSchema.extend({
  requestId: z.string().min(1),
  decision: z.string().optional()
})

const canonicalRunEventVariant = <
  TType extends CanonicalRunEventType,
  TPayload extends z.ZodType
>(
  type: TType,
  payload: TPayload
) => z.object({
  type: z.literal(type),
  payload,
  status: conversationRunStatusSchema.optional()
})

export const canonicalRunEventSchema = z.discriminatedUnion("type", [
  canonicalRunEventVariant("system.status", canonicalStatusPayloadSchema),
  canonicalRunEventVariant("run.status", canonicalStatusPayloadSchema),
  canonicalRunEventVariant("run.started", canonicalRunEventPayloadSchema),
  canonicalRunEventVariant("run.progress", canonicalRunEventPayloadSchema),
  canonicalRunEventVariant("run.message.delta", canonicalMessagePayloadSchema),
  canonicalRunEventVariant("run.message.completed", canonicalMessagePayloadSchema),
  canonicalRunEventVariant("run.reasoning.delta", canonicalMessagePayloadSchema),
  canonicalRunEventVariant("run.reasoning.raw.delta", canonicalMessagePayloadSchema),
  canonicalRunEventVariant("run.reasoning.completed", canonicalMessagePayloadSchema),
  canonicalRunEventVariant("run.tool.started", canonicalToolPayloadSchema),
  canonicalRunEventVariant("run.tool.completed", canonicalToolPayloadSchema),
  canonicalRunEventVariant("run.tool.failed", canonicalToolPayloadSchema),
  canonicalRunEventVariant("run.approval.requested", canonicalApprovalPayloadSchema),
  canonicalRunEventVariant("run.approval.resolved", canonicalApprovalPayloadSchema),
  canonicalRunEventVariant("run.artifact.changed", canonicalRunEventPayloadSchema),
  canonicalRunEventVariant("run.completed", canonicalRunEventPayloadSchema),
  canonicalRunEventVariant("run.failed", canonicalRunEventPayloadSchema),
  canonicalRunEventVariant("run.error", canonicalRunEventPayloadSchema),
  canonicalRunEventVariant("run.interrupted", canonicalRunEventPayloadSchema),
  canonicalRunEventVariant("provider.notice", canonicalRunEventPayloadSchema),
  canonicalRunEventVariant("provider.raw", canonicalRunEventPayloadSchema)
])
export type CanonicalRunEvent = {
  type: CanonicalRunEventType
  payload: Record<string, unknown>
  status?: ConversationRunStatus
}

const persistedRunEventEnvelopeSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  runId: z.string(),
  sequence: z.number().int().nonnegative(),
  schemaVersion: z.literal(RUN_EVENT_SCHEMA_VERSION).optional(),
  provider: providerKindSchema.optional(),
  createdAt: z.string()
})

export const runEventSummarySchema = z.intersection(
  persistedRunEventEnvelopeSchema,
  canonicalRunEventSchema
)
export type RunEventSummary = z.infer<typeof runEventSummarySchema>

export const artifactSummarySchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  runId: z.string(),
  kind: z.string(),
  title: z.string().nullable(),
  uri: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string()
})
export type ArtifactSummary = z.infer<typeof artifactSummarySchema>

export const conversationTimelineSchema = z.object({
  conversationId: z.string(),
  messages: z.array(conversationMessageSummarySchema),
  queuedMessages: z.array(queuedConversationMessageSummarySchema).optional(),
  runs: z.array(executionRunSummarySchema),
  events: z.array(runEventSummarySchema),
  artifacts: z.array(artifactSummarySchema)
})
export type ConversationTimeline = z.infer<typeof conversationTimelineSchema>

export const sendConversationMessageInputSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().max(100_000),
  attachments: z.array(conversationAttachmentInputSchema).max(MAX_CONVERSATION_ATTACHMENTS).optional()
}).strict().superRefine((input, context) => {
  const attachments = input.attachments ?? []
  if (input.content.trim().length === 0 && attachments.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["content"],
      message: "a message requires text or at least one attachment"
    })
  }

  const totalBytes = attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0)
  if (totalBytes > MAX_CONVERSATION_ATTACHMENTS_TOTAL_BYTES) {
    context.addIssue({
      code: "too_big",
      origin: "array",
      maximum: MAX_CONVERSATION_ATTACHMENTS_TOTAL_BYTES,
      inclusive: true,
      path: ["attachments"],
      message: "attachment total exceeds the conversation message limit"
    })
  }
})
export type SendConversationMessageInput = z.input<typeof sendConversationMessageInputSchema>

export const sendConversationMessageResultSchema = z.union([
  z.object({
    status: z.literal("accepted"),
    conversation: conversationSummarySchema,
    timeline: conversationTimelineSchema,
    context: appContextSnapshotSchema
  }),
  z.object({
    status: z.literal("queued"),
    queuedMessage: queuedConversationMessageSummarySchema,
    timeline: conversationTimelineSchema,
    context: appContextSnapshotSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type SendConversationMessageResult = z.infer<typeof sendConversationMessageResultSchema>

export const deleteQueuedConversationMessageInputSchema = z.object({
  conversationId: z.string().min(1),
  queuedMessageId: z.string().min(1)
}).strict()
export type DeleteQueuedConversationMessageInput = z.infer<typeof deleteQueuedConversationMessageInputSchema>

export const deleteQueuedConversationMessageResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    timeline: conversationTimelineSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type DeleteQueuedConversationMessageResult = z.infer<typeof deleteQueuedConversationMessageResultSchema>

export const retryConversationRunWithPermissionsInputSchema = z.object({
  conversationId: z.string().min(1),
  runId: z.string().min(1),
  allowedTools: z.array(z.string().trim().min(1)).min(1)
})
export type RetryConversationRunWithPermissionsInput = z.infer<typeof retryConversationRunWithPermissionsInputSchema>

export const retryConversationRunWithPermissionsResultSchema = sendConversationMessageResultSchema
export type RetryConversationRunWithPermissionsResult = SendConversationMessageResult

export const cancelConversationRunInputSchema = z.object({
  conversationId: z.string().min(1)
})
export type CancelConversationRunInput = z.infer<typeof cancelConversationRunInputSchema>

export const cancelConversationRunResultSchema = z.object({
  status: z.enum(["ok", "not-running"])
})
export type CancelConversationRunResult = z.infer<typeof cancelConversationRunResultSchema>

export const getConversationTimelineResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    timeline: conversationTimelineSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type GetConversationTimelineResult = z.infer<typeof getConversationTimelineResultSchema>

export const getConversationTimelinePageInputSchema = z.object({
  conversationId: z.string().min(1),
  beforeRunId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).default(20)
})
export type GetConversationTimelinePageInput = z.infer<typeof getConversationTimelinePageInputSchema>

export const getConversationTimelinePageResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    timeline: conversationTimelineSchema,
    pageInfo: z.object({
      nextCursor: z.string().nullable(),
      hasMore: z.boolean()
    })
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type GetConversationTimelinePageResult = z.infer<typeof getConversationTimelinePageResultSchema>

export const deleteWorktreeInputSchema = z.object({
  projectId: z.string().min(1),
  worktreeId: z.string().min(1)
})
export type DeleteWorktreeInput = z.infer<typeof deleteWorktreeInputSchema>

export const deleteWorktreeResultSchema = z.union([
  z.object({
    status: z.literal("deleted"),
    projectId: z.string(),
    worktreeId: z.string()
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type DeleteWorktreeResult = z.infer<typeof deleteWorktreeResultSchema>

export const gitCommitScopeSchema = z.enum(["currentBranch", "allRepository"])
export type GitCommitScope = z.infer<typeof gitCommitScopeSchema>
export const DEFAULT_GIT_COMMIT_SCOPE = "currentBranch" satisfies GitCommitScope

export const getConversationGitStatusInputSchema = z.object({
  conversationId: z.string().min(1),
  commitScope: gitCommitScopeSchema.optional()
})
export type GetConversationGitStatusInput = z.infer<typeof getConversationGitStatusInputSchema>

export const conversationGitRemoteSchema = z.object({
  name: z.string().min(1),
  url: z.string(),
  isUpstreamDefault: z.boolean()
})
export type ConversationGitRemote = z.infer<typeof conversationGitRemoteSchema>

export const conversationGitRepositorySchema = z.object({
  remotes: z.array(conversationGitRemoteSchema),
  selectedRemoteName: z.string().nullable(),
  selectedRemoteUrl: z.string().nullable(),
  upstreamRemoteName: z.string().nullable(),
  upstreamBranchName: z.string().nullable()
})
export type ConversationGitRepository = z.infer<typeof conversationGitRepositorySchema>

export const conversationGitIdentitySchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  source: z.enum(["local", "global", "unset"])
})
export type ConversationGitIdentity = z.infer<typeof conversationGitIdentitySchema>

export const conversationGitBranchSchema = z.object({
  current: z.string().nullable(),
  recorded: z.string().nullable(),
  upstream: z.string().nullable(),
  isClean: z.boolean(),
  changedCount: z.number().int().nonnegative()
})
export type ConversationGitBranch = z.infer<typeof conversationGitBranchSchema>

export const conversationGitCommitSchema = z.object({
  hash: z.string().min(1),
  shortHash: z.string().min(1),
  subject: z.string(),
  authorName: z.string(),
  authoredAt: z.string(),
  relativeTime: z.string()
})
export type ConversationGitCommit = z.infer<typeof conversationGitCommitSchema>

export const conversationGitCommitsSchema = z.object({
  status: z.enum(["ok", "unavailable"]),
  scope: gitCommitScopeSchema,
  items: z.array(conversationGitCommitSchema),
  hasMore: z.boolean()
})
export type ConversationGitCommits = z.infer<typeof conversationGitCommitsSchema>

export const conversationGitStatusSchema = z.object({
  conversationId: z.string(),
  worktreeId: z.string(),
  worktreeRootPath: z.string(),
  worktreeKind: worktreeKindSchema,
  repository: conversationGitRepositorySchema,
  identity: conversationGitIdentitySchema,
  branch: conversationGitBranchSchema,
  commits: conversationGitCommitsSchema,
  checkedAt: z.string()
})
export type ConversationGitStatus = z.infer<typeof conversationGitStatusSchema>

export const getConversationGitStatusResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    git: conversationGitStatusSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type GetConversationGitStatusResult = z.infer<typeof getConversationGitStatusResultSchema>

export const conversationChangeAreaSchema = z.enum(["staged", "unstaged"])
export type ConversationChangeArea = z.infer<typeof conversationChangeAreaSchema>

export const conversationChangePathSchema = z.string()
  .min(1)
  .refine((value) => !value.startsWith("/") && !value.startsWith("\\"), "change path must be relative")
  .refine((value) => !/^[A-Za-z]:/.test(value), "change path must not be drive-prefixed")
  .refine((value) => !value.includes("\0"), "change path must not contain null bytes")
  .refine(
    (value) => value.split(/[\\/]/).every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
    "change path must stay inside the worktree"
  )
export type ConversationChangePath = z.infer<typeof conversationChangePathSchema>

export const conversationChangeFileStatusSchema = z.enum([
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "untracked",
  "conflicted",
  "unknown"
])
export type ConversationChangeFileStatus = z.infer<typeof conversationChangeFileStatusSchema>

export const conversationChangeFileStatsSchema = z.object({
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  isBinary: z.boolean()
}).strict()
export type ConversationChangeFileStats = z.infer<typeof conversationChangeFileStatsSchema>

export const conversationChangeFileSchema = conversationChangeFileStatsSchema.extend({
  path: conversationChangePathSchema,
  oldPath: conversationChangePathSchema.nullable(),
  status: conversationChangeFileStatusSchema
})
export type ConversationChangeFile = z.infer<typeof conversationChangeFileSchema>

export const conversationChangesSnapshotSchema = z.object({
  conversationId: z.string().min(1),
  worktreeId: z.string().min(1),
  worktreeRootPath: z.string().min(1),
  revision: z.string().min(1),
  staged: z.array(conversationChangeFileSchema),
  unstaged: z.array(conversationChangeFileSchema),
  checkedAt: z.string().datetime()
}).strict()
export type ConversationChangesSnapshot = z.infer<typeof conversationChangesSnapshotSchema>

export const conversationChangesSchema = conversationChangesSnapshotSchema
export type ConversationChanges = ConversationChangesSnapshot

export const getConversationChangesInputSchema = z.object({
  conversationId: z.string().min(1)
}).strict()
export type GetConversationChangesInput = z.infer<typeof getConversationChangesInputSchema>

export const getConversationChangesResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    changes: conversationChangesSnapshotSchema
  }).strict(),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  }).strict()
])
export type GetConversationChangesResult = z.infer<typeof getConversationChangesResultSchema>

export const getConversationChangeDiffInputSchema = z.object({
  conversationId: z.string().min(1),
  filePath: conversationChangePathSchema,
  area: conversationChangeAreaSchema
}).strict()
export type GetConversationChangeDiffInput = z.infer<typeof getConversationChangeDiffInputSchema>

const conversationChangeDiffSelectionShape = {
  conversationId: z.string().min(1),
  filePath: conversationChangePathSchema,
  area: conversationChangeAreaSchema
}

const conversationChangeDiffIdentityShape = {
  ...conversationChangeDiffSelectionShape,
  worktreeId: z.string().min(1)
}

export const conversationChangeTextDiffSchema = z.object({
  status: z.literal("text"),
  ...conversationChangeDiffIdentityShape,
  patch: z.string(),
  truncated: z.boolean(),
  originalByteLength: z.number().int().nonnegative(),
  returnedByteLength: z.number().int().nonnegative()
}).strict()
export type ConversationChangeTextDiff = z.infer<typeof conversationChangeTextDiffSchema>

export const conversationChangeBinaryDiffSchema = z.object({
  status: z.literal("binary"),
  ...conversationChangeDiffIdentityShape
}).strict()
export type ConversationChangeBinaryDiff = z.infer<typeof conversationChangeBinaryDiffSchema>

export const conversationChangeMissingDiffSchema = z.object({
  status: z.literal("missing"),
  ...conversationChangeDiffIdentityShape,
  reason: z.enum(["file-missing", "area-changed"])
}).strict()
export type ConversationChangeMissingDiff = z.infer<typeof conversationChangeMissingDiffSchema>

export const conversationChangeUnavailableDiffSchema = z.object({
  status: z.literal("unavailable"),
  ...conversationChangeDiffIdentityShape,
  reason: z.string().trim().min(1)
}).strict()
export type ConversationChangeUnavailableDiff = z.infer<typeof conversationChangeUnavailableDiffSchema>

export const conversationChangeDiffResultSchema = z.union([
  conversationChangeTextDiffSchema,
  conversationChangeBinaryDiffSchema,
  conversationChangeMissingDiffSchema,
  conversationChangeUnavailableDiffSchema,
  z.object({
    status: z.literal("error"),
    ...conversationChangeDiffSelectionShape,
    error: appErrorSchema
  }).strict()
])
export type ConversationChangeDiffResult = z.infer<typeof conversationChangeDiffResultSchema>

export const getConversationChangeDiffResultSchema = conversationChangeDiffResultSchema
export type GetConversationChangeDiffResult = ConversationChangeDiffResult

export const getConversationChangeDiffDocumentInputSchema = z.object({
  conversationId: z.string().min(1),
  worktreeId: z.string().min(1),
  revision: z.string().min(1),
  filePath: conversationChangePathSchema,
  area: conversationChangeAreaSchema
}).strict()
export type GetConversationChangeDiffDocumentInput = z.infer<typeof getConversationChangeDiffDocumentInputSchema>

const conversationChangeDiffDocumentIdentityShape = {
  conversationId: z.string().min(1),
  worktreeId: z.string().min(1),
  revision: z.string().min(1),
  filePath: conversationChangePathSchema,
  area: conversationChangeAreaSchema
}

const conversationChangeGitModeSchema = z.string().regex(/^[0-7]{6}$/).nullable()

export const conversationChangeDiffDocumentResultSchema = z.union([
  z.object({
    status: z.literal("text"),
    ...conversationChangeDiffDocumentIdentityShape,
    oldPath: conversationChangePathSchema.nullable(),
    original: z.string(),
    modified: z.string(),
    originalMode: conversationChangeGitModeSchema,
    modifiedMode: conversationChangeGitModeSchema,
    originalByteLength: z.number().int().nonnegative(),
    modifiedByteLength: z.number().int().nonnegative()
  }).strict(),
  z.object({
    status: z.literal("binary"),
    ...conversationChangeDiffDocumentIdentityShape,
    oldPath: conversationChangePathSchema.nullable()
  }).strict(),
  z.object({
    status: z.literal("too-large"),
    ...conversationChangeDiffDocumentIdentityShape,
    oldPath: conversationChangePathSchema.nullable(),
    side: z.enum(["original", "modified"]),
    byteLength: z.number().int().nonnegative(),
    limitBytes: z.number().int().positive()
  }).strict(),
  z.object({
    status: z.literal("conflicted"),
    ...conversationChangeDiffDocumentIdentityShape,
    oldPath: conversationChangePathSchema.nullable()
  }).strict(),
  z.object({
    status: z.literal("missing"),
    ...conversationChangeDiffDocumentIdentityShape,
    reason: z.enum(["file-missing", "area-changed"])
  }).strict(),
  z.object({
    status: z.literal("stale"),
    ...conversationChangeDiffDocumentIdentityShape,
    actualRevision: z.string().min(1)
  }).strict(),
  z.object({
    status: z.literal("unavailable"),
    ...conversationChangeDiffDocumentIdentityShape,
    reason: z.string().trim().min(1)
  }).strict(),
  z.object({
    status: z.literal("error"),
    ...conversationChangeDiffDocumentIdentityShape,
    error: appErrorSchema
  }).strict()
])
export type ConversationChangeDiffDocumentResult = z.infer<typeof conversationChangeDiffDocumentResultSchema>
export const getConversationChangeDiffDocumentResultSchema = conversationChangeDiffDocumentResultSchema
export type GetConversationChangeDiffDocumentResult = ConversationChangeDiffDocumentResult

export const conversationChangesMutationScopeSchema = z.union([
  z.object({
    type: z.literal("file"),
    filePath: conversationChangePathSchema
  }).strict(),
  z.object({
    type: z.literal("all")
  }).strict()
])
export type ConversationChangesMutationScope = z.infer<typeof conversationChangesMutationScopeSchema>

export const conversationChangesMutationInputSchema = z.object({
  conversationId: z.string().min(1),
  scope: conversationChangesMutationScopeSchema
}).strict()
export type ConversationChangesMutationInput = z.infer<typeof conversationChangesMutationInputSchema>

export const conversationChangesMutationFailureSchema = z.object({
  filePath: conversationChangePathSchema,
  error: appErrorSchema
}).strict()
export type ConversationChangesMutationFailure = z.infer<typeof conversationChangesMutationFailureSchema>

export const conversationChangesMutationResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    conversationId: z.string().min(1),
    worktreeId: z.string().min(1),
    scope: conversationChangesMutationScopeSchema,
    changedPaths: z.array(conversationChangePathSchema)
  }).strict(),
  z.object({
    status: z.literal("partial"),
    conversationId: z.string().min(1),
    worktreeId: z.string().min(1),
    scope: conversationChangesMutationScopeSchema,
    changedPaths: z.array(conversationChangePathSchema),
    failures: z.array(conversationChangesMutationFailureSchema).min(1)
  }).strict(),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  }).strict()
])
export type ConversationChangesMutationResult = z.infer<typeof conversationChangesMutationResultSchema>

export const stageConversationChangesInputSchema = conversationChangesMutationInputSchema
export type StageConversationChangesInput = ConversationChangesMutationInput
export const stageConversationChangesResultSchema = conversationChangesMutationResultSchema
export type StageConversationChangesResult = ConversationChangesMutationResult

export const unstageConversationChangesInputSchema = conversationChangesMutationInputSchema
export type UnstageConversationChangesInput = ConversationChangesMutationInput
export const unstageConversationChangesResultSchema = conversationChangesMutationResultSchema
export type UnstageConversationChangesResult = ConversationChangesMutationResult

export const discardConversationChangesInputSchema = conversationChangesMutationInputSchema.extend({
  expectedRevision: z.string().min(1)
})
export type DiscardConversationChangesInput = z.infer<typeof discardConversationChangesInputSchema>
export const discardConversationChangesResultSchema = conversationChangesMutationResultSchema
export type DiscardConversationChangesResult = ConversationChangesMutationResult

export const MAX_GIT_COMMIT_MESSAGE_LENGTH = 16 * 1024

export const commitConversationChangesInputSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().trim().min(1).max(MAX_GIT_COMMIT_MESSAGE_LENGTH)
}).strict()
export type CommitConversationChangesInput = z.infer<typeof commitConversationChangesInputSchema>

export const commitConversationChangesResultSchema = z.union([
  z.object({
    status: z.literal("committed"),
    conversationId: z.string().min(1),
    worktreeId: z.string().min(1),
    commitHash: z.string().min(1),
    shortCommitHash: z.string().min(1)
  }).strict(),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  }).strict()
])
export type CommitConversationChangesResult = z.infer<typeof commitConversationChangesResultSchema>

export const projectFileTreeItemSchema = z.object({
  path: z.string(),
  name: z.string(),
  kind: z.enum(["file", "directory"]),
  depth: z.number().int().nonnegative(),
  isSymlink: z.boolean()
})
export type ProjectFileTreeItem = z.infer<typeof projectFileTreeItemSchema>

const projectFilesDirectoryPathSchema = z.string()
  .trim()
  .min(1)
  .refine((value) => !value.startsWith("/"), "directory path must be relative")
  .refine((value) => !/^[A-Za-z]:[\\/]/.test(value), "directory path must be relative")
  .transform((value) => value.replace(/\\/g, "/"))
  .refine((value) => value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."), "directory path must stay inside the worktree")

export const conversationProjectFilesSchema = z.object({
  conversationId: z.string(),
  worktreeId: z.string(),
  worktreeRootPath: z.string(),
  directoryPath: z.string(),
  files: z.array(projectFileTreeItemSchema),
  fileCount: z.number().int().nonnegative(),
  directoryCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  checkedAt: z.string()
})
export type ConversationProjectFiles = z.infer<typeof conversationProjectFilesSchema>

export const projectWorktreeFilesSchema = z.object({
  projectId: z.string(),
  worktreeId: z.string(),
  worktreeRootPath: z.string(),
  directoryPath: z.string(),
  files: z.array(projectFileTreeItemSchema),
  fileCount: z.number().int().nonnegative(),
  directoryCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  checkedAt: z.string()
})
export type ProjectWorktreeFiles = z.infer<typeof projectWorktreeFilesSchema>

export const getConversationProjectFilesResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    projectFiles: conversationProjectFilesSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type GetConversationProjectFilesResult = z.infer<typeof getConversationProjectFilesResultSchema>

export const getProjectWorktreeFilesResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    projectFiles: projectWorktreeFilesSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type GetProjectWorktreeFilesResult = z.infer<typeof getProjectWorktreeFilesResultSchema>

const relativePathSegmentSchema = z.string()
  .min(1)
  .refine((value) => value !== "." && value !== "..", "path segments must stay inside the worktree")

export const conversationFilePathSchema = z.string()
  .trim()
  .min(1)
  .refine((value) => !value.startsWith("/"), "file path must be relative")
  .refine((value) => !/^[A-Za-z]:[\\/]/.test(value), "file path must be relative")
  .refine(
    (value) => value.split(/[\\/]+/).every((segment) => relativePathSegmentSchema.safeParse(segment).success),
    "file path must stay inside the worktree"
  )

export const CONVERSATION_FILE_AUTOMATIC_OPEN_MAX_BYTES = 2 * 1024 * 1024
export const CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES = 10 * 1024 * 1024

export const conversationFileReadInputSchema = z.object({
  conversationId: z.string().min(1),
  filePath: conversationFilePathSchema,
  maxBytes: z.number().int().positive().max(CONVERSATION_FILE_CONFIRMED_OPEN_MAX_BYTES).optional()
})
export type ConversationFileReadInput = z.infer<typeof conversationFileReadInputSchema>

export const conversationFileWriteInputSchema = z.object({
  conversationId: z.string().min(1),
  filePath: conversationFilePathSchema,
  content: z.string(),
  precondition: z.object({
    ifMatch: z.string().min(1)
  }).optional()
})
export type ConversationFileWriteInput = z.infer<typeof conversationFileWriteInputSchema>

export const conversationFileMetadataSchema = z.object({
  conversationId: z.string(),
  worktreeId: z.string(),
  filePath: conversationFilePathSchema,
  absolutePath: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  modifiedAt: z.string(),
  revision: z.string().min(1)
})
export type ConversationFileMetadata = z.infer<typeof conversationFileMetadataSchema>

export const conversationFileReadResultSchema = z.union([
  z.object({
    status: z.literal("text"),
    file: conversationFileMetadataSchema,
    content: z.string(),
    encoding: z.literal("utf-8")
  }),
  z.object({
    status: z.literal("binary"),
    file: conversationFileMetadataSchema
  }),
  z.object({
    status: z.literal("too-large"),
    file: conversationFileMetadataSchema,
    limitBytes: z.number().int().positive()
  }),
  z.object({
    status: z.literal("not-found"),
    conversationId: z.string(),
    filePath: conversationFilePathSchema
  }),
  z.object({
    status: z.literal("is-directory"),
    conversationId: z.string(),
    filePath: conversationFilePathSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type ConversationFileReadResult = z.infer<typeof conversationFileReadResultSchema>

export const conversationFileWriteResultSchema = z.union([
  z.object({
    status: z.literal("saved"),
    file: conversationFileMetadataSchema
  }),
  z.object({
    status: z.literal("conflict"),
    file: conversationFileMetadataSchema,
    currentContent: z.string().nullable()
  }),
  z.object({
    status: z.literal("not-found"),
    conversationId: z.string(),
    filePath: conversationFilePathSchema
  }),
  z.object({
    status: z.literal("readonly"),
    error: appErrorSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type ConversationFileWriteResult = z.infer<typeof conversationFileWriteResultSchema>

export const conversationFileEntryKindSchema = z.enum(["file", "directory"])
export type ConversationFileEntryKind = z.infer<typeof conversationFileEntryKindSchema>

export const conversationFileEntrySchema = z.object({
  conversationId: z.string(),
  worktreeId: z.string(),
  filePath: conversationFilePathSchema,
  absolutePath: z.string().min(1),
  kind: conversationFileEntryKindSchema
})
export type ConversationFileEntry = z.infer<typeof conversationFileEntrySchema>

export const createConversationFileEntryInputSchema = z.object({
  conversationId: z.string().min(1),
  filePath: conversationFilePathSchema,
  kind: conversationFileEntryKindSchema
})
export type CreateConversationFileEntryInput = z.infer<typeof createConversationFileEntryInputSchema>

export const renameConversationFileEntryInputSchema = z.object({
  conversationId: z.string().min(1),
  sourcePath: conversationFilePathSchema,
  destinationPath: conversationFilePathSchema,
  kind: conversationFileEntryKindSchema
})
export type RenameConversationFileEntryInput = z.infer<typeof renameConversationFileEntryInputSchema>

export const deleteConversationFileEntryInputSchema = z.object({
  conversationId: z.string().min(1),
  filePath: conversationFilePathSchema,
  kind: conversationFileEntryKindSchema
})
export type DeleteConversationFileEntryInput = z.infer<typeof deleteConversationFileEntryInputSchema>

export const revealConversationFileEntryInputSchema = z.object({
  conversationId: z.string().min(1),
  filePath: conversationFilePathSchema
})
export type RevealConversationFileEntryInput = z.infer<typeof revealConversationFileEntryInputSchema>

export const conversationFileEntryMutationResultSchema = z.union([
  z.object({
    status: z.literal("created"),
    entry: conversationFileEntrySchema
  }),
  z.object({
    status: z.literal("renamed"),
    entry: conversationFileEntrySchema
  }),
  z.object({
    status: z.literal("deleted"),
    conversationId: z.string(),
    worktreeId: z.string(),
    filePath: conversationFilePathSchema,
    kind: conversationFileEntryKindSchema
  }),
  z.object({
    status: z.literal("not-found"),
    conversationId: z.string(),
    filePath: conversationFilePathSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type ConversationFileEntryMutationResult = z.infer<typeof conversationFileEntryMutationResultSchema>

export const conversationFileEntryRevealResultSchema = z.union([
  z.object({
    status: z.literal("opened"),
    conversationId: z.string(),
    worktreeId: z.string(),
    filePath: conversationFilePathSchema,
    targetPath: z.string().min(1)
  }),
  z.object({
    status: z.literal("not-found"),
    conversationId: z.string(),
    filePath: conversationFilePathSchema
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type ConversationFileEntryRevealResult = z.infer<typeof conversationFileEntryRevealResultSchema>

export const editorOptionSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  appName: z.string().trim().min(1),
  bundleId: z.string().trim().min(1).optional(),
  isAvailable: z.boolean()
})
export type EditorOption = z.infer<typeof editorOptionSchema>

export const externalOpenAppIdSchema = z.enum([
  "finder",
  "terminal",
  "cmux",
  "iterm2",
  "ghostty",
  "warp",
  "cursor",
  "antigravity-ide",
  "vscode",
  "windsurf",
  "zed",
  "sublime-text",
  "webstorm",
  "intellij-idea"
])
export type ExternalOpenAppId = z.infer<typeof externalOpenAppIdSchema>

export const externalOpenOptionSchema = z.object({
  id: externalOpenAppIdSchema,
  label: z.string().trim().min(1),
  appName: z.string().trim().min(1),
  bundleId: z.string().trim().min(1).optional(),
  iconDataUrl: z.string().trim().startsWith("data:image/").optional(),
  group: z.enum(["system", "terminal", "ide"]),
  isAvailable: z.boolean()
})
export type ExternalOpenOption = z.infer<typeof externalOpenOptionSchema>

export const selectedEditorResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    selectedEditorId: z.string().nullable(),
    editors: z.array(editorOptionSchema)
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type SelectedEditorResult = z.infer<typeof selectedEditorResultSchema>

export const setSelectedEditorInputSchema = z.object({
  editorId: z.string().trim().min(1).nullable()
})
export type SetSelectedEditorInput = z.infer<typeof setSelectedEditorInputSchema>

export const openConversationHandoffInputSchema = z.discriminatedUnion("target", [
  z.object({
    conversationId: z.string().min(1),
    target: z.literal("worktree")
  }),
  z.object({
    conversationId: z.string().min(1),
    target: z.literal("file"),
    filePath: z.string().min(1)
  })
])
export type OpenConversationHandoffInput = z.infer<typeof openConversationHandoffInputSchema>

export const openConversationHandoffResultSchema = z.union([
  z.object({
    status: z.literal("opened"),
    conversationId: z.string(),
    worktreeId: z.string(),
    targetKind: z.enum(["worktree", "file"]),
    targetPath: z.string()
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type OpenConversationHandoffResult = z.infer<typeof openConversationHandoffResultSchema>

export const openConversationExternalInputSchema = z.object({
  conversationId: z.string().min(1),
  appId: externalOpenAppIdSchema
})
export type OpenConversationExternalInput = z.infer<typeof openConversationExternalInputSchema>

export const openConversationExternalResultSchema = z.union([
  z.object({
    status: z.literal("opened"),
    conversationId: z.string(),
    worktreeId: z.string(),
    appId: externalOpenAppIdSchema,
    appLabel: z.string(),
    targetPath: z.string()
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type OpenConversationExternalResult = z.infer<typeof openConversationExternalResultSchema>

export const terminalSessionStatusSchema = z.enum(["starting", "running", "exited", "failed", "closed"])
export type TerminalSessionStatus = z.infer<typeof terminalSessionStatusSchema>

export const openConversationTerminalInputSchema = z.object({
  conversationId: z.string().min(1)
}).strict()
export type OpenConversationTerminalInput = z.infer<typeof openConversationTerminalInputSchema>

export const terminalSessionSummarySchema = z.object({
  sessionId: z.string().min(1),
  conversationId: z.string().min(1),
  worktreeId: z.string().min(1),
  cwd: z.string().min(1),
  shell: z.string().min(1),
  status: terminalSessionStatusSchema,
  startedAt: z.string(),
  exitedAt: z.string().nullable().optional(),
  exitCode: z.number().int().nullable().optional()
})
export type TerminalSessionSummary = z.infer<typeof terminalSessionSummarySchema>

export const openConversationTerminalResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    session: terminalSessionSummarySchema,
    initialOutput: z.string().optional()
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type OpenConversationTerminalResult = z.infer<typeof openConversationTerminalResultSchema>

export const terminalWriteInputSchema = z.object({
  sessionId: z.string().min(1),
  data: z.string()
})
export type TerminalWriteInput = z.infer<typeof terminalWriteInputSchema>

export const terminalResizeInputSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().min(1),
  rows: z.number().int().min(1)
})
export type TerminalResizeInput = z.infer<typeof terminalResizeInputSchema>

export const terminalCloseInputSchema = z.object({
  sessionId: z.string().min(1)
})
export type TerminalCloseInput = z.infer<typeof terminalCloseInputSchema>

export const terminalActionResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    sessionId: z.string().min(1)
  }),
  z.object({
    status: z.literal("error"),
    error: appErrorSchema
  })
])
export type TerminalActionResult = z.infer<typeof terminalActionResultSchema>

export const terminalOutputEventSchema = z.object({
  sessionId: z.string().min(1),
  conversationId: z.string().min(1),
  data: z.string(),
  status: terminalSessionStatusSchema.optional(),
  exitCode: z.number().int().nullable().optional(),
  receivedAt: z.string()
})
export type TerminalOutputEvent = z.infer<typeof terminalOutputEventSchema>

export const runEventPushPayloadSchema = z.intersection(
  persistedRunEventEnvelopeSchema.extend({
    schemaVersion: z.literal(RUN_EVENT_SCHEMA_VERSION),
    provider: providerKindSchema
  }),
  canonicalRunEventSchema
)
export type RunEventPushPayload = z.infer<typeof runEventPushPayloadSchema>

export const MAX_WORKTREE_GIT_CHANGED_PATHS = 256

export const worktreeGitChangedEventSchema = z.object({
  worktreeId: z.string().min(1),
  paths: z.array(conversationChangePathSchema).min(1).max(MAX_WORKTREE_GIT_CHANGED_PATHS).optional()
}).strict()
export type WorktreeGitChangedEvent = z.infer<typeof worktreeGitChangedEventSchema>

export const updateStateSchema = z.object({
  status: updateStatusSchema,
  version: z.string().trim().min(1).optional(),
  checkedAt: z.string().optional(),
  downloadedAt: z.string().optional(),
  errorCode: appErrorCodeSchema.optional(),
  message: z.string().optional()
})
export type UpdateState = z.infer<typeof updateStateSchema>

export const updateActionResultSchema = z.union([
  z.object({
    status: z.literal("ok"),
    state: updateStateSchema
  }),
  z.object({
    status: z.literal("error"),
    state: updateStateSchema,
    error: appErrorSchema
  })
])
export type UpdateActionResult = z.infer<typeof updateActionResultSchema>

export const desktopCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("getAppContext") }),
  z.object({ type: z.literal("getCurrentConversation") }),
  z.object({ type: z.literal("getProviderReadiness") }),
  z.object({ type: z.literal("refreshProviderReadiness") }),
  z.object({
    type: z.literal("listProviderModels"),
    input: z.object({
      providerKind: providerKindSchema
    })
  }),
  z.object({ type: z.literal("listProjects") }),
  z.object({
    type: z.literal("listWorktreesByProject"),
    input: z.object({
      projectId: z.string().min(1)
    })
  }),
  z.object({
    type: z.literal("listProjectWorktrees"),
    input: z.object({
      projectId: z.string().min(1)
    })
  }),
  z.object({
    type: z.literal("listConversationsByProject"),
    input: z.object({
      projectId: z.string().min(1)
    })
  }),
  z.object({
    type: z.literal("importProject"),
    input: importProjectInputSchema.optional()
  }),
  z.object({
    type: z.literal("selectProject"),
    input: z.object({
      projectId: z.string().min(1)
    })
  }),
  z.object({
    type: z.literal("moveProject"),
    input: moveProjectInputSchema
  }),
  z.object({
    type: z.literal("removeProject"),
    input: z.object({
      projectId: z.string().min(1)
    })
  }),
  z.object({
    type: z.literal("revealProjectInFinder"),
    input: z.object({
      projectId: z.string().min(1)
    })
  }),
  z.object({
    type: z.literal("selectConversation"),
    input: z.object({
      conversationId: z.string().min(1)
    })
  }),
  z.object({
    type: z.literal("createConversation"),
    input: createConversationInputSchema
  }),
  z.object({
    type: z.literal("setConversationModel"),
    input: setConversationModelInputSchema
  }),
  z.object({
    type: z.literal("setConversationAccessMode"),
    input: setConversationAccessModeInputSchema
  }),
  z.object({
    type: z.literal("renameConversation"),
    input: renameConversationInputSchema
  }),
  z.object({
    type: z.literal("deleteConversation"),
    input: deleteConversationInputSchema
  }),
  z.object({
    type: z.literal("sendConversationMessage"),
    input: sendConversationMessageInputSchema
  }),
  z.object({
    type: z.literal("deleteQueuedConversationMessage"),
    input: deleteQueuedConversationMessageInputSchema
  }),
  z.object({
    type: z.literal("retryConversationRunWithPermissions"),
    input: retryConversationRunWithPermissionsInputSchema
  }),
  z.object({
    type: z.literal("getConversationTimeline"),
    input: z.object({
      conversationId: z.string().min(1)
    })
  }),
  z.object({
    type: z.literal("getConversationTimelinePage"),
    input: getConversationTimelinePageInputSchema
  }),
  z.object({
    type: z.literal("getConversationGitStatus"),
    input: getConversationGitStatusInputSchema
  }),
  z.object({
    type: z.literal("getConversationChanges"),
    input: getConversationChangesInputSchema
  }),
  z.object({
    type: z.literal("getConversationChangeDiff"),
    input: getConversationChangeDiffInputSchema
  }),
  z.object({
    type: z.literal("getConversationChangeDiffDocument"),
    input: getConversationChangeDiffDocumentInputSchema
  }),
  z.object({
    type: z.literal("stageConversationChanges"),
    input: stageConversationChangesInputSchema
  }),
  z.object({
    type: z.literal("unstageConversationChanges"),
    input: unstageConversationChangesInputSchema
  }),
  z.object({
    type: z.literal("discardConversationChanges"),
    input: discardConversationChangesInputSchema
  }),
  z.object({
    type: z.literal("commitConversationChanges"),
    input: commitConversationChangesInputSchema
  }),
  z.object({
    type: z.literal("getConversationProjectFiles"),
    input: z.object({
      conversationId: z.string().min(1),
      directoryPath: projectFilesDirectoryPathSchema.optional()
    })
  }),
  z.object({
    type: z.literal("getProjectWorktreeFiles"),
    input: z.object({
      projectId: z.string().min(1),
      worktreeId: z.string().min(1),
      directoryPath: projectFilesDirectoryPathSchema.optional()
    })
  }),
  z.object({
    type: z.literal("readConversationFile"),
    input: conversationFileReadInputSchema
  }),
  z.object({
    type: z.literal("writeConversationFile"),
    input: conversationFileWriteInputSchema
  }),
  z.object({
    type: z.literal("createConversationFileEntry"),
    input: createConversationFileEntryInputSchema
  }),
  z.object({
    type: z.literal("renameConversationFileEntry"),
    input: renameConversationFileEntryInputSchema
  }),
  z.object({
    type: z.literal("deleteConversationFileEntry"),
    input: deleteConversationFileEntryInputSchema
  }),
  z.object({
    type: z.literal("revealConversationFileEntry"),
    input: revealConversationFileEntryInputSchema
  }),
  z.object({
    type: z.literal("openConversationHandoff"),
    input: openConversationHandoffInputSchema
  }),
  z.object({ type: z.literal("listExternalOpenOptions") }),
  z.object({
    type: z.literal("openConversationExternal"),
    input: openConversationExternalInputSchema
  }),
  z.object({
    type: z.literal("openConversationTerminal"),
    input: openConversationTerminalInputSchema
  }),
  z.object({
    type: z.literal("writeTerminalInput"),
    input: terminalWriteInputSchema
  }),
  z.object({
    type: z.literal("resizeTerminal"),
    input: terminalResizeInputSchema
  }),
  z.object({
  type: z.literal("closeTerminal"),
  input: terminalCloseInputSchema
  }),
  z.object({ type: z.literal("listEditorOptions") }),
  z.object({ type: z.literal("getSelectedEditor") }),
  z.object({
    type: z.literal("setSelectedEditor"),
    input: setSelectedEditorInputSchema
  }),
  z.object({
    type: z.literal("deleteWorktree"),
    input: deleteWorktreeInputSchema
  }),
  z.object({ type: z.literal("getLocale") }),
  z.object({
    type: z.literal("setLocale"),
    input: z.object({
      locale: localeSchema
    })
  }),
  z.object({ type: z.literal("getAppTheme") }),
  z.object({
    type: z.literal("setAppTheme"),
    input: z.object({
      theme: appThemePreferenceSchema
    })
  }),
  z.object({
    type: z.literal("addCustomModel"),
    input: addCustomModelInputSchema
  }),
  z.object({
    type: z.literal("removeCustomModel"),
    input: removeCustomModelInputSchema
  }),
  z.object({
    type: z.literal("showHostNotification"),
    input: hostNotificationPayloadSchema
  }),
  z.object({ type: z.literal("getUpdateState") }),
  z.object({ type: z.literal("checkForUpdates") }),
  z.object({ type: z.literal("installUpdateAndRestart") }),
  z.object({ type: z.literal("cancelConversationRun"), input: cancelConversationRunInputSchema })
])
export type DesktopCommand = z.infer<typeof desktopCommandSchema>

export type TeamcowDesktopApi = {
  getAppContext: () => Promise<AppContextSnapshot>
  getCurrentConversation: () => Promise<ConversationSummary | null>
  getProviderReadiness: () => Promise<ProviderReadinessSnapshot>
  refreshProviderReadiness: () => Promise<ProviderReadinessSnapshot>
  listProviderModels: (providerKind: ProviderKind) => Promise<ProviderModelOption[]>
  listProjects: () => Promise<ImportedProjectSummary[]>
  listWorktreesByProject: (projectId: string) => Promise<WorktreeSummary[]>
  listProjectWorktrees: (projectId: string) => Promise<ProjectWorktreeSummary[]>
  listConversationsByProject: (projectId: string) => Promise<ConversationSummary[]>
  importProject: (input?: ImportProjectInput) => Promise<ImportProjectResult>
  selectProject: (projectId: string) => Promise<SelectProjectResult>
  moveProject: (input: MoveProjectInput) => Promise<ProjectMutationResult>
  removeProject: (projectId: string) => Promise<ProjectMutationResult>
  revealProjectInFinder: (projectId: string) => Promise<RevealProjectInFinderResult>
  selectConversation: (conversationId: string) => Promise<SelectConversationResult>
  createConversation: (input: CreateConversationInput) => Promise<CreateConversationResult>
  setConversationModel: (input: SetConversationModelInput) => Promise<SetConversationModelResult>
  setConversationAccessMode: (input: SetConversationAccessModeInput) => Promise<SetConversationAccessModeResult>
  renameConversation: (input: RenameConversationInput) => Promise<RenameConversationResult>
  deleteConversation: (input: DeleteConversationInput) => Promise<DeleteConversationResult>
  sendConversationMessage: (input: SendConversationMessageInput) => Promise<SendConversationMessageResult>
  deleteQueuedConversationMessage: (input: DeleteQueuedConversationMessageInput) => Promise<DeleteQueuedConversationMessageResult>
  retryConversationRunWithPermissions: (input: RetryConversationRunWithPermissionsInput) => Promise<RetryConversationRunWithPermissionsResult>
  cancelConversationRun: (input: CancelConversationRunInput) => Promise<CancelConversationRunResult>
  getConversationTimeline: (conversationId: string) => Promise<GetConversationTimelineResult>
  getConversationTimelinePage: (input: GetConversationTimelinePageInput) => Promise<GetConversationTimelinePageResult>
  getConversationGitStatus: (conversationId: string, commitScope?: GitCommitScope) => Promise<GetConversationGitStatusResult>
  getConversationChanges: (conversationId: string) => Promise<GetConversationChangesResult>
  getConversationChangeDiff: (input: GetConversationChangeDiffInput) => Promise<GetConversationChangeDiffResult>
  getConversationChangeDiffDocument: (input: GetConversationChangeDiffDocumentInput) => Promise<GetConversationChangeDiffDocumentResult>
  stageConversationChanges: (input: StageConversationChangesInput) => Promise<StageConversationChangesResult>
  unstageConversationChanges: (input: UnstageConversationChangesInput) => Promise<UnstageConversationChangesResult>
  discardConversationChanges: (input: DiscardConversationChangesInput) => Promise<DiscardConversationChangesResult>
  commitConversationChanges: (input: CommitConversationChangesInput) => Promise<CommitConversationChangesResult>
  getConversationProjectFiles: (conversationId: string, directoryPath?: string) => Promise<GetConversationProjectFilesResult>
  getProjectWorktreeFiles: (projectId: string, worktreeId: string, directoryPath?: string) => Promise<GetProjectWorktreeFilesResult>
  readConversationFile: (input: ConversationFileReadInput) => Promise<ConversationFileReadResult>
  writeConversationFile: (input: ConversationFileWriteInput) => Promise<ConversationFileWriteResult>
  createConversationFileEntry: (input: CreateConversationFileEntryInput) => Promise<ConversationFileEntryMutationResult>
  renameConversationFileEntry: (input: RenameConversationFileEntryInput) => Promise<ConversationFileEntryMutationResult>
  deleteConversationFileEntry: (input: DeleteConversationFileEntryInput) => Promise<ConversationFileEntryMutationResult>
  revealConversationFileEntry: (input: RevealConversationFileEntryInput) => Promise<ConversationFileEntryRevealResult>
  openConversationHandoff: (input: OpenConversationHandoffInput) => Promise<OpenConversationHandoffResult>
  listExternalOpenOptions: () => Promise<ExternalOpenOption[]>
  openConversationExternal: (input: OpenConversationExternalInput) => Promise<OpenConversationExternalResult>
  openConversationTerminal: (input: OpenConversationTerminalInput) => Promise<OpenConversationTerminalResult>
  writeTerminalInput: (input: TerminalWriteInput) => Promise<TerminalActionResult>
  resizeTerminal: (input: TerminalResizeInput) => Promise<TerminalActionResult>
  closeTerminal: (input: TerminalCloseInput) => Promise<TerminalActionResult>
  onTerminalOutput: (callback: (event: TerminalOutputEvent) => void) => () => void
  onRunEvent: (callback: (event: RunEventPushPayload) => void) => () => void
  onWorktreeGitChanged: (callback: (event: WorktreeGitChangedEvent) => void) => () => void
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
  listEditorOptions: () => Promise<EditorOption[]>
  getSelectedEditor: () => Promise<SelectedEditorResult>
  setSelectedEditor: (input: SetSelectedEditorInput) => Promise<SelectedEditorResult>
  deleteWorktree: (input: DeleteWorktreeInput) => Promise<DeleteWorktreeResult>
  getLocale: () => Promise<Locale>
  setLocale: (locale: Locale) => Promise<void>
  getAppTheme: () => Promise<AppThemePreference>
  setAppTheme: (theme: AppThemePreference) => Promise<void>
  addCustomModel: (input: AddCustomModelInput) => Promise<CustomModelMutationResult>
  removeCustomModel: (input: RemoveCustomModelInput) => Promise<CustomModelMutationResult>
  showHostNotification: (input: HostNotificationPayload) => Promise<HostNotificationResult>
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<UpdateActionResult>
  installUpdateAndRestart: () => Promise<UpdateActionResult>
}
