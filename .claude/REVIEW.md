# AgentShell — Implementation Review Log

## Tasks 01-05: ThemeProvider + UI Components (Codex-assisted)

**Status: PASS**

Round 1 bugs fixed:
- `key={i}` on proposal list → `key={`${p.command}-${p.riskLevel}`}` (stable identity)
- `editedCmd` not passed to `onApprove` → `ProposalCardProps.onApprove: (finalCommand: string) => void`
- Proposal filter by object identity → filter by value (`p.command !== proposal.command || p.riskLevel !== proposal.riskLevel`)

Round 2 bugs fixed:
- Stale history snapshot in `handleSendMessage` → moved history build before setState calls
- `claudeApiKey` not cleared on settings close → replaced with SettingsPanel component
- `refreshProfiles` unused → removed

All themes: token values match DESIGN_SPEC.md exactly.
TypeScript: zero errors (`npx tsc --noEmit`).

---

## Step 8: Profile Management UI

**Status: PASS**

- `ProfileForm.tsx`: inline create/edit form, no `window.prompt()`
- `ProfileList.tsx`: ✎ edit button per row, + new profile button, inline credential sub-form for connect
- Credentials cleared on cancel and Escape key
- Error messages use `err?.message ?? String(err)` pattern

---

## Step 9: AI Agent Panel + Rust Executor

**Status: PASS**

Frontend:
- `AIPanel.tsx`: chat UI, ProposalCard with stable key, editedCmd→onApprove, risk badges
- `AIClient`: multi-backend streaming (Claude/Ollama/OpenAI-compat), AsyncGenerator<Delta>
- `PROPOSE_COMMAND_TOOL`: structured tool_use for command proposals
- `streamParser.ts`: `extractProposals`, `parseProposal`, `accumulateText`
- `App.tsx`: full AI panel wiring, scrollback context injection, streaming delta updates

Rust:
- `agent/context.rs`: `extract_context()` wraps `extract_scrollback_text()` + regex strips C0/C1 control chars
- `agent/executor.rs`: `execute_approved()` acquires Lock 1 (ssh_channel), writes command+\n, releases lock BEFORE SQLite write (spawn_blocking)
- `commands/agent_commands.rs`: `get_context` + `execute_approved_command` Tauri commands
- Lock ordering respected: Lock 1 only, released before spawn_blocking SQLite audit

cargo check: zero warnings.
TypeScript: zero errors.

---

## Step 11: Settings UI

**Status: PASS**

- `SettingsPanel.tsx`: backend selector (claude/ollama/openai-compat), per-backend fields, localStorage persistence
- `loadAISettings()` / `saveAISettings()`: exported helpers, backwards-compatible with legacy `agentshell-claude-key` key
- Old ad-hoc API key input in `App.tsx` replaced by unified SettingsPanel
- ⚙ button in sidebar header, green when configured

TypeScript: zero errors.

---

## Step 10: SFTP File Manager

**Status: PASS**

Rust:
- `sftp/mod.rs`: `open_sftp()` briefly holds `ssh_transport` lock to open channel, releases before data I/O. Lock ordering: ssh_transport only, independent per spec.
- `commands/sftp_commands.rs`: 6 IPC commands (list/download/upload/mkdir/delete/rename)
- Added `russh-sftp = "2"` + `chrono = "0.4"` to Cargo.toml

Frontend:
- `SftpPanel.tsx`: breadcrumb navigation, file listing (dirs first), download via Blob URL, upload via file input, rename inline, delete with confirm()
- SFTP toggle button in tab bar; split-pane layout (55/45 terminal/sftp) when active

cargo check: zero warnings.

---

## Step 12: CEO Additions

**Status: PASS**

### 12a — Health indicators
- `health/mod.rs`: `spawn_health_monitor()` — independent task, polls `uptime; nproc` via exec channel every N seconds (default 60, clamp 10-300)
- Zmodem guard: skips polling when `PtyMode::Zmodem`
- Load classification: load_1m < cpu_count = green; < 2× = yellow; ≥ 2× = red
- Frontend: colored 6px dot per tab, updates via `health-update-{id}` event

### 12b — Tag grouping
- Dispatched to Codex (TASK_08): groups ProfileList by `tags[0] ?? "Ungrouped"`, sorted alpha with Ungrouped last. Headers only shown when > 1 group.
- tsc: zero errors. Codex committed via Claude Code after sandbox restriction.

### 12c — Session recording
- `recording/mod.rs`: asciinema v2 format (header JSON + `[elapsed,"o","data"]` events)
- PTY batcher task forwards raw bytes to recording_tx channel (new SessionHandle field)
- 100MB warning event, 500MB auto-stop. Files stored at `~/.agentshell/recordings/`
- ⏺ / ⏹ toggle button in tab bar controls per-session recording

### 12d — Command history FTS5
- `commands/history_commands.rs`: SQLite FTS5 virtual table with auto-trigger on insert
- `search_command_history` + `recent_command_history` Tauri commands
- `HistorySearch.tsx`: Ctrl+R modal, real-time FTS5 search as user types (120ms debounce), arrow-key navigation, Enter pastes command to active PTY

cargo check: zero warnings | npx tsc --noEmit: zero errors
