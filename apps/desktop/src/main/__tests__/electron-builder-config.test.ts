// @vitest-environment node
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import config from "../../../electron-builder"

describe("electron-builder config", () => {
  it("builds macOS updater payloads and declares an explicit release feed placeholder", () => {
    expect(config.directories.buildResources).toBe("build")
    expect(config.npmRebuild).toBe(false)
    expect(config.mac.target).toEqual(expect.arrayContaining(["dmg", "zip"]))
    expect(config.mac.artifactName).toBe("${productName}-${version}-${arch}.${ext}")
    expect(config.mac.icon).toBe("build/icon.icns")
    expect(config.mac.identity).toBe("-")
    expect(config.mac.hardenedRuntime).toBe(false)
    expect(config.extraResources).toEqual(expect.arrayContaining([
      { from: "../../LICENSE", to: "LICENSE" },
      { from: "../../NOTICE", to: "NOTICE" },
      { from: "../../THIRD_PARTY_NOTICES.md", to: "THIRD_PARTY_NOTICES.md" }
    ]))
    expect(config.publish).toEqual([
      {
        provider: "generic",
        url: "https://updates.teamcow.local/download",
        channel: "latest"
      }
    ])
  })

  it("keeps the packaged application name aligned with the runtime menu name", () => {
    const mainEntry = readFileSync(resolve(__dirname, "../index.ts"), "utf8")

    expect(config.productName).toBe("TeamCow")
    expect(mainEntry).toContain('app.setName("TeamCow")')
  })
})
