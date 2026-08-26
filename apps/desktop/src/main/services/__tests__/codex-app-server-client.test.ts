// @vitest-environment node
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { runCodexAppServerTurn } from "../codex-app-server-client"

const createFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "teamcow-codex-app-server-fixture-"))
  const commandPath = join(directory, "fake-codex")
  writeFileSync(commandPath, [
    "#!/usr/bin/env node",
    "const readline = require('node:readline')",
    "const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n')",
    "const rl = readline.createInterface({ input: process.stdin })",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line)",
    "  if (message.method === 'initialize') {",
    "    process.stderr.write(JSON.stringify({ method: message.method, params: message.params }) + '\\n')",
    "    send({ id: message.id, result: {} })",
    "  }",
    "  if (message.method === 'thread/start') send({ id: message.id, result: { thread: { id: 'thread-fixture' } } })",
    "  if (message.method === 'turn/start') {",
    "    process.stderr.write(JSON.stringify({ method: message.method, params: message.params }) + '\\n')",
    "    send({ id: message.id, result: { turn: { id: 'turn-fixture', status: 'inProgress' } } })",
    "    setTimeout(() => send({ method: 'turn/completed', params: { threadId: 'thread-fixture', turn: { id: 'turn-fixture', status: 'completed' } } }), 5)",
    "  }",
    "})"
  ].join("\n"))
  chmodSync(commandPath, 0o755)
  return { directory, commandPath }
}

describe("runCodexAppServerTurn", () => {
  it("maps plan and reasoning slash options to turn/start parameters", async () => {
    const fixture = createFixture()
    try {
      const result = await runCodexAppServerTurn({
        command: fixture.commandPath,
        cwd: fixture.directory,
        model: "gpt-5.5",
        prompt: "Design the implementation",
        options: { mode: "plan", reasoningEffort: "high" },
        sandboxPolicy: {
          type: "workspaceWrite",
          writableRoots: [fixture.directory],
          networkAccess: false
        }
      })

      expect(result.status).toBe("completed")
      const requests = result.stderr.trim().split("\n").map((line) => JSON.parse(line))
      expect(requests).toContainEqual({
        method: "initialize",
        params: expect.objectContaining({
          capabilities: {
            experimentalApi: true
          }
        })
      })
      expect(requests).toContainEqual({
        method: "turn/start",
        params: expect.objectContaining({
          model: "gpt-5.5",
          effort: "high",
          collaborationMode: {
            mode: "plan",
            settings: {
              model: "gpt-5.5",
              reasoning_effort: "high",
              developer_instructions: null
            }
          }
        })
      })
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
    }
  })
})
