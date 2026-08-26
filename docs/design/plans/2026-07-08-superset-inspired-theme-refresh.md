# Superset-Inspired Theme Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh TeamCow's dark and light theme palettes so the whole desktop app, terminal, and Files code editor follow the approved Superset-inspired direction.

**Architecture:** Keep the existing `Dark / Light / System` preference model, `ThemeProvider`, and `data-theme="dark|light"` mechanism. Replace semantic CSS token mappings, add full xterm ANSI theme tokens, route terminal rendering through a focused helper, and replace CodeMirror's generic dark/light themes with TeamCow-owned palettes.

**Tech Stack:** Electron + React + TypeScript, CSS custom properties, xterm.js `ITheme`, CodeMirror 6 `EditorView.theme` + `HighlightStyle`, Vitest.

## Global Constraints

- Package manager is `yarn`; do not create `npm` or `pnpm` lockfiles.
- Do not change Settings UI from segmented control to a Superset-style dropdown.
- Do not add custom theme import, marketplace theme metadata, Monokai, or Catppuccin as extra selectable themes.
- Do not change IPC, DB schema, theme preference persistence, or i18n resources.
- Do not refactor the full `styles.css` or `DesktopShell.tsx` files.
- Keep user-visible copy unchanged; if copy changes accidentally, run `yarn i18n:check`.
- Superpowers work must not auto-commit. Every `git commit` command below is an approval-gated checkpoint and must only run after explicit user permission.
- Existing dirty worktree changes belong to the user; inspect `git status --short` before editing and do not overwrite unrelated work.

---

## File Structure

- `apps/desktop/src/renderer/styles.css` — owns theme CSS variables and small local color cleanup. This remains the single source for app-level semantic tokens.
- `apps/desktop/src/renderer/app/providers/__tests__/ThemePalette.test.ts` — locks important theme token values for dark/light/provider/terminal palettes.
- `apps/desktop/src/renderer/app/shell/terminal-theme.ts` — new focused helper that reads CSS theme tokens and returns an xterm `ITheme`.
- `apps/desktop/src/renderer/app/shell/__tests__/terminal-theme.test.ts` — new focused unit tests for terminal token fallback and token-to-`ITheme` mapping.
- `apps/desktop/src/renderer/app/shell/DesktopShell.tsx` — consumes `readTerminalTheme()` and updates the live xterm instance when the resolved theme changes.
- `apps/desktop/src/renderer/app/shell/editor/editor-syntax-theme.ts` — replaces generic CodeMirror themes with TeamCow-owned editor palettes.
- `apps/desktop/src/renderer/app/shell/editor/__tests__/editor-syntax-theme.test.ts` — new focused unit tests for the exported editor theme palettes.

---

### Task 1: Replace App Theme Token Contract

**Files:**
- Modify: `apps/desktop/src/renderer/app/providers/__tests__/ThemePalette.test.ts`
- Modify: `apps/desktop/src/renderer/styles.css`

**Interfaces:**
- Consumes: existing `:root`, `:root[data-theme="dark"]`, and `:root[data-theme="light"]` CSS variable blocks.
- Produces: updated semantic CSS variables plus full terminal variables used by later tasks:
  - `--terminal-bg`
  - `--terminal-fg`
  - `--terminal-cursor`
  - `--terminal-cursor-accent`
  - `--terminal-selection-bg`
  - `--terminal-black`
  - `--terminal-red`
  - `--terminal-green`
  - `--terminal-yellow`
  - `--terminal-blue`
  - `--terminal-magenta`
  - `--terminal-cyan`
  - `--terminal-white`
  - `--terminal-bright-black`
  - `--terminal-bright-red`
  - `--terminal-bright-green`
  - `--terminal-bright-yellow`
  - `--terminal-bright-blue`
  - `--terminal-bright-magenta`
  - `--terminal-bright-cyan`
  - `--terminal-bright-white`

- [ ] **Step 1: Update the failing palette test**

In `apps/desktop/src/renderer/app/providers/__tests__/ThemePalette.test.ts`, replace the dark expected token test with:

```typescript
  it("uses the Superset-inspired Catppuccin Macchiato workbench tokens", () => {
    const expectedTokens = {
      "--bg-canvas": "#24273A",
      "--bg-surface": "#1E2030",
      "--bg-raised": "#2B2F46",
      "--bg-inset": "#181825",
      "--border-default": "#363A4F",
      "--accent": "#8AADF4",
      "--accent-hover": "#9BBCF8",
      "--text-primary": "#CAD3F5",
      "--text-secondary": "#A5ADCB",
      "--text-muted": "#6E738D",
      "--status-success": "#A6DA95",
      "--status-warning": "#EED49F",
      "--status-error": "#ED8796",
      "--status-info": "#8AADF4"
    }

    expect(
      Object.fromEntries(
        Object.keys(expectedTokens).map((name) => [name, resolveVariable(name)])
      )
    ).toEqual(expectedTokens)
  })
```

Replace the light expected token test with:

```typescript
  it("uses Superset Light neutral workbench tokens in light theme", () => {
    const expectedTokens = {
      "--bg-canvas": "#FFFFFF",
      "--bg-surface": "#F7F7F7",
      "--bg-raised": "#FFFFFF",
      "--bg-inset": "#EFEEEC",
      "--text-primary": "#171717",
      "--text-secondary": "#4F4F4F",
      "--text-muted": "#8A8A8A",
      "--border-subtle": "RGBA(23, 23, 23, 0.08)",
      "--border-default": "RGBA(23, 23, 23, 0.14)",
      "--border-strong": "RGBA(23, 23, 23, 0.22)",
      "--surface-hover": "RGBA(23, 23, 23, 0.045)",
      "--surface-active": "RGBA(23, 23, 23, 0.075)",
      "--terminal-bg": "#FFFFFF"
    }

    expect(
      Object.fromEntries(
        Object.keys(expectedTokens).map((name) => [name, resolveVariableFrom(lightVariables, name)])
      )
    ).toEqual(expectedTokens)
  })
```

Replace the provider token expectations with:

```typescript
    const expectedDarkTokens = {
      "--provider-codex": "#F5BDE6",
      "--provider-codex-gradient": "LINEAR-GRADIENT(90DEG, #F5BDE6 0%, #C6A0F6 100%)",
      "--provider-codex-bg": "RGBA(245, 189, 230, 0.1)",
      "--provider-codex-border": "RGBA(198, 160, 246, 0.3)",
      "--provider-claude": "#F5A97F",
      "--provider-claude-gradient": "LINEAR-GRADIENT(90DEG, #F5A97F 0%, #EED49F 100%)",
      "--provider-claude-bg": "RGBA(245, 169, 127, 0.1)",
      "--provider-claude-border": "RGBA(238, 212, 159, 0.3)",
      "--provider-opencode": "#8BD5CA",
      "--provider-opencode-gradient": "LINEAR-GRADIENT(90DEG, #A6DA95 0%, #91D7E3 100%)",
      "--provider-opencode-bg": "RGBA(139, 213, 202, 0.1)",
      "--provider-opencode-border": "RGBA(145, 215, 227, 0.3)"
    }

    const expectedLightTokens = {
      "--provider-codex": "#8A4FCF",
      "--provider-codex-gradient": "LINEAR-GRADIENT(90DEG, #B63E91 0%, #6F5BC7 100%)",
      "--provider-codex-bg": "RGBA(138, 79, 207, 0.07)",
      "--provider-codex-border": "RGBA(111, 91, 199, 0.22)",
      "--provider-claude": "#A7652F",
      "--provider-claude-gradient": "LINEAR-GRADIENT(90DEG, #B8791F 0%, #A7652F 100%)",
      "--provider-claude-bg": "RGBA(167, 101, 47, 0.08)",
      "--provider-claude-border": "RGBA(167, 101, 47, 0.22)",
      "--provider-opencode": "#287A5D",
      "--provider-opencode-gradient": "LINEAR-GRADIENT(90DEG, #2F7D32 0%, #147D8C 100%)",
      "--provider-opencode-bg": "RGBA(40, 122, 93, 0.08)",
      "--provider-opencode-border": "RGBA(20, 125, 140, 0.22)"
    }
```

Add this new test before the provider test:

```typescript
  it("defines complete xterm terminal palettes for both themes", () => {
    const expectedDarkTokens = {
      "--terminal-bg": "#24273A",
      "--terminal-fg": "#CAD3F5",
      "--terminal-cursor": "#F4DBD6",
      "--terminal-cursor-accent": "#24273A",
      "--terminal-selection-bg": "#5B6078",
      "--terminal-black": "#494D64",
      "--terminal-red": "#ED8796",
      "--terminal-green": "#A6DA95",
      "--terminal-yellow": "#EED49F",
      "--terminal-blue": "#8AADF4",
      "--terminal-magenta": "#F5BDE6",
      "--terminal-cyan": "#91D7E3",
      "--terminal-white": "#B8C0E0",
      "--terminal-bright-black": "#5B6078",
      "--terminal-bright-red": "#ED8796",
      "--terminal-bright-green": "#A6DA95",
      "--terminal-bright-yellow": "#EED49F",
      "--terminal-bright-blue": "#8AADF4",
      "--terminal-bright-magenta": "#F5BDE6",
      "--terminal-bright-cyan": "#91D7E3",
      "--terminal-bright-white": "#CAD3F5"
    }

    const expectedLightTokens = {
      "--terminal-bg": "#FFFFFF",
      "--terminal-fg": "#000000",
      "--terminal-cursor": "#000000",
      "--terminal-cursor-accent": "#FFFFFF",
      "--terminal-selection-bg": "#ADD6FF",
      "--terminal-black": "#2E3436",
      "--terminal-red": "#CC0000",
      "--terminal-green": "#4E9A06",
      "--terminal-yellow": "#C4A000",
      "--terminal-blue": "#3465A4",
      "--terminal-magenta": "#75507B",
      "--terminal-cyan": "#06989A",
      "--terminal-white": "#D3D7CF",
      "--terminal-bright-black": "#555753",
      "--terminal-bright-red": "#EF2929",
      "--terminal-bright-green": "#8AE234",
      "--terminal-bright-yellow": "#FCE94F",
      "--terminal-bright-blue": "#729FCF",
      "--terminal-bright-magenta": "#AD7FA8",
      "--terminal-bright-cyan": "#34E2E2",
      "--terminal-bright-white": "#EEEEEC"
    }

    expect(
      Object.fromEntries(
        Object.keys(expectedDarkTokens).map((name) => [name, resolveVariableFrom(darkVariables, name)])
      )
    ).toEqual(expectedDarkTokens)

    expect(
      Object.fromEntries(
        Object.keys(expectedLightTokens).map((name) => [name, resolveVariableFrom(lightVariables, name)])
      )
    ).toEqual(expectedLightTokens)
  })
```

