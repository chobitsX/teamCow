// @vitest-environment jsdom
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { render, waitFor } from "@testing-library/react"
import type { DirectMergeConfig } from "@codemirror/merge"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mergeViewHarness = vi.hoisted(() => ({
  configs: [] as DirectMergeConfig[],
  dispatch: vi.fn(),
  destroy: vi.fn(),
  firstChunkFromB: 7 as number | null,
  throwOnConstruct: false
}))

vi.mock("@codemirror/merge", () => ({
  MergeView: class MergeViewMock {
    readonly b = {
      dispatch: mergeViewHarness.dispatch
    }

    readonly chunks: Array<{ fromB: number }>

    constructor(config: DirectMergeConfig) {
      if (mergeViewHarness.throwOnConstruct) {
        throw new Error("merge construction failed")
      }
      mergeViewHarness.configs.push(config)
      this.chunks = mergeViewHarness.firstChunkFromB === null
        ? []
        : [{ fromB: mergeViewHarness.firstChunkFromB }]
    }

    destroy() {
      mergeViewHarness.destroy()
    }
  }
}))

vi.mock("../../providers/ThemeProvider", () => ({
  useTheme: () => ({ resolved: "dark" })
}))

const loadEditorLanguageExtension = vi.hoisted(() => vi.fn(async () => []))
vi.mock("./load-editor-language-extension", () => ({ loadEditorLanguageExtension }))

import { ChangeDiffCodeView } from "./ChangeDiffCodeView"

describe("ChangeDiffCodeView", () => {
  beforeEach(() => {
    mergeViewHarness.configs.length = 0
    mergeViewHarness.dispatch.mockReset()
    mergeViewHarness.destroy.mockReset()
    mergeViewHarness.firstChunkFromB = 7
    mergeViewHarness.throwOnConstruct = false
    loadEditorLanguageExtension.mockClear()
  })

  it("creates a read-only official MergeView with diff highlighting and no revert controls", async () => {
    const view = render(
      <ChangeDiffCodeView
        original={"before\nshared\n"}
        modified={"after\nshared\n"}
        originalLanguage="javascript"
        modifiedLanguage="json"
        originalLabel="Original src/index.js"
        modifiedLabel="Modified src/index.ts"
        onError={vi.fn()}
      />
    )

    await waitFor(() => expect(mergeViewHarness.configs).toHaveLength(1))
    const config = mergeViewHarness.configs[0]
    const originalState = EditorState.create(config.a)
    const modifiedState = EditorState.create(config.b)

    expect(config.parent).toBe(view.getByTestId("change-diff-code-view"))
    expect(config.revertControls).toBeUndefined()
    expect(config.highlightChanges).toBe(true)
    expect(config.gutter).toBe(true)
    expect(config.orientation).toBe("a-b")
    expect(originalState.doc.toString()).toBe("before\nshared\n")
    expect(modifiedState.doc.toString()).toBe("after\nshared\n")
    expect(originalState.facet(EditorState.readOnly)).toBe(true)
    expect(modifiedState.facet(EditorState.readOnly)).toBe(true)
    expect(originalState.facet(EditorView.editable)).toBe(false)
    expect(modifiedState.facet(EditorView.editable)).toBe(false)
    expect(originalState.facet(EditorView.contentAttributes)).toContainEqual({ "aria-label": "Original src/index.js" })
    expect(modifiedState.facet(EditorView.contentAttributes)).toContainEqual({ "aria-label": "Modified src/index.ts" })
    expect(loadEditorLanguageExtension).toHaveBeenCalledWith("javascript")
    expect(loadEditorLanguageExtension).toHaveBeenCalledWith("json")

    view.unmount()
    expect(mergeViewHarness.destroy).toHaveBeenCalledTimes(1)
  })

  it("scrolls the modified editor to the first changed chunk when opened", async () => {
    mergeViewHarness.firstChunkFromB = 42
    const scrollEffect = EditorView.scrollIntoView(0)
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView").mockReturnValue(scrollEffect)

    const view = render(
      <ChangeDiffCodeView
        original={"shared\nbefore\n"}
        modified={"shared\nafter\n"}
        originalLanguage="plain"
        modifiedLanguage="plain"
        originalLabel="Original"
        modifiedLabel="Modified"
        onError={vi.fn()}
      />
    )

    await waitFor(() => expect(mergeViewHarness.dispatch).toHaveBeenCalledOnce())
    expect(scrollIntoView).toHaveBeenCalledWith(42, {
      y: "center",
      x: "start"
    })
    expect(mergeViewHarness.dispatch).toHaveBeenCalledWith({ effects: scrollEffect })

    scrollIntoView.mockRestore()
    view.unmount()
  })

  it("destroys and recreates the MergeView when the exact document changes", async () => {
    const view = render(
      <ChangeDiffCodeView
        original="one"
        modified="two"
        originalLanguage="plain"
        modifiedLanguage="plain"
        originalLabel="Original"
        modifiedLabel="Modified"
        onError={vi.fn()}
      />
    )
    await waitFor(() => expect(mergeViewHarness.configs).toHaveLength(1))

    view.rerender(
      <ChangeDiffCodeView
        original="one"
        modified="three"
        originalLanguage="plain"
        modifiedLanguage="plain"
        originalLabel="Original"
        modifiedLabel="Modified"
        onError={vi.fn()}
      />
    )
    await waitFor(() => expect(mergeViewHarness.configs).toHaveLength(2))

    expect(mergeViewHarness.destroy).toHaveBeenCalledTimes(1)
    expect(mergeViewHarness.configs[1].b.doc).toBe("three")
    view.unmount()
    expect(mergeViewHarness.destroy).toHaveBeenCalledTimes(2)
  })

  it("reports MergeView construction failures instead of leaving an unhandled rejection", async () => {
    mergeViewHarness.throwOnConstruct = true
    const onError = vi.fn()

    render(
      <ChangeDiffCodeView
        original="one"
        modified="two"
        originalLanguage="plain"
        modifiedLanguage="plain"
        originalLabel="Original"
        modifiedLabel="Modified"
        onError={onError}
      />
    )

    await waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })
})
