/**
 * AgentShell — main application shell.
 *
 * Three-column layout:
 *   [Sidebar: connection list] | [Terminal tabs area] | [AI Agent panel]
 *
 * This file wires up the top-level layout. Individual panels are in components/.
 */
import { useState, useEffect } from "react";
import "@xterm/xterm/css/xterm.css";
import "./index.css";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { TerminalView } from "./components/terminal/TerminalView";
import { QuickConnect } from "./components/profiles/QuickConnect";
import { ProfileList } from "./components/profiles/ProfileList";
import { AIPanel, type ChatMessage, type CommandProposal } from "./components/AIPanel";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import {
  connectLocalShell,
  getScrollback,
  executeApprovedCommand,
  startHealthMonitor,
  onHealthUpdate,
  type HealthData,
  startRecording,
  stopRecording,
  onRecordingStopped,
} from "./lib/tauri";
import { AIClient, PROPOSE_COMMAND_TOOL, type AISettings } from "./lib/ai/client";
import { extractProposals } from "./lib/ai/streamParser";
import { SettingsPanel, loadAISettings } from "./components/settings/SettingsPanel";
import { SftpPanel } from "./components/sftp/SftpPanel";
import { HistorySearch } from "./components/history/HistorySearch";

interface ActiveSession {
  sessionId: string;
  label: string;
}

