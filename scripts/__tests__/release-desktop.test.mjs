import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import {
  createReleaseManifest,
  collectReleaseArtifacts,
  createReleasePlan,
  getReleaseReadiness,
  validateAppBundleContents,
  validateReleaseArtifacts
} from "../release-desktop.mjs"

const repoRoot = resolve(import.meta.dirname, "../..")

const readJson = (relativePath) => JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"))

test("package scripts expose release desktop entrypoints", () => {
  const rootPackage = readJson("package.json")
  const desktopPackage = readJson("apps/desktop/package.json")

  assert.equal(rootPackage.scripts["release:desktop"], "node scripts/release-desktop.mjs")
  assert.equal(rootPackage.scripts["release:desktop:dry-run"], "node scripts/release-desktop.mjs --dry-run")
  assert.equal(
    desktopPackage.scripts["package:mac"],
    "yarn build && electron-builder --mac --publish never && node ./scripts/smoke-packaged-native.mjs"
  )
})

test("release desktop workflow runs macOS packaging from release tags", () => {
  const workflowPath = resolve(repoRoot, ".github/workflows/release-desktop.yml")

  assert.equal(existsSync(workflowPath), true)

  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /push:\n\s+tags:\n\s+- "v\*"/)
  assert.match(workflow, /runs-on: macos-latest/)
  assert.match(workflow, /node-version-file: \.node-version/)
  assert.match(workflow, /yarn install --frozen-lockfile/)
  assert.match(workflow, /yarn release:desktop/)
  assert.match(workflow, /actions\/upload-artifact@v4/)
})

test("release plan keeps root quality gates separate from mac packaging phases", () => {
  const plan = createReleasePlan({ dryRun: false })

  assert.deepEqual(plan.phases.map((phase) => phase.name), [
    "quality:i18n",
    "quality:typecheck",
    "quality:lint",
    "quality:test",
    "quality:smoke",
    "native:rebuild",
    "desktop:build",
    "electron-builder:mac"
  ])
  assert.deepEqual(plan.phases[1]?.command, ["yarn", "ci:typecheck"])
  assert.deepEqual(plan.phases[2]?.command, ["yarn", "lint"])
  assert.deepEqual(plan.phases[3]?.command, ["yarn", "ci:test"])
  assert.deepEqual(plan.phases[4]?.command, ["yarn", "ci:smoke"])
  assert.deepEqual(plan.phases.at(-1)?.command, ["yarn", "workspace", "@teamcow/desktop", "package:mac"])
})

test("release script can be imported from eval contexts without running main", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import('./scripts/release-desktop.mjs').then((mod) => console.log(mod.createReleasePlan({ dryRun: true }).dryRun))"
    ],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /true/)
})

test("release readiness distinguishes unsigned artifacts from feed-ready releases", () => {
  assert.deepEqual(getReleaseReadiness({}), {
    signing: "missing",
    notarization: "missing",
    updateFeed: "missing",
    classification: "unsigned-local-artifact"
  })

  assert.equal(
    getReleaseReadiness({
      CSC_LINK: "base64-cert",
      CSC_KEY_PASSWORD: "secret",
      APPLE_ID: "dev@example.com",
      APPLE_APP_SPECIFIC_PASSWORD: "app-password",
      APPLE_TEAM_ID: "TEAMID",
      TEAMCOW_UPDATE_FEED_URL: "https://updates.example.com/download"
    }).classification,
    "signed-notarized-updater-feed-ready-artifact"
  )
})

test("release readiness does not mark updater feed ready when builder still uses the placeholder feed", () => {
  assert.equal(
    getReleaseReadiness(
      {
        CSC_LINK: "base64-cert",
        CSC_KEY_PASSWORD: "secret",
        APPLE_ID: "dev@example.com",
        APPLE_APP_SPECIFIC_PASSWORD: "app-password",
        APPLE_TEAM_ID: "TEAMID",
        TEAMCOW_UPDATE_FEED_URL: "https://updates.example.com/download"
      },
      { builderPublishUrl: "https://updates.teamcow.local/download" }
    ).classification,
    "signed-notarized-release-artifact"
  )
})

test("release readiness supports a keychain signing identity and App Store Connect API key", () => {
  assert.equal(
    getReleaseReadiness({
      CSC_NAME: "Developer ID Application: Example (TEAMID)",
      APPLE_API_KEY: "/tmp/AuthKey_TEST.p8",
      APPLE_API_KEY_ID: "TESTKEY",
      APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000"
    }).classification,
    "signed-notarized-release-artifact"
  )
})

test("release readiness supports notarization credentials stored in the default keychain", () => {
  assert.equal(
    getReleaseReadiness({
      CSC_NAME: "Developer ID Application: Example (TEAMID)",
      APPLE_KEYCHAIN_PROFILE: "teamcow-notary"
    }).classification,
    "signed-notarized-release-artifact"
  )
})

