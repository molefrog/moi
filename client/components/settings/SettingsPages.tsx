import { type ReactNode, useState } from 'react'

import { IconAppWindow, IconArtboard, IconPlus, IconTrash } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Switch } from '@/client/components/ui/switch'
import { useWorkspaceLayoutCtx } from '@/client/lib/WorkspaceLayoutContext'
import { cn } from '@/client/lib/cn'

// ── Shared page primitives ──────────────────────────────────────────────────

type SettingsPageProps = {
  title: string
  description?: string
  children: ReactNode
}

function SettingsPage({ title, description, children }: SettingsPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      {children}
    </div>
  )
}

type SettingsSectionProps = {
  label?: string
  children: ReactNode
}

function SettingsSection({ label, children }: SettingsSectionProps) {
  return (
    <section className="flex flex-col gap-2">
      {label && <p className="px-0.5 text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex flex-col divide-y divide-dashed divide-border overflow-hidden rounded-lg border border-border bg-card">
        {children}
      </div>
    </section>
  )
}

type SettingsRowProps = {
  icon?: ReactNode
  title: string
  description?: string
  control?: ReactNode
}

function SettingsRow({ icon, title, description, control }: SettingsRowProps) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      {icon && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-[18px]">
          {icon}
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{title}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </div>
      {control && <div className="ml-auto flex shrink-0 items-center pl-3">{control}</div>}
    </div>
  )
}

// ── General ─────────────────────────────────────────────────────────────────

const ICON_OPTIONS = ['🗂️', '🚀', '🧪', '💼', '🎨', '🤖', '📊', '🧩']

export function GeneralSettings() {
  const { name } = useWorkspaceLayoutCtx()
  const [wsName, setWsName] = useState(name ?? '')
  const [icon, setIcon] = useState(ICON_OPTIONS[0])

  return (
    <SettingsPage title="General" description="Basic details for this workspace.">
      <SettingsSection>
        <SettingsRow
          title="Name"
          description="Shown in the sidebar and the workspace header."
          control={
            <Input
              value={wsName}
              onChange={e => setWsName(e.target.value)}
              placeholder="Workspace name"
              className="w-52"
            />
          }
        />
        <div className="flex flex-col gap-2.5 px-3.5 py-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Icon</span>
            <span className="text-xs text-muted-foreground">Pick an icon for this workspace.</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ICON_OPTIONS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={cn(
                  'flex size-9 items-center justify-center rounded-md text-lg transition-colors',
                  emoji === icon ? 'bg-primary/5 ring-2 ring-primary' : 'hover:bg-muted'
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </SettingsSection>
    </SettingsPage>
  )
}

// ── Environment ─────────────────────────────────────────────────────────────

type EnvVar = { id: string; key: string; scope: 'both' | 'agent' | 'widgets' }

const DEMO_ENV: EnvVar[] = [
  { id: '1', key: 'ELEVENLABS_VOICE_ID', scope: 'both' },
  { id: '2', key: 'NOTION_TOKEN', scope: 'agent' },
  { id: '3', key: 'OPENAI_API_KEY', scope: 'widgets' }
]

export function EnvironmentSettings() {
  const [vars, setVars] = useState<EnvVar[]>(DEMO_ENV)
  const [draftKey, setDraftKey] = useState('')
  const [draftValue, setDraftValue] = useState('')
  const [inherit, setInherit] = useState(true)

  const addVar = () => {
    const key = draftKey.trim()
    if (!key) return
    setVars([...vars, { id: crypto.randomUUID(), key, scope: 'both' }])
    setDraftKey('')
    setDraftValue('')
  }

  return (
    <SettingsPage
      title="Environment"
      description="Secrets injected into widgets and the agent at run time. UI only — nothing is saved."
    >
      <SettingsSection label="Variables">
        {vars.map(v => (
          <div key={v.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
              {v.key}
            </code>
            <span className="text-xs tracking-widest text-muted-foreground/70 select-none">
              ••••••
            </span>
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {v.scope}
            </span>
            <button
              type="button"
              onClick={() => setVars(vars.filter(x => x.id !== v.id))}
              aria-label={`Delete ${v.key}`}
              className="text-muted-foreground/50 transition-colors hover:text-foreground [&_svg]:size-4"
            >
              <IconTrash stroke={1.5} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <Input
            value={draftKey}
            onChange={e => setDraftKey(e.target.value)}
            placeholder="NEW_KEY"
            className="h-7 flex-1 font-mono text-xs"
          />
          <Input
            value={draftValue}
            onChange={e => setDraftValue(e.target.value)}
            type="password"
            placeholder="value"
            className="h-7 flex-1 text-xs"
          />
          <Button variant="outline" size="sm" className="h-7" onClick={addVar}>
            <IconPlus stroke={1.75} />
            Add
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection label="From .env files">
        <SettingsRow
          title="Inherit .env files"
          description="Discovered 5 keys across .env and .env.local in this workspace."
          control={<Switch checked={inherit} onCheckedChange={setInherit} />}
        />
      </SettingsSection>
    </SettingsPage>
  )
}

// ── Features ────────────────────────────────────────────────────────────────

export function FeaturesSettings() {
  const [scratchpad, setScratchpad] = useState(true)
  const [customViews, setCustomViews] = useState(true)

  return (
    <SettingsPage title="Features" description="Turn workspace capabilities on or off.">
      <SettingsSection label="Workspace tabs">
        <SettingsRow
          icon={<IconArtboard stroke={1.75} />}
          title="Scratchpad"
          description="Show the Scratchpad tab in the workspace nav."
          control={<Switch checked={scratchpad} onCheckedChange={setScratchpad} />}
        />
        <SettingsRow
          icon={<IconAppWindow stroke={1.75} />}
          title="Custom views"
          description="Show agent-defined view tabs after Scratchpad."
          control={<Switch checked={customViews} onCheckedChange={setCustomViews} />}
        />
      </SettingsSection>
    </SettingsPage>
  )
}
