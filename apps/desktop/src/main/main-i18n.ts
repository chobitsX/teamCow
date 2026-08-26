import { defaultLocale, resources } from "@teamcow/i18n-resources"
import type { Locale } from "@shared/index"

type MainNamespace = keyof (typeof resources)["en"]

const interpolate = (template: string, params?: Record<string, string>) =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => params?.[key] ?? "")

const getNamespaceBundle = (locale: Locale | null | undefined, namespace: MainNamespace) => {
  const localeResources = resources[locale ?? defaultLocale] ?? resources[defaultLocale]
  return localeResources[namespace] as Record<string, string>
}

export const tMain = (
  locale: Locale | null | undefined,
  namespace: MainNamespace,
  key: string,
  params?: Record<string, string>
) => {
  const currentBundle = getNamespaceBundle(locale, namespace)
  const fallbackBundle = getNamespaceBundle(defaultLocale, namespace)
  const template = currentBundle[key] ?? fallbackBundle[key] ?? key
  return interpolate(template, params)
}
