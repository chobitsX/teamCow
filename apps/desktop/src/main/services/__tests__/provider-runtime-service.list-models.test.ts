import { describe, it, expect, vi } from "vitest"
import { createProviderRuntimeService } from "../provider-runtime-service"

const codexDebugModelsResponse = JSON.stringify({
  models: [
    {
      slug: "gpt-5.5",
      display_name: "GPT-5.5",
      description: "Frontier model.",
      priority: 0,
      visibility: "list"
    },
    {
      slug: "gpt-5.4",
      display_name: "GPT-5.4",
      description: "Strong everyday coding.",
      priority: 2,
      visibility: "list"
    },
    {
      slug: "codex-auto-review",
      display_name: "Auto Review",
      description: "internal",
      priority: 29,
      visibility: "hide"
    }
  ]
})

const buildRunCommandStub = (responses: Record<string, { stdout: string; status: number }>) =>
  vi.fn(async (command: string, args: string[]) => {
    const key = `${command} ${args.join(" ")}`.trim()
    const response = responses[key]
    if (!response) {
      return { stdout: "", stderr: "not stubbed", status: 1 }
    }
    return { stdout: response.stdout, stderr: "", status: response.status }
  })

const buildCustomModelsServiceStub = () => ({
  list: vi.fn(() => []),
  add: vi.fn(),
  remove: vi.fn()
})

