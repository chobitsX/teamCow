import { describe, expect, it } from "vitest"

import { detectEditorLanguage } from "./language"

describe("detectEditorLanguage", () => {
  it.each([
    ["src/index.ts", "javascript"],
    ["src/App.tsx", "javascript"],
    ["backend/main.py", "python"],
    ["db/schema.sql", "sql"],
    ["docker-compose.yml", "yaml"],
    ["config.yaml", "yaml"],
    ["public/icon.svg", "xml"],
    ["scripts/bootstrap.sh", "shell"],
    ["Dockerfile", "dockerfile"],
    ["settings.toml", "toml"],
    ["src/Main.java", "java"],
    ["native/helper.cpp", "cpp"],
    ["native/helper.c", "cpp"],
    ["server/app.cs", "csharp"],
    ["cmd/teamcow/main.go", "go"],
    ["crates/app/src/lib.rs", "rust"],
    ["web/index.php", "php"]
  ])("detects %s as %s", (filePath, language) => {
    expect(detectEditorLanguage(filePath)).toBe(language)
  })
})
