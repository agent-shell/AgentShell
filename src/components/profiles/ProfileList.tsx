/**
 * ProfileList — sidebar list of saved SSH connection profiles.
 * Click a profile to connect (prompts for password/passphrase if needed).
 */
import { useState, useEffect } from "react";
import {
  listProfiles,
  deleteProfile,
  connectProfile,
  saveProfile,
  type ConnectionProfile,
} from "../../lib/tauri";

interface ProfileListProps {
  onConnected: (sessionId: string, label: string) => void;
}

export function ProfileList({ onConnected }: ProfileListProps) {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProfiles().then(setProfiles).catch(console.error);
  }, []);

  async function handleConnect(profile: ConnectionProfile) {
    setError(null);
    setConnecting(profile.id);
    try {
      let password: string | undefined;
      let keyPassphrase: string | undefined;

      if (profile.auth_kind === "password") {
        password = window.prompt(`Password for ${profile.username}@${profile.host}:`) ?? undefined;
        if (password === undefined) return;
      } else if (profile.auth_kind === "publickey") {
        const p = window.prompt(`Passphrase for key (leave empty if none):`);
        keyPassphrase = p || undefined;
      }

      const result = await connectProfile(profile.id, password, keyPassphrase);
      onConnected(result.session_id, `${profile.username}@${profile.host}`);
    } catch (err) {
      const msg =
        err != null && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
      setError(msg);
    } finally {
      setConnecting(null);
    }
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

  if (profiles.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs text-[#8b949e] font-medium uppercase tracking-wider">
        Saved
      </p>
      {profiles.map((profile) => (
        <div
          key={profile.id}
          className="group flex items-center justify-between px-2 py-1.5 rounded bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff] cursor-pointer transition-colors"
          onClick={() => handleConnect(profile)}
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
              <button
                onClick={(e) => handleDelete(profile.id, e)}
                className="text-[#6e7681] hover:text-[#ff7b72] opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                title="Delete profile"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-[#ff7b72] break-words">{error}</p>}
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
