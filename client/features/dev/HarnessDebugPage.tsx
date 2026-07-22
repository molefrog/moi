import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { IconCheck, IconCopy } from '@tabler/icons-react'
import { useSearchParams } from 'wouter'

import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'
import { wsUrl } from '@/client/lib/ws-url'
import type { Model, WorkspaceEntry, WorkspaceModels } from '@/lib/types'

// Scratch route for driving any harness end to end: pick a workspace, fire
// canned scenarios (or your own prompt), and watch three synchronized logs —
// the backend's native wire (Codex: app-server JSON-RPC; Claude Code: raw SDK
// messages), the frames the server pushes to chat clients, and the durable
// events REST replay. See server/harness/README.md.

type WireFrame = { seq: number; ts: number; dir: 'send' | 'recv'; frame: unknown }
type BroadcastFrame = { seq: number; ts: number; frame: unknown }
type ProcessInfo = { running: boolean; pid?: number; binary: string | null }

type DebugPayload = {
  provider: string
  process: ProcessInfo | null
  wire: WireFrame[]
  broadcasts: BroadcastFrame[]
}

const SCENARIOS: { label: string; prompt: string }[] = [
  {
    label: 'Trivial',
    prompt: 'Reply with exactly: pong'
  },
  {
    label: 'Reasoning',
    prompt:
      'Think carefully: a farmer has 17 sheep, all but 9 run away, then he buys twice as many as remain. How many sheep now? Reason it out before answering.'
  },
  {
    label: 'Command',
    prompt: 'Run `ls -la` and summarize what you see in one sentence.'
  },
  {
    label: 'File edit',
    prompt: 'Create or overwrite scratch.txt with three random words, one per line.'
  },
  {
    label: 'Plan',
    prompt:
      'Make a 3-step plan (use your plan tool) for adding a README to this folder, then execute it.'
  },
  {
    label: 'Subagent',
    prompt:
      'Spawn a subagent (collab/agent tool) to count the files in this directory and report back its answer.'
  },
  {
    label: 'Web search',
    prompt: 'Search the web for the current Bun version and tell me what you find.'
  },
  {
    label: 'Slow (interrupt me)',
    prompt: 'Run this exact command: sleep 30 && echo done. Nothing else.'
  }
]

function shortJson(value: unknown, max = 110): string {
  const s = JSON.stringify(value)
  if (!s) return ''
  return s.length > max ? s.slice(0, max) + '…' : s
}

function frameLabel(frame: unknown): string {
  const f = frame as Record<string, unknown>
  if (typeof f?.method === 'string') {
    return 'id' in f ? `${f.method} #${f.id}` : f.method
  }
  if ('id' in (f ?? {})) return `response #${f.id}`
  if (typeof f?.kind === 'string') return `${f.kind}`
  if (typeof f?.type === 'string') return `${f.type}`
  return '?'
}

function ts(t: number): string {
  return (
    new Date(t).toLocaleTimeString('en-GB', { hour12: false }) +
    '.' +
    String(t % 1000).padStart(3, '0')
  )
}

type LogRowProps = {
  time: number
  badge: string
  badgeClass: string
  label: string
  body: unknown
}

function LogRow({ time, badge, badgeClass, label, body }: LogRowProps) {
  return (
    <details className="group border-b border-border/40 px-2 py-1 text-[11px] leading-tight">
      <summary className="flex cursor-pointer items-baseline gap-2 font-mono whitespace-nowrap">
        <span className="text-muted-foreground/60 tabular-nums">{ts(time)}</span>
        <span className={cn('rounded px-1 font-semibold', badgeClass)}>{badge}</span>
        <span className="shrink-0 font-semibold">{label}</span>
        <span className="truncate text-muted-foreground">{shortJson(body)}</span>
      </summary>
      <pre className="mt-1 max-h-80 overflow-auto rounded bg-muted p-2 text-[10px] whitespace-pre-wrap">
        {JSON.stringify(body, null, 2)}
      </pre>
    </details>
  )
}

type PaneProps = {
  title: React.ReactNode
  hint?: string
  // Extra header widgets (e.g. a filter input), rendered before the follow toggle.
  controls?: React.ReactNode
  onCopy?: () => void
  onClear?: () => void
  children: React.ReactNode
}

