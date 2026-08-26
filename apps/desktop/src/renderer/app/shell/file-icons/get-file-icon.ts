import manifest from "./manifest.json"

type FileIconManifest = {
  fileNames: Record<string, string>
  fileExtensions: Record<string, string>
  folderNames: Record<string, string>
  folderNamesExpanded: Record<string, string>
  defaultIcon: string
  defaultFolderIcon: string
  defaultFolderOpenIcon: string
}

const fileIconManifest = manifest as FileIconManifest
const FILE_ICONS_DIR = "file-icons"

export const resolveFileIconAssetUrl = (
  iconName: string,
  baseHref = globalThis.location?.href ?? "http://localhost/"
) => {
  // Public asset path, not user-visible copy.
  // eslint-disable-next-line i18next/no-literal-string
  return new URL(`${FILE_ICONS_DIR}/${iconName}.svg`, baseHref).toString()
}

export const getFileIcon = (
  fileName: string,
  isDirectory: boolean,
  isOpen = false,
  baseHref?: string
) => {
  if (isDirectory) {
    const baseName = fileName.toLowerCase()
    if (isOpen && fileIconManifest.folderNamesExpanded[baseName]) {
      return { src: resolveFileIconAssetUrl(fileIconManifest.folderNamesExpanded[baseName], baseHref) }
    }

    if (fileIconManifest.folderNames[baseName]) {
      const iconName = isOpen
        ? fileIconManifest.folderNamesExpanded[baseName] ?? fileIconManifest.folderNames[baseName]
        : fileIconManifest.folderNames[baseName]
      return { src: resolveFileIconAssetUrl(iconName, baseHref) }
    }

    return {
      src: resolveFileIconAssetUrl(
        isOpen ? fileIconManifest.defaultFolderOpenIcon : fileIconManifest.defaultFolderIcon,
        baseHref
      )
    }
  }

  const fileNameLower = fileName.toLowerCase()
  if (fileIconManifest.fileNames[fileName]) {
    return { src: resolveFileIconAssetUrl(fileIconManifest.fileNames[fileName], baseHref) }
  }
  if (fileIconManifest.fileNames[fileNameLower]) {
    return { src: resolveFileIconAssetUrl(fileIconManifest.fileNames[fileNameLower], baseHref) }
  }

  const dotIndex = fileName.indexOf(".")
  if (dotIndex !== -1) {
    const segments = fileName.slice(dotIndex + 1).toLowerCase().split(".")
    for (let index = 0; index < segments.length; index += 1) {
      const extension = segments.slice(index).join(".")
      if (fileIconManifest.fileExtensions[extension]) {
        return { src: resolveFileIconAssetUrl(fileIconManifest.fileExtensions[extension], baseHref) }
      }
    }
  }

  return { src: resolveFileIconAssetUrl(fileIconManifest.defaultIcon, baseHref) }
}
