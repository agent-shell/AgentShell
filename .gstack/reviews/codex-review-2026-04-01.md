**Missed Problems**

1. Scope is overloaded: SSH client + SFTP UI + Zmodem + AI approvals + recording + FTS5 + health telemetry in v1 is two releases of risk packed into one.
2. “Cross-platform” is overstated while Windows Zmodem is beta and macOS signing is deferred. That is a launch blocker, not a v1.1 nicety.
3. “Reconnect” is mostly fiction unless you require server-side `tmux/screen` (or equivalent). Raw SSH PTY state is not recoverable.
4. AGPL v3 is strategically miscalibrated for enterprise terminal adoption; no licensing strategy is defined.

5. AI panel + shared scrollback buffer + recording is a single failure domain for secret leakage.
6. “Approval mode” does not prevent passive exfiltration if context is auto-collected before approval.
7. Audit log design is weak: `chmod 600` is Unix-only and does not make logs append-only or tamper-evident.
8. `known_hosts` handling in auth alone misses jump-host chains, host key rotation policy, and downgrade/TOFU edge cases.
9. Deferring paste guard is a bad security trade: terminal paste safety is baseline, not polish.
10. Keychain assumption is fragile on headless/minimal Linux setups where no usable keyring exists.

11. `russh` + jump host + agent auth + SFTP + extra exec channels is treated as routine; it is not.
12. Independent health exec channel can exceed server `MaxSessions` and fail unpredictably under tab fan-out.
13. Manual lock ordering (`ssh_channel -> scrollback -> pty_mode`) is brittle and regression-prone as code evolves.
14. 10ms PTY batching is an unproven latency tradeoff for interactive workloads; no acceptance thresholds defined.
15. Shell-hook command capture assumes writable shell init and known shell semantics; many real environments break this.
16. `send_input` fallback cannot reliably reconstruct commands (multiline edits, heredocs, readline transforms).

17. Docker-heavy integration testing misses key risks: OS keychain, PTY quirks, xterm rendering, drag-drop, and platform packaging.
18. No explicit cross-platform CI matrix for macOS/Linux/Windows with Tauri runtime behavior.
19. No failure-injection plan for network churn: packet loss, half-open sockets, host key changes, reauth races.
20. No schema/version migration strategy for SQLite and JSONL audit format evolution.

21. Sequencing is wrong: high-uncertainty features (SFTP/Zmodem/recording) are late, increasing rewrite probability near the end.
