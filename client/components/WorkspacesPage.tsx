import { useEffect, useState } from 'react'

import { IconFolder, IconFolderPlus, IconLoader2 } from '@tabler/icons-react'
import { Link } from 'wouter'

import type { WorkspaceEntry } from '@/lib/types'

type PageState = 'loading' | 'ready' | 'error'

export function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([])
  const [discovered, setDiscovered] = useState<string[]>([])
  const [state, setState] = useState<PageState>('loading')
  const [importing, setImporting] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/workspaces').then(r => r.json()),
      fetch('/api/workspaces/discover').then(r => r.json())
    ])
      .then(([ws, disc]) => {
        setWorkspaces(ws)
        setDiscovered(disc)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  async function importWorkspace(path: string) {
    setImporting(path)
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })
      const entry: WorkspaceEntry = await res.json()
      setWorkspaces(prev => [...prev, entry])
      setDiscovered(prev => prev.filter(p => p !== path))
    } finally {
      setImporting(null)
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <IconLoader2 size={20} stroke={1.5} className="text-muted-foreground animate-spin" />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Could not load workspaces.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="text-foreground mb-8 text-xl font-semibold tracking-tight">Workspaces</h1>

      {workspaces.length === 0 && (
        <p className="text-muted-foreground mb-6 text-sm">
          No workspaces yet. Run{' '}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">moi start</code> in a
          project directory, or import one below.
        </p>
      )}

      {workspaces.length > 0 && (
        <ul className="mb-10 space-y-1">
          {workspaces.map(ws => (
            <li key={ws.id}>
              <Link
                href={`/workspace/${ws.id}`}
                className="hover:bg-muted flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
              >
                <IconFolder size={16} stroke={1.5} className="text-muted-foreground shrink-0" />
                <span className="text-foreground min-w-0 truncate text-sm font-medium">
                  {ws.path.split('/').pop()}
                </span>
                <span className="text-muted-foreground ml-auto shrink-0 truncate text-xs">
                  {ws.path}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {discovered.length > 0 && (
        <div>
          <h2 className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider">
            Import from Claude Code
          </h2>
          <ul className="space-y-1">
            {discovered.map(path => (
              <li key={path}>
                <button
                  onClick={() => importWorkspace(path)}
                  disabled={importing === path}
                  className="hover:bg-muted flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:opacity-50"
                >
                  {importing === path ? (
                    <IconLoader2
                      size={16}
                      stroke={1.5}
                      className="text-muted-foreground shrink-0 animate-spin"
                    />
                  ) : (
                    <IconFolderPlus
                      size={16}
                      stroke={1.5}
                      className="text-muted-foreground shrink-0"
                    />
                  )}
                  <span className="text-foreground min-w-0 truncate text-sm">
                    {path.split('/').pop()}
                  </span>
                  <span className="text-muted-foreground ml-auto shrink-0 truncate text-xs">
                    {path}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
