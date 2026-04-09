export interface RecoverableSession {
  sessionId: string
  label: string
  kind: 'ssh' | 'local'
  host?: string
  username?: string
}

export function mergeRecoveredSessions(
  current: RecoverableSession[],
  recovered: RecoverableSession[],
): RecoverableSession[] {
  const merged = new Map<string, RecoverableSession>()

  for (const session of current) {
    merged.set(session.sessionId, session)
  }

  for (const session of recovered) {
    merged.set(session.sessionId, session)
  }

  return [...merged.values()]
}

export function recoveredActiveIndex(recovered: RecoverableSession[]): number {
  return recovered.length ? recovered.length - 1 : 0
}
