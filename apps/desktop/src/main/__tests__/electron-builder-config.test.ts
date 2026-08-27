// @vitest-environment node
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import config, { createElectronBuilderConfig } from "../../../electron-builder"

describe("electron-builder config", () => {
  it("keeps local macOS builds ad-hoc signed while declaring release artifacts", () => {
    const localConfig = createElectronBuilderConfig({})

    expect(localConfig.directories.buildResources).toBe("build")
    expect(localConfig.npmRebuild).toBe(false)
    expect(localConfig.forceCodeSigning).toBe(false)
    expect(localConfig.mac.target).toEqual(expect.arrayContaining(["dmg", "zip"]))
    expect(localConfig.mac.artifactName).toBe("${productName}-${version}-${arch}.${ext}")
    expect(localConfig.mac.icon).toBe("build/icon.icns")
    expect(localConfig.mac.entitlements).toBe("build/entitlements.mac.plist")
    expect(localConfig.mac.entitlementsInherit).toBe("build/entitlements.mac.inherit.plist")
    expect(localConfig.mac.identity).toBe("-")
    expect(localConfig.mac.hardenedRuntime).toBe(false)
    expect(localConfig.mac.notarize).toBe(false)
    expect(localConfig.extraResources).toEqual(expect.arrayContaining([
      { from: "../../LICENSE", to: "LICENSE" },
      { from: "../../NOTICE", to: "NOTICE" },
      { from: "../../THIRD_PARTY_NOTICES.md", to: "THIRD_PARTY_NOTICES.md" }
    ]))
    expect(localConfig.publish).toEqual([
      {
        provider: "generic",
        url: "https://updates.teamcow.local/download",
        channel: "latest"
      }
    ])
  })

  it("enables Developer ID signing, hardened runtime, and notarization for release credentials", () => {
    const releaseConfig = createElectronBuilderConfig({
      CSC_NAME: "Developer ID Application: Example (TEAMID)",
      APPLE_API_KEY: "/tmp/AuthKey_TEST.p8",
      APPLE_API_KEY_ID: "TESTKEY",
      APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000"
    })

    expect(releaseConfig.forceCodeSigning).toBe(true)
    expect(releaseConfig.mac.identity).toBeUndefined()
    expect(releaseConfig.mac.hardenedRuntime).toBe(true)
    expect(releaseConfig.mac.notarize).toBe(true)
  })

  it("supports notarization credentials stored in the default keychain", () => {
    const releaseConfig = createElectronBuilderConfig({
      CSC_NAME: "Developer ID Application: Example (TEAMID)",
      APPLE_KEYCHAIN_PROFILE: "teamcow-notary"
    })

    expect(releaseConfig.forceCodeSigning).toBe(true)
    expect(releaseConfig.mac.notarize).toBe(true)
  })

  it("keeps the packaged application name aligned with the runtime menu name", () => {
    const mainEntry = readFileSync(resolve(__dirname, "../index.ts"), "utf8")

    expect(config.productName).toBe("TeamCow")
    expect(mainEntry).toContain('app.setName("TeamCow")')
  })
})
