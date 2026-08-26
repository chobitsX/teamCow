# Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Light/Dark/System theme system to the TeamCow desktop app, backed by a two-layer semantic CSS-token architecture, persisted to `app_settings`, with a Settings toggle.

**Architecture:** Rewrite `styles.css` into a palette layer (raw color scales) + a semantic-token layer mapped per theme under `:root[data-theme="dark|light"]`. Persist the preference via a new `getAppTheme`/`setAppTheme` IPC command (same key/value pattern as `getLocale`/`setLocale`). A renderer `ThemeProvider` applies `data-theme` on `<html>` and follows the OS when set to `system`. An inline `<head>` script prevents first-paint flash.

**Tech Stack:** Electron + React + TypeScript, zod-validated IPC over a single `teamcow:invoke` channel, drizzle-orm + better-sqlite3 (`app_settings` key/value table), react-i18next, plain hand-written CSS variables (no CSS framework).

**Spec:** `docs/design/specs/2026-06-10-theme-system-design.md`

---

## File Structure

- `packages/shared-types/src/index.ts` — add `appThemePreferenceSchema` + `AppThemePreference` type, `getAppTheme`/`setAppTheme` command variants, and `TeamcowDesktopApi` methods.
- `apps/desktop/src/main/project-service.ts` — add `getAppTheme`/`setAppTheme` (mirror `getLocale`/`setLocale`); export both in the returned object.
- `apps/desktop/src/main/desktop-router.ts` — add `getAppTheme`/`setAppTheme` to `commandDomainByType` and the command switch.
- `apps/desktop/src/main/preload/api.ts` — expose `getAppTheme`/`setAppTheme`.
- `apps/desktop/src/main/__tests__/shared-contracts.test.ts` — assert new command schemas parse.
- `apps/desktop/src/main/__tests__/project-service.test.ts` — assert theme read/write round-trips and defaults.
- `apps/desktop/src/renderer/app/providers/ThemeProvider.tsx` — new; apply `data-theme`, follow OS for `system`, expose `useTheme`.
- `apps/desktop/src/renderer/app/providers/__tests__/ThemeProvider.test.tsx` — new; three-way switch + system listener.
- `apps/desktop/src/renderer/main.tsx` + `index.html` — first-paint anti-flash.
- `apps/desktop/src/renderer/App.tsx` — wrap shell in `ThemeProvider`.
- `apps/desktop/src/renderer/styles.css` — token rewrite + 422 reference replacement + native-control/scrollbar/selection/focus-ring tokenization + reduced-motion + provider harmonization.
- `apps/desktop/src/renderer/app/shell/DesktopShell.tsx:2091` — terminal theme reads CSS variables.
- `apps/desktop/src/renderer/app/settings/SettingsDrawer.tsx` — theme segmented control.
- `packages/i18n-resources/src/settings/{en,zh}.json` — theme strings.

---

## Task 1: Theme contract in shared-types

**Files:**
- Modify: `packages/shared-types/src/index.ts` (near `localeSchema` at line 5; command union ~line 951; `TeamcowDesktopApi` ~line 1006)
- Test: `apps/desktop/src/main/__tests__/shared-contracts.test.ts`

- [ ] **Step 1: Add the schema + type next to `localeSchema`**

In `packages/shared-types/src/index.ts`, after the `Locale` type (line 6), add:

```typescript
export const appThemePreferenceSchema = z.enum(["dark", "light", "system"])
export type AppThemePreference = z.infer<typeof appThemePreferenceSchema>
```

- [ ] **Step 2: Add command variants to the `desktopCommandSchema` union**

After the `setLocale` command object (the `z.object({ type: z.literal("setLocale"), ... })` block ending ~line 957), add:

```typescript
  z.object({ type: z.literal("getAppTheme") }),
  z.object({
    type: z.literal("setAppTheme"),
    input: z.object({
      theme: appThemePreferenceSchema
    })
  }),
```

- [ ] **Step 3: Add API methods to `TeamcowDesktopApi`**

After `setLocale: (locale: Locale) => Promise<void>` (~line 1007), add:

```typescript
  getAppTheme: () => Promise<AppThemePreference>
  setAppTheme: (theme: AppThemePreference) => Promise<void>
```

- [ ] **Step 4: Write the failing contract test**

