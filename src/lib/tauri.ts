/**
 * Type-safe wrappers around Tauri IPC commands.
 * All session IDs are strings (UUID serialized by Rust).
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";

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

export interface LiveSessionInfo {
  session_id: string;
  label: string;
  kind: "ssh" | "local";
  host?: string;
  username?: string;
}

export function connectSsh(args: ConnectSshArgs): Promise<ConnectSshResult> {
  return invoke("connect_ssh", { args });
}

export function connectLocalShell(): Promise<ConnectSshResult> {
  return invoke("connect_local_shell");
}

export function listLiveSessions(): Promise<LiveSessionInfo[]> {
  return invoke("list_live_sessions");
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
  password?: string;
  tags: string[];
}

export async function openFilePicker(title: string): Promise<string | null> {
  const result = await dialogOpen({ title, multiple: false })
  return typeof result === 'string' ? result : null
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

// ── SFTP commands ─────────────────────────────────────────────────────────────

export interface SftpEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified?: number;
}

export function listSftpDir(sessionId: string, path: string): Promise<SftpEntry[]> {
  return invoke("list_sftp_dir", { sessionId, path });
}

export function downloadSftpFile(sessionId: string, path: string): Promise<number[]> {
  return invoke("download_sftp_file", { sessionId, path });
}

export function uploadSftpFile(sessionId: string, path: string, data: number[]): Promise<void> {
  return invoke("upload_sftp_file", { sessionId, path, data });
}

export function mkdirSftp(sessionId: string, path: string): Promise<void> {
  return invoke("mkdir_sftp", { sessionId, path });
}

export function deleteSftp(sessionId: string, path: string, isDir: boolean): Promise<void> {
  return invoke("delete_sftp", { sessionId, path, isDir });
}

export function renameSftp(sessionId: string, from: string, to: string): Promise<void> {
  return invoke("rename_sftp", { sessionId, from, to });
}

// ── Health commands ───────────────────────────────────────────────────────────

export interface HealthData {
  load_1m: number;
  cpu_count: number;
  status: "green" | "yellow" | "red";
}

export function startHealthMonitor(sessionId: string, intervalSecs?: number): Promise<void> {
  return invoke("start_health_monitor", { sessionId, intervalSecs });
}

export function getServerHealth(sessionId: string): Promise<HealthData | null> {
  return invoke("get_server_health", { sessionId });
}

// ── Recording commands ────────────────────────────────────────────────────────

export interface RecordingInfo {
  path: string;
  size_bytes: number;
  filename: string;
}

export function startRecording(sessionId: string): Promise<string> {
  return invoke("start_recording", { sessionId });
}

export function stopRecording(sessionId: string): Promise<void> {
  return invoke("stop_recording", { sessionId });
}

export function listSessionRecordings(): Promise<RecordingInfo[]> {
  return invoke("list_session_recordings");
}

// ── History commands ──────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: number;
  ts: string;
  session_id: string;
  hostname: string;
  command: string;
}

export function searchCommandHistory(query: string, limit?: number): Promise<HistoryEntry[]> {
  return invoke("search_command_history", { query, limit });
}

export function recentCommandHistory(limit?: number): Promise<HistoryEntry[]> {
  return invoke("recent_command_history", { limit });
}

// ── Agent commands ────────────────────────────────────────────────────────────

export function getContext(sessionId: string, lineCount?: number): Promise<string> {
  return invoke("get_context", { sessionId, lineCount });
}

export function executeApprovedCommand(sessionId: string, command: string): Promise<void> {
  return invoke("execute_approved_command", { sessionId, command });
}

export interface AiMessageArg {
  role: string;
  content: string;
}

export interface AiEventPayload {
  kind: "text" | "tool_use" | "error" | "done";
  text?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  error?: string;
}

/**
 * Initiate a streaming AI request from the Rust backend (bypasses WebKit network).
 * Results arrive as `ai-event-{requestId}` Tauri events — subscribe with onAiEvent().
 */
export function sendAiMessage(
  requestId: string,
  backend: string,
  messages: AiMessageArg[],
  options?: { apiKey?: string; model?: string; baseUrl?: string },
): Promise<void> {
  return invoke("send_ai_message", {
    requestId,
    backend,
    messages,
    apiKey: options?.apiKey,
    model: options?.model,
    baseUrl: options?.baseUrl,
  });
}

/** Subscribe to streaming AI events for a specific request. */
export function onAiEvent(
  requestId: string,
  callback: (payload: AiEventPayload) => void,
): Promise<UnlistenFn> {
  return listen<AiEventPayload>(`ai-event-${requestId}`, (e) => callback(e.payload));
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

/** Subscribe to server health updates. */
export function onHealthUpdate(
  sessionId: string,
  callback: (data: HealthData) => void
): Promise<UnlistenFn> {
  return listen<HealthData>(`health-update-${sessionId}`, (e) => callback(e.payload));
}

/** Subscribe to recording stopped events (e.g. size limit). */
export function onRecordingStopped(
  sessionId: string,
  callback: (reason: string) => void
): Promise<UnlistenFn> {
  return listen<string>(`recording-stopped-${sessionId}`, (e) => callback(e.payload));
}