- [ ] **Step 2: Run the palette test to verify it fails**

Run:

```bash
yarn workspace @teamcow/desktop test ThemePalette
```

Expected: FAIL with mismatches for `--bg-canvas`, `--terminal-*`, and provider tokens.

- [ ] **Step 3: Replace the dark theme token block**

In `apps/desktop/src/renderer/styles.css`, keep the shape/font tokens at the top. Replace the `:root, :root[data-theme="dark"] { ... }` block with:

```css
/* ── Dark theme (default): TeamCow-tuned Catppuccin Macchiato ── */
:root,
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg-canvas: #24273a;
  --bg-surface: #1e2030;
  --bg-raised: #2b2f46;
  --bg-inset: #181825;
  --bg-overlay: rgba(24, 24, 37, 0.72);

  --text-primary: #cad3f5;
  --text-secondary: #a5adcb;
  --text-tertiary: #8087a2;
  --text-muted: #6e738d;

  --accent: #8aadf4;
  --accent-hover: #9bbcf8;
  --accent-bg: rgba(138, 173, 244, 0.14);
  --accent-border: rgba(138, 173, 244, 0.34);

  --border-subtle: rgba(73, 77, 100, 0.54);
  --border-default: #363a4f;
  --border-strong: #494d64;

  --surface-hover: rgba(202, 211, 245, 0.055);
  --surface-active: rgba(202, 211, 245, 0.085);
  --state-selected: rgba(138, 173, 244, 0.16);

  --status-success: #a6da95;
  --status-success-bg: rgba(166, 218, 149, 0.11);
  --status-success-border: rgba(166, 218, 149, 0.3);
  --status-warning: #eed49f;
  --status-warning-bg: rgba(238, 212, 159, 0.12);
  --status-warning-border: rgba(238, 212, 159, 0.32);
  --status-error: #ed8796;
  --status-error-bg: rgba(237, 135, 150, 0.11);
  --status-error-border: rgba(237, 135, 150, 0.32);
  --status-info: #8aadf4;
  --status-info-bg: rgba(138, 173, 244, 0.11);
  --status-info-border: rgba(138, 173, 244, 0.3);

  --git-added: #a6da95;
  --git-modified: #8aadf4;
  --git-removed: #ed8796;

  --provider-codex: #f5bde6;
  --provider-codex-gradient: linear-gradient(90deg, #f5bde6 0%, #c6a0f6 100%);
  --provider-codex-bg: rgba(245, 189, 230, 0.1);
  --provider-codex-border: rgba(198, 160, 246, 0.3);
  --provider-claude: #f5a97f;
  --provider-claude-gradient: linear-gradient(90deg, #f5a97f 0%, #eed49f 100%);
  --provider-claude-bg: rgba(245, 169, 127, 0.1);
  --provider-claude-border: rgba(238, 212, 159, 0.3);
  --provider-opencode: #8bd5ca;
  --provider-opencode-gradient: linear-gradient(90deg, #a6da95 0%, #91d7e3 100%);
  --provider-opencode-bg: rgba(139, 213, 202, 0.1);
  --provider-opencode-border: rgba(145, 215, 227, 0.3);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.28);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.22);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.30);
  --shadow-xl: 0 24px 64px rgba(0, 0, 0, 0.38);

  --focus-ring: 0 0 0 1px #8aadf4, 0 0 0 3px rgba(138, 173, 244, 0.18);

  --terminal-bg: #24273a;
  --terminal-fg: #cad3f5;
  --terminal-cursor: #f4dbd6;
  --terminal-cursor-accent: #24273a;
  --terminal-selection-bg: #5b6078;
  --terminal-black: #494d64;
  --terminal-red: #ed8796;
  --terminal-green: #a6da95;
  --terminal-yellow: #eed49f;
  --terminal-blue: #8aadf4;
  --terminal-magenta: #f5bde6;
  --terminal-cyan: #91d7e3;
  --terminal-white: #b8c0e0;
  --terminal-bright-black: #5b6078;
  --terminal-bright-red: #ed8796;
  --terminal-bright-green: #a6da95;
  --terminal-bright-yellow: #eed49f;
  --terminal-bright-blue: #8aadf4;
  --terminal-bright-magenta: #f5bde6;
  --terminal-bright-cyan: #91d7e3;
  --terminal-bright-white: #cad3f5;

  --bg-base: var(--bg-canvas);
  --bg-hover: var(--surface-hover);
  --accent-fg: #8aadf4;
  --status-error-text: var(--status-error);

  background: var(--bg-canvas);
  color: var(--text-primary);
}
```

- [ ] **Step 4: Replace the light theme token block**

In `apps/desktop/src/renderer/styles.css`, replace the `:root[data-theme="light"] { ... }` block with:

```css
/* ── Light theme: Superset Light-inspired neutral workbench ── */
:root[data-theme="light"] {
  color-scheme: light;
  --bg-canvas: #ffffff;
  --bg-surface: #f7f7f7;
  --bg-raised: #ffffff;
  --bg-inset: #efeeec;
  --bg-overlay: rgba(23, 23, 23, 0.18);

  --text-primary: #171717;
  --text-secondary: #4f4f4f;
  --text-tertiary: #717171;
  --text-muted: #8a8a8a;

  --accent: #2f6fbe;
  --accent-hover: #245fa8;
  --accent-bg: rgba(47, 111, 190, 0.09);
  --accent-border: rgba(47, 111, 190, 0.26);

  --border-subtle: rgba(23, 23, 23, 0.08);
  --border-default: rgba(23, 23, 23, 0.14);
  --border-strong: rgba(23, 23, 23, 0.22);

  --surface-hover: rgba(23, 23, 23, 0.045);
  --surface-active: rgba(23, 23, 23, 0.075);
  --state-selected: rgba(47, 111, 190, 0.10);

  --status-success: #2f7d32;
  --status-success-bg: rgba(47, 125, 50, 0.10);
  --status-success-border: rgba(47, 125, 50, 0.28);
  --status-warning: #b8791f;
  --status-warning-bg: rgba(184, 121, 31, 0.10);
  --status-warning-border: rgba(184, 121, 31, 0.28);
  --status-error: #cc3333;
  --status-error-bg: rgba(204, 51, 51, 0.10);
  --status-error-border: rgba(204, 51, 51, 0.28);
  --status-info: var(--accent);
  --status-info-bg: var(--accent-bg);
  --status-info-border: var(--accent-border);

  --git-added: #2f7d32;
  --git-modified: #2f6fbe;
  --git-removed: #cc3333;

  --provider-codex: #8a4fcf;
  --provider-codex-gradient: linear-gradient(90deg, #b63e91 0%, #6f5bc7 100%);
  --provider-codex-bg: rgba(138, 79, 207, 0.07);
  --provider-codex-border: rgba(111, 91, 199, 0.22);
  --provider-claude: #a7652f;
  --provider-claude-gradient: linear-gradient(90deg, #b8791f 0%, #a7652f 100%);
  --provider-claude-bg: rgba(167, 101, 47, 0.08);
  --provider-claude-border: rgba(167, 101, 47, 0.22);
  --provider-opencode: #287a5d;
  --provider-opencode-gradient: linear-gradient(90deg, #2f7d32 0%, #147d8c 100%);
  --provider-opencode-bg: rgba(40, 122, 93, 0.08);
  --provider-opencode-border: rgba(20, 125, 140, 0.22);

  --shadow-sm: 0 1px 2px rgba(23, 23, 23, 0.06);
  --shadow-md: 0 4px 12px rgba(23, 23, 23, 0.08);
  --shadow-lg: 0 12px 28px rgba(23, 23, 23, 0.10);
  --shadow-xl: 0 24px 56px rgba(23, 23, 23, 0.12);

  --focus-ring: 0 0 0 1px var(--accent), 0 0 0 3px rgba(47, 111, 190, 0.18);

  --terminal-bg: #ffffff;
  --terminal-fg: #000000;
  --terminal-cursor: #000000;
  --terminal-cursor-accent: #ffffff;
  --terminal-selection-bg: #add6ff;
  --terminal-black: #2e3436;
  --terminal-red: #cc0000;
  --terminal-green: #4e9a06;
  --terminal-yellow: #c4a000;
  --terminal-blue: #3465a4;
  --terminal-magenta: #75507b;
  --terminal-cyan: #06989a;
  --terminal-white: #d3d7cf;
  --terminal-bright-black: #555753;
  --terminal-bright-red: #ef2929;
  --terminal-bright-green: #8ae234;
  --terminal-bright-yellow: #fce94f;
  --terminal-bright-blue: #729fcf;
  --terminal-bright-magenta: #ad7fa8;
  --terminal-bright-cyan: #34e2e2;
  --terminal-bright-white: #eeeeec;

  --bg-base: var(--bg-canvas);
  --bg-hover: var(--surface-hover);
  --accent-fg: var(--accent);
  --status-error-text: var(--status-error);

  background: var(--bg-canvas);
  color: var(--text-primary);
}
```

- [ ] **Step 5: Run the palette test to verify it passes**

Run:

```bash
yarn workspace @teamcow/desktop test ThemePalette
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint, approval required**

Do not run this step unless the user explicitly authorizes a commit.

```bash
git add apps/desktop/src/renderer/styles.css apps/desktop/src/renderer/app/providers/__tests__/ThemePalette.test.ts
git commit -m "style(desktop): refresh app theme palettes"
```

---

### Task 2: Wire Full Terminal Theme Tokens

**Files:**
- Create: `apps/desktop/src/renderer/app/shell/terminal-theme.ts`
- Create: `apps/desktop/src/renderer/app/shell/__tests__/terminal-theme.test.ts`
- Modify: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`

**Interfaces:**
- Consumes: terminal CSS variables from Task 1.
- Produces:
  - `readCssThemeColor(token: string, fallback: string, root?: Element): string`
  - `readTerminalTheme(root?: Element): ITheme`
- `DesktopShell` uses `readTerminalTheme()` for xterm initialization and live theme refresh.

- [ ] **Step 1: Write the failing terminal theme helper test**