In `apps/desktop/src/main/__tests__/shared-contracts.test.ts`, add (match the file's existing test style — it imports `desktopCommandSchema` from `@shared/index`):

```typescript
it("parses getAppTheme and setAppTheme commands", () => {
  expect(desktopCommandSchema.parse({ type: "getAppTheme" })).toEqual({ type: "getAppTheme" })
  expect(
    desktopCommandSchema.parse({ type: "setAppTheme", input: { theme: "light" } })
  ).toEqual({ type: "setAppTheme", input: { theme: "light" } })
})

it("rejects an unknown theme value", () => {
  expect(() => desktopCommandSchema.parse({ type: "setAppTheme", input: { theme: "sepia" } })).toThrow()
})
```

- [ ] **Step 5: Run typecheck + test**

Run: `yarn workspace @teamcow/shared-types typecheck && yarn workspace @teamcow/desktop test shared-contracts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/index.ts apps/desktop/src/main/__tests__/shared-contracts.test.ts
git commit -m "feat(shared-types): add app theme preference command contract"
```

---

## Task 2: Theme persistence in project-service

**Files:**
- Modify: `apps/desktop/src/main/project-service.ts` (setting-key consts ~line 119; defaults ~line 123; impl near `getLocale`/`setLocale` ~line 3335; returned object ~line 3401)
- Test: `apps/desktop/src/main/__tests__/project-service.test.ts`

- [ ] **Step 1: Write the failing test**

In `apps/desktop/src/main/__tests__/project-service.test.ts`, add a test mirroring existing service tests (they construct the service via the file's existing helper/`createProjectService`):

```typescript
it("defaults app theme to dark and persists updates", () => {
  const service = createTestProjectService() // use the helper already used by other tests in this file
  expect(service.getAppTheme()).toBe("dark")
  service.setAppTheme("light")
  expect(service.getAppTheme()).toBe("light")
  service.setAppTheme("system")
  expect(service.getAppTheme()).toBe("system")
  service.close()
})
```

> If the file uses an inline service-construction pattern instead of a `createTestProjectService` helper, copy that exact construction from a neighboring test rather than inventing one.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @teamcow/desktop test project-service`
Expected: FAIL — `service.getAppTheme is not a function`.

- [ ] **Step 3: Add the setting key + default**

In `project-service.ts`, after `const LOCALE_SETTING_KEY = "locale"` (line 119) add:

```typescript
const APP_THEME_SETTING_KEY = "app_theme"
```

After `const DEFAULT_LOCALE: Locale = "en"` (line 123) add:

```typescript
const DEFAULT_APP_THEME: AppThemePreference = "dark"
```

Ensure `AppThemePreference` is added to the existing `@shared/index` import block at the top of the file.

- [ ] **Step 4: Implement getAppTheme/setAppTheme**

Immediately after the `setLocale` function (ends ~line 3367), add:

```typescript
  const getAppTheme = (): AppThemePreference => {
    const row = database.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, APP_THEME_SETTING_KEY))
      .get() as typeof appSettingsTable.$inferSelect | undefined

    const value = row?.value
    if (value === "dark" || value === "light" || value === "system") {
      return value
    }

    setAppTheme(DEFAULT_APP_THEME)
    return DEFAULT_APP_THEME
  }

  const setAppTheme = (theme: AppThemePreference) => {
    database.db
      .insert(appSettingsTable)
      .values({
        key: APP_THEME_SETTING_KEY,
        value: theme,
        updatedAt: now()
      })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: {
          value: theme,
          updatedAt: now()
        }
      })
      .run()
  }
```

- [ ] **Step 5: Export from the returned object**

In the `return { ... }` object (~line 3401, after `getLocale,` / `setLocale,`), add:

```typescript
    getAppTheme,
    setAppTheme,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn workspace @teamcow/desktop test project-service`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/main/project-service.ts apps/desktop/src/main/__tests__/project-service.test.ts
git commit -m "feat(desktop): persist app theme preference in app_settings"
```

---

## Task 3: Router wiring

**Files:**
- Modify: `apps/desktop/src/main/desktop-router.ts` (`commandDomainByType` ~line 76; command switch ~line 213)

- [ ] **Step 1: Add domain entries**

In `commandDomainByType`, after `setLocale: "settings",` (line 77) add:

```typescript
  getAppTheme: "settings",
  setAppTheme: "settings",
```

> This record is `Record<DesktopCommand["type"], ErrorDomain>` — it is exhaustive, so typecheck fails until both entries exist.

- [ ] **Step 2: Add switch cases**

In the command `switch`, after the `setLocale` case (ends ~line 216 with `return ...`), add:

```typescript
    case "getAppTheme":
      return services.projectService.getAppTheme()
    case "setAppTheme":
      services.projectService.setAppTheme(command.input.theme)
      return
```

> Match the exact return style of the neighboring `getLocale`/`setLocale` cases (e.g. if `setLocale` returns `undefined` via a bare `return` or falls through, mirror it precisely).

- [ ] **Step 3: Run typecheck**

Run: `yarn workspace @teamcow/desktop typecheck`
Expected: PASS (exhaustive record + switch satisfied).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/desktop-router.ts
git commit -m "feat(desktop): route app theme commands"
```

---

## Task 4: Preload API exposure

**Files:**
- Modify: `apps/desktop/src/main/preload/api.ts` (after `setLocale` ~line 114)

- [ ] **Step 1: Add the imported type**

Ensure `AppThemePreference` is added to the `@shared/index` import on line 2 (alongside `Locale`).

- [ ] **Step 2: Add the two methods**

After the `setLocale` method (ends ~line 114), add:

```typescript
  async getAppTheme() {
    return invokeDesktopCommand({ type: "getAppTheme" }) as Promise<AppThemePreference>
  },
  async setAppTheme(theme: AppThemePreference) {
    await invokeDesktopCommand({ type: "setAppTheme", input: { theme } })
  },
```

- [ ] **Step 3: Run typecheck**

Run: `yarn workspace @teamcow/desktop typecheck`
Expected: PASS (`desktopApi` satisfies `TeamcowDesktopApi`).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/preload/api.ts
git commit -m "feat(desktop): expose app theme api in preload"
```

