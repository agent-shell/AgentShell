import { useEffect, useMemo, useState } from 'react'
import {
  listProfiles,
  deleteProfile,
  connectProfile,
  saveProfile,
  type ConnectionProfile,
} from '../../lib/tauri'
import { ProfileForm } from './ProfileForm'

interface ProfileListProps {
  activeSessionLabel?: string | null
  filterQuery?: string
  suppressEmptyState?: boolean
  onConnected: (sessionId: string, label: string, meta?: { kind: 'ssh' | 'local'; host?: string; username?: string }) => void
}

export function ProfileList({ activeSessionLabel, filterQuery = '', suppressEmptyState = false, onConnected }: ProfileListProps) {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [pendingConnect, setPendingConnect] = useState<ConnectionProfile | null>(null)
  const [password, setPassword] = useState('')
  const [keyPassphrase, setKeyPassphrase] = useState('')
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    listProfiles().then(setProfiles).catch(() => setProfiles([]))
  }, [])

  const visibleProfiles = useMemo(() => {
    const keyword = filterQuery.trim().toLowerCase()
    if (!keyword) return profiles
    return profiles.filter((profile) =>
      [profile.name, profile.host, profile.username, ...(profile.tags ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  }, [filterQuery, profiles])

  const groupedProfiles = useMemo(() => {
    return visibleProfiles.reduce<Record<string, ConnectionProfile[]>>((groups, profile) => {
      const groupName = profile.tags[0] ?? 'Ungrouped'
      if (!groups[groupName]) groups[groupName] = []
      groups[groupName].push(profile)
      return groups
    }, {})
  }, [visibleProfiles])

  const sortedGroups = useMemo(() => {
    return Object.keys(groupedProfiles).sort((a, b) => {
      if (a === 'Ungrouped') return 1
      if (b === 'Ungrouped') return -1
      return a.localeCompare(b)
    })
  }, [groupedProfiles])

  async function submitConnect(profile: ConnectionProfile, providedPassword?: string, providedPassphrase?: string) {
    setConnectingId(profile.id)
    setConnectError(null)
    try {
      const result = await connectProfile(profile.id, providedPassword, providedPassphrase)
      onConnected(result.session_id, profile.name, {
        kind: 'ssh',
        host: profile.host,
        username: profile.username,
      })
      setPendingConnect(null)
      setPassword('')
      setKeyPassphrase('')
    } catch (err) {
      setConnectError(
        err != null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err),
      )
    } finally {
      setConnectingId(null)
    }
  }

  function handleConnect(profile: ConnectionProfile) {
    if (profile.auth_kind === 'agent') {
      void submitConnect(profile)
      return
    }
    setPendingConnect(profile)
    setPassword('')
    setKeyPassphrase('')
    setConnectError(null)
  }

  async function handleDelete(id: string) {
    try {
      await deleteProfile(id)
      setProfiles((current) => current.filter((profile) => profile.id !== id))
      if (editingProfile?.id === id) setEditingProfile(null)
      if (pendingConnect?.id === id) setPendingConnect(null)
    } catch (err) {
      setConnectError(
        err != null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err),
      )
    }
  }

  return (
    <div className="profile-list">
      {showCreate ? (
        <ProfileForm
          onSave={(saved) => {
            setProfiles((current) => [...current, saved])
            setShowCreate(false)
          }}
          onCancel={() => setShowCreate(false)}
        />
      ) : null}

      {sortedGroups.map((groupName) => (
        <div className="profile-group" key={groupName}>
          {sortedGroups.length > 1 ? (
            <div className="profile-group__label section-label">{groupName}</div>
          ) : null}

          {groupedProfiles[groupName].map((profile) => {
            const isActive = activeSessionLabel === profile.name
            const isEditing = editingProfile?.id === profile.id
            return (
              <div key={profile.id}>
                <div
                  className={`profile-row${isActive ? ' is-active' : ''}${isEditing ? ' is-editing' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (isEditing) return
                    handleConnect(profile)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (!isEditing) handleConnect(profile)
                    }
                  }}
                >
                  <span className="profile-avatar">{profile.name.slice(0, 2).toUpperCase()}</span>
                  <span className="profile-copy">
                    <div className="profile-name">{profile.name}</div>
                    <div className="profile-meta">
                      {profile.username}@{profile.host}:{profile.port}
                    </div>
                  </span>
                  <span
                    className="status-dot"
                    style={{
                      marginLeft: 'auto',
                      background:
                        isActive ? 'var(--color-status-online)' : profile.auth_kind === 'agent' ? 'var(--color-status-warn)' : 'var(--color-text-dim)',
                    }}
                  />
                  <span className="profile-actions">
                    <button
                      className="icon-button"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingProfile(isEditing ? null : profile)
                        setShowCreate(false)
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleDelete(profile.id)
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </div>

                {isEditing ? (
                  <ProfileForm
                    profile={editingProfile ?? undefined}
                    onSave={(saved) => {
                      setProfiles((current) => current.map((item) => (item.id === saved.id ? saved : item)))
                      setEditingProfile(null)
                    }}
                    onCancel={() => setEditingProfile(null)}
                  />
                ) : null}

                {pendingConnect?.id === profile.id ? (
                  <div className="form-card form-grid" style={{ marginTop: 8 }}>
                    {profile.auth_kind === 'password' ? (
                      <label className="form-grid">
                        <span className="section-label">Password</span>
                        <input
                          className="themed-input"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={`${profile.username}@${profile.host}`}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void submitConnect(profile, password)
                            if (e.key === 'Escape') setPendingConnect(null)
                          }}
                        />
                      </label>
                    ) : null}

                    {profile.auth_kind === 'publickey' ? (
                      <label className="form-grid">
                        <span className="section-label">Key passphrase</span>
                        <input
                          className="themed-input"
                          type="password"
                          value={keyPassphrase}
                          onChange={(e) => setKeyPassphrase(e.target.value)}
                          placeholder="leave empty if none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void submitConnect(profile, undefined, keyPassphrase || undefined)
                            if (e.key === 'Escape') setPendingConnect(null)
                          }}
                        />
                      </label>
                    ) : null}

                    {connectError ? <div className="inline-error">{connectError}</div> : null}

                    <div className="form-actions">
                      <button
                        className="themed-button-secondary"
                        type="button"
                        disabled={connectingId === profile.id}
                        onClick={() =>
                          void submitConnect(
                            profile,
                            profile.auth_kind === 'password' ? password : undefined,
                            profile.auth_kind === 'publickey' ? keyPassphrase || undefined : undefined,
                          )
                        }
                      >
                        {connectingId === profile.id ? 'Connecting' : 'Connect'}
                      </button>
                      <button
                        className="themed-button-ghost"
                        type="button"
                        onClick={() => {
                          setPendingConnect(null)
                          setPassword('')
                          setKeyPassphrase('')
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ))}

      {profiles.length === 0 && !showCreate && !suppressEmptyState ? (
        <div className="surface-card sidebar-empty-card">
          <div className="section-label">Saved profiles</div>
          <div className="muted-text" style={{ marginTop: 8, lineHeight: 1.6 }}>
            No saved profiles yet. Use `New` for a quick session, then save it as a profile.
          </div>
        </div>
      ) : null}
    </div>
  )
}

export async function saveCurrentAsProfile(
  name: string,
  host: string,
  port: number,
  username: string,
  authKind: 'password' | 'publickey' | 'agent',
  keyPath?: string,
): Promise<ConnectionProfile> {
  return saveProfile({
    id: crypto.randomUUID(),
    name,
    host,
    port,
    username,
    auth_kind: authKind,
    key_path: keyPath,
    tags: [],
  })
}
