// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"
import { PROVIDER_MODEL_CATALOG, type ProviderKind } from "@shared/index"
import { createProjectService } from "../../project-service"
import { createProviderRuntimeService } from "../provider-runtime-service"

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jg1sAAAAASUVORK5CYII="
const largePng = Buffer.concat([Buffer.from(png, "base64"), Buffer.alloc(2048)]).toString("base64")
const providers: ProviderKind[] = ["codex", "claude", "cursor", "opencode"]

const fixture = async (provider: ProviderKind) => {
  const directory = mkdtempSync(join(tmpdir(), "teamcow-provider-images-"))
  const repo = join(directory, "repo")
  mkdirSync(join(repo, ".git"), { recursive: true })
  writeFileSync(join(repo, ".git/HEAD"), "ref: refs/heads/main\n")
  const service = createProjectService({ userDataPath: join(directory, "data"), pickProjectDirectory: async () => null,
    confirmGitInit: async () => false, gitBinaryAvailable: () => false, initializeGit: () => null })
  const imported = await service.importProject({ directoryPath: repo })
  if (imported.status !== "imported") throw new Error("Import failed")
  const model = PROVIDER_MODEL_CATALOG[provider][0].id
  const created = await service.createConversation({ projectId: imported.project.id, providerKind: provider, model, executionTarget: { type: "default" } })
  if (created.status !== "created") throw new Error("Conversation failed")
  const sent = await service.sendConversationMessage({ conversationId: created.conversation.id, content: "Generate a garden" })
  if (sent.status !== "accepted") throw new Error("Message failed")
  const run = sent.timeline.runs[0]
  return { service, directory, repo, run, model, conversationId: created.conversation.id }
}

describe("provider images from transport through persistence and chat", () => {
  it.each([
    ["codex", "native", 1], ["codex", "mcp", 1], ["cursor", "native", 1], ["cursor", "acp", 1],
    ["cursor", "tool", 2], ["claude", "mcp", 2], ["opencode", "tool", 2], ["opencode", "file", 1]
  ] as const)("supports %s %s image output", async (provider, format, count) => {
    const f = await fixture(provider)
    const savedPath = join(f.repo, "garden (1).png")
    writeFileSync(savedPath, Buffer.from(png, "base64"))
    const image = { type: "image", data: largePng, mimeType: "image/png" }
    const secondImage = { type: "image", data: png, mimeType: "image/png" }
    const file = { type: "file", id: "file-1", mime: "image/png", url: pathToFileURL(savedPath).href }
    try {
      const runtime = createProviderRuntimeService({
        providers: providers.map((kind) => ({ kind, command: "/usr/bin/true", minimumVersion: "0.0.0" })),
        runCodexAppServer: async (input) => {
          await input.onNotification?.({ method: "item/completed", params: { item: format === "native"
            ? { type: "imageGeneration", id: "image-1", result: largePng }
            : { type: "mcpToolCall", id: "tool-1", result: { content: [image] } } } })
          await input.onNotification?.({ method: "turn/completed", params: { turn: { id: "turn-1", status: "completed" } } })
          return { threadId: "thread-1", turnId: "turn-1", status: "completed", stderr: "" }
        },
        runCursorAcp: async (input) => {
          if (format === "native") await input.onNotification?.({ method: "cursor/generate_image", params: { toolCallId: "tool-1", filePath: "garden (1).png" } })
          else if (format === "acp") await input.onNotification?.({ method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk", content: image } } })
          else {
            for (let index = 0; index < 2; index += 1) await input.onNotification?.({ method: "session/update", params: { update: {
              sessionUpdate: "tool_call_update", toolCallId: "tool-1", status: "completed",
              content: [{ type: "content", content: image }, { type: "content", content: secondImage }]
            } } })
          }
          return { sessionId: "session-1", stopReason: "end_turn", status: "completed", stderr: "" }
        },
        runOpenCodeServer: async (input) => {
          await input.onEvent?.({ type: "message.updated", properties: { info: { id: "user-1", role: "user" } } })
          await input.onEvent?.({ type: "message.part.updated", properties: { part: { ...file, messageID: "user-1" } } })
          await input.onEvent?.({ type: "message.updated", properties: { info: { id: "assistant-1", role: "assistant" } } })
          await input.onEvent?.({ type: "message.part.updated", properties: { part: format === "file"
            ? { ...file, messageID: "assistant-1" }
            : { type: "tool", id: "tool-1", messageID: "assistant-1", state: { status: "completed", output: "Generated images",
                attachments: [file, { ...file, id: "file-2", url: `data:image/png;base64,${largePng}` }] } } } })
          await input.onEvent?.({ type: "session.idle", properties: { sessionID: "session-1" } })
          return { sessionId: "session-1", status: "completed", stderr: "" }
        },
        runCommand: () => ({ status: 0, stderr: "", stdout: [
          JSON.stringify({ type: "user", message: { content: [image] } }),
          JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tool-1", content: [
            { type: "text", text: "Generated two pictures" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: largePng } },
            { type: "image", source: { type: "base64", media_type: "image/png", data: png } }
          ] }] } }),
          JSON.stringify({ type: "result", result: "Done", is_error: false })
        ].join("\n") })
      })
      await runtime.runProvider({ provider, model: f.model, prompt: "Generate a garden", worktreeRootPath: f.repo,
        worktreeId: f.run.worktreeId, conversationId: f.conversationId, runId: f.run.id,
        onEvent: (event) => { f.service.appendRunEvent({ ...event, conversationId: f.conversationId, runId: f.run.id }) }
      })
      rmSync(savedPath)
      const result = f.service.getConversationTimelinePage({ conversationId: f.conversationId, limit: 20 })
      if (result.status !== "ok") throw new Error("History failed")
      expect(result.timeline.runs[0].status).toBe("completed")
      expect(result.timeline.artifacts).toHaveLength(count)
      expect(JSON.stringify(result.timeline)).not.toContain(largePng)
      for (const artifact of result.timeline.artifacts) {
        const imageFile = f.service.resolveConversationAttachment(artifact.uri!)
        expect(imageFile?.mimeType).toBe("image/png")
        expect([png, largePng]).toContain(readFileSync(imageFile!.path).toString("base64"))
      }
    } finally {
      f.service.close()
      rmSync(f.directory, { recursive: true, force: true })
    }
  })

  it.each(providers)("persists %s local Markdown image references for replay", async (provider) => {
    const f = await fixture(provider)
    try {
      writeFileSync(join(f.repo, "garden (1).png"), Buffer.from(png, "base64"))
      const event = f.service.appendRunEvent({ conversationId: f.conversationId, runId: f.run.id, type: "run.message.completed",
        payload: { text: "Here is the garden: ![lotus](<garden (1).png>)", phase: "final", authoritative: true } })
      expect(event.payload.text).toContain("![lotus](teamcow-attachment://conversation/")
      rmSync(join(f.repo, "garden (1).png"))
      const timeline = f.service.getConversationTimeline(f.conversationId)
      if (timeline.status !== "ok") throw new Error("History failed")
      expect(timeline.timeline.artifacts).toHaveLength(1)
      expect(f.service.resolveConversationAttachment(timeline.timeline.artifacts[0].uri!)).not.toBeNull()
    } finally {
      f.service.close()
      rmSync(f.directory, { recursive: true, force: true })
    }
  })
})