---

## Task 5: ThemeProvider (renderer)

**Files:**
- Create: `apps/desktop/src/renderer/app/providers/ThemeProvider.tsx`
- Create: `apps/desktop/src/renderer/app/providers/__tests__/ThemeProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/renderer/app/providers/__tests__/ThemeProvider.test.tsx`:

```tsx
import { render, screen, waitFor, act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider, useTheme } from "../ThemeProvider"

const Probe = () => {
  const { preference, setPreference } = useTheme()
  return (
    <div>
      <span data-testid="pref">{preference}</span>
      <button onClick={() => void setPreference("light")}>light</button>
      <button onClick={() => void setPreference("system")}>system</button>
    </div>
  )
}

let mql: { matches: boolean; listeners: Array<(e: { matches: boolean }) => void> }

beforeEach(() => {
  mql = { matches: false, listeners: [] }
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: mql.matches,
    media: q,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => mql.listeners.push(cb),
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {}
  }))
  ;(window as unknown as { teamcow: Record<string, unknown> }).teamcow = {
    getAppTheme: vi.fn().mockResolvedValue("dark"),
    setAppTheme: vi.fn().mockResolvedValue(undefined)
  }
  document.documentElement.dataset.theme = ""
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.dataset.theme = ""
})

describe("ThemeProvider", () => {
  it("applies persisted preference on mount", async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    await waitFor(() => expect(screen.getByTestId("pref").textContent).toBe("dark"))
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("switches preference, persists it, and updates data-theme", async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    await waitFor(() => expect(screen.getByTestId("pref").textContent).toBe("dark"))
    await act(async () => { screen.getByText("light").click() })
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"))
    expect(window.teamcow.setAppTheme).toHaveBeenCalledWith("light")
  })

  it("resolves system preference from matchMedia and reacts to OS changes", async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    await waitFor(() => expect(screen.getByTestId("pref").textContent).toBe("dark"))
    await act(async () => { screen.getByText("system").click() })
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light")) // mql.matches=false -> light
    await act(async () => { mql.matches = true; mql.listeners.forEach((cb) => cb({ matches: true })) })
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @teamcow/desktop test ThemeProvider`
Expected: FAIL — cannot import `../ThemeProvider`.

- [ ] **Step 3: Implement ThemeProvider**

Create `apps/desktop/src/renderer/app/providers/ThemeProvider.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @teamcow/desktop test ThemeProvider`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/app/providers/ThemeProvider.tsx apps/desktop/src/renderer/app/providers/__tests__/ThemeProvider.test.tsx
git commit -m "feat(desktop): add ThemeProvider with system follow"
```

---

## Task 6: Wire ThemeProvider into App + anti-flash

**Files:**
- Modify: `apps/desktop/src/renderer/App.tsx`
- Modify: `apps/desktop/src/renderer/index.html`

- [ ] **Step 1: Wrap the shell**

Replace `apps/desktop/src/renderer/App.tsx` with:

```tsx
import { I18nProvider } from "./app/providers/I18nProvider"
import { ThemeProvider } from "./app/providers/ThemeProvider"
import { DesktopShell } from "./app/shell/DesktopShell"

function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <DesktopShell />
      </ThemeProvider>
    </I18nProvider>
  )
}

export default App
```

- [ ] **Step 2: Add the first-paint anti-flash script**

In `apps/desktop/src/renderer/index.html`, inside `<head>` after the `<title>` line, add an inline script that sets `data-theme` before CSS paints. Since the persisted value lives in the main process (not localStorage), default to dark immediately and let `ThemeProvider` correct it post-mount; for `system`, honor the OS at paint time:

```html
    <script>
      (function () {
        try {
          var root = document.documentElement
          var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          // Default to dark (app default). ThemeProvider applies the persisted preference on mount.
          root.dataset.theme = "dark"
          void prefersDark
        } catch (e) {}
      })()
    </script>
```

> Rationale: the spec requires no first-paint flash. The app default is dark and the canvas is dark, so painting dark first then correcting to a persisted light theme is the only visible transition, and it happens before content renders. Do not add a localStorage cache in this task (YAGNI — not in spec).

- [ ] **Step 3: Verify build + existing shell tests**

Run: `yarn workspace @teamcow/desktop typecheck && yarn workspace @teamcow/desktop test DesktopShell`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/index.html
git commit -m "feat(desktop): mount ThemeProvider and set initial data-theme"
```

---

