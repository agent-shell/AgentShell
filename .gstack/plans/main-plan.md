# AgentShell — 跨平台 SSH 终端 + AI Agent

## Context

**定位**：SecureCRT/XShell 的图形界面用户友好性 + AI Agent CLI 的功能强大性 = 面向开发者和运维的新一代 SSH 客户端。

跨平台（Windows/macOS/Ubuntu），使用 MIT 协议开源。

参考项目：[Tabby](https://github.com/Eugeny/tabby)（Electron + Angular + xterm.js）
核心差异化：内置 AI Agent 可读取终端上下文、建议命令、解释错误，并在用户审批后执行命令。

## 用户确认的关键选择

- **框架**：Tauri 2.0 + React（用户有 Rust 经验）
- **MVP 功能**：SSH 终端 + AI Agent 面板 + 本地 Shell Tab + SFTP 文件管理（全量 MVP）
- **AI 后端**：Claude API（主）+ Ollama（本地）+ OpenAI 兼容接口（三者统一抽象）

---

## 推荐技术栈

### 核心框架：Tauri 2.0 + React + TypeScript

| 对比维度 | Tauri 2.0 | Electron |
|---------|-----------|---------|
| 安装包大小 | ~5-10 MB | 60-120 MB |
| 内存占用 | ~30-50 MB | ~120-200 MB |
| 启动速度 | < 1s | 2-4s |
| 后端语言 | Rust（原生SSH/PTY） | Node.js（需 native addon） |
| 安全模型 | 能力声明式 IPC（最小权限） | 较宽松 |
| 前提条件 | 需要 Rust 知识 | 纯 Node.js |

**选择 Tauri 的理由**：SSH、PTY、加密操作用 Rust 实现更安全、性能更好，无需 native Node addon 桥接。russh + portable-pty 是纯 Rust crate，完美支持跨平台。

**前端**：React 19 + Vite（生态更成熟，split-pane、DnD-kit、Zustand 等库丰富）
**样式**：Tailwind CSS + shadcn/ui（可以 copy-own 组件，无锁定）
**终端渲染**：xterm.js 5.x（业界标准，Tabby 也用）

---

## 项目目录结构

```
agentshell/
├── LICENSE                        # MIT
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml                # tauri-action 三平台构建
│
├── src-tauri/                     # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json  # Tauri 2.0 能力声明
│   └── src/
│       ├── main.rs
│       ├── lib.rs                 # 插件注册
│       ├── ssh/
│       │   ├── client.rs          # russh SSH 客户端（核心）
│       │   ├── auth.rs            # 密码/公钥/Agent 认证
│       │   └── channel.rs         # PTY channel 管理
│       ├── pty/local.rs           # 本地 Shell（portable-pty）
│       ├── session/manager.rs     # 会话注册表 UUID→SessionHandle
│       ├── profile/store.rs       # 连接配置持久化
│       ├── agent/
│       │   ├── context.rs         # 终端 scrollback 抓取 + ANSI 去除
│       │   └── executor.rs        # 审批后命令执行 + 审计日志
│       └── commands/              # Tauri IPC 命令处理器
│           ├── ssh_commands.rs    # connect/disconnect/send_input/resize
│           ├── profile_commands.rs
│           └── agent_commands.rs
│
├── src/                           # React 前端
│   ├── App.tsx                    # 三栏布局：侧边栏 + 终端区 + AI 面板
│   ├── components/
│   │   ├── layout/                # AppShell / Sidebar / StatusBar
│   │   ├── tabs/                  # TabBar（DnD 排序）/ TabPanel
│   │   ├── terminal/              # TerminalView（xterm.js 挂载）
│   │   ├── profiles/              # ProfileList / ProfileForm / QuickConnect
│   │   └── agent/
│   │       ├── AgentPanel.tsx     # AI 聊天面板
│   │       ├── CommandApproval.tsx # 命令审批卡片（Run/Edit/Dismiss）
│   │       └── ContextPreview.tsx
│   ├── hooks/
│   │   ├── useTerminal.ts         # xterm.js 生命周期 + Tauri 事件桥接（最复杂）
│   │   ├── useSession.ts
│   │   └── useAgent.ts
│   ├── store/
│   │   ├── sessionsSlice.ts
│   │   ├── profilesSlice.ts
│   │   ├── agentSlice.ts
│   │   └── uiSlice.ts
│   └── lib/
│       ├── tauri.ts               # invoke() 类型化封装
│       └── ai/
│           ├── client.ts          # Claude API + Ollama 统一接口
│           ├── contextBuilder.ts  # 终端上下文 → 提示词组装
│           └── streamParser.ts    # 流式响应解析 + tool_use 提取
│
└── tests/
    ├── rust/                      # Rust 单元/集成测试
    └── e2e/                       # Playwright + tauri-driver
```

---

## 关键依赖

**Rust (Cargo.toml)**
```toml
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-store = "2"
russh = "0.44"
russh-keys = "0.44"
portable-pty = "0.8"
strip-ansi-escapes = "0.2"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
uuid = { version = "1", features = ["v4"] }
anyhow = "1"
```

**前端 (package.json)**
```json
"@tauri-apps/api": "^2",
"@tauri-apps/plugin-store": "^2",
"@xterm/xterm": "^5",
"@xterm/addon-fit": "^0.10",
"@xterm/addon-web-links": "^0.11",
"@xterm/addon-search": "^0.15",
"react": "^19",
"zustand": "^5",
"react-resizable-panels": "^2",
"dnd-kit": "latest",
"tailwindcss": "^4",
"@anthropic-ai/sdk": "latest",
"lucide-react": "latest"
```

---

## AI Agent 架构

### 核心流程（Read → Observe → Propose → Approve → Execute）

```
TerminalView ──scrollback──► contextBuilder ──► Claude API (streaming)
                                                       │
                              plain text ◄─────────────┤
                              CommandProposal ◄─────────┘
                                    │
                          CommandApproval 卡片
                                    │
                    [用户点击 Run]──► execute_approved_command (Rust)
                                    │
                              PTY channel + 审计日志
```

### Claude 工具定义
```typescript
{
  name: "propose_command",
  description: "提议在终端执行命令，需用户审批",
  input_schema: {
    properties: {
      command: { type: "string" },
      explanation: { type: "string" },
      risk_level: { type: "string", enum: ["safe", "caution", "destructive"] }
    }
  }
}
```

**安全原则**：AI 永远无法直接执行命令，必须经过用户审批。`destructive` 级别命令显示红色边框 + 二次确认勾选框。所有执行操作写入本地审计日志。

### 上下文策略
- 默认发送最近 200 行 scrollback（可配置）
- ANSI 转义序列在 Rust 侧去除后再发给 AI
### 多 AI 后端统一抽象

`src/lib/ai/client.ts` 实现统一 `AIClient` 接口，支持三种后端：

```typescript
type AIBackend =
  | { type: "claude"; apiKey: string; model: string }          // claude-sonnet-4-6
  | { type: "ollama"; baseUrl: string; model: string }         // localhost:11434
  | { type: "openai-compat"; baseUrl: string; apiKey: string; model: string } // DeepSeek 等
```

所有后端共享相同的 `chat(messages, tools)` → `AsyncIterable<Delta>` 流式接口。用户在设置界面选择后端和模型，API Key 通过 `tauri-plugin-store` 加密持久化。

---

## Phase 1 MVP 实现步骤（有序）

1. **项目初始化** — `create-tauri-app`，配置 Vite + React + TS，设置 Cargo.toml 依赖，MIT LICENSE
2. **Rust SSH 客户端** — russh Handler 实现，连接状态机，PTY channel，`pty-output` Tauri 事件发射
3. **会话管理器** — `HashMap<Uuid, SessionHandle>`，connect/disconnect/send_input/resize IPC 命令
4. **本地 Shell 支持** — `portable-pty` 本地 PTY（`/bin/bash` / `cmd.exe` / `powershell`），与 SSH 会话共享同一 SessionHandle 接口
5. **连接配置 Store** — tauri-plugin-store 持久化，`ConnectionProfile` serde 结构，CRUD 命令
6. **前端 App Shell** — 三栏 CSS Grid 布局，Sidebar + TabBar（DnD） + AgentPanel 框架
7. **xterm.js 集成** — `useTerminal` hook：xterm 创建 → FitAddon → ResizeObserver → Tauri 事件监听 → onData IPC
8. **配置管理 UI** — ProfileList 侧边栏，ProfileForm 对话框（含文件选择器），QuickConnect
9. **AI Agent Panel** — AgentInput → contextBuilder → 多后端 AI client 流式 → AgentMessage 渲染 → CommandApproval 卡片
10. **SFTP 文件管理** — `russh` SFTP 子系统，`sftp_commands.rs`，前端文件浏览器面板（list/download/upload）
11. **设置界面** — AI 后端选择（Claude/Ollama/OpenAI-compat）、API Key 管理、主题配置

---

## 跨平台打包

**GitHub Actions release.yml** 矩阵：
- `ubuntu-22.04` → `.deb` + `.rpm` + AppImage
- `windows-2022` → `.msi` + NSIS `.exe`（含 WebView2 Bootstrapper）
- `macos-14` → `.dmg`（Universal Binary：x86_64 + aarch64）

使用 `tauri-apps/tauri-action@v0`，代码签名通过 GitHub Secrets 注入。
自动更新：`tauri-plugin-updater` + GitHub Releases JSON endpoint。

---

## 验证方法

1. **Rust 单元测试**：`cargo test` — SSH key 解析、scrollback ANSI 去除、profile serde round-trip
2. **集成测试**：Docker `linuxserver/openssh-server` 作为测试 SSH 服务器
3. **前端测试**：Vitest — contextBuilder、streamParser、Zustand slices
4. **E2E 测试**：Playwright + tauri-driver — 完整连接流程 + Agent 命令审批流程
5. **手动验证清单**：
   - 三平台各自测试安装包
   - 所有认证方式（密码/ed25519/RSA/SSH Agent）
   - vim、htop 等交互程序
   - 窗口 resize → PTY 正确 reflow
   - AI 提议命令 → 审批 → 执行完整流程

---

## 关键文件（实现时优先关注）

- `src-tauri/src/ssh/client.rs` — russh Handler + PTY 事件桥接（整个项目的架构核心）
- `src-tauri/src/commands/ssh_commands.rs` — Rust↔React IPC 边界
- `src/hooks/useTerminal.ts` — xterm.js 生命周期 + Tauri 事件流（前端最复杂部分）
- `src/lib/ai/client.ts` — Claude 流式 API + tool_use 解析（AI 功能核心）
- `src-tauri/src/agent/context.rs` — scrollback 抓取 + ANSI 去除

---

## ENG REVIEW 架构决定（已锁定）

### 安全
- **API Key 存储**：`tauri-plugin-keychain`（OS 系统钥匙串），不用 tauri-plugin-store 存敏感数据
- **IPC 错误类型**：`commands/error.rs` 定义 `AgentShellError` enum，所有 IPC 命令返回 `Result<T, AgentShellError>`
- **known_hosts 验证**：russh 无内置实现，`auth.rs` 必须实现首次连接保存指纹 + 后续验证 + 不匹配警告

### 并发
- **SessionHandle 细粒度锁**：
  - `ssh_channel: Arc<tokio::sync::Mutex<Channel>>` — send_input/resize 用
  - `scrollback: Arc<tokio::sync::Mutex<VecDeque<u8>>>` — PTY 写入/AI 读取用
  - `pty_mode: Arc<tokio::sync::RwLock<PtyMode>>` — 频繁读（Zmodem 状态检查）
  - `health_channel`：connect 时单独建立 exec channel，永远不碰主 channel 锁
- **锁序规范**（`session/manager.rs` 顶部注释）：`ssh_channel` → `scrollback` → `pty_mode`，任何多锁路径必须按此顺序

### 性能
- **PTY 输出批处理**：Rust 侧 10ms 累积缓冲 + flush 一次 emit("pty-output", chunk)
- **SFTP 进度节流**：100ms 最多发一次进度事件（last_emit_at 时间戳检查）
- **SQLite WAL 模式**：FTS5 history.db 必须 `PRAGMA journal_mode=WAL`

### Scrollback 缓冲区
- `VecDeque<u8>` 共用于 asciinema 录制 + AI 上下文
- AI 上下文提取：扫描 `\n` 取最近 200 行，vim/htop 下质量降低属预期行为，文档注明
- 尺寸上限：track `current_size: usize`，超出时批量 drop（不逐字节）

### 命令历史捕获
- 连接后注入 shell integration hooks（bash PROMPT_COMMAND，zsh preexec，fish function）
- 不支持 hook 的 shell (tcsh/sh) 退化到 send_input 累积 + newline 检测
- SQLite WAL 模式支持多 session 并发写

### Zmodem
- 使用 `zmodem2` crate，不自写
- 如遇协议 bug，fork + patch（一天工作量）

### 实现顺序（调整后）
前 4 步先完成工作闭环（有字符出现在终端），再做 UI 层：
1. create-tauri-app 初始化
2. ssh/client.rs（russh + PTY channel + pty-output 批处理）
3. session/manager.rs（细粒度锁 SessionHandle）
4. useTerminal.ts（xterm.js 集成，看到字符 = 可用闭环）
5. pty/local.rs（本地 shell）
6. profile/store.rs（连接配置持久化）
7. 前端 App Shell（三栏布局）
8. 配置管理 UI
9. AI Agent Panel + CommandApproval 状态机
10. SFTP 文件管理
11. 设置界面
12. CEO 新增：健康指标、会话录制、服务器标签、FTS5 命令历史

### 测试策略
- Rust 单元测试 + Docker openssh-server 集成测试（主力）
- tauri-driver E2E 只保留 3 个：连接→终端显示、AI 审批→执行、destructive 双确认
- 完整测试计划：`~/.gstack/projects/agentshell/ggmm-main-eng-review-test-plan-*.md`

### 外部意见发现（Claude 子代理，独立审查）
- ✓ 实现顺序问题：已修复（先建工作闭环）
- ✓ known_hosts 缺失：已加入必需实现列表
- ✓ 锁序死锁风险：已加锁序规范
- ~ MIT 授权：用户确认保持（对目标用户群可接受）
- ~ macOS 代码签名：用户确认 v1 先跳过，加入 TODOS v1.1
- × CommandApproval"虚构"：误报，设计文档已完整覆盖状态机

### Codex 外部意见发现（gpt-5.3-codex，独立审查）

**新增架构决定：**
- **"重连"语义明确**：v1 重连 = 相同 Profile 重新建立新会话，旧 PTY 状态不恢复，scrollback 缓冲区保留展示。文档说明"需要服务器安装 tmux/screen 才能保留会话状态"。
- **Linux 无头环境 Keychain fallback**：keychain 不可用时（无 Secret Service），自动退化到 `~/.agentshell/credentials`（permission 600，PBKDF2 加密，系统随机秘钥）。启动时显示提示说明使用的存储模式。
- **AI 上下文发送前脱敏**：`context.rs` 在提取 scrollback 后先运行脱敏过滤器（echo-off 已有 REDACTED 机制，扩展到密码/token/key 正则模式），再在 `ContextPreview.tsx` 展示脱敏后的内容预览，用户确认后发送。
- **健康检查 MaxSessions 限制**：health monitor 最多维护 5 个独立 exec channel（跨所有 session），超出时健康检查 graceful degradation（暂停该 session 的健康指标采集）。
- **CI 测试矩阵**：`ci.yml` 的 `cargo test` 需要三平台矩阵（ubuntu + macos + windows），不只是 release 打包时才三平台。
- **SQLite + audit.log schema 版本**：`commands` 表加 `schema_version` 字段，升级时用 `ALTER TABLE` 迁移；audit.log 第一行写入格式版本头 `{"version":1}`。

**Codex 确认已覆盖的：**
- ~ 实现顺序：用户确认保持当前顺序（工作闭环在 step 4 已形成）
- ~ MIT：已知风险，用户接受
- ~ 锁序脆弱性：已加注释规范，接受此 tradeoff

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | 6 proposals, 4 accepted, 2 deferred; 1 critical gap |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 21 findings: 6 resolved, 4 accepted tradeoffs, 11 pre-addressed |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 9 issues found & resolved; 52 test paths mapped; 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**UNRESOLVED:** 0 个未解决决策

**VERDICT:** CEO + ENG + CODEX CLEARED — 可以开始实现。Design Review 可选（有 UI 变更时建议运行）。
