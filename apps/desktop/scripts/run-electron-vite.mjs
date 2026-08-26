import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopDir = resolve(scriptDir, "..")
const electronVitePackageJson = require.resolve("electron-vite/package.json")
const electronViteBin = resolve(dirname(electronVitePackageJson), "bin/electron-vite.js")

const [, , command = "dev", ...args] = process.argv
const childEnv = { ...process.env }

// Some agent runtimes snapshot shell state with ELECTRON_RUN_AS_NODE=1.
// If that leaks into desktop dev, Electron boots as plain Node and app.whenReady() is undefined.
delete childEnv.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [electronViteBin, command, ...args], {
  cwd: desktopDir,
  env: childEnv,
  stdio: "inherit"
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

child.on("error", (error) => {
  console.error(error)
  process.exit(1)
})
