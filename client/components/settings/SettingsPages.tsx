import { type ReactNode, useState } from 'react'

import { IconChevronDown, IconLoader2, IconPlus, IconTrash } from '@tabler/icons-react'

import { useUpdateEnv, useSaveWorkspaceName, useWorkspaceEnv } from '@/client/api/workspaces'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/client/components/ui/dropdown-menu'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Switch } from '@/client/components/ui/switch'
import { useWorkspaceLayoutCtx } from '@/client/lib/WorkspaceLayoutContext'
import { cn } from '@/client/lib/cn'
import type { EnvScope, WorkspaceEnvVar } from '@/lib/types'

import { IconPicker } from './IconPicker'

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
  title: string
  description?: string
  control?: ReactNode
}

function SettingsRow({ title, description, control }: SettingsRowProps) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{title}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </div>
      {control && <div className="ml-auto flex shrink-0 items-center pl-3">{control}</div>}
    </div>
  )
}

// ── General ─────────────────────────────────────────────────────────────────

export function GeneralSettings() {
  const { name, icon, workspaceId } = useWorkspaceLayoutCtx()
  const saveName = useSaveWorkspaceName(workspaceId)
  const [draft, setDraft] = useState(name ?? '')

  // Persist on blur (or Enter): an empty value clears the override so the name
  // falls back to the folder name.
  const commit = () => {
    const next = draft.trim()
    if (next === (name ?? '')) return
    saveName.mutate(next === '' ? null : next)
  }

  return (
    <SettingsPage title="General" description="Basic details for this workspace.">
      <SettingsSection>
        <SettingsRow
          title="Name"
          description="Shown in the sidebar and the workspace header."
          control={
            <Input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              placeholder="Workspace name"
              className="w-56"
            />
          }
        />
        <div className="px-3.5 py-3.5">
          <IconPicker icon={icon} />
        </div>
      </SettingsSection>
    </SettingsPage>
  )
}

// ── Environment ─────────────────────────────────────────────────────────────

const SCOPE_LABEL: Record<EnvScope, string> = {
  widgets: 'Widgets',
  agent: 'Agent',
  both: 'Both'
}

// Source badge copy: where the key actually comes from.
const SOURCE_LABEL: Record<WorkspaceEnvVar['source'], string> = {
  dotenv: '.env',
  custom: 'secret',
  both: 'override'
}

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

type ScopeSelectProps = {
  value: EnvScope
  onChange: (scope: EnvScope) => void
}

function ScopeSelect({ value, onChange }: ScopeSelectProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 font-normal">
            {SCOPE_LABEL[value]}
            <IconChevronDown stroke={1.75} className="text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuRadioGroup value={value} onValueChange={v => onChange(v as EnvScope)}>
          {(Object.keys(SCOPE_LABEL) as EnvScope[]).map(scope => (
            <DropdownMenuRadioItem key={scope} value={scope}>
              {SCOPE_LABEL[scope]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function EnvironmentSettings() {
  const { workspaceId } = useWorkspaceLayoutCtx()
  const env = useWorkspaceEnv(workspaceId)
  const update = useUpdateEnv(workspaceId)

  const [draftKey, setDraftKey] = useState('')
  const [draftValue, setDraftValue] = useState('')
  const [draftScope, setDraftScope] = useState<EnvScope>('both')

  const keyValid = ENV_KEY_RE.test(draftKey)
  const canAdd = keyValid && draftValue.length > 0 && !update.isPending

  const addVar = () => {
    if (!canAdd) return
    update.mutate(
      { set: { [draftKey]: draftValue }, scopes: { [draftKey]: draftScope } },
      {
        onSuccess: () => {
          setDraftKey('')
          setDraftValue('')
          setDraftScope('both')
        }
      }
    )
  }

  const vars = env.data?.vars ?? []
  const fileCount = env.data?.files.reduce((n, f) => n + f.count, 0) ?? 0
  const dotenvFiles = env.data?.files.length ?? 0

  return (
    <SettingsPage
      title="Environment"
      description="Secrets injected into widgets and the agent at run time. Values are write-only — they're never shown again once saved."
    >
      <SettingsSection label="Variables">
        {env.isLoading ? (
          <div className="flex items-center justify-center px-3.5 py-6 text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" stroke={1.75} />
          </div>
        ) : vars.length === 0 ? (
          <p className="px-3.5 py-4 text-sm text-muted-foreground">No variables yet.</p>
        ) : (
          vars.map(v => {
            const editable = v.source !== 'dotenv'
            return (
              <div key={v.key} className="flex items-center gap-3 px-3.5 py-2.5">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                  {v.key}
                </code>
                <span className="text-xs tracking-widest text-muted-foreground/60 select-none">
                  ••••••
                </span>
                <span
                  className={cn(
                    'rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
                    v.source === 'dotenv'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {SOURCE_LABEL[v.source]}
                </span>
                {editable ? (
                  <ScopeSelect
                    value={v.scope ?? 'both'}
                    onChange={scope => update.mutate({ scopes: { [v.key]: scope } })}
                  />
                ) : (
                  <span className="w-[60px] text-right text-[11px] text-muted-foreground/60">
                    from file
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => update.mutate({ remove: [v.key] })}
                  disabled={!editable}
                  aria-label={`Delete ${v.key}`}
                  className="text-muted-foreground/50 transition-colors not-disabled:hover:text-foreground disabled:invisible [&_svg]:size-4"
                >
                  <IconTrash stroke={1.5} />
                </button>
              </div>
            )
          })
        )}

        {/* Add row */}
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <Input
            value={draftKey}
            onChange={e => setDraftKey(e.target.value)}
            placeholder="NEW_KEY"
            aria-invalid={draftKey.length > 0 && !keyValid}
            className="h-7 w-40 font-mono text-xs"
          />
          <Input
            value={draftValue}
            onChange={e => setDraftValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addVar()
            }}
            type="password"
            placeholder="value"
            className="h-7 flex-1 text-xs"
          />
          <ScopeSelect value={draftScope} onChange={setDraftScope} />
          <Button variant="outline" size="sm" className="h-7" onClick={addVar} disabled={!canAdd}>
            {update.isPending ? (
              <IconLoader2 className="animate-spin" />
            ) : (
              <IconPlus stroke={1.75} />
            )}
            Add
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection label="From .env files">
        <SettingsRow
          title="Inherit .env files"
          description={
            dotenvFiles > 0
              ? `Discovered ${fileCount} ${fileCount === 1 ? 'key' : 'keys'} across ${dotenvFiles} ${dotenvFiles === 1 ? 'file' : 'files'} in this workspace.`
              : 'No .env files found in this workspace.'
          }
          control={
            <Switch
              checked={env.data?.inheritDotenv ?? true}
              disabled={env.isLoading}
              onCheckedChange={checked => update.mutate({ inheritDotenv: checked })}
            />
          }
        />
      </SettingsSection>
    </SettingsPage>
  )
}
