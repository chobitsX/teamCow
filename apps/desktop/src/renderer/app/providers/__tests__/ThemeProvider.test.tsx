import { render, screen, waitFor, act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider, useTheme } from "../ThemeProvider"

const Probe = () => {
  const { preference, setPreference } = useTheme()
  return (
    <div>
      <span data-testid="pref">{preference}</span>
      <button onClick={() => void setPreference("light")}>light</button>
      <button onClick={() => void setPreference("system")}>system</button>
    </div>
  )
}

let mql: { matches: boolean; listeners: Array<(e: { matches: boolean }) => void> }

beforeEach(() => {
  mql = { matches: false, listeners: [] }
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: mql.matches,
    media: q,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => mql.listeners.push(cb),
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {}
  }))
  ;(window as unknown as { teamcow: Record<string, unknown> }).teamcow = {
    getAppTheme: vi.fn().mockResolvedValue("dark"),
    setAppTheme: vi.fn().mockResolvedValue(undefined)
  }
  document.documentElement.dataset.theme = ""
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.dataset.theme = ""
})

describe("ThemeProvider", () => {
  it("applies persisted preference on mount", async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    await waitFor(() => expect(screen.getByTestId("pref").textContent).toBe("dark"))
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("switches preference, persists it, and updates data-theme", async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    await waitFor(() => expect(screen.getByTestId("pref").textContent).toBe("dark"))
    await act(async () => { screen.getByText("light").click() })
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"))
    expect(window.teamcow.setAppTheme).toHaveBeenCalledWith("light")
  })

  it("resolves system preference from matchMedia and reacts to OS changes", async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    await waitFor(() => expect(screen.getByTestId("pref").textContent).toBe("dark"))
    await act(async () => { screen.getByText("system").click() })
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light")) // mql.matches=false -> light
    await act(async () => { mql.matches = true; mql.listeners.forEach((cb) => cb({ matches: true })) })
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"))
  })
})
