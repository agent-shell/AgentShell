import { useEffect } from 'react'
import { useTheme } from '../../ThemeProvider'
import { useTerminal } from '../../hooks/useTerminal'

interface TerminalViewProps {
  sessionId: string
  onDisconnected?: () => void
}

export function TerminalView({ sessionId, onDisconnected }: TerminalViewProps) {
  const { theme } = useTheme()
  const c = theme.colors

  const xtermTheme = {
    background: c.terminalBg,
    foreground: c.pageText,
    cursor: c.cursorColor,
    cursorAccent: c.terminalBg,
    selectionBackground: c.accentSoft,
    black: '#484f58',
    red: c.red,
    green: c.green,
    yellow: c.yellow,
    blue: c.accent3 ?? '#60a5fa',
    magenta: c.accent,
    cyan: c.accent2 ?? c.accent,
    white: c.pageText,
    brightBlack: c.textMuted,
    brightRed: c.red,
    brightGreen: c.green,
    brightYellow: c.yellow,
    brightBlue: c.accent3 ?? '#60a5fa',
    brightMagenta: c.accent,
    brightCyan: c.accent2 ?? c.accent,
    brightWhite: c.pageText,
  }

  const { containerRef, updateXtermTheme } = useTerminal({
    sessionId,
    onDisconnected,
    xtermTheme,
    fontFamily: theme.fonts.shell,
  })

  useEffect(() => {
    updateXtermTheme(xtermTheme, theme.fonts.shell)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.name])

  return (
    <div className="terminal-body">
      {theme.animations.grid ? <div className="terminal-body__grid" /> : null}
      {theme.animations.scanline ? <div className="terminal-body__scanline" /> : null}
      {theme.animations.glow ? <div className="terminal-body__glow" /> : null}
      <div className="terminal-body__mount" ref={containerRef} />
    </div>
  )
}
