/* eslint-disable i18next/no-literal-string -- This provider emits only machine theme values ("dark"/"light"/"system") and internal flags; all user-facing theme labels live in SettingsDrawer via t(). */
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from "react"
import type { AppThemePreference } from "@shared/index"

type ResolvedTheme = "dark" | "light"

type ThemeContextValue = {
  preference: AppThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: AppThemePreference) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)"

const systemResolved = (): ResolvedTheme =>
  typeof window.matchMedia === "function" && window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light"

const resolvePreference = (preference: AppThemePreference): ResolvedTheme =>
  preference === "system" ? systemResolved() : preference

const applyResolvedTheme = (resolved: ResolvedTheme) => {
  const root = document.documentElement
  root.dataset.themeSwitching = "true"
  root.dataset.theme = resolved
  // Drop the transition-suppression flag on the next frame so theme swaps don't smear colors.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      delete root.dataset.themeSwitching
    })
  })
}

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const [preference, setPreferenceState] = useState<AppThemePreference>("dark")
  const [resolved, setResolved] = useState<ResolvedTheme>("dark")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (window.teamcow?.getAppTheme) {
          const stored = await window.teamcow.getAppTheme()
          if (!cancelled) {
            setPreferenceState(stored)
          }
        }
      } catch {
        // Keep the UI bootable in the default theme if the persisted lookup fails.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const next = resolvePreference(preference)
    setResolved(next)
    applyResolvedTheme(next)

    if (preference !== "system" || typeof window.matchMedia !== "function") {
      return
    }

    const media = window.matchMedia(DARK_MEDIA_QUERY)
    const onChange = (event: MediaQueryListEvent | { matches: boolean }) => {
      const resolvedNext: ResolvedTheme = event.matches ? "dark" : "light"
      setResolved(resolvedNext)
      applyResolvedTheme(resolvedNext)
    }
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [preference])

  const setPreference = useCallback(async (next: AppThemePreference) => {
    const previous = preference
    setPreferenceState(next)
    try {
      if (window.teamcow?.setAppTheme) {
        await window.teamcow.setAppTheme(next)
      }
    } catch (error) {
      setPreferenceState(previous)
      throw error
    }
  }, [preference])

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextValue => {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return value
}
