import React from 'react'
import { useTheme } from '../ThemeProvider'
import type { ThemeConfig } from '../ThemeProvider'

interface SwatchDef {
  bg: string
  border?: string
}

interface CardDef {
  name: ThemeConfig['name']
  label: string
  desc: string
  tags: string[]
  swatches: SwatchDef[]
}

const CARDS: CardDef[] = [
  {
    name: 'industrial',
    label: 'Dark Industrial',
    desc: '精密仪表盘 · 青金配色 · 工业质感',
    tags: ['Dark', 'JetBrains Mono', 'Professional'],
    swatches: [
      { bg: '#0b0f18', border: 'rgba(212,168,75,0.3)' },
      { bg: '#d4a84b' },
      { bg: '#2dd4bf' },
      { bg: '#34d399' },
    ],
  },
  {
    name: 'minimal',
    label: 'Light Minimal',
    desc: '极简白 · 日系精工 · 高对比清晰',
    tags: ['Light', 'IBM Plex Mono', 'Enterprise'],
    swatches: [
      { bg: '#ffffff', border: '#d0cecc' },
      { bg: '#1a1917' },
      { bg: '#16a34a' },
      { bg: '#dc2626' },
    ],
  },
  {
    name: 'cyberpunk',
    label: 'Cyberpunk Neon',
    desc: '深空紫红 · 霓虹扫描线 · 极客文化',
    tags: ['Dark', 'Orbitron', 'Hacker'],
    swatches: [
      { bg: '#06030d', border: 'rgba(192,132,252,0.3)' },
      { bg: '#c084fc' },
      { bg: '#f472b6' },
      { bg: '#22d3ee' },
    ],
  },
]

export function ThemeSwitcher(): React.ReactElement {
  const { theme, setTheme } = useTheme()
  const c = theme.colors

  return (
    <div
      style={{
        background: 'var(--color-sidebar-bg)',
        border: '1px solid var(--color-sidebar-border)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: c.textMuted,
          fontFamily: 'var(--font-ui)',
          marginBottom: 14,
        }}
      >
        Select a theme
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        {CARDS.map((card) => {
          const isActive = theme.name === card.name
          return (
            <div
              key={card.name}
              onClick={() => setTheme(card.name)}
              style={{
                background: isActive ? c.accent + '0f' : 'var(--color-terminal-bg)',
                border: `1.5px solid ${isActive ? c.accent : 'var(--color-sidebar-border)'}`,
                borderRadius: 8,
                padding: '14px 16px',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              } as React.CSSProperties}
            >
              {/* Active checkmark */}
              {isActive && (
                <span
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 12,
                    fontSize: 12,
                    color: c.accent,
                    fontWeight: 700,
                  }}
                >
                  ✓
                </span>
              )}

              {/* Swatches */}
              <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                {card.swatches.map((sw, i) => (
                  <div
                    key={i}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      background: sw.bg,
                      border: sw.border ? `1px solid ${sw.border}` : undefined,
                    }}
                  />
                ))}
              </div>

              {/* Name */}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--color-text)',
                  letterSpacing: '0.04em',
                  marginBottom: 3,
                }}
              >
                {card.label}
              </div>

              {/* Description */}
              <div
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--color-text)',
                  opacity: 0.45,
                  lineHeight: 1.5,
                }}
              >
                {card.desc}
              </div>

              {/* Tags */}
              <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
                {card.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: 20,
                      background: 'var(--color-badge-bg)',
                      border: '1px solid var(--color-badge-border)',
                      color: 'var(--color-badge-text)',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
