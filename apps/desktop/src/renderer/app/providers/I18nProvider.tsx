import { useEffect, useState, type PropsWithChildren } from "react"
import i18next from "i18next"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { resources, defaultLocale, namespaces } from "@teamcow/i18n-resources"
import type { Locale } from "@shared/index"

const i18n = i18next.createInstance()

i18n.use(initReactI18next).init({
  resources,
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  ns: namespaces,
  defaultNS: "common",
  interpolation: {
    escapeValue: false
  },
  react: {
    useSuspense: false
  }
})

export { i18n }

export const I18nProvider = ({ children }: PropsWithChildren) => {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const loadLocale = async () => {
      try {
        if (window.teamcow?.getLocale) {
          const locale = await window.teamcow.getLocale()
          if (locale && locale !== i18n.language) {
            await i18n.changeLanguage(locale)
          }
        }
      } catch {
        // Keep the UI bootable in the default locale if persisted locale lookup fails.
      } finally {
        setReady(true)
      }
    }

    void loadLocale()
  }, [])

  if (!ready) {
    return null
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}

export const changeLocale = async (locale: Locale) => {
  const previousLocale = (i18n.resolvedLanguage ?? i18n.language ?? defaultLocale) as Locale
  await i18n.changeLanguage(locale)

  try {
    if (window.teamcow?.setLocale) {
      await window.teamcow.setLocale(locale)
    }
  } catch (error) {
    await i18n.changeLanguage(previousLocale)
    throw error
  }
}
