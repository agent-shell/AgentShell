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
import { TerminalView } from "./components/terminal/TerminalView";
import { QuickConnect } from "./components/profiles/QuickConnect";
import { ProfileList } from "./components/profiles/ProfileList";
import { connectLocalShell } from "./lib/tauri";

interface ActiveSession {
  sessionId: string;
  label: string;
}

function App() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(0);

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

  return (
    <div className="flex h-screen w-screen bg-[#0d1117] text-[#c9d1d9] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-[#21262d] flex flex-col">
        <div className="p-3 border-b border-[#21262d]">
          <h1 className="text-sm font-semibold text-[#58a6ff]">AgentShell</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <ProfileList onConnected={handleConnected} />
          <div className="border-t border-[#21262d] pt-2">
            <QuickConnect onConnected={handleConnected} />
          </div>
          <div className="pt-1">
            <button
              onClick={handleLocalShell}
              className="w-full py-1.5 text-xs font-medium bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
            >
              + Local Shell
            </button>
          </div>
        </div>
      </aside>

      {/* Terminal area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        {sessions.length > 0 && (
          <div className="flex items-center border-b border-[#21262d] bg-[#010409] px-2">
            {sessions.map((s, i) => (
              <button
                key={s.sessionId}
                onClick={() => setActiveIdx(i)}
                className={`px-3 py-2 text-xs whitespace-nowrap border-r border-[#21262d] transition-colors ${
                  i === activeIdx
                    ? "text-[#c9d1d9] bg-[#0d1117]"
                    : "text-[#8b949e] hover:text-[#c9d1d9]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Terminal panel */}
        <div className="flex-1 overflow-hidden">
          {activeSession ? (
            <TerminalView
              key={activeSession.sessionId}
              sessionId={activeSession.sessionId}
              onDisconnected={() => handleDisconnected(activeSession.sessionId)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-[#8b949e] text-sm">
              Use the sidebar to connect to a server.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
