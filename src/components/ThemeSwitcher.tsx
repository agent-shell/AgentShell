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
  preview: {
    bg: string
    surface: string
    border: string
    text: string
    muted: string
    accent: string
    accent2: string
    shellFont: string
  }
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
    preview: {
      bg: '#060910',
      surface: '#0b0f18',
      border: 'rgba(212,168,75,0.15)',
      text: '#c8d4e8',
      muted: '#5a7090',
      accent: '#d4a84b',
      accent2: '#2dd4bf',
      shellFont: "'JetBrains Mono', monospace",
    },
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
    preview: {
      bg: '#ffffff',
      surface: '#f8f7f5',
      border: '#e0dedd',
      text: '#1a1917',
      muted: '#6b6a67',
      accent: '#1a1917',
      accent2: '#2563eb',
      shellFont: "'IBM Plex Mono', monospace",
    },
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
    preview: {
      bg: '#06030d',
      surface: '#0a0614',
      border: 'rgba(192,132,252,0.15)',
      text: '#e2d9f3',
      muted: '#7a6a99',
      accent: '#c084fc',
      accent2: '#22d3ee',
      shellFont: "'Share Tech Mono', monospace",
    },
  },
]

export function ThemeSwitcher({ onClose }: { onClose?: () => void }): React.ReactElement {
  const { theme, setTheme } = useTheme()
  const active = CARDS.find((card) => card.name === theme.name) ?? CARDS[0]

  return (
    <div className="theme-selector">
      <div className="theme-selector__header">
        <div className="theme-selector__eyebrow">Theme Selection</div>
        <div className="theme-selector__title">
          <span className="brand-mark"><span>A</span></span>
          <span>AgentShell</span>
        </div>
      </div>

      <div className="modal-row">
        <div>
          <div className="section-label">Select a theme</div>
          <div className="muted-text" style={{ marginTop: 8 }}>
            三套主题全部实现，切换后会同步更新窗口外壳、终端和 AI 面板。
          </div>
        </div>
        {onClose ? (
          <button className="themed-button-ghost" type="button" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>

      <div className="theme-grid">
        {CARDS.map((card) => {
          const isActive = theme.name === card.name
          return (
            <button
              key={card.name}
              type="button"
              className={`theme-card${isActive ? ' is-active' : ''}`}
              onClick={() => setTheme(card.name)}
            >
              {isActive ? <span className="theme-card__check">✓</span> : null}
              <div className="theme-card__swatches">
                {card.swatches.map((swatch, index) => (
                  <span
                    key={`${card.name}-${index}`}
                    className="theme-card__swatch"
                    style={{ background: swatch.bg, border: swatch.border ? `1px solid ${swatch.border}` : undefined }}
                  />
                ))}
              </div>
              <div className="theme-card__title">{card.label}</div>
              <div className="theme-card__desc">{card.desc}</div>
              <div className="theme-card__tags">
                {card.tags.map((tag) => (
                  <span className="theme-card__tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      <div className="theme-preview">
        <div
          className="theme-preview-shell"
          style={{
            ['--preview-bg' as string]: active.preview.bg,
            ['--preview-surface' as string]: active.preview.surface,
            ['--preview-border' as string]: active.preview.border,
            ['--preview-text' as string]: active.preview.text,
            ['--preview-shell-font' as string]: active.preview.shellFont,
          }}
        >
          <div className="preview-topbar">
            <div className="window-controls">
              <span className="window-control close" />
              <span className="window-control minimize" />
              <span className="window-control maximize" />
            </div>
            <div style={{ color: active.preview.accent, fontWeight: 700 }}>AgentShell</div>
            <div style={{ marginLeft: 'auto', color: active.preview.accent2, fontSize: 10 }}>Agent Active</div>
          </div>
          <div className="preview-sidebar">
            <div className="section-label" style={{ color: active.preview.muted }}>Connections</div>
            <div style={{ marginTop: 10 }}>
              {['prod-aks-01', 'az-bastion', 'staging-vm'].map((item, index) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0' }}>
                  <span className="status-dot" style={{ background: index === 1 ? '#fbbf24' : index === 2 ? active.preview.muted : '#34d399' }} />
                  <div>
                    <div style={{ color: active.preview.text, fontSize: 11.5 }}>{item}</div>
                    <div style={{ color: active.preview.muted, fontSize: 10 }}>root · live session</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="preview-main">
            <div className="preview-main__top">
              <span className="live-pill" style={{ borderColor: active.preview.accent2, color: active.preview.accent2 }}>
                <span className="pulse-dot" style={{ background: active.preview.accent2 }} />
                Live
              </span>
              <span style={{ color: active.preview.muted, fontSize: 11 }}>root@prod-aks-01 · ~/k8s</span>
            </div>
            <div className="preview-main__body">
              <div style={{ color: active.preview.muted }}>── AgentShell · live diagnostics ─────────────</div>
              <div style={{ marginTop: 8 }}>
                <span style={{ color: active.preview.accent }}>❯ </span>
                <span>kubectl get pods -n production</span>
              </div>
              <div style={{ marginTop: 8, color: '#34d399' }}>api-7d9f8b-xk2m4    1/1   Running</div>
              <div style={{ color: '#f87171' }}>worker-6c5f9d-jt4k9 0/1   CrashLoop</div>
              <div style={{ marginTop: 8, color: active.preview.accent2 }}>AgentShell · PostgreSQL unreachable · diagnosing...</div>
            </div>
          </div>
          <div className="preview-ai">
            <div className="section-label" style={{ color: active.preview.muted }}>AgentShell AI</div>
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, border: `1px solid ${active.preview.border}`, background: active.preview.surface }}>
              <div style={{ color: active.preview.accent, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Analysis</div>
              <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.6 }}>worker pod is crash-looping. Postgres at 10.96.0.15:5432 refused the connection.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