Create `apps/desktop/src/renderer/app/shell/__tests__/terminal-theme.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest"
import { readCssThemeColor, readTerminalTheme } from "../terminal-theme"

const root = document.documentElement

afterEach(() => {
  root.removeAttribute("style")
})

describe("terminal-theme", () => {
  it("maps CSS terminal tokens to an xterm theme object", () => {
    root.style.setProperty("--terminal-bg", "#24273a")
    root.style.setProperty("--terminal-fg", "#cad3f5")
    root.style.setProperty("--terminal-cursor", "#f4dbd6")
    root.style.setProperty("--terminal-cursor-accent", "#24273a")
    root.style.setProperty("--terminal-selection-bg", "#5b6078")
    root.style.setProperty("--terminal-black", "#494d64")
    root.style.setProperty("--terminal-red", "#ed8796")
    root.style.setProperty("--terminal-green", "#a6da95")
    root.style.setProperty("--terminal-yellow", "#eed49f")
    root.style.setProperty("--terminal-blue", "#8aadf4")
    root.style.setProperty("--terminal-magenta", "#f5bde6")
    root.style.setProperty("--terminal-cyan", "#91d7e3")
    root.style.setProperty("--terminal-white", "#b8c0e0")
    root.style.setProperty("--terminal-bright-black", "#5b6078")
    root.style.setProperty("--terminal-bright-red", "#ed8796")
    root.style.setProperty("--terminal-bright-green", "#a6da95")
    root.style.setProperty("--terminal-bright-yellow", "#eed49f")
    root.style.setProperty("--terminal-bright-blue", "#8aadf4")
    root.style.setProperty("--terminal-bright-magenta", "#f5bde6")
    root.style.setProperty("--terminal-bright-cyan", "#91d7e3")
    root.style.setProperty("--terminal-bright-white", "#cad3f5")

    expect(readTerminalTheme()).toEqual({
      background: "#24273a",
      foreground: "#cad3f5",
      cursor: "#f4dbd6",
      cursorAccent: "#24273a",
      selectionBackground: "#5b6078",
      black: "#494d64",
      red: "#ed8796",
      green: "#a6da95",
      yellow: "#eed49f",
      blue: "#8aadf4",
      magenta: "#f5bde6",
      cyan: "#91d7e3",
      white: "#b8c0e0",
      brightBlack: "#5b6078",
      brightRed: "#ed8796",
      brightGreen: "#a6da95",
      brightYellow: "#eed49f",
      brightBlue: "#8aadf4",
      brightMagenta: "#f5bde6",
      brightCyan: "#91d7e3",
      brightWhite: "#cad3f5"
    })
  })

  it("falls back when a CSS token is missing", () => {
    expect(readCssThemeColor("--missing-token", "#fallback")).toBe("#fallback")
    expect(readTerminalTheme().background).toBe("#24273a")
    expect(readTerminalTheme().foreground).toBe("#cad3f5")
  })
})
```

- [ ] **Step 2: Run the new helper test to verify it fails**

Run:

```bash
yarn workspace @teamcow/desktop test terminal-theme
```

Expected: FAIL because `../terminal-theme` does not exist.

- [ ] **Step 3: Create the terminal theme helper**

Create `apps/desktop/src/renderer/app/shell/terminal-theme.ts`:

```typescript
import type { ITheme } from "@xterm/xterm"

export const readCssThemeColor = (token: string, fallback: string, root: Element = document.documentElement): string => {
  const value = getComputedStyle(root).getPropertyValue(token).trim()
  return value || fallback
}

export const readTerminalTheme = (root: Element = document.documentElement): ITheme => ({
  background: readCssThemeColor("--terminal-bg", "#24273a", root),
  foreground: readCssThemeColor("--terminal-fg", "#cad3f5", root),
  cursor: readCssThemeColor("--terminal-cursor", "#f4dbd6", root),
  cursorAccent: readCssThemeColor("--terminal-cursor-accent", "#24273a", root),
  selectionBackground: readCssThemeColor("--terminal-selection-bg", "#5b6078", root),
  black: readCssThemeColor("--terminal-black", "#494d64", root),
  red: readCssThemeColor("--terminal-red", "#ed8796", root),
  green: readCssThemeColor("--terminal-green", "#a6da95", root),
  yellow: readCssThemeColor("--terminal-yellow", "#eed49f", root),
  blue: readCssThemeColor("--terminal-blue", "#8aadf4", root),
  magenta: readCssThemeColor("--terminal-magenta", "#f5bde6", root),
  cyan: readCssThemeColor("--terminal-cyan", "#91d7e3", root),
  white: readCssThemeColor("--terminal-white", "#b8c0e0", root),
  brightBlack: readCssThemeColor("--terminal-bright-black", "#5b6078", root),
  brightRed: readCssThemeColor("--terminal-bright-red", "#ed8796", root),
  brightGreen: readCssThemeColor("--terminal-bright-green", "#a6da95", root),
  brightYellow: readCssThemeColor("--terminal-bright-yellow", "#eed49f", root),
  brightBlue: readCssThemeColor("--terminal-bright-blue", "#8aadf4", root),
  brightMagenta: readCssThemeColor("--terminal-bright-magenta", "#f5bde6", root),
  brightCyan: readCssThemeColor("--terminal-bright-cyan", "#91d7e3", root),
  brightWhite: readCssThemeColor("--terminal-bright-white", "#cad3f5", root)
})
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run:

```bash
yarn workspace @teamcow/desktop test terminal-theme
```

Expected: PASS.

- [ ] **Step 5: Update DesktopShell imports**

In `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`, keep the existing runtime xterm import unchanged and add these imports near the other local imports:

```typescript
import { useTheme } from "../providers/ThemeProvider"
import { readCssThemeColor, readTerminalTheme } from "./terminal-theme"
```

Remove the local helper:

```typescript
const readThemeColor = (token: string, fallback: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return value || fallback
}
```

- [ ] **Step 6: Use the resolved theme in DesktopShell**

Inside `export const DesktopShell = () => {`, add this near the other hook calls:

```typescript
  const { resolved: resolvedTheme } = useTheme()
```

Keep this hook near the top of the component before effects so the hook order stays stable.

- [ ] **Step 7: Use the full terminal theme when creating xterm**

In the `new Terminal({ ... })` call, replace:

```typescript
        fontFamily: readThemeColor("--font-mono", "ui-monospace, monospace"),
        fontSize: 12,
        scrollback: 5000,
        theme: {
          background: readThemeColor("--terminal-bg", "#090c0b"),
          foreground: readThemeColor("--terminal-fg", "#d4dbd6")
        }
```

with:

```typescript
        fontFamily: readCssThemeColor("--font-mono", "ui-monospace, monospace"),
        fontSize: 12,
        scrollback: 5000,
        theme: readTerminalTheme()
```

- [ ] **Step 8: Update the live xterm instance when the resolved theme changes**

After the terminal initialization effect, add:

```typescript
  useEffect(() => {
    const term = terminalInstanceRef.current
    if (!term) return
    term.options.theme = readTerminalTheme()
  }, [resolvedTheme])
```

This effect deliberately depends on `resolvedTheme`, not raw preference, so `system` changes refresh xterm when `ThemeProvider` resolves a new actual theme.

- [ ] **Step 9: Run focused terminal and shell tests**

Run:

```bash
yarn workspace @teamcow/desktop test terminal-theme
yarn workspace @teamcow/desktop test DesktopShell
```

Expected: PASS.

- [ ] **Step 10: Commit checkpoint, approval required**

Do not run this step unless the user explicitly authorizes a commit.

```bash
git add apps/desktop/src/renderer/app/shell/terminal-theme.ts apps/desktop/src/renderer/app/shell/__tests__/terminal-theme.test.ts apps/desktop/src/renderer/app/shell/DesktopShell.tsx
git commit -m "feat(desktop): apply full terminal theme palette"
```

---

### Task 3: Replace CodeMirror Themes With TeamCow Palettes

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/editor/editor-syntax-theme.ts`
- Create: `apps/desktop/src/renderer/app/shell/editor/__tests__/editor-syntax-theme.test.ts`

**Interfaces:**
- Consumes: `EditorSyntaxTheme = "dark" | "light"`.
- Produces:
  - `editorThemePalettes: Record<EditorSyntaxTheme, EditorThemePalette>`
  - `createEditorSyntaxThemeExtension(theme: EditorSyntaxTheme): Extension`
- `CodeEditor.tsx` continues consuming `createEditorSyntaxThemeExtension(resolvedTheme)` without API changes.

- [ ] **Step 1: Write the failing editor palette test**

Create `apps/desktop/src/renderer/app/shell/editor/__tests__/editor-syntax-theme.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { createEditorSyntaxThemeExtension, editorThemePalettes } from "../editor-syntax-theme"

describe("editor-syntax-theme", () => {
  it("defines a Macchiato-inspired dark editor palette", () => {
    expect(editorThemePalettes.dark.chrome).toEqual({
      background: "#181825",
      foreground: "#cad3f5",
      gutterBackground: "#1e2030",
      gutterForeground: "#6e738d",
      activeLine: "rgba(138, 173, 244, 0.10)",
      selection: "rgba(138, 173, 244, 0.24)",
      cursor: "#f4dbd6",
      border: "#363a4f",
      search: "rgba(198, 160, 246, 0.24)",
      searchActive: "rgba(198, 160, 246, 0.42)"
    })
    expect(editorThemePalettes.dark.syntax.keyword).toBe("#c6a0f6")
    expect(editorThemePalettes.dark.syntax.string).toBe("#a6da95")
    expect(editorThemePalettes.dark.syntax.functionCall).toBe("#8aadf4")
  })

  it("defines a Superset-Light-inspired editor palette", () => {
    expect(editorThemePalettes.light.chrome).toEqual({
      background: "#ffffff",
      foreground: "#171717",
      gutterBackground: "#f7f7f7",
      gutterForeground: "#8a8a8a",
      activeLine: "rgba(47, 111, 190, 0.08)",
      selection: "rgba(47, 111, 190, 0.18)",
      cursor: "#171717",
      border: "rgba(23, 23, 23, 0.14)",
      search: "rgba(255, 211, 61, 0.35)",
      searchActive: "rgba(255, 150, 50, 0.55)"
    })
    expect(editorThemePalettes.light.syntax.keyword).toBe("#7c3aed")
    expect(editorThemePalettes.light.syntax.string).toBe("#2f7d32")
    expect(editorThemePalettes.light.syntax.functionCall).toBe("#2f6fbe")
  })

  it("returns CodeMirror extensions for both themes", () => {
    expect(Array.isArray(createEditorSyntaxThemeExtension("dark"))).toBe(true)
    expect(Array.isArray(createEditorSyntaxThemeExtension("light"))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the editor test to verify it fails**

Run:

```bash
yarn workspace @teamcow/desktop test editor-syntax-theme
```

Expected: FAIL because `editorThemePalettes` is not exported and the current implementation still uses `oneDark/defaultHighlightStyle`.

- [ ] **Step 3: Replace editor-syntax-theme implementation**

Replace the entire contents of `apps/desktop/src/renderer/app/shell/editor/editor-syntax-theme.ts` with:

```typescript
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import type { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { tags } from "@lezer/highlight"

export type EditorSyntaxTheme = "dark" | "light"

type EditorThemeChrome = {
  background: string
  foreground: string
  gutterBackground: string
  gutterForeground: string
  activeLine: string
  selection: string
  cursor: string
  border: string
  search: string
  searchActive: string
}

type EditorThemeSyntax = {
  plainText: string
  comment: string
  keyword: string
  string: string
  number: string
  functionCall: string
  variableName: string
  typeName: string
  className: string
  constant: string
  regexp: string
  tagName: string
  attributeName: string
  invalid: string
}

export type EditorThemePalette = {
  chrome: EditorThemeChrome
  syntax: EditorThemeSyntax
}

export const editorThemePalettes: Record<EditorSyntaxTheme, EditorThemePalette> = {
  dark: {
    chrome: {
      background: "#181825",
      foreground: "#cad3f5",
      gutterBackground: "#1e2030",
      gutterForeground: "#6e738d",
      activeLine: "rgba(138, 173, 244, 0.10)",
      selection: "rgba(138, 173, 244, 0.24)",
      cursor: "#f4dbd6",
      border: "#363a4f",
      search: "rgba(198, 160, 246, 0.24)",
      searchActive: "rgba(198, 160, 246, 0.42)"
    },
    syntax: {
      plainText: "#cad3f5",
      comment: "#6e738d",
      keyword: "#c6a0f6",
      string: "#a6da95",
      number: "#eed49f",
      functionCall: "#8aadf4",
      variableName: "#cad3f5",
      typeName: "#91d7e3",
      className: "#eed49f",
      constant: "#f5bde6",
      regexp: "#f5a97f",
      tagName: "#ed8796",
      attributeName: "#eed49f",
      invalid: "#ed8796"
    }
  },
  light: {
    chrome: {
      background: "#ffffff",
      foreground: "#171717",
      gutterBackground: "#f7f7f7",
      gutterForeground: "#8a8a8a",
      activeLine: "rgba(47, 111, 190, 0.08)",
      selection: "rgba(47, 111, 190, 0.18)",
      cursor: "#171717",
      border: "rgba(23, 23, 23, 0.14)",
      search: "rgba(255, 211, 61, 0.35)",
      searchActive: "rgba(255, 150, 50, 0.55)"
    },
    syntax: {
      plainText: "#171717",
      comment: "#717171",
      keyword: "#7c3aed",
      string: "#2f7d32",
      number: "#b8791f",
      functionCall: "#2f6fbe",
      variableName: "#171717",
      typeName: "#147d8c",
      className: "#b8791f",
      constant: "#8a4fcf",
      regexp: "#a7652f",
      tagName: "#cc3333",
      attributeName: "#b8791f",
      invalid: "#cc3333"
    }
  }
}

const createChromeTheme = (palette: EditorThemePalette, dark: boolean): Extension =>
  EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: palette.chrome.background,
        color: palette.chrome.foreground
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)"
      },
      ".cm-content": {
        caretColor: palette.chrome.cursor
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: palette.chrome.cursor
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: palette.chrome.selection
      },
      ".cm-gutters": {
        backgroundColor: palette.chrome.gutterBackground,
        color: palette.chrome.gutterForeground,
        borderRightColor: palette.chrome.border
      },
      ".cm-activeLine": {
        backgroundColor: palette.chrome.activeLine
      },
      ".cm-activeLineGutter": {
        backgroundColor: palette.chrome.activeLine,
        color: palette.chrome.foreground
      },
      ".cm-searchMatch": {
        backgroundColor: palette.chrome.search,
        outline: "1px solid transparent"
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: palette.chrome.searchActive
      },
      ".cm-panels": {
        backgroundColor: palette.chrome.gutterBackground,
        color: palette.chrome.foreground,
        borderColor: palette.chrome.border
      }
    },
    { dark }
  )

