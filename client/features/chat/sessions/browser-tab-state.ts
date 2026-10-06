const keyFor = (workspaceId: string) => `moi:collab:${workspaceId}:session`

export function readSelectedSession(workspaceId: string): string | null {
  try {
    return sessionStorage.getItem(keyFor(workspaceId))
  } catch {
    return null
  }
}

export function writeSelectedSession(workspaceId: string, sessionId: string | null): void {
  try {
    if (sessionId === null) sessionStorage.removeItem(keyFor(workspaceId))
    else sessionStorage.setItem(keyFor(workspaceId), sessionId)
  } catch {
    /* A private browser can still keep the active query in memory. */
  }
}
