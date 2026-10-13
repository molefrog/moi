import type { ReactNode } from 'react'

type OnboardingLayoutProps = {
  title: string
  description?: string
  children: ReactNode
}

export function OnboardingLayout({ title, description, children }: OnboardingLayoutProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <section aria-labelledby="setup-title" className="flex w-full max-w-md flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 id="setup-title" className="text-xl font-medium">
            {title}
          </h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </header>
        {children}
      </section>
    </main>
  )
}