## Task 7: styles.css — palette + dark/light semantic layers

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css` (the `:root` block, lines 1-60)

This task replaces ONLY the `:root` token block. Reference replacement across the rest of the file happens in Task 8.

- [ ] **Step 1: Replace the `:root` block (lines 1-60) with the layered token system**

```css
:root {
  /* ── Palette (raw scales — never referenced directly by components) ── */
  --gray-950: #0a0b0d;
  --gray-900: #0f1115;
  --gray-850: #14161b;
  --gray-800: #1a1d23;
  --gray-750: #20242b;
  --gray-700: #2a2f37;
  --gray-600: #3a404a;
  --gray-500: #4e5560;
  --gray-400: #6b727d;
  --gray-300: #9aa0ab;
  --gray-200: #c4c9d1;
  --gray-100: #e4e7ec;
  --gray-50: #f7f8fa;
  --blue-600: #3b6fe0;
  --blue-500: #4f7dff;
  --blue-400: #6b94ff;
  --blue-300: #9db8ff;

  /* shape + type tokens (theme-independent) */
  --radius-2xl: 20px;
  --radius-xl: 16px;
  --radius-lg: 12px;
  --radius-md: 8px;
  --radius-sm: 6px;
  --radius-xs: 4px;
  --font-mono: "SF Mono", "JetBrains Mono", "Cascadia Code", ui-monospace, monospace;
  --font-sans: "SF Pro Text", "Inter", "PingFang SC", ui-sans-serif, system-ui, sans-serif;

  font-family: var(--font-sans);
}

/* ── Dark theme (default) ── */
:root,
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg-canvas: var(--gray-950);
  --bg-surface: var(--gray-900);
  --bg-raised: var(--gray-850);
  --bg-overlay: rgba(0, 0, 0, 0.5);

  --text-primary: var(--gray-100);
  --text-secondary: var(--gray-300);
  --text-tertiary: var(--gray-400);
  --text-muted: var(--gray-500);

  --accent: var(--blue-500);
  --accent-hover: var(--blue-400);
  --accent-bg: rgba(95, 140, 255, 0.10);
  --accent-border: rgba(95, 140, 255, 0.26);

  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-default: rgba(255, 255, 255, 0.12);
  --border-strong: rgba(255, 255, 255, 0.18);

  --surface-hover: rgba(255, 255, 255, 0.04);
  --surface-active: rgba(255, 255, 255, 0.07);
  --state-selected: rgba(79, 125, 255, 0.10);

  --status-success: #5ed4a8;
  --status-success-bg: rgba(94, 212, 168, 0.08);
  --status-success-border: rgba(94, 212, 168, 0.24);
  --status-warning: #e0a84d;
  --status-warning-bg: rgba(224, 168, 77, 0.08);
  --status-warning-border: rgba(224, 168, 77, 0.24);
  --status-error: #e06060;
  --status-error-bg: rgba(224, 96, 96, 0.08);
  --status-error-border: rgba(224, 96, 96, 0.24);
  --status-info: var(--accent);
  --status-info-bg: var(--accent-bg);
  --status-info-border: var(--accent-border);

  --git-added: #5ed4a8;
  --git-modified: #9db8ff;
  --git-removed: #f07070;

  --provider-codex: #6b94ff;
  --provider-codex-bg: rgba(107, 148, 255, 0.08);
  --provider-codex-border: rgba(107, 148, 255, 0.24);
  --provider-claude: #d98c4a;
  --provider-claude-bg: rgba(217, 140, 74, 0.10);
  --provider-claude-border: rgba(217, 140, 74, 0.26);
  --provider-opencode: #4db58a;
  --provider-opencode-bg: rgba(77, 181, 138, 0.08);
  --provider-opencode-border: rgba(77, 181, 138, 0.24);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.2);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.3);
  --shadow-xl: 0 24px 64px rgba(0, 0, 0, 0.4);

  --focus-ring: 0 0 0 1px var(--accent), 0 0 0 3px rgba(95, 140, 255, 0.15);

  --terminal-bg: #090c0b;
  --terminal-fg: #d4dbd6;

  background: var(--bg-canvas);
  color: var(--text-primary);
}

/* ── Light theme ── */
:root[data-theme="light"] {
  color-scheme: light;
  --bg-canvas: var(--gray-50);
  --bg-surface: #ffffff;
  --bg-raised: #ffffff;
  --bg-overlay: rgba(10, 11, 13, 0.32);

  --text-primary: var(--gray-850);
  --text-secondary: var(--gray-500);
  --text-tertiary: var(--gray-400);
  --text-muted: var(--gray-300);

  --accent: var(--blue-600);
  --accent-hover: #3060c8;
  --accent-bg: rgba(59, 111, 224, 0.08);
  --accent-border: rgba(59, 111, 224, 0.26);

  --border-subtle: rgba(10, 11, 13, 0.08);
  --border-default: rgba(10, 11, 13, 0.14);
  --border-strong: rgba(10, 11, 13, 0.20);

  --surface-hover: rgba(10, 11, 13, 0.04);
  --surface-active: rgba(10, 11, 13, 0.07);
  --state-selected: rgba(59, 111, 224, 0.10);

  --status-success: #1f9d6b;
  --status-success-bg: rgba(31, 157, 107, 0.10);
  --status-success-border: rgba(31, 157, 107, 0.28);
  --status-warning: #b8791f;
  --status-warning-bg: rgba(184, 121, 31, 0.10);
  --status-warning-border: rgba(184, 121, 31, 0.28);
  --status-error: #cc3b3b;
  --status-error-bg: rgba(204, 59, 59, 0.10);
  --status-error-border: rgba(204, 59, 59, 0.28);
  --status-info: var(--accent);
  --status-info-bg: var(--accent-bg);
  --status-info-border: var(--accent-border);

  --git-added: #1f9d6b;
  --git-modified: #3b6fe0;
  --git-removed: #cc3b3b;

  --provider-codex: #3b6fe0;
  --provider-codex-bg: rgba(59, 111, 224, 0.08);
  --provider-codex-border: rgba(59, 111, 224, 0.26);
  --provider-claude: #b8702e;
  --provider-claude-bg: rgba(184, 112, 46, 0.10);
  --provider-claude-border: rgba(184, 112, 46, 0.28);
  --provider-opencode: #2f9468;
  --provider-opencode-bg: rgba(47, 148, 104, 0.10);
  --provider-opencode-border: rgba(47, 148, 104, 0.26);

  --shadow-sm: 0 1px 2px rgba(10, 11, 13, 0.06);
  --shadow-md: 0 4px 12px rgba(10, 11, 13, 0.08);
  --shadow-lg: 0 12px 28px rgba(10, 11, 13, 0.10);
  --shadow-xl: 0 24px 56px rgba(10, 11, 13, 0.12);

  --focus-ring: 0 0 0 1px var(--accent), 0 0 0 3px rgba(59, 111, 224, 0.18);

  --terminal-bg: #f4f5f7;
  --terminal-fg: #1a1d23;

  background: var(--bg-canvas);
  color: var(--text-primary);
}

