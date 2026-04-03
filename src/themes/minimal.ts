import type { ThemeConfig } from '../ThemeProvider'

const minimal: ThemeConfig = {
  name: 'minimal',
  colors: {
    pageBg: '#eeecea',
    pageText: '#1a1917',
    sidebarBg: '#f8f7f5',
    sidebarBorder: '#e0dedd',
    terminalBg: '#f8f7f5',
    aiPanelBg: '#ffffff',
    aiPanelBorder: '#e0dedd',
    accent: '#1a1917',
    textMuted: '#b0aead',
    textDim: '#d4d2ce',
    green: '#16a34a',
    red: '#dc2626',
    cursorColor: '#1a1917',
    promptColor: '#6b6a67',
    badgeBg: '#f2f0ed',
    badgeBorder: '#d0cecc',
    badgeText: '#6b6a67',
    statusOnline: '#16a34a',
    statusWarn: '#d97706',
    statusOffline: '#b0aead',
  },
  fonts: {
    shell: "'IBM Plex Mono', monospace",
    ui: "'DM Sans', sans-serif",
  },
  animations: {
    scanline: false,
  },
}

export default minimal
