import React, { createContext, useContext, useEffect, useState } from 'react'
import industrial from './themes/industrial'
import minimal from './themes/minimal'
import cyberpunk from './themes/cyberpunk'

export interface ThemeColors {
  pageBg: string
  pageText: string
  sidebarBg: string
  sidebarBorder: string
  terminalBg: string
  aiPanelBg: string
  aiPanelBorder: string
  accent: string
  accent2?: string
  accent3?: string
  textMuted: string
  textDim: string
  green: string
  red: string
  cursorColor: string
  promptColor: string
  badgeBg: string
  badgeBorder: string
  badgeText: string
  statusOnline: string
  statusWarn: string
  statusOffline: string
}

export interface ThemeFonts {
  shell: string
  ui: string
}

export interface ThemeAnimations {
  scanline: boolean
}

export interface ThemeConfig {
  name: 'industrial' | 'minimal' | 'cyberpunk'
  colors: ThemeColors
  fonts: ThemeFonts
  animations: ThemeAnimations
}

interface ThemeContextValue {
  theme: ThemeConfig
  setTheme: (name: ThemeConfig['name']) => void
}

const themes: Record<ThemeConfig['name'], ThemeConfig> = {
  industrial,
  minimal,
  cyberpunk,
}

const STORAGE_KEY = 'agentshell-theme'
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600&family=Rajdhani:wght@400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600&family=Share+Tech+Mono&family=Orbitron:wght@400;500;700;900&display=swap'

function applyTheme(config: ThemeConfig): void {
  const root = document.documentElement
  const c = config.colors
  root.style.setProperty('--color-bg', c.pageBg)
  root.style.setProperty('--color-text', c.pageText)
  root.style.setProperty('--color-sidebar-bg', c.sidebarBg)
  root.style.setProperty('--color-sidebar-border', c.sidebarBorder)
  root.style.setProperty('--color-terminal-bg', c.terminalBg)
  root.style.setProperty('--color-ai-bg', c.aiPanelBg)
  root.style.setProperty('--color-ai-border', c.aiPanelBorder)
  root.style.setProperty('--color-accent', c.accent)
  root.style.setProperty('--color-accent2', c.accent2 ?? c.accent)
  root.style.setProperty('--color-accent3', c.accent3 ?? c.accent2 ?? c.accent)
  root.style.setProperty('--color-muted', c.textMuted)
  root.style.setProperty('--color-dim', c.textDim)
  root.style.setProperty('--color-green', c.green)
  root.style.setProperty('--color-red', c.red)
  root.style.setProperty('--color-cursor', c.cursorColor)
  root.style.setProperty('--color-prompt', c.promptColor)
  root.style.setProperty('--color-badge-bg', c.badgeBg)
  root.style.setProperty('--color-badge-border', c.badgeBorder)
  root.style.setProperty('--color-badge-text', c.badgeText)
  root.style.setProperty('--color-online', c.statusOnline)
  root.style.setProperty('--color-warn', c.statusWarn)
  root.style.setProperty('--color-offline', c.statusOffline)
  root.style.setProperty('--font-shell', config.fonts.shell)
  root.style.setProperty('--font-ui', config.fonts.ui)
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: industrial,
  setTheme: () => undefined,
})

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [themeName, setThemeName] = useState<ThemeConfig['name']>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'industrial' || saved === 'minimal' || saved === 'cyberpunk') return saved
    return 'industrial'
  })

  // Inject Google Fonts once
  useEffect(() => {
    if (document.getElementById('agentshell-fonts')) return
    const link = document.createElement('link')
    link.id = 'agentshell-fonts'
    link.rel = 'stylesheet'
    link.href = FONTS_HREF
    document.head.appendChild(link)
  }, [])

  // Apply CSS vars whenever theme changes
  useEffect(() => {
    applyTheme(themes[themeName])
    localStorage.setItem(STORAGE_KEY, themeName)
  }, [themeName])

  return (
    <ThemeContext.Provider value={{ theme: themes[themeName], setTheme: setThemeName }}>
      {children}
    </ThemeContext.Provider>
  )
}