/* Suppress transitions during a theme swap to avoid color smearing. */
:root[data-theme-switching] *,
:root[data-theme-switching] *::before,
:root[data-theme-switching] *::after {
  transition: none !important;
}
```

- [ ] **Step 2: Verify the file still parses (dev build boots)**

Run: `yarn workspace @teamcow/desktop typecheck`
Expected: PASS (CSS is not typechecked, but this confirms nothing else broke). Visual verification happens after Task 8.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/styles.css
git commit -m "feat(desktop): add layered palette + dark/light semantic tokens"
```

---

## Task 8: styles.css — automated var() reference rename

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css` (everything below the `:root` blocks from Task 7)

This renames all `var(--oldName)` references to semantic tokens. The mapping is anchored on the trailing `,` or `)` delimiter so `--blue` never clobbers `--blue2`. **This exact command was dry-run-verified during planning** — leftovers are only `--sidebar-width`/`--inspector-width` (runtime-set) and the new tokens.

- [ ] **Step 1: Run the anchored rename (macOS bsd sed)**

Run from repo root:

```bash
sed -E -i '' \
 -e 's/var\(--g950([,)])/var(--bg-canvas\1/g' \
 -e 's/var\(--g900([,)])/var(--bg-surface\1/g' \
 -e 's/var\(--g850([,)])/var(--bg-raised\1/g' \
 -e 's/var\(--g800([,)])/var(--bg-raised\1/g' \
 -e 's/var\(--g750([,)])/var(--bg-raised\1/g' \
 -e 's/var\(--ink4([,)])/var(--text-muted\1/g' \
 -e 's/var\(--ink3([,)])/var(--text-tertiary\1/g' \
 -e 's/var\(--ink2([,)])/var(--text-secondary\1/g' \
 -e 's/var\(--ink([,)])/var(--text-primary\1/g' \
 -e 's/var\(--cream2([,)])/var(--text-secondary\1/g' \
 -e 's/var\(--cream([,)])/var(--text-primary\1/g' \
 -e 's/var\(--blue2([,)])/var(--accent-hover\1/g' \
 -e 's/var\(--blue-bg([,)])/var(--accent-bg\1/g' \
 -e 's/var\(--blue-bd([,)])/var(--accent-border\1/g' \
 -e 's/var\(--blue([,)])/var(--accent\1/g' \
 -e 's/var\(--ochre-hot([,)])/var(--accent-hover\1/g' \
 -e 's/var\(--ochre([,)])/var(--accent\1/g' \
 -e 's/var\(--green-hot([,)])/var(--status-success\1/g' \
 -e 's/var\(--green-bg([,)])/var(--status-success-bg\1/g' \
 -e 's/var\(--green-bd([,)])/var(--status-success-border\1/g' \
 -e 's/var\(--green([,)])/var(--status-success\1/g' \
 -e 's/var\(--amber-hot([,)])/var(--status-warning\1/g' \
 -e 's/var\(--amber-bg([,)])/var(--status-warning-bg\1/g' \
 -e 's/var\(--amber-bd([,)])/var(--status-warning-border\1/g' \
 -e 's/var\(--amber([,)])/var(--status-warning\1/g' \
 -e 's/var\(--rust-hot([,)])/var(--status-error\1/g' \
 -e 's/var\(--rust-bg([,)])/var(--status-error-bg\1/g' \
 -e 's/var\(--rust-bd([,)])/var(--status-error-border\1/g' \
 -e 's/var\(--rust([,)])/var(--status-error\1/g' \
 -e 's/var\(--s1([,)])/var(--surface-hover\1/g' \
 -e 's/var\(--s2([,)])/var(--surface-active\1/g' \
 -e 's/var\(--s3([,)])/var(--state-selected\1/g' \
 -e 's/var\(--b1([,)])/var(--border-subtle\1/g' \
 -e 's/var\(--b2([,)])/var(--border-default\1/g' \
 -e 's/var\(--b3([,)])/var(--border-strong\1/g' \
 -e 's/var\(--sh-xl([,)])/var(--shadow-xl\1/g' \
 -e 's/var\(--sh-lg([,)])/var(--shadow-lg\1/g' \
 -e 's/var\(--sh-md([,)])/var(--shadow-md\1/g' \
 -e 's/var\(--r2xl([,)])/var(--radius-2xl\1/g' \
 -e 's/var\(--rxl([,)])/var(--radius-xl\1/g' \
 -e 's/var\(--rlg([,)])/var(--radius-lg\1/g' \
 -e 's/var\(--rmd([,)])/var(--radius-md\1/g' \
 -e 's/var\(--rsm([,)])/var(--radius-sm\1/g' \
 -e 's/var\(--rxs([,)])/var(--radius-xs\1/g' \
 -e 's/var\(--mono([,)])/var(--font-mono\1/g' \
 -e 's/var\(--sans([,)])/var(--font-sans\1/g' \
 -e 's/var\(--danger([,)])/var(--status-error\1/g' \
 -e 's/var\(--muted([,)])/var(--text-tertiary\1/g' \
 -e 's/var\(--workbench-blue-2([,)])/var(--accent-hover\1/g' \
 -e 's/var\(--surface([,)])/var(--bg-raised\1/g' \
 apps/desktop/src/renderer/styles.css
