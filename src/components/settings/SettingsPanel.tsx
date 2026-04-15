import { useState } from 'react'
import type { AISettings } from '../../lib/ai/client'

interface SettingsPanelProps {
  settings: AISettings
  onChange: (updated: AISettings) => void
  onClose: () => void
}

const LS_KEY = 'agentshell-ai-settings'

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as AISettings
  } catch {
    // ignore parse failures
  }
  return {
    backend: 'claude',
    claudeApiKey: localStorage.getItem('agentshell-claude-key') ?? '',
    claudeModel: 'claude-sonnet-4-6',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3',
    openaiCompatBaseUrl: '',
    openaiCompatApiKey: '',
    openaiCompatModel: 'gpt-4o',
  }
}

export function saveAISettings(settings: AISettings): void {
  localStorage.setItem(LS_KEY, JSON.stringify(settings))
  if (settings.claudeApiKey) {
    localStorage.setItem('agentshell-claude-key', settings.claudeApiKey)
  }
}

export function SettingsPanel({ settings, onChange, onClose }: SettingsPanelProps) {
  const [local, setLocal] = useState<AISettings>({ ...settings })

  function update(patch: Partial<AISettings>) {
    setLocal((current) => ({ ...current, ...patch }))
  }

  function handleSave() {
    saveAISettings(local)
    onChange(local)
    onClose()
  }

  return (
    <div className="settings-card form-grid">
      <div className="quick-connect-card__title">
        <span>AI settings</span>
        <button className="themed-button-ghost" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div>
        <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>Execution mode</span>
        <div className="segment-toggle">
          <button
            type="button"
            className={`segment-toggle__option${local.executionMode !== 'auto' ? ' is-active' : ''}`}
            onClick={() => update({ executionMode: 'manual' })}
          >
            Manual
            <span className="segment-toggle__desc">Approve each command</span>
          </button>
          <button
            type="button"
            className={`segment-toggle__option${local.executionMode === 'auto' ? ' is-active' : ''}`}
            onClick={() => update({ executionMode: 'auto' })}
          >
            Auto
            <span className="segment-toggle__desc">Auto-execute all commands</span>
          </button>
        </div>
      </div>

      <label className="form-grid">
        <span className="section-label">Backend</span>
        <select className="themed-select" value={local.backend} onChange={(e) => update({ backend: e.target.value as AISettings['backend'] })}>
          <option value="claude">Claude</option>
          <option value="ollama">Ollama</option>
          <option value="openai-compat">OpenAI-compatible</option>
        </select>
      </label>

      {local.backend === 'claude' ? (
        <>
          <label className="form-grid">
            <span className="section-label">API key</span>
            <input
              className="themed-input"
              type="password"
              value={local.claudeApiKey ?? ''}
              onChange={(e) => update({ claudeApiKey: e.target.value })}
              placeholder="sk-ant-..."
            />
          </label>
          <label className="form-grid">
            <span className="section-label">Model</span>
            <select
              className="themed-select"
              value={local.claudeModel ?? 'claude-sonnet-4-6'}
              onChange={(e) => update({ claudeModel: e.target.value })}
            >
              <option value="claude-opus-4-6">claude-opus-4-6</option>
              <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
              <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
            </select>
          </label>
        </>
      ) : null}

      {local.backend === 'ollama' ? (
        <>
          <label className="form-grid">
            <span className="section-label">Base URL</span>
            <input
              className="themed-input"
              value={local.ollamaBaseUrl ?? 'http://localhost:11434'}
              onChange={(e) => update({ ollamaBaseUrl: e.target.value })}
              placeholder="http://localhost:11434"
            />
          </label>
          <label className="form-grid">
            <span className="section-label">Model</span>
            <input
              className="themed-input"
              value={local.ollamaModel ?? 'llama3'}
              onChange={(e) => update({ ollamaModel: e.target.value })}
              placeholder="llama3"
            />
          </label>
        </>
      ) : null}

      {local.backend === 'openai-compat' ? (
        <>
          <label className="form-grid">
            <span className="section-label">Base URL</span>
            <input
              className="themed-input"
              value={local.openaiCompatBaseUrl ?? ''}
              onChange={(e) => update({ openaiCompatBaseUrl: e.target.value })}
              placeholder="https://api.openai.com or https://host/v1"
            />
            <span className="muted-text">Supports host root, `/v1`, or a full `/chat/completions` URL.</span>
          </label>
          <label className="form-grid">
            <span className="section-label">API key</span>
            <input
              className="themed-input"
              type="password"
              value={local.openaiCompatApiKey ?? ''}
              onChange={(e) => update({ openaiCompatApiKey: e.target.value })}
              placeholder="sk-..."
            />
          </label>
          <label className="form-grid">
            <span className="section-label">Model</span>
            <input
              className="themed-input"
              value={local.openaiCompatModel ?? 'gpt-4o'}
              onChange={(e) => update({ openaiCompatModel: e.target.value })}
              placeholder="gpt-4o"
            />
          </label>
        </>
      ) : null}

      <div className="form-actions">
        <button className="themed-button-secondary" type="button" onClick={handleSave}>
          Save
        </button>
        <button className="themed-button-ghost" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
