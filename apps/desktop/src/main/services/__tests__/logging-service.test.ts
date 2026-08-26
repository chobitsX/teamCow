// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { createLoggingService } from "../logging-service"

describe("createLoggingService", () => {
  it("records structured entries and filters them by domain", () => {
    const service = createLoggingService({
      now: () => "2026-06-08T04:15:00.000Z"
    })

    service.error("worktree", "worktree.delete.failed", {
      projectId: "project-1",
      worktreeId: "worktree-1",
      errorCode: "WORKTREE_DELETE_FAILED",
      errorMessage: "git worktree remove failed"
    })
    service.warn("update", "update.check.failed", {
      updateStatus: "error",
      errorCode: "UPDATE_CHECK_FAILED"
    })

    expect(service.getEntries({ domain: "worktree" })).toEqual([
      {
        timestamp: "2026-06-08T04:15:00.000Z",
        level: "error",
        domain: "worktree",
        event: "worktree.delete.failed",
        context: {
          projectId: "project-1",
          worktreeId: "worktree-1",
          errorCode: "WORKTREE_DELETE_FAILED",
          errorMessage: "git worktree remove failed"
        }
      }
    ])
  })

  it("sends sanitized entries to sinks without leaking sensitive context", () => {
    const sink = vi.fn()
    const service = createLoggingService({
      now: () => "2026-06-08T04:16:00.000Z",
      sinks: [sink],
      maxStringLength: 24
    })

    service.error("provider", "provider.raw.failed", {
      providerKind: "codex",
      runId: "run-1",
      token: "secret-token",
      authorization: "Bearer secret",
      env: { OPENAI_API_KEY: "secret-key" },
      raw: { nested: "payload" },
      prompt: "Please inspect private project context",
      stderr: "stderr with private output",
      errorMessage: "token sk-live-1234567890 prompt: Please inspect private project context abcdefghijklmnopqrstuvwxyz"
    })

    const [entry] = service.getEntries()
    expect(JSON.stringify(entry)).not.toContain("secret-token")
    expect(JSON.stringify(entry)).not.toContain("secret-key")
    expect(JSON.stringify(entry)).not.toContain("private project context")
    expect(JSON.stringify(entry)).not.toContain("stderr with private output")
    expect(JSON.stringify(entry)).not.toContain("sk-live-1234567890")
    expect(entry.context).toMatchObject({
      providerKind: "codex",
      runId: "run-1"
    })
    expect(entry.context?.errorMessage).toBeDefined()
    expect(entry.context?.errorMessage).toContain("[redacted]")
    expect(entry.context?.errorMessage?.length).toBeLessThanOrEqual(27)
    expect(sink).toHaveBeenCalledWith(entry)
  })

  it("does not let sink failures break local logging", () => {
    const service = createLoggingService({
      now: () => "2026-06-08T04:17:00.000Z",
      sinks: [() => {
        throw new Error("remote sink unavailable")
      }]
    })

    expect(() => {
      service.info("app-startup", "startup.init.failed", {
        errorCode: "INTERNAL_ERROR"
      })
    }).not.toThrow()
    expect(service.getEntries()).toHaveLength(1)
  })
})
