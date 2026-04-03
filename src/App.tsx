/**
 * AgentShell — main application shell.
 *
 * Three-column layout:
 *   [Sidebar: connection list] | [Terminal tabs area] | [AI Agent panel]
 *
 * This file wires up the top-level layout. Individual panels are in components/.
 */
import { useState } from "react";
import "@xterm/xterm/css/xterm.css";
import "./index.css";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { TerminalView } from "./components/terminal/TerminalView";
import { QuickConnect } from "./components/profiles/QuickConnect";
import { ProfileList } from "./components/profiles/ProfileList";
import { AIPanel, type ChatMessage, type CommandProposal } from "./components/AIPanel";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { connectLocalShell, getScrollback } from "./lib/tauri";
import { AIClient, PROPOSE_COMMAND_TOOL, type AISettings } from "./lib/ai/client";
import { extractProposals } from "./lib/ai/streamParser";

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
  const [claudeApiKey, setClaudeApiKey] = useState(() => localStorage.getItem("agentshell-claude-key") ?? "");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const aiSettings: AISettings = { backend: "claude", claudeApiKey, claudeModel: "claude-sonnet-4-6" };

  function handleConnected(sessionId: string, label: string) {
    setSessions((prev) => {
      const next = [...prev, { sessionId, label }];
      setActiveIdx(next.length - 1);
      return next;
    });
  }

  async function handleLocalShell() {
    try {
      const result = await connectLocalShell();
      handleConnected(result.session_id, "local shell");
    } catch (err) {
      console.error("local shell failed:", err);
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
    // execute_approved_command IPC wired in Step 9 (Rust executor)
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
              onClick={() => setShowKeyInput((v) => !v)}
              title="Set Claude API key"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                color: claudeApiKey ? c.green : c.textMuted,
                lineHeight: 1,
                padding: '2px 4px',
              }}
            >
              🔑
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

        {/* API key input (collapsible) */}
        {showKeyInput && (
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.sidebarBorder}` }}>
            <div style={{ fontSize: 9, color: c.textDim, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4, fontFamily: 'var(--font-ui)' }}>
              Claude API Key
            </div>
            <input
              type="password"
              value={claudeApiKey}
              onChange={(e) => {
                setClaudeApiKey(e.target.value);
                localStorage.setItem("agentshell-claude-key", e.target.value);
              }}
              placeholder="sk-ant-..."
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: 10,
                fontFamily: 'var(--font-shell)',
                background: c.terminalBg,
                border: `1px solid ${c.sidebarBorder}`,
                borderRadius: 3,
                color: c.pageText,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              autoComplete="off"
            />
          </div>
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
            {sessions.map((s, i) => (
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
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Terminal panel */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
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
