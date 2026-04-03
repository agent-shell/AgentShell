import { useEffect, useRef, useState } from 'react'
import { recentCommandHistory, searchCommandHistory, type HistoryEntry } from '../../lib/tauri'

interface HistorySearchProps {
  onSelect: (command: string) => void
  onClose: () => void
}

export function HistorySearch({ onSelect, onClose }: HistorySearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HistoryEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    recentCommandHistory(20).then(setResults).catch(() => setResults([]))
  }, [])

  useEffect(() => {
    setSelectedIndex(0)
    if (!query.trim()) {
      recentCommandHistory(20).then(setResults).catch(() => setResults([]))
      return
    }
    const timer = window.setTimeout(() => {
      searchCommandHistory(query, 20).then(setResults).catch(() => setResults([]))
    }, 120)
    return () => window.clearTimeout(timer)
  }, [query])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((current) => Math.min(current + 1, results.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((current) => Math.max(current - 1, 0))
      return
    }
    if (e.key === 'Enter' && results[selectedIndex]) {
      onSelect(results[selectedIndex].command)
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card history-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, calc(100vw - 48px))' }}>
        <div className="modal-title">
          <div>
            <div className="section-label">Command history</div>
            <div className="muted-text" style={{ marginTop: 8 }}>
              Ctrl+R style search across recorded commands.
            </div>
          </div>
          <button className="themed-button-ghost" type="button" onClick={onClose}>
            ESC
          </button>
        </div>

        <div className="surface-card" style={{ marginTop: 16 }}>
          <input
            ref={inputRef}
            className="themed-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search command history..."
          />
        </div>

        <div className="history-list" style={{ marginTop: 16, maxHeight: '54vh' }}>
          {results.length === 0 ? (
            <div className="surface-card muted-text">{query ? 'No history matches.' : 'No command history yet.'}</div>
          ) : null}

          {results.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className={`history-item${index === selectedIndex ? ' is-selected' : ''}`}
              onClick={() => {
                onSelect(entry.command)
                onClose()
              }}
            >
              <span className="history-item__content">
                <div className="history-item__command">{entry.command}</div>
                <div className="history-item__meta">
                  {entry.ts}
                  {entry.hostname ? ` · ${entry.hostname}` : ''}
                </div>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
