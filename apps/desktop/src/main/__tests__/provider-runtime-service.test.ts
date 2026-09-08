// @vitest-environment node
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdtempSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { createProviderRuntimeService, parseCursorModelList } from "../services/provider-runtime-service"
import type { CursorAcpRunInput } from "../services/cursor-acp-client"

const createTempDir = (prefix: string) => mkdtempSync(join(tmpdir(), prefix))

// Match each shell fixture to an explicitly selected shell, independent of the CI runner.
const fixtureShell = process.platform === "darwin" ? "/bin/zsh" : "/bin/bash"
const fixtureShellProfile = process.platform === "darwin" ? ".zshrc" : ".bash_profile"

const writeFakeCodexAppServer = (
  commandPath: string,
  options: { startDelayMs?: number; completionDelayMs?: number } = {}
) => {
  writeFileSync(
    commandPath,
    [
      "#!/usr/bin/env node",
      "const readline = require('node:readline')",
      `const startDelayMs = ${options.startDelayMs ?? 0}`,
      `const completionDelayMs = ${options.completionDelayMs ?? 0}`,
      "const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n')",
      "const rl = readline.createInterface({ input: process.stdin })",
      "rl.on('line', (line) => {",
      "  const message = JSON.parse(line)",
      "  if (message.method === 'initialize') send({ id: message.id, result: {} })",
      "  if (message.method === 'thread/start') {",
      "    send({ id: message.id, result: { thread: { id: 'thread-fixture' } } })",
      "    setTimeout(() => send({ method: 'thread/started', params: { thread: { id: 'thread-fixture' } } }), startDelayMs)",
      "  }",
      "  if (message.method === 'turn/start') {",
      "    send({ id: message.id, result: { turn: { id: 'turn-fixture', status: 'inProgress' } } })",
      "    setTimeout(() => send({ method: 'turn/completed', params: { threadId: 'thread-fixture', turn: { id: 'turn-fixture', status: 'completed' } } }), completionDelayMs)",
      "  }",
      "})"
    ].join("\n")
  )
  chmodSync(commandPath, 0o755)
}

