/* eslint-disable i18next/no-literal-string -- Editor language identifiers and file extensions are typed machine values, not user-visible UI copy. */

export type EditorLanguage =
  | "cpp"
  | "csharp"
  | "css"
  | "dockerfile"
  | "go"
  | "html"
  | "java"
  | "javascript"
  | "json"
  | "markdown"
  | "php"
  | "plain"
  | "python"
  | "rust"
  | "shell"
  | "sql"
  | "toml"
  | "xml"
  | "yaml"

export const detectEditorLanguage = (filePath: string): EditorLanguage => {
  const normalized = filePath.toLowerCase()
  if (normalized.endsWith(".css")) return "css"
  if (normalized.endsWith(".html") || normalized.endsWith(".htm")) return "html"
  if (
    normalized.endsWith(".js") ||
    normalized.endsWith(".jsx") ||
    normalized.endsWith(".ts") ||
    normalized.endsWith(".tsx") ||
    normalized.endsWith(".mjs") ||
    normalized.endsWith(".cjs")
  ) return "javascript"
  if (normalized.endsWith(".json")) return "json"
  if (normalized.endsWith(".md") || normalized.endsWith(".mdx")) return "markdown"
  if (normalized.endsWith(".py") || normalized.endsWith(".pyw")) return "python"
  if (normalized.endsWith(".sql")) return "sql"
  if (normalized.endsWith(".yaml") || normalized.endsWith(".yml")) return "yaml"
  if (normalized.endsWith(".xml") || normalized.endsWith(".svg")) return "xml"
  if (
    normalized.endsWith(".sh") ||
    normalized.endsWith(".bash") ||
    normalized.endsWith(".zsh")
  ) return "shell"
  if (normalized === "dockerfile" || normalized.endsWith("/dockerfile")) return "dockerfile"
  if (normalized.endsWith(".toml")) return "toml"
  if (normalized.endsWith(".java")) return "java"
  if (
    normalized.endsWith(".c") ||
    normalized.endsWith(".cc") ||
    normalized.endsWith(".cpp") ||
    normalized.endsWith(".cxx") ||
    normalized.endsWith(".h") ||
    normalized.endsWith(".hh") ||
    normalized.endsWith(".hpp") ||
    normalized.endsWith(".hxx")
  ) return "cpp"
  if (normalized.endsWith(".cs")) return "csharp"
  if (normalized.endsWith(".go")) return "go"
  if (normalized.endsWith(".rs")) return "rust"
  if (normalized.endsWith(".php")) return "php"
  return "plain"
}
