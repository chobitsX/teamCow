// @vitest-environment node
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createCursorAcpSpawnSpec, resolveCursorAcpModelValue, runCursorAcpTurn } from "../cursor-acp-client"

const createFixture = (options: { includePlanMode?: boolean } = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "teamcow-cursor-acp-fixture-"))
  const commandPath = join(directory, "fake-cursor-agent")
  writeFileSync(commandPath, [
    "#!/usr/bin/env node",
    "const readline = require('node:readline')",
    "const send = (value) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\\n')",
    "const configOptions = [{ id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'default[]', options: [{ value: 'default[]', name: 'Auto' }, { value: 'composer-2.5[context=200k]', name: 'Composer 2.5' }] }]",
    `const modes = ${JSON.stringify({
      currentModeId: "agent",
      availableModes: [
        { id: "agent", name: "Agent" },
        ...(options.includePlanMode === false ? [] : [{ id: "plan", name: "Plan" }]),
        { id: "ask", name: "Ask" }
      ]
    })}`,
    "let promptRequestId",
    "const rl = readline.createInterface({ input: process.stdin })",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line)",
    "  if (message.id === 900 && message.result) {",
    "    send({ method: 'session/update', params: { sessionId: 'session-fixture', update: { sessionUpdate: 'tool_call_update', toolCallId: 'tool-1', status: message.result.outcome.outcome === 'selected' ? 'completed' : 'failed' } } })",
    "    send({ id: promptRequestId, result: { stopReason: 'end_turn' } })",
    "    return",
    "  }",
    "  if (message.method === 'initialize') send({ id: message.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true }, authMethods: [{ id: 'cursor_login', name: 'Cursor Login' }] } })",
    "  if (message.method === 'authenticate') send({ id: message.id, result: {} })",
    "  if (message.method === 'session/new') send({ id: message.id, result: { sessionId: 'session-fixture', modes, configOptions } })",
    "  if (message.method === 'session/load') {",
    "    send({ method: 'session/update', params: { sessionId: 'session-fixture', update: { sessionUpdate: 'agent_message_chunk', messageId: 'replay', content: { type: 'text', text: 'replayed history' } } } })",
    "    send({ id: message.id, result: { modes, configOptions } })",
    "  }",
    "  if (message.method === 'session/set_mode') send({ id: message.id, result: {} })",
    "  if (message.method === 'session/set_config_option') send({ id: message.id, result: { configOptions } })",
    "  if (message.method === 'session/prompt') {",
    "    promptRequestId = message.id",
    "    send({ method: 'session/update', params: { sessionId: 'session-fixture', update: { sessionUpdate: 'agent_message_chunk', messageId: 'answer', content: { type: 'text', text: 'fixture answer' } } } })",
    "    send({ method: 'session/update', params: { sessionId: 'session-fixture', update: { sessionUpdate: 'tool_call', toolCallId: 'tool-1', title: 'Edit fixture', kind: 'edit', status: 'pending', locations: [{ path: process.cwd() + '/fixture.ts' }] } } })",
    "    send({ id: 900, method: 'session/request_permission', params: { sessionId: 'session-fixture', toolCall: { toolCallId: 'tool-1', title: 'Edit fixture', kind: 'edit', locations: [{ path: process.cwd() + '/fixture.ts' }] }, options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' }] } })",
    "  }",
    "})"
  ].join("\n"))
  chmodSync(commandPath, 0o755)
  return { directory, commandPath }
}

