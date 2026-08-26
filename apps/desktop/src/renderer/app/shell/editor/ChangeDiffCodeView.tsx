import { bracketMatching } from "@codemirror/language"
import { MergeView } from "@codemirror/merge"
import { EditorState, type Extension } from "@codemirror/state"
import { drawSelection, EditorView, highlightActiveLineGutter, lineNumbers } from "@codemirror/view"
import { useEffect, useRef } from "react"
import { useTheme } from "../../providers/ThemeProvider"
import { createEditorSyntaxThemeExtension } from "./editor-syntax-theme"
import type { EditorLanguage } from "./language"
import { loadEditorLanguageExtension } from "./load-editor-language-extension"

/* eslint-disable i18next/no-literal-string -- CodeMirror CSS values and merge-view configuration are machine values. */

const createReadOnlyExtensions = (
  resolvedTheme: "dark" | "light",
  languageExtension: Extension,
  accessibleLabel: string
): Extension[] => [
  lineNumbers(),
  highlightActiveLineGutter(),
  drawSelection(),
  bracketMatching(),
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.contentAttributes.of({ "aria-label": accessibleLabel }),
  createEditorSyntaxThemeExtension(resolvedTheme),
  languageExtension,
  EditorView.theme({
    "&": { height: "100%" },
    ".cm-content": { caretColor: "transparent" }
  })
]

export const ChangeDiffCodeView = ({
  original,
  modified,
  originalLanguage,
  modifiedLanguage,
  originalLabel,
  modifiedLabel,
  onError
}: {
  original: string
  modified: string
  originalLanguage: EditorLanguage
  modifiedLanguage: EditorLanguage
  originalLabel: string
  modifiedLabel: string
  onError: (error: unknown) => void
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const { resolved: resolvedTheme } = useTheme()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let mergeView: MergeView | null = null

    void Promise.all([
      loadEditorLanguageExtension(originalLanguage).catch((): Extension => []),
      loadEditorLanguageExtension(modifiedLanguage).catch((): Extension => [])
    ])
      .then(([originalLanguageExtension, modifiedLanguageExtension]) => {
        if (cancelled) return
        mergeView = new MergeView({
          parent: host,
          a: {
            doc: original,
            extensions: createReadOnlyExtensions(resolvedTheme, originalLanguageExtension, originalLabel)
          },
          b: {
            doc: modified,
            extensions: createReadOnlyExtensions(resolvedTheme, modifiedLanguageExtension, modifiedLabel)
          },
          orientation: "a-b",
          highlightChanges: true,
          gutter: true,
          diffConfig: {
            scanLimit: 500,
            timeout: 1000
          }
        })
        const firstChunk = mergeView.chunks[0]
        if (firstChunk) {
          mergeView.b.dispatch({
            effects: EditorView.scrollIntoView(firstChunk.fromB, {
              y: "center",
              x: "start"
            })
          })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) onError(error)
      })

    return () => {
      cancelled = true
      mergeView?.destroy()
    }
  }, [modified, modifiedLabel, modifiedLanguage, onError, original, originalLabel, originalLanguage, resolvedTheme])

  return <div className="change-diff-code-view" data-testid="change-diff-code-view" ref={hostRef} />
}

/* eslint-enable i18next/no-literal-string */
