import { describe, expect, it } from "vitest"
import {
  runEventSummarySchema,
  type CanonicalRunEventType,
  type ConversationTimeline,
  type ConversationRunStatus,
  type ProviderKind
} from "@shared/index"
import { buildChatRenderItems } from "./chat-render-model"

const run = (
  id: string,
  status: ConversationRunStatus = "running",
  startedAt = "2026-05-20T10:00:00.000Z",
  provider: ProviderKind = "codex"
): ConversationTimeline["runs"][number] => ({
  id,
  conversationId: "conversation-1",
  provider,
  model: provider === "codex" ? "gpt-5.1" : "claude-sonnet-4",
  worktreeId: "worktree-1",
  status,
  startedAt,
  completedAt: status === "running" ? null : startedAt,
  createdAt: startedAt,
  updatedAt: startedAt
})

const event = (
  id: string,
  runId: string,
  sequence: number,
  type: CanonicalRunEventType,
  payload: Record<string, unknown>,
  createdAt = "2026-05-20T10:00:01.000Z"
): ConversationTimeline["events"][number] => runEventSummarySchema.parse({
  id,
  conversationId: "conversation-1",
  runId,
  sequence,
  type,
  payload,
  createdAt
})

const timeline = (overrides: Partial<ConversationTimeline>): ConversationTimeline => ({
  conversationId: "conversation-1",
  messages: [],
  runs: [],
  events: [],
  artifacts: [],
  ...overrides
})

