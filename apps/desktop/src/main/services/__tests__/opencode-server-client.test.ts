// @vitest-environment node
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { runOpenCodeServerTurn } from "../opencode-server-client"

const createFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "teamcow-opencode-server-fixture-"))
  const commandPath = join(directory, "fake-opencode")
  writeFileSync(commandPath, [
    "#!/usr/bin/env node",
    "const http = require('node:http')",
    "const args = process.argv.slice(2)",
    "const port = Number(args[args.indexOf('--port') + 1])",
    "let eventResponse",
    "let shouldInterrupt = false",
    "const send = (event) => eventResponse?.write(`data: ${JSON.stringify(event)}\\n\\n`)",
    "const readBody = (request) => new Promise((resolve) => {",
    "  let body = ''",
    "  request.on('data', (chunk) => { body += chunk })",
    "  request.on('end', () => resolve(body ? JSON.parse(body) : {}))",
    "})",
    "const server = http.createServer(async (request, response) => {",
    "  const url = new URL(request.url, `http://127.0.0.1:${port}`)",
    "  if (request.method === 'GET' && url.pathname === '/global/health') {",
    "    response.setHeader('content-type', 'application/json')",
    "    return response.end(JSON.stringify({ healthy: true }))",
    "  }",
    "  if (request.method === 'POST' && url.pathname === '/session') {",
    "    await readBody(request)",
    "    response.setHeader('content-type', 'application/json')",
    "    return response.end(JSON.stringify({ id: 'session-fixture' }))",
    "  }",
    "  if (request.method === 'PATCH' && url.pathname === '/session/session-fixture') {",
    "    const body = await readBody(request)",
    "    response.setHeader('content-type', 'application/json')",
    "    return response.end(JSON.stringify({ id: 'session-fixture', permission: body.permission }))",
    "  }",
    "  if (request.method === 'GET' && url.pathname === '/event') {",
    "    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })",
    "    response.flushHeaders()",
    "    eventResponse = response",
    "    return",
    "  }",
    "  if (request.method === 'POST' && url.pathname.endsWith('/prompt_async')) {",
    "    const body = await readBody(request)",
    "    response.writeHead(204)",
    "    response.end()",
    "    setTimeout(() => {",
    "      if (body.agent) send({ type: 'teamcow.test.agent', properties: { agent: body.agent } })",
    "      send({ type: 'message.part.updated', properties: { sessionID: 'session-fixture', part: { id: 'text-1', messageID: 'message-1', type: 'text', text: '' } } })",
    "      send({ type: 'message.part.delta', properties: { sessionID: 'session-fixture', messageID: 'message-1', partID: 'text-1', field: 'text', delta: body.parts[0].text } })",
    "      send({ type: 'message.part.updated', properties: { sessionID: 'session-fixture', part: { id: 'text-1', messageID: 'message-1', type: 'text', text: body.parts[0].text, time: { start: 1, end: 2 } } } })",
    "      if (!shouldInterrupt) send({ type: 'session.idle', properties: { sessionID: 'session-fixture' } })",
    "    }, 10)",
    "    return",
    "  }",
    "  if (request.method === 'POST' && url.pathname.endsWith('/abort')) {",
    "    shouldInterrupt = true",
    "    response.setHeader('content-type', 'application/json')",
    "    response.end('true')",
    "    setTimeout(() => send({ type: 'session.idle', properties: { sessionID: 'session-fixture' } }), 5)",
    "    return",
    "  }",
    "  response.writeHead(404)",
    "  response.end()",
    "})",
    "server.listen(port, '127.0.0.1')",
    "process.on('SIGTERM', () => server.close(() => process.exit(0)))"
  ].join("\n"))
  chmodSync(commandPath, 0o755)
  return { directory, commandPath }
}

describe("runOpenCodeServerTurn", () => {
  it("starts the local server, subscribes to SSE, and completes an async prompt", async () => {
    const fixture = createFixture()
    const events: string[] = []
    try {
      const result = await runOpenCodeServerTurn({
        command: fixture.commandPath,
        cwd: fixture.directory,
        prompt: "fixture answer",
        model: "openai/gpt-5.1",
        sessionId: "session-fixture",
        permission: [{ permission: "*", pattern: "*", action: "allow" }],
        onEvent: (event) => {
          events.push(event.type)
        }
      })

      expect(result).toMatchObject({
        sessionId: "session-fixture",
        status: "completed",
        stderr: ""
      })
      expect(events).toEqual([
        "message.part.updated",
        "message.part.delta",
        "message.part.updated",
        "session.idle"
      ])
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
    }
  })

  it("uses the native session abort endpoint when cancellation is requested early", async () => {
    const fixture = createFixture()
    try {
      const result = await runOpenCodeServerTurn({
        command: fixture.commandPath,
        cwd: fixture.directory,
        prompt: "cancel fixture",
        onControl: ({ abort }) => {
          void abort()
        }
      })

      expect(result.status).toBe("interrupted")
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
    }
  })

  it("passes a slash-selected agent to prompt_async", async () => {
    const fixture = createFixture()
    const events: Array<{ type: string; properties?: Record<string, unknown> }> = []
    try {
      const result = await runOpenCodeServerTurn({
        command: fixture.commandPath,
        cwd: fixture.directory,
        prompt: "review the patch",
        agent: "reviewer",
        onEvent: (event) => {
          events.push(event)
        }
      })

      expect(result.status).toBe("completed")
      expect(events).toContainEqual(expect.objectContaining({
        type: "teamcow.test.agent",
        properties: { agent: "reviewer" }
      }))
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
    }
  })
})