function AppShell() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [showThemeSwitcher, setShowThemeSwitcher] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiProposals, setAiProposals] = useState<CommandProposal[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSettings, setAiSettings] = useState<AISettings>(() => loadAISettings());
  const [showSettings, setShowSettings] = useState(false);
  const [showSftp, setShowSftp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Ctrl+R — open history search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "r") {
        e.preventDefault();
        setShowHistory(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Per-session health: sessionId → HealthData
  const [healthMap, setHealthMap] = useState<Record<string, HealthData>>({});
  // Per-session recording: sessionId → file path | null
  const [recordingMap, setRecordingMap] = useState<Record<string, string | null>>({});

  function handleConnected(sessionId: string, label: string) {
    setSessions((prev) => {
      const next = [...prev, { sessionId, label }];
      setActiveIdx(next.length - 1);
      return next;
    });
    // Start health monitor for SSH sessions (local shell won't have the transport, it will just fail quietly)
    startHealthMonitor(sessionId, 60).catch(() => {});
    // Subscribe to health events
    onHealthUpdate(sessionId, (data) => {
      setHealthMap((prev) => ({ ...prev, [sessionId]: data }));
    }).catch(() => {});
    // Subscribe to recording stop events
    onRecordingStopped(sessionId, () => {
      setRecordingMap((prev) => ({ ...prev, [sessionId]: null }));
    }).catch(() => {});
  }

  async function handleLocalShell() {
    try {
      const result = await connectLocalShell();
      handleConnected(result.session_id, "local shell");
    } catch (err) {
      console.error("local shell failed:", err);
    }
  }

  async function handleToggleRecording(sessionId: string) {
    const current = recordingMap[sessionId];
    if (current) {
      await stopRecording(sessionId).catch(console.error);
      setRecordingMap((prev) => ({ ...prev, [sessionId]: null }));
    } else {
      const path = await startRecording(sessionId).catch((e) => { console.error(e); return null; });
      if (path) setRecordingMap((prev) => ({ ...prev, [sessionId]: path }));
    }
  }

  function handleDisconnected(sessionId: string) {
    setSessions((prev) => {
      const next = prev.filter((s) => s.sessionId !== sessionId);
      setActiveIdx(Math.max(0, next.length - 1));
      return next;
    });
  }

  const activeSession = sessions[activeIdx] ?? null;

  async function handleSendMessage(text: string): Promise<void> {
    // Snapshot history BEFORE state updates (avoids stale-closure issue)
    const historySnapshot = aiMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text };
    const assistantId = crypto.randomUUID();
    setAiMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", text: "" }]);
    setAiLoading(true);

    try {
      // Build context from scrollback
      const sessionId = activeSession?.sessionId;
      let context = "";
      if (sessionId) {
        try {
          context = await getScrollback(sessionId, 100);
        } catch {
          // scrollback unavailable, proceed without
        }
      }

      const contextBlock = context
        ? `Terminal context (last 100 lines):\n\`\`\`\n${context}\n\`\`\`\n\n`
        : "";
      const fullText = `${contextBlock}User: ${text}`;

      const history = [...historySnapshot, { role: "user" as const, content: fullText }];

      const client = AIClient.fromSettings(aiSettings);
      const deltas = [];

      for await (const delta of client.chat(history, [PROPOSE_COMMAND_TOOL])) {
        deltas.push(delta);
        if (delta.type === "text") {
          setAiMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, text: m.text + (delta.text ?? "") } : m
            )
          );
        }
        if (delta.type === "error") {
          setAiMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, text: `Error: ${delta.error}` } : m
            )
          );
        }
      }

      const proposals = extractProposals(deltas);
      if (proposals.length > 0) {
        setAiProposals((prev) => [...prev, ...proposals]);
      }
    } finally {
      setAiLoading(false);
    }
  }

  function handleApprove(proposal: CommandProposal): void {
    setAiProposals((prev) =>
      prev.filter((p) => p.command !== proposal.command || p.riskLevel !== proposal.riskLevel)
    );
    if (activeSession) {
      executeApprovedCommand(activeSession.sessionId, proposal.command).catch((err) =>
        console.error("execute_approved_command failed:", err)
      );
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        background: c.pageBg,
        color: c.pageText,
        overflow: 'hidden',
        fontFamily: 'var(--font-ui)',
        borderTop: theme.name === 'cyberpunk'
          ? '1px solid transparent'
          : 'none',
        backgroundImage: theme.name === 'cyberpunk'
          ? 'linear-gradient(var(--color-bg, #06030d), var(--color-bg, #06030d)), linear-gradient(90deg, transparent, #c084fc, #f472b6, transparent)'
          : undefined,
        backgroundOrigin: theme.name === 'cyberpunk' ? 'border-box' : undefined,
        backgroundClip: theme.name === 'cyberpunk' ? 'padding-box, border-box' : undefined,
      }}
    >
      {/* Left sidebar */}
      <aside
        style={{
          width: 256,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          background: c.sidebarBg,
          borderRight: `1px solid ${c.sidebarBorder}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '10px 12px',
            borderBottom: `1px solid ${c.sidebarBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h1
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: c.accent,
              fontFamily: 'var(--font-ui)',
              letterSpacing: '0.05em',
            }}
          >
            AgentShell
          </h1>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setShowSettings((v) => !v)}
              title="AI settings"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                color: aiSettings.claudeApiKey || aiSettings.backend !== 'claude' ? c.green : c.textMuted,
                lineHeight: 1,
                padding: '2px 4px',
              }}
            >
              ⚙
            </button>
            <button
              onClick={() => setShowThemeSwitcher((v) => !v)}
              title="Switch theme"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: c.textMuted,
                lineHeight: 1,
                padding: '2px 4px',
              }}
            >
              ◐
            </button>
          </div>
        </div>

        {/* AI settings panel (collapsible) */}
        {showSettings && (
          <SettingsPanel
            settings={aiSettings}
            onChange={(updated) => setAiSettings(updated)}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Theme switcher (collapsible) */}
        {showThemeSwitcher && (
          <div style={{ padding: 8, borderBottom: `1px solid ${c.sidebarBorder}` }}>
            <ThemeSwitcher />
          </div>
        )}

        {/* Connection list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ProfileList onConnected={handleConnected} />
          <div style={{ borderTop: `1px solid ${c.sidebarBorder}`, paddingTop: 8 }}>
            <QuickConnect onConnected={handleConnected} />
          </div>
          <button
            onClick={handleLocalShell}
            style={{
              width: '100%',
              padding: '6px 0',
              fontSize: 11,
              fontWeight: 500,
              background: c.terminalBg,
              border: `1px solid ${c.sidebarBorder}`,
              borderRadius: 4,
              color: c.textMuted,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            + Local Shell
          </button>
        </div>
      </aside>

      {/* Terminal area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Tab bar */}
        {sessions.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderBottom: `1px solid ${c.sidebarBorder}`,
              background: c.pageBg,
              padding: '0 8px',
              flexShrink: 0,
            }}
          >
            {sessions.map((s, i) => {
              const health = healthMap[s.sessionId];
              const dotColor = health
                ? (health.status === "green" ? c.green : health.status === "yellow" ? "#fbbf24" : c.red)
                : "transparent";
              return (
                <button
                  key={s.sessionId}
                  onClick={() => setActiveIdx(i)}
                  style={{
                    padding: '8px 12px',
                    fontSize: 10.5,
                    whiteSpace: 'nowrap',
                    borderRight: `1px solid ${c.sidebarBorder}`,
                    background: i === activeIdx ? c.terminalBg : 'transparent',
                    color: i === activeIdx ? c.pageText : c.textMuted,
                    border: 'none',
                    borderBottom: i === activeIdx ? `1px solid ${c.accent}` : `1px solid transparent`,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {health && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
                  )}
                  {s.label}
                </button>
              );
            })}
          {/* Tab bar right-side controls */}
          {activeSession && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
              {/* Record toggle */}
              <button
                onClick={() => handleToggleRecording(activeSession.sessionId)}
                title={recordingMap[activeSession.sessionId] ? "Stop recording" : "Start recording"}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: recordingMap[activeSession.sessionId] ? c.red : c.textMuted,
                  padding: '2px 5px',
                }}
              >
                {recordingMap[activeSession.sessionId] ? "⏹" : "⏺"}
              </button>
              {/* History search */}
              <button
                onClick={() => setShowHistory(true)}
                title="Search command history (Ctrl+R)"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: c.textMuted, padding: '2px 5px' }}
              >
                ⌕
              </button>
              {/* SFTP toggle */}
              <button
                onClick={() => setShowSftp((v) => !v)}
                title="Toggle SFTP panel"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: showSftp ? c.accent : c.textMuted, padding: '2px 5px' }}
              >
                SFTP
              </button>
            </div>
          )}
          </div>
        )}

        {/* Terminal + optional SFTP split */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: showSftp && activeSession ? '0 0 55%' : 1, overflow: 'hidden' }}>
            {activeSession ? (
              <TerminalView
                key={activeSession.sessionId}
                sessionId={activeSession.sessionId}
                onDisconnected={() => handleDisconnected(activeSession.sessionId)}
              />
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: c.textMuted,
                  fontSize: 13,
                  fontFamily: 'var(--font-ui)',
                }}
              >
                Use the sidebar to connect to a server.
              </div>
            )}
          </div>
          {showSftp && activeSession && (
            <div style={{ flex: '0 0 45%', borderTop: `1px solid ${c.sidebarBorder}`, overflow: 'hidden' }}>
              <SftpPanel sessionId={activeSession.sessionId} />
            </div>
          )}
        </div>
      </main>

      {/* AI Panel */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <AIPanel
          sessionId={activeSession?.sessionId ?? null}
          messages={aiMessages}
          onSendMessage={handleSendMessage}
          pendingProposals={aiProposals}
          onApprove={handleApprove}
          onDismiss={(p) => setAiProposals((prev) => prev.filter((x) => x.command !== p.command || x.riskLevel !== p.riskLevel))}
          loading={aiLoading}
        />
      </div>

      {/* History search modal */}
      {showHistory && (
        <HistorySearch
          onSelect={(cmd) => {
            // Paste command to active PTY via send_input
            if (activeSession) {
              const encoded = Array.from(new TextEncoder().encode(cmd));
              import("./lib/tauri").then(({ sendInput }) => sendInput(activeSession.sessionId, encoded));
            }
          }}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

export default App;
