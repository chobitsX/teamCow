import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { collectI18nProblems } from "../i18n-check.mjs"

const createTempResourceRoot = () => mkdtempSync(join(tmpdir(), "teamcow-i18n-check-"))
const resourcesRoot = resolve(import.meta.dirname, "../../packages/i18n-resources/src")

const writeNamespace = (rootDir, namespace, locale, payload) => {
  const namespaceDir = join(rootDir, namespace)
  mkdirSync(namespaceDir, { recursive: true })
  writeFileSync(join(namespaceDir, `${locale}.json`), JSON.stringify(payload, null, 2))
}

test("collectI18nProblems accepts symmetric non-empty locale resources", () => {
  const rootDir = createTempResourceRoot()

  try {
    writeNamespace(rootDir, "shell", "en", {
      "hero.title": "Chat-first workspace",
      "hero.description": "Inspect the active conversation."
    })
    writeNamespace(rootDir, "shell", "zh", {
      "hero.title": "以聊天为中心的工作台",
      "hero.description": "检查当前会话。"
    })

    const result = collectI18nProblems(rootDir)
    assert.equal(result.problems.length, 0)
    assert.deepEqual(result.namespaces, ["shell"])
  } finally {
    rmSync(rootDir, { recursive: true, force: true })
  }
})

test("collectI18nProblems reports missing keys, blank values, and missing locale files", () => {
  const rootDir = createTempResourceRoot()

  try {
    writeNamespace(rootDir, "chat", "en", {
      "proof.title": "Proof",
      "proof.message": "Ready to continue",
      "proof.step": "Step"
    })
    writeNamespace(rootDir, "chat", "zh", {
      "proof.title": "验证",
      "proof.message": "   "
    })
    writeNamespace(rootDir, "settings", "en", {
      title: "Settings"
    })

    const result = collectI18nProblems(rootDir)

    assert.equal(result.problems.length, 3)
    assert.deepEqual(
      result.problems.map((problem) => problem.code).sort(),
      ["blank-value", "missing-key", "missing-locale-file"]
    )
    assert.ok(result.problems.some((problem) => /proof\.message/.test(problem.message)))
    assert.ok(result.problems.some((problem) => /proof\.step/.test(problem.message)))
    assert.ok(result.problems.some((problem) => /settings/.test(problem.message)))
  } finally {
    rmSync(rootDir, { recursive: true, force: true })
  }
})

test("commit diagnostics and Changes limits stay localized with matching interpolation", () => {
  const readResource = (namespace, locale) => JSON.parse(
    readFileSync(join(resourcesRoot, namespace, `${locale}.json`), "utf8")
  )
  const errorsEn = readResource("errors", "en")
  const errorsZh = readResource("errors", "zh")
  const inspectorEn = readResource("inspector", "en")
  const inspectorZh = readResource("inspector", "zh")

  for (const code of [
    "GIT_COMMIT_EMPTY_INDEX",
    "GIT_COMMIT_IDENTITY_INVALID",
    "GIT_COMMIT_REJECTED",
    "GIT_COMMIT_FAILED"
  ]) {
    assert.ok(errorsEn[code])
    assert.ok(errorsZh[code])
    assert.ok(errorsEn[`suggestion.${code}`])
    assert.ok(errorsZh[`suggestion.${code}`])
  }

  for (const key of [
    "changes.commit.success",
    "changes.commit.too-long",
    "changes.diff.render-truncated",
    "changes.unavailable",
    "changes.unsupported"
  ]) {
    assert.ok(inspectorEn[key])
    assert.ok(inspectorZh[key])
    const placeholders = (message) => [...message.matchAll(/{{\s*([^}\s]+)\s*}}/g)]
      .map((match) => match[1])
      .sort()
    assert.deepEqual(placeholders(inspectorEn[key]), placeholders(inspectorZh[key]))
  }
})
