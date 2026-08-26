// @vitest-environment node
import { describe, expect, it } from "vitest"
import { resources } from "@teamcow/i18n-resources"
import {
  getProviderBoundaryCopy,
  getProviderIssueMessageKey,
  getProviderIssueRepairKey,
  getProviderReadinessCopy
} from "../provider-readiness"

const providerEn = resources.en.provider
const providerZh = resources.zh.provider

describe("provider-readiness copy helpers", () => {
  it("maps every readiness issue to message and repair translation keys in both locales", () => {
    const issueKinds = [
      "binary-not-found",
      "version-check-failed",
      "version-unsupported",
      "capability-missing",
      "auth-missing",
      "network-unreachable",
      "config-invalid"
    ] as const

    for (const kind of issueKinds) {
      const messageKey = getProviderIssueMessageKey(kind)
      const repairKey = getProviderIssueRepairKey(kind)

      expect(providerEn).toHaveProperty(messageKey)
      expect(providerEn).toHaveProperty(repairKey)
      expect(providerZh).toHaveProperty(messageKey)
      expect(providerZh).toHaveProperty(repairKey)
    }
  })

  it("routes unavailable and unknown providers to different copy groups", () => {
    expect(
      getProviderReadinessCopy({
        kind: "claude",
        availability: "unavailable",
        badge: {
          kind: "claude",
          label: "claude",
          status: "unavailable"
        },
        issues: [{ kind: "auth-missing" }]
      })
    ).toEqual({
      detailKey: "readiness.auth-missing",
      repairKey: "repair.auth-missing",
      summaryKey: "summary.unavailable"
    })

    expect(
      getProviderReadinessCopy({
        kind: "opencode",
        availability: "unknown",
        badge: {
          kind: "opencode",
          label: "opencode",
          status: "unknown"
        },
        issues: [{ kind: "network-unreachable" }]
      })
    ).toEqual({
      detailKey: "detail.unknown",
      repairKey: null,
      summaryKey: "summary.unknown"
    })
  })

  it("describes provider-required actions separately from local capabilities", () => {
    expect(
      getProviderBoundaryCopy({
        kind: "claude",
        availability: "unavailable",
        badge: {
          kind: "claude",
          label: "claude",
          status: "unavailable"
        },
        issues: [{ kind: "auth-missing" }]
      })
    ).toEqual({
      actionBoundaryKey: "boundary.action-blocked",
      localCapabilityKey: "boundary.local-capabilities",
      providerRequiredKey: "boundary.provider-required",
      repairKey: "repair.auth-missing",
      statusKey: "status.unavailable"
    })

    expect(
      getProviderBoundaryCopy({
        kind: "codex",
        availability: "unknown",
        badge: {
          kind: "codex",
          label: "codex",
          status: "unknown"
        },
        issues: []
      })
    ).toEqual({
      actionBoundaryKey: "boundary.action-needs-check",
      localCapabilityKey: "boundary.local-capabilities",
      providerRequiredKey: "boundary.provider-required",
      repairKey: null,
      statusKey: "status.unknown"
    })

    for (const key of [
      "boundary.action-blocked",
      "boundary.action-needs-check",
      "boundary.local-capabilities",
      "boundary.provider-required"
    ]) {
      expect(providerEn).toHaveProperty(key)
      expect(providerZh).toHaveProperty(key)
    }
  })
})
