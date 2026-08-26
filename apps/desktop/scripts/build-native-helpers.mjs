import { spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, "..")
const outputDir = resolve(desktopRoot, "out/native")
const helpers = [
  "conversation-file-atomic-write",
  "conversation-change-remove"
]

if (process.platform !== "darwin") {
  console.log("Skipping native helper build: TeamCow native helpers are macOS-only")
  process.exit(0)
}

mkdirSync(outputDir, { recursive: true })

for (const helper of helpers) {
  const sourcePath = resolve(desktopRoot, `src/main/native/${helper}.c`)
  const outputPath = resolve(outputDir, helper)
  const result = spawnSync("clang", ["-O2", "-Wall", "-Wextra", sourcePath, "-o", outputPath], {
    encoding: "utf8",
    stdio: "pipe"
  })

  if (result.status !== 0) {
    if (result.stdout.trim()) {
      console.error(result.stdout.trim())
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim())
    }
    process.exit(result.status ?? 1)
  }

  console.log(`Built native helper: ${outputPath}`)
}
