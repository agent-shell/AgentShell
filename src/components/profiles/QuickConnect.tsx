/**
 * QuickConnect — minimal sidebar form for connecting to an SSH host.
 * Collects host/port/username/auth and calls connect_ssh.
 */
import { useState } from "react";
import { connectSsh } from "../../lib/tauri";
import { saveCurrentAsProfile } from "./ProfileList";

interface QuickConnectProps {
  onConnected: (sessionId: string, label: string) => void;
}

export function QuickConnect({ onConnected }: QuickConnectProps) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authKind, setAuthKind] = useState<"password" | "publickey" | "agent">(
    "publickey"
  );
  const [password, setPassword] = useState("");
  const [keyPath, setKeyPath] = useState("");
  const [keyPassphrase, setKeyPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConnecting(true);

    try {
      const result = await connectSsh({
        host,
        port: parseInt(port, 10),
        username,
        auth_kind: authKind,
        password: authKind === "password" ? password : undefined,
        key_path: authKind === "publickey" ? keyPath : undefined,
        key_passphrase: authKind === "publickey" && keyPassphrase ? keyPassphrase : undefined,
      });

      const label = `${username}@${host}`;
      onConnected(result.session_id, label);

      // Clear sensitive fields
      setPassword("");
    } catch (err) {
      // Tauri serializes errors as { kind, message } objects
      const msg =
        err != null && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
      setError(msg);
    } finally {
      setConnecting(false);
    }
  }

  async function handleSave() {
    if (!host || !username) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const name = `${username}@${host}`;
      await saveCurrentAsProfile(
        name,
        host,
        parseInt(port, 10),
        username,
        authKind,
        authKind === "publickey" ? keyPath || undefined : undefined,
      );
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (err) {
      setSaveMsg("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleConnect} className="space-y-2">
      <p className="text-xs text-[var(--color-muted)] font-medium uppercase tracking-wider">
        Quick Connect
      </p>

      <input
        type="text"
        placeholder="hostname or IP"
        value={host}
        onChange={(e) => setHost(e.target.value)}
        required
        className="w-full px-2 py-1.5 text-xs bg-[var(--color-terminal-bg)] border border-[var(--color-sidebar-border)] rounded text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]"
      />

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="user"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="flex-1 px-2 py-1.5 text-xs bg-[var(--color-terminal-bg)] border border-[var(--color-sidebar-border)] rounded text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
        <input
          type="number"
          placeholder="22"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          className="w-16 px-2 py-1.5 text-xs bg-[var(--color-terminal-bg)] border border-[var(--color-sidebar-border)] rounded text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      <select
        value={authKind}
        onChange={(e) =>
          setAuthKind(e.target.value as "password" | "publickey" | "agent")
        }
        className="w-full px-2 py-1.5 text-xs bg-[var(--color-terminal-bg)] border border-[var(--color-sidebar-border)] rounded text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
      >
        <option value="agent">SSH Agent</option>
        <option value="publickey">Private Key</option>
        <option value="password">Password</option>
      </select>

      {authKind === "password" && (
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-2 py-1.5 text-xs bg-[var(--color-terminal-bg)] border border-[var(--color-sidebar-border)] rounded text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      )}

      {authKind === "publickey" && (
        <>
          <input
            type="text"
            placeholder="~/.ssh/id_ed25519"
            value={keyPath}
            onChange={(e) => setKeyPath(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-[var(--color-terminal-bg)] border border-[var(--color-sidebar-border)] rounded text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <input
            type="password"
            placeholder="passphrase (optional)"
            value={keyPassphrase}
            onChange={(e) => setKeyPassphrase(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-[var(--color-terminal-bg)] border border-[var(--color-sidebar-border)] rounded text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </>
      )}

      {error && (
        <p className="text-xs text-[var(--color-red)] break-words">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={connecting}
          className="flex-1 py-1.5 text-xs font-medium bg-[var(--color-terminal-bg)] hover:border-[var(--color-accent)] border border-[var(--color-sidebar-border)] rounded text-[var(--color-text)] transition-colors disabled:opacity-50"
        >
          {connecting ? "Connecting…" : "Connect"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !host || !username}
          title="Save as profile"
          className="px-2 py-1.5 text-xs bg-[var(--color-terminal-bg)] hover:border-[var(--color-accent)] border border-[var(--color-sidebar-border)] rounded text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-40"
        >
          {saveMsg ?? "Save"}
        </button>
      </div>
    </form>
  );
}
