import { createContext, useContext, useEffect, useState } from "react"

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
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("light")

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove("light", "dark")

    let resolved: "dark" | "light"
    if (theme === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light"
    } else {
      resolved = theme
    }

    root.classList.add(resolved);
    setResolvedTheme(resolved);

    // Persist the theme preference so the Rust side can create/show the native
    // window with the matching background color on the next launch. This avoids
    // a flash of the webview's default (white) backing before the frontend
    // paints. "system" is resolved natively from the OS appearance in Rust.
    // See src-tauri/src/main.rs.
    void (async () => {
      try {
        const { load } = await import("@tauri-apps/plugin-store")
        const store = await load("window-theme.json", { autoSave: false })
        await store.set("theme", theme)
        await store.save()
      } catch {
        // Not running inside Tauri or store unavailable – ignore.
      }
    })()
  }, [theme])

  const value = {
    theme,
    resolvedTheme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
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