function Pane({ title, hint, controls, onCopy, onClear, children }: PaneProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    onCopy?.()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [onCopy])
  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  })
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1">
        {typeof title === 'string' ? <span className="text-xs font-semibold">{title}</span> : title}
        {hint && <span className="truncate text-[10px] text-muted-foreground">{hint}</span>}
        <span className="grow" />
        {controls}
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} />
          follow
        </label>
        {onCopy && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            aria-label="Copy log"
            title="Copy log"
          >
            {copied ? (
              <IconCheck stroke={1.75} className="text-muted-foreground" />
            ) : (
              <IconCopy stroke={1.75} />
            )}
          </Button>
        )}
        {onClear && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

export function HarnessDebugPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([])
  // Seeded from ?workspace= so the selection survives reloads / can be shared.
  const [workspaceId, setWorkspaceId] = useState(() => searchParams.get('workspace') ?? '')
  const [models, setModels] = useState<Model[]>([])
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState('')
  const [stream, setStream] = useState(true)
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID())
  const [isNew, setIsNew] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [proc, setProc] = useState<ProcessInfo | null>(null)
  const [wire, setWire] = useState<WireFrame[]>([])
  const [clientFrames, setClientFrames] = useState<BroadcastFrame[]>([])
  const [events, setEvents] = useState<unknown[] | null>(null)
  const [hidePreviews, setHidePreviews] = useState(false)
  const [rightTab, setRightTab] = useState<'frames' | 'events'>('frames')
  // Split position of the wire pane, as % of the row. Wire frames are the
  // denser log, so it gets more room by default; the handle between the panes
  // drags it between 20% and 80%.
  const [leftPct, setLeftPct] = useState(60)
  const rowRef = useRef<HTMLDivElement>(null)

  const wireCursor = useRef(0)
  const wsRef = useRef<WebSocket | null>(null)
  const localSeq = useRef(0)
  const sessionRef = useRef(sessionId)
  sessionRef.current = sessionId

  // Every workspace is drivable — the panes adapt to its harness type.
  useEffect(() => {
    fetch('/api/workspaces')
      .then(r => r.json())
      .then((list: WorkspaceEntry[]) => {
        setWorkspaces(list)
        // Keep the URL-seeded id only if it's a real workspace.
        setWorkspaceId(id => (id && list.some(w => w.id === id) ? id : (list[0]?.id ?? '')))
      })
      .catch(() => {})
  }, [])

  const selectWorkspace = useCallback(
    (id: string) => {
      setWorkspaceId(id)
      setSearchParams(
        prev => {
          prev.set('workspace', id)
          return prev
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const provider = workspaces.find(w => w.id === workspaceId)?.type ?? 'claude-code'

  // Model list for the selected workspace.
  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/workspaces/${workspaceId}/models`)
      .then(r => r.json())
      .then((m: WorkspaceModels) => setModels(m.models))
      .catch(() => setModels([]))
  }, [workspaceId])

  // Switching workspace targets a different harness — the old thread id is
  // meaningless there (a codex resume of a Claude session id just errors),
  // so start a fresh thread.
  useEffect(() => {
    setSessionId(crypto.randomUUID())
    setIsNew(true)
    setEvents(null)
  }, [workspaceId])

  // Poll the wire tap (the backend's native frames) once a second.
  useEffect(() => {
    if (!workspaceId) return
    wireCursor.current = 0
    setWire([])
    const timer = setInterval(async () => {
      try {
        const r = await fetch(
          `/api/workspaces/${workspaceId}/harness/debug?sinceWire=${wireCursor.current}&sinceBroadcast=-1`
        )
        if (!r.ok) return
        const d = (await r.json()) as DebugPayload
        setProc(d.process)
        if (d.wire.length) {
          wireCursor.current = d.wire[d.wire.length - 1].seq
          setWire(prev => [...prev, ...d.wire].slice(-1000))
        }
      } catch {}
    }, 1000)
    return () => clearInterval(timer)
  }, [workspaceId])

  // Live client frames: our own chat socket, same protocol as the real UI.
  useEffect(() => {
    if (!workspaceId) return
    const sock = new WebSocket(wsUrl('/ws'))
    wsRef.current = sock
    sock.onmessage = e => {
      try {
        const frame = JSON.parse(String(e.data)) as Record<string, unknown>
        if (frame.workspaceId && frame.workspaceId !== workspaceId) return
        if (frame.type === 'session_renamed' && frame.from === sessionRef.current) {
          setSessionId(frame.to as string)
          setIsNew(false)
        }
        setClientFrames(prev =>
          [...prev, { seq: ++localSeq.current, ts: Date.now(), frame }].slice(-1000)
        )
      } catch {}
    }
    return () => {
      wsRef.current = null
      sock.close()
    }
  }, [workspaceId])

  const send = useCallback(
    (content: string) => {
      if (!content.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      wsRef.current.send(
        JSON.stringify({
          type: 'chat',
          workspaceId,
          sessionId: sessionRef.current,
          isNew,
          content,
          optimisticId: crypto.randomUUID(),
          ...(model ? { model } : {}),
          ...(effort ? { effort } : {}),
          stream
        })
      )
      setIsNew(false)
    },
    [workspaceId, isNew, model, effort, stream]
  )

  const stop = useCallback(() => {
    wsRef.current?.send(
      JSON.stringify({ type: 'stop', workspaceId, sessionId: sessionRef.current })
    )
  }, [workspaceId])

  const newThread = useCallback(() => {
    setSessionId(crypto.randomUUID())
    setIsNew(true)
    setEvents(null)
  }, [])

  const fetchEvents = useCallback(async () => {
    const r = await fetch(`/api/workspaces/${workspaceId}/sessions/${sessionRef.current}/events`)
    setEvents(r.ok ? ((await r.json()) as unknown[]) : [])
  }, [workspaceId])

  const effortLevels = useMemo(
    () => models.find(m => m.value === model)?.supportedEffortLevels ?? [],
    [models, model]
  )

  const [wireFilter, setWireFilter] = useState('')
  const visibleWire = useMemo(() => {
    const q = wireFilter.trim().toLowerCase()
    return q ? wire.filter(f => frameLabel(f.frame).toLowerCase().includes(q)) : wire
  }, [wire, wireFilter])

  const visibleClientFrames = useMemo(
    () =>
      hidePreviews
        ? clientFrames.filter(f => (f.frame as { type?: string }).type !== 'preview')
        : clientFrames,
    [clientFrames, hidePreviews]
  )

  // Copy the displayed frames (respecting any active filter) as timestamped
  // JSONL — the same shape the panes render, so a paste reads like the
  // on-screen log.
  const copyWire = useCallback(() => {
    navigator.clipboard.writeText(
      visibleWire
        .map(f => `${ts(f.ts)} ${f.dir === 'send' ? '→' : '←'} ${JSON.stringify(f.frame)}`)
        .join('\n')
    )
  }, [visibleWire])
  const copyRight = useCallback(() => {
    navigator.clipboard.writeText(
      rightTab === 'frames'
        ? visibleClientFrames.map(f => `${ts(f.ts)} ws ${JSON.stringify(f.frame)}`).join('\n')
        : JSON.stringify(events ?? [], null, 2)
    )
  }, [rightTab, visibleClientFrames, events])

  return (
    <div className="flex h-dvh flex-col gap-2 bg-muted p-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
        <span className="font-semibold tracking-widest text-muted-foreground uppercase">
          Harness debug
        </span>
        <select
          className="rounded border border-border bg-background px-1 py-0.5"
          value={workspaceId}
          onChange={e => selectWorkspace(e.target.value)}
        >
          {workspaces.length === 0 && <option value="">no workspaces</option>}
          {workspaces.map(w => (
            <option key={w.id} value={w.id}>
              {`${w.name ?? w.displayPath ?? w.path} · ${w.type ?? 'claude-code'}`}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-border bg-background px-1 py-0.5"
          value={model}
          onChange={e => setModel(e.target.value)}
        >
          <option value="">default model</option>
          {models.map(m => (
            <option key={m.value} value={m.value}>
              {m.displayName}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-border bg-background px-1 py-0.5"
          value={effort}
          onChange={e => setEffort(e.target.value)}
        >
          <option value="">default effort</option>
          {effortLevels.map(l => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={stream} onChange={e => setStream(e.target.checked)} />
          stream
        </label>
        <span className="grow" />
        {provider === 'codex' && (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 font-mono text-[10px]',
              proc?.running ? 'bg-green-500/15 text-green-600' : 'bg-muted text-muted-foreground'
            )}
          >
            {proc?.running ? `app-server pid ${proc.pid}` : 'app-server not running'}
          </span>
        )}
        <span className="max-w-56 truncate font-mono text-[10px] text-muted-foreground">
          thread {sessionId}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={newThread}>
          New thread
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={stop}>
          Stop
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5">
        {SCENARIOS.map(s => (
          <Button
            key={s.label}
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => send(s.prompt)}
          >
            {s.label}
          </Button>
        ))}
        <input
          className="min-w-48 grow rounded border border-border bg-background px-2 py-1 text-xs"
          placeholder="or type a custom prompt and hit Enter…"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              send(prompt)
              setPrompt('')
            }
          }}
        />
      </div>

      <div ref={rowRef} className="flex min-h-0 flex-1 gap-1">
        {/* Dynamic drag geometry can't be a static Tailwind class */}
        <div className="flex min-w-0" style={{ width: `${leftPct}%` }}>
          <Pane
            title={provider === 'codex' ? 'App-server wire' : 'Harness wire'}
            hint={
              provider === 'codex'
                ? 'raw JSON-RPC, both directions'
                : provider === 'openclaw'
                  ? 'no wire tap for OpenClaw yet'
                  : 'raw Agent SDK messages + enqueued inputs'
            }
            controls={
              <input
                className="w-36 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]"
                placeholder="filter types…"
                value={wireFilter}
                onChange={e => setWireFilter(e.target.value)}
              />
            }
            onCopy={copyWire}
            onClear={() => setWire([])}
          >
            {visibleWire.map(f => (
              <LogRow
                key={f.seq}
                time={f.ts}
                badge={f.dir === 'send' ? '→' : '←'}
                badgeClass={
                  f.dir === 'send'
                    ? 'bg-blue-500/15 text-blue-600'
                    : 'bg-amber-500/15 text-amber-600'
                }
                label={frameLabel(f.frame)}
                body={f.frame}
              />
            ))}
          </Pane>
        </div>

        <div
          className="w-1.5 shrink-0 cursor-col-resize touch-none rounded-full hover:bg-border active:bg-border"
          onPointerDown={e => {
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={e => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId) || !rowRef.current) return
            const rect = rowRef.current.getBoundingClientRect()
            const pct = ((e.clientX - rect.left) / rect.width) * 100
            setLeftPct(Math.min(80, Math.max(20, pct)))
          }}
        />

        <Pane
          title={
            <span className="flex items-center gap-1">
              <button
                type="button"
                className={cn(
                  'rounded px-1.5 py-0.5 text-xs',
                  rightTab === 'frames' ? 'bg-muted font-medium' : 'text-muted-foreground'
                )}
                onClick={() => setRightTab('frames')}
              >
                Client frames
              </button>
              <button
                type="button"
                className={cn(
                  'rounded px-1.5 py-0.5 text-xs',
                  rightTab === 'events' ? 'bg-muted font-medium' : 'text-muted-foreground'
                )}
                onClick={() => setRightTab('events')}
              >
                Durable events
              </button>
            </span>
          }
          hint={
            rightTab === 'frames'
              ? 'what the browser receives on /ws'
              : 'GET /sessions/:id/events replay'
          }
          onCopy={copyRight}
          onClear={rightTab === 'frames' ? () => setClientFrames([]) : undefined}
        >
          {rightTab === 'frames' ? (
            <>
              <div className="border-b border-border/40 px-2 py-1">
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={hidePreviews}
                    onChange={e => setHidePreviews(e.target.checked)}
                  />
                  hide preview frames
                </label>
              </div>
              {visibleClientFrames.map(f => (
                <LogRow
                  key={f.seq}
                  time={f.ts}
                  badge="ws"
                  badgeClass="bg-purple-500/15 text-purple-600"
                  label={frameLabel(f.frame)}
                  body={f.frame}
                />
              ))}
            </>
          ) : (
            <>
              <div className="border-b border-border/40 px-2 py-1">
                <Button type="button" size="sm" variant="secondary" onClick={fetchEvents}>
                  Fetch events
                </Button>
              </div>
              {events?.map((ev, i) => (
                <LogRow
                  key={i}
                  time={Date.now()}
                  badge="ev"
                  badgeClass="bg-teal-500/15 text-teal-600"
                  label={frameLabel(ev)}
                  body={ev}
                />
              ))}
              {events?.length === 0 && (
                <div className="p-2 text-[11px] text-muted-foreground">no events</div>
              )}
            </>
          )}
        </Pane>
      </div>
    </div>
  )
}
