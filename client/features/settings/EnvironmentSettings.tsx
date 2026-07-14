import { useState } from 'react'

import { IconLoader2, IconPlus, IconTrash } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Switch } from '@/client/components/ui/switch'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { cn } from '@/client/lib/cn'
import type { WorkspaceEnvVar } from '@/lib/types'

import { SettingsPage, SettingsRow, SettingsSection } from './SettingsLayout'
import { useEnvVars } from './useEnvVars'

const SOURCE_LABEL: Record<WorkspaceEnvVar['source'], string> = {
  dotenv: '.env',
  custom: 'secret',
  both: 'override'
}

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function EnvironmentSettings() {
  const { workspaceId } = useWorkspaceLayoutCtx()
  const { env, update } = useEnvVars(workspaceId)
  const [draftKey, setDraftKey] = useState('')
  const [draftValue, setDraftValue] = useState('')

  const keyValid = ENV_KEY_RE.test(draftKey)
  const canAdd = keyValid && draftValue.length > 0 && !update.isPending

  const addVariable = () => {
    if (!canAdd) return
    update.mutate(
      { set: { [draftKey]: draftValue } },
      {
        onSuccess: () => {
          setDraftKey('')
          setDraftValue('')
        }
      }
    )
  }

  const variables = env.data?.vars ?? []
  const fileCount = env.data?.files.reduce((count, file) => count + file.count, 0) ?? 0
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
        ) : variables.length === 0 ? (
          <p className="px-3.5 py-4 text-sm text-muted-foreground">No variables yet.</p>
        ) : (
          variables.map(variable => {
            const editable = variable.source !== 'dotenv'
            return (
              <div key={variable.key} className="flex items-center gap-3 px-3.5 py-2.5">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                  {variable.key}
                </code>
                <span className="text-xs tracking-widest text-muted-foreground/60 select-none">
                  ••••••
                </span>
                <span
                  className={cn(
                    'rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
                    variable.source === 'dotenv'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {SOURCE_LABEL[variable.source]}
                </span>
                {!editable && (
                  <span className="text-right text-[11px] text-muted-foreground/60">from file</span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => update.mutate({ remove: [variable.key] })}
                  disabled={!editable}
                  aria-label={`Delete ${variable.key}`}
                  className="disabled:invisible"
                >
                  <IconTrash stroke={1.75} />
                </Button>
              </div>
            )
          })
        )}

        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <Input
            value={draftKey}
            onChange={event => setDraftKey(event.target.value)}
            placeholder="NEW_KEY"
            aria-invalid={draftKey.length > 0 && !keyValid}
            className="h-7 w-40 font-mono text-xs"
          />
          <Input
            value={draftValue}
            onChange={event => setDraftValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') addVariable()
            }}
            type="password"
            placeholder="value"
            className="h-7 flex-1 text-xs"
          />
          <Button variant="outline" size="sm" onClick={addVariable} disabled={!canAdd}>
            {update.isPending ? (
              <IconLoader2 stroke={1.75} className="animate-spin" />
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
              ? `Discovered ${fileCount} ${fileCount === 1 ? 'key' : 'keys'} across ${dotenvFiles} ${dotenvFiles === 1 ? 'file' : 'files'} in this space.`
              : 'No .env files found in this space.'
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
