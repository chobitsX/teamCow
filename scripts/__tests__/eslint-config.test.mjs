import test from "node:test"
import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ESLint } from "eslint"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, "../..")
const configPath = resolve(repoRoot, "eslint.config.mjs")

const lintSnippet = async (code, filePath) => {
  const eslint = new ESLint({
    overrideConfigFile: configPath,
    cwd: repoRoot
  })

  return eslint.lintText(code, { filePath: resolve(repoRoot, filePath) })
}

test("i18n lint blocks renderer literal text", async () => {
  const [result] = await lintSnippet(
    "export const Demo = () => <button>save</button>\n",
    "apps/desktop/src/renderer/tmp-lint-proof.tsx"
  )

  assert.ok(
    result.messages.some((message) => message.ruleId === "i18next/no-literal-string"),
    "expected renderer literal text to be rejected by i18n lint"
  )
})

test("i18n lint allows technical strings in main process code", async () => {
  const [result] = await lintSnippet(
    "export const probe = () => app.getPath(\"userData\")\n",
    "apps/desktop/src/main/tmp-lint-proof.ts"
  )

  assert.equal(
    result.messages.some((message) => message.ruleId === "i18next/no-literal-string"),
    false
  )
})
