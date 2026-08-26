import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import i18next from "eslint-plugin-i18next"

const technicalWordPatterns = [
  "[0-9!-/:-@[-`{-~]+",
  "[A-Z_-]+",
  "^[A-Z0-9+×.-]{1,4}$",
  "^\\s+$",
  "^\\s*·\\s*$",
  "^hiddenInset$",
  "^openDirectory$",
  "^userData$",
  "^(common|shell|chat|inspector|provider|errors|notifications|settings|info|success|error)$",
  "^(activate|window-all-closed|before-quit)$",
  "^teamcow$",
  "^teamcow\\.sqlite$",
  "^package\\.json$",
  "^utf8$",
  "^\\.git$",
  "^(codex|claude|opencode|not-selected|ready|unknown|idle|running|completed|failed|blocked|cancelled|imported|existing|ok|development|production|darwin|en|zh)$",
  /^\p{Emoji}+$/u
]

const literalStringRule = [
  "error",
  {
    framework: "react",
    mode: "all",
    "jsx-components": {
      include: [],
      exclude: ["Trans"]
    },
    "jsx-attributes": {
      include: [],
      exclude: [
        "className",
        "styleName",
        "style",
        "type",
        "key",
        "id",
        "width",
        "height",
        "role",
        "aria-hidden",
        "data-testid",
        "htmlFor",
        "tabIndex"
      ]
    },
    words: {
      exclude: technicalWordPatterns
    },
    callees: {
      exclude: [
        "i18n(ext)?",
        "t",
        "t[A-Z].*",
        "useTranslation",
        "tMain",
        "require",
        "addEventListener",
        "removeEventListener",
        "postMessage",
        "getElementById",
        "exposeInMainWorld",
        "dispatch",
        "commit",
        "buildAppError",
        "includes",
        "indexOf",
        "endsWith",
        "startsWith",
        "join",
        "readFileSync",
        "spawnSync",
        "console\\.(log|warn|error|info|debug)",
        "Object\\.(keys|values|entries)",
        "app\\.(on|getPath)",
        "String",
        "Number",
        "Boolean"
      ]
    },
    "object-properties": {
      include: [],
      exclude: [
        "[A-Z_-]+",
        "author",
        "branch",
        "className",
        "code",
        "createdAt",
        "defaultValue",
        "icon",
        "id",
        "kind",
        "locale",
        "main",
        "messageKey",
        "messageParams",
        "mode",
        "ns",
        "path",
        "platform",
        "projectId",
        "provider",
        "providerKind",
        "rootPath",
        "runStatus",
        "status",
        "suggestion",
        "type",
        "updatedAt",
        "value",
        "version",
        "worktreeId"
      ]
    },
    "class-properties": {
      include: [],
      exclude: ["displayName"]
    },
    message: "Use i18n resources for user-visible text.",
    "should-validate-template": true
  }
]

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/out/**",
      "**/*.d.ts",
      "**/*.tsbuildinfo",
      "references/upstream/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    }
  },
  {
    files: ["apps/desktop/src/renderer/**/*.{ts,tsx}", "apps/desktop/src/renderer/main.tsx", "apps/desktop/src/renderer/App.tsx"],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    files: [
      "apps/desktop/electron.vite.config.ts",
      "apps/desktop/vitest.config.ts",
      "apps/desktop/scripts/*.mjs",
      "apps/desktop/src/main/**/*.ts",
      "packages/**/*.ts",
      "scripts/**/*.mjs"
    ],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: [
      "apps/desktop/src/renderer/**/*.ts",
      "apps/desktop/src/renderer/**/*.tsx",
      "apps/desktop/src/main/index.ts"
    ],
    ignores: [
      "apps/desktop/src/**/__tests__/**",
      "apps/desktop/src/**/*.test.*",
      "apps/desktop/src/renderer/test/**"
    ],
    plugins: {
      i18next
    },
    rules: {
      "i18next/no-literal-string": literalStringRule
    }
  }
]