describe("buildChatRenderItems", () => {
  it.each(["codex", "claude", "cursor", "opencode"])("renders %s tool images once while retaining tool output", (provider) => {
    const images = ["image-1", "image-2"].map((id) => ({ status: "ready", attachment: {
      id, kind: "image", name: `${id}.png`, mimeType: "image/png", sizeBytes: 100,
      uri: `teamcow-attachment://conversation/conversation-1/${id}`
    } }))
    const items = buildChatRenderItems(timeline({ runs: [run("run-1", "completed")], events: [
      event("tools", "run-1", 1, "run.tool.completed", { provider, images, toolName: "generate_image", output: "Saved two images" }),
      event("replayed-tools", "run-1", 2, "run.tool.completed", { provider, images, toolName: "generate_image", output: "Saved two images" }),
      event("completed", "run-1", 3, "run.completed", {})
    ] }))
    expect(items.filter((item) => item.kind === "provider-image")).toHaveLength(2)
    expect(items.some((item) => item.kind === "tool-event" || item.kind === "raw-fallback")).toBe(true)
  })

  it("renders generated image events in order without reporting an image-only turn as empty", () => {
    const image = { status: "ready", attachment: { id: "image-1", kind: "image", name: "lotus.png", mimeType: "image/png", sizeBytes: 128,
      uri: "teamcow-attachment://conversation/conversation-1/image-1" } }
    const items = buildChatRenderItems(timeline({ runs: [run("run-1", "completed")], events: [
      event("image-event", "run-1", 1, "run.artifact.changed", { contentType: "imageGeneration", image }),
      event("completed", "run-1", 2, "run.completed", {})
    ] }))
    expect(items.filter((item) => item.kind === "provider-image")).toEqual([
      expect.objectContaining({ id: "image-event", image })
    ])
    expect(items.some((item) => item.kind === "run-outcome")).toBe(false)
  })

  it("maps timeline messages and normalized run events into stable chat render items", () => {
    const items = buildChatRenderItems(timeline({
      messages: [
        {
          id: "message-1",
          conversationId: "conversation-1",
          role: "user",
          content: "Implement the chat render model",
          model: "gpt-5.1",
          runId: "run-1",
          createdAt: "2026-05-20T10:00:00.000Z"
        }
      ],
      runs: [run("run-1", "completed")],
      events: [
        event("event-1", "run-1", 1, "run.started", { status: "running", rawType: "thread.started" }),
        event("event-2", "run-1", 2, "run.progress", { rawType: "turn.started" }),
        event("event-3", "run-1", 3, "run.message.delta", { text: "Created" }),
        event("event-4", "run-1", 4, "run.message.delta", { text: " the patch" }),
        event("event-5", "run-1", 5, "run.completed", { rawType: "turn.completed" })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "user-message",
      "provider-message"
    ])
    expect(items[0]).toMatchObject({
      kind: "user-message",
      id: "message-1",
      content: "Implement the chat render model",
      model: "gpt-5.1",
      runId: "run-1"
    })
    expect(items[1]).toMatchObject({
      kind: "provider-message",
      id: "provider-streaming-run-1",
      runId: "run-1",
      content: "Created the patch",
      eventIds: ["event-3", "event-4"],
      isRunning: false
    })
  })

  it("marks provider text as live only while its run is active", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-1", "running")],
      events: [
        event("event-1", "run-1", 1, "run.message.delta", { text: "Still working" })
      ]
    }))

    expect(items).toEqual([
      expect.objectContaining({
        kind: "provider-message",
        content: "Still working",
        isRunning: true
      })
    ])
  })

  it("drops provider activity once a completed run has visible provider output", () => {
    const items = buildChatRenderItems(timeline({
      messages: [
        {
          id: "message-1",
          conversationId: "conversation-1",
          role: "user",
          content: "Check whether the project has files",
          model: "gpt-5.1",
          runId: "run-1",
          createdAt: "2026-05-20T10:00:00.000Z"
        }
      ],
      runs: [run("run-1", "completed")],
      events: [
        event("event-1", "run-1", 1, "run.started", { status: "running", rawType: "thread.started" }),
        event("event-2", "run-1", 2, "system.status", {
          status: "unavailable",
          reason: "provider-runtime-starting"
        }),
        event("event-3", "run-1", 3, "run.message.delta", { text: "The project has files." }),
        event("event-4", "run-1", 4, "run.completed", { rawType: "turn.completed" })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "user-message",
      "provider-message"
    ])
  })

  it("keeps provider delta aggregation isolated by run", () => {
    const items = buildChatRenderItems(timeline({
      runs: [
        run("run-1", "completed", "2026-05-20T10:00:00.000Z"),
        run("run-2", "completed", "2026-05-20T10:01:00.000Z")
      ],
      events: [
        event("event-1", "run-1", 1, "run.message.delta", { text: "First" }, "2026-05-20T10:00:01.000Z"),
        event("event-2", "run-2", 1, "run.message.delta", { text: "Second" }, "2026-05-20T10:01:01.000Z"),
        event("event-3", "run-1", 2, "run.message.delta", { text: " run" }, "2026-05-20T10:00:02.000Z")
      ]
    }))

    expect(items.filter((item) => item.kind === "provider-message")).toEqual([
      expect.objectContaining({
        runId: "run-1",
        content: "First run",
        eventIds: ["event-1", "event-3"]
      }),
      expect.objectContaining({
        runId: "run-2",
        content: "Second",
        eventIds: ["event-2"]
      })
    ])
  })

  it("reassembles persisted Claude deltas whose outer event UUID changed for every chunk", () => {
    const streamRaw = (uuid: string, streamEvent: Record<string, unknown>) => ({
      type: "stream_event",
      uuid,
      session_id: "claude-session-1",
      parent_tool_use_id: null,
      event: streamEvent
    })
    const assistantRaw = (uuid: string, content: Record<string, unknown>) => ({
      type: "assistant",
      uuid,
      session_id: "claude-session-1",
      parent_tool_use_id: null,
      message: {
        id: "msg-inner-1",
        content: [content]
      }
    })
    const items = buildChatRenderItems(timeline({
      runs: [run("run-claude", "running", "2026-05-20T10:00:00.000Z", "claude")],
      events: [
        event("event-1", "run-claude", 1, "run.progress", {
          provider: "claude",
          rawType: "stream_event",
          rawStreamType: "message_start",
          raw: streamRaw("outer-start", {
            type: "message_start",
            message: { id: "msg-inner-1", content: [] }
          })
        }),
        event("event-2", "run-claude", 2, "run.progress", {
          provider: "claude",
          rawType: "stream_event",
          rawStreamType: "content_block_start",
          raw: streamRaw("outer-thinking-start", {
            type: "content_block_start",
            index: 0,
            content_block: { type: "thinking", thinking: "" }
          })
        }),
        event("event-3", "run-claude", 3, "run.reasoning.delta", {
          provider: "claude",
          messageId: "outer-thinking-delta-1:0",
          text: "I'm sta",
          raw: streamRaw("outer-thinking-delta-1", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "thinking_delta", thinking: "I'm sta" }
          })
        }),
        event("event-4", "run-claude", 4, "run.reasoning.delta", {
          provider: "claude",
          messageId: "outer-thinking-delta-2:0",
          text: "rting",
          raw: streamRaw("outer-thinking-delta-2", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "thinking_delta", thinking: "rting" }
          })
        }),
        event("event-5", "run-claude", 5, "run.reasoning.completed", {
          provider: "claude",
          messageId: "outer-thinking-completed:0",
          text: "I'm starting",
          raw: assistantRaw("outer-thinking-completed", {
            type: "thinking",
            thinking: "I'm starting"
          })
        }),
        event("event-6", "run-claude", 6, "run.progress", {
          provider: "claude",
          rawType: "stream_event",
          rawStreamType: "content_block_start",
          raw: streamRaw("outer-text-start", {
            type: "content_block_start",
            index: 1,
            content_block: { type: "text", text: "" }
          })
        }),
        event("event-7", "run-claude", 7, "run.message.delta", {
          provider: "claude",
          messageId: "outer-text-delta-1:1",
          phase: "commentary",
          text: "这是",
          raw: streamRaw("outer-text-delta-1", {
            type: "content_block_delta",
            index: 1,
            delta: { type: "text_delta", text: "这是" }
          })
        }),
        event("event-8", "run-claude", 8, "run.message.delta", {
          provider: "claude",
          messageId: "outer-text-delta-2:1",
          phase: "commentary",
          text: "车速取平台",
          raw: streamRaw("outer-text-delta-2", {
            type: "content_block_delta",
            index: 1,
            delta: { type: "text_delta", text: "车速取平台" }
          })
        }),
        event("event-9", "run-claude", 9, "run.message.completed", {
          provider: "claude",
          messageId: "outer-text-completed:0",
          phase: "commentary",
          text: "这是车速取平台",
          raw: assistantRaw("outer-text-completed", {
            type: "text",
            text: "这是车速取平台"
          })
        })
      ]
    }))

    expect(items).toEqual([
      expect.objectContaining({
        kind: "provider-context",
        contextKind: "reasoning",
        content: "I'm starting",
        entries: ["I'm starting"],
        eventIds: ["event-3", "event-4"]
      }),
      expect.objectContaining({
        kind: "provider-message",
        content: "这是车速取平台",
        eventIds: ["event-7", "event-8", "event-9"]
      })
    ])
  })

  it("renders completed provider messages without requiring delta events", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-1", "completed")],
      events: [
        event("event-1", "run-1", 1, "run.started", { rawType: "thread.started" }),
        event("event-2", "run-1", 2, "run.message.completed", {
          rawType: "item.completed",
          text: "你好！有什么我可以帮你的吗？"
        }),
        event("event-3", "run-1", 3, "run.completed", { rawType: "turn.completed" })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "provider-message"
    ])
    expect(items[0]).toMatchObject({
      kind: "provider-message",
      content: "你好！有什么我可以帮你的吗？",
      eventIds: ["event-2"]
    })
  })

  it("uses assistant message cache only when provider text events are missing", () => {
    const items = buildChatRenderItems(timeline({
      messages: [
        {
          id: "assistant-cache-1",
          conversationId: "conversation-1",
          role: "assistant",
          content: "Cached answer",
          model: "gpt-5.1",
          runId: "run-1",
          createdAt: "2026-05-20T10:00:03.000Z"
        },
        {
          id: "assistant-cache-2",
          conversationId: "conversation-1",
          role: "assistant",
          content: "Fallback answer",
          model: "gpt-5.1",
          runId: "run-2",
          createdAt: "2026-05-20T10:01:03.000Z"
        }
      ],
      runs: [
        run("run-1", "completed", "2026-05-20T10:00:00.000Z"),
        run("run-2", "completed", "2026-05-20T10:01:00.000Z")
      ],
      events: [
        event("event-1", "run-1", 1, "run.message.delta", { text: "Event answer" }, "2026-05-20T10:00:01.000Z")
      ]
    }))

    expect(items.filter((item) => item.kind === "provider-message")).toEqual([
      expect.objectContaining({
        runId: "run-1",
        content: "Event answer",
        eventIds: ["event-1"]
      }),
      expect.objectContaining({
        runId: "run-2",
        content: "Fallback answer",
        eventIds: []
      })
    ])
  })

  it("surfaces running tool activity without adding a diagnostics card while the provider is active", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-1", "running")],
      events: [
        event("event-1", "run-1", 1, "run.progress", { rawType: "turn.started" }),
        event("event-2", "run-1", 2, "provider.raw", { rawType: "raw", line: "debug output" }),
        event("event-3", "run-1", 3, "run.progress", { tool: "diff", message: "Changed files summary is ready" })
      ]
    }))

    expect(items).toEqual([
      expect.objectContaining({
        kind: "provider-activity",
        runId: "run-1",
        phase: "running",
        activityKind: "diff",
        label: "diff",
        eventCount: 2,
        steps: [
          expect.objectContaining({
            phase: "running",
            activityKind: "request",
            label: "request"
          }),
          expect.objectContaining({
            phase: "running",
            activityKind: "diff",
            label: "diff"
          })
        ]
      })
    ])
  })

  it("summarizes running Codex item progress before provider text arrives", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-1", "running")],
      events: [
        event("event-1", "run-1", 1, "system.status", {
          status: "unavailable",
          reason: "provider-runtime-starting"
        }),
        event("event-2", "run-1", 2, "run.started", { rawType: "thread.started" }),
        event("event-3", "run-1", 3, "run.progress", { rawType: "turn.started" }),
        event("event-4", "run-1", 4, "run.progress", {
          rawType: "item.started",
          raw: {
            type: "item.started",
            item: {
              id: "ws_1",
              type: "web_search",
              query: "TeamCow streaming output"
            }
          }
        })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "provider-activity"
    ])
    expect(items[0]).toMatchObject({
      kind: "provider-activity",
      runId: "run-1",
      phase: "running",
      activityKind: "web_search",
      label: "web_search",
      detail: "TeamCow streaming output",
      eventCount: 3,
      steps: [
        expect.objectContaining({
          phase: "starting",
          activityKind: "provider",
          label: "provider"
        }),
        expect.objectContaining({
          phase: "running",
          activityKind: "request",
          label: "request"
        }),
        expect.objectContaining({
          phase: "running",
          activityKind: "web_search",
          label: "web_search",
          detail: "TeamCow streaming output"
        })
      ]
    })
  })

  it("renders previously persisted Codex item.completed progress events as provider messages", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-1", "completed")],
      events: [
        event("event-1", "run-1", 1, "run.progress", {
          rawType: "item.completed",
          raw: {
            type: "item.completed",
            item: {
              id: "item_3",
              type: "agent_message",
              text: "你好！有什么我可以帮你的吗？"
            }
          }
        }),
        event("event-2", "run-1", 2, "run.completed", { rawType: "turn.completed" })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "provider-message"
    ])
    expect(items[0]).toMatchObject({
      kind: "provider-message",
      content: "你好！有什么我可以帮你的吗？",
      eventIds: ["event-1"]
    })
  })

  it("renders previously persisted Claude result summaries as markdown-capable provider messages", () => {
    const resultText = [
      "我需要你的授权来访问网络获取文档。",
      "",
      "## 1️⃣ 是的，这是快应用卡片项目",
      "",
      "这是专门用于开发 **vivo Jovi 卡片**的项目。"
    ].join("\n")

    const items = buildChatRenderItems(timeline({
      runs: [run("run-claude", "completed", "2026-05-20T10:00:00.000Z", "claude")],
      events: [
        event("event-1", "run-claude", 1, "run.completed", {
          provider: "claude",
          rawType: "result",
          raw: {
            type: "result",
            result: resultText
          },
          subtype: "success",
          message: resultText,
          sessionId: "claude-session-1"
        })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "provider-message"
    ])
    expect(items[0]).toMatchObject({
      kind: "provider-message",
      runId: "run-claude",
      content: resultText,
      eventIds: ["event-1"]
    })
  })

  it("derives a permission request from Claude result permission denials", () => {
    const resultText = "我需要你的授权来访问网络获取文档。"
    const items = buildChatRenderItems(timeline({
      runs: [run("run-claude", "completed", "2026-05-20T10:00:00.000Z", "claude")],
      events: [
        event("event-1", "run-claude", 1, "run.completed", {
          provider: "claude",
          rawType: "result",
          raw: {
            type: "result",
            result: resultText,
            permission_denials: [
              {
                tool_name: "mcp__web-reader__webReader",
                tool_use_id: "tooluse_web_reader",
                tool_input: {
                  url: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742",
                  retain_images: false
                }
              },
              {
                tool_name: "mcp__web-search-prime__web_search_prime",
                tool_use_id: "tooluse_web_search",
                tool_input: {
                  search_query: "华为 快应用卡片 浮层",
                  location: "cn"
                }
              }
            ]
          },
          subtype: "success",
          message: resultText,
          sessionId: "claude-session-1"
        })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "provider-message",
      "permission-request"
    ])
    expect(items[1]).toMatchObject({
      kind: "permission-request",
      runId: "run-claude",
      eventId: "event-1",
      allowedTools: ["mcp__web-reader__webReader", "mcp__web-search-prime__web_search_prime"],
      denials: [
        expect.objectContaining({
          toolName: "mcp__web-reader__webReader",
          target: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742"
        }),
        expect.objectContaining({
          toolName: "mcp__web-search-prime__web_search_prime",
          target: "华为 快应用卡片 浮层"
        })
      ]
    })
  })

  it("derives a permission request from Claude denied tool_result progress events", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-claude", "completed", "2026-05-20T10:00:00.000Z", "claude")],
      events: [
        event("event-1", "run-claude", 1, "run.progress", {
          provider: "claude",
          rawType: "assistant",
          contentType: "tool_use",
          toolUse: {
            id: "tooluse_web_reader",
            name: "mcp__web-reader__webReader",
            input: {
              url: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742",
              retain_images: false
            }
          }
        }),
        event("event-2", "run-claude", 2, "run.progress", {
          provider: "claude",
          rawType: "user",
          contentType: "tool_result",
          toolResult: {
            toolUseId: "tooluse_web_reader",
            isError: true,
            content: "Claude requested permissions to use mcp__web-reader__webReader, but you haven't granted it yet."
          }
        }),
        event("event-3", "run-claude", 3, "run.message.delta", {
          provider: "claude",
          rawType: "assistant",
          text: "我仍然需要你的授权才能访问网页内容。"
        }),
        event("event-4", "run-claude", 4, "run.completed", {
          provider: "claude",
          rawType: "result"
        })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "provider-message",
      "permission-request"
    ])
    expect(items[1]).toMatchObject({
      kind: "permission-request",
      runId: "run-claude",
      eventId: "event-2",
      allowedTools: ["mcp__web-reader__webReader"],
      denials: [
        expect.objectContaining({
          toolName: "mcp__web-reader__webReader",
          toolUseId: "tooluse_web_reader",
          target: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742"
        })
      ]
    })
  })

  it("derives a permission request from Claude permission-gated tool_use progress events", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-claude", "unavailable", "2026-05-20T10:00:00.000Z", "claude")],
      events: [
        event("event-1", "run-claude", 1, "run.progress", {
          provider: "claude",
          rawType: "assistant",
          contentType: "tool_use",
          toolUse: {
            id: "tooluse_web_reader",
            name: "mcp__web-reader__webReader",
            input: {
              url: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742",
              retain_images: false
            }
          }
        }),
        event("event-2", "run-claude", 2, "run.status", {
          status: "unavailable",
          reason: "provider-permission-required"
        })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "permission-request"
    ])
    expect(items[0]).toMatchObject({
      kind: "permission-request",
      runId: "run-claude",
      eventId: "event-1",
      allowedTools: ["mcp__web-reader__webReader"],
      denials: [
        expect.objectContaining({
          toolName: "mcp__web-reader__webReader",
          toolUseId: "tooluse_web_reader",
          target: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742"
        })
      ]
    })
  })

  it("surfaces Claude MCP tool execution errors separately from permission requests", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-claude", "completed", "2026-05-20T10:00:00.000Z", "claude")],
      events: [
        event("event-1", "run-claude", 1, "system.status", {
          status: "unavailable",
          reason: "provider-permission-retry-starting",
          allowedTools: ["mcp__web-reader__webReader"]
        }),
        event("event-2", "run-claude", 2, "run.progress", {
          provider: "claude",
          rawType: "assistant",
          contentType: "tool_use",
          toolUse: {
            id: "tooluse_web_reader",
            name: "mcp__web-reader__webReader",
            input: {
              url: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742",
              retain_images: false
            }
          }
        }),
        event("event-3", "run-claude", 3, "run.progress", {
          provider: "claude",
          rawType: "user",
          contentType: "tool_result",
          toolResult: {
            toolUseId: "tooluse_web_reader",
            isError: true,
            content: "MCP error -429: {\"error\":{\"code\":\"1309\",\"message\":\"您的GLM Coding Plan套餐已到期，暂无法使用\"}}"
          }
        }),
        event("event-4", "run-claude", 4, "run.message.delta", {
          provider: "claude",
          rawType: "assistant",
          text: "看起来网络访问工具遇到了套餐限制问题。"
        }),
        event("event-5", "run-claude", 5, "run.completed", {
          provider: "claude",
          rawType: "result"
        })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "tool-failure",
      "provider-message"
    ])
    expect(items[0]).toMatchObject({
      kind: "tool-failure",
      runId: "run-claude",
      eventId: "event-3",
      isFatal: false,
      isRunning: false,
      toolName: "mcp__web-reader__webReader",
      target: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742",
      message: expect.stringContaining("GLM Coding Plan")
    })
  })

  it("keeps Claude tool failures prominent when the run does not complete successfully", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-claude", "failed", "2026-05-20T10:00:00.000Z", "claude")],
      events: [
        event("event-1", "run-claude", 1, "run.progress", {
          provider: "claude",
          rawType: "assistant",
          contentType: "tool_use",
          toolUse: {
            id: "tooluse_bash",
            name: "Bash",
            input: { command: "missing-command" }
          }
        }),
        event("event-2", "run-claude", 2, "run.progress", {
          provider: "claude",
          rawType: "user",
          contentType: "tool_result",
          toolResult: {
            toolUseId: "tooluse_bash",
            isError: true,
            content: "Exit code 127\nmissing-command: command not found"
          }
        }),
        event("event-3", "run-claude", 3, "run.error", {
          provider: "claude",
          message: "Claude stopped after the command failed"
        })
      ]
    }))

    expect(items.find((item) => item.kind === "tool-failure")).toMatchObject({
      kind: "tool-failure",
      isFatal: true,
      isRunning: false,
      toolName: "Bash",
      target: "missing-command"
    })
  })

  it("hides stale permission requests after a later authorized retry consumes them", () => {
    const items = buildChatRenderItems(timeline({
      runs: [
        run("run-permission", "unavailable", "2026-05-20T10:00:00.000Z", "claude"),
        run("run-retry", "completed", "2026-05-20T10:01:00.000Z", "claude")
      ],
      events: [
        event("event-1", "run-permission", 1, "run.progress", {
          provider: "claude",
          rawType: "assistant",
          contentType: "tool_use",
          toolUse: {
            id: "tooluse_web_reader",
            name: "mcp__web-reader__webReader",
            input: {
              url: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742",
              retain_images: false
            }
          }
        }, "2026-05-20T10:00:01.000Z"),
        event("event-2", "run-permission", 2, "run.status", {
          status: "unavailable",
          reason: "provider-permission-required"
        }, "2026-05-20T10:00:02.000Z"),
        event("event-3", "run-retry", 1, "system.status", {
          status: "unavailable",
          reason: "provider-permission-retry-starting",
          allowedTools: ["mcp__web-reader__webReader"]
        }, "2026-05-20T10:01:00.000Z"),
        event("event-4", "run-retry", 2, "run.progress", {
          provider: "claude",
          rawType: "assistant",
          contentType: "tool_use",
          toolUse: {
            id: "tooluse_web_reader_retry",
            name: "mcp__web-reader__webReader",
            input: {
              url: "https://developer.huawei.com/consumer/cn/doc/service/strength-0000001193466742",
              retain_images: false
            }
          }
        }, "2026-05-20T10:01:01.000Z"),
        event("event-5", "run-retry", 3, "run.progress", {
          provider: "claude",
          rawType: "user",
          contentType: "tool_result",
          toolResult: {
            toolUseId: "tooluse_web_reader_retry",
            isError: true,
            content: "MCP error -429: {\"error\":{\"code\":\"1309\",\"message\":\"您的GLM Coding Plan套餐已到期，暂无法使用\"}}"
          }
        }, "2026-05-20T10:01:02.000Z"),
        event("event-6", "run-retry", 4, "run.message.delta", {
          provider: "claude",
          rawType: "assistant",
          text: "看起来网络访问工具遇到了套餐限制问题。"
        }, "2026-05-20T10:01:03.000Z"),
        event("event-7", "run-retry", 5, "run.completed", {
          provider: "claude",
          rawType: "result"
        }, "2026-05-20T10:01:05.000Z")
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "tool-failure",
      "provider-message"
    ])
    expect(items.some((item) => item.kind === "permission-request" && item.runId === "run-permission")).toBe(false)
    expect(items.some((item) => item.kind === "run-outcome" && item.runId === "run-permission")).toBe(false)
  })

  it("keeps Claude web tool activity out of the main chat line after provider markdown", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-claude", "completed", "2026-05-20T10:00:00.000Z", "claude")],
      events: [
        event("event-1", "run-claude", 1, "run.message.delta", {
          provider: "claude",
          rawType: "assistant",
          text: "## 技术文档\n\n已找到相关说明。"
        }),
        event("event-2", "run-claude", 2, "run.progress", {
          provider: "claude",
          rawType: "mcp__web-reader__webReader",
          toolUse: {
            name: "mcp__web-reader__webReader",
            input: {
              url: "https://dev.vivo.com.cn/documentCenter/doc/217",
              retain_images: false
            }
          }
        }),
        event("event-3", "run-claude", 3, "run.progress", {
          provider: "claude",
          rawType: "user",
          contentType: "tool_result",
          toolResult: {
            toolUseId: "tooluse_1",
            content: "permission denied"
          }
        }),
        event("event-4", "run-claude", 4, "run.completed", {
          provider: "claude",
          rawType: "result"
        })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "provider-message"
    ])
    expect(items[0]).toMatchObject({
      kind: "provider-message",
      content: "## 技术文档\n\n已找到相关说明。"
    })
  })

  it("preserves malformed and unknown event payloads behind raw fallback items", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-1", "failed")],
      events: [
        event("event-1", "run-1", 1, "provider.raw", {
          originalEventType: "provider.unknown",
          raw: "{\"type\":\"provider.unknown\"",
          parseError: "Unexpected end of JSON input"
        }),
        event("event-2", "run-1", 2, "run.error", {
          message: "Codex failed",
          provider: "codex",
          conversationId: "conversation-1",
          worktreeId: "worktree-1",
          runId: "run-1"
        })
      ]
    }))

    expect(items).toEqual([
      expect.objectContaining({
        kind: "run-outcome",
        status: "failed",
        diagnosticsCount: 2
      }),
      expect.objectContaining({
        kind: "provider-activity",
        phase: "failed",
        activityKind: "provider",
        eventCount: 2,
        details: [
          expect.objectContaining({
            eventType: "provider.raw",
            rawDetails: expect.stringContaining("Unexpected end of JSON input")
          }),
          expect.objectContaining({
            eventType: "run.error",
            status: "failed",
            summary: "Codex failed",
            rawDetails: expect.stringContaining("worktree-1")
          })
        ]
      })
    ])
  })

  it("prefers delta stream over run.message.completed when both exist for the same run", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-1", "completed")],
      events: [
        event("event-1", "run-1", 1, "run.started", { rawType: "thread.started" }),
        event("event-2", "run-1", 2, "run.message.delta", { text: "Hello" }),
        event("event-3", "run-1", 3, "run.message.delta", { text: " world" }),
        event("event-4", "run-1", 4, "run.message.completed", {
          rawType: "item.completed",
          text: "Hello world (completed)"
        }),
        event("event-5", "run-1", 5, "run.completed", { rawType: "turn.completed" })
      ]
    }))

    const providerMessages = items.filter((item) => item.kind === "provider-message")
    expect(providerMessages).toHaveLength(1)
    expect(providerMessages[0]).toMatchObject({
      kind: "provider-message",
      content: "Hello world",
      eventIds: ["event-2", "event-3", "event-4"]
    })
  })

  it("separates provider commentary and reasoning from the authoritative final answer", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-1", "completed")],
      events: [
        event("event-1", "run-1", 1, "run.started", { rawType: "thread/started" }),
        event("event-2", "run-1", 2, "run.message.delta", {
          messageId: "commentary-1",
          phase: "commentary",
          text: "Inspecting the project"
        }),
        event("event-3", "run-1", 3, "run.reasoning.delta", {
          messageId: "reasoning-1",
          visibility: "summary",
          text: "Comparing provider events"
        }),
        event("event-4", "run-1", 4, "run.message.delta", {
          messageId: "final-1",
          phase: "final",
          text: "The fix is ready"
        }),
        event("event-5", "run-1", 5, "run.message.completed", {
          messageId: "final-1",
          phase: "final",
          authoritative: true,
          text: "The fix is ready."
        }),
        event("event-6", "run-1", 6, "run.completed", { rawType: "turn/completed" })
      ]
    }))

    expect(items.map((item) => item.kind)).toEqual([
      "provider-context",
      "provider-context",
      "provider-message"
    ])
    expect(items[0]).toMatchObject({
      kind: "provider-context",
      contextKind: "commentary",
      content: "Inspecting the project"
    })
    expect(items[1]).toMatchObject({
      kind: "provider-context",
      contextKind: "reasoning",
      content: "Comparing provider events"
    })
    expect(items[2]).toMatchObject({
      kind: "provider-message",
      phase: "final",
      authoritative: true,
      content: "The fix is ready."
    })
  })

  it("keeps Codex reasoning summaries as separate clean steps", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-1", "running")],
      events: [
        event("event-1", "run-1", 1, "run.reasoning.delta", {
          messageId: "reasoning-1",
          summaryIndex: 0,
          text: "**Preparing mind map data**"
        }),
        event("event-2", "run-1", 2, "run.reasoning.delta", {
          messageId: "reasoning-1",
          summaryIndex: 1,
          text: "**Gathering detailed diff statistics**"
        }),
        event("event-3", "run-1", 3, "run.reasoning.completed", {
          messageId: "reasoning-1",
          text: "**Preparing mind map data**\n**Gathering detailed diff statistics**"
        })
      ]
    }))

    expect(items).toEqual([
      expect.objectContaining({
        kind: "provider-context",
        contextKind: "reasoning",
        content: "Preparing mind map data\n\nGathering detailed diff statistics",
        entries: ["Preparing mind map data", "Gathering detailed diff statistics"],
        eventIds: ["event-1", "event-2"],
        isRunning: true
      })
    ])
  })

  it("falls back to run.message.completed when no delta events exist for the run", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-1", "completed")],
      events: [
        event("event-1", "run-1", 1, "run.started", { rawType: "thread.started" }),
        event("event-2", "run-1", 2, "run.message.completed", {
          rawType: "item.completed",
          text: "Completed message only"
        }),
        event("event-3", "run-1", 3, "run.completed", { rawType: "turn.completed" })
      ]
    }))

    const providerMessages = items.filter((item) => item.kind === "provider-message")
    expect(providerMessages).toHaveLength(1)
    expect(providerMessages[0]).toMatchObject({
      kind: "provider-message",
      content: "Completed message only",
      eventIds: ["event-2"]
    })
  })

  it("folds Claude tool progress and provider raw output into provider activity", () => {
    const items = buildChatRenderItems(timeline({
      runs: [run("run-claude", "failed", "2026-05-20T10:00:00.000Z", "claude")],
      events: [
        event("event-1", "run-claude", 1, "run.progress", {
          provider: "claude",
          rawType: "assistant",
          contentType: "tool_use",
          toolUse: {
            id: "tool-1",
            name: "Edit"
          }
        }),
        event("event-2", "run-claude", 2, "provider.raw", {
          provider: "claude",
          rawType: "raw",
          parseError: "invalid-json",
          line: "{\"type\":\"assistant\""
        })
      ]
    }))

    expect(items).toEqual([
      expect.objectContaining({
        kind: "run-outcome",
        status: "failed",
        diagnosticsCount: 2
      }),
      expect.objectContaining({
        kind: "provider-activity",
        phase: "failed",
        eventCount: 2,
        details: [
          expect.objectContaining({
            eventType: "run.progress",
            summary: "assistant",
            rawDetails: expect.stringContaining("tool-1")
          }),
          expect.objectContaining({
            eventType: "provider.raw",
            summary: "raw",
            rawDetails: expect.stringContaining("invalid-json")
          })
        ]
      })
    ])
  })
})
