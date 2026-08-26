import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import {
  parseArguments,
  publishPublicSnapshot,
  validatePublicSnapshot
} from "../publish-public-snapshot.mjs"

const repoRoot = resolve(import.meta.dirname, "../..")

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim()

const createFixtureRepository = () => {
  const directory = mkdtempSync(join(tmpdir(), "teamcow-public-snapshot-"))
  git(directory, ["init", "-b", "dev"])
  git(directory, ["config", "user.name", "Private Developer"])
  git(directory, ["config", "user.email", "private@example.test"])
  cpSync(resolve(repoRoot, "LICENSE"), join(directory, "LICENSE"))
  writeFileSync(join(directory, "NOTICE"), "TeamCow\nCopyright 2026 chobitsX\n")
  writeFileSync(join(directory, "README.md"), "# Fixture\n")
  writeFileSync(join(directory, "SECURITY.md"), "# Security\n")
  writeFileSync(join(directory, "THIRD_PARTY_NOTICES.md"), "# Notices\n")
  writeFileSync(join(directory, "package.json"), '{"name":"fixture","license":"Apache-2.0"}\n')
  writeFileSync(join(directory, "app.txt"), "first\n")
  git(directory, ["add", "."])
  git(directory, ["commit", "-m", "private development history"])
  return directory
}

test("parseArguments keeps publishing local by default and supports explicit push", () => {
  assert.deepEqual(parseArguments([]), {
    message: "chore: publish open-source snapshot",
    remote: "public",
    authorName: "chobitsX",
    authorEmail: "chobitsX@users.noreply.github.com",
    runChecks: true,
    push: false,
    dryRun: false,
    help: false
  })

  assert.deepEqual(
    parseArguments(["--message", "release snapshot", "--remote", "oss", "--skip-checks", "--push"]),
    {
      message: "release snapshot",
      remote: "oss",
      authorName: "chobitsX",
      authorEmail: "chobitsX@users.noreply.github.com",
      runChecks: false,
      push: true,
      dryRun: false,
      help: false
    }
  )
})

test("validatePublicSnapshot rejects local-only paths and private identities", () => {
  const directory = createFixtureRepository()

  try {
    writeFileSync(join(directory, ".env"), "TOKEN=secret\n")
    mkdirSync(join(directory, "app-screenshots"))
    writeFileSync(join(directory, "app-screenshots/main.jpg"), "private product screenshot\n")
    writeFileSync(join(directory, "private.txt"), `/Users/${"lu" + "sun"}/private\n`)
    git(directory, ["add", "-f", ".env", "app-screenshots/main.jpg", "private.txt"])
    git(directory, ["commit", "-m", "add private fixtures"])

    const problems = validatePublicSnapshot({ cwd: directory })
    assert.match(problems.join("\n"), /denied environment file: \.env/)
    assert.match(problems.join("\n"), /denied private screenshot: app-screenshots\/main\.jpg/)
    assert.match(problems.join("\n"), /possible credential or private identity found/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("publishPublicSnapshot creates an unrelated main root and one commit per dev snapshot", () => {
  const directory = createFixtureRepository()

  try {
    const first = publishPublicSnapshot({ cwd: directory, runChecks: false })
    assert.equal(first.changed, true)
    assert.equal(git(directory, ["branch", "--show-current"]), "dev")
    assert.equal(git(directory, ["rev-list", "--count", "main"]), "1")
    assert.equal(git(directory, ["rev-parse", "dev^{tree}"]), git(directory, ["rev-parse", "main^{tree}"]))
    assert.equal(spawnSync("git", ["merge-base", "dev", "main"], { cwd: directory }).status, 1)
    assert.equal(git(directory, ["show", "-s", "--format=%an <%ae>", "main"]), "chobitsX <chobitsX@users.noreply.github.com>")

    writeFileSync(join(directory, "app.txt"), "second\n")
    git(directory, ["add", "app.txt"])
    git(directory, ["commit", "-m", "continue private development"])

    const second = publishPublicSnapshot({
      cwd: directory,
      message: "chore: publish second snapshot",
      runChecks: false
    })
    assert.equal(second.changed, true)
    assert.equal(git(directory, ["rev-list", "--count", "main"]), "2")
    assert.equal(git(directory, ["rev-parse", "dev^{tree}"]), git(directory, ["rev-parse", "main^{tree}"]))
    assert.equal(git(directory, ["show", "-s", "--format=%s", "main"]), "chore: publish second snapshot")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
