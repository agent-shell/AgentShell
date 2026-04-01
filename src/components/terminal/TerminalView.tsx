/**
 * TerminalView — renders the xterm.js terminal for one session.
 * Uses the useTerminal hook for lifecycle management.
 */
import { useTerminal } from "../../hooks/useTerminal";

interface TerminalViewProps {
  sessionId: string;
  onDisconnected?: () => void;
}

export function TerminalView({ sessionId, onDisconnected }: TerminalViewProps) {
  const { containerRef } = useTerminal({ sessionId, onDisconnected });

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#0d1117]"
      style={{ padding: "4px" }}
    />
  );
}
