/**
 * HistorySearch — Ctrl+R-style command history modal.
 *
 * Opens on Ctrl+R from within the terminal area (wired in App.tsx).
 * FTS5 search on the Rust side; results update as the user types.
 * Selecting a result calls onSelect(command) which the parent pastes to PTY.
 */
import { useState, useEffect, useRef } from "react";
import { useTheme } from "../../ThemeProvider";
import { searchCommandHistory, recentCommandHistory, type HistoryEntry } from "../../lib/tauri";

interface HistorySearchProps {
  onSelect: (command: string) => void;
  onClose: () => void;
}

export function HistorySearch({ onSelect, onClose }: HistorySearchProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HistoryEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Load recent history on open
    recentCommandHistory(20).then(setResults).catch(() => {});
  }, []);

  useEffect(() => {
    setSelectedIdx(0);
    if (query.trim() === "") {
      recentCommandHistory(20).then(setResults).catch(() => {});
      return;
    }
    const t = setTimeout(() => {
      searchCommandHistory(query, 20).then(setResults).catch(() => {});
    }, 120);
    return () => clearTimeout(t);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { setSelectedIdx((i) => Math.min(i + 1, results.length - 1)); e.preventDefault(); return; }
    if (e.key === "ArrowUp") { setSelectedIdx((i) => Math.max(i - 1, 0)); e.preventDefault(); return; }
    if (e.key === "Enter" && results[selectedIdx]) {
      onSelect(results[selectedIdx].command);
      onClose();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 80,
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "90vw",
          background: c.sidebarBg,
          border: `1px solid ${c.accent}`,
          borderRadius: 6,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "60vh",
        }}
      >
        {/* Search input */}
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${c.sidebarBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: c.textMuted }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search command history…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 12,
              fontFamily: "var(--font-shell)",
              color: c.pageText,
            }}
          />
          <span style={{ fontSize: 10, color: c.textMuted, fontFamily: "var(--font-ui)" }}>ESC to close</span>
        </div>

        {/* Results */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {results.length === 0 && (
            <div style={{ padding: "12px 16px", fontSize: 11, color: c.textMuted, fontStyle: "italic" }}>
              {query ? "No matches" : "No history yet"}
            </div>
          )}
          {results.map((entry, i) => (
            <div
              key={entry.id}
              onClick={() => { onSelect(entry.command); onClose(); }}
              style={{
                padding: "6px 12px",
                cursor: "pointer",
                background: i === selectedIdx ? `${c.accent}18` : "transparent",
                borderLeft: i === selectedIdx ? `2px solid ${c.accent}` : "2px solid transparent",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 12, fontFamily: "var(--font-shell)", color: c.pageText, whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>
                {entry.command}
              </span>
              <span style={{ fontSize: 9, color: c.textMuted, fontFamily: "var(--font-ui)" }}>
                {entry.ts} {entry.hostname ? `· ${entry.hostname}` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
