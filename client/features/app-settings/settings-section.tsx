import { useId } from 'react'
import type { ReactNode } from 'react'

type SettingsSectionProps = {
  title: string
  description?: ReactNode
  children: ReactNode
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="-mx-6 flex min-w-0 flex-col rounded-2xl bg-background p-6 shadow-xs"
    >
      <header className="mb-6 flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-medium">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </section>
  )
}
