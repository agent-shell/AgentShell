# AgentShell — Agent Instructions

This file is for AI coding agents (codex, opencode, etc.).
The canonical project instructions are in **CLAUDE.md** — read that first.

## Quick Context

AgentShell is a cross-platform SSH terminal client with AI agent capabilities.
Built with Tauri 2.0 (Rust) + React + TypeScript.

**Key files to understand before making changes:**
- `CLAUDE.md` — full project context, architecture, lock ordering, status
- `.gstack/plans/main-plan.md` — detailed implementation plan (ENG REVIEW section has final architecture decisions)
- `src-tauri/src/session/manager.rs` — session registry + PTY batcher (most complex Rust file)
- `src/hooks/useTerminal.ts` — xterm.js bridge (most complex TS file)

## Build & Check Commands

```bash
# Check Rust (fast, no binary)
~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml

# Check TypeScript
npx tsc --noEmit

# Dev run (full build)
./build.sh
```

## Rules

1. **Never hold `sessions` lock (Lock 0) while holding any per-session lock (1-3).** See lock ordering in `session/manager.rs` header.
2. All IPC commands must return `Result<T, AgentShellError>`, never `unwrap()` in command handlers.
3. Run `cargo check` after any Rust change before declaring done.
4. Run `tsc --noEmit` after any TypeScript change before declaring done.
5. Do not add `window.prompt()` for user input — use form fields or file inputs.
6. Read-only mode for code review tasks — do not modify files unless explicitly asked.
