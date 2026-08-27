import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { basename, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const repoRoot = resolve(fileURLToPath(import.meta.url), "../..")
const desktopReleaseDir = resolve(repoRoot, "apps/desktop/release")
const placeholderUpdateFeedUrl = "https://updates.teamcow.local/download"
const releaseManifestName = "teamcow-release-manifest.json"

const requiredArtifactChecks = [
  { label: "macOS installer (.dmg)", test: (artifact) => artifact.endsWith(".dmg") },
  { label: "macOS update payload (.zip)", test: (artifact) => artifact.endsWith(".zip") },
  { label: "macOS update metadata (latest-mac.yml)", test: (artifact) => artifact.endsWith("latest-mac.yml") }
]

const sensitiveArtifactPatterns = [
  /(^|\/)\.env($|\.)/,
  /teamcow\.sqlite$/i,
  /\.sqlite3?$/i,
  /provider.*auth/i,
  /auth.*(token|key|config)/i,
  /terminal.*output/i,
  /prompt/i,
  /diff.*content/i,
  /diagnostic.*\.log$/i
]

export const collectReleaseArtifacts = (releaseDir = desktopReleaseDir) => {
  if (!existsSync(releaseDir)) {
    return []
  }

  const artifacts = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const absolutePath = resolve(directory, entry)
      const stats = statSync(absolutePath)

      if (stats.isDirectory()) {
        if (entry.endsWith(".app")) {
          artifacts.push(relative(releaseDir, absolutePath).split(sep).join("/"))
          continue
        }

        visit(absolutePath)
        continue
      }

      if (stats.isFile()) {
        artifacts.push(relative(releaseDir, absolutePath).split(sep).join("/"))
      }
    }
  }

  visit(releaseDir)
  return artifacts.sort()
}

const visitFiles = (directory, onFile) => {
  for (const entry of readdirSync(directory)) {
    const absolutePath = resolve(directory, entry)
    const stats = statSync(absolutePath)

    if (stats.isDirectory()) {
      visitFiles(absolutePath, onFile)
      continue
    }

    if (stats.isFile()) {
      onFile(absolutePath, stats)
    }
  }
}

export const validateAppBundleContents = (releaseDir = desktopReleaseDir) => {
  if (!existsSync(releaseDir)) {
    return []
  }

  const sensitive = []
  const scan = (directory) => {
    for (const entry of readdirSync(directory)) {
      const absolutePath = resolve(directory, entry)
      const stats = statSync(absolutePath)

      if (!stats.isDirectory()) {
        continue
      }

      if (entry.endsWith(".app")) {
        visitFiles(absolutePath, (filePath) => {
          const relativePath = relative(releaseDir, filePath).split(sep).join("/")
          if (sensitiveArtifactPatterns.some((pattern) => pattern.test(relativePath))) {
            sensitive.push(relativePath)
          }
        })
        continue
      }

      scan(absolutePath)
    }
  }

  scan(releaseDir)
  return sensitive.sort()
}

