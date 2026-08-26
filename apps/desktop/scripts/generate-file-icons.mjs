import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { generateManifest } from "material-icon-theme"

const require = createRequire(import.meta.url)
const APP_ROOT = resolve(import.meta.dirname, "..")
const ICONS_OUT_DIR = resolve(APP_ROOT, "src/renderer/public/file-icons")
const MANIFEST_OUT_PATH = resolve(APP_ROOT, "src/renderer/app/shell/file-icons/manifest.json")
const MATERIAL_ICON_THEME_ROOT = dirname(require.resolve("material-icon-theme/package.json"))
const ICONS_SRC = resolve(MATERIAL_ICON_THEME_ROOT, "icons")

const LANGUAGE_ID_EXTENSION_MAP = {
  ts: "typescript",
  js: "javascript",
  php: "php",
  tex: "tex",
  m: "matlab",
  diff: "diff",
  patch: "diff"
}

const addIcon = (icons, name) => {
  if (typeof name === "string" && name.length > 0) {
    icons.add(name)
  }
}

const manifest = generateManifest({
  activeIconPack: "react",
  folders: { theme: "specific" }
})

const referencedIcons = new Set()

addIcon(referencedIcons, manifest.file)
addIcon(referencedIcons, manifest.folder)
addIcon(referencedIcons, manifest.folderExpanded)
addIcon(referencedIcons, manifest.rootFolder)
addIcon(referencedIcons, manifest.rootFolderExpanded)

for (const icon of Object.values(manifest.fileNames ?? {})) addIcon(referencedIcons, icon)
for (const icon of Object.values(manifest.fileExtensions ?? {})) addIcon(referencedIcons, icon)
for (const icon of Object.values(manifest.languageIds ?? {})) addIcon(referencedIcons, icon)
for (const icon of Object.values(manifest.folderNames ?? {})) addIcon(referencedIcons, icon)
for (const icon of Object.values(manifest.folderNamesExpanded ?? {})) addIcon(referencedIcons, icon)
for (const icon of Object.values(manifest.rootFolderNames ?? {})) addIcon(referencedIcons, icon)
for (const icon of Object.values(manifest.rootFolderNamesExpanded ?? {})) addIcon(referencedIcons, icon)

const condensed = {
  fileNames: manifest.fileNames ?? {},
  fileExtensions: manifest.fileExtensions ?? {},
  folderNames: manifest.folderNames ?? {},
  folderNamesExpanded: manifest.folderNamesExpanded ?? {},
  defaultIcon: manifest.file ?? "file",
  defaultFolderIcon: manifest.folder ?? "folder",
  defaultFolderOpenIcon: manifest.folderExpanded ?? "folder-open"
}

for (const [ext, icon] of Object.entries(LANGUAGE_ID_EXTENSION_MAP)) {
  if (!condensed.fileExtensions[ext]) {
    condensed.fileExtensions[ext] = icon
  }
  addIcon(referencedIcons, condensed.fileExtensions[ext])
}

if (existsSync(ICONS_OUT_DIR)) {
  rmSync(ICONS_OUT_DIR, { recursive: true })
}
mkdirSync(ICONS_OUT_DIR, { recursive: true })
mkdirSync(dirname(MANIFEST_OUT_PATH), { recursive: true })

let copied = 0
for (const iconName of referencedIcons) {
  const srcPath = resolve(ICONS_SRC, `${iconName}.svg`)
  const destPath = resolve(ICONS_OUT_DIR, `${iconName}.svg`)
  if (existsSync(srcPath)) {
    cpSync(srcPath, destPath)
    copied += 1
  }
}

writeFileSync(MANIFEST_OUT_PATH, `${JSON.stringify(condensed, null, 2)}\n`)

console.log(
  `Generated file icons: ${copied} SVGs, ${Object.keys(condensed.fileNames).length} file names, ` +
  `${Object.keys(condensed.fileExtensions).length} extensions, ${Object.keys(condensed.folderNames).length} folder names`
)
