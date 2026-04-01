/**
 * useTerminal — xterm.js lifecycle + Tauri IPC bridge.
 *
 * Responsibilities:
 * - Mount/unmount xterm.js Terminal in a DOM element
 * - FitAddon: resize terminal to container, emit resize_pty IPC
 * - ResizeObserver: re-fit when container dimensions change
 * - Tauri event: listen for pty-output-{sessionId} and write to terminal
 * - onData: forward keystrokes to send_input IPC
 *
 * Working loop milestone: characters from the SSH server appear in the terminal.
 */
import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import {
  onPtyOutput,
  onSessionDisconnected,
  sendInput,
  resizePty,
  getScrollbackRaw,
  startZmodemSend,
} from "../lib/tauri";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

export interface UseTerminalOptions {
  sessionId: string | null;
  onDisconnected?: () => void;
}

export interface UseTerminalReturn {
  /** Attach this ref to the container div. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Imperatively trigger a fit (e.g. after a resize in a split pane). */
  fit: () => void;
  /** Access the SearchAddon for find-in-terminal UI. */
  searchAddon: React.RefObject<SearchAddon | null>;
}

export function useTerminal({
  sessionId,
  onDisconnected,
}: UseTerminalOptions): UseTerminalReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const unlistenOutputRef = useRef<UnlistenFn | null>(null);
  const unlistenDisconnectRef = useRef<UnlistenFn | null>(null);
  const unlistenZmodemRef = useRef<UnlistenFn | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // ── Mount terminal ──────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
      fontSize: 14,
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        selectionBackground: "#264f78",
        black: "#484f58",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#f0f6fc",
      },
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    term.open(container);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // ResizeObserver: re-fit when the container changes size
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
      });
    });
    ro.observe(container);
    resizeObserverRef.current = ro;

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, []); // Mount once per component lifetime

  // ── Wire up session (re-run when sessionId changes) ─────────────────────────
  useEffect(() => {
    if (!sessionId || !termRef.current || !fitAddonRef.current) return;

    const term = termRef.current;
    const fitAddon = fitAddonRef.current;

    // Forward keystrokes → send_input IPC
    const dataDisposable = term.onData((data: string) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      sendInput(sessionId, bytes).catch(console.error);
    });

    // Resize → resize_pty IPC
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      resizePty(sessionId, cols, rows).catch(console.error);
    });

    // Sequence: snapshot THEN subscribe to live events.
    // Taking the snapshot first means all events in the snapshot are historical;
    // all events from the live subscription are new. No overlap, no double-write.
    // Caveat: events emitted in the ~1-5ms window between snapshot and subscribe
    // may be missed, but this is rare in practice (SSH prompt arrives within 100ms).
    let cancelled = false;

    (async () => {
      // Step 1: replay historical output (before listener is registered)
      try {
        const bytes = await getScrollbackRaw(sessionId);
        if (!cancelled && bytes.length > 0) {
          term.write(new Uint8Array(bytes));
        }
      } catch (e) {
        console.error("scrollback replay failed:", e);
      }

      if (cancelled) return;

      // Step 2: subscribe to live output (everything from here is new)
      try {
        const unlisten = await onPtyOutput(sessionId, (data: Uint8Array) => {
          if (!cancelled) {
            term.write(data);
          }
        });
        if (cancelled) {
          unlisten();
        } else {
          unlistenOutputRef.current = unlisten;
        }
      } catch (e) {
        console.error("pty output subscribe failed:", e);
      }
    })();

    // Subscribe to disconnect events
    onSessionDisconnected(sessionId, () => {
      term.writeln("\r\n\x1b[33m[Session closed]\x1b[0m");
      onDisconnected?.();
    }).then((unlisten) => {
      unlistenDisconnectRef.current = unlisten;
    });

    // Subscribe to Zmodem start: show a file picker and upload the selected file.
    listen(`zmodem-start-${sessionId}`, async () => {
      if (cancelled) return;
      term.writeln("\r\n\x1b[33m[Zmodem: select a file to upload]\x1b[0m");

      const file = await new Promise<File | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.addEventListener("cancel", () => resolve(null), { once: true });
        input.click();
      });

      if (!file) {
        term.writeln("\r\x1b[33m[Zmodem: cancelled]\x1b[0m\r\n");
        return;
      }

      term.writeln(`\r\x1b[33m[Zmodem: sending ${file.name} (${file.size} bytes)…]\x1b[0m`);
      try {
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        await startZmodemSend(sessionId, file.name, bytes);
        term.writeln(`\r\x1b[32m[Zmodem: ${file.name} sent OK]\x1b[0m\r\n`);
      } catch (err) {
        const msg =
          err != null && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
        term.writeln(`\r\x1b[31m[Zmodem error: ${msg}]\x1b[0m\r\n`);
      }
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenZmodemRef.current = unlisten;
    });

    // Send initial resize now that we have a session
    fitAddon.fit();

    return () => {
      cancelled = true;
      dataDisposable.dispose();
      resizeDisposable.dispose();
      unlistenOutputRef.current?.();
      unlistenDisconnectRef.current?.();
      unlistenZmodemRef.current?.();
      unlistenOutputRef.current = null;
      unlistenDisconnectRef.current = null;
      unlistenZmodemRef.current = null;
    };
  }, [sessionId, onDisconnected]);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  return {
    containerRef,
    fit,
    searchAddon: searchAddonRef,
  };
}
