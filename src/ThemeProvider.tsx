import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import industrial from './themes/industrial'
import minimal from './themes/minimal'
import cyberpunk from './themes/cyberpunk'

export interface ThemeColors {
  pageBg: string
  pageBgElevated: string
  pageText: string
  textMuted: string
  textDim: string
  titlebarBg: string
  titlebarBorder: string
  titlebarGlow: string
  sidebarBg: string
  sidebarElevatedBg: string
  sidebarBorder: string
  panelBg: string
  panelElevatedBg: string
  panelBorder: string
  terminalBg: string
  terminalToolbarBg: string
  terminalInputBg: string
  aiPanelBg: string
  aiPanelBorder: string
  cardBg: string
  cardBorder: string
  cardActiveBg: string
  cardActiveBorder: string
  inputBg: string
  inputBorder: string
  inputPlaceholder: string
  inputFocus: string
  accent: string
  accentSoft: string
  accent2?: string
  accent3?: string
  green: string
  yellow: string
  red: string
  cursorColor: string
  promptColor: string
  badgeBg: string
  badgeBorder: string
  badgeText: string
  statusOnline: string
  statusWarn: string
  statusOffline: string
  shadow: string
  overlay: string
}

export interface ThemeFonts {
  shell: string
  ui: string
}

export interface ThemeAnimations {
  scanline: boolean
  grid: boolean
  glow: boolean
}

export interface ThemeConfig {
  name: 'industrial' | 'minimal' | 'cyberpunk'
  displayName: string
  colors: ThemeColors
  fonts: ThemeFonts
  animations: ThemeAnimations
}

interface ThemeContextValue {
  theme: ThemeConfig
  setTheme: (name: ThemeConfig['name']) => void
  themes: ThemeConfig[]
}

const themeMap: Record<ThemeConfig['name'], ThemeConfig> = {
  industrial,
  minimal,
  cyberpunk,
}

const STORAGE_KEY = 'agentshell-theme'
function applyTheme(config: ThemeConfig): void {
  const root = document.documentElement
  const body = document.body
  const c = config.colors

  root.dataset.theme = config.name
  body.dataset.theme = config.name

  root.style.setProperty('--color-page-bg', c.pageBg)
  root.style.setProperty('--color-page-bg-elevated', c.pageBgElevated)
  root.style.setProperty('--color-page-text', c.pageText)
  root.style.setProperty('--color-text-muted', c.textMuted)
  root.style.setProperty('--color-text-dim', c.textDim)
  root.style.setProperty('--color-titlebar-bg', c.titlebarBg)
  root.style.setProperty('--color-titlebar-border', c.titlebarBorder)
  root.style.setProperty('--color-titlebar-glow', c.titlebarGlow)
  root.style.setProperty('--color-sidebar-bg', c.sidebarBg)
  root.style.setProperty('--color-sidebar-elevated-bg', c.sidebarElevatedBg)
  root.style.setProperty('--color-sidebar-border', c.sidebarBorder)
  root.style.setProperty('--color-panel-bg', c.panelBg)
  root.style.setProperty('--color-panel-elevated-bg', c.panelElevatedBg)
  root.style.setProperty('--color-panel-border', c.panelBorder)
  root.style.setProperty('--color-terminal-bg', c.terminalBg)
  root.style.setProperty('--color-terminal-toolbar-bg', c.terminalToolbarBg)
  root.style.setProperty('--color-terminal-input-bg', c.terminalInputBg)
  root.style.setProperty('--color-ai-bg', c.aiPanelBg)
  root.style.setProperty('--color-ai-border', c.aiPanelBorder)
  root.style.setProperty('--color-card-bg', c.cardBg)
  root.style.setProperty('--color-card-border', c.cardBorder)
  root.style.setProperty('--color-card-active-bg', c.cardActiveBg)
  root.style.setProperty('--color-card-active-border', c.cardActiveBorder)
  root.style.setProperty('--color-input-bg', c.inputBg)
  root.style.setProperty('--color-input-border', c.inputBorder)
  root.style.setProperty('--color-input-placeholder', c.inputPlaceholder)
  root.style.setProperty('--color-input-focus', c.inputFocus)
  root.style.setProperty('--color-accent', c.accent)
  root.style.setProperty('--color-accent-soft', c.accentSoft)
  root.style.setProperty('--color-accent2', c.accent2 ?? c.accent)
  root.style.setProperty('--color-accent3', c.accent3 ?? c.accent2 ?? c.accent)
  root.style.setProperty('--color-green', c.green)
  root.style.setProperty('--color-yellow', c.yellow)
  root.style.setProperty('--color-red', c.red)
  root.style.setProperty('--color-cursor', c.cursorColor)
  root.style.setProperty('--color-prompt', c.promptColor)
  root.style.setProperty('--color-badge-bg', c.badgeBg)
  root.style.setProperty('--color-badge-border', c.badgeBorder)
  root.style.setProperty('--color-badge-text', c.badgeText)
  root.style.setProperty('--color-status-online', c.statusOnline)
  root.style.setProperty('--color-status-warn', c.statusWarn)
  root.style.setProperty('--color-status-offline', c.statusOffline)
  root.style.setProperty('--color-shadow', c.shadow)
  root.style.setProperty('--color-overlay', c.overlay)
  root.style.setProperty('--font-shell', config.fonts.shell)
  root.style.setProperty('--font-ui', config.fonts.ui)
  root.style.setProperty('--window-shadow', c.shadow)
  root.style.colorScheme = config.name === 'minimal' ? 'light' : 'dark'
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: industrial,
  setTheme: () => undefined,
  themes: [industrial, minimal, cyberpunk],
})

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [themeName, setThemeName] = useState<ThemeConfig['name']>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'industrial' || saved === 'minimal' || saved === 'cyberpunk') {
      return saved
    }
    return 'industrial'
  })

  useEffect(() => {
    applyTheme(themeMap[themeName])
    localStorage.setItem(STORAGE_KEY, themeName)
  }, [themeName])

  const value = useMemo(
    () => ({ theme: themeMap[themeName], setTheme: setThemeName, themes: [industrial, minimal, cyberpunk] }),
    [themeName],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
