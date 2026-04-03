/**
 * ProfileList — sidebar list of saved SSH connection profiles.
 */
import { useState, useEffect } from "react";
import {
  listProfiles,
  deleteProfile,
  connectProfile,
  saveProfile,
  type ConnectionProfile,
} from "../../lib/tauri";
import { ProfileForm } from "./ProfileForm";

interface ProfileListProps {
  onConnected: (sessionId: string, label: string) => void;
}

export function ProfileList({ onConnected }: ProfileListProps) {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Inline credential form state
  const [pendingConnect, setPendingConnect] = useState<ConnectionProfile | null>(null);
  const [password, setPassword] = useState("");
  const [keyPassphrase, setKeyPassphrase] = useState("");

  // Edit/create form state
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    listProfiles().then(setProfiles).catch(console.error);
  }, []);

  async function submitConnect(profile: ConnectionProfile, pw?: string, kp?: string) {
    setConnectError(null);
    setConnecting(profile.id);
    try {
      const result = await connectProfile(profile.id, pw, kp);
      onConnected(result.session_id, `${profile.username}@${profile.host}`);
      setPendingConnect(null);
      setPassword("");
      setKeyPassphrase("");
    } catch (err) {
      const msg =
        err != null && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
      setConnectError(msg);
    } finally {
      setConnecting(null);
    }
  }

  function handleConnect(profile: ConnectionProfile) {
    if (profile.auth_kind === "agent") {
      submitConnect(profile);
      return;
    }
    // Show inline credential form
    setPendingConnect(profile);
    setPassword("");
    setKeyPassphrase("");
    setConnectError(null);
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("delete profile failed:", err);
    }
  }

  const inputCls =
    "w-full px-2 py-1 text-xs bg-[#161b22] border border-[#30363d] rounded text-[#c9d1d9] placeholder-[#6e7681] focus:border-[#58a6ff] focus:outline-none";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#8b949e] font-medium uppercase tracking-wider">
          Saved
        </p>
        <button
          onClick={() => { setShowCreate(true); setEditingProfile(null); }}
          className="text-xs text-[#58a6ff] hover:text-[#79c0ff]"
          title="New profile"
        >
          +
        </button>
      </div>

      {showCreate && (
        <ProfileForm
          onSave={(saved) => {
            setProfiles((prev) => [...prev, saved]);
            setShowCreate(false);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {profiles.map((profile) => (
        <div key={profile.id}>
          <div
            className="group flex items-center justify-between px-2 py-1.5 rounded bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff] cursor-pointer transition-colors"
            onClick={() => {
              if (editingProfile?.id === profile.id) return;
              handleConnect(profile);
            }}
          >
            <div className="min-w-0">
              <p className="text-xs text-[#c9d1d9] truncate">{profile.name}</p>
              <p className="text-xs text-[#8b949e] truncate">
                {profile.username}@{profile.host}:{profile.port}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-1">
              {connecting === profile.id ? (
                <span className="text-xs text-[#58a6ff]">…</span>
              ) : (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingProfile(editingProfile?.id === profile.id ? null : profile);
                      setShowCreate(false);
                    }}
                    className="text-[#6e7681] hover:text-[#58a6ff] opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                    title="Edit profile"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => handleDelete(profile.id, e)}
                    className="text-[#6e7681] hover:text-[#ff7b72] opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                    title="Delete profile"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Inline edit form */}
          {editingProfile?.id === profile.id && (
            <ProfileForm
              profile={editingProfile}
              onSave={(saved) => {
                setProfiles((prev) =>
                  prev.map((p) => (p.id === saved.id ? saved : p))
                );
                setEditingProfile(null);
              }}
              onCancel={() => setEditingProfile(null)}
            />
          )}

          {/* Inline credential form for connecting */}
          {pendingConnect?.id === profile.id && (
            <div className="mt-1 p-2 bg-[#0d1117] border border-[#30363d] rounded space-y-1">
              {profile.auth_kind === "password" && (
                <div>
                  <label className="text-xs text-[#8b949e] uppercase tracking-wider">
                    Password
                  </label>
                  <input
                    type="password"
                    className={inputCls}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`${profile.username}@${profile.host}`}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitConnect(profile, password, undefined);
                      if (e.key === "Escape") setPendingConnect(null);
                    }}
                    autoComplete="current-password"
                  />
                </div>
              )}
              {profile.auth_kind === "publickey" && (
                <div>
                  <label className="text-xs text-[#8b949e] uppercase tracking-wider">
                    Key passphrase (leave empty if none)
                  </label>
                  <input
                    type="password"
                    className={inputCls}
                    value={keyPassphrase}
                    onChange={(e) => setKeyPassphrase(e.target.value)}
                    placeholder="passphrase"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitConnect(profile, undefined, keyPassphrase || undefined);
                      if (e.key === "Escape") setPendingConnect(null);
                    }}
                    autoComplete="current-password"
                  />
                </div>
              )}
              {connectError && (
                <p className="text-xs text-[#ff7b72] break-words">{connectError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    submitConnect(
                      profile,
                      profile.auth_kind === "password" ? password : undefined,
                      profile.auth_kind === "publickey" ? keyPassphrase || undefined : undefined,
                    )
                  }
                  disabled={connecting === profile.id}
                  className="px-3 py-1 text-xs bg-[#21262d] hover:bg-[#30363d] border border-[#58a6ff] rounded text-[#58a6ff] disabled:opacity-50"
                >
                  {connecting === profile.id ? "Connecting…" : "Connect"}
                </button>
                <button
                  onClick={() => setPendingConnect(null)}
                  className="px-3 py-1 text-xs border border-[#30363d] rounded text-[#8b949e] hover:text-[#c9d1d9]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {profiles.length === 0 && !showCreate && (
        <p className="text-xs text-[#6e7681] italic">No saved profiles.</p>
      )}

      {connectError && !pendingConnect && (
        <p className="text-xs text-[#ff7b72] break-words">{connectError}</p>
      )}
    </div>
  );
}

/**
 * Hook exposed for QuickConnect to save the current form as a profile.
 */
export async function saveCurrentAsProfile(
  name: string,
  host: string,
  port: number,
  username: string,
  authKind: "password" | "publickey" | "agent",
  keyPath?: string,
): Promise<ConnectionProfile> {
  const profile: ConnectionProfile = {
    id: crypto.randomUUID(),
    name,
    host,
    port,
    username,
    auth_kind: authKind,
    key_path: keyPath,
    tags: [],
  };
  return saveProfile(profile);
}
