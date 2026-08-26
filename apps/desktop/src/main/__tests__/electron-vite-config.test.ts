// @vitest-environment node
import { describe, expect, it } from "vitest"
import config from "../../../electron.vite.config"

const electronConfig = config as unknown as {
  main?: {
    plugins?: unknown
    resolve?: {
      alias?: Record<string, string>
    }
  }
  preload?: { plugins?: unknown }
}

const pluginNames = (plugins: unknown): string[] => {
  if (!Array.isArray(plugins)) {
    return []
  }

  return plugins.flat().flatMap((plugin) => {
    if (plugin && typeof plugin === "object" && "name" in plugin && typeof plugin.name === "string") {
      return [plugin.name]
    }

    return []
  })
}

describe("electron vite config", () => {
  it("bundles main-process workspace TypeScript packages that Electron cannot load at runtime", () => {
    expect(electronConfig.main?.resolve?.alias?.["@teamcow/i18n-resources"]).toContain("packages/i18n-resources/src/index.ts")

    const plugins = Array.isArray(electronConfig.main?.plugins) ? electronConfig.main.plugins.flat() : []
    const externalizePlugin = plugins.find((plugin) =>
      plugin && typeof plugin === "object" && "name" in plugin && plugin.name === "vite:externalize-deps"
    ) as { config?: (config: { build?: { rollupOptions?: { external?: unknown[] } } }) => void } | undefined

    const viteConfig: { build?: { rollupOptions?: { external?: unknown[] } } } = {}
    externalizePlugin?.config?.(viteConfig)

    const external = viteConfig.build?.rollupOptions?.external ?? []
    expect(external).not.toContain("@teamcow/i18n-resources")
    expect(external.some((entry) => entry instanceof RegExp && entry.test("@teamcow/i18n-resources/src/index.ts"))).toBe(false)
  })

  it("bundles preload dependencies so the sandboxed preload script can run", () => {
    expect(pluginNames(electronConfig.preload?.plugins)).not.toContain("vite:externalize-deps")
  })
})