const validateLatestMacMetadata = (artifacts, releaseDir) => {
  const metadata = artifacts.find((artifact) => artifact.endsWith("latest-mac.yml"))
  if (!metadata || !releaseDir) {
    return []
  }

  const metadataPath = resolve(releaseDir, metadata)
  if (!existsSync(metadataPath)) {
    return [`${metadata} missing on disk`]
  }

  const content = readFileSync(metadataPath, "utf8")
  const pathMatch = content.match(/^path:\s*(.+)$/m)
  if (!pathMatch) {
    return [`${metadata} does not declare an update payload path`]
  }

  const payload = pathMatch[1].trim().replace(/^["']|["']$/g, "")
  if (!artifacts.some((artifact) => basename(artifact) === payload || artifact.endsWith(`/${payload}`))) {
    return [`${metadata} references missing payload ${payload}`]
  }

  return []
}

export const validateReleaseArtifacts = (artifacts, { releaseDir = desktopReleaseDir, buildStartedAt } = {}) => {
  const missing = requiredArtifactChecks
    .filter((check) => !artifacts.some(check.test))
    .map((check) => check.label)
  const sensitive = [
    ...artifacts.filter((artifact) => sensitiveArtifactPatterns.some((pattern) => pattern.test(artifact))),
    ...validateAppBundleContents(releaseDir)
  ].sort()
  const stale = buildStartedAt
    ? artifacts.filter((artifact) => {
      const artifactPath = resolve(releaseDir, artifact)
      return existsSync(artifactPath) && statSync(artifactPath).mtimeMs < buildStartedAt
    })
    : []
  const metadata = validateLatestMacMetadata(artifacts, releaseDir)

  return {
    ok: missing.length === 0 && sensitive.length === 0 && stale.length === 0 && metadata.length === 0,
    missing,
    sensitive,
    stale,
    metadata
  }
}

export const getReleaseReadiness = (env = process.env, { builderPublishUrl } = {}) => {
  const signing = (
    (env.CSC_LINK && env.CSC_KEY_PASSWORD) ||
    env.CSC_NAME
  ) ? "configured" : "missing"
  const notarization = (
    (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) ||
    (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) ||
    env.APPLE_KEYCHAIN_PROFILE
  ) ? "configured" : "missing"
  const updateFeed = env.TEAMCOW_UPDATE_FEED_URL ? "configured" : "missing"
  const builderFeedMatches = !builderPublishUrl ||
    (builderPublishUrl === env.TEAMCOW_UPDATE_FEED_URL && builderPublishUrl !== placeholderUpdateFeedUrl)

  let classification = "unsigned-local-artifact"
  if (signing === "configured" && notarization === "configured" && updateFeed === "configured" && builderFeedMatches) {
    classification = "signed-notarized-updater-feed-ready-artifact"
  } else if (signing === "configured" && notarization === "configured") {
    classification = "signed-notarized-release-artifact"
  } else if (signing === "configured") {
    classification = "signed-release-artifact"
  }

  return {
    signing,
    notarization,
    updateFeed,
    classification
  }
}

export const createReleasePlan = ({ dryRun = false } = {}) => ({
  dryRun,
  releaseDir: desktopReleaseDir,
  phases: [
    { name: "quality:i18n", command: ["yarn", "i18n:check"] },
    { name: "quality:typecheck", command: ["yarn", "ci:typecheck"] },
    { name: "quality:lint", command: ["yarn", "lint"] },
    { name: "quality:test", command: ["yarn", "ci:test"] },
    { name: "quality:smoke", command: ["yarn", "ci:smoke"] },
    { name: "native:rebuild", command: ["yarn", "workspace", "@teamcow/desktop", "electron:rebuild"] },
    { name: "desktop:build", command: ["yarn", "workspace", "@teamcow/desktop", "build"] },
    { name: "electron-builder:mac", command: ["yarn", "workspace", "@teamcow/desktop", "package:mac"] }
  ]
})

const runPhase = (phase) => {
  console.log(`[release-desktop] ${phase.name}: ${phase.command.join(" ")}`)
  const result = spawnSync(phase.command[0], phase.command.slice(1), {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${phase.name} failed with exit code ${result.status ?? 1}`)
  }
}

const printReadiness = () => {
  const readiness = getReleaseReadiness()
  console.log(`[release-desktop] signing: ${readiness.signing}`)
  console.log(`[release-desktop] notarization: ${readiness.notarization}`)
  console.log(`[release-desktop] update feed: ${readiness.updateFeed}`)
  console.log(`[release-desktop] classification: ${readiness.classification}`)
}

const readPackageVersion = () => JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")).version

const getGitCommit = () => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8"
  })

  if (result.status !== 0) {
    return "unknown"
  }

  return result.stdout.trim()
}

const sha256File = (filePath) => createHash("sha256").update(readFileSync(filePath)).digest("hex")

export const createReleaseManifest = ({
  releaseDir = desktopReleaseDir,
  artifacts,
  readiness,
  env = process.env,
  git = {},
  packageVersion = readPackageVersion()
}) => ({
  productName: "TeamCow",
  version: packageVersion,
  commit: git.commit ?? getGitCommit(),
  ref: env.GITHUB_REF_NAME ?? env.GITHUB_REF ?? "local",
  workflowRunId: env.GITHUB_RUN_ID ?? "local",
  readiness: readiness.classification,
  generatedAt: new Date().toISOString(),
  artifacts: artifacts.flatMap((artifact) => {
    if (artifact === releaseManifestName) {
      return []
    }

    const artifactPath = resolve(releaseDir, artifact)
    const stats = statSync(artifactPath)
    if (!stats.isFile()) {
      return []
    }

    return [{
      path: artifact,
      bytes: stats.size,
      sha256: sha256File(artifactPath)
    }]
  })
})

export const runReleasePlan = (plan) => {
  const buildStartedAt = Date.now()
  printReadiness()

  for (const phase of plan.phases) {
    if (plan.dryRun) {
      console.log(`[release-desktop] dry-run ${phase.name}: ${phase.command.join(" ")}`)
      continue
    }

    runPhase(phase)
  }

  if (plan.dryRun) {
    return { artifacts: [], validation: { ok: true, missing: [], sensitive: [] } }
  }

  const artifacts = collectReleaseArtifacts(plan.releaseDir)
  console.log("[release-desktop] metadata:check")
  const validation = validateReleaseArtifacts(artifacts, { releaseDir: plan.releaseDir, buildStartedAt })
  const readiness = getReleaseReadiness()
  const manifest = createReleaseManifest({ releaseDir: plan.releaseDir, artifacts, readiness })
  writeFileSync(resolve(plan.releaseDir, releaseManifestName), `${JSON.stringify(manifest, null, 2)}\n`)

  console.log("[release-desktop] artifact:list")
  for (const artifact of artifacts) {
    console.log(`- ${artifact}`)
  }

  if (!validation.ok) {
    const details = [
      ...validation.missing.map((item) => `missing ${item}`),
      ...validation.sensitive.map((item) => `sensitive artifact ${item}`),
      ...validation.stale.map((item) => `stale artifact ${item}`),
      ...validation.metadata.map((item) => `metadata ${item}`)
    ]
    throw new Error(`release artifact validation failed: ${details.join("; ")}`)
  }

  return { artifacts, validation }
}

const main = () => {
  const dryRun = process.argv.includes("--dry-run")
  const plan = createReleasePlan({ dryRun })

  try {
    runReleasePlan(plan)
  } catch (error) {
    console.error(`[release-desktop] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
