import { Link } from 'wouter'

import { DevCollabIdentity } from './DevCollabIdentity'
import { DevCollabKit } from './DevCollabKit'

export function DevCollabPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
      <div>
        <Link href="/dev" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dev pages
        </Link>
        <header className="mt-5">
          <h1 className="text-xl font-medium">Collab</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Try collaboration components and hooks, and set up a local identity for workspace
            testing.
          </p>
        </header>
      </div>
      <DevCollabIdentity />
      <DevCollabKit />
    </main>
  )
}
