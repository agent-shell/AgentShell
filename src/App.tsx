import { Component, useEffect, useMemo, useState } from 'react'
import '@xterm/xterm/css/xterm.css'
import {
  Bot,
  FolderTree,
  History,
  Palette,
  Search,
  Settings2,
  Square,
  TerminalSquare,
} from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './index.css'
import { ThemeProvider, useTheme } from './ThemeProvider'
import { TerminalView } from './components/terminal/TerminalView'
import { QuickConnect } from './components/profiles/QuickConnect'
import { ProfileList } from './components/profiles/ProfileList'
import { AIPanel, type ChatMessage, type CommandProposal } from './components/AIPanel'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import {
  connectLocalShell,
  executeApprovedCommand,
  getScrollback,
  onHealthUpdate,
  onRecordingStopped,
  startHealthMonitor,
  startRecording,
  stopRecording,
  type HealthData,
} from './lib/tauri'
import { AIClient, PROPOSE_COMMAND_TOOL, type AISettings } from './lib/ai/client'
import { extractProposals } from './lib/ai/streamParser'
import { HistorySearch } from './components/history/HistorySearch'
import { SettingsPanel, loadAISettings } from './components/settings/SettingsPanel'
import { SftpPanel } from './components/sftp/SftpPanel'

interface ActiveSession {
  sessionId: string
  label: string
  kind: 'ssh' | 'local'
  host?: string
  username?: string
}

const QA_PREVIEW_SESSION: ActiveSession = {
  sessionId: 'qa-preview',
  label: 'cd-aida-kagent-dev',
  kind: 'ssh',
  host: '172.31.7.128',
  username: 'ubuntu',
}

const QA_PREVIEW_HEALTH: HealthData = {
  load_1m: 0.49,
  cpu_count: 2,
  status: 'green',
}

const QA_PREVIEW_MESSAGES: ChatMessage[] = [
  {
    id: 'qa-user',
    role: 'user',
    text: 'show me the repo state on this host',
  },
  {
    id: 'qa-assistant',
    role: 'assistant',
    text: 'Connected to ubuntu@cd-aida-kagent-dev in ~/liangli/skillhub on branch dev. The repo currently has two modified files and one untracked file.',
  },
]

const QA_PREVIEW_PROPOSALS: CommandProposal[] = [
  {
    command: "git status --short -b && ls -la web | sed -n '1,20p'",
    explanation: 'Read-only inspection of the current branch state and the frontend directory layout.',
    riskLevel: 'safe',
  },
]

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function backendLabel(settings: AISettings): string {
  if (settings.backend === 'claude') return settings.claudeModel ?? 'claude'
  if (settings.backend === 'ollama') return settings.ollamaModel ?? 'ollama'
  return settings.openaiCompatModel ?? 'openai'
}

async function startWindowDrag(event: React.MouseEvent<HTMLElement>): Promise<void> {
  if (!isTauriRuntime()) return
  if (event.button !== 0) return
  const target = event.target
  if (target instanceof HTMLElement && target.closest('.no-drag')) return
  await getCurrentWindow().startDragging().catch(() => undefined)
}

