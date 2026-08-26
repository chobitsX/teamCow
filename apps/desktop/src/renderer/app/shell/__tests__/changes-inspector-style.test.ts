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

describe("changes inspector layout", () => {
  it("keeps change sections at their content height so the list can scroll", () => {
    const scrollContainer = extractRuleBody(".changes-sections-scroll")
    const section = extractRuleBody(".changes-section")

    expect(scrollContainer).toContain("overflow-y: auto;")
    expect(section).toContain("flex: 0 0 auto;")
  })
})
