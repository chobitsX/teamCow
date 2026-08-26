import { getFileIcon } from "./get-file-icon"

type FileIconProps = {
  fileName: string
  isDirectory?: boolean
  isOpen?: boolean
  className?: string
}

export const FileIcon = ({
  fileName,
  isDirectory = false,
  isOpen = false,
  className
}: FileIconProps) => {
  const { src } = getFileIcon(fileName, isDirectory, isOpen)
  return <img src={src} alt="" draggable={false} className={className} />
}
