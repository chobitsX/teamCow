// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { handleExternalNavigation, isExternalOpenUrl } from "./create-main-window"

describe("main window external navigation", () => {
  it("allows only expected external protocols to be opened outside TeamCow", () => {
    expect(isExternalOpenUrl("https://github.com/teamcow/app")).toBe(true)
    expect(isExternalOpenUrl("http://localhost:3000/docs")).toBe(true)
    expect(isExternalOpenUrl("mailto:hello@example.com")).toBe(true)
    expect(isExternalOpenUrl("file:///Users/example/secret.txt")).toBe(false)
    expect(isExternalOpenUrl("teamcow://settings")).toBe(false)
    expect(isExternalOpenUrl("not a url")).toBe(false)
  })

  it("prevents normal web navigation and opens it externally", () => {
    const preventDefault = vi.fn()
    const openExternal = vi.fn()

    handleExternalNavigation({
      url: "https://github.com/teamcow/app",
      allowedAppOrigins: new Set(["http://127.0.0.1:5173"]),
      preventDefault,
      openExternal
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith("https://github.com/teamcow/app")
  })

  it("allows current app origin navigation inside TeamCow", () => {
    const preventDefault = vi.fn()
    const openExternal = vi.fn()

    handleExternalNavigation({
      url: "http://127.0.0.1:5173/",
      allowedAppOrigins: new Set(["http://127.0.0.1:5173"]),
      preventDefault,
      openExternal
    })

    expect(preventDefault).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
  })
})
