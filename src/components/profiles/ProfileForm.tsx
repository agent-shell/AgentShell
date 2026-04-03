import { useState } from "react";
import { saveProfile, type ConnectionProfile } from "../../lib/tauri";

interface ProfileFormProps {
  profile?: ConnectionProfile;
  onSave: (saved: ConnectionProfile) => void;
  onCancel: () => void;
}

export function ProfileForm({ profile, onSave, onCancel }: ProfileFormProps) {
  const isEdit = profile !== undefined;

  const [name, setName] = useState(profile?.name ?? "");
  const [host, setHost] = useState(profile?.host ?? "");
  const [port, setPort] = useState(String(profile?.port ?? 22));
  const [username, setUsername] = useState(profile?.username ?? "");
  const [authKind, setAuthKind] = useState<"password" | "publickey" | "agent">(
    profile?.auth_kind ?? "publickey"
  );
  const [password, setPassword] = useState("");
  const [keyPath, setKeyPath] = useState(profile?.key_path ?? "");
  const [keyPassphrase, setKeyPassphrase] = useState("");
  const [tags, setTags] = useState(profile?.tags?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated: ConnectionProfile = {
        id: profile?.id ?? crypto.randomUUID(),
        name: name.trim() || `${username}@${host}`,
        host: host.trim(),
        port: parseInt(port, 10) || 22,
        username: username.trim(),
        auth_kind: authKind,
        key_path: authKind === "publickey" && keyPath.trim() ? keyPath.trim() : undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const saved = await saveProfile(updated);
      onSave(saved);
    } catch (err) {
      setError(err != null && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err));
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-2 py-1.5 text-xs bg-[#161b22] border border-[#30363d] rounded text-[#c9d1d9] placeholder-[#6e7681] focus:border-[#58a6ff] focus:outline-none";
  const labelCls = "text-xs text-[#8b949e] uppercase tracking-wider";

  return (
    <form onSubmit={handleSubmit} className="space-y-2 p-3 bg-[#0d1117] border border-[#30363d] rounded">
      <p className="text-xs text-[#58a6ff] font-semibold">
        {isEdit ? "Edit Profile" : "New Profile"}
      </p>

      <div>
        <label className={labelCls}>Name</label>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My server"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className={labelCls}>Host</label>
          <input
            className={inputCls}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="192.168.1.1"
            required
          />
        </div>
        <div className="w-16">
          <label className={labelCls}>Port</label>
          <input
            className={inputCls}
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            min={1}
            max={65535}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Username</label>
        <input
          className={inputCls}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="root"
          required
        />
      </div>

      <div>
        <label className={labelCls}>Auth</label>
        <select
          className={inputCls}
          value={authKind}
          onChange={(e) =>
            setAuthKind(e.target.value as "password" | "publickey" | "agent")
          }
        >
          <option value="publickey">Public Key</option>
          <option value="password">Password</option>
          <option value="agent">SSH Agent</option>
        </select>
      </div>

      {authKind === "password" && (
        <div>
          <label className={labelCls}>Password</label>
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="stored only for this session"
            autoComplete="current-password"
          />
        </div>
      )}

      {authKind === "publickey" && (
        <>
          <div>
            <label className={labelCls}>Key path</label>
            <input
              className={inputCls}
              value={keyPath}
              onChange={(e) => setKeyPath(e.target.value)}
              placeholder="~/.ssh/id_ed25519"
            />
          </div>
          <div>
            <label className={labelCls}>Key passphrase</label>
            <input
              className={inputCls}
              type="password"
              value={keyPassphrase}
              onChange={(e) => setKeyPassphrase(e.target.value)}
              placeholder="leave empty if none"
              autoComplete="current-password"
            />
          </div>
        </>
      )}

      <div>
        <label className={labelCls}>Tags (comma-separated)</label>
        <input
          className={inputCls}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="production, us-east"
        />
      </div>

      {error && <p className="text-xs text-[#ff7b72] break-words">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 text-xs bg-[#21262d] hover:bg-[#30363d] border border-[#58a6ff] rounded text-[#58a6ff] disabled:opacity-50"
        >
          {saving ? "Saving..." : isEdit ? "Save" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs border border-[#30363d] rounded text-[#8b949e] hover:text-[#c9d1d9]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
