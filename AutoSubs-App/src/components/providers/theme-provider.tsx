import { createContext, useContext, useEffect, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  resolvedTheme: "dark" | "light"
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => null,
}

function applyThemeClass(resolved: "dark" | "light") {
  const root = window.document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
}

// Keep the native window/webview background in step with `--background` so the
// area exposed while the window is enlarged is painted in the page colour
// rather than the OS default before the content re-lays out.
function applyWindowBackground(resolved: "dark" | "light") {
  const color: [number, number, number, number] =
    resolved === "dark" ? [0, 0, 0, 255] : [255, 255, 255, 255]
  getCurrentWindow().setBackgroundColor(color).catch(() => {})
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  )
  const resolvedTheme: "dark" | "light" = theme === "system"
    ? (systemPrefersDark ? "dark" : "light")
    : theme;

  useEffect(() => {
    applyThemeClass(resolvedTheme)
    applyWindowBackground(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  const value = {
    theme,
    resolvedTheme,
    setTheme: (next: Theme) => {
      localStorage.setItem(storageKey, next)

      const nextResolved: "dark" | "light" = next === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : next

      if (!document.startViewTransition) {
        setTheme(next)
        return
      }

      document.startViewTransition(() => {
        applyThemeClass(nextResolved)
      })
      setTheme(next)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
