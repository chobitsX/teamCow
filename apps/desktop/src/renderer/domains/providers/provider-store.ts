import { useEffect, useState } from "react"
import type { ProviderReadinessSnapshot } from "@shared/index"
import { createFallbackProviderSnapshot } from "./provider-readiness"

type ProviderReadinessState = {
  snapshot: ProviderReadinessSnapshot
  isLoading: boolean
  isFetching: boolean
  hasError: boolean
  refresh: () => Promise<void>
}

export const useProviderReadiness = (): ProviderReadinessState => {
  const [snapshot, setSnapshot] = useState<ProviderReadinessSnapshot>(createFallbackProviderSnapshot)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [hasError, setHasError] = useState(false)

  const refresh = async () => {
    if (!window.teamcow?.refreshProviderReadiness) {
      setHasError(true)
      return
    }

    setIsFetching(true)
    setHasError(false)
    try {
      const nextSnapshot = await window.teamcow.refreshProviderReadiness()
      setSnapshot(nextSnapshot)
    } catch {
      setHasError(true)
    } finally {
      setIsFetching(false)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!window.teamcow?.getProviderReadiness) {
        setHasError(true)
        return
      }

      setIsLoading(true)
      setHasError(false)

      try {
        const cachedSnapshot = await window.teamcow.getProviderReadiness()
        if (!cancelled) {
          setSnapshot(cachedSnapshot)
        }
      } catch {
        if (!cancelled) {
          setHasError(true)
        }
      }

      if (!cancelled) {
        await refresh()
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  return {
    snapshot,
    isLoading,
    isFetching,
    hasError,
    refresh
  }
}
