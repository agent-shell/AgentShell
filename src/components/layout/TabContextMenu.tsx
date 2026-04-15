import React, { useEffect, useRef, useState } from 'react'

export interface TabContextItem {
  id: string
  label: string
  icon: React.ReactNode
  disabled?: boolean
  danger?: boolean
}

interface TabContextMenuProps {
  x: number
  y: number
  items: TabContextItem[]
  onSelect: (id: string) => void
  onClose: () => void
}

export function TabContextMenu({ x, y, items, onSelect, onClose }: TabContextMenuProps): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', onDocumentClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    if (!menuRef.current) return

    const rect = menuRef.current.getBoundingClientRect()
    const adjusted = { x: pos.x, y: pos.y }
    if (pos.x + rect.width > window.innerWidth) {
      adjusted.x = window.innerWidth - rect.width - 8
    }
    if (pos.y + rect.height > window.innerHeight) {
      adjusted.y = window.innerHeight - rect.height - 8
    }
    setPos(adjusted)
  }, [])

  return (
    <div
      ref={menuRef}
      className="tab-context-menu"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`tab-context-menu__item${item.disabled ? ' is-disabled' : ''}${item.danger ? ' is-danger' : ''}`}
          disabled={item.disabled}
          onClick={() => { if (!item.disabled) onSelect(item.id) }}
        >
          <span className="tab-context-menu__icon">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}