const createHighlightStyle = (palette: EditorThemePalette): Extension =>
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.comment, color: palette.syntax.comment, fontStyle: "italic" },
      { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: palette.syntax.keyword },
      { tag: [tags.string, tags.special(tags.string)], color: palette.syntax.string },
      { tag: [tags.number, tags.integer, tags.float, tags.bool], color: palette.syntax.number },
      { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: palette.syntax.functionCall },
      { tag: [tags.variableName, tags.propertyName], color: palette.syntax.variableName },
      { tag: [tags.typeName, tags.namespace], color: palette.syntax.typeName },
      { tag: tags.className, color: palette.syntax.className },
      { tag: [tags.constant(tags.variableName), tags.standard(tags.variableName)], color: palette.syntax.constant },
      { tag: tags.regexp, color: palette.syntax.regexp },
      { tag: tags.tagName, color: palette.syntax.tagName },
      { tag: tags.attributeName, color: palette.syntax.attributeName },
      { tag: tags.invalid, color: palette.syntax.invalid }
    ]),
    { fallback: true }
  )

export const createEditorSyntaxThemeExtension = (theme: EditorSyntaxTheme): Extension[] => {
  const palette = editorThemePalettes[theme]
  return [
    createChromeTheme(palette, theme === "dark"),
    createHighlightStyle(palette)
  ]
}
```

- [ ] **Step 4: Run the editor test to verify it passes**

Run:

```bash
yarn workspace @teamcow/desktop test editor-syntax-theme
```

Expected: PASS.

- [ ] **Step 5: Run the Files editor adjacent test path**

Run:

```bash
yarn workspace @teamcow/desktop test CodeEditor
```

Expected: PASS if a matching test file exists. If Vitest reports no matching test files, run:

```bash
yarn workspace @teamcow/desktop test DesktopShell
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint, approval required**

