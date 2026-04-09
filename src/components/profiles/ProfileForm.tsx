import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { saveProfile, openFilePicker, type ConnectionProfile } from '../../lib/tauri'

interface ProfileFormProps {
  profile?: ConnectionProfile
  existingGroups?: string[]
  onSave: (saved: ConnectionProfile) => void
  onCancel: () => void
}

export function ProfileForm({ profile, existingGroups = [], onSave, onCancel }: ProfileFormProps) {
  const isEdit = profile !== undefined
  const [name, setName] = useState(profile?.name ?? '')
  const [host, setHost] = useState(profile?.host ?? '')
  const [port, setPort] = useState(String(profile?.port ?? 22))
  const [username, setUsername] = useState(profile?.username ?? '')
  const [authKind, setAuthKind] = useState<'password' | 'publickey' | 'agent'>(profile?.auth_kind ?? 'publickey')
  const [password, setPassword] = useState(profile?.password ?? '')
  const [keyPath, setKeyPath] = useState(profile?.key_path ?? '')
  const [group, setGroup] = useState(profile?.tags?.[0] ?? '')
  const [extraTags, setExtraTags] = useState(profile?.tags?.slice(1).join(', ') ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleBrowseKey() {
    const path = await openFilePicker('Select SSH Private Key').catch(() => null)
    if (path) setKeyPath(path)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const groupTag = group.trim()
      const otherTags = extraTags.split(',').map((t) => t.trim()).filter(Boolean)
      const tags = groupTag ? [groupTag, ...otherTags] : otherTags
      const saved = await saveProfile({
        id: profile?.id ?? crypto.randomUUID(),
        name: name.trim() || `${username}@${host}`,
        host: host.trim(),
        port: Number.parseInt(port, 10) || 22,
        username: username.trim(),
        auth_kind: authKind,
        key_path: authKind === 'publickey' && keyPath.trim() ? keyPath.trim() : undefined,
        password: authKind === 'password' && password.trim() ? password.trim() : undefined,
        tags,
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
          <input className="themed-input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.10" required />
        </label>
        <label className="form-grid">
          <span className="section-label">Port</span>
          <input className="themed-input" value={port} onChange={(e) => setPort(e.target.value)} type="number" min={1} max={65535} />
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

      {authKind === 'password' ? (
        <label className="form-grid">
          <span className="section-label">Password</span>
          <input className="themed-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="saved password (optional)" autoComplete="new-password" />
        </label>
      ) : null}

      {authKind === 'publickey' ? (
        <label className="form-grid">
          <span className="section-label">Key path</span>
          <div className="input-with-action">
            <input className="themed-input" value={keyPath} onChange={(e) => setKeyPath(e.target.value)} placeholder="~/.ssh/id_ed25519" />
            <button type="button" className="icon-button" onClick={() => void handleBrowseKey()} title="Browse key file">
              <FolderOpen size={13} />
            </button>
          </div>
        </label>
      ) : null}

      <label className="form-grid">
        <span className="section-label">Group</span>
        <input
          className="themed-input"
          list="profile-form-group-list"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder="production"
        />
        <datalist id="profile-form-group-list">
          {existingGroups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </label>

      <label className="form-grid">
        <span className="section-label">Tags (optional)</span>
        <input className="themed-input" value={extraTags} onChange={(e) => setExtraTags(e.target.value)} placeholder="SG, k8s, web" />
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