describe("runCursorAcpTurn", () => {
  it("creates an ACP session, selects the Cursor model, and streams permission-aware updates", async () => {
    const fixture = createFixture()
    const notifications: Array<{ method: string; params: Record<string, unknown> }> = []
    try {
      const result = await runCursorAcpTurn({
        command: fixture.commandPath,
        cwd: fixture.directory,
        prompt: "fixture prompt",
        model: "composer-2.5",
        accessMode: "worktree-write",
        onNotification: (notification) => {
          notifications.push(notification)
        }
      })

      expect(result).toMatchObject({
        sessionId: "session-fixture",
        status: "completed",
        stopReason: "end_turn",
        stderr: ""
      })
      expect(notifications.map((notification) => notification.method)).toContain("session/update")
      expect(notifications).toContainEqual(expect.objectContaining({
        method: "teamcow/session_ready",
        params: expect.objectContaining({ modelValue: "composer-2.5[context=200k]" })
      }))
      expect(notifications).toContainEqual(expect.objectContaining({
        method: "teamcow/permission_resolved",
        params: expect.objectContaining({ selectedOptionKind: "allow_once" })
      }))
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
    }
  })

  it("suppresses session/load replay and rejects mutations in read-only mode", async () => {
    const fixture = createFixture()
    const notifications: Array<{ method: string; params: Record<string, unknown> }> = []
    try {
      const result = await runCursorAcpTurn({
        command: fixture.commandPath,
        cwd: fixture.directory,
        prompt: "continue",
        sessionId: "session-fixture",
        model: "auto",
        accessMode: "read-only",
        onNotification: (notification) => {
          notifications.push(notification)
        }
      })

      expect(result.status).toBe("completed")
      expect(JSON.stringify(notifications)).not.toContain("replayed history")
      expect(notifications).toContainEqual(expect.objectContaining({
        method: "teamcow/permission_resolved",
        params: expect.objectContaining({ selectedOptionKind: "reject_once" })
      }))
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
    }
  })

  it("queues cancellation requested before ACP initialization completes", async () => {
    const fixture = createFixture()
    try {
      const result = await runCursorAcpTurn({
        command: fixture.commandPath,
        cwd: fixture.directory,
        prompt: "cancel",
        accessMode: "worktree-write",
        onControl: ({ abort }) => void abort()
      })
      expect(result.status).toBe("interrupted")
      expect(result.stopReason).toBe("cancelled")
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
    }
  })

  it("selects a slash-requested ACP mode for the turn", async () => {
    const fixture = createFixture()
    const notifications: Array<{ method: string; params: Record<string, unknown> }> = []
    try {
      const result = await runCursorAcpTurn({
        command: fixture.commandPath,
        cwd: fixture.directory,
        prompt: "make a plan",
        accessMode: "worktree-write",
        mode: "plan",
        onNotification: (notification) => {
          notifications.push(notification)
        }
      })

      expect(result.status).toBe("completed")
      expect(notifications).toContainEqual(expect.objectContaining({
        method: "teamcow/session_ready",
        params: expect.objectContaining({ mode: "plan" })
      }))
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
    }
  })

  it("fails explicitly when a slash-requested ACP mode is unavailable", async () => {
    const fixture = createFixture({ includePlanMode: false })
    try {
      const result = await runCursorAcpTurn({
        command: fixture.commandPath,
        cwd: fixture.directory,
        prompt: "make a plan",
        accessMode: "worktree-write",
        mode: "plan"
      })

      expect(result.status).toBe("failed")
      expect(result.error).toBeInstanceOf(Error)
      expect((result.error as Error).message).toContain("does not support the requested plan mode")
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
    }
  })
})

describe("resolveCursorAcpModelValue", () => {
  it("matches a friendly Cursor model slug to its ACP config value", () => {
    expect(resolveCursorAcpModelValue("composer-2.5", [{
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "default[]",
      options: [{ value: "composer-2.5[context=200k,fast=false]", name: "Composer 2.5" }]
    }])).toBe("composer-2.5[context=200k,fast=false]")
  })
})

describe("createCursorAcpSpawnSpec", () => {
  it("layers macOS Seatbelt and Cursor sandbox for worktree-scoped runs", () => {
    const spec = createCursorAcpSpawnSpec("/usr/local/bin/cursor-agent", "/tmp/teamcow-worktree", "worktree-write", "darwin", true)
    expect(spec.command).toBe("/usr/bin/sandbox-exec")
    expect(spec.args.slice(-4)).toEqual(["/usr/local/bin/cursor-agent", "--sandbox", "enabled", "acp"])
    expect(spec.args[1]).toMatch(/\(allow file-write\* \(subpath "\/(?:private\/)?tmp\/teamcow-worktree"\)\)/)
  })

  it("does not wrap explicitly full-access runs in Seatbelt", () => {
    expect(createCursorAcpSpawnSpec("cursor-agent", "/tmp/teamcow-worktree", "full-access", "darwin", true))
      .toEqual({ command: "cursor-agent", args: ["--sandbox", "disabled", "acp"] })
  })

  it("keeps the workspace out of the writable Seatbelt paths in read-only mode", () => {
    const spec = createCursorAcpSpawnSpec("cursor-agent", "/workspace/read-only", "read-only", "darwin", true)
    expect(spec.command).toBe("/usr/bin/sandbox-exec")
    expect(spec.args[1]).not.toContain("/workspace/read-only")
  })

  it("pins a selected model at process startup as well as through ACP session config", () => {
    const spec = createCursorAcpSpawnSpec("cursor-agent", "/workspace", "worktree-write", "linux", false, "composer-2.5")
    expect(spec).toEqual({
      command: "cursor-agent",
      args: ["--sandbox", "enabled", "--model", "composer-2.5", "acp"]
    })
  })

  it("escapes line breaks in worktree paths before embedding them in a Seatbelt profile", () => {
    const spec = createCursorAcpSpawnSpec("cursor-agent", "/tmp/teamcow\nworktree", "worktree-write", "darwin", true)
    expect(spec.args[1]).toContain("teamcow\\nworktree")
    expect(spec.args[1]).not.toContain("teamcow\nworktree")
  })
})
