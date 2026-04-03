import { useMemo, useState } from 'react'
import { connectSsh } from '../../lib/tauri'
import { saveCurrentAsProfile } from './ProfileList'

interface QuickConnectProps {
  onConnected: (sessionId: string, label: string, meta?: { kind: 'ssh' | 'local'; host?: string; username?: string }) => void
}

export function QuickConnect({ onConnected }: QuickConnectProps) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [authKind, setAuthKind] = useState<'password' | 'publickey' | 'agent'>('publickey')
  const [password, setPassword] = useState('')
  const [keyPath, setKeyPath] = useState('')
  const [keyPassphrase, setKeyPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const label = useMemo(() => (host ? host : 'quick connect'), [host])

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setConnecting(true)
    setError(null)
    try {
      const result = await connectSsh({
        host,
        port: Number.parseInt(port, 10),
        username,
        auth_kind: authKind,
        password: authKind === 'password' ? password : undefined,
        key_path: authKind === 'publickey' ? keyPath : undefined,
        key_passphrase: authKind === 'publickey' && keyPassphrase ? keyPassphrase : undefined,
      })
      setPassword('')
      onConnected(result.session_id, label, { kind: 'ssh', host, username })
    } catch (err) {
      setError(
        err != null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err),
      )
    } finally {
      setConnecting(false)
    }
  }

  async function handleSave() {
    if (!host || !username) return
    setSaving(true)
    setSaveMessage(null)
    try {
      await saveCurrentAsProfile(
        label,
        host,
        Number.parseInt(port, 10),
        username,
        authKind,
        authKind === 'publickey' ? keyPath || undefined : undefined,
      )
      setSaveMessage('Saved')
      window.setTimeout(() => setSaveMessage(null), 1800)
    } catch {
      setSaveMessage('Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="surface-card quick-connect-card" onSubmit={handleConnect}>
      <div className="quick-connect-card__title">
        <span>Quick connect</span>
        <span className="meta-label">Live</span>
      </div>

      <label className="form-grid">
        <span className="section-label">Hostname or IP</span>
        <input className="themed-input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="prod-bastion.internal" required />
      </label>

      <div className="form-grid form-grid--two">
        <label className="form-grid">
          <span className="section-label">Username</span>
          <input className="themed-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root" required />
        </label>
        <label className="form-grid">
          <span className="section-label">Port</span>
          <input className="themed-input" value={port} onChange={(e) => setPort(e.target.value)} type="number" />
        </label>
      </div>

      <label className="form-grid">
        <span className="section-label">Authentication</span>
        <select className="themed-select" value={authKind} onChange={(e) => setAuthKind(e.target.value as 'password' | 'publickey' | 'agent')}>
          <option value="publickey">Private key</option>
          <option value="agent">SSH agent</option>
          <option value="password">Password</option>
        </select>
      </label>

      {authKind === 'password' ? (
        <label className="form-grid">
          <span className="section-label">Password</span>
          <input className="themed-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
        </label>
      ) : null}

      {authKind === 'publickey' ? (
        <>
          <label className="form-grid">
            <span className="section-label">Key path</span>
            <input className="themed-input" value={keyPath} onChange={(e) => setKeyPath(e.target.value)} placeholder="~/.ssh/id_ed25519" />
          </label>
          <label className="form-grid">
            <span className="section-label">Passphrase</span>
            <input className="themed-input" type="password" value={keyPassphrase} onChange={(e) => setKeyPassphrase(e.target.value)} placeholder="optional" />
          </label>
        </>
      ) : null}

      {error ? <div className="inline-error">{error}</div> : null}

      <div className="form-actions">
        <button className="themed-button-secondary" type="submit" disabled={connecting}>
          {connecting ? 'Connecting' : 'Connect'}
        </button>
        <button className="themed-button-ghost" type="button" disabled={saving || !host || !username} onClick={handleSave}>
          {saveMessage ?? (saving ? 'Saving' : 'Save profile')}
        </button>
      </div>
    </form>
  )
}