describe("createProviderRuntimeService", () => {
  it("maps typed slash run options to each provider transport", async () => {
    const codexCalls: unknown[] = []
    const openCodeCalls: unknown[] = []
    const cursorCalls: CursorAcpRunInput[] = []
    const claudeCalls: string[][] = []
    const service = createProviderRuntimeService({
      providers: [
        { kind: "codex", command: "codex", minimumVersion: "1.0.0" },
        { kind: "claude", command: "claude", minimumVersion: "1.0.0" },
        { kind: "opencode", command: "opencode", minimumVersion: "1.0.0" },
        { kind: "cursor", command: "cursor-agent", minimumVersion: "1.0.0" }
      ],
      runCodexAppServer: async (input) => {
        codexCalls.push(input)
        return { threadId: "thread-slash", turnId: "turn-slash", status: "completed", stderr: "" }
      },
      runOpenCodeServer: async (input) => {
        openCodeCalls.push(input)
        return { sessionId: "session-opencode-slash", status: "completed", stderr: "" }
      },
      runCursorAcp: async (input) => {
        cursorCalls.push(input)
        return { sessionId: "session-cursor-slash", status: "completed", stopReason: "end_turn", stderr: "" }
      },
      runCommand: (command, args) => {
        expect(command).toBe("claude")
        claudeCalls.push(args)
        return {
          stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done" }),
          stderr: "",
          status: 0
        }
      }
    })

    await service.runProvider({
      provider: "codex",
      model: "gpt-5.5",
      prompt: "Create a plan",
      options: { mode: "plan", reasoningEffort: "high" },
      worktreeRootPath: "/tmp/teamcow-slash",
      worktreeId: "worktree-codex-slash",
      conversationId: "conversation-codex-slash",
      runId: "run-codex-slash"
    })
    await service.runProvider({
      provider: "claude",
      model: "default",
      prompt: "Audit the project",
      options: { mode: "plan", reasoningEffort: "high", maxBudgetUsd: 3.5, agent: "reviewer" },
      worktreeRootPath: "/tmp/teamcow-slash",
      worktreeId: "worktree-claude-slash",
      conversationId: "conversation-claude-slash",
      runId: "run-claude-slash"
    })
    await service.runProvider({
      provider: "opencode",
      model: "anthropic/claude-sonnet-4-6",
      prompt: "Review the diff",
      options: { agent: "reviewer" },
      worktreeRootPath: "/tmp/teamcow-slash",
      worktreeId: "worktree-opencode-slash",
      conversationId: "conversation-opencode-slash",
      runId: "run-opencode-slash"
    })
    await service.runProvider({
      provider: "cursor",
      model: "auto",
      prompt: "Explain the module",
      options: { mode: "ask" },
      worktreeRootPath: "/tmp/teamcow-slash",
      worktreeId: "worktree-cursor-slash",
      conversationId: "conversation-cursor-slash",
      runId: "run-cursor-slash"
    })

    expect(codexCalls[0]).toMatchObject({
      prompt: "Create a plan",
      options: { mode: "plan", reasoningEffort: "high" }
    })
    expect(claudeCalls[0]).toEqual([
      "--print",
      "--verbose",
      "--permission-mode",
      "plan",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--effort",
      "high",
      "--max-budget-usd",
      "3.5",
      "--agent",
      "reviewer",
      "--model",
      "default",
      "--",
      "Audit the project"
    ])
    expect(openCodeCalls[0]).toMatchObject({ prompt: "Review the diff", agent: "reviewer" })
    expect(cursorCalls[0]).toMatchObject({ prompt: "Explain the module", mode: "ask" })
  })

  it("starts provider commands without blocking the event loop", async () => {
    const tempDir = createTempDir("teamcow-provider-nonblocking-")
    const commandPath = join(tempDir, "fake-codex")

    try {
      writeFakeCodexAppServer(commandPath, { startDelayMs: 200 })

      const service = createProviderRuntimeService({
        providers: [
          {
            kind: "codex",
            command: commandPath,
            minimumVersion: "0.0.0"
          }
        ]
      })

      const startedAt = Date.now()
      const resultPromise = service.runProvider({
        provider: "codex",
        model: "gpt-5.1",
        prompt: "Run without blocking",
        worktreeRootPath: tempDir,
        worktreeId: "worktree-nonblocking",
        conversationId: "conversation-nonblocking",
        runId: "run-nonblocking"
      })
      const elapsedBeforePromiseReturned = Date.now() - startedAt

      expect(elapsedBeforePromiseReturned).toBeLessThan(100)
      const result = await resultPromise
      expect(result.status).toBe("completed")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("streams default provider output to the event sink before the command exits", async () => {
    const tempDir = createTempDir("teamcow-provider-streaming-")
    const commandPath = join(tempDir, "fake-codex")

    try {
      writeFakeCodexAppServer(commandPath, { completionDelayMs: 600 })

      const service = createProviderRuntimeService({
        providers: [
          {
            kind: "codex",
            command: commandPath,
            minimumVersion: "0.0.0"
          }
        ]
      })
      const streamedEvents: Array<{ type: string; status?: string }> = []
      let firstStreamedAt: number | null = null
      let resolveFirstEvent!: (event: { type: string; status?: string }) => void
      const firstEventPromise = new Promise<{ type: string; status?: string }>((resolve) => {
        resolveFirstEvent = resolve
      })
      const resultPromise = service.runProvider({
        provider: "codex",
        model: "gpt-5.1",
        prompt: "Stream before exit",
        worktreeRootPath: tempDir,
        worktreeId: "worktree-streaming",
        conversationId: "conversation-streaming",
        runId: "run-streaming",
        onEvent: (event) => {
          const streamedEvent = { type: event.type, status: event.status }
          if (firstStreamedAt === null) {
            firstStreamedAt = Date.now()
            resolveFirstEvent(streamedEvent)
          }
          streamedEvents.push(streamedEvent)
        }
      })

      const firstOutcome = await Promise.race([
        firstEventPromise.then((event) => ({ kind: "event" as const, event })),
        resultPromise.then((result) => ({ kind: "result" as const, result }))
      ])
      expect(firstOutcome.kind).toBe("event")
      expect(firstOutcome.kind === "event" ? firstOutcome.event : undefined)
        .toEqual({ type: "run.started", status: "running" })
      expect(firstStreamedAt).not.toBeNull()
      const result = await resultPromise
      const completedAt = Date.now()
      expect(result.status).toBe("completed")
      expect(completedAt - (firstStreamedAt ?? completedAt)).toBeGreaterThan(200)
      expect(streamedEvents.map((event) => event.type)).toEqual(["run.started", "run.completed"])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("does not synchronously block provider runs while resolving bare commands from the login shell", async () => {
    const homeDir = createTempDir("teamcow-provider-shell-nonblocking-home-")
    const shellOnlyBin = join(homeDir, "shell-only-bin")
    mkdirSync(shellOnlyBin, { recursive: true })
    symlinkSync(process.execPath, join(shellOnlyBin, "node"))
    writeFileSync(join(homeDir, fixtureShellProfile), `sleep 0.3\nexport PATH="${shellOnlyBin}:$PATH"\n`)
    const commandPath = join(shellOnlyBin, "fake-codex")

    try {
      writeFakeCodexAppServer(commandPath)

      const service = createProviderRuntimeService({
        env: { PATH: "/usr/bin:/bin", SHELL: fixtureShell },
        homeDir,
        providers: [
          {
            kind: "codex",
            command: "fake-codex",
            minimumVersion: "0.0.0"
          }
        ]
      })

      const startedAt = Date.now()
      const resultPromise = service.runProvider({
        provider: "codex",
        model: "gpt-5.1",
        prompt: "Resolve command without blocking",
        worktreeRootPath: homeDir,
        worktreeId: "worktree-shell",
        conversationId: "conversation-shell",
        runId: "run-shell"
      })

      expect(Date.now() - startedAt).toBeLessThan(100)
      const result = await resultPromise
      expect(result.status).toBe("completed")
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("runs OpenCode in the bound worktree and normalizes json output", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "opencode",
          command: "opencode",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: (command: string, args: string[], options?: { cwd?: string; onChild?: (child: import("node:child_process").ChildProcess) => void }) => {
        expect(command).toBe("opencode")
        expect(args).toEqual([
          "run",
          "--format",
          "json",
          "--thinking",
          "--dir",
          "/tmp/teamcow-opencode-worktree",
          "--",
          "Implement the OpenCode adapter"
        ])
        expect(options).toMatchObject({ cwd: "/tmp/teamcow-opencode-worktree" })
        expect(options?.onChild).toBeTypeOf("function")

        return {
          stdout: [
            JSON.stringify({
              type: "step_start",
              timestamp: 1767036059338,
              sessionID: "ses_opencode_1",
              part: {
                id: "part-step",
                type: "step-start",
                snapshot: "abc123"
              }
            }),
            JSON.stringify({
              type: "text",
              timestamp: 1767036059440,
              sessionID: "ses_opencode_1",
              part: {
                id: "part-text",
                type: "text",
                text: "I'll update the provider runtime."
              }
            }),
            JSON.stringify({
              type: "tool_use",
              timestamp: 1767036059550,
              sessionID: "ses_opencode_1",
              tool: "edit",
              status: "completed",
              input: { file: "provider-runtime-service.ts" },
              output: "Edited provider-runtime-service.ts"
            }),
            JSON.stringify({
              type: "step_finish",
              timestamp: 1767036059660,
              sessionID: "ses_opencode_1",
              reason: "stop",
              part: {
                tokens: {
                  input: 500,
                  output: 120
                }
              }
            })
          ].join("\n"),
          stderr: "",
          status: 0
        }
      }
    })

    const result = await service.runProvider({
      provider: "opencode",
      model: "open-code-default",
      prompt: "Implement the OpenCode adapter",
      worktreeRootPath: "/tmp/teamcow-opencode-worktree",
      worktreeId: "worktree-opencode",
      conversationId: "conversation-opencode",
      runId: "run-opencode"
    })

    expect(result.status).toBe("completed")
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "run.message.completed",
      "run.progress",
      "run.completed"
    ])
    expect(result.events[0]).toMatchObject({
      status: "running",
      payload: {
        provider: "opencode",
        conversationId: "conversation-opencode",
        runId: "run-opencode",
        worktreeId: "worktree-opencode",
        worktreeRootPath: "/tmp/teamcow-opencode-worktree",
        rawType: "step_start",
        sessionId: "ses_opencode_1"
      }
    })
    expect(result.events[1].payload).toMatchObject({
      provider: "opencode",
      text: "I'll update the provider runtime.",
      rawType: "text"
    })
    expect(result.events[2].payload).toMatchObject({
      rawType: "tool_use",
      toolUse: {
        name: "edit",
        status: "completed"
      }
    })
    expect(result.events[3]).toMatchObject({
      status: "completed",
      payload: {
        rawType: "step_finish",
        reason: "stop",
        usage: {
          input: 500,
          output: 120
        }
      }
    })
  })

  it("passes OpenCode full access through its provider-native bypass flag", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "opencode",
          command: "opencode",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: (command: string, args: string[]) => {
        expect(command).toBe("opencode")
        expect(args).toEqual([
          "run",
          "--format",
          "json",
          "--thinking",
          "--dir",
          "/tmp/teamcow-opencode-worktree",
          "--dangerously-skip-permissions",
          "--",
          "Implement with full access"
        ])

        return {
          stdout: JSON.stringify({
            type: "step_finish",
            sessionID: "ses_opencode_full",
            reason: "stop"
          }),
          stderr: "",
          status: 0
        }
      }
    })

    const result = await service.runProvider({
      provider: "opencode",
      model: "open-code-default",
      accessMode: "full-access",
      prompt: "Implement with full access",
      worktreeRootPath: "/tmp/teamcow-opencode-worktree",
      worktreeId: "worktree-opencode",
      conversationId: "conversation-opencode-full",
      runId: "run-opencode-full"
    })

    expect(result.status).toBe("completed")
  })

  it("streams OpenCode Server text and reasoning deltas before promoting the final answer", async () => {
    const streamedEvents: Array<{ type: string; payload: Record<string, unknown>; status?: string }> = []
    const service = createProviderRuntimeService({
      providers: [{ kind: "opencode", command: "opencode", minimumVersion: "1.0.0" }],
      runOpenCodeServer: async (input) => {
        expect(input).toMatchObject({
          cwd: "/tmp/teamcow-opencode-worktree",
          model: "openai/gpt-5.1",
          prompt: "Stream the OpenCode answer"
        })
        expect(input.permission).toContainEqual({
          permission: "external_directory",
          pattern: "*",
          action: "deny"
        })
        await input.onEvent?.({
          type: "message.part.updated",
          properties: {
            sessionID: "ses_server_1",
            part: { id: "reasoning-1", messageID: "message-1", type: "reasoning", text: "" }
          }
        })
        await input.onEvent?.({
          type: "message.part.delta",
          properties: {
            sessionID: "ses_server_1",
            messageID: "message-1",
            partID: "reasoning-1",
            field: "text",
            delta: "Checking the project"
          }
        })
        await input.onEvent?.({
          type: "message.part.updated",
          properties: {
            sessionID: "ses_server_1",
            part: { id: "text-1", messageID: "message-1", type: "text", text: "" }
          }
        })
        await input.onEvent?.({
          type: "message.part.delta",
          properties: {
            sessionID: "ses_server_1",
            messageID: "message-1",
            partID: "text-1",
            field: "text",
            delta: "Done"
          }
        })
        await input.onEvent?.({
          type: "message.part.updated",
          properties: {
            sessionID: "ses_server_1",
            part: {
              id: "text-1",
              messageID: "message-1",
              type: "text",
              text: "Done",
              time: { start: 1, end: 2 }
            }
          }
        })
        await input.onEvent?.({
          type: "session.idle",
          properties: { sessionID: "ses_server_1" }
        })
        return { sessionId: "ses_server_1", status: "completed", stderr: "" }
      }
    })

    const result = await service.runProvider({
      provider: "opencode",
      model: "openai/gpt-5.1",
      prompt: "Stream the OpenCode answer",
      worktreeRootPath: "/tmp/teamcow-opencode-worktree",
      worktreeId: "worktree-opencode-server",
      conversationId: "conversation-opencode-server",
      runId: "run-opencode-server",
      onEvent: (event) => {
        streamedEvents.push(event)
      }
    })

    expect(result).toMatchObject({ status: "completed", events: [], sessionId: "ses_server_1" })
    expect(streamedEvents.map((event) => event.type)).toEqual([
      "run.progress",
      "run.reasoning.delta",
      "run.progress",
      "run.message.delta",
      "run.message.completed",
      "run.message.completed",
      "run.completed"
    ])
    expect(streamedEvents[1].payload).toMatchObject({
      text: "Checking the project",
      visibility: "summary"
    })
    expect(streamedEvents[5].payload).toMatchObject({
      text: "Done",
      phase: "final",
      authoritative: true,
      transport: "server-sse"
    })
  })

  it("preserves malformed OpenCode output and appends failed diagnostics on non-zero exit", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "opencode",
          command: "opencode",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: [
          JSON.stringify({
            type: "text",
            sessionID: "ses_opencode_1",
            text: "Partial output before failure"
          }),
          "{\"type\":\"text\""
        ].join("\n"),
        stderr: "opencode auth expired",
        status: 1
      })
    })

    const result = await service.runProvider({
      provider: "opencode",
      model: "open-code-default",
      prompt: "--model should remain prompt text",
      worktreeRootPath: "/tmp/teamcow-opencode-worktree",
      worktreeId: "worktree-opencode",
      conversationId: "conversation-opencode",
      runId: "run-opencode"
    })

    expect(result.status).toBe("failed")
    expect(result.events.map((event) => event.type)).toEqual([
      "run.message.completed",
      "provider.raw",
      "run.error"
    ])
    expect(result.events[1].payload).toMatchObject({
      provider: "opencode",
      conversationId: "conversation-opencode",
      runId: "run-opencode",
      worktreeId: "worktree-opencode",
      rawType: "raw",
      parseError: "invalid-json",
      line: "{\"type\":\"text\""
    })
    expect(result.events[2]).toMatchObject({
      status: "failed",
      payload: {
        provider: "opencode",
        message: "opencode run exited with status 1",
        stderr: "opencode auth expired",
        status: 1,
        code: "auth-missing",
        subtype: "auth-missing",
        rawType: "process.exit",
        raw: {
          status: 1,
          stderr: "opencode auth expired"
        }
      }
    })
  })

  it("maps unsuccessful OpenCode finish statuses to failed run errors", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "opencode",
          command: "opencode",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: JSON.stringify({
          type: "step_finish",
          sessionID: "ses_opencode_1",
          status: "canceled",
          reason: "user_cancelled"
        }),
        stderr: "",
        status: 0
      })
    })

    const result = await service.runProvider({
      provider: "opencode",
      model: "open-code-default",
      prompt: "Cancel this run",
      worktreeRootPath: "/tmp/teamcow-opencode-worktree",
      worktreeId: "worktree-opencode",
      conversationId: "conversation-opencode",
      runId: "run-opencode"
    })

    expect(result.status).toBe("failed")
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      type: "run.error",
      status: "failed",
      payload: {
        provider: "opencode",
        rawType: "step_finish",
        sessionId: "ses_opencode_1",
        status: "canceled",
        message: "user_cancelled"
      }
    })
  })

  it("preserves OpenCode json error diagnostics on normalized error events", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "opencode",
          command: "opencode",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: JSON.stringify({
          type: "error",
          sessionID: "ses_opencode_1",
          message: "model provider is not configured",
          status: 2,
          code: "MODEL_PROVIDER_MISSING",
          subtype: "model",
          stderr: "missing model provider"
        }),
        stderr: "",
        status: 0
      })
    })

    const result = await service.runProvider({
      provider: "opencode",
      model: "open-code-default",
      prompt: "Use missing model",
      worktreeRootPath: "/tmp/teamcow-opencode-worktree",
      worktreeId: "worktree-opencode",
      conversationId: "conversation-opencode",
      runId: "run-opencode"
    })

    expect(result.status).toBe("failed")
    expect(result.events[0]).toMatchObject({
      type: "run.error",
      status: "failed",
      payload: {
        provider: "opencode",
        rawType: "error",
        sessionId: "ses_opencode_1",
        message: "model provider is not configured",
        status: 2,
        code: "MODEL_PROVIDER_MISSING",
        subtype: "model",
        stderr: "missing model provider"
      }
    })
  })

  it("redacts secrets and truncates oversized OpenCode diagnostics before persistence", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "opencode",
          command: "opencode",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: [
          JSON.stringify({
            type: "tool_use",
            sessionID: "ses_opencode_1",
            tool: "edit",
            input: {
              env: "OPENAI_API_KEY=sk-test-secret",
              token: "plain-token-value"
            },
            output: `ANTHROPIC_API_KEY=sk-ant-secret ${"x".repeat(5000)}`
          }),
          "{\"type\":\"text\",\"token\":\"sk-malformed-secret\""
        ].join("\n"),
        stderr: "Authorization: Bearer sk-error-secret",
        status: 1
      })
    })

    const result = await service.runProvider({
      provider: "opencode",
      model: "open-code-default",
      prompt: "Do not leak secrets",
      worktreeRootPath: "/tmp/teamcow-opencode-worktree",
      worktreeId: "worktree-opencode",
      conversationId: "conversation-opencode",
      runId: "run-opencode"
    })

    const persisted = JSON.stringify(result.events)
    expect(persisted).not.toContain("sk-test-secret")
    expect(persisted).not.toContain("plain-token-value")
    expect(persisted).not.toContain("sk-ant-secret")
    expect(persisted).not.toContain("sk-malformed-secret")
    expect(persisted).not.toContain("sk-error-secret")
    expect(persisted).toContain("[REDACTED]")
    expect(persisted.length).toBeLessThan(5000)
  })

  it("uses OpenCode auth list and local share credentials for readiness", async () => {
    const commandResults = new Map([
      [
        "opencode --version",
        {
          stdout: "opencode 1.2.3",
          stderr: "",
          status: 0
        }
      ],
      [
        "opencode auth list",
        {
          stdout: "anthropic\nopenai\n",
          stderr: "",
          status: 0
        }
      ],
      [
        "cursor-agent --version",
        {
          stdout: "",
          stderr: "cursor-agent not installed",
          status: 1,
          error: new Error("cursor-agent not installed")
        }
      ]
    ])

    const service = createProviderRuntimeService({
      now: () => "2026-05-24T06:20:00.000Z",
      env: {},
      homeDir: "/tmp/teamcow-home",
      pathExists: (path) => path === "/tmp/teamcow-home/.local/share/opencode/auth.json",
      readFile: () => JSON.stringify({ anthropic: {} }),
      providers: [
        {
          kind: "opencode",
          command: "opencode",
          minimumVersion: "1.0.0",
          authStatusArgs: ["auth", "list"],
          authFilePaths: ["/tmp/teamcow-home/.local/share/opencode/auth.json"]
        }
      ],
      runCommand: (command, args) => {
        const result = commandResults.get(`${command} ${args.join(" ")}`)
        if (!result) {
          throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
        }

        return result
      }
    })

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.providers).toMatchObject([
      {
        kind: "opencode",
        availability: "ready",
        issues: []
      }
    ])
  })

  it("reports default OpenCode as ready from auth list and local share credentials", async () => {
    const commandResults = new Map([
      [
        "codex --version",
        {
          stdout: "",
          stderr: "codex not installed",
          status: 1,
          error: new Error("codex not installed")
        }
      ],
      [
        "claude --version",
        {
          stdout: "",
          stderr: "claude not installed",
          status: 1,
          error: new Error("claude not installed")
        }
      ],
      [
        "opencode --version",
        {
          stdout: "opencode 1.2.3",
          stderr: "",
          status: 0
        }
      ],
      [
        "opencode auth list",
        {
          stdout: "anthropic\n",
          stderr: "",
          status: 0
        }
      ],
      [
        "cursor-agent --version",
        {
          stdout: "",
          stderr: "cursor-agent not installed",
          status: 1,
          error: new Error("cursor-agent not installed")
        }
      ]
    ])

    const service = createProviderRuntimeService({
      now: () => "2026-05-24T06:25:00.000Z",
      env: {},
      homeDir: "/tmp/teamcow-home",
      pathExists: (path) => path === "/tmp/teamcow-home/.local/share/opencode/auth.json",
      readFile: () => JSON.stringify({ anthropic: {} }),
      runCommand: (command, args) => {
        const result = commandResults.get(`${command} ${args.join(" ")}`)
        if (!result) {
          throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
        }

        return result
      }
    })

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.providers).toMatchObject([
      {
        kind: "codex",
        availability: "unavailable"
      },
      {
        kind: "claude",
        availability: "unavailable"
      },
      {
        kind: "opencode",
        availability: "ready",
        issues: []
      },
      {
        kind: "cursor",
        availability: "unavailable"
      }
    ])
  })

  it("prefers explicit OpenCode auth-missing output over static auth signals", async () => {
    const commandResults = new Map([
      [
        "opencode --version",
        {
          stdout: "opencode 1.2.3",
          stderr: "",
          status: 0
        }
      ],
      [
        "opencode auth list",
        {
          stdout: "\n┌  Credentials ~/.local/share/opencode/auth.json\n│\n└  0 credentials\n",
          stderr: "",
          status: 0
        }
      ]
    ])

    const service = createProviderRuntimeService({
      now: () => "2026-05-24T06:26:00.000Z",
      env: {
        OPENCODE_API_KEY: "test-key"
      },
      homeDir: "/tmp/teamcow-home",
      pathExists: () => false,
      providers: [
        {
          kind: "opencode",
          command: "opencode",
          minimumVersion: "1.0.0",
          authStatusArgs: ["auth", "list"],
          authEnvKeys: ["OPENCODE_API_KEY"]
        }
      ],
      runCommand: (command, args) => {
        const result = commandResults.get(`${command} ${args.join(" ")}`)
        if (!result) {
          throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
        }

        return result
      }
    })

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.providers).toMatchObject([
      {
        kind: "opencode",
        availability: "unavailable",
        issues: [
          {
            kind: "auth-missing"
          }
        ]
      }
    ])
  })

  it("does not treat non-zero OpenCode auth output as authenticated", async () => {
    const commandResults = new Map([
      [
        "opencode --version",
        {
          stdout: "opencode 1.2.3",
          stderr: "",
          status: 0
        }
      ],
      [
        "opencode auth list",
        {
          stdout: "OpenCode auth list failed unexpectedly",
          stderr: "",
          status: 1
        }
      ]
    ])

    const service = createProviderRuntimeService({
      now: () => "2026-05-24T06:27:00.000Z",
      env: {},
      homeDir: "/tmp/teamcow-home",
      pathExists: (path) => path === "/tmp/teamcow-home/.local/share/opencode/auth.json",
      providers: [
        {
          kind: "opencode",
          command: "opencode",
          minimumVersion: "1.0.0",
          authStatusArgs: ["auth", "list"],
          authFilePaths: ["/tmp/teamcow-home/.local/share/opencode/auth.json"]
        }
      ],
      runCommand: (command, args) => {
        const result = commandResults.get(`${command} ${args.join(" ")}`)
        if (!result) {
          throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
        }

        return result
      }
    })

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.providers).toMatchObject([
      {
        kind: "opencode",
        availability: "unknown",
        issues: []
      }
    ])
  })

  it("finds provider binaries from the user's login shell command path", async () => {
    const homeDir = createTempDir("teamcow-provider-home-")
    const shellOnlyBin = join(homeDir, "shell-only-bin")
    mkdirSync(shellOnlyBin, { recursive: true })
    writeFileSync(join(homeDir, fixtureShellProfile), `export PATH="${shellOnlyBin}:$PATH"\n`)
    const binaryPath = join(shellOnlyBin, "fake-provider")
    writeFileSync(binaryPath, "#!/bin/sh\necho 'fake-provider 1.2.3'\n")
    chmodSync(binaryPath, 0o755)

    try {
      const service = createProviderRuntimeService({
        now: () => "2026-05-24T09:30:00.000Z",
        env: {
          PATH: "/usr/bin:/bin",
          SHELL: fixtureShell,
          FAKE_PROVIDER_API_KEY: "configured"
        },
        homeDir,
        providers: [
          {
            kind: "claude",
            command: "fake-provider",
            minimumVersion: "1.0.0",
            authEnvKeys: ["FAKE_PROVIDER_API_KEY"]
          }
        ]
      })

      const refreshed = await service.refreshSnapshot()
      expect(refreshed.providers).toMatchObject([
        {
          kind: "claude",
          availability: "ready",
          version: "1.2.3",
          issues: []
        }
      ])
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("uses the login shell PATH when a provider relies on an env-based Node shebang", async () => {
    const homeDir = createTempDir("teamcow-provider-node-home-")
    const shellOnlyBin = join(homeDir, "shell-only-bin")
    mkdirSync(shellOnlyBin, { recursive: true })
    writeFileSync(join(homeDir, fixtureShellProfile), `export PATH="${shellOnlyBin}:$PATH"\n`)
    symlinkSync(process.execPath, join(shellOnlyBin, "node"))
    const binaryPath = join(shellOnlyBin, "fake-provider")
    writeFileSync(binaryPath, "#!/usr/bin/env node\nconsole.log('fake-provider 1.2.3')\n")
    chmodSync(binaryPath, 0o755)

    try {
      const service = createProviderRuntimeService({
        now: () => "2026-05-24T09:31:00.000Z",
        env: {
          PATH: "/usr/bin:/bin",
          SHELL: fixtureShell,
          FAKE_PROVIDER_API_KEY: "configured"
        },
        homeDir,
        providers: [
          {
            kind: "claude",
            command: "fake-provider",
            minimumVersion: "1.0.0",
            authEnvKeys: ["FAKE_PROVIDER_API_KEY"]
          }
        ]
      })

      const refreshed = await service.refreshSnapshot()
      expect(refreshed.providers).toMatchObject([
        {
          kind: "claude",
          availability: "ready",
          version: "1.2.3",
          issues: []
        }
      ])
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("ignores login shell banners and aliases when resolving a provider executable", async () => {
    const homeDir = createTempDir("teamcow-provider-alias-home-")
    const shellOnlyBin = join(homeDir, "shell-only-bin")
    mkdirSync(shellOnlyBin, { recursive: true })
    writeFileSync(
      join(homeDir, fixtureShellProfile),
      [
        "echo 'shell startup banner'",
        `export PATH="${shellOnlyBin}:$PATH"`,
        "alias fake-provider='/does/not/exist'"
      ].join("\n")
    )
    const binaryPath = join(shellOnlyBin, "fake-provider")
    writeFileSync(binaryPath, "#!/bin/sh\necho 'fake-provider 1.2.3'\n")
    chmodSync(binaryPath, 0o755)

    try {
      const service = createProviderRuntimeService({
        now: () => "2026-05-24T09:32:00.000Z",
        env: {
          PATH: "/usr/bin:/bin",
          SHELL: fixtureShell,
          FAKE_PROVIDER_API_KEY: "configured"
        },
        homeDir,
        providers: [
          {
            kind: "claude",
            command: "fake-provider",
            minimumVersion: "1.0.0",
            authEnvKeys: ["FAKE_PROVIDER_API_KEY"]
          }
        ]
      })

      const refreshed = await service.refreshSnapshot()
      expect(refreshed.providers[0]).toMatchObject({
        availability: "ready",
        version: "1.2.3",
        issues: []
      })
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("distinguishes a failed version check from a missing provider binary", async () => {
    const service = createProviderRuntimeService({
      providers: [{ kind: "codex", command: "codex", minimumVersion: "0.0.0" }],
      runCommand: () => ({
        stdout: "",
        stderr: "/usr/bin/env: node: No such file or directory",
        status: 127
      })
    })

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.providers[0]).toMatchObject({
      availability: "unavailable",
      issues: [
        {
          kind: "version-check-failed",
          params: {
            command: "codex",
            detail: "/usr/bin/env: node: No such file or directory"
          }
        }
      ]
    })
  })

  it("treats OpenCode provider api keys in opencode.json as a configured auth signal", async () => {
    const homeDir = createTempDir("teamcow-opencode-config-home-")
    const configDir = join(homeDir, ".config", "opencode")
    mkdirSync(configDir, { recursive: true })
    writeFileSync(
      join(configDir, "opencode.json"),
      JSON.stringify({
        provider: {
          modelget: {
            npm: "@ai-sdk/openai-compatible",
            options: {
              baseURL: "https://example.invalid/v1",
              apiKey: "configured-secret"
            },
            models: {
              "GPT-5.4": {
                name: ""
              }
            }
          }
        }
      })
    )

    try {
      const commandResults = new Map([
        [
          "opencode --version",
          {
            stdout: "opencode 1.15.10",
            stderr: "",
            status: 0
          }
        ],
        [
          "opencode auth list",
          {
            stdout: "\n┌  Credentials ~/.local/share/opencode/auth.json\n│\n└  0 credentials\n",
            stderr: "",
            status: 0
          }
        ]
      ])

      const service = createProviderRuntimeService({
        now: () => "2026-05-24T09:35:00.000Z",
        env: {},
        homeDir,
        providers: [
          {
            kind: "opencode",
            command: "opencode",
            minimumVersion: "1.0.0",
            authStatusArgs: ["auth", "list"],
            configFilePaths: [join(homeDir, ".config", "opencode", "opencode.json")]
          }
        ],
        runCommand: (command, args) => {
          const result = commandResults.get(`${command} ${args.join(" ")}`)
          if (!result) {
            throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
          }

          return result
        }
      })

      const refreshed = await service.refreshSnapshot()
      expect(refreshed.providers).toMatchObject([
        {
          kind: "opencode",
          availability: "ready",
          issues: []
        }
      ])
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("runs Claude Code in the bound worktree and normalizes stream-json output", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "claude",
          command: "claude",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: (command: string, args: string[], options?: { cwd?: string; onChild?: (child: import("node:child_process").ChildProcess) => void }) => {
        expect(command).toBe("claude")
        expect(args).toEqual([
          "--print",
          "--verbose",
          "--permission-mode",
          "acceptEdits",
          "--output-format",
          "stream-json",
          "--include-partial-messages",
          "--model",
          "claude-sonnet-4-6",
          "--",
          "Implement the Claude adapter"
        ])
        expect(options).toMatchObject({ cwd: "/tmp/teamcow-claude-worktree" })
        expect(options?.onChild).toBeTypeOf("function")

        return {
          stdout: [
            JSON.stringify({
              type: "system",
              subtype: "init",
              session_id: "claude-session-1",
              model: "claude-sonnet-4-5"
            }),
            JSON.stringify({
              type: "assistant",
              message: {
                content: [
                  {
                    type: "text",
                    text: "I'll update the provider runtime."
                  },
                  {
                    type: "tool_use",
                    id: "tool-1",
                    name: "Edit",
                    input: { file_path: "provider-runtime-service.ts" }
                  }
                ]
              }
            }),
            JSON.stringify({
              type: "user",
              message: {
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: "tool-1",
                    is_error: false,
                    content: "Edited provider-runtime-service.ts"
                  }
                ]
              }
            }),
            JSON.stringify({
              type: "result",
              subtype: "success",
              is_error: false,
              result: "Updated runtime",
              session_id: "claude-session-1"
            })
          ].join("\n"),
          stderr: "",
          status: 0
        }
      }
    })

    const result = await service.runProvider({
      provider: "claude",
      model: "claude-sonnet-4-6",
      prompt: "Implement the Claude adapter",
      worktreeRootPath: "/tmp/teamcow-claude-worktree",
      worktreeId: "worktree-claude",
      conversationId: "conversation-claude",
      runId: "run-claude"
    })

    expect(result.status).toBe("completed")
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "run.message.completed",
      "run.progress",
      "run.progress",
      "run.message.completed",
      "run.completed"
    ])
    expect(result.events[0]).toMatchObject({
      status: "running",
      payload: {
        provider: "claude",
        conversationId: "conversation-claude",
        runId: "run-claude",
        worktreeId: "worktree-claude",
        worktreeRootPath: "/tmp/teamcow-claude-worktree",
        rawType: "system",
        sessionId: "claude-session-1",
        model: "claude-sonnet-4-5"
      }
    })
    expect(result.events[1].payload).toMatchObject({
      provider: "claude",
      text: "I'll update the provider runtime.",
      rawType: "assistant"
    })
    expect(result.events[2].payload).toMatchObject({
      rawType: "assistant",
      toolUse: {
        id: "tool-1",
        name: "Edit"
      }
    })
    expect(result.events[3].payload).toMatchObject({
      rawType: "user",
      toolResult: {
        toolUseId: "tool-1",
        isError: false,
        content: "Edited provider-runtime-service.ts"
      }
    })
    expect(result.events[4]).toMatchObject({
      type: "run.message.completed",
      payload: {
        phase: "final",
        authoritative: true,
        text: "Updated runtime"
      }
    })
    expect(result.events[5]).toMatchObject({
      status: "completed",
      payload: {
        rawType: "result",
        message: "Updated runtime"
      }
    })
  })

  it("promotes Claude result text to assistant output when stream-json omits assistant content", async () => {
    const markdownResult = [
      "## 项目概览",
      "",
      "**项目类型**: vivo 快应用轻卡",
      "",
      "```",
      "quickapp-code-1/",
      "```"
    ].join("\n")

    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "claude",
          command: "claude",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: [
          JSON.stringify({
            type: "system",
            subtype: "init",
            session_id: "claude-session-2",
            model: "claude-sonnet-4-5"
          }),
          JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: markdownResult,
            session_id: "claude-session-2"
          })
        ].join("\n"),
        stderr: "",
        status: 0
      })
    })

    const result = await service.runProvider({
      provider: "claude",
      model: "claude-sonnet-4-6",
      prompt: "Analyze this project",
      worktreeRootPath: "/tmp/teamcow-claude-worktree",
      worktreeId: "worktree-claude",
      conversationId: "conversation-claude-result-only",
      runId: "run-claude-result-only"
    })

    expect(result.status).toBe("completed")
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "run.message.completed",
      "run.completed"
    ])
    expect(result.events[1]).toMatchObject({
      type: "run.message.completed",
      payload: {
        provider: "claude",
        rawType: "result",
        text: markdownResult,
        phase: "final",
        authoritative: true
      }
    })
    expect(result.events[2]).toMatchObject({
      type: "run.completed",
      status: "completed",
      payload: {
        rawType: "result",
        subtype: "success",
        sessionId: "claude-session-2"
      }
    })
    expect(result.events[2]?.payload.message).toBe(markdownResult)
  })

  it("normalizes Claude partial text and thinking streams while keeping result authoritative", async () => {
    const service = createProviderRuntimeService({
      providers: [{ kind: "claude", command: "claude", minimumVersion: "1.0.0" }],
      runCommand: () => ({
        stdout: [
          JSON.stringify({ type: "system", subtype: "init", session_id: "claude-stream-1" }),
          JSON.stringify({
            type: "stream_event",
            uuid: "message-1",
            session_id: "claude-stream-1",
            event: {
              type: "content_block_delta",
              index: 0,
              delta: { type: "thinking_delta", thinking: "Checking the implementation" }
            }
          }),
          JSON.stringify({
            type: "stream_event",
            uuid: "message-1",
            session_id: "claude-stream-1",
            event: {
              type: "content_block_delta",
              index: 1,
              delta: { type: "text_delta", text: "Working" }
            }
          }),
          JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: "Completed answer",
            session_id: "claude-stream-1"
          })
        ].join("\n"),
        stderr: "",
        status: 0
      })
    })

    const result = await service.runProvider({
      provider: "claude",
      model: "claude-sonnet-4-6",
      prompt: "Stream the answer",
      worktreeRootPath: "/tmp/teamcow-claude-worktree",
      worktreeId: "worktree-claude-stream",
      conversationId: "conversation-claude-stream",
      runId: "run-claude-stream"
    })

    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "run.reasoning.delta",
      "run.message.delta",
      "run.message.completed",
      "run.completed"
    ])
    expect(result.events[1].payload).toMatchObject({
      text: "Checking the implementation",
      visibility: "summary"
    })
    expect(result.events[2].payload).toMatchObject({
      text: "Working",
      phase: "commentary",
      authoritative: false
    })
    expect(result.events[3].payload).toMatchObject({
      text: "Completed answer",
      phase: "final",
      authoritative: true
    })
  })

  it("groups Claude partial deltas by the inner message lifecycle instead of per-event UUIDs", async () => {
    const service = createProviderRuntimeService({
      providers: [{ kind: "claude", command: "claude", minimumVersion: "1.0.0" }],
      runCommand: () => ({
        stdout: [
          JSON.stringify({ type: "system", subtype: "init", session_id: "claude-stream-uuid" }),
          JSON.stringify({
            type: "stream_event",
            uuid: "outer-message-start",
            session_id: "claude-stream-uuid",
            event: {
              type: "message_start",
              message: { id: "msg-inner-1", type: "message", role: "assistant", content: [] }
            }
          }),
          JSON.stringify({
            type: "stream_event",
            uuid: "outer-block-start",
            session_id: "claude-stream-uuid",
            event: {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" }
            }
          }),
          JSON.stringify({
            type: "stream_event",
            uuid: "outer-delta-1",
            session_id: "claude-stream-uuid",
            event: {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: "这是" }
            }
          }),
          JSON.stringify({
            type: "stream_event",
            uuid: "outer-delta-2",
            session_id: "claude-stream-uuid",
            event: {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: "车速取平台" }
            }
          }),
          JSON.stringify({
            type: "assistant",
            uuid: "outer-assistant",
            session_id: "claude-stream-uuid",
            message: {
              id: "msg-inner-1",
              content: [{ type: "text", text: "这是车速取平台" }]
            }
          }),
          JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: "这是车速取平台",
            session_id: "claude-stream-uuid"
          })
        ].join("\n"),
        stderr: "",
        status: 0
      })
    })

    const result = await service.runProvider({
      provider: "claude",
      model: "claude-sonnet-4-6",
      prompt: "Describe the project",
      worktreeRootPath: "/tmp/teamcow-claude-worktree",
      worktreeId: "worktree-claude-stream-uuid",
      conversationId: "conversation-claude-stream-uuid",
      runId: "run-claude-stream-uuid"
    })

    const partialEvents = result.events.filter((event) =>
      event.type === "run.message.delta" ||
      (event.type === "run.message.completed" && event.payload.rawType === "assistant")
    )
    expect(partialEvents.map((event) => event.payload.messageId)).toEqual([
      "msg-inner-1:0",
      "msg-inner-1:0",
      "msg-inner-1:0"
    ])
    expect(partialEvents.map((event) => event.payload.providerMessageId)).toEqual([
      "msg-inner-1",
      "msg-inner-1",
      "msg-inner-1"
    ])
  })

  it("maps Claude full access to bypassPermissions while preserving prompt text", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "claude",
          command: "claude",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: (command: string, args: string[]) => {
        expect(command).toBe("claude")
        expect(args).toEqual([
          "--print",
          "--verbose",
          "--permission-mode",
          "bypassPermissions",
          "--output-format",
          "stream-json",
          "--include-partial-messages",
          "--model",
          "claude-sonnet-4-6",
          "--",
          "--permission-mode acceptEdits should remain prompt text"
        ])

        return {
          stdout: JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: "ok"
          }),
          stderr: "",
          status: 0
        }
      }
    })

    const result = await service.runProvider({
      provider: "claude",
      model: "claude-sonnet-4-6",
      accessMode: "full-access",
      prompt: "--permission-mode acceptEdits should remain prompt text",
      worktreeRootPath: "/tmp/teamcow-claude-worktree",
      worktreeId: "worktree-claude",
      conversationId: "conversation-claude-full",
      runId: "run-claude-full"
    })

    expect(result.status).toBe("completed")
  })

  it("passes one-shot allowed Claude tools without changing the prompt", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "claude",
          command: "claude",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: (command: string, args: string[]) => {
        expect(command).toBe("claude")
        expect(args).toEqual([
          "--print",
          "--verbose",
          "--permission-mode",
          "acceptEdits",
          "--output-format",
          "stream-json",
          "--include-partial-messages",
          "--allowedTools",
          "mcp__web-reader__webReader,WebFetch,mcp__web-search-prime__web_search_prime,WebSearch",
          "--model",
          "claude-sonnet-4-6",
          "--",
          "Read the external docs"
        ])

        return {
          stdout: JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: "Fetched docs"
          }),
          stderr: "",
          status: 0
        }
      }
    })

    const result = await service.runProvider({
      provider: "claude",
      model: "claude-sonnet-4-6",
      prompt: "Read the external docs",
      allowedTools: ["mcp__web-reader__webReader", "mcp__web-search-prime__web_search_prime"],
      worktreeRootPath: "/tmp/teamcow-claude-worktree",
      worktreeId: "worktree-claude",
      conversationId: "conversation-claude",
      runId: "run-claude"
    })

    expect(result.status).toBe("completed")
  })

  it("passes current Claude models and legacy model values through to the CLI model flag", async () => {
    const capturedModelArgs: string[] = []
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "claude",
          command: "claude",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: (_command: string, args: string[]) => {
        const modelIndex = args.indexOf("--model")
        if (modelIndex >= 0) {
          capturedModelArgs.push(args[modelIndex + 1])
        }

        return {
          stdout: JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: "ok"
          }),
          stderr: "",
          status: 0
        }
      }
    })

    const modelValues = [
      "default",
      "claude-fable-5-1",
      "claude-fable-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-sonnet-5",
      "claude-haiku-4-5",
      // Older conversations may still store aliases, modes, or previous exact model IDs.
      "best",
      "fable",
      "sonnet",
      "opus",
      "haiku",
      "sonnet[1m]",
      "opus[1m]",
      "opusplan",
      "claude-sonnet-4-6",
      "claude-opus-4-7"
    ]

    for (const id of modelValues) {
      capturedModelArgs.length = 0
      await service.runProvider({
        provider: "claude",
        model: id,
        prompt: "test",
        worktreeRootPath: "/tmp/test",
        worktreeId: "wt-1",
        conversationId: "conv-1",
        runId: `run-${id}`
      })
      expect(capturedModelArgs[0]).toBe(id)
    }

    // Custom/config-derived models not in catalog pass through unchanged
    capturedModelArgs.length = 0
    await service.runProvider({
      provider: "claude",
      model: "my-custom-model",
      prompt: "test",
      worktreeRootPath: "/tmp/test",
      worktreeId: "wt-1",
      conversationId: "conv-1",
      runId: "run-custom"
    })
    expect(capturedModelArgs[0]).toBe("my-custom-model")
  })

  it("preserves malformed Claude Code output and appends failed diagnostics on non-zero exit", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "claude",
          command: "claude",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: [
          JSON.stringify({
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: "Partial output before failure"
                }
              ]
            }
          }),
          "{\"type\":\"assistant\""
        ].join("\n"),
        stderr: "Claude auth expired",
        status: 1
      })
    })

    const result = await service.runProvider({
      provider: "claude",
      model: "claude-opus-4-7",
      prompt: "Keep diagnostics",
      worktreeRootPath: "/tmp/teamcow-claude-worktree",
      worktreeId: "worktree-claude",
      conversationId: "conversation-claude",
      runId: "run-claude"
    })

    expect(result.status).toBe("failed")
    expect(result.events.map((event) => event.type)).toEqual([
      "run.message.completed",
      "provider.raw",
      "run.error"
    ])
    expect(result.events[1].payload).toMatchObject({
      provider: "claude",
      conversationId: "conversation-claude",
      runId: "run-claude",
      worktreeId: "worktree-claude",
      rawType: "raw",
      parseError: "invalid-json",
      line: "{\"type\":\"assistant\""
    })
    expect(result.events[2]).toMatchObject({
      status: "failed",
      payload: {
        provider: "claude",
        message: "claude --print exited with status 1",
        stderr: "Claude auth expired",
        status: 1,
        code: "auth-missing",
        subtype: "auth-missing",
        rawType: "process.exit",
        raw: {
          status: 1,
          stderr: "Claude auth expired"
        }
      }
    })
  })

  it("preserves completed Claude output when the process exits non-zero", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "claude",
          command: "claude",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: false,
          result: "Reported success before process failure"
        }),
        stderr: "process failed after result",
        status: 1
      })
    })

    const result = await service.runProvider({
      provider: "claude",
      model: "claude-sonnet-4-6",
      prompt: "--permission-mode bypassPermissions should remain prompt text",
      worktreeRootPath: "/tmp/teamcow-claude-worktree",
      worktreeId: "worktree-claude",
      conversationId: "conversation-claude",
      runId: "run-claude"
    })

    expect(result.status).toBe("failed")
    expect(result.events.map((event) => event.type)).toEqual(["run.message.completed", "run.error"])
    expect(result.events[0]).toMatchObject({
      type: "run.message.completed",
      payload: {
        phase: "final",
        authoritative: true,
        text: "Reported success before process failure"
      }
    })
    expect(result.events[1].payload).toMatchObject({
      provider: "claude",
      conversationId: "conversation-claude",
      runId: "run-claude",
      worktreeId: "worktree-claude",
      worktreeRootPath: "/tmp/teamcow-claude-worktree",
      message: "claude --print exited with status 1",
      stderr: "process failed after result",
      status: 1,
      rawType: "process.exit",
      raw: {
        status: 1,
        stdout: expect.stringContaining("Reported success before process failure"),
        stderr: "process failed after result"
      }
    })
  })

  it("keeps malformed Claude content blocks inspectable instead of dropping the event", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "claude",
          command: "claude",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: [
          JSON.stringify({
            type: "assistant",
            message: {
              content: []
            }
          }),
          JSON.stringify({
            type: "assistant",
            message: {
              content: ["not-a-content-block"]
            }
          }),
          JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: "Finished"
          })
        ].join("\n"),
        stderr: "",
        status: 0
      })
    })

    const result = await service.runProvider({
      provider: "claude",
      model: "claude-sonnet-4-6",
      prompt: "Keep malformed content",
      worktreeRootPath: "/tmp/teamcow-claude-worktree",
      worktreeId: "worktree-claude",
      conversationId: "conversation-claude",
      runId: "run-claude"
    })

    expect(result.status).toBe("completed")
    expect(result.events.map((event) => event.type)).toEqual([
      "provider.raw",
      "provider.raw",
      "run.message.completed",
      "run.completed"
    ])
    expect(result.events[0].payload).toMatchObject({
      rawType: "assistant",
      parseError: "empty-content"
    })
    expect(result.events[1].payload).toMatchObject({
      rawType: "assistant",
      parseError: "invalid-content-block",
      rawBlock: "not-a-content-block"
    })
  })

  it("normalizes Codex JSONL execution output into run events", async () => {
    const service = createProviderRuntimeService({
      now: () => "2026-05-19T12:00:00.000Z",
      providers: [
        {
          kind: "codex",
          command: "codex",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: (command, args, options) => {
        expect(command).toBe("codex")
        expect(args).toEqual([
          "exec",
          "--sandbox",
          "workspace-write",
          "-c",
          "approval_policy=\"never\"",
          "--json",
          "--cd",
          "/tmp/teamcow-worktree",
          "--model",
          "gpt-5.1",
          "-"
        ])
        expect(options?.stdin).toBe("Implement the first task")

        return {
          stdout: [
            JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
            JSON.stringify({ type: "turn.started" }),
            JSON.stringify({ type: "agent_message_delta", delta: "Working on it" }),
            JSON.stringify({ type: "error", message: "Reconnecting... 1/5" }),
            JSON.stringify({ type: "turn.completed" })
          ].join("\n"),
          stderr: "",
          status: 0
        }
      }
    })

    const result = await service.runProvider({
      provider: "codex",
      model: "gpt-5.1",
      prompt: "Implement the first task",
      worktreeRootPath: "/tmp/teamcow-worktree",
      worktreeId: "worktree-1",
      conversationId: "conversation-1",
      runId: "run-1"
    })

    expect(result.status).toBe("completed")
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "run.progress",
      "run.message.delta",
      "run.status",
      "run.completed"
    ])
    expect(result.events[0].payload).toMatchObject({
      provider: "codex",
      conversationId: "conversation-1",
      runId: "run-1",
      worktreeId: "worktree-1",
      rawType: "thread.started",
      threadId: "thread-1"
    })
    expect(result.events[2].payload).toMatchObject({
      text: "Working on it",
      rawType: "agent_message_delta"
    })
    expect(result.events[3].payload).toMatchObject({
      message: "Reconnecting... 1/5",
      rawType: "error"
    })
  })

  it("uses Codex App Server phases to separate commentary, reasoning, and the final answer", async () => {
    const streamedEvents: Array<{ type: string; payload: Record<string, unknown>; status?: string }> = []
    const service = createProviderRuntimeService({
      providers: [{ kind: "codex", command: "codex", minimumVersion: "1.0.0" }],
      runCodexAppServer: async (input) => {
        expect(input).toMatchObject({
          cwd: "/tmp/teamcow-worktree",
          model: "gpt-5.1",
          prompt: "Explain and finish",
          sandboxPolicy: {
            type: "workspaceWrite",
            writableRoots: ["/tmp/teamcow-worktree"],
            networkAccess: false
          }
        })
        await input.onNotification?.({
          method: "thread/started",
          params: { thread: { id: "thread-app-server" } }
        })
        await input.onNotification?.({
          method: "item/started",
          params: { item: { id: "commentary-1", type: "agentMessage", phase: "commentary", text: "" } }
        })
        await input.onNotification?.({
          method: "item/agentMessage/delta",
          params: { itemId: "commentary-1", delta: "Inspecting files" }
        })
        await input.onNotification?.({
          method: "item/reasoning/summaryTextDelta",
          params: { itemId: "reasoning-1", summaryIndex: 0, delta: "Comparing implementations" }
        })
        await input.onNotification?.({
          method: "item/started",
          params: { item: { id: "final-1", type: "agentMessage", phase: "final_answer", text: "" } }
        })
        await input.onNotification?.({
          method: "item/agentMessage/delta",
          params: { itemId: "final-1", delta: "All done" }
        })
        await input.onNotification?.({
          method: "item/completed",
          params: { item: { id: "final-1", type: "agentMessage", phase: "final_answer", text: "All done" } }
        })
        await input.onNotification?.({
          method: "turn/completed",
          params: { threadId: "thread-app-server", turn: { id: "turn-1", status: "completed" } }
        })
        return {
          threadId: "thread-app-server",
          turnId: "turn-1",
          status: "completed",
          stderr: ""
        }
      }
    })

    const result = await service.runProvider({
      provider: "codex",
      model: "gpt-5.1",
      prompt: "Explain and finish",
      worktreeRootPath: "/tmp/teamcow-worktree",
      worktreeId: "worktree-app-server",
      conversationId: "conversation-app-server",
      runId: "run-app-server",
      onEvent: (event) => {
        streamedEvents.push(event)
      }
    })

    expect(result).toMatchObject({ status: "completed", events: [], sessionId: "thread-app-server" })
    expect(streamedEvents.map((event) => event.type)).toEqual([
      "run.started",
      "run.progress",
      "run.message.delta",
      "run.reasoning.delta",
      "run.progress",
      "run.message.delta",
      "run.message.completed",
      "run.completed"
    ])
    expect(streamedEvents[2].payload).toMatchObject({ phase: "commentary", text: "Inspecting files" })
    expect(streamedEvents[3].payload).toMatchObject({
      visibility: "summary",
      text: "Comparing implementations"
    })
    expect(streamedEvents[5].payload).toMatchObject({ phase: "final", text: "All done" })
    expect(streamedEvents[6].payload).toMatchObject({
      phase: "final",
      authoritative: true,
      text: "All done"
    })
  })

  it("normalizes Codex image generation with original bytes and a stable native event id", async () => {
    const imageData = "a".repeat(2000)
    const streamedEvents: Array<{ type: string; payload: Record<string, unknown> }> = []
    const service = createProviderRuntimeService({
      providers: [{ kind: "codex", command: "codex", minimumVersion: "1.0.0" }],
      runCodexAppServer: async (input) => {
        await input.onNotification?.({ method: "item/completed", params: {
          item: { type: "imageGeneration", id: "image-native-1", status: "completed", savedPath: "/tmp/image.png", result: imageData }
        } })
        return { threadId: "thread-1", turnId: "turn-1", status: "completed", stderr: "" }
      }
    })
    await service.runProvider({ provider: "codex", model: "gpt-6-astra", prompt: "Generate an image",
      worktreeRootPath: "/tmp/worktree", worktreeId: "worktree-1", conversationId: "conversation-1", runId: "run-1",
      onEvent: (event) => { streamedEvents.push(event) }
    })
    expect(streamedEvents.find((event) => event.type === "run.artifact.changed")?.payload).toMatchObject({
      contentType: "imageGeneration", phase: "completed", providerEventId: "item/completed:image-native-1",
      imageSource: { id: "image-native-1", savedPath: "/tmp/image.png", result: imageData }
    })
  })

  it("queues cancellation while a native provider transport is still starting", async () => {
    const interrupt = vi.fn(async () => undefined)
    const child = { kill: vi.fn() } as unknown as import("node:child_process").ChildProcess
    let releaseTransport: (() => void) | undefined
    const transportReady = new Promise<void>((resolve) => {
      releaseTransport = resolve
    })
    const service = createProviderRuntimeService({
      providers: [{ kind: "codex", command: "/tmp/fake-codex", minimumVersion: "1.0.0" }],
      runCodexAppServer: async (input) => {
        await transportReady
        input.onControl?.({ child, interrupt })
        await new Promise((resolve) => setTimeout(resolve, 0))
        return {
          threadId: "thread-cancelled",
          turnId: "turn-cancelled",
          status: "interrupted",
          stderr: ""
        }
      }
    })

    const runPromise = service.runProvider({
      provider: "codex",
      model: "gpt-5.1",
      prompt: "Cancel before startup finishes",
      worktreeRootPath: "/tmp/teamcow-worktree",
      worktreeId: "worktree-cancel-startup",
      conversationId: "conversation-cancel-startup",
      runId: "run-cancel-startup"
    })

    expect(service.cancelRun("conversation-cancel-startup")).toBe(true)
    releaseTransport?.()
    const result = await runPromise

    expect(interrupt).toHaveBeenCalledOnce()
    expect(result.status).toBe("interrupted")
    expect(result.events.at(-1)).toMatchObject({
      type: "run.interrupted",
      status: "interrupted",
      payload: { message: "cancelled-by-user", code: "cancelled-by-user" }
    })
  })

  it("maps Codex read-only and full-access modes to new and resumed command arguments", async () => {
    const capturedArgs: string[][] = []
    const service = createProviderRuntimeService({
      now: () => "2026-05-19T12:00:00.000Z",
      providers: [
        {
          kind: "codex",
          command: "codex",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: (_command, args) => {
        capturedArgs.push(args)
        return {
          stdout: JSON.stringify({ type: "turn.completed" }),
          stderr: "",
          status: 0
        }
      }
    })

    await service.runProvider({
      provider: "codex",
      model: "gpt-5.1",
      accessMode: "read-only",
      prompt: "Inspect only",
      worktreeRootPath: "/tmp/teamcow-worktree",
      worktreeId: "worktree-1",
      conversationId: "conversation-codex-read",
      runId: "run-codex-read"
    })
    await service.runProvider({
      provider: "codex",
      model: "gpt-5.1",
      accessMode: "read-only",
      prompt: "Resume inspect only",
      worktreeRootPath: "/tmp/teamcow-worktree",
      worktreeId: "worktree-1",
      conversationId: "conversation-codex-resume",
      runId: "run-codex-resume",
      sessionId: "thread-1"
    })
    await service.runProvider({
      provider: "codex",
      model: "gpt-5.1",
      accessMode: "full-access",
      prompt: "Trusted edit",
      worktreeRootPath: "/tmp/teamcow-worktree",
      worktreeId: "worktree-1",
      conversationId: "conversation-codex-full",
      runId: "run-codex-full"
    })

    expect(capturedArgs[0]).toEqual([
      "exec",
      "--sandbox",
      "read-only",
      "-c",
      "approval_policy=\"never\"",
      "--json",
      "--cd",
      "/tmp/teamcow-worktree",
      "--model",
      "gpt-5.1",
      "-"
    ])
    expect(capturedArgs[1]).toEqual([
      "exec",
      "resume",
      "-c",
      "sandbox_mode=\"read-only\"",
      "-c",
      "approval_policy=\"never\"",
      "thread-1",
      "--json",
      "--model",
      "gpt-5.1",
      "-"
    ])
    expect(capturedArgs[2]).toEqual([
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "--json",
      "--cd",
      "/tmp/teamcow-worktree",
      "--model",
      "gpt-5.1",
      "-"
    ])
  })

  it("redacts secrets from Codex raw event payloads before persistence", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "codex",
          command: "codex",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: [
          JSON.stringify({ type: "thread.started", token: "secret-token-value" }),
          JSON.stringify({
            type: "agent_message_delta",
            delta: "safe output",
            apiKey: "sk-teamcow-secret",
            nested: {
              authorization: "Bearer verysecret"
            }
          }),
          JSON.stringify({ type: "turn.completed" })
        ].join("\n"),
        stderr: "",
        status: 0
      })
    })

    const result = await service.runProvider({
      provider: "codex",
      model: "gpt-5.5",
      prompt: "Do not leak",
      worktreeRootPath: "/tmp/teamcow-worktree",
      worktreeId: "worktree-1",
      conversationId: "conversation-1",
      runId: "run-1"
    })

    const serialized = JSON.stringify(result.events)
    expect(serialized).toContain("[REDACTED]")
    expect(serialized).not.toContain("secret-token-value")
    expect(serialized).not.toContain("sk-teamcow-secret")
    expect(serialized).not.toContain("verysecret")
  })

  it("normalizes Codex item.completed agent messages into provider message events", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "codex",
          command: "codex",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: [
          JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
          JSON.stringify({
            type: "item.completed",
            item: {
              id: "item_3",
              type: "agent_message",
              text: "你好！有什么我可以帮你的吗？"
            }
          }),
          JSON.stringify({ type: "turn.completed" })
        ].join("\n"),
        stderr: "",
        status: 0
      })
    })

    const result = await service.runProvider({
      provider: "codex",
      model: "gpt-5.5",
      prompt: "say hello",
      worktreeRootPath: "/tmp/teamcow-worktree",
      worktreeId: "worktree-1",
      conversationId: "conversation-1",
      runId: "run-1"
    })

    expect(result.status).toBe("completed")
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "run.message.completed",
      "run.completed"
    ])
    expect(result.events[1].payload).toMatchObject({
      rawType: "item.completed",
      itemType: "agent_message",
      text: "你好！有什么我可以帮你的吗？"
    })
  })

  it("marks successful Codex exits without JSONL events as failed diagnostics", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "codex",
          command: "codex",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: "plain output",
        stderr: "",
        status: 0
      })
    })

    const result = await service.runProvider({
      provider: "codex",
      model: "gpt-5.1",
      prompt: "Implement the first task",
      worktreeRootPath: "/tmp/teamcow-worktree",
      worktreeId: "worktree-1",
      conversationId: "conversation-1",
      runId: "run-1"
    })

    expect(result.status).toBe("failed")
    expect(result.events).toEqual([
      {
        type: "run.error",
        status: "failed",
        payload: expect.objectContaining({
          provider: "codex",
          conversationId: "conversation-1",
          runId: "run-1",
          worktreeId: "worktree-1",
          worktreeRootPath: "/tmp/teamcow-worktree",
          message: "codex exec produced no JSONL events"
        })
      }
    ])
  })

  it("marks Codex exits without terminal JSONL events as failed diagnostics", async () => {
    const service = createProviderRuntimeService({
      providers: [
        {
          kind: "codex",
          command: "codex",
          minimumVersion: "1.0.0"
        }
      ],
      runCommand: () => ({
        stdout: [
          JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
          JSON.stringify({ type: "turn.started" })
        ].join("\n"),
        stderr: "",
        status: 0
      })
    })

    const result = await service.runProvider({
      provider: "codex",
      model: "gpt-5.1",
      prompt: "Implement the first task",
      worktreeRootPath: "/tmp/teamcow-worktree",
      worktreeId: "worktree-1",
      conversationId: "conversation-1",
      runId: "run-1"
    })

    expect(result.status).toBe("failed")
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "run.progress",
      "run.error"
    ])
    expect(result.events.at(-1)).toMatchObject({
      type: "run.error",
      status: "failed",
      payload: expect.objectContaining({
        message: "codex exec exited without a terminal JSONL event",
        worktreeId: "worktree-1",
        worktreeRootPath: "/tmp/teamcow-worktree"
      })
    })
  })

  it("starts from cached unknown providers and refreshes into structured readiness results", async () => {
    const service = createProviderRuntimeService({
      now: () => "2026-05-15T10:10:00.000Z",
      providers: [
        {
          kind: "codex",
          command: "codex",
          minimumVersion: "1.2.0",
          detect: async () => ({
            availability: "ready",
            version: "1.2.1"
          })
        },
        {
          kind: "claude",
          command: "claude",
          minimumVersion: "1.0.0",
          detect: async () => ({
            availability: "unavailable",
            version: "0.9.0",
            issues: [
              {
                kind: "version-unsupported",
                params: {
                  version: "0.9.0",
                  minimum: "1.0.0"
                }
              }
            ]
          })
        },
        {
          kind: "opencode",
          command: "opencode",
          minimumVersion: "0.8.0",
          detect: async () => ({
            availability: "unknown",
            issues: [
              {
                kind: "auth-missing"
              }
            ]
          })
        }
      ]
    })

    const cached = service.getSnapshot()
    expect(cached.providers.map((provider) => provider.availability)).toEqual(["unknown", "unknown", "unknown"])
    expect(cached.providers.map((provider) => provider.badge.kind)).toEqual(["codex", "claude", "opencode"])

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.checkedAt).toBe("2026-05-15T10:10:00.000Z")
    expect(refreshed.providers).toMatchObject([
      {
        kind: "codex",
        availability: "ready",
        badge: {
          kind: "codex",
          status: "ready"
        },
        version: "1.2.1",
        issues: []
      },
      {
        kind: "claude",
        availability: "unavailable",
        badge: {
          kind: "claude",
          status: "unavailable"
        },
        issues: [
          {
            kind: "version-unsupported",
            params: {
              version: "0.9.0",
              minimum: "1.0.0"
            }
          }
        ]
      },
      {
        kind: "opencode",
        availability: "unknown",
        badge: {
          kind: "opencode",
          status: "unknown"
        },
        issues: [
          {
            kind: "auth-missing"
          }
        ]
      }
    ])
  })

  it("marks missing auth as unavailable and reports network failures explicitly", async () => {
    const commandResults = new Map([
      [
        "codex --version",
        {
          stdout: "codex 1.2.3",
          stderr: "",
          status: 0
        }
      ],
      [
        "claude --version",
        {
          stdout: "claude 1.1.0",
          stderr: "",
          status: 0
        }
      ],
      [
        "opencode --version",
        {
          stdout: "opencode 0.8.1",
          stderr: "",
          status: 0
        }
      ],
      [
        "codex login status",
        {
          stdout: "You are not logged in.",
          stderr: "",
          status: 0
        }
      ],
      [
        "claude auth status",
        {
          stdout: "",
          stderr: "network timeout while checking auth status",
          status: 1,
          error: new Error("network timeout")
        }
      ],
      [
        "opencode providers list",
        {
          stdout: "\n┌  Credentials ~/.local/share/opencode/auth.json\n│\n└  0 credentials\n",
          stderr: "",
          status: 0
        }
      ]
    ])

    const service = createProviderRuntimeService({
      now: () => "2026-05-15T11:40:00.000Z",
      env: {},
      providers: [
        {
          kind: "codex",
          command: "codex",
          minimumVersion: "0.0.0",
          authStatusArgs: ["login", "status"],
          networkProbeUrls: ["https://api.openai.com/"],
          authEnvKeys: ["OPENAI_API_KEY"]
        },
        {
          kind: "claude",
          command: "claude",
          minimumVersion: "0.0.0",
          authStatusArgs: ["auth", "status"],
          networkProbeUrls: ["https://api.anthropic.com/"],
          authEnvKeys: ["ANTHROPIC_API_KEY"]
        },
        {
          kind: "opencode",
          command: "opencode",
          minimumVersion: "0.8.0",
          authStatusArgs: ["providers", "list"],
          authEnvKeys: ["OPENCODE_API_KEY"]
        }
      ],
      runCommand: (command, args) => {
        const result = commandResults.get(`${command} ${args.join(" ")}`)
        if (!result) {
          throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
        }

        return result
      },
      fetchUrl: async (url) => {
        if (url === "https://api.anthropic.com/") {
          throw new Error("fetch failed timeout")
        }

        throw new Error(`unexpected url: ${url}`)
      }
    })

    const cached = service.getSnapshot()
    expect(cached.checkedAt).toBe("")

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.checkedAt).toBe("2026-05-15T11:40:00.000Z")
    expect(refreshed.providers).toMatchObject([
      {
        kind: "codex",
        availability: "unavailable",
        issues: [{ kind: "auth-missing" }]
      },
      {
        kind: "claude",
        availability: "unavailable",
        issues: [{ kind: "network-unreachable" }]
      },
      {
        kind: "opencode",
        availability: "unavailable",
        issues: [{ kind: "auth-missing" }]
      }
    ])
  })

  it("treats authenticated providers as ready when the direct API endpoint probe succeeds", async () => {
    const commandResults = new Map([
      [
        "codex --version",
        {
          stdout: "codex 1.2.3",
          stderr: "",
          status: 0
        }
      ],
      [
        "codex login status",
        {
          stdout: "Logged in using an API key - sk-***",
          stderr: "",
          status: 0
        }
      ]
    ])

    const service = createProviderRuntimeService({
      now: () => "2026-05-15T11:50:00.000Z",
      providers: [
        {
          kind: "codex",
          command: "codex",
          minimumVersion: "1.0.0",
          authStatusArgs: ["login", "status"],
          networkProbeUrls: ["https://api.openai.com/"],
          authEnvKeys: ["OPENAI_API_KEY"]
        }
      ],
      runCommand: (command, args) => {
        const result = commandResults.get(`${command} ${args.join(" ")}`)
        if (!result) {
          throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
        }

        return result
      },
      fetchUrl: async () => undefined
    })

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.providers).toMatchObject([
      {
        kind: "codex",
        availability: "ready",
        issues: []
      }
    ])
  })

  it("keeps authenticated CLI providers ready when the direct API endpoint probe times out", async () => {
    const commandResults = new Map([
      [
        "codex --version",
        {
          stdout: "codex-cli 0.142.4",
          stderr: "",
          status: 0
        }
      ],
      [
        "codex login status",
        {
          stdout: "Logged in using ChatGPT",
          stderr: "",
          status: 0
        }
      ],
      [
        "claude --version",
        {
          stdout: "2.1.196 (Claude Code)",
          stderr: "",
          status: 0
        }
      ],
      [
        "claude auth status",
        {
          stdout: JSON.stringify({
            loggedIn: true,
            authMethod: "oauth_token",
            apiProvider: "firstParty"
          }),
          stderr: "",
          status: 0
        }
      ]
    ])

    const service = createProviderRuntimeService({
      now: () => "2026-06-30T01:47:13.000Z",
      providers: [
        {
          kind: "codex",
          command: "codex",
          minimumVersion: "0.0.0",
          authStatusArgs: ["login", "status"],
          networkProbeUrls: ["https://api.openai.com/"],
          authEnvKeys: ["OPENAI_API_KEY"]
        },
        {
          kind: "claude",
          command: "claude",
          minimumVersion: "0.0.0",
          authStatusArgs: ["auth", "status"],
          networkProbeUrls: ["https://api.anthropic.com/"],
          authEnvKeys: ["ANTHROPIC_API_KEY"]
        }
      ],
      runCommand: (command, args) => {
        const result = commandResults.get(`${command} ${args.join(" ")}`)
        if (!result) {
          throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
        }

        return result
      },
      fetchUrl: async () => {
        throw new Error("TimeoutError: The operation was aborted due to timeout")
      }
    })

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.providers).toMatchObject([
      {
        kind: "codex",
        availability: "ready",
        issues: []
      },
      {
        kind: "claude",
        availability: "ready",
        issues: []
      }
    ])
  })

  it("keeps default Codex ready when CLI auth succeeds but the direct API endpoint probe fails", async () => {
    const service = createProviderRuntimeService({
      now: () => "2026-05-19T19:40:00.000Z",
      env: {},
      homeDir: "/tmp/teamcow-home",
      pathExists: () => false,
      runCommand: (command, args) => {
        const key = `${command} ${args.join(" ")}`
        if (key === "codex --version") {
          return {
            stdout: "codex-cli 0.131.0",
            stderr: "",
            status: 0
          }
        }

        if (key === "codex login status") {
          return {
            stdout: "Logged in using an API key - sk-third-party",
            stderr: "",
            status: 0
          }
        }

        return {
          stdout: "",
          stderr: `${command} unavailable in test`,
          status: 1,
          error: new Error(`${command} unavailable in test`)
        }
      },
      fetchUrl: async () => {
        throw new Error("fetch failed timeout")
      }
    })

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.providers[0]).toMatchObject({
      kind: "codex",
      availability: "ready",
      issues: []
    })
  })

  it("treats default Codex as ready from a configured custom base URL when the official probe fails", async () => {
    const homeDir = "/tmp/teamcow-home"
    const service = createProviderRuntimeService({
      now: () => "2026-05-24T10:00:00.000Z",
      env: {},
      homeDir,
      pathExists: (path) =>
        path === `${homeDir}/.codex/auth.json` ||
        path === `${homeDir}/.codex/config.toml`,
      readFile: (path) => {
        if (path === `${homeDir}/.codex/config.toml`) {
          return [
            "model_provider = \"Modelgate\"",
            "",
            "[model_providers.Modelgate]",
            "name = \"Modelgate\"",
            "base_url = \"https://mg.aid.pub/codex-proxy\"",
            "wire_api = \"responses\""
          ].join("\n")
        }

        return JSON.stringify({ OPENAI_API_KEY: "configured" })
      },
      runCommand: (command, args) => {
        const key = `${command} ${args.join(" ")}`
        if (key === "codex --version") {
          return {
            stdout: "codex-cli 0.131.0",
            stderr: "",
            status: 0
          }
        }

        if (key === "codex login status") {
          return {
            stdout: "Logged in using an API key - sk-third-party",
            stderr: "",
            status: 0
          }
        }

        return {
          stdout: "",
          stderr: `${command} unavailable in test`,
          status: 1,
          error: new Error(`${command} unavailable in test`)
        }
      },
      fetchUrl: async () => {
        throw new Error("fetch failed timeout")
      }
    })

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.providers[0]).toMatchObject({
      kind: "codex",
      availability: "ready",
      issues: []
    })
  })

  it("treats default Claude Code as ready from local config auth when the official probe fails", async () => {
    const homeDir = "/tmp/teamcow-home"
    const service = createProviderRuntimeService({
      now: () => "2026-05-24T10:05:00.000Z",
      env: {},
      homeDir,
      pathExists: (path) => path === `${homeDir}/.claude/config.json`,
      readFile: () => JSON.stringify({ primaryApiKey: "configured" }),
      runCommand: (command, args) => {
        const key = `${command} ${args.join(" ")}`
        if (key === "codex --version" || key === "opencode --version" || key === "cursor-agent --version") {
          return {
            stdout: "",
            stderr: `${command} unavailable in test`,
            status: 1,
            error: new Error(`${command} unavailable in test`)
          }
        }

        if (key === "claude --version") {
          return {
            stdout: "1.0.94 (Claude Code)",
            stderr: "",
            status: 0
          }
        }

        if (key === "claude auth status") {
          return {
            stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }),
            stderr: "",
            status: 0
          }
        }

        throw new Error(`unexpected command: ${key}`)
      },
      fetchUrl: async () => {
        throw new Error("fetch failed timeout")
      }
    })

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.providers[1]).toMatchObject({
      kind: "claude",
      availability: "ready",
      issues: []
    })
  })

  it("keeps authenticated providers ready when the direct API endpoint probe fails", async () => {
    const commandResults = new Map([
      [
        "codex --version",
        {
          stdout: "codex 1.2.3",
          stderr: "",
          status: 0
        }
      ],
      [
        "codex login status",
        {
          stdout: "Logged in using an API key - sk-***",
          stderr: "",
          status: 0
        }
      ]
    ])

    const service = createProviderRuntimeService({
      now: () => "2026-05-15T11:55:00.000Z",
      providers: [
        {
          kind: "codex",
          command: "codex",
          minimumVersion: "1.0.0",
          authStatusArgs: ["login", "status"],
          networkProbeUrls: ["https://api.openai.com/"],
          authEnvKeys: ["OPENAI_API_KEY"]
        }
      ],
      runCommand: (command, args) => {
        const result = commandResults.get(`${command} ${args.join(" ")}`)
        if (!result) {
          throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
        }

        return result
      },
      fetchUrl: async () => {
        throw new Error("fetch failed timeout")
      }
    })

    const refreshed = await service.refreshSnapshot()
    expect(refreshed.providers).toMatchObject([
      {
        kind: "codex",
        availability: "ready",
        issues: []
      }
    ])
  })

  describe("listProviderModels", () => {
    it("lists Cursor models from cursor-agent --list-models", async () => {
      const runCommand = vi.fn(() => ({
        stdout: [
          "Available models",
          "",
          "auto - Auto (current, default)",
          "composer-2.5 - Composer 2.5",
          "gpt-5.6-sol-high - GPT-5.6 Sol High"
        ].join("\n"),
        stderr: "",
        status: 0
      }))
      const service = createProviderRuntimeService({
        providers: [{ kind: "cursor", command: "cursor-agent", minimumVersion: "0.0.0" }],
        runCommand
      })

      const models = await service.listProviderModels("cursor")

      expect(runCommand).toHaveBeenCalledWith("cursor-agent", ["--list-models"])
      expect(models.map((model) => model.id)).toEqual(["auto", "composer-2.5", "gpt-5.6-sol-high"])
      expect(models[0]).toMatchObject({ label: "Auto", source: "native-list", isDefault: true })
    })

    it("lists OpenCode models from the native opencode models command", async () => {
      const runCommand = vi.fn(() => ({
        stdout: [
          "opencode/big-pickle",
          "opencode/deepseek-v4-flash-free",
          "opencode/nemotron-3-super-free",
          "modelget/GPT-5.4"
        ].join("\n"),
        stderr: "",
        status: 0
      }))
      const service = createProviderRuntimeService({
        providers: [
          {
            kind: "opencode",
            command: "opencode",
            minimumVersion: "0.0.0"
          }
        ],
        runCommand
      })

      const models = await service.listProviderModels("opencode")

      expect(runCommand).toHaveBeenCalledWith("opencode", ["models", "--refresh"])
      expect(models.map((model) => model.id)).toEqual([
        "opencode/big-pickle",
        "opencode/deepseek-v4-flash-free",
        "opencode/nemotron-3-super-free",
        "modelget/GPT-5.4"
      ])
      expect(models[0]).toMatchObject({
        label: "big-pickle",
        source: "native-list"
      })
    })

    it("derives the current Codex model from config.toml", async () => {
      const homeDir = "/tmp/teamcow-home"
      const service = createProviderRuntimeService({
        env: {},
        homeDir,
        pathExists: (path) => path === `${homeDir}/.codex/config.toml`,
        readFile: () => [
          'model_provider = "Modelgate"',
          'model = "gpt-5.5"',
          "",
          "[model_providers.Modelgate]",
          'base_url = "https://mg.aid.pub/codex-proxy"'
        ].join("\n"),
        runCommand: vi.fn((_command: string, args: string[]) => {
          if (args[0] === "debug") {
            return { stdout: "", stderr: "", status: 1 }
          }
          throw new Error("unexpected command")
        })
      })

      const models = await service.listProviderModels("codex")

      expect(models[0]).toMatchObject({
        id: "gpt-5.5",
        label: "gpt-5.5",
        source: "config-derived",
        isDefault: true
      })
      expect(models[0].detail).toContain("Modelgate")
    })

    it("derives Claude models from ANTHROPIC_MODEL before falling back to static options", async () => {
      const service = createProviderRuntimeService({
        env: {
          ANTHROPIC_MODEL: "claude-sonnet-4-5-20260101"
        },
        runCommand: vi.fn(() => {
          throw new Error("unexpected command")
        })
      })

      const models = await service.listProviderModels("claude")

      expect(models[0]).toMatchObject({
        id: "claude-sonnet-4-5-20260101",
        label: "claude-sonnet-4-5-20260101",
        source: "config-derived",
        isDefault: true
      })
      expect(models.some((model) => model.id === "claude-opus-5")).toBe(true)
      expect(models.some((model) => model.id === "claude-opus-4-8")).toBe(true)
    })
  })

  describe("Cursor ACP provider", () => {
    it("normalizes ACP messages, reasoning, tools, approvals, and terminal state", async () => {
      const runCursorAcp = vi.fn(async (input: CursorAcpRunInput) => {
        await input.onNotification?.({
          method: "teamcow/session_ready",
          params: { sessionId: "cursor-session", resumed: false, mode: "agent", model: input.model }
        })
        await input.onNotification?.({
          method: "session/update",
          params: {
            sessionId: "cursor-session",
            update: {
              sessionUpdate: "agent_message_chunk",
              messageId: "message-1",
              content: { type: "text", text: "Cursor answer" }
            }
          }
        })
        await input.onNotification?.({
          method: "session/update",
          params: {
            sessionId: "cursor-session",
            update: {
              sessionUpdate: "agent_thought_chunk",
              messageId: "thought-1",
              content: { type: "text", text: "Checking files" }
            }
          }
        })
        await input.onNotification?.({
          method: "session/update",
          params: {
            sessionId: "cursor-session",
            update: { sessionUpdate: "tool_call", toolCallId: "tool-1", title: "Edit file", kind: "edit", status: "pending" }
          }
        })
        await input.onNotification?.({
          method: "session/update",
          params: {
            sessionId: "cursor-session",
            update: { sessionUpdate: "tool_call_update", toolCallId: "tool-1", status: "completed" }
          }
        })
        await input.onNotification?.({
          method: "session/request_permission",
          params: { sessionId: "cursor-session", toolCall: { toolCallId: "tool-2", title: "Run tests", kind: "execute" }, options: [] }
        })
        await input.onNotification?.({
          method: "teamcow/permission_resolved",
          params: { sessionId: "cursor-session", toolCallId: "tool-2", selectedOptionKind: "allow_once" }
        })
        await input.onNotification?.({
          method: "cursor/update_todos",
          params: { sessionId: "cursor-session", todos: [{ id: "todo-1", content: "Test", status: "completed" }], merge: true }
        })
        return { sessionId: "cursor-session", status: "completed" as const, stopReason: "end_turn", stderr: "" }
      })
      const service = createProviderRuntimeService({
        providers: [{ kind: "cursor", command: "/fake/cursor-agent", minimumVersion: "0.0.0" }],
        runCursorAcp
      })

      const result = await service.runProvider({
        provider: "cursor",
        model: "composer-2.5",
        accessMode: "worktree-write",
        prompt: "Implement it",
        worktreeRootPath: "/tmp/teamcow-cursor-worktree",
        worktreeId: "worktree-cursor",
        conversationId: "conversation-cursor",
        runId: "run-cursor"
      })

      expect(result.status, JSON.stringify(result, null, 2)).toBe("completed")
      expect(result.sessionId).toBe("cursor-session")
      expect(result.events.map((event) => event.type)).toEqual([
        "run.started",
        "run.message.delta",
        "run.reasoning.delta",
        "run.tool.started",
        "run.tool.completed",
        "run.approval.requested",
        "run.approval.resolved",
        "run.progress",
        "run.reasoning.completed",
        "run.message.completed",
        "run.completed"
      ])
      expect(result.events.at(-2)).toMatchObject({
        type: "run.message.completed",
        payload: expect.objectContaining({ text: "Cursor answer", authoritative: true })
      })
    })

    it("requires Cursor's ACP capability and trusts its native logged-in status", async () => {
      const runCommand = vi.fn((_command: string, args: string[]) => {
        const key = args.join(" ")
        if (key === "--version") return { stdout: "2026.08.11-e8db854", stderr: "", status: 0 }
        if (key === "--sandbox enabled acp --help") return { stdout: "Start the Cursor Agent as an ACP server", stderr: "", status: 0 }
        if (key === "status") return { stdout: "Logged in as cursor-user", stderr: "", status: 0 }
        throw new Error(`unexpected command: ${key}`)
      })
      const service = createProviderRuntimeService({
        providers: [{
          kind: "cursor",
          command: "cursor-agent",
          minimumVersion: "0.0.0",
          authStatusArgs: ["status"],
          capabilityProbe: { args: ["--sandbox", "enabled", "acp", "--help"], name: "ACP sandbox" }
        }],
        runCommand
      })

      expect(await service.refreshSnapshot()).toMatchObject({
        providers: [{ kind: "cursor", availability: "ready", issues: [] }]
      })
    })

    it("reports an installed Cursor CLI without ACP as capability-missing", async () => {
      const service = createProviderRuntimeService({
        providers: [{
          kind: "cursor",
          command: "cursor-agent",
          minimumVersion: "0.0.0",
          authStatusArgs: ["status"],
          capabilityProbe: { args: ["--sandbox", "enabled", "acp", "--help"], name: "ACP sandbox" }
        }],
        runCommand: vi.fn((_command: string, args: string[]) => args[0] === "--version"
          ? { stdout: "2026.01.01", stderr: "", status: 0 }
          : { stdout: "", stderr: "unknown command acp", status: 1 })
      })

      expect(await service.refreshSnapshot()).toMatchObject({
        providers: [{
          kind: "cursor",
          availability: "unavailable",
          issues: [{ kind: "capability-missing", params: { capability: "ACP sandbox" } }]
        }]
      })
    })

    it("parses current/default markers without keeping them in the model label", () => {
      expect(parseCursorModelList("auto - Auto (current, default)\ncomposer-2.5 - Composer 2.5"))
        .toMatchObject([
          { id: "auto", label: "Auto", isDefault: true },
          { id: "composer-2.5", label: "Composer 2.5", isDefault: false }
        ])
    })
  })
})
