import React, { useRef, useEffect, useState } from 'react'
import { useTheme } from '../ThemeProvider'

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

export interface AIPanelProps {
  sessionId: string | null
  messages: ChatMessage[]
  onSendMessage: (text: string) => void
  pendingProposals: CommandProposal[]
  onApprove: (proposal: CommandProposal) => void
  onDismiss: (proposal: CommandProposal) => void
  loading?: boolean
}

interface ProposalCardProps {
  proposal: CommandProposal
  onApprove: () => void
  onDismiss: () => void
  theme: ReturnType<typeof useTheme>['theme']
}

function ProposalCard({ proposal, onApprove, onDismiss, theme }: ProposalCardProps): React.ReactElement {
  const c = theme.colors
  const [confirmed, setConfirmed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editedCmd, setEditedCmd] = useState(proposal.command)

  const riskColor =
    proposal.riskLevel === 'safe'
      ? c.green
      : proposal.riskLevel === 'caution'
        ? '#fbbf24'
        : c.red

  const runEnabled = proposal.riskLevel !== 'destructive' || confirmed

  const btnBase: React.CSSProperties = {
    fontSize: 8,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '3px 9px',
    borderRadius: 2,
    cursor: 'pointer',
    fontWeight: 700,
    fontFamily: 'var(--font-ui)',
    border: `1px solid ${c.sidebarBorder}`,
    background: c.terminalBg,
    color: c.textMuted,
  }

  return (
    <div
      style={{
        marginTop: 7,
        borderRadius: 3,
        overflow: 'hidden',
        border: `1px solid ${riskColor}33`,
        borderLeft: `2px solid ${riskColor}`,
      }}
    >
      {/* Code block */}
      {editing ? (
        <textarea
          value={editedCmd}
          onChange={(e) => setEditedCmd(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            padding: '7px 9px',
            fontSize: 10,
            lineHeight: 1.75,
            fontFamily: 'var(--font-shell)',
            color: c.green,
            background: c.terminalBg,
            border: 'none',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
          rows={2}
        />
      ) : (
        <div
          style={{
            padding: '7px 9px',
            fontSize: 10,
            lineHeight: 1.75,
            fontFamily: 'var(--font-shell)',
            color: c.green,
            background: c.terminalBg,
          }}
        >
          {editedCmd}
        </div>
      )}

      {/* Explanation + actions */}
      <div style={{ padding: '6px 9px', background: c.aiPanelBg }}>
        <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 6 }}>
          {proposal.explanation}
        </div>

        {proposal.riskLevel === 'destructive' && !confirmed && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              color: c.textMuted,
              marginBottom: 6,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I understand this may be irreversible
          </label>
        )}

        <div style={{ display: 'flex', gap: 5 }}>
          <button
            style={{
              ...btnBase,
              ...(runEnabled
                ? {
                    borderColor: riskColor + '4d',
                    color: riskColor,
                    background: riskColor + '12',
                    cursor: 'pointer',
                  }
                : { opacity: 0.4, cursor: 'not-allowed' }),
            }}
            disabled={!runEnabled}
            onClick={onApprove}
          >
            Run
          </button>
          <button
            style={btnBase}
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
          <button style={btnBase} onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

export function AIPanel({
  sessionId,
  messages,
  onSendMessage,
  pendingProposals,
  onApprove,
  onDismiss,
  loading = false,
}: AIPanelProps): React.ReactElement {
  const { theme } = useTheme()
  const c = theme.colors
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingProposals])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !loading) {
        onSendMessage(input.trim())
        setInput('')
      }
    }
  }

  // Avatar styles per theme
  const avatarStyle: React.CSSProperties =
    theme.name === 'industrial'
      ? {
          background: 'rgba(45,212,191,0.15)',
          border: `1px solid rgba(45,212,191,0.4)`,
          color: c.accent2,
        }
      : theme.name === 'minimal'
        ? { background: c.accent, color: '#fff', border: 'none' }
        : {
            background: 'rgba(192,132,252,0.15)',
            border: `1px solid ${c.accent}`,
            color: c.accent,
          }

  // Accent2 for model badge
  const badgeColor = theme.name === 'minimal' ? c.textMuted : (c.accent2 ?? c.accent)

  if (!sessionId) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: c.aiPanelBg,
          borderLeft: `1px solid ${c.aiPanelBorder}`,
          color: c.textMuted,
          fontFamily: 'var(--font-ui)',
          fontSize: 12,
          textAlign: 'center',
          padding: 24,
        }}
      >
        Connect to a session to use the AI agent
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: c.aiPanelBg,
        borderLeft: `1px solid ${c.aiPanelBorder}`,
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '11px 13px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: `1px solid ${c.aiPanelBorder}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            fontFamily: 'var(--font-ui)',
            flexShrink: 0,
            animation: loading ? 'pu 1.8s ease-in-out infinite' : undefined,
            ...avatarStyle,
          }}
        >
          AI
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'var(--font-ui)',
            color: c.pageText,
          }}
        >
          AgentShell AI
        </span>
        <div
          style={{
            marginLeft: 'auto',
            fontSize: 8,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '2px 7px',
            borderRadius: 2,
            fontFamily: 'var(--font-ui)',
            color: badgeColor,
            border: `1px solid ${badgeColor}33`,
          }}
        >
          claude-3
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 12px',
          borderBottom: `1px solid ${c.aiPanelBorder}`,
          flexShrink: 0,
        }}
      >
        {[
          { value: '3', label: 'Sessions' },
          { value: '47', label: 'Commands' },
          { value: '99.9%', label: 'Uptime' },
        ].map(({ value, label }) => (
          <div
            key={label}
            style={{
              flex: 1,
              borderRadius: 3,
              padding: '5px 7px',
              textAlign: 'center',
              background: c.terminalBg,
              border: `1px solid ${c.sidebarBorder}`,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 14,
                fontWeight: 700,
                color: c.pageText,
              }}
            >
              {value}
            </div>
            <div
              style={{
                fontSize: 8,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginTop: 1,
                fontFamily: 'var(--font-ui)',
                color: c.textDim,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Message list */}
      <div
        style={{
          flex: 1,
          padding: '11px 12px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {messages.map((msg) => {
          const isAssistant = msg.role === 'assistant'
          return (
            <div
              key={msg.id}
              style={{
                padding: '9px 11px',
                borderRadius: 5,
                fontSize: 11,
                lineHeight: 1.65,
                background: isAssistant
                  ? c.terminalBg
                  : (c.accent + '11'),
                border: isAssistant
                  ? `1px solid ${c.sidebarBorder}`
                  : `1px solid ${c.accent}26`,
                color: isAssistant ? c.pageText : c.textMuted,
                textAlign: isAssistant ? 'left' : 'right',
              }}
            >
              <div
                style={{
                  fontSize: 8,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-ui)',
                  color: isAssistant
                    ? (theme.name === 'minimal' ? c.textMuted : (c.accent2 ?? c.accent))
                    : c.accent,
                  marginBottom: 5,
                }}
              >
                {isAssistant ? 'Agent' : 'You'}
              </div>
              {msg.text}
            </div>
          )
        })}

        {/* Pending proposals */}
        {pendingProposals.map((p, i) => (
          <ProposalCard
            key={i}
            proposal={p}
            onApprove={() => onApprove(p)}
            onDismiss={() => onDismiss(p)}
            theme={theme}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: '9px 12px',
          display: 'flex',
          gap: 7,
          alignItems: 'center',
          flexShrink: 0,
          borderTop: `1px solid ${c.aiPanelBorder}`,
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          rows={1}
          style={{
            flex: 1,
            borderRadius: 4,
            padding: '6px 9px',
            fontSize: 10.5,
            fontFamily: 'var(--font-shell)',
            color: c.pageText,
            background: c.terminalBg,
            border: `1px solid ${c.sidebarBorder}`,
            outline: 'none',
            resize: 'none',
          }}
        />
        <button
          disabled={loading || !input.trim()}
          onClick={() => {
            if (input.trim() && !loading) {
              onSendMessage(input.trim())
              setInput('')
            }
          }}
          style={{
            width: 30,
            height: 30,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: loading ? 'not-allowed' : 'pointer',
            flexShrink: 0,
            border: 'none',
            background: c.accent,
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              fontSize: 11,
              color: theme.name === 'minimal' ? '#fff' : c.pageBg,
              fontWeight: 700,
            }}
          >
            →
          </span>
        </button>
      </div>

      <style>{`
        @keyframes pu { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  )
}
