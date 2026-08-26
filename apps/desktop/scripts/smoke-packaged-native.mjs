import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const electronPath = require("electron")
const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, "..")
const packagedNativeModules = [
  "release/mac-arm64/TeamCow.app/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
]

for (const relativePath of packagedNativeModules) {
  const nativeModulePath = resolve(desktopRoot, relativePath)

  if (!existsSync(nativeModulePath)) {
    throw new Error(`Packaged native smoke check failed: missing ${relativePath}`)
  }

  const result = spawnSync(
    electronPath,
    [
      "-e",
      `console.log(process.versions.modules); require(${JSON.stringify(nativeModulePath)})`
    ],
    {
      cwd: desktopRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1"
      }
    }
  )

  if (result.status !== 0) {
    throw new Error([
      `Packaged native smoke check failed for ${relativePath}`,
      result.stdout.trim(),
      result.stderr.trim()
    ].filter(Boolean).join("\n"))
  }
}

console.log(`packaged native smoke passed for ${packagedNativeModules.length} native modules`)
