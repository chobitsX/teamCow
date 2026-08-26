import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_LOCALES = ["en", "zh"]

const flattenMessages = (value, parentKey = "") => {
  if (typeof value === "string") {
    return [[parentKey, value]]
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected translation object at "${parentKey || "<root>"}"`)
  }

  return Object.entries(value).flatMap(([key, childValue]) => {
    const nextKey = parentKey ? `${parentKey}.${key}` : key
    return flattenMessages(childValue, nextKey)
  })
}

const listNamespaces = (resourcesRoot) =>
  readdirSync(resourcesRoot)
    .filter((entry) => {
      const entryPath = join(resourcesRoot, entry)
      return statSync(entryPath).isDirectory()
    })
    .sort()

const readLocaleMap = (filePath) => {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"))
  return new Map(flattenMessages(parsed))
}

const compareLocaleMaps = (namespace, locale, localeMap, baseLocale, baseMap, problems) => {
  const allKeys = [...new Set([...baseMap.keys(), ...localeMap.keys()])].sort()

  for (const key of allKeys) {
    const baseValue = baseMap.get(key)
    const localeValue = localeMap.get(key)

    if (baseValue === undefined || localeValue === undefined) {
      problems.push({
        code: "missing-key",
        namespace,
        locale,
        key,
        message: `[missing-key] namespace "${namespace}" key "${key}" is not symmetric between ${baseLocale}.json and ${locale}.json`
      })
      continue
    }

    if (String(baseValue).trim().length === 0) {
      problems.push({
        code: "blank-value",
        namespace,
        locale: baseLocale,
        key,
        message: `[blank-value] namespace "${namespace}" key "${key}" in ${baseLocale}.json is empty or whitespace-only`
      })
    }

    if (String(localeValue).trim().length === 0) {
      problems.push({
        code: "blank-value",
        namespace,
        locale,
        key,
        message: `[blank-value] namespace "${namespace}" key "${key}" in ${locale}.json is empty or whitespace-only`
      })
    }
  }
}

export const collectI18nProblems = (resourcesRoot, locales = DEFAULT_LOCALES) => {
  const absoluteRoot = resolve(resourcesRoot)
  const namespaces = listNamespaces(absoluteRoot)
  const problems = []
  const [baseLocale, ...comparisonLocales] = locales

  for (const namespace of namespaces) {
    const localeFiles = Object.fromEntries(
      locales.map((locale) => [locale, join(absoluteRoot, namespace, `${locale}.json`)])
    )

    const missingLocales = locales.filter((locale) => {
      try {
        return !statSync(localeFiles[locale]).isFile()
      } catch {
        return true
      }
    })

    for (const locale of missingLocales) {
      problems.push({
        code: "missing-locale-file",
        namespace,
        locale,
        key: null,
        message: `[missing-locale-file] namespace "${namespace}" is missing ${locale}.json`
      })
    }

    if (missingLocales.length > 0) {
      continue
    }

    const baseMap = readLocaleMap(localeFiles[baseLocale])

    for (const locale of comparisonLocales) {
      const localeMap = readLocaleMap(localeFiles[locale])
      compareLocaleMaps(namespace, locale, localeMap, baseLocale, baseMap, problems)
    }
  }

  problems.sort((left, right) => left.message.localeCompare(right.message))

  return {
    namespaces,
    problems
  }
}

const runCli = () => {
  const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)))
  const repoRoot = resolve(scriptDir, "..")
  const resourcesRoot = resolve(repoRoot, "packages/i18n-resources/src")
  const { namespaces, problems } = collectI18nProblems(resourcesRoot)

  if (problems.length === 0) {
    console.log(`i18n-check passed for ${namespaces.length} namespaces in ${relative(repoRoot, resourcesRoot)}`)
    return
  }

  console.error(`i18n-check failed with ${problems.length} problem(s):`)
  for (const problem of problems) {
    console.error(`- ${problem.message}`)
  }
  process.exitCode = 1
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntrypoint) {
  runCli()
}