Do not run this step unless the user explicitly authorizes a commit.

```bash
git add apps/desktop/src/renderer/app/shell/editor/editor-syntax-theme.ts apps/desktop/src/renderer/app/shell/editor/__tests__/editor-syntax-theme.test.ts
git commit -m "feat(desktop): add themed CodeMirror palettes"
```

---

### Task 4: Clean Up Old Accent Shadows And Verify The Theme Refresh

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css`

**Interfaces:**
- Consumes: new `--accent`, `--accent-border`, `--shadow-*`, and semantic tokens from Task 1.
- Produces: no new public interface. This removes old hard-coded blue shadows that would visually clash with the refreshed palette.

- [ ] **Step 1: Write a failing guard in ThemePalette.test.ts for old accent shadows**

In `apps/desktop/src/renderer/app/providers/__tests__/ThemePalette.test.ts`, add this test near the bottom of the file:

```typescript
  it("does not keep old hard-coded blue accent shadows", () => {
    expect(styles).not.toContain("rgba(91, 124, 250")
    expect(styles).not.toContain("#5b7cfa")
    expect(styles).not.toContain("#7592ff")
  })
```

- [ ] **Step 2: Run the palette test to verify it fails**

Run:

```bash
yarn workspace @teamcow/desktop test ThemePalette
```

Expected: FAIL if old hard-coded accent shadows remain in `styles.css`.

- [ ] **Step 3: Replace old hard-coded composer accent shadows**

In `apps/desktop/src/renderer/styles.css`, replace:

```css
.composer-send-icon-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #ffffff;
  background: var(--accent);
  border: 1px solid var(--accent-border);
  font-size: 13px;
  box-shadow: 0 8px 18px rgba(91, 124, 250, 0.22);
  transition: opacity 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.composer-send-icon-btn:hover:not(:disabled) {
  opacity: 0.85;
  box-shadow: 0 10px 22px rgba(91, 124, 250, 0.26);
  transform: translateY(-1px);
}
```

with:

```css
.composer-send-icon-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #ffffff;
  background: var(--accent);
  border: 1px solid var(--accent-border);
  font-size: 13px;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 24%, transparent);
  transition: opacity 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.composer-send-icon-btn:hover:not(:disabled) {
  opacity: 0.85;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--accent) 28%, transparent);
  transform: translateY(-1px);
}
```

- [ ] **Step 4: Replace heavy hard-coded modal/popover shadows with semantic shadows**

In `apps/desktop/src/renderer/styles.css`, replace:

```css
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
```

inside `.composer-modern-inner` with:

```css
  box-shadow: var(--shadow-md);
```

Replace:

```css
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-border) 36%, transparent), 0 14px 36px rgba(0, 0, 0, 0.22);
```

inside `.composer-modern-inner:focus-within` with:

```css
  box-shadow: var(--focus-ring), var(--shadow-lg);
```

Replace:

```css
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.02);
```

inside `.composer-model-popover` with:

```css
  box-shadow: var(--shadow-lg);
```

Replace:

```css
  box-shadow: 0 18px 58px rgba(0, 0, 0, 0.34);
```

inside `.launcher-modal` with:

```css
  box-shadow: var(--shadow-xl);
```

- [ ] **Step 5: Run the palette guard**

Run:

```bash
yarn workspace @teamcow/desktop test ThemePalette
```

Expected: PASS.

- [ ] **Step 6: Run implementation verification**

Run:

```bash
yarn workspace @teamcow/desktop test terminal-theme
yarn workspace @teamcow/desktop test editor-syntax-theme
yarn workspace @teamcow/desktop test ThemePalette
yarn workspace @teamcow/desktop test
yarn typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Inspect for old target colors**

Run:

```bash
rg -n "#13171d|#171c23|#1d232c|#f9f7f4|#fbf8f2|#fffdf8|rgba\\(91, 124, 250" apps/desktop/src/renderer/styles.css apps/desktop/src/renderer/app
```

Expected: no output.

- [ ] **Step 8: Optional visual smoke**

Run:

```bash
yarn dev
```

Expected: Electron opens. In the app:

- Dark theme has Macchiato-style blue-purple surfaces but a blue primary accent.
- Light theme is neutral Superset Light-style white/gray, not warm paper.
- Terminal colors match the active theme.
- Files editor colors match the active theme.
- Provider tags remain distinct but subdued.

Stop the dev server after inspection.

- [ ] **Step 9: Commit checkpoint, approval required**

Do not run this step unless the user explicitly authorizes a commit.

```bash
git add apps/desktop/src/renderer/styles.css apps/desktop/src/renderer/app/providers/__tests__/ThemePalette.test.ts
git commit -m "style(desktop): remove stale theme-specific color leftovers"
```

---

## Final Verification

Run:

```bash
git status --short
yarn workspace @teamcow/desktop test ThemePalette
yarn workspace @teamcow/desktop test terminal-theme
yarn workspace @teamcow/desktop test editor-syntax-theme
yarn workspace @teamcow/desktop test
yarn typecheck
```

Expected:

- `git status --short` shows only files intentionally changed for this theme refresh.
- All tests and typecheck pass.
- No `packages/i18n-resources` files changed.
- No DB, IPC, preload, or shared-types files changed.

If a user-visible string changed during implementation, also run:

```bash
yarn i18n:check
```

Expected: PASS.
