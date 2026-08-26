/* eslint-disable i18next/no-literal-string */
import type { ProviderReadiness, ProviderReadinessSnapshot, ProviderKind, ReadinessIssueKind } from "@shared/index"

export const providerKinds: ProviderKind[] = ["codex", "claude", "opencode", "cursor"]

export const createFallbackProviderSnapshot = (): ProviderReadinessSnapshot => ({
  checkedAt: "",
  providers: providerKinds.map((kind) => ({
    kind,
    availability: "unknown",
    badge: {
      kind,
      label: kind,
      status: "unknown"
    },
    issues: []
  }))
})

export const getProviderIssueMessageKey = (kind: ReadinessIssueKind) => `readiness.${kind}` as const

export const getProviderIssueRepairKey = (kind: ReadinessIssueKind) => `repair.${kind}` as const

export const getProviderReadinessCopy = (provider: ProviderReadiness) => {
  if (provider.availability === "ready") {
    return {
      summaryKey: "summary.ready",
      detailKey: "detail.ready",
      repairKey: null
    }
  }

  if (provider.availability === "unavailable" && provider.issues[0]) {
    return {
      summaryKey: "summary.unavailable",
      detailKey: getProviderIssueMessageKey(provider.issues[0].kind),
      repairKey: getProviderIssueRepairKey(provider.issues[0].kind)
    }
  }

  return {
    summaryKey: "summary.unknown",
    detailKey: "detail.unknown",
    repairKey: null
  }
}

export const getProviderBoundaryCopy = (provider: ProviderReadiness) => ({
  actionBoundaryKey: provider.availability === "unavailable"
    ? "boundary.action-blocked"
    : provider.availability === "unknown"
      ? "boundary.action-needs-check"
      : "boundary.action-ready",
  localCapabilityKey: "boundary.local-capabilities",
  providerRequiredKey: "boundary.provider-required",
  repairKey: provider.availability === "unavailable" && provider.issues[0]
    ? getProviderIssueRepairKey(provider.issues[0].kind)
    : null,
  statusKey: `status.${provider.availability}` as const
})
