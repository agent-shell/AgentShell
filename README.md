# AgentShell

An open-source, cross-platform SSH terminal client with a built-in AI agent.

Think SecureCRT/XShell's feature completeness — multi-session tabs, rz/sz Zmodem,
SFTP, connection profiles — plus an AI agent panel that reads terminal context,
proposes commands, and executes them only after your approval.

## Why

- **Real SSH management**: connection profiles, password/key/agent auth, local shell tabs
- **rz/sz support**: Zmodem file upload built-in (most AI terminals don't have this)
- **Local-first AI**: Claude API, Ollama, or any OpenAI-compatible backend
- **Approval mode**: AI never executes without your explicit OK
- **Small**: ~8 MB install (Tauri vs ~80 MB Electron)
- **MIT**: permissive open-source license

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2.0 |
| Backend | Rust (russh, portable-pty, zmodem2) |
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Terminal | xterm.js 6 |
| AI | Claude API + Ollama + OpenAI-compat |

## Getting Started

**Prerequisites**: Rust (rustup), Bun or Node.js

```bash
git clone <repo>
cd agentshell
./build.sh        # dev mode — opens the app with hot reload
./build.sh build  # production bundle
```

## Project Docs

- `CLAUDE.md` — Claude Code / AI agent instructions, architecture, lock ordering
- `AGENTS.md` — codex / opencode instructions
- `.gstack/plans/main-plan.md` — full implementation plan
- `.gstack/plans/ceo-plans/` — product scope and strategy decisions
- `.gstack/reviews/` — engineering review, design doc, codex outside-voice review

## Status

Core SSH terminal is working. Zmodem rz/sz is implemented. AI agent panel is next.

See `CLAUDE.md` for the full implementation status table.

## License

MIT — see [LICENSE](LICENSE).
