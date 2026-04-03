import type { ThemeConfig } from '../ThemeProvider'

const industrial: ThemeConfig = {
  name: 'industrial',
  colors: {
    pageBg: '#060910',
    pageText: '#c8d4e8',
    sidebarBg: '#0b0f18',
    sidebarBorder: 'rgba(212,168,75,0.12)',
    terminalBg: '#060910',
    aiPanelBg: '#0b0f18',
    aiPanelBorder: 'rgba(212,168,75,0.12)',
    accent: '#d4a84b',
    accent2: '#2dd4bf',
    textMuted: '#5a7090',
    textDim: '#253040',
    green: '#34d399',
    red: '#f87171',
    cursorColor: '#d4a84b',
    promptColor: '#d4a84b',
    badgeBg: 'rgba(212,168,75,0.1)',
    badgeBorder: 'rgba(212,168,75,0.3)',
    badgeText: '#d4a84b',
    statusOnline: '#34d399',
    statusWarn: '#fbbf24',
    statusOffline: '#5a7090',
  },
  fonts: {
    shell: "'JetBrains Mono', monospace",
    ui: "'Rajdhani', sans-serif",
  },
  animations: {
    scanline: false,
  },
}

export default industrial
