import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useTheme } from '../ThemeProvider'

export interface TerminalProps {
  sessionId: string | null
  onAskAI?: () => void
}

export function Terminal({ sessionId, onAskAI }: TerminalProps): React.ReactElement {
  const { theme } = useTheme()
  const c = theme.colors
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)

  // Init xterm once
  useEffect(() => {
    if (!containerRef.current) return
    const term = new XTerm({
      fontFamily: theme.fonts.shell,
      fontSize: 12,
      cursorBlink: true,
      theme: {
        background: c.terminalBg,
        foreground: c.pageText,
        cursor: c.cursorColor,
        cursorAccent: c.pageBg,
        black: c.pageBg,
        brightBlack: c.textDim,
        white: c.pageText,
        brightWhite: '#ffffff',
        green: c.green,
        red: c.red,
      },
    })
    term.open(containerRef.current)
    term.writeln('\x1b[32mAgentShell\x1b[0m — ready')
    xtermRef.current = term
    return () => {
      term.dispose()
      xtermRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply theme on theme change
  useEffect(() => {
    const term = xtermRef.current
    if (!term) return
    term.options.fontFamily = theme.fonts.shell
    term.options.theme = {
      background: c.terminalBg,
      foreground: c.pageText,
      cursor: c.cursorColor,
      cursorAccent: c.pageBg,
      green: c.green,
      red: c.red,
    }
  }, [theme, c])

  // Scanline overlay for cyberpunk
  const scanlineStyle: React.CSSProperties =
    theme.name === 'cyberpunk'
      ? {
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(192,132,252,0.018) 3px, rgba(192,132,252,0.018) 4px)',
        }
      : {}

  // Industrial grid overlay
  const gridStyle: React.CSSProperties =
    theme.name === 'industrial'
      ? {
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(rgba(45,212,191,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.025) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }
      : {}

  // Teal/green/cyan for LIVE pill
  const liveColor = theme.name === 'cyberpunk' ? (c.accent3 ?? c.green) : c.green

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: c.terminalBg,
        height: '100%',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          padding: '7px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          flexShrink: 0,
          borderBottom: `1px solid ${c.sidebarBorder}`,
          background: c.terminalBg,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontFamily: 'var(--font-ui)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: liveColor,
            background: liveColor + '14',
            border: `1px solid ${liveColor}33`,
            padding: '2px 8px',
            borderRadius: 2,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: liveColor,
              display: 'inline-block',
            }}
          />
          Live
        </div>
        <span
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-shell)',
            color: c.textMuted,
          }}
        >
          {sessionId ? `session:${sessionId.slice(0, 8)}` : 'no session'}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-ui)',
            fontSize: 10,
            fontWeight: 700,
            color: c.green,
            letterSpacing: '0.07em',
          }}
        >
          12ms
        </span>
      </div>

      {/* Terminal body */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {theme.name === 'industrial' && <div style={gridStyle} />}
        {theme.name === 'cyberpunk' && (
          <>
            <div style={scanlineStyle} />
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: 'rgba(192,132,252,0.05)',
                animation: 'scla 7s linear infinite',
                zIndex: 6,
                pointerEvents: 'none',
              }}
            />
          </>
        )}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Input row */}
      <div
        style={{
          padding: '8px 17px',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          flexShrink: 0,
          borderTop: `1px solid ${c.sidebarBorder}`,
          background: c.aiPanelBg,
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            flexShrink: 0,
            color: c.promptColor,
            fontFamily: 'var(--font-shell)',
          }}
        >
          ❯
        </span>
        <input
          placeholder="Type command..."
          style={{
            flex: 1,
            fontSize: 11.5,
            fontFamily: 'var(--font-shell)',
            color: c.pageText,
            background: 'transparent',
            border: 'none',
            outline: 'none',
          }}
        />
        {onAskAI && (
          <button
            onClick={onAskAI}
            style={{
              fontSize: 9,
              letterSpacing: '0.06em',
              padding: '4px 11px',
              cursor: 'pointer',
              flexShrink: 0,
              fontFamily: 'var(--font-ui)',
              fontWeight: theme.name === 'minimal' ? 600 : 700,
              textTransform: theme.name === 'minimal' ? undefined : 'uppercase',
              background:
                theme.name === 'minimal'
                  ? c.accent
                  : (c.accent2 ?? c.accent) + '14',
              border:
                theme.name === 'minimal'
                  ? 'none'
                  : `1px solid ${(c.accent2 ?? c.accent)}33`,
              color: theme.name === 'minimal' ? '#fff' : (c.accent2 ?? c.accent),
              borderRadius: theme.name === 'minimal' ? 4 : 2,
            }}
          >
            Ask AI
          </button>
        )}
      </div>

      <style>{`
        @keyframes scla { from { top: 0; } to { top: 100%; } }
      `}</style>
    </div>
  )
}