describe("listProviderModels", () => {
  it("parses codex debug models JSON, sorts by priority, hides non-list visibility", async () => {
    const runCommand = buildRunCommandStub({
      "codex --version": { stdout: "codex 1.0.0", status: 0 },
      "codex debug models": { stdout: codexDebugModelsResponse, status: 0 }
    })
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: {},
      customModelsService: buildCustomModelsServiceStub()
    })

    const models = await service.listProviderModels("codex")

    expect(models.map((m) => m.id)).toEqual(["gpt-5.5", "gpt-5.4"])
    expect(models[0]?.source).toBe("native-list")
    expect(models[0]?.isDefault).toBe(true)
    expect(models[0]?.label).toBe("GPT-5.5")
  })

  it("falls back to catalog when codex debug models returns invalid JSON", async () => {
    const runCommand = buildRunCommandStub({
      "codex debug models": { stdout: "not json", status: 0 }
    })
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: {},
      customModelsService: buildCustomModelsServiceStub()
    })

    const models = await service.listProviderModels("codex")
    const sources = new Set(models.map((m) => m.source))
    expect(sources.has("fallback")).toBe(true)
    expect(models[0]).toMatchObject({ id: "gpt-6-astra", isDefault: true })
    expect(models.map((m) => m.id)).not.toContain("gpt-5.4-mini")
  })

  it("parses opencode models output as native-list", async () => {
    const runCommand = buildRunCommandStub({
      "opencode models --refresh": {
        stdout: "\u001b[92mModels cache refreshed\u001b[0m\nopencode/big-pickle\nopencode/deepseek\nmodelget/gpt-5.4\n",
        status: 0
      }
    })
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: {},
      customModelsService: buildCustomModelsServiceStub()
    })

    const models = await service.listProviderModels("opencode")
    expect(models.map((m) => m.id)).toEqual([
      "opencode/big-pickle",
      "opencode/deepseek",
      "modelget/gpt-5.4"
    ])
    expect(models[0]?.isDefault).toBe(true)
    expect(models[0]?.source).toBe("native-list")
    expect(runCommand).toHaveBeenCalledWith("opencode", ["models", "--refresh"])
  })

  it("uses the local OpenCode model list when refreshing is unavailable", async () => {
    const runCommand = buildRunCommandStub({
      "opencode models --refresh": { stdout: "", status: 1 },
      "opencode models": { stdout: "custom/local-coder\n", status: 0 }
    })
    const service = createProviderRuntimeService({ runCommand, env: {}, pathExists: () => false })

    expect(await service.listProviderModels("opencode")).toMatchObject([
      { id: "custom/local-coder", source: "native-list", isDefault: true }
    ])
    expect(runCommand.mock.calls.map((call) => call[1])).toEqual([["models", "--refresh"], ["models"]])
  })

  it("uses the current OpenCode fallback when no valid native model IDs are returned", async () => {
    const runCommand = buildRunCommandStub({
      "opencode models --refresh": { stdout: "Models cache refreshed\n", status: 0 }
    })
    const service = createProviderRuntimeService({ runCommand, env: {}, pathExists: () => false })
    const models = await service.listProviderModels("opencode")

    expect(models[0]).toMatchObject({ id: "anthropic/claude-sonnet-5", source: "fallback", isDefault: true })
    expect(models.map((model) => model.id)).toContain("google/gemini-3.8-flash")
  })

  it("removes retired Codex models for ChatGPT sign-in and reassigns the default", async () => {
    const nativeIds = ["gpt-5.4-mini", "gpt-5.4", "gpt-5.3-codex", "gpt-5.2", "gpt-5.6-luna", "gpt-5.3-codex-spark"]
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args[0] === "debug" ? JSON.stringify({ models: nativeIds.map((id, priority) => ({
        slug: id, display_name: id, priority, visibility: "list"
      })) }) : "",
      // Codex login status writes its status to stderr.
      stderr: args[0] === "login" ? "Logged in using ChatGPT" : "",
      status: 0
    }))
    const service = createProviderRuntimeService({ runCommand, env: {}, pathExists: () => false })

    expect(await service.listProviderModels("codex")).toMatchObject([
      { id: "gpt-5.6-luna", source: "native-list", isDefault: true },
      { id: "gpt-5.3-codex-spark", source: "native-list", isDefault: false }
    ])
  })

  it.each(["Logged in using an API key", "Unknown login status"])(
    "preserves native Codex models when auth is %s", async (authStatus) => {
      const runCommand = buildRunCommandStub({
        "codex debug models": { stdout: codexDebugModelsResponse, status: 0 },
        "codex login status": { stdout: authStatus, status: 0 }
      })
      const service = createProviderRuntimeService({ runCommand, env: {}, pathExists: () => false })

      expect((await service.listProviderModels("codex")).map((model) => model.id)).toEqual(["gpt-5.5", "gpt-5.4"])
    }
  )

  it("does not apply ChatGPT retirements to a configured custom Codex provider", async () => {
    const runCommand = buildRunCommandStub({
      "codex debug models": { stdout: codexDebugModelsResponse, status: 0 },
      "codex login status": { stdout: "Logged in using ChatGPT", status: 0 }
    })
    const service = createProviderRuntimeService({
      runCommand, env: {}, pathExists: (path) => path.endsWith("config.toml"),
      readFile: () => 'model_provider = "local-gateway"'
    })

    expect((await service.listProviderModels("codex")).map((model) => model.id)).toContain("gpt-5.4")
    expect(runCommand).not.toHaveBeenCalledWith("codex", ["login", "status"])
  })

  it("falls back to current models when the Codex native list contains only retired models", async () => {
    const runCommand = buildRunCommandStub({
      "codex debug models": { stdout: JSON.stringify({ models: [{
        slug: "gpt-5.4", display_name: "GPT-5.4", priority: 0, visibility: "list"
      }] }), status: 0 },
      "codex login status": { stdout: "Logged in using ChatGPT", status: 0 }
    })
    const service = createProviderRuntimeService({ runCommand, env: {}, pathExists: () => false })

    expect((await service.listProviderModels("codex"))[0]).toMatchObject({
      id: "gpt-6-astra", source: "fallback", isDefault: true
    })
  })

  it("filters retired configured Codex models while preserving explicit custom model entries", async () => {
    const runCommand = buildRunCommandStub({
      "codex login status": { stdout: "Logged in using ChatGPT", status: 0 }
    })
    const service = createProviderRuntimeService({
      runCommand, env: {}, pathExists: (path) => path.endsWith("config.toml"),
      readFile: () => 'model = "gpt-5.4-mini"',
      customModelsService: {
        list: () => [{ id: "gpt-5.4", label: "Pinned API model", addedAt: "2026-09-07T00:00:00.000Z" }]
      }
    })
    const models = await service.listProviderModels("codex")

    expect(models.map((model) => model.id)).not.toContain("gpt-5.4-mini")
    expect(models[0]).toMatchObject({ id: "gpt-5.4", source: "user-custom" })
    expect(models.filter((model) => model.isDefault).map((model) => model.id)).toEqual(["gpt-6-astra"])
  })

  it("derives claude model from ANTHROPIC_MODEL env and merges with catalog", async () => {
    const runCommand = buildRunCommandStub({})
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: { ANTHROPIC_MODEL: "claude-sonnet-4-6" },
      customModelsService: buildCustomModelsServiceStub()
    })

    const models = await service.listProviderModels("claude")
    expect(models[0]?.id).toBe("claude-sonnet-4-6")
    expect(models[0]?.source).toBe("config-derived")
    expect(models.map((m) => m.id)).toEqual([
      "claude-sonnet-4-6",
      "default",
      "claude-fable-5-1",
      "claude-fable-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-sonnet-5",
      "claude-haiku-4-5"
    ])
  })

  it("appends user-custom models on top with source user-custom", async () => {
    const runCommand = buildRunCommandStub({
      "codex debug models": { stdout: codexDebugModelsResponse, status: 0 }
    })
    const customModelsServiceStub = buildCustomModelsServiceStub()
    customModelsServiceStub.list = vi.fn(() => [
      {
        id: "gpt-5.3-codex-spark",
        label: "GPT-5.3 Codex Spark",
        detail: "用户自定义模型。",
        addedAt: "2026-05-27T10:00:00.000Z"
      }
    ])
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: {},
      customModelsService: customModelsServiceStub
    })

    const models = await service.listProviderModels("codex")
    expect(models[0]?.id).toBe("gpt-5.3-codex-spark")
    expect(models[0]?.source).toBe("user-custom")
  })

  it("dedupes custom model that shadows native list entry, keeping user-custom source", async () => {
    const runCommand = buildRunCommandStub({
      "codex debug models": { stdout: codexDebugModelsResponse, status: 0 }
    })
    const customModelsServiceStub = buildCustomModelsServiceStub()
    customModelsServiceStub.list = vi.fn(() => [
      {
        id: "gpt-5.5",
        label: "Override",
        detail: "用户自定义模型。",
        addedAt: "2026-05-27T10:00:00.000Z"
      }
    ])
    const service = createProviderRuntimeService({
      runCommand,
      pathExists: () => false,
      readFile: () => "",
      env: {},
      customModelsService: customModelsServiceStub
    })

    const models = await service.listProviderModels("codex")
    const ids = models.map((m) => m.id)
    expect(ids.filter((id) => id === "gpt-5.5")).toHaveLength(1)
    const fivePoint5 = models.find((m) => m.id === "gpt-5.5")
    expect(fivePoint5?.source).toBe("user-custom")
  })
})
