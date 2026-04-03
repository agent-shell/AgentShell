import React, { useState } from 'react'
import { useTheme } from '../ThemeProvider'

export interface ServerConnection {
  id: string
  name: string
  host: string
  status: 'online' | 'warn' | 'offline'
  group: string
}

export interface SidebarProps {
  connections: ServerConnection[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function Sidebar({ connections, activeId, onSelect }: SidebarProps): React.ReactElement {
  const { theme } = useTheme()
  const c = theme.colors
  const [search, setSearch] = useState('')

  // Group connections
  const groups: Record<string, ServerConnection[]> = {}
  for (const conn of connections) {
    if (!groups[conn.group]) groups[conn.group] = []
    groups[conn.group].push(conn)
  }

  const filtered = search.trim()
    ? connections.filter(
        (cn) =>
          cn.name.toLowerCase().includes(search.toLowerCase()) ||
          cn.host.toLowerCase().includes(search.toLowerCase()),
      )
    : null

  const statusColor = (status: ServerConnection['status']): string => {
    if (status === 'online') return c.statusOnline
    if (status === 'warn') return c.statusWarn
    return c.statusOffline
  }

  const rowStyle = (id: string): React.CSSProperties => ({
    padding: '7px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    cursor: 'pointer',
    borderLeft: `2px solid ${id === activeId ? c.accent : 'transparent'}`,
    background: id === activeId ? c.accent + '12' : 'transparent',
  })

  const renderRow = (conn: ServerConnection): React.ReactElement => (
    <div
      key={conn.id}
      style={rowStyle(conn.id)}
      onClick={() => onSelect(conn.id)}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          flexShrink: 0,
          background: statusColor(conn.status),
        }}
      />
      <div
        style={{
          width: 27,
          height: 27,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 700,
          flexShrink: 0,
          background: conn.id === activeId ? c.accent + '22' : c.textDim + '44',
          border: `1px solid ${conn.id === activeId ? c.accent + '55' : 'transparent'}`,
          color: conn.id === activeId ? c.accent : c.textMuted,
          fontFamily: 'var(--font-ui)',
        }}
      >
        {conn.name.slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            fontFamily: 'var(--font-ui)',
            color: c.pageText,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {conn.name}
        </div>
        <div
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-shell)',
            color: c.textMuted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {conn.host}
        </div>
      </div>
    </div>
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: c.sidebarBg,
        borderRight: `1px solid ${c.sidebarBorder}`,
        overflow: 'hidden',
        height: '100%',
      }}
    >
      {/* Header + search */}
      <div
        style={{
          padding: '12px 12px 10px',
          borderBottom: `1px solid ${c.sidebarBorder}`,
        }}
      >
        <div
          style={{
            fontSize: 9,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-ui)',
            color: c.textDim,
            marginBottom: 8,
          }}
        >
          Connections
        </div>
        <div
          style={{
            borderRadius: 4,
            padding: '5px 9px',
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            background: c.terminalBg,
            border: `1px solid ${c.sidebarBorder}`,
          }}
        >
          <span style={{ fontSize: 11, color: c.textMuted }}>⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 10.5,
              fontFamily: 'var(--font-shell)',
              color: c.pageText,
              width: '100%',
            }}
          />
        </div>
      </div>

      {/* Connection list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered ? (
          filtered.map(renderRow)
        ) : (
          Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-ui)',
                  color: c.textDim,
                  padding: '8px 12px 3px',
                }}
              >
                {group}
              </div>
              {items.map(renderRow)}
            </div>
          ))
        )}
      </div>

      {/* Footer buttons */}
      <div
        style={{
          marginTop: 'auto',
          padding: '9px 12px',
          display: 'flex',
          gap: 5,
          borderTop: `1px solid ${c.sidebarBorder}`,
        }}
      >
        {[
          { label: 'New', primary: true },
          { label: 'Import', primary: false },
          { label: 'Config', primary: false },
        ].map(({ label, primary }) => (
          <button
            key={label}
            style={{
              flex: 1,
              padding: '6px 0',
              borderRadius: 4,
              fontSize: 9,
              textAlign: 'center',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 600,
              fontFamily: 'var(--font-ui)',
              background: primary ? c.accent + '1a' : 'transparent',
              border: `1px solid ${primary ? c.accent + '4d' : c.sidebarBorder}`,
              color: primary ? c.accent : c.textMuted,
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
