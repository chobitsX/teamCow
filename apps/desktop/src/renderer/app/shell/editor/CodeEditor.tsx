import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { bracketMatching, indentOnInput } from "@codemirror/language"
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search"
import { Compartment, EditorState } from "@codemirror/state"
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from "@codemirror/view"
import { useEffect, useRef } from "react"
import { useTheme } from "../../providers/ThemeProvider"
import { createEditorSyntaxThemeExtension } from "./editor-syntax-theme"
import type { EditorLanguage } from "./language"
import { loadEditorLanguageExtension } from "./load-editor-language-extension"

type CodeEditorProps = {
  value: string
  language: EditorLanguage
  readOnly: boolean
  largeFileMode?: boolean
  onChange: (value: string) => void
  onSave: () => void
}

const createRichEditorFeatures = () => [
  highlightActiveLineGutter(),
  indentOnInput(),
  bracketMatching(),
  highlightActiveLine(),
  highlightSelectionMatches()
]

export const CodeEditor = ({
  value,
  language,
  readOnly,
  largeFileMode = false,
  onChange,
  onSave
}: CodeEditorProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const languageCompartment = useRef(new Compartment()).current
  const featuresCompartment = useRef(new Compartment()).current
  const themeCompartment = useRef(new Compartment()).current
  const editableCompartment = useRef(new Compartment()).current
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const externalUpdateRef = useRef(false)
  const { resolved: resolvedTheme } = useTheme()

  onChangeRef.current = onChange
  onSaveRef.current = onSave

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          EditorState.allowMultipleSelections.of(true),
          featuresCompartment.of([]),
          themeCompartment.of(createEditorSyntaxThemeExtension(resolvedTheme)),
          languageCompartment.of([]),
          editableCompartment.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly)
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || externalUpdateRef.current) return
            onChangeRef.current(update.state.doc.toString())
          }),
          keymap.of([
            {
              // eslint-disable-next-line i18next/no-literal-string -- CodeMirror key binding string, not user-visible UI copy.
              key: "Mod-s",
              run: () => {
                onSaveRef.current()
                return true
              }
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap
          ])
        ]
      })
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (largeFileMode) {
      viewRef.current?.dispatch({ effects: languageCompartment.reconfigure([]) })
      return () => {
        cancelled = true
      }
    }

    void loadEditorLanguageExtension(language)
      .then((extension) => {
        if (cancelled) return
        const view = viewRef.current
        if (!view) return
        view.dispatch({ effects: languageCompartment.reconfigure(extension) })
      })
      .catch(() => {
        if (cancelled) return
        const view = viewRef.current
        if (!view) return
        view.dispatch({ effects: languageCompartment.reconfigure([]) })
      })

    return () => {
      cancelled = true
    }
  }, [language, languageCompartment, largeFileMode])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: featuresCompartment.reconfigure(largeFileMode ? [] : createRichEditorFeatures())
    })
  }, [featuresCompartment, largeFileMode])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: themeCompartment.reconfigure(createEditorSyntaxThemeExtension(resolvedTheme))
    })
  }, [resolvedTheme, themeCompartment])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editableCompartment.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly)
      ])
    })
  }, [editableCompartment, readOnly])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    externalUpdateRef.current = true
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value }
      })
    } finally {
      externalUpdateRef.current = false
    }
  }, [value])

  return <div className="file-code-editor" ref={hostRef} />
}
