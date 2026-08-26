import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"

const sourceBranch = "dev"
const targetBranch = "main"
const defaultRemote = "public"
const defaultAuthorName = "chobitsX"
const defaultAuthorEmail = "chobitsX@users.noreply.github.com"
const apacheLicenseSha256 = "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"
const maxPublicBlobBytes = 25 * 1024 * 1024

const requiredPublicFiles = [
  "LICENSE",
  "NOTICE",
  "README.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md"
]

const deniedPublicPaths = [
  { pattern: /(^|\/)\.env($|\.)/, description: "environment file" },
  { pattern: /^\.agents\//, description: "local agent state" },
  { pattern: /^\.claude\/(settings|worktrees\/)/, description: "local Claude state" },
  { pattern: /^\.superpowers\//, description: "local Superpowers state" },
  { pattern: /^\.worktrees\//, description: "local worktree state" },
  { pattern: /^_ui-design-images\//, description: "private UI reference" },
  { pattern: /^output\//, description: "generated output" },
  { pattern: /^references\/upstream\//, description: "local upstream checkout" },
  {
    pattern: /^apps\/desktop\/src\/renderer\/public\/file-icons\//,
    description: "generated file icon"
  },
  { pattern: /^app-screenshots\/0001(?:-en)?\.(?:jpg|png)$/, description: "private screenshot" },
  { pattern: /^app-screenshots\/main(?:-en)?\.(?:jpg|png)$/, description: "private screenshot" },
  { pattern: /^design-qa\.md$/, description: "local design QA output" }
]

const secretPattern = [
  "gh[pousr]_[A-Za-z0-9]{20,}",
  "AIza[0-9A-Za-z_-]{20,}",
  "BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY",
  "sk-[A-Za-z0-9_-]{20,}",
  "lu" + "sun",
  "xusheng" + "hua",
  "myai" + "\\.tech"
].join("|")

const runGit = (args, { cwd = process.cwd(), input, env, allowFailure = false, stdio } = {}) => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    input,
    env: { ...process.env, ...env },
    stdio: stdio ?? [input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
  })

  if (!allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim()
    throw new Error(`git ${args.join(" ")} failed: ${detail}`)
  }

  return result
}

const gitOutput = (args, options) => runGit(args, options).stdout.trim()

const branchExists = (branch, cwd) =>
  runGit(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd, allowFailure: true }).status === 0

const listTreeEntries = (branch, cwd) => {
  const output = runGit(["ls-tree", "-r", "-l", "-z", branch], { cwd }).stdout

  return output
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const tabIndex = entry.indexOf("\t")
      const metadata = entry.slice(0, tabIndex).trim().split(/\s+/)
      return {
        mode: metadata[0],
        type: metadata[1],
        object: metadata[2],
        size: metadata[3] === "-" ? null : Number(metadata[3]),
        path: entry.slice(tabIndex + 1)
      }
    })
}

const readBranchFile = (branch, path, cwd) =>
  runGit(["show", `${branch}:${path}`], { cwd }).stdout

export const parseArguments = (argv) => {
  const options = {
    message: "chore: publish open-source snapshot",
    remote: defaultRemote,
    authorName: process.env.PUBLIC_GIT_NAME || defaultAuthorName,
    authorEmail: process.env.PUBLIC_GIT_EMAIL || defaultAuthorEmail,
    runChecks: true,
    push: false,
    dryRun: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`)
      }
      index += 1
      return value
    }

    if (argument === "--message") options.message = nextValue()
    else if (argument === "--remote") options.remote = nextValue()
    else if (argument === "--author-name") options.authorName = nextValue()
    else if (argument === "--author-email") options.authorEmail = nextValue()
    else if (argument === "--skip-checks") options.runChecks = false
    else if (argument === "--push") options.push = true
    else if (argument === "--dry-run") options.dryRun = true
    else if (argument === "--help" || argument === "-h") options.help = true
    else throw new Error(`unknown argument: ${argument}`)
  }

  if (!options.message.trim()) throw new Error("commit message cannot be empty")
  if (!options.authorName.trim()) throw new Error("public author name cannot be empty")
  if (!options.authorEmail.trim()) throw new Error("public author email cannot be empty")

  return options
}

export const validatePublicSnapshot = ({ cwd = process.cwd(), branch = sourceBranch } = {}) => {
  const problems = []
  const entries = listTreeEntries(branch, cwd)
  const paths = new Set(entries.map((entry) => entry.path))

  for (const requiredPath of requiredPublicFiles) {
    if (!paths.has(requiredPath)) problems.push(`missing required public file: ${requiredPath}`)
  }

  for (const entry of entries) {
    const denied = deniedPublicPaths.find(({ pattern }) => pattern.test(entry.path))
    if (denied) problems.push(`denied ${denied.description}: ${entry.path}`)
    if (entry.mode === "160000" || entry.type === "commit") {
      problems.push(`gitlink/submodule is not allowed: ${entry.path}`)
    }
    if (entry.size !== null && entry.size > maxPublicBlobBytes) {
      problems.push(`file exceeds 25 MiB public limit: ${entry.path}`)
    }
  }

  if (paths.has("LICENSE")) {
    const licenseHash = createHash("sha256").update(readBranchFile(branch, "LICENSE", cwd)).digest("hex")
    if (licenseHash !== apacheLicenseSha256) {
      problems.push("LICENSE does not match the official Apache-2.0 text")
    }
  }

  if (paths.has("NOTICE")) {
    const notice = readBranchFile(branch, "NOTICE", cwd)
    if (!notice.includes("Copyright 2026 chobitsX")) {
      problems.push("NOTICE does not contain the expected chobitsX copyright")
    }
  }

  for (const path of paths) {
    if (!path.endsWith("package.json")) continue
    try {
      const packageJson = JSON.parse(readBranchFile(branch, path, cwd))
      if (packageJson.license !== "Apache-2.0") {
        problems.push(`${path} must declare license Apache-2.0`)
      }
    } catch (error) {
      problems.push(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const secretScan = runGit(["grep", "-n", "-I", "-E", secretPattern, branch, "--", "."], {
    cwd,
    allowFailure: true
  })
  if (secretScan.status === 0) {
    problems.push(`possible credential or private identity found:\n${secretScan.stdout.trim()}`)
  } else if (secretScan.status !== 1) {
    problems.push(`secret scan failed: ${(secretScan.stderr || secretScan.stdout).trim()}`)
  }

  return problems
}

const qualityCommands = [
  ["typecheck"],
  ["lint"],
  ["test"],
  ["i18n:check"],
  ["workspace", "@teamcow/desktop", "smoke"]
]

const runQualityChecks = (cwd) => {
  for (const args of qualityCommands) {
    console.log(`[publish-public] yarn ${args.join(" ")}`)
    const result = spawnSync("yarn", args, { cwd, stdio: "inherit", env: process.env })
    if (result.status !== 0) {
      throw new Error(`quality check failed: yarn ${args.join(" ")}`)
    }
  }
}

const readRemoteMain = (remote, cwd) => {
  runGit(["remote", "get-url", remote], { cwd })
  const result = runGit(["ls-remote", "--heads", remote, `refs/heads/${targetBranch}`], {
    cwd,
    allowFailure: true
  })
  if (result.status !== 0) {
    throw new Error(`cannot read ${remote}/${targetBranch}: ${(result.stderr || result.stdout).trim()}`)
  }
  return result.stdout.trim().split(/\s+/)[0] || null
}

const printHelp = () => {
  console.log(`Usage: yarn publish:public [options]

Create one public snapshot commit on main from the current dev tree.

Options:
  --message <text>       Public commit message
  --dry-run              Run validation and checks without updating main
  --skip-checks          Skip typecheck, lint, tests, i18n, and desktop smoke
  --push                 Push only local main to <remote>/main
  --remote <name>        Public remote name (default: public)
  --author-name <name>   Public commit author (default: chobitsX)
  --author-email <email> Public commit email (default: GitHub noreply address)
  --help                 Show this help
`)
}

export const publishPublicSnapshot = ({
  cwd = process.cwd(),
  message = "chore: publish open-source snapshot",
  remote = defaultRemote,
  authorName = defaultAuthorName,
  authorEmail = defaultAuthorEmail,
  runChecks = true,
  push = false,
  dryRun = false
} = {}) => {
  const currentBranch = gitOutput(["branch", "--show-current"], { cwd })
  if (currentBranch !== sourceBranch) {
    throw new Error(`run this command from ${sourceBranch}; current branch is ${currentBranch || "detached HEAD"}`)
  }

  const status = gitOutput(["status", "--porcelain=v1", "--untracked-files=all"], { cwd })
  if (status) throw new Error("working tree must be clean; commit or stash dev changes first")

  const problems = validatePublicSnapshot({ cwd, branch: sourceBranch })
  if (problems.length > 0) {
    throw new Error(`public snapshot validation failed:\n- ${problems.join("\n- ")}`)
  }

  if (runChecks) runQualityChecks(cwd)

  const sourceTree = gitOutput(["rev-parse", `${sourceBranch}^{tree}`], { cwd })
  const hasTarget = branchExists(targetBranch, cwd)
  const previousCommit = hasTarget ? gitOutput(["rev-parse", targetBranch], { cwd }) : null
  const previousTree = hasTarget ? gitOutput(["rev-parse", `${targetBranch}^{tree}`], { cwd }) : null

  if (push) {
    const remoteCommit = readRemoteMain(remote, cwd)
    if (remoteCommit && remoteCommit !== previousCommit) {
      throw new Error(
        `${remote}/${targetBranch} is not the local ${targetBranch}; fetch and integrate public changes before publishing`
      )
    }
  }

  if (previousTree === sourceTree) {
    console.log("[publish-public] main already matches dev; no snapshot commit created")
    if (push) runGit(["push", remote, `refs/heads/${targetBranch}:refs/heads/${targetBranch}`], { cwd, stdio: "inherit" })
    return { changed: false, commit: previousCommit }
  }

  if (dryRun) {
    console.log(`[publish-public] dry-run would ${hasTarget ? "update" : "create"} ${targetBranch}`)
    return { changed: true, commit: null }
  }

  const commitArgs = ["commit-tree", sourceTree]
  if (previousCommit) commitArgs.push("-p", previousCommit)
  const publicIdentity = {
    GIT_AUTHOR_NAME: authorName,
    GIT_AUTHOR_EMAIL: authorEmail,
    GIT_COMMITTER_NAME: authorName,
    GIT_COMMITTER_EMAIL: authorEmail
  }
  const commit = gitOutput(commitArgs, { cwd, input: `${message.trim()}\n`, env: publicIdentity })
  const expectedPrevious = previousCommit || "0000000000000000000000000000000000000000"
  runGit(["update-ref", `refs/heads/${targetBranch}`, commit, expectedPrevious], { cwd })

  console.log(`[publish-public] ${hasTarget ? "updated" : "created"} ${targetBranch} at ${commit.slice(0, 12)}`)
  if (push) runGit(["push", remote, `refs/heads/${targetBranch}:refs/heads/${targetBranch}`], { cwd, stdio: "inherit" })

  return { changed: true, commit }
}

const main = () => {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      printHelp()
      return
    }
    publishPublicSnapshot(options)
  } catch (error) {
    console.error(`[publish-public] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
