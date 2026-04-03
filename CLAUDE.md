# AgentShell — Claude Code Project Instructions

## Project Overview

AgentShell is an open-source, cross-platform SSH terminal client with a built-in AI agent.
Think SecureCRT/XShell's feature completeness plus an AI agent panel that can read terminal
context, propose commands, and execute them after user approval.

**Stack**: Tauri 2.0 (Rust backend) + React + TypeScript frontend
**License**: MIT
**Target users**: DevOps/SRE engineers managing multiple servers via SSH

## Key Documents

- **Architecture plan**: `.gstack/plans/main-plan.md` — full tech stack, module structure, lock ordering, implementation phases
- **CEO product review**: `.gstack/plans/ceo-plans/2026-04-01-agentshell-v1.md` — scope decisions, v1 vs v2, architecture landmines
- **Engineering review + test plan**: `.gstack/reviews/eng-review-test-plan-2026-04-01.md`
- **Design doc**: `.gstack/reviews/design-2026-04-01.md` — user personas, competitive positioning
- **Codex outside-voice review**: `.gstack/reviews/codex-review-2026-04-01.md`

## Project Structure

```
src-tauri/src/
  ssh/client.rs          # russh SSH client, TOFU known-hosts, tilde expansion
  session/manager.rs     # SessionHandle registry, lock ordering, PTY batcher, Zmodem detection
  pty/local.rs           # local shell PTY (portable-pty), ChildKiller for clean disconnect
  profile/store.rs       # ConnectionProfile serde struct
  commands/
    ssh_commands.rs      # connect_ssh, send_input, resize_pty, get_scrollback_raw
    profile_commands.rs  # list/save/delete/connect profile (tauri-plugin-store)
    zmodem_commands.rs   # start_zmodem_send — zmodem2 sender state machine
    error.rs             # AgentShellError enum (all IPC errors)
  auth.rs                # TOFU known-hosts verify/save (SHA-256 fingerprint)
  lib.rs                 # Tauri plugin registration + invoke_handler

src/
  hooks/useTerminal.ts   # xterm.js lifecycle, PTY event bridge, Zmodem file picker
  components/
    terminal/TerminalView.tsx
    profiles/QuickConnect.tsx   # quick SSH form with Save button
    profiles/ProfileList.tsx    # saved profiles sidebar + saveCurrentAsProfile()
  lib/tauri.ts           # type-safe invoke() wrappers for all IPC commands
  App.tsx                # three-column layout: sidebar | tabs+terminal | (AI panel placeholder)
```

## Critical Architecture Decisions

### Lock ordering (MUST follow to avoid deadlocks)
```
Lock 0: sessions (global registry) — acquire briefly, never hold with per-session locks
Lock 1: ssh_channel               — PTY writer (send_input, resize)
Lock 2: scrollback                — raw bytes (AI context, recording)
Lock 3: pty_mode                  — RwLock, frequently read
ssh_transport: independent        — only during connect/disconnect
```

### Session kinds
- SSH: russh transport handle stored in `ssh_transport` to keep session alive
- Local: `portable-pty` with `ChildKiller` stored for clean `disconnect()`

### PTY output pipeline (two tasks per session)
1. Task 1: channel reader → raw_tx (SSH) or spawn_blocking reader → raw_tx (local)
2. Task 2: batcher — detects Zmodem ZRINIT (`**\x18B`), routes to either frontend
   (normal, 10ms batch) or Zmodem sender (PtyMode::Zmodem)

### Zmodem flow
`rz` on server → ZRINIT detected in Task 2 → `zmodem-start-{sid}` event →
frontend file picker → `start_zmodem_send(session_id, file_name, file_data)` →
`zmodem2::send` in `spawn_blocking` → SSH channel → session resets to Normal

### Error serialization
Tauri serializes command errors as `{ kind, message }` objects, not plain strings.
Frontend must use `err?.message ?? String(err)` pattern.

## Development Setup

```bash
# Prerequisites
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh  # Rust
curl -fsSL https://bun.sh/install | bash                          # Bun

# Build and run (dev mode with hot reload)
./build.sh

# Type check only
~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml
npx tsc --noEmit

# Production build
./build.sh build
```

## Implementation Status

| Step | Feature | Status |
|------|---------|--------|
| 1 | Project init | ✅ |
| 2 | Rust SSH client (russh, TOFU) | ✅ |
| 3 | Session manager (fine-grained locks) | ✅ |
| 4 | xterm.js integration (useTerminal hook) | ✅ |
| 5 | Local shell PTY (portable-pty) | ✅ |
| 6 | Connection profile persistence (tauri-plugin-store) | ✅ |
| 6b | ProfileList sidebar + QuickConnect Save button | ✅ |
| 6c | Zmodem rz/sz support (zmodem2 crate) | ✅ |
| 7 | App shell (3-column layout, tabs) | ✅ |
| 8 | Profile management UI (edit form) | ✅ |
| 9 | AI Agent panel + CommandApproval + Claude API | ✅ |
| 10 | SFTP file manager | ⬜ |
| 11 | Settings UI (AI backend, API key, theme) | ✅ |
| 12 | CEO additions (health indicators, recording, tag groups, FTS5 history) | ⬜ |

## Coding Conventions

- All IPC commands return `Result<T, AgentShellError>` — never panic
- Lock ordering comments in `session/manager.rs` header MUST be kept up to date
- Rust: `cargo check` before any commit, zero errors required
- TypeScript: `npx tsc --noEmit` before commit, zero errors required
- No `window.prompt()` for sensitive input — use inline form fields
- File picker for Zmodem uses `<input type="file">` (no plugin needed)

## Skill Routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken" → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Architecture review → invoke plan-eng-review
- Update docs after shipping → invoke document-release

---

## Orchestrator Rules (Theme + UI Tasks)

### Role boundary
You are the ARCHITECT and REVIEWER for UI/theme work. You do NOT write component code directly.
Your outputs are: `.claude/TASKS.md`, `.claude/REVIEW.md`, shell commands invoking codex.

### Codex invocation pattern
```bash
SPEC=$(awk "/## TASK_XX/,/## TASK_[0-9]/{if(/## TASK_[0-9]/ && !/## TASK_XX/)exit; print}" .claude/TASKS.md)
codex --model o4-mini --approval-mode full-auto --task "$SPEC"
```

### Review checklist (write to `.claude/REVIEW.md` after each codex commit)
- [ ] Theme token values match DESIGN_SPEC.md exactly (spot-check 3+ hex values)
- [ ] `grep -rn 'color:#\|background:#' src/components/` returns 0 hardcoded hex
- [ ] useTheme() imported and used — no direct CSS string literals for colors
- [ ] Fonts: JetBrains Mono / IBM Plex Mono / Share Tech Mono / Orbitron / Rajdhani / DM Sans
- [ ] Animations present where required (cursor blink, agent pulse, cyberpunk scanline)
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Commit message matches spec format
