/**
 * TerminalView — renders the xterm.js terminal for one session.
 * Uses the useTerminal hook for lifecycle management.
 * Terminal colors and font are driven by the active theme.
 */
import { useEffect, type CSSProperties } from "react";
import { useTheme } from "../../ThemeProvider";
import { useTerminal } from "../../hooks/useTerminal";

interface TerminalViewProps {
  sessionId: string;
  onDisconnected?: () => void;
}

export function TerminalView({ sessionId, onDisconnected }: TerminalViewProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  // Build xterm ITheme from current ThemeColors
  const xtermTheme = {
    background: c.terminalBg,
    foreground: c.pageText,
    cursor: c.cursorColor,
    cursorAccent: c.terminalBg,
    selectionBackground: c.accent + "33",
    black: "#484f58",
    red: c.red,
    green: c.green,
    yellow: theme.name === "minimal" ? "#d97706" : "#fbbf24",
    blue: "#60a5fa",
    magenta: c.accent,
    cyan: c.accent2 ?? c.accent,
    white: c.pageText,
    brightBlack: c.textMuted,
    brightRed: c.red,
    brightGreen: c.green,
    brightYellow: theme.name === "minimal" ? "#d97706" : "#fbbf24",
    brightBlue: "#60a5fa",
    brightMagenta: c.accent,
    brightCyan: c.accent2 ?? c.accent,
    brightWhite: c.pageText,
  };

  const { containerRef, updateXtermTheme } = useTerminal({
    sessionId,
    onDisconnected,
    xtermTheme,
    fontFamily: theme.fonts.shell,
  });

  // Update xterm theme when user switches themes (theme.name changes)
  useEffect(() => {
    updateXtermTheme(xtermTheme, theme.fonts.shell);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.name]);

  // Overlay styles per theme
  const overlayStyle: CSSProperties | null =
    theme.name === "industrial"
      ? {
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(45,212,191,0.025) 23px, rgba(45,212,191,0.025) 24px), repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(45,212,191,0.025) 23px, rgba(45,212,191,0.025) 24px)",
          zIndex: 1,
        }
      : theme.name === "cyberpunk"
        ? {
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(192,132,252,0.018) 3px, rgba(192,132,252,0.018) 4px)",
            animation: "scanlineMove 7s linear infinite",
            zIndex: 1,
          }
        : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: c.terminalBg }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", padding: "4px", boxSizing: "border-box" }}
      />
      {overlayStyle && <div style={overlayStyle} />}
      <style>{`
        @keyframes scanlineMove { from { background-position: 0 0; } to { background-position: 0 100%; } }
      `}</style>
    </div>
  );
}