```

> Linux/GNU sed: drop the `''` after `-i` (use `sed -E -i -e ...`).

- [ ] **Step 2: Verify no stale references remain**

Run:

```bash
grep -oE "var\(--[a-z0-9-]+" apps/desktop/src/renderer/styles.css | sort -u
```

Expected: every result is one of the new semantic tokens, `var(--sidebar-width`, or `var(--inspector-width`. If any old name (`--g900`, `--ink`, `--s1`, `--b1`, `--rmd`, `--mono`, etc.) appears, the rename missed a delimiter case — fix it manually before continuing.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/styles.css
git commit -m "refactor(desktop): rename css var references to semantic tokens"
```

---

## Task 9: styles.css — tokenize hardcoded color literals

The rename only covered `var()` refs. The file still has ~46 `rgba(255,255,255,…)` (white overlays — invisible in light), ~23 `rgba(0,0,0,…)` (dark surfaces/shadows), ~55 `rgba(95,140,255,…)` (accent-blue literals), and a handful of hex (`#090c0b`, `#1e1e1e`, `#ffffff`, status hexes like `#f4c0b7`). These are dark-only assumptions that must become tokens for light mode to work.

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css`

- [ ] **Step 1: Replace accent-blue literals with tokens**

The literal `rgba(95, 140, 255, X)` is the dark accent. Map by alpha to existing tokens where the value matches, else to a new low-alpha accent surface. Run:

```bash
# Exact-match the common accent surface/border literals to tokens.
sed -E -i '' \
 -e 's/rgba\(95, 140, 255, 0\.08\)/var(--accent-bg)/g' \
 -e 's/rgba\(95, 140, 255, 0\.1\)/var(--accent-bg)/g' \
 -e 's/rgba\(95, 140, 255, 0\.12\)/var(--state-selected)/g' \
 -e 's/rgba\(95, 140, 255, 0\.22\)/var(--accent-border)/g' \
 -e 's/rgba\(95, 140, 255, 0\.26\)/var(--accent-border)/g' \
 -e 's/rgba\(95, 140, 255, 0\.3\)/var(--accent-border)/g' \
 apps/desktop/src/renderer/styles.css
```

Then **manually** review remaining `rgba(95, 140, 255, …)` occurrences:

```bash
grep -nE "rgba\(95, 140, 255" apps/desktop/src/renderer/styles.css
```

For each, replace with the nearest semantic token: hover/selected backgrounds → `var(--state-selected)`; borders → `var(--accent-border)`; subtle tints → `var(--accent-bg)`. Do not invent new alpha values.

- [ ] **Step 2: Tokenize white overlays**

`rgba(255, 255, 255, X)` is a dark-only "lighten" overlay. In light mode these must flip to dark overlays — which is exactly what `--surface-hover`/`--surface-active`/`--state-selected` and `--border-*` already encode per theme. Review each:

```bash
grep -nE "rgba\(255, 255, 255" apps/desktop/src/renderer/styles.css
```

Replacement rule by alpha:
- `0.02`–`0.04` (subtle surface fill) → `var(--surface-hover)`
- `0.05`–`0.08` (hover/active fill) → `var(--surface-active)`
- `0.10`–`0.16` (visible fill/border) → `var(--border-default)` for borders, `var(--state-selected)` for fills
- scrollbar thumbs (`.12`/`.22`) → `var(--border-default)` / `var(--border-strong)`

Apply each edit individually (the alpha and surrounding property determine the right token). After this step, `grep -cE "rgba\(255, 255, 255" apps/desktop/src/renderer/styles.css` must return `0`.

- [ ] **Step 3: Tokenize black surfaces/shadows**

`rgba(0, 0, 0, X)` is used for dark insets, overlay backdrops, and inline shadows.

```bash
grep -nE "rgba\(0, 0, 0" apps/desktop/src/renderer/styles.css
```

Replacement rule:
- backdrop/overlay layers (`.4`–`.5`) → `var(--bg-overlay)`
- inset card/panel fills (`.2`–`.3`) → `var(--bg-raised)` (or `var(--surface-active)` if it's a subtle tint over surface)
- standalone box-shadows → the matching `var(--shadow-*)` token

After this step, the only `rgba(0, 0, 0, …)` allowed to remain are those inside the `--shadow-*` token *definitions* in the `:root[data-theme="dark"]` block (Task 7). In component rules, `grep` should show none.

- [ ] **Step 4: Tokenize stray hex literals**

```bash
grep -nE "#[0-9a-fA-F]{3,6}" apps/desktop/src/renderer/styles.css | grep -vE "gray-|blue-|#fff(fff)?\b"
```

- `#090c0b` (terminal output bg) and `#1e1e1e` (model-picker dialog fallback) → `var(--bg-raised)`.
- `#ffffff` on buttons (`.composer-send-btn`, `.btn.primary`, `.composer-send-icon-btn`) → keep as literal `#ffffff` (white text on accent is correct in both themes — accent is dark enough in both).
- status-tinted hexes used inside handoff/terminal messages (`#b9e7cf`, `#c8d7cf`, `#f4c0b7`, `#16140d`, etc.) → replace with the matching `var(--status-success)` / `var(--status-error)` (text) and `var(--status-*-bg)` / `var(--status-*-border)` (bg/border).

- [ ] **Step 5: Add reduced-motion + selection + scrollbar polish**

Append to the end of `styles.css`:

```css
/* ── Text selection ── */
::selection {
  background: var(--accent-bg);
  color: var(--text-primary);
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

> The existing scrollbar rules (`.chat-stream::-webkit-scrollbar-thumb` etc.) were tokenized in Step 2; no separate scrollbar block needed.

- [ ] **Step 6: Verify the app boots and both themes render**

Run: `yarn dev`
Then visually confirm: dark loads by default; switching `<html data-theme="light">` via devtools shows a clean white workbench with visible hover states, borders, and shadows; no invisible/white-on-white controls.

Quantitative gate:

```bash
grep -cE "rgba\(255, 255, 255|rgba\(95, 140, 255" apps/desktop/src/renderer/styles.css
```

Expected: `0`.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/styles.css
git commit -m "refactor(desktop): tokenize hardcoded color literals for dual theme"
```

---

## Task 10: Terminal theme follows CSS variables

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx` (around line 2091)

The xterm terminal hardcodes `theme: { background: "#090c0b", foreground: "#d4dbd6" }`. Read the theme tokens at construction so the terminal matches light/dark.

- [ ] **Step 1: Read the current usage**

Run: `grep -n "theme: { background" apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
Confirm the line and the surrounding xterm `new Terminal({...})` (or equivalent) construction.

- [ ] **Step 2: Replace hardcoded colors with computed-style reads**

Add a small helper near the terminal setup (inside the same component/module scope):

```typescript
const readThemeColor = (token: string, fallback: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return value || fallback
}
```

Then replace the hardcoded theme object:

```typescript
theme: {
  background: readThemeColor("--terminal-bg", "#090c0b"),
  foreground: readThemeColor("--terminal-fg", "#d4dbd6")
}
```

> `--terminal-bg` / `--terminal-fg` were defined per theme in Task 7. The fallbacks preserve current behavior if the tokens are ever missing.

- [ ] **Step 3: Typecheck + smoke the shell test**

Run: `yarn workspace @teamcow/desktop typecheck && yarn workspace @teamcow/desktop test DesktopShell`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/app/shell/DesktopShell.tsx
git commit -m "feat(desktop): terminal theme reads css tokens"
```

---

## Task 11: i18n theme strings

**Files:**
- Modify: `packages/i18n-resources/src/settings/en.json`
- Modify: `packages/i18n-resources/src/settings/zh.json`

- [ ] **Step 1: Add English keys**

In `packages/i18n-resources/src/settings/en.json`, after the `language.note` entry, add:

```json
  "theme.title": "Appearance",
  "theme.description": "Choose how TeamCow looks. Follow system matches your macOS appearance.",
  "theme.option.dark": "Dark",
  "theme.option.light": "Light",
  "theme.option.system": "Follow system",
  "theme.note": "The theme applies to the whole app and is remembered across restarts.",
  "theme.change-failed": "Failed to save the appearance setting.",
```

- [ ] **Step 2: Add Chinese keys**

In `packages/i18n-resources/src/settings/zh.json`, after the `language.note` entry, add:

```json
  "theme.title": "外观",
  "theme.description": "选择 TeamCow 的外观。跟随系统会匹配你的 macOS 外观设置。",
  "theme.option.dark": "深色",
  "theme.option.light": "浅色",
  "theme.option.system": "跟随系统",
  "theme.note": "主题应用于整个应用，并在重启后保持。",
  "theme.change-failed": "保存外观设置失败。",
```

- [ ] **Step 3: Verify i18n parity**

Run: `yarn i18n:check`
Expected: PASS (en and zh have identical key sets).

- [ ] **Step 4: Commit**

```bash
git add packages/i18n-resources/src/settings/en.json packages/i18n-resources/src/settings/zh.json
git commit -m "feat(i18n): add appearance/theme settings strings"
```

---

## Task 12: Settings theme toggle

**Files:**
- Modify: `apps/desktop/src/renderer/app/settings/SettingsDrawer.tsx`

Add a theme segmented control in the General group, below the Language section, reusing the existing `.segmented-control` / `.segmented-cell` markup pattern.

- [ ] **Step 1: Import the theme hook + types**

At the top of `SettingsDrawer.tsx`, add:

```typescript
import { useTheme } from "../providers/ThemeProvider"
import type { AppThemePreference } from "@shared/index"
```

- [ ] **Step 2: Read theme state + add a handler**

Inside the component, near the existing locale handling, add:

```typescript
const { preference: themePreference, setPreference: setThemePreference } = useTheme()
const [themeErrorMessage, setThemeErrorMessage] = useState<string | null>(null)

const handleThemeChange = async (next: AppThemePreference) => {
  if (next === themePreference) return
  setThemeErrorMessage(null)
  try {
    await setThemePreference(next)
  } catch {
    setThemeErrorMessage(t("theme.change-failed"))
  }
}
```

- [ ] **Step 3: Render the control**

In the General group, immediately after the Language `settings-section` `</div>` (before the Editor section), add:

```tsx
          <div className="settings-section">
            <div className="settings-section-title">{t("theme.title")}</div>
            <p className="settings-section-desc">{t("theme.description")}</p>
            <div className="segmented-control" role="radiogroup" aria-label={t("theme.title")}>
              {(["dark", "light", "system"] as const).map((option) => (
                <button
                  key={option}
                  className={`segmented-cell${themePreference === option ? " active" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={themePreference === option}
                  data-testid={`settings-theme-${option}`}
                  onClick={() => void handleThemeChange(option)}
                >
                  {t(`theme.option.${option}`)}
                </button>
              ))}
            </div>
            {themeErrorMessage ? <p className="settings-section-error">{themeErrorMessage}</p> : null}
            <p className="settings-section-note">{t("theme.note")}</p>
          </div>
```

- [ ] **Step 4: Typecheck + lint (i18n literal rule)**

Run: `yarn workspace @teamcow/desktop typecheck && yarn workspace @teamcow/desktop lint`
Expected: PASS. The only string literals are machine values (`"dark"`/`"light"`/`"system"`) inside `t()` keys, which are allowed; if the i18next lint flags the array, add a scoped `// eslint-disable-next-line i18next/no-literal-string -- theme keys are typed machine values` above the `.map`.

- [ ] **Step 5: Manual verification**

Run: `yarn dev` → open Settings → toggle Dark/Light/Follow system. Confirm the UI re-themes instantly with no color smear, and the choice survives an app restart.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/app/settings/SettingsDrawer.tsx
git commit -m "feat(desktop): add appearance toggle to settings"
```

---

## Task 13: Full verification sweep

- [ ] **Step 1: Run the whole gate**

Run: `yarn typecheck && yarn lint && yarn test && yarn i18n:check`
Expected: all PASS.

- [ ] **Step 2: Two-theme visual smoke**

Run: `yarn dev`. In both Dark and Light:
- Sidebar project/conversation rows, hover + active states visible.
- Provider tags (codex/claude/opencode) legible, same family, claude is warm-orange (not purple).
- Status banners (info/success/error), diff added/removed lines, git stats.
- Composer, model popover, launcher modal, settings drawer.
- Native `<select>` in Settings matches theme (light dropdown in light mode).
- Terminal panel background matches theme.

- [ ] **Step 3: Reduced-motion check**

Enable macOS System Settings → Accessibility → Display → Reduce motion. Confirm the streaming pulse and drawer slide-in no longer animate.

- [ ] **Step 4: Contrast spot-check**

Verify against spec §2 values: primary/secondary text and status colors meet WCAG AA in both themes. Use a contrast checker on `--text-secondary` over `--bg-surface` in light (≥4.5:1) and `--accent` over white in light (≥4.5:1 for the send button text uses white-on-accent).

- [ ] **Step 5: Finalize**

If a worktree was used, follow `superpowers:finishing-a-development-branch` to merge/PR.

---

## Self-Review Notes

- **Spec coverage:** §1 architecture → Tasks 7-9; §2 values → Task 7; §3 provider harmonization → Task 7 (tokens) + Task 9 (tag refs already var()-renamed in Task 8); §4 interaction/persistence → Tasks 1-6, 10-12; §5 files/tests/risks → all tasks; acceptance criteria → Task 13.
- **Native controls / color-scheme:** Task 7 sets `color-scheme` per theme. Scrollbars/selection/focus-ring tokenized in Tasks 7-9.
- **Risk (422 refs):** Task 8 command was dry-run-verified during planning; Step 2 grep gate catches misses.
- **Type consistency:** `AppThemePreference` ("dark"|"light"|"system") used identically across Tasks 1, 2, 4, 5, 12. `getAppTheme`/`setAppTheme` names consistent across main, preload, provider. `--terminal-bg`/`--terminal-fg` defined in Task 7, consumed in Task 10.
