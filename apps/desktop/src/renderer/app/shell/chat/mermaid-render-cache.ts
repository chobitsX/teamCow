const MAX_MERMAID_RENDER_CACHE_ENTRIES = 50

const mermaidRenderCache = new Map<string, { svg: string; activeConsumers: number }>()

export const clearMermaidRenderCache = () => {
  mermaidRenderCache.clear()
}

const trimMermaidRenderCache = () => {
  while (mermaidRenderCache.size > MAX_MERMAID_RENDER_CACHE_ENTRIES) {
    const removableKey = [...mermaidRenderCache].find(([, entry]) => entry.activeConsumers === 0)?.[0]
    if (!removableKey) return
    mermaidRenderCache.delete(removableKey)
  }
}

export const acquireCachedMermaidSvg = (source: string) => {
  const entry = mermaidRenderCache.get(source)
  if (!entry || entry.activeConsumers > 0) {
    return null
  }

  mermaidRenderCache.delete(source)
  mermaidRenderCache.set(source, { ...entry, activeConsumers: 1 })
  return entry.svg
}

export const retainRenderedMermaidSvg = (source: string, svg: string) => {
  const activeConsumers = (mermaidRenderCache.get(source)?.activeConsumers ?? 0) + 1
  mermaidRenderCache.set(source, { svg, activeConsumers })
  trimMermaidRenderCache()
}

export const releaseRenderedMermaidSvg = (source: string) => {
  const entry = mermaidRenderCache.get(source)
  if (!entry) return

  mermaidRenderCache.set(source, {
    ...entry,
    activeConsumers: Math.max(0, entry.activeConsumers - 1)
  })
}
