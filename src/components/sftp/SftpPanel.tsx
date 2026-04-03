/**
 * SftpPanel — remote file browser over SFTP.
 *
 * Renders a breadcrumb + listing of files/directories for the active SSH session.
 * Supports: navigate, download (save to local via <a> trick), upload, mkdir, delete, rename.
 */
import { useState, useEffect, useRef } from "react";
import { useTheme } from "../../ThemeProvider";
import {
  listSftpDir,
  downloadSftpFile,
  uploadSftpFile,
  mkdirSftp,
  deleteSftp,
  renameSftp,
  type SftpEntry,
} from "../../lib/tauri";

interface SftpPanelProps {
  sessionId: string;
}

export function SftpPanel({ sessionId }: SftpPanelProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [newDirMode, setNewDirMode] = useState(false);
  const [newDirName, setNewDirName] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load(path);
  }, [sessionId, path]);

  async function load(p: string) {
    setLoading(true);
    setError(null);
    try {
      const list = await listSftpDir(sessionId, p);
      setEntries(list);
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  function navigate(entry: SftpEntry) {
    if (entry.is_dir) setPath(entry.path);
  }

  function navigateUp() {
    if (path === "/" || path === "") return;
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    setPath(parts.length === 0 ? "/" : "/" + parts.join("/"));
  }

  async function handleDownload(entry: SftpEntry) {
    try {
      const bytes = await downloadSftpFile(sessionId, entry.path);
      const blob = new Blob([new Uint8Array(bytes)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? err));
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const data = Array.from(new Uint8Array(buf));
    const dest = path.endsWith("/") ? `${path}${file.name}` : `${path}/${file.name}`;
    try {
      await uploadSftpFile(sessionId, dest, data);
      await load(path);
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? err));
    }
    e.target.value = "";
  }

  async function handleDelete(entry: SftpEntry) {
    if (!confirm(`Delete ${entry.name}?`)) return;
    try {
      await deleteSftp(sessionId, entry.path, entry.is_dir);
      setEntries((prev) => prev.filter((e) => e.path !== entry.path));
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? err));
    }
  }

  async function handleRename(entry: SftpEntry) {
    if (!renameVal.trim() || renameVal === entry.name) {
      setRenaming(null);
      return;
    }
    const parts = entry.path.split("/");
    parts.pop();
    const dest = [...parts, renameVal.trim()].join("/") || "/";
    try {
      await renameSftp(sessionId, entry.path, dest);
      await load(path);
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? err));
    }
    setRenaming(null);
    setRenameVal("");
  }

  async function handleMkdir() {
    if (!newDirName.trim()) { setNewDirMode(false); return; }
    const dest = path.endsWith("/") ? `${path}${newDirName.trim()}` : `${path}/${newDirName.trim()}`;
    try {
      await mkdirSftp(sessionId, dest);
      await load(path);
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? err));
    }
    setNewDirMode(false);
    setNewDirName("");
  }

  // Build breadcrumb segments
  const segments = path.split("/").filter(Boolean);

  const row: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    padding: "3px 8px",
    fontSize: 11,
    fontFamily: "var(--font-shell)",
    gap: 6,
    borderBottom: `1px solid ${c.sidebarBorder}`,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: c.terminalBg,
        color: c.pageText,
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          borderBottom: `1px solid ${c.sidebarBorder}`,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Breadcrumb */}
        <span
          onClick={() => setPath("/")}
          style={{ fontSize: 11, color: c.accent, cursor: "pointer", fontFamily: "var(--font-shell)" }}
        >
          /
        </span>
        {segments.map((seg, i) => {
          const segPath = "/" + segments.slice(0, i + 1).join("/");
          return (
            <span key={segPath} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, color: c.textMuted }}>/</span>
              <span
                onClick={() => setPath(segPath)}
                style={{ fontSize: 11, color: i === segments.length - 1 ? c.pageText : c.accent, cursor: "pointer", fontFamily: "var(--font-shell)" }}
              >
                {seg}
              </span>
            </span>
          );
        })}
        <div style={{ flex: 1 }} />
        {/* Actions */}
        <button
          onClick={() => load(path)}
          style={{ background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 12, padding: "1px 4px" }}
          title="Refresh"
        >
          ↻
        </button>
        <button
          onClick={() => { setNewDirMode(true); setNewDirName(""); }}
          style={{ background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 11, padding: "1px 4px" }}
          title="New folder"
        >
          +dir
        </button>
        <button
          onClick={() => uploadRef.current?.click()}
          style={{ background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 11, padding: "1px 4px" }}
          title="Upload file"
        >
          ↑upload
        </button>
        <input ref={uploadRef} type="file" style={{ display: "none" }} onChange={handleUpload} />
      </div>

      {/* New dir input */}
      {newDirMode && (
        <div style={{ display: "flex", gap: 6, padding: "4px 8px", borderBottom: `1px solid ${c.sidebarBorder}`, flexShrink: 0 }}>
          <input
            autoFocus
            value={newDirName}
            onChange={(e) => setNewDirName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleMkdir(); if (e.key === "Escape") setNewDirMode(false); }}
            placeholder="directory name"
            style={{ flex: 1, fontSize: 11, fontFamily: "var(--font-shell)", background: c.sidebarBg, border: `1px solid ${c.accent}`, borderRadius: 3, color: c.pageText, padding: "2px 6px", outline: "none" }}
          />
          <button onClick={handleMkdir} style={{ fontSize: 10, color: c.accent, background: "transparent", border: "none", cursor: "pointer" }}>Create</button>
          <button onClick={() => setNewDirMode(false)} style={{ fontSize: 10, color: c.textMuted, background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: "4px 8px", fontSize: 10, color: c.red, borderBottom: `1px solid ${c.sidebarBorder}`, flexShrink: 0 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 10 }}>✕</button>
        </div>
      )}

      {/* Listing */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Up row */}
        {path !== "/" && (
          <div
            onClick={navigateUp}
            style={{ ...row, color: c.textMuted }}
          >
            <span style={{ fontSize: 14 }}>📁</span>
            <span>..</span>
          </div>
        )}

        {loading && (
          <div style={{ padding: "8px 12px", fontSize: 11, color: c.textMuted }}>Loading…</div>
        )}

        {!loading && entries.map((entry) => (
          <div
            key={entry.path}
            style={{ ...row, cursor: entry.is_dir ? "pointer" : "default" }}
            onClick={() => entry.is_dir && navigate(entry)}
          >
            <span style={{ fontSize: 13, flexShrink: 0 }}>{entry.is_dir ? "📁" : "📄"}</span>
            {renaming === entry.path ? (
              <input
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(entry);
                  if (e.key === "Escape") { setRenaming(null); setRenameVal(""); }
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ flex: 1, fontSize: 11, fontFamily: "var(--font-shell)", background: c.sidebarBg, border: `1px solid ${c.accent}`, borderRadius: 2, color: c.pageText, padding: "1px 4px", outline: "none" }}
              />
            ) : (
              <span style={{ flex: 1, color: entry.is_dir ? c.accent : c.pageText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.name}
              </span>
            )}
            {!entry.is_dir && (
              <span style={{ fontSize: 10, color: c.textMuted, flexShrink: 0 }}>
                {formatSize(entry.size)}
              </span>
            )}
            {/* Action buttons — stop propagation so row click doesn't trigger navigate */}
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              {!entry.is_dir && (
                <button
                  onClick={() => handleDownload(entry)}
                  style={{ background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 10, padding: "1px 3px" }}
                  title="Download"
                >
                  ↓
                </button>
              )}
              <button
                onClick={() => { setRenaming(entry.path); setRenameVal(entry.name); }}
                style={{ background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 10, padding: "1px 3px" }}
                title="Rename"
              >
                ✎
              </button>
              <button
                onClick={() => handleDelete(entry)}
                style={{ background: "transparent", border: "none", color: c.red, cursor: "pointer", fontSize: 10, padding: "1px 3px" }}
                title="Delete"
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {!loading && entries.length === 0 && (
          <div style={{ padding: "8px 12px", fontSize: 11, color: c.textMuted, fontStyle: "italic" }}>
            Empty directory
          </div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
