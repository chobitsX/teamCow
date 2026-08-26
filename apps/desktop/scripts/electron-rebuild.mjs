import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, "..")
const desktopPackage = JSON.parse(readFileSync(resolve(desktopRoot, "package.json"), "utf8"))
const electronVersion = desktopPackage.devDependencies?.electron

const args = [
  "--version",
  electronVersion,
  "--arch",
  process.arch,
  "--force",
  "--which-module",
  "better-sqlite3,node-pty",
  "--build-from-source"
]

const getMacOsCxxFlags = () => {
  if (process.platform !== "darwin") {
    return ""
  }

  const sdk = spawnSync("xcrun", ["--show-sdk-path"], {
    encoding: "utf8"
  })
  if (sdk.status !== 0) {
    return ""
  }

  const sdkPath = sdk.stdout.trim()
  return sdkPath ? `-isystem ${sdkPath}/usr/include/c++/v1` : ""
}

const macOsCxxFlags = getMacOsCxxFlags()
const existingCxxFlags = process.env.CXXFLAGS?.trim()
const cxxFlags = [existingCxxFlags, macOsCxxFlags].filter(Boolean).join(" ")

const result = spawnSync("electron-rebuild", args, {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(cxxFlags ? { CXXFLAGS: cxxFlags } : {})
  }
})

process.exit(result.status ?? 1)
