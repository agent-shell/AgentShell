import React, { useEffect, useRef, useState } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export interface CommandProposal {
  command: string
  explanation: string
  riskLevel: 'safe' | 'caution' | 'destructive'
}

interface AIStat {
  label: string
  value: string
  color?: string
}

export interface AIPanelProps {
  sessionId: string | null
  title?: string
  backendLabel?: string
  stats: AIStat[]
  messages: ChatMessage[]
  onSendMessage: (text: string) => void
  pendingProposals: CommandProposal[]
  onApprove: (proposal: CommandProposal, finalCommand?: string) => void
  onDismiss: (proposal: CommandProposal) => void
  autoExecuted?: CommandProposal[]
  onDismissAutoExecuted?: (proposal: CommandProposal) => void
  loading?: boolean
  executionMode?: 'manual' | 'auto'
}

interface ProposalCardProps {
  proposal: CommandProposal
  onApprove: (finalCommand: string) => void
  onDismiss: () => void
}

function ProposalCard({ proposal, onApprove, onDismiss }: ProposalCardProps): React.ReactElement {
  const [confirmed, setConfirmed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editedCommand, setEditedCommand] = useState(proposal.command)

  const proposalColor =
    proposal.riskLevel === 'safe'
      ? 'var(--color-green)'
      : proposal.riskLevel === 'caution'
        ? 'var(--color-yellow)'
        : 'var(--color-red)'

  const runAllowed = proposal.riskLevel !== 'destructive' || confirmed

  return (
    <div className="proposal-card" style={{ ['--proposal-color' as string]: proposalColor }}>
      {editing ? (
        <textarea
          className="themed-textarea"
          rows={3}
          value={editedCommand}
          onChange={(e) => setEditedCommand(e.target.value)}
          style={{ border: 'none', borderRadius: 0, fontFamily: 'var(--font-shell)' }}
        />
      ) : (
        <div className="proposal-card__code">{editedCommand}</div>
      )}

      <div className="proposal-card__body">
        <div className="proposal-card__meta">
          <span className="message__label">Command proposal</span>
          <span className="risk-badge">{proposal.riskLevel}</span>
        </div>
        <div className="muted-text" style={{ lineHeight: 1.6 }}>
          {proposal.explanation}
        </div>

        {proposal.riskLevel === 'destructive' ? (
          <label className="muted-text" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I understand this can be destructive.
          </label>
        ) : null}

        <div className="proposal-card__actions">
          <button
            className="themed-button-secondary"
            type="button"
            disabled={!runAllowed}
            onClick={() => onApprove(editedCommand)}
          >
            Run
          </button>
          <button className="themed-button-ghost" type="button" onClick={() => setEditing((value) => !value)}>
            {editing ? 'Done' : 'Edit'}
          </button>
          <button
            className="themed-button-ghost"
            type="button"
            onClick={() => navigator.clipboard.writeText(editedCommand).catch(() => undefined)}
          >
            Copy
          </button>
          <button className="themed-button-ghost" type="button" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

interface AutoExecutedCardProps {
  proposal: CommandProposal
  onDismiss: () => void
}

function AutoExecutedCard({ proposal, onDismiss }: AutoExecutedCardProps): React.ReactElement {
  return (
    <div className="auto-card">
      <div className="auto-card__header">
        <span className="auto-card__icon">✓</span>
        <span className="auto-card__label">Auto-executed</span>
        <button className="auto-card__dismiss" type="button" onClick={onDismiss}>
          ✕
        </button>
      </div>
      <div className="auto-card__code">{proposal.command}</div>
      <div className="auto-card__explanation">{proposal.explanation}</div>
    </div>
  )
}

export function AIPanel({
  sessionId,
  title = 'AgentShell AI',
  backendLabel = 'offline',
  stats,
  messages,
  onSendMessage,
  pendingProposals,
  onApprove,
  onDismiss,
  autoExecuted = [],
  onDismissAutoExecuted,
  loading = false,
  executionMode = 'manual',
}: AIPanelProps): React.ReactElement {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingProposals, autoExecuted, loading])

  function handleSend() {
    if (!input.trim() || loading) return
    onSendMessage(input.trim())
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!sessionId) {
    return (
      <aside className="ai-shell">
        <div className="ai-header">
          <span className={`ai-avatar${loading ? ' loading-pulse' : ''}`}>AI</span>
          <span className="ai-title">{title}</span>
          <span className="ai-badge">
            {executionMode === 'auto' ? 'AUTO·EXEC' : backendLabel}
          </span>
        </div>
        <div className="ai-stats">
          {stats.map((stat) => (
            <div className="ai-stat" key={stat.label}>
              <div className="ai-stat__value" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="ai-stat__label">{stat.label}</div>
            </div>
          ))}
        </div>
        <div className="ai-body">
          <div className="message message--assistant">
            <div className="message__label">Analysis</div>
            Connect to a session and I can inspect terminal scrollback, propose commands, and execute approved fixes.
          </div>
        </div>
        <div className="ai-composer">
          <textarea
            className="themed-textarea"
            rows={1}
            value=""
            readOnly
            placeholder="Connect a session to ask the agent..."
          />
          <button className="ai-send" type="button" disabled>
            →
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="ai-shell">
      <div className="ai-header">
        <span className={`ai-avatar${loading ? ' loading-pulse' : ''}`}>AI</span>
        <span className="ai-title">{title}</span>
        <span className={`ai-badge${executionMode === 'auto' ? ' ai-badge--active' : ''}`}>
          {executionMode === 'auto' ? 'AUTO·EXEC' : backendLabel}
        </span>
      </div>

      <div className="ai-stats">
        {stats.map((stat) => (
          <div className="ai-stat" key={stat.label}>
            <div className="ai-stat__value" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="ai-stat__label">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="ai-body">
        {messages.map((message) => {
          const isAssistant = message.role === 'assistant'
          return (
            <div className={`message ${isAssistant ? 'message--assistant' : 'message--user'}`} key={message.id}>
              <div className="message__label">{isAssistant ? 'Analysis' : 'You'}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{message.text || (loading && isAssistant ? '...' : '')}</div>
            </div>
          )
        })}

        {autoExecuted.map((proposal) => (
          <AutoExecutedCard
            key={`auto-${proposal.command}-${proposal.riskLevel}`}
            proposal={proposal}
            onDismiss={() => onDismissAutoExecuted?.(proposal)}
          />
        ))}

        {pendingProposals.map((proposal) => (
          <ProposalCard
            key={`${proposal.command}-${proposal.riskLevel}`}
            proposal={proposal}
            onApprove={(finalCommand) => onApprove(proposal, finalCommand)}
            onDismiss={() => onDismiss(proposal)}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="ai-composer">
        <textarea
          className="themed-textarea"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this session..."
        />
        <button className="ai-send" type="button" onClick={handleSend} disabled={loading || !input.trim()}>
          →
        </button>
      </div>
    </aside>
  )
}
