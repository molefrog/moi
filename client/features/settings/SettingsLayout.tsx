import type { ReactNode } from 'react'

type SettingsPageProps = {
  title: string
  description?: string
  children: ReactNode
}

export function SettingsPage({ title, description, children }: SettingsPageProps) {
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

export function SettingsSection({ label, children }: SettingsSectionProps) {
  return (
    <section className="flex flex-col gap-2">
      {label && <p className="px-0.5 text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex flex-col divide-y divide-dashed divide-border overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
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

export function SettingsRow({ title, description, control }: SettingsRowProps) {
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
