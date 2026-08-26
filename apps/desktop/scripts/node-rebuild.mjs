import { spawnSync } from "node:child_process"

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

const result = spawnSync("npm", ["rebuild", "better-sqlite3"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(cxxFlags ? { CXXFLAGS: cxxFlags } : {})
  }
})

process.exit(result.status ?? 1)
