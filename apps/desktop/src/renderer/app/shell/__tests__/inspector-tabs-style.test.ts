import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const styles = readFileSync(resolve(process.cwd(), "src/renderer/styles.css"), "utf8")

const extractRuleBody = (selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\n\\}`))

  if (!match?.groups?.body) {
    throw new Error(`CSS rule ${selector} was not found`)
  }

  return match.groups.body
}

describe("inspector tabs styling", () => {
  it("uses an integrated rail instead of the global bordered tab treatment", () => {
    const tabRail = extractRuleBody(".inspector-tabbar .tabs")
    const tab = extractRuleBody(".inspector-tabbar .tab")
    const activeTab = extractRuleBody(".inspector-tabbar .tab.active")
    const activeAccent = extractRuleBody(".inspector-tabbar .tab.active::after")

    expect(tabRail).toContain("border-bottom: 1px solid var(--border-subtle);")
    expect(tab).toContain("border: 1px solid transparent;")
    expect(activeTab).toContain("border-color: transparent;")
    expect(activeTab).toContain("box-shadow: none;")
    expect(activeTab).not.toContain("var(--accent-border)")
    expect(activeAccent).toContain("height: 2px;")
    expect(activeAccent).toContain("background: var(--accent);")
  })
})