test("release artifact validation requires mac install, update payload, and metadata", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "teamcow-release-artifacts-"))

  try {
    mkdirSync(join(tempDir, "mac"), { recursive: true })
    writeFileSync(join(tempDir, "TeamCow-0.0.0-arm64.dmg"), "dmg")
    writeFileSync(join(tempDir, "TeamCow-0.0.0-arm64.zip"), "zip")
    writeFileSync(join(tempDir, "latest-mac.yml"), "path: TeamCow-0.0.0-arm64.zip\nsha512: fake\nsize: 3\n")
    writeFileSync(join(tempDir, "TeamCow-0.0.0-arm64.zip.blockmap"), "blockmap")

    const artifacts = collectReleaseArtifacts(tempDir)
    const result = validateReleaseArtifacts(artifacts, { releaseDir: tempDir })

    assert.equal(result.ok, true)
    assert.deepEqual(result.missing, [])
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test("release artifact validation rejects stale artifacts older than the release start", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "teamcow-release-stale-"))

  try {
    const startTime = Date.now()
    const artifacts = ["TeamCow-0.0.0-arm64.dmg", "TeamCow-0.0.0-arm64.zip", "latest-mac.yml"]
    for (const artifact of artifacts) {
      writeFileSync(join(tempDir, artifact), artifact)
    }

    const result = validateReleaseArtifacts(collectReleaseArtifacts(tempDir), {
      releaseDir: tempDir,
      buildStartedAt: startTime + 60_000
    })

    assert.equal(result.ok, false)
    assert.match(result.stale.join("\n"), /TeamCow-0\.0\.0-arm64\.dmg/)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test("release artifact collection summarizes app bundles without listing internals", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "teamcow-release-bundle-"))

  try {
    mkdirSync(join(tempDir, "mac-arm64/TeamCow.app/Contents"), { recursive: true })
    writeFileSync(join(tempDir, "mac-arm64/TeamCow.app/Contents/Info.plist"), "plist")
    writeFileSync(join(tempDir, "TeamCow-0.0.0-arm64.dmg"), "dmg")

    assert.deepEqual(collectReleaseArtifacts(tempDir), [
      "TeamCow-0.0.0-arm64.dmg",
      "mac-arm64/TeamCow.app"
    ])
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test("release artifact validation rejects sensitive local state", () => {
  const result = validateReleaseArtifacts([
    "TeamCow-0.0.0-arm64.dmg",
    "TeamCow-0.0.0-arm64.zip",
    "latest-mac.yml",
    ".env"
  ])

  assert.equal(result.ok, false)
  assert.match(result.sensitive.join("\n"), /\.env/)
})

test("release app bundle content validation rejects sensitive files inside app bundles", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "teamcow-release-sensitive-bundle-"))

  try {
    mkdirSync(join(tempDir, "mac-arm64/TeamCow.app/Contents/Resources"), { recursive: true })
    writeFileSync(join(tempDir, "mac-arm64/TeamCow.app/Contents/Resources/.env"), "SECRET=1")

    const sensitive = validateAppBundleContents(tempDir)

    assert.deepEqual(sensitive, ["mac-arm64/TeamCow.app/Contents/Resources/.env"])
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test("release manifest ties artifacts to version, commit, ref, readiness, and hashes", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "teamcow-release-manifest-"))

  try {
    mkdirSync(join(tempDir, "mac-arm64/TeamCow.app/Contents"), { recursive: true })
    writeFileSync(join(tempDir, "mac-arm64/TeamCow.app/Contents/Info.plist"), "plist")
    writeFileSync(join(tempDir, "TeamCow-0.0.0-arm64.dmg"), "dmg")
    writeFileSync(join(tempDir, "TeamCow-0.0.0-arm64.zip"), "zip")
    writeFileSync(join(tempDir, "teamcow-release-manifest.json"), "stale manifest")

    const manifest = createReleaseManifest({
      releaseDir: tempDir,
      artifacts: collectReleaseArtifacts(tempDir),
      readiness: { classification: "unsigned-local-artifact" },
      env: { GITHUB_REF_NAME: "v0.0.0", GITHUB_RUN_ID: "123" },
      git: { commit: "abc1234" },
      packageVersion: "0.0.0"
    })

    assert.equal(manifest.version, "0.0.0")
    assert.equal(manifest.commit, "abc1234")
    assert.equal(manifest.ref, "v0.0.0")
    assert.equal(manifest.workflowRunId, "123")
    assert.equal(manifest.readiness, "unsigned-local-artifact")
    assert.equal(manifest.artifacts.length, 2)
    assert.equal(manifest.artifacts.some((artifact) => artifact.path.endsWith(".app")), false)
    assert.equal(manifest.artifacts.some((artifact) => artifact.path === "teamcow-release-manifest.json"), false)
    assert.match(manifest.artifacts[0].sha256, /^[a-f0-9]{64}$/)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test("macOS V1 release acceptance checklist exists and covers critical paths", () => {
  const checklistPath = resolve(repoRoot, "docs/macos-v1-release-checklist.md")

  assert.equal(existsSync(checklistPath), true)

  const checklist = readFileSync(checklistPath, "utf8")

  for (const requiredText of [
    "Project -> Conversation",
    "provider readiness",
    "Files",
    "Diff",
    "Git",
    "Terminal",
    "Open in Editor",
    "notification",
    "update",
    "destructive confirmation"
  ]) {
    assert.match(checklist, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
})
