/**
 * SettingsPanel — AI backend configuration.
 *
 * Supports three backends:
 *   claude       — Anthropic Claude API (API key required)
 *   ollama       — Local Ollama (base URL + model)
 *   openai-compat — Any OpenAI-compatible endpoint (base URL + API key + model)
 *
 * Settings are persisted to localStorage so they survive page reload.
 * API keys are stored in localStorage (app-isolated in Tauri WebView).
 */
import { useState } from "react";
import { useTheme } from "../../ThemeProvider";
import type { AISettings } from "../../lib/ai/client";

interface SettingsPanelProps {
  settings: AISettings;
  onChange: (updated: AISettings) => void;
  onClose: () => void;
}

const LS_KEY = "agentshell-ai-settings";

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as AISettings;
  } catch {
    // ignore
  }
  return {
    backend: "claude",
    claudeApiKey: localStorage.getItem("agentshell-claude-key") ?? "",
    claudeModel: "claude-sonnet-4-6",
    ollamaBaseUrl: "http://localhost:11434",
    ollamaModel: "llama3",
    openaiCompatBaseUrl: "",
    openaiCompatApiKey: "",
    openaiCompatModel: "gpt-4o",
  };
}

export function saveAISettings(s: AISettings): void {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
  // Keep legacy key in sync so existing code reading it still works
  if (s.claudeApiKey) {
    localStorage.setItem("agentshell-claude-key", s.claudeApiKey);
  }
}

export function SettingsPanel({ settings, onChange, onClose }: SettingsPanelProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [local, setLocal] = useState<AISettings>({ ...settings });

  function update(patch: Partial<AISettings>) {
    setLocal((prev) => ({ ...prev, ...patch }));
  }

  function handleSave() {
    saveAISettings(local);
    onChange(local);
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "4px 8px",
    fontSize: 11,
    fontFamily: "var(--font-shell)",
    background: c.terminalBg,
    border: `1px solid ${c.sidebarBorder}`,
    borderRadius: 3,
    color: c.pageText,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    color: c.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: 3,
    display: "block",
    fontFamily: "var(--font-ui)",
  };

  const sectionStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  return (
    <div
      style={{
        padding: "10px 12px",
        borderBottom: `1px solid ${c.sidebarBorder}`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: c.sidebarBg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: c.accent, fontFamily: "var(--font-ui)", letterSpacing: "0.06em" }}>
          AI Settings
        </span>
        <button
          onClick={onClose}
          style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: c.textMuted, lineHeight: 1, padding: "2px 4px" }}
        >
          ✕
        </button>
      </div>

      {/* Backend selector */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Backend</label>
        <select
          value={local.backend}
          onChange={(e) => update({ backend: e.target.value as AISettings["backend"] })}
          style={inputStyle}
        >
          <option value="claude">Claude (Anthropic)</option>
          <option value="ollama">Ollama (local)</option>
          <option value="openai-compat">OpenAI-compatible</option>
        </select>
      </div>

      {/* Claude fields */}
      {local.backend === "claude" && (
        <>
          <div style={sectionStyle}>
            <label style={labelStyle}>API Key</label>
            <input
              type="password"
              value={local.claudeApiKey ?? ""}
              onChange={(e) => update({ claudeApiKey: e.target.value })}
              placeholder="sk-ant-..."
              style={inputStyle}
              autoComplete="off"
            />
          </div>
          <div style={sectionStyle}>
            <label style={labelStyle}>Model</label>
            <select
              value={local.claudeModel ?? "claude-sonnet-4-6"}
              onChange={(e) => update({ claudeModel: e.target.value })}
              style={inputStyle}
            >
              <option value="claude-opus-4-6">claude-opus-4-6</option>
              <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
              <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
            </select>
          </div>
        </>
      )}

      {/* Ollama fields */}
      {local.backend === "ollama" && (
        <>
          <div style={sectionStyle}>
            <label style={labelStyle}>Base URL</label>
            <input
              type="text"
              value={local.ollamaBaseUrl ?? "http://localhost:11434"}
              onChange={(e) => update({ ollamaBaseUrl: e.target.value })}
              placeholder="http://localhost:11434"
              style={inputStyle}
            />
          </div>
          <div style={sectionStyle}>
            <label style={labelStyle}>Model</label>
            <input
              type="text"
              value={local.ollamaModel ?? "llama3"}
              onChange={(e) => update({ ollamaModel: e.target.value })}
              placeholder="llama3"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* OpenAI-compat fields */}
      {local.backend === "openai-compat" && (
        <>
          <div style={sectionStyle}>
            <label style={labelStyle}>Base URL</label>
            <input
              type="text"
              value={local.openaiCompatBaseUrl ?? ""}
              onChange={(e) => update({ openaiCompatBaseUrl: e.target.value })}
              placeholder="https://api.openai.com"
              style={inputStyle}
            />
          </div>
          <div style={sectionStyle}>
            <label style={labelStyle}>API Key</label>
            <input
              type="password"
              value={local.openaiCompatApiKey ?? ""}
              onChange={(e) => update({ openaiCompatApiKey: e.target.value })}
              placeholder="sk-..."
              style={inputStyle}
              autoComplete="off"
            />
          </div>
          <div style={sectionStyle}>
            <label style={labelStyle}>Model</label>
            <input
              type="text"
              value={local.openaiCompatModel ?? "gpt-4o"}
              onChange={(e) => update({ openaiCompatModel: e.target.value })}
              placeholder="gpt-4o"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* Save / Cancel */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={handleSave}
          style={{
            flex: 1,
            padding: "5px 0",
            fontSize: 10,
            fontWeight: 600,
            background: c.terminalBg,
            border: `1px solid ${c.accent}`,
            borderRadius: 3,
            color: c.accent,
            cursor: "pointer",
            fontFamily: "var(--font-ui)",
          }}
        >
          Save
        </button>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: "5px 0",
            fontSize: 10,
            background: "transparent",
            border: `1px solid ${c.sidebarBorder}`,
            borderRadius: 3,
            color: c.textMuted,
            cursor: "pointer",
            fontFamily: "var(--font-ui)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
