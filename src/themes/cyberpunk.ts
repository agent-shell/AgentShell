import type { ThemeConfig } from '../ThemeProvider'

const cyberpunk: ThemeConfig = {
  name: 'cyberpunk',
  colors: {
    pageBg: '#06030d',
    pageText: '#e2d9f3',
    sidebarBg: '#0a0614',
    sidebarBorder: 'rgba(192,132,252,0.12)',
    terminalBg: '#06030d',
    aiPanelBg: '#0a0614',
    aiPanelBorder: 'rgba(192,132,252,0.12)',
    accent: '#c084fc',
    accent2: '#f472b6',
    accent3: '#22d3ee',
    textMuted: '#7a6a99',
    textDim: '#2e1f44',
    green: '#4ade80',
    red: '#f87171',
    cursorColor: '#c084fc',
    promptColor: '#c084fc',
    badgeBg: 'rgba(192,132,252,0.08)',
    badgeBorder: 'rgba(192,132,252,0.25)',
    badgeText: '#c084fc',
    statusOnline: '#4ade80',
    statusWarn: '#fbbf24',
    statusOffline: '#7a6a99',
  },
  fonts: {
    shell: "'Share Tech Mono', monospace",
    ui: "'Orbitron', sans-serif",
  },
  animations: {
    scanline: true,
  },
}

export default cyberpunk
