import type { CodexProcessSnapshot } from './client'
import type { CodexActiveSession } from './session'

type CodexStatusInput = {
  executable: string | null
  processes: CodexProcessSnapshot[]
  active: CodexActiveSession[]
}

export function formatCodexStatusLines({
  executable,
  processes,
  active
}: CodexStatusInput): string[] {
  const busyWorkspacePaths = new Set(active.map(run => run.workspacePath))
  const busyProcesses = processes.filter(process => busyWorkspacePaths.has(process.workspacePath))
  const processLines = processes
    .toSorted((a, b) => a.workspacePath.localeCompare(b.workspacePath))
    .map(process => {
      const state = busyWorkspacePaths.has(process.workspacePath) ? '▶ busy' : '○ idle'
      return `  ${state}  ws=${process.workspacePath}  pid=${process.pid}`
    })

  return [
    `codex executable  ${executable ?? '(not found)'}`,
    `codex app-servers  ${processes.length} (${busyProcesses.length} busy, ${processes.length - busyProcesses.length} idle)`,
    ...(processLines.length ? processLines : ['  (none running)']),
    `active Codex turns  ${active.length}`,
    ...active.map(run => `  ▶ busy  ws=${run.workspaceId}  session=${run.sessionId}`)
  ]
}
