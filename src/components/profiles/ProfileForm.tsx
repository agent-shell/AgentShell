import { useState } from 'react'
import { saveProfile, type ConnectionProfile } from '../../lib/tauri'

interface ProfileFormProps {
  profile?: ConnectionProfile
  onSave: (saved: ConnectionProfile) => void
  onCancel: () => void
}

export function ProfileForm({ profile, onSave, onCancel }: ProfileFormProps) {
  const isEdit = profile !== undefined
  const [name, setName] = useState(profile?.name ?? '')
  const [host, setHost] = useState(profile?.host ?? '')
  const [port, setPort] = useState(String(profile?.port ?? 22))
  const [username, setUsername] = useState(profile?.username ?? '')
  const [authKind, setAuthKind] = useState<'password' | 'publickey' | 'agent'>(profile?.auth_kind ?? 'publickey')
  const [keyPath, setKeyPath] = useState(profile?.key_path ?? '')
  const [tags, setTags] = useState(profile?.tags?.join(', ') ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const saved = await saveProfile({
        id: profile?.id ?? crypto.randomUUID(),
        name: name.trim() || `${username}@${host}`,
        host: host.trim(),
        port: Number.parseInt(port, 10) || 22,
        username: username.trim(),
        auth_kind: authKind,
        key_path: authKind === 'publickey' && keyPath.trim() ? keyPath.trim() : undefined,
        tags: tags
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean),
      })
      onSave(saved)
    } catch (err) {
      setError(
        err != null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form-card form-grid" onSubmit={handleSubmit}>
      <div className="quick-connect-card__title">
        <span>{isEdit ? 'Edit profile' : 'New profile'}</span>
        <span className="meta-label">SSH</span>
      </div>

      <label className="form-grid">
        <span className="section-label">Name</span>
        <input className="themed-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My production bastion" />
      </label>

      <div className="form-grid form-grid--two">
        <label className="form-grid">
          <span className="section-label">Host</span>
          <input
            className="themed-input"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="192.168.1.10"
            required
          />
        </label>
        <label className="form-grid">
          <span className="section-label">Port</span>
          <input
            className="themed-input"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            type="number"
            min={1}
            max={65535}
          />
        </label>
      </div>

      <label className="form-grid">
        <span className="section-label">Username</span>
        <input className="themed-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root" required />
      </label>

      <label className="form-grid">
        <span className="section-label">Auth mode</span>
        <select className="themed-select" value={authKind} onChange={(e) => setAuthKind(e.target.value as 'password' | 'publickey' | 'agent')}>
          <option value="publickey">Private key</option>
          <option value="agent">SSH agent</option>
          <option value="password">Password</option>
        </select>
      </label>

      {authKind === 'publickey' ? (
        <label className="form-grid">
          <span className="section-label">Key path</span>
          <input className="themed-input" value={keyPath} onChange={(e) => setKeyPath(e.target.value)} placeholder="~/.ssh/id_ed25519" />
        </label>
      ) : null}

      <label className="form-grid">
        <span className="section-label">Tags</span>
        <input className="themed-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="production, us-east" />
      </label>

      {error ? <div className="inline-error">{error}</div> : null}

      <div className="form-actions">
        <button className="themed-button-secondary" type="submit" disabled={saving}>
          {saving ? 'Saving' : isEdit ? 'Save profile' : 'Create profile'}
        </button>
        <button className="themed-button-ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
