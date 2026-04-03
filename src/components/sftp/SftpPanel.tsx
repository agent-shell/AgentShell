import { useEffect, useRef, useState } from 'react'
import {
  deleteSftp,
  downloadSftpFile,
  listSftpDir,
  mkdirSftp,
  renameSftp,
  uploadSftpFile,
  type SftpEntry,
} from '../../lib/tauri'

interface SftpPanelProps {
  sessionId: string
}

export function SftpPanel({ sessionId }: SftpPanelProps) {
  const [path, setPath] = useState('/')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newDirMode, setNewDirMode] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<SftpEntry | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void load(path)
  }, [path, sessionId])

  async function load(nextPath: string) {
    setLoading(true)
    setError(null)
    try {
      const list = await listSftpDir(sessionId, nextPath)
      setEntries(list)
    } catch (err) {
      setError(
        err != null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err),
      )
    } finally {
      setLoading(false)
    }
  }

  function navigateUp() {
    if (path === '/') return
    const parts = path.split('/').filter(Boolean)
    parts.pop()
    setPath(parts.length ? `/${parts.join('/')}` : '/')
  }

  async function handleDownload(entry: SftpEntry) {
    try {
      const bytes = await downloadSftpFile(sessionId, entry.path)
      const blob = new Blob([new Uint8Array(bytes)])
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = entry.name
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(
        err != null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err),
      )
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
      const target = path.endsWith('/') ? `${path}${file.name}` : `${path}/${file.name}`
      await uploadSftpFile(sessionId, target, bytes)
      await load(path)
    } catch (err) {
      setError(
        err != null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err),
      )
    } finally {
      e.target.value = ''
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await deleteSftp(sessionId, pendingDelete.path, pendingDelete.is_dir)
      setEntries((current) => current.filter((entry) => entry.path !== pendingDelete.path))
      setPendingDelete(null)
    } catch (err) {
      setError(
        err != null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err),
      )
    }
  }

  async function handleRename(entry: SftpEntry) {
    if (!renameValue.trim() || renameValue === entry.name) {
      setRenaming(null)
      return
    }
    const parts = entry.path.split('/')
    parts.pop()
    const destination = [...parts, renameValue.trim()].join('/') || '/'
    try {
      await renameSftp(sessionId, entry.path, destination)
      setRenaming(null)
      setRenameValue('')
      await load(path)
    } catch (err) {
      setError(
        err != null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err),
      )
    }
  }

  async function handleCreateDirectory() {
    if (!newDirName.trim()) {
      setNewDirMode(false)
      return
    }
    try {
      const target = path.endsWith('/') ? `${path}${newDirName.trim()}` : `${path}/${newDirName.trim()}`
      await mkdirSftp(sessionId, target)
      setNewDirMode(false)
      setNewDirName('')
      await load(path)
    } catch (err) {
      setError(
        err != null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err),
      )
    }
  }

  const segments = path.split('/').filter(Boolean)

  return (
    <div className="sftp-shell">
      <div className="sftp-toolbar">
        <div className="sftp-breadcrumb">
          <button type="button" onClick={() => setPath('/')}>
            /
          </button>
          {segments.map((segment, index) => {
            const segmentPath = `/${segments.slice(0, index + 1).join('/')}`
            return (
              <span key={segmentPath} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="muted-text">/</span>
                <button type="button" onClick={() => setPath(segmentPath)}>
                  {segment}
                </button>
              </span>
            )
          })}
        </div>
        <span className="toolbar-spacer" />
        <button className="themed-button-ghost" type="button" onClick={() => void load(path)}>
          Refresh
        </button>
        <button
          className="themed-button-ghost"
          type="button"
          onClick={() => {
            setNewDirMode(true)
            setNewDirName('')
          }}
        >
          New dir
        </button>
        <button className="themed-button-secondary" type="button" onClick={() => uploadRef.current?.click()}>
          Upload
        </button>
        <input ref={uploadRef} style={{ display: 'none' }} type="file" onChange={handleUpload} />
      </div>

      {newDirMode ? (
        <div className="sftp-inline-form">
          <input
            className="themed-input"
            autoFocus
            value={newDirName}
            onChange={(e) => setNewDirName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreateDirectory()
              if (e.key === 'Escape') setNewDirMode(false)
            }}
            placeholder="directory name"
          />
          <button className="themed-button-secondary" type="button" onClick={() => void handleCreateDirectory()}>
            Create
          </button>
          <button className="themed-button-ghost" type="button" onClick={() => setNewDirMode(false)}>
            Cancel
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="sftp-alert">
          <span className="inline-error">{error}</span>
          <span className="toolbar-spacer" />
          <button className="themed-button-ghost" type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="sftp-list">
        {path !== '/' ? (
          <button className="sftp-row" type="button" onClick={navigateUp}>
            <span className="sftp-row__content">
              <div className="sftp-row__name">..</div>
              <div className="sftp-row__meta">Parent directory</div>
            </span>
          </button>
        ) : null}

        {loading ? <div className="surface-card muted-text">Loading directory...</div> : null}

        {!loading && entries.length === 0 ? <div className="surface-card muted-text">Empty directory</div> : null}

        {!loading &&
          entries.map((entry) => (
            <div className="sftp-row" key={entry.path}>
              <button
                className="sftp-row__content"
                type="button"
                style={{ textAlign: 'left' }}
                onClick={() => {
                  if (entry.is_dir) setPath(entry.path)
                }}
              >
                {renaming === entry.path ? (
                  <input
                    className="themed-input"
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleRename(entry)
                      if (e.key === 'Escape') {
                        setRenaming(null)
                        setRenameValue('')
                      }
                    }}
                  />
                ) : (
                  <>
                    <div className="sftp-row__name">{entry.name}</div>
                    <div className="sftp-row__meta">
                      {entry.is_dir ? 'Directory' : formatSize(entry.size)}
                    </div>
                  </>
                )}
              </button>

              <div className="form-actions" style={{ marginLeft: 'auto' }}>
                {!entry.is_dir ? (
                  <button className="themed-button-ghost" type="button" onClick={() => void handleDownload(entry)}>
                    Download
                  </button>
                ) : null}
                <button
                  className="themed-button-ghost"
                  type="button"
                  onClick={() => {
                    setRenaming(entry.path)
                    setRenameValue(entry.name)
                  }}
                >
                  Rename
                </button>
                <button className="themed-button-danger" type="button" onClick={() => setPendingDelete(entry)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
      </div>

      {pendingDelete ? (
        <div className="sftp-alert">
          <span className="muted-text">
            Delete <strong style={{ color: 'var(--color-page-text)' }}>{pendingDelete.name}</strong>?
          </span>
          <span className="toolbar-spacer" />
          <button className="themed-button-danger" type="button" onClick={() => void confirmDelete()}>
            Confirm delete
          </button>
          <button className="themed-button-ghost" type="button" onClick={() => setPendingDelete(null)}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}
