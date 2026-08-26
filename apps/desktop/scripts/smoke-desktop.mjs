import { readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, "..")
const requiredOutputs = [
  "out/main/index.js",
  "out/preload/index.js",
  "out/renderer/index.html"
]

for (const relativePath of requiredOutputs) {
  const outputPath = resolve(desktopRoot, relativePath)
  const stats = statSync(outputPath)

  if (!stats.isFile() || stats.size === 0) {
    throw new Error(`Desktop smoke check failed for ${relativePath}`)
  }
}

const mainBundle = readFileSync(resolve(desktopRoot, "out/main/index.js"), "utf8")
const runtimeTsWorkspaceDependencies = [
  "@teamcow/i18n-resources"
]

for (const dependencyName of runtimeTsWorkspaceDependencies) {
  if (mainBundle.includes(`require("${dependencyName}")`) || mainBundle.includes(`from "${dependencyName}"`)) {
    throw new Error(`Desktop smoke check failed: main bundle externalizes ${dependencyName}`)
  }
}

console.log(`desktop smoke passed for ${requiredOutputs.length} build outputs`)
