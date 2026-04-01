/**
 * Type-safe wrappers around Tauri IPC commands.
 * All session IDs are strings (UUID serialized by Rust).
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// ── SSH commands ──────────────────────────────────────────────────────────────

export interface ConnectSshArgs {
  host: string;
  port: number;
  username: string;
  auth_kind: "password" | "publickey" | "agent";
  password?: string;
  key_path?: string;
  key_passphrase?: string;
}

export interface ConnectSshResult {
  session_id: string;
}

export function connectSsh(args: ConnectSshArgs): Promise<ConnectSshResult> {
  return invoke("connect_ssh", { args });
}

export function connectLocalShell(): Promise<ConnectSshResult> {
  return invoke("connect_local_shell");
}

export function disconnectSession(sessionId: string): Promise<void> {
  return invoke("disconnect_session", { sessionId });
}

export function sendInput(sessionId: string, data: number[]): Promise<void> {
  return invoke("send_input", { sessionId, data });
}

export function resizePty(
  sessionId: string,
  cols: number,
  rows: number
): Promise<void> {
  return invoke("resize_pty", { args: { session_id: sessionId, cols, rows } });
}

export function getScrollback(
  sessionId: string,
  lines: number
): Promise<string> {
  return invoke("get_scrollback", { sessionId, lines });
}

/**
 * Fetch raw scrollback bytes (ANSI codes intact) for terminal replay on attach.
 * Tauri serializes Vec<u8> as number[]; we convert to Uint8Array on the caller side.
 */
export function getScrollbackRaw(sessionId: string): Promise<number[]> {
  return invoke("get_scrollback_raw", { sessionId });
}

// ── Profile commands ──────────────────────────────────────────────────────────

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_kind: "password" | "publickey" | "agent";
  key_path?: string;
  tags: string[];
}

export function listProfiles(): Promise<ConnectionProfile[]> {
  return invoke("list_profiles");
}

export function saveProfile(profile: ConnectionProfile): Promise<ConnectionProfile> {
  return invoke("save_profile", { profile });
}

export function deleteProfile(id: string): Promise<void> {
  return invoke("delete_profile", { id });
}

export function connectProfile(
  profileId: string,
  password?: string,
  keyPassphrase?: string,
): Promise<ConnectSshResult> {
  return invoke("connect_profile", { profileId, password, keyPassphrase });
}

// ── Zmodem ───────────────────────────────────────────────────────────────────

/**
 * Send a file to the remote host using ZMODEM (sz side).
 * Must be called after a zmodem-start-{sessionId} event fires.
 * fileData is the raw file bytes as a number[].
 */
export function startZmodemSend(
  sessionId: string,
  fileName: string,
  fileData: number[],
): Promise<void> {
  return invoke("start_zmodem_send", { sessionId, fileName, fileData });
}

// ── Events ────────────────────────────────────────────────────────────────────

/**
 * Subscribe to PTY output for a specific session.
 * Callback receives raw bytes as Uint8Array.
 */
export function onPtyOutput(
  sessionId: string,
  callback: (data: Uint8Array) => void
): Promise<UnlistenFn> {
  return listen<number[]>(`pty-output-${sessionId}`, (event) => {
    callback(new Uint8Array(event.payload));
  });
}

/**
 * Subscribe to session disconnect events.
 */
export function onSessionDisconnected(
  sessionId: string,
  callback: () => void
): Promise<UnlistenFn> {
  return listen(`session-disconnected-${sessionId}`, () => callback());
}
