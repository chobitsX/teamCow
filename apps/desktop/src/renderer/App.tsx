import { I18nProvider } from "./app/providers/I18nProvider"
import { ThemeProvider } from "./app/providers/ThemeProvider"
import { DesktopShell } from "./app/shell/DesktopShell"

function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <DesktopShell />
      </ThemeProvider>
    </I18nProvider>
  )
}

export default App