function AppShell() {
  const { theme } = useTheme()
  const qaPreview = typeof window !== 'undefined' && window.location.hash.includes('qa-live')
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [showThemeSwitcher, setShowThemeSwitcher] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSftp, setShowSftp] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showQuickConnect, setShowQuickConnect] = useState(false)
  const [sidebarFilter, setSidebarFilter] = useState('')
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([])
  const [aiProposals, setAiProposals] = useState<CommandProposal[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSettings, setAiSettings] = useState<AISettings>(() => loadAISettings())
  const [healthMap, setHealthMap] = useState<Record<string, HealthData>>({})
  const [recordingMap, setRecordingMap] = useState<Record<string, string | null>>({})

  const activeSession = sessions[activeIndex] ?? null
  const currentHealth = activeSession ? healthMap[activeSession.sessionId] : undefined
  const isRecording = activeSession ? Boolean(recordingMap[activeSession.sessionId]) : false
  const displaySessions = sessions.length ? sessions : qaPreview ? [QA_PREVIEW_SESSION] : []
  const displayActiveSession = activeSession ?? (qaPreview ? QA_PREVIEW_SESSION : null)
  const displayHealth = currentHealth ?? (qaPreview ? QA_PREVIEW_HEALTH : undefined)
  const displayAiMessages = activeSession ? aiMessages : qaPreview ? QA_PREVIEW_MESSAGES : aiMessages
  const displayAiProposals = activeSession ? aiProposals : qaPreview ? QA_PREVIEW_PROPOSALS : aiProposals

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        setShowHistory(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash.includes('theme-lab')) {
      setShowThemeSwitcher(true)
    }
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) return
    const currentWindow = getCurrentWindow()
    let unlisten: (() => void) | undefined
    currentWindow.onResized(() => undefined).then((dispose) => {
      unlisten = dispose
    }).catch(() => undefined)

    return () => {
      unlisten?.()
    }
  }, [])

  function registerSession(sessionId: string, label: string, meta?: { kind: 'ssh' | 'local'; host?: string; username?: string }) {
    setSessions((current) => {
      const next = [
        ...current,
        {
          sessionId,
          label,
          kind: meta?.kind ?? 'ssh',
          host: meta?.host,
          username: meta?.username,
        },
      ]
      setActiveIndex(next.length - 1)
      return next
    })

    startHealthMonitor(sessionId, 60).catch(() => undefined)
    onHealthUpdate(sessionId, (health) => {
      setHealthMap((current) => ({ ...current, [sessionId]: health }))
    }).catch(() => undefined)
    onRecordingStopped(sessionId, () => {
      setRecordingMap((current) => ({ ...current, [sessionId]: null }))
    }).catch(() => undefined)
  }

  function handleDisconnected(sessionId: string) {
    setSessions((current) => {
      const next = current.filter((session) => session.sessionId !== sessionId)
      setActiveIndex((previous) => Math.max(0, Math.min(previous, next.length - 1)))
      return next
    })
  }

  async function handleLocalShell() {
    try {
      const result = await connectLocalShell()
      registerSession(result.session_id, 'local shell', { kind: 'local' })
    } catch (err) {
      console.error('local shell failed:', err)
    }
  }

  async function handleToggleRecording() {
    if (!activeSession) return
    const sessionId = activeSession.sessionId
    if (recordingMap[sessionId]) {
      await stopRecording(sessionId).catch(console.error)
      setRecordingMap((current) => ({ ...current, [sessionId]: null }))
      return
    }
    const path = await startRecording(sessionId).catch(() => null)
    if (path) {
      setRecordingMap((current) => ({ ...current, [sessionId]: path }))
    }
  }

  async function handleSendMessage(text: string): Promise<void> {
    const historySnapshot = aiMessages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role, content: message.text }))

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', text }
    const assistantId = crypto.randomUUID()
    setAiMessages((current) => [...current, userMessage, { id: assistantId, role: 'assistant', text: '' }])
    setAiLoading(true)

    try {
      let context = ''
      if (activeSession) {
        try {
          context = await getScrollback(activeSession.sessionId, 100)
        } catch {
          // continue without scrollback
        }
      }

      const fullText = context
        ? `Terminal context (last 100 lines):\n\`\`\`\n${context}\n\`\`\`\n\nUser: ${text}`
        : `User: ${text}`

      const client = AIClient.fromSettings(aiSettings)
      const deltas = []

      for await (const delta of client.chat([...historySnapshot, { role: 'user', content: fullText }], [PROPOSE_COMMAND_TOOL])) {
        deltas.push(delta)
        if (delta.type === 'text') {
          setAiMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, text: `${message.text}${delta.text ?? ''}` } : message,
            ),
          )
        }
        if (delta.type === 'error') {
          setAiMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, text: `Error: ${delta.error}` } : message,
            ),
          )
        }
      }

      const proposals = extractProposals(deltas)
      if (proposals.length) {
        setAiProposals((current) => [...current, ...proposals])
      }
    } finally {
      setAiLoading(false)
    }
  }

  function handleApproveProposal(original: CommandProposal, finalCommand?: string) {
    const command = finalCommand ?? original.command
    setAiProposals((current) =>
      current.filter(
        (proposal) =>
          !(
            proposal.command === original.command &&
            proposal.explanation === original.explanation &&
            proposal.riskLevel === original.riskLevel
          ),
      ),
    )
    if (!activeSession) return
    executeApprovedCommand(activeSession.sessionId, command).catch((err) => {
      console.error('execute_approved_command failed:', err)
    })
  }

  const aiStats = useMemo(() => {
    const healthValue = displayActiveSession?.kind === 'local'
      ? { value: 'Local', color: 'var(--color-accent)' }
      : displayHealth
        ? {
            value: displayHealth.status.toUpperCase(),
            color:
              displayHealth.status === 'green'
                ? 'var(--color-green)'
                : displayHealth.status === 'yellow'
                  ? 'var(--color-yellow)'
                  : 'var(--color-red)',
          }
        : { value: 'Idle', color: 'var(--color-text-muted)' }

    return [
      { label: 'Tabs', value: String(displaySessions.length || 0) },
      { label: 'Pending', value: String(displayAiProposals.length || 0), color: displayAiProposals.length ? 'var(--color-accent2)' : undefined },
      { label: 'Health', value: healthValue.value, color: healthValue.color },
    ]
  }, [displayActiveSession?.kind, displayAiProposals.length, displayHealth, displaySessions.length])

  const promptPreview = displayActiveSession
    ? displayActiveSession.kind === 'local'
      ? 'local shell is ready for commands'
      : `${displayActiveSession.username ?? 'user'}@${displayActiveSession.host ?? displayActiveSession.label}`
    : 'connect to a host to begin'

  const healthDot =
    displayHealth?.status === 'green'
      ? 'var(--color-status-online)'
      : displayHealth?.status === 'yellow'
        ? 'var(--color-status-warn)'
        : displayHealth?.status === 'red'
          ? 'var(--color-red)'
          : 'var(--color-text-dim)'

  const titlebarStatusLabel =
    theme.name === 'minimal'
      ? displayActiveSession
        ? 'Connected'
        : 'Ready'
      : displayActiveSession
        ? 'Agent Active'
        : 'Standby'

  async function minimizeWindow() {
    if (!isTauriRuntime()) return
    await getCurrentWindow().minimize().catch(() => undefined)
  }

  async function toggleMaximizeWindow() {
    if (!isTauriRuntime()) return
    const currentWindow = getCurrentWindow()
    try {
      if (await currentWindow.isMaximized()) {
        await currentWindow.unmaximize()
      } else {
        await currentWindow.maximize()
      }
    } catch {
      // ignore
    }
  }

  async function closeWindow() {
    if (!isTauriRuntime()) return
    await getCurrentWindow().close().catch(() => undefined)
  }

  return (
    <div className={`app-shell theme-${theme.name}`}>
      <div className="window-shell">
        <header className="window-titlebar" onMouseDown={(event) => void startWindowDrag(event)}>
          <div className="titlebar-brand">
            <div className="window-controls no-drag">
              <button className="window-control close no-drag" type="button" onClick={() => void closeWindow()} aria-label="Close window" />
              <button className="window-control minimize no-drag" type="button" onClick={() => void minimizeWindow()} aria-label="Minimize window" />
              <button className="window-control maximize no-drag" type="button" onClick={() => void toggleMaximizeWindow()} aria-label="Maximize window" />
            </div>
            <div className="brand-wordmark">
              <span className="brand-mark"><span>A</span></span>
              AgentShell
            </div>
          </div>

          <div className="titlebar-tabs">
            {displaySessions.length ? (
              displaySessions.map((session, index) => {
                const health = healthMap[session.sessionId] ?? (session.sessionId === QA_PREVIEW_SESSION.sessionId ? QA_PREVIEW_HEALTH : undefined)
                const dotColor =
                  health?.status === 'green'
                    ? 'var(--color-status-online)'
                    : health?.status === 'yellow'
                      ? 'var(--color-status-warn)'
                      : health?.status === 'red'
                        ? 'var(--color-red)'
                        : 'var(--color-text-dim)'
                return (
                  <button
                    className={`session-tab no-drag${session.sessionId === displayActiveSession?.sessionId || (!activeSession && index === 0) ? ' is-active' : ''}`}
                    key={session.sessionId}
                    type="button"
                    onClick={() => {
                      if (!sessions.length) return
                      setActiveIndex(index)
                    }}
                  >
                    <span className="session-tab__dot" style={{ background: dotColor }} />
                    {session.label}
                  </button>
                )
              })
            ) : (
              <span className="session-tab session-tab--ghost">No active sessions</span>
            )}
              <button className="session-tab session-tab--ghost no-drag" type="button" onClick={handleLocalShell}>
                +
              </button>
          </div>

          <div className="titlebar-status no-drag">
            <div className="titlebar-pill">
              <span className="pulse-dot loading-pulse" style={{ background: 'var(--color-accent2)' }} />
              {titlebarStatusLabel}
            </div>
            <div className="topbar-icon-row no-drag">
              <button className={`icon-button${showThemeSwitcher ? ' is-active' : ''}`} type="button" onClick={() => setShowThemeSwitcher(true)} title="Switch theme">
                <Palette size={14} />
              </button>
              <button className={`icon-button${showSettings ? ' is-active' : ''}`} type="button" onClick={() => setShowSettings(true)} title="AI settings">
                <Settings2 size={14} />
              </button>
            </div>
          </div>
        </header>

        <div className="window-content">
          <aside className="sidebar-shell">
            <div className="sidebar-header">
              <div className="sidebar-header__label">Connections</div>
              <label className="sidebar-search">
                <Search size={13} color="var(--color-text-muted)" />
                <input value={sidebarFilter} onChange={(e) => setSidebarFilter(e.target.value)} placeholder="Filter hosts..." />
              </label>
            </div>

            <div className="sidebar-body">
              {qaPreview ? (
                <div className="profile-list profile-list--preview">
                  <div className="profile-group">
                    <div className="profile-group__label section-label">Development</div>
                    <div className="profile-row is-active">
                      <span className="profile-avatar">CD</span>
                      <span className="profile-copy">
                        <div className="profile-name">cd-aida-kagent-dev</div>
                        <div className="profile-meta">ubuntu · 172.31.7.128</div>
                      </span>
                      <span className="status-dot" style={{ marginLeft: 'auto', background: 'var(--color-status-online)' }} />
                    </div>
                    <div className="profile-row">
                      <span className="profile-avatar">SH</span>
                      <span className="profile-copy">
                        <div className="profile-name">skillhub</div>
                        <div className="profile-meta">~/liangli/skillhub · dev</div>
                      </span>
                      <span className="status-dot" style={{ marginLeft: 'auto', background: 'var(--color-status-warn)' }} />
                    </div>
                  </div>
                </div>
              ) : null}
              <ProfileList activeSessionLabel={displayActiveSession?.label ?? null} filterQuery={sidebarFilter} suppressEmptyState={qaPreview} onConnected={registerSession} />
              {showQuickConnect ? <QuickConnect onConnected={registerSession} /> : null}
              <div className="footer-button-row">
                <button className={`themed-button-${showQuickConnect ? 'ghost' : 'secondary'}`} type="button" onClick={() => setShowQuickConnect((value) => !value)}>
                  New
                </button>
                <button className="themed-button-ghost" type="button" onClick={() => setShowThemeSwitcher(true)}>
                  Import
                </button>
                <button className="themed-button-ghost" type="button" onClick={() => setShowSettings(true)}>
                  Config
                </button>
              </div>
              {showQuickConnect ? (
                <div className="footer-button-row" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
                  <button className="themed-button-secondary" type="button" onClick={handleLocalShell}>
                    <TerminalSquare size={14} />
                    Local shell
                  </button>
                </div>
              ) : null}
            </div>
          </aside>

          <main className="main-shell">
            {theme.name === 'industrial' ? (
              <div className="main-toolbar">
                <div className="main-toolbar__path">
                  <span>~</span>
                  <span className="separator">/</span>
                  <span>{displayActiveSession?.kind ?? 'sessions'}</span>
                  <span className="separator">/</span>
                  <strong>{displayActiveSession?.label ?? 'ready'}</strong>
                </div>
                <span className="toolbar-spacer" />
                <span className="main-toolbar__meta">
                  <span className="status-dot" style={{ background: healthDot }} />
                  {displayActiveSession?.kind === 'local' ? 'LOCAL' : displayHealth ? 'SSH' : 'WAITING'}
                </span>
                <span className="main-toolbar__meta">{backendLabel(aiSettings)}</span>
              </div>
            ) : null}

            <div className="workspace-stage">
              {activeSession || qaPreview ? (
                <>
                  <div className="terminal-shell" style={{ flex: showSftp ? '0 0 58%' : 1 }}>
                    <div className="terminal-livebar">
                      <span className="live-pill">
                        <span className="pulse-dot loading-pulse" style={{ background: displayActiveSession?.kind === 'local' ? 'var(--color-accent)' : 'var(--color-accent2)' }} />
                        {displayActiveSession?.kind === 'local' ? 'Local' : 'Live'}
                      </span>
                      <span className="terminal-subtitle">
                        {displayActiveSession?.kind === 'local'
                          ? 'Local shell session'
                          : qaPreview
                            ? 'ubuntu@cd-aida-kagent-dev · ~/liangli/skillhub'
                            : `${displayActiveSession?.username ?? 'user'}@${displayActiveSession?.host ?? displayActiveSession?.label}`}
                      </span>
                      <span className="terminal-latency">
                        {displayActiveSession?.kind === 'local'
                          ? 'LOCAL'
                          : displayHealth
                            ? `${displayHealth.load_1m.toFixed(2)} load`
                            : 'SSH'}
                      </span>
                      <div className="inputbar-actions">
                        <button className={`icon-button${isRecording ? ' is-active' : ''}`} type="button" title="Toggle recording" onClick={() => void handleToggleRecording()}>
                          {isRecording ? <Square size={14} /> : <Bot size={14} />}
                        </button>
                        <button className="icon-button" type="button" title="History search" onClick={() => setShowHistory(true)}>
                          <History size={14} />
                        </button>
                        <button className={`icon-button${showSftp ? ' is-active' : ''}`} type="button" title="Toggle SFTP" onClick={() => setShowSftp((value) => !value)}>
                          <FolderTree size={14} />
                        </button>
                      </div>
                    </div>

                    {activeSession ? (
                      <TerminalView key={activeSession.sessionId} sessionId={activeSession.sessionId} onDisconnected={() => handleDisconnected(activeSession.sessionId)} />
                    ) : (
                      <div className="terminal-preview-body">
                        <div className="terminal-preview-line terminal-preview-line--muted">ubuntu@cd-aida-kagent-dev:~/liangli/skillhub$ hostname</div>
                        <div className="terminal-preview-line">cd-aida-kagent-dev</div>
                        <div className="terminal-preview-line terminal-preview-line--muted">ubuntu@cd-aida-kagent-dev:~/liangli/skillhub$ git status --short -b</div>
                        <div className="terminal-preview-line terminal-preview-line--accent">## dev...origin/dev</div>
                        <div className="terminal-preview-line terminal-preview-line--warn"> M compose.release.yml</div>
                        <div className="terminal-preview-line terminal-preview-line--warn"> M server/skillhub-app/src/main/resources/application.yml</div>
                        <div className="terminal-preview-line terminal-preview-line--cyan">?? opencode.json</div>
                        <div className="terminal-preview-line terminal-preview-line--muted">ubuntu@cd-aida-kagent-dev:~/liangli/skillhub$ ls -la web | sed -n '1,8p'</div>
                        <div className="terminal-preview-line">drwxrwxr-x  6 ubuntu ubuntu   4096 Apr  2 07:52 web</div>
                        <div className="terminal-preview-line">-rw-rw-r--  1 ubuntu ubuntu   2072 Apr  2 07:52 package.json</div>
                        <div className="terminal-preview-line">-rw-rw-r--  1 ubuntu ubuntu    614 Apr  2 07:52 vite.config.ts</div>
                        <div className="terminal-preview-line terminal-preview-line--agent">AgentShell · read-only smoke against 172.31.7.128 completed.</div>
                      </div>
                    )}

                    <div className="terminal-inputbar">
                      <span className="prompt-token">{displayActiveSession?.kind === 'local' ? '$' : '❯'}</span>
                      <span className="command-preview">{promptPreview}</span>
                      <div className="inputbar-actions">
                        <span className="status-chip">
                          <Bot size={12} />
                          Ask Agent
                        </span>
                      </div>
                    </div>
                  </div>

                  {showSftp && activeSession?.kind === 'ssh' ? <SftpPanel sessionId={activeSession.sessionId} /> : null}
                </>
              ) : (
                <div className="terminal-shell terminal-shell--empty">
                  <div className="terminal-livebar">
                    <span className="live-pill">
                      <span className="pulse-dot" style={{ background: 'var(--color-text-muted)' }} />
                      Idle
                    </span>
                    <span className="terminal-subtitle">No active session</span>
                    <span className="terminal-latency">READY</span>
                  </div>

                  <div className="terminal-body">
                    <div className="terminal-body__grid" />
                    <div className="terminal-empty-panel">
                      <div className="message__label">Workspace</div>
                      <div className="terminal-empty-title">Bring a shell online</div>
                      <div className="terminal-empty-copy">
                        Start a local shell or open a quick SSH session from the sidebar. Once connected, terminal history,
                        recording, SFTP, and agent proposals will appear here.
                      </div>
                      <div className="terminal-empty-actions">
                        <button className="themed-button-secondary" type="button" onClick={() => setShowQuickConnect(true)}>
                          New connection
                        </button>
                        <button className="themed-button-ghost" type="button" onClick={handleLocalShell}>
                          Local shell
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="terminal-inputbar">
                    <span className="prompt-token">$</span>
                    <span className="command-preview">open a session from the left sidebar to begin</span>
                    <div className="inputbar-actions">
                      <span className="status-chip">
                        <Bot size={12} />
                        Ask Agent
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>

          <AIPanel
            sessionId={activeSession?.sessionId ?? (qaPreview ? QA_PREVIEW_SESSION.sessionId : null)}
            backendLabel={backendLabel(aiSettings)}
            stats={aiStats}
            messages={displayAiMessages}
            pendingProposals={displayAiProposals}
            onSendMessage={handleSendMessage}
            onApprove={(proposal, finalCommand) => handleApproveProposal(proposal, finalCommand)}
            onDismiss={(proposal) =>
              setAiProposals((current) =>
                current.filter(
                  (item) =>
                    !(
                      item.command === proposal.command &&
                      item.explanation === proposal.explanation &&
                      item.riskLevel === proposal.riskLevel
                    ),
                ),
              )
            }
            loading={aiLoading}
          />
        </div>
      </div>

      {showThemeSwitcher ? (
        <div className="modal-backdrop" onClick={() => setShowThemeSwitcher(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <ThemeSwitcher onClose={() => setShowThemeSwitcher(false)} />
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal-card" style={{ width: 'min(560px, calc(100vw - 48px))' }} onClick={(e) => e.stopPropagation()}>
            <SettingsPanel settings={aiSettings} onChange={setAiSettings} onClose={() => setShowSettings(false)} />
          </div>
        </div>
      ) : null}

      {showHistory ? (
        <HistorySearch
          onSelect={(command) => {
            if (!activeSession) return
            import('./lib/tauri').then(({ sendInput }) => {
              const encoded = Array.from(new TextEncoder().encode(command))
              void sendInput(activeSession.sessionId, encoded)
            })
          }}
          onClose={() => setShowHistory(false)}
        />
      ) : null}
    </div>
  )
}

class AppErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error-shell">
          <div className="app-error-card">
            <div className="section-label">Runtime error</div>
            <div className="terminal-empty-title" style={{ marginTop: 10 }}>App render failed</div>
            <pre className="app-error-copy">{this.state.error.message}</pre>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function App() {
  return (
    <ThemeProvider>
      <AppErrorBoundary>
        <AppShell />
      </AppErrorBoundary>
    </ThemeProvider>
  )
}

export default App
