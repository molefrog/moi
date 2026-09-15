import { useEffect, useMemo, useState } from 'react'

import { IconArrowsShuffle } from '@tabler/icons-react'
import { Link } from 'wouter'

import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'

import { PERSONA_COLORS, createDevIdentity, personaIdentity, randomPersona } from './dev-persona'
import type { Persona } from './dev-persona'
import { getIdentity, installIdentityApi, setDevIdentity } from './identity'

installIdentityApi()

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function DevCollabPage() {
  // Visiting this setup page opts the tab into identity. Later edits keep the
  // same id, so peers keep seeing one participant.
  const [current] = useState(() => getIdentity() ?? createDevIdentity())
  const [persona, setPersona] = useState<Persona>({ name: current.name, color: current.color })
  const name = persona.name.trim()
  const identity = useMemo(
    () => (name ? personaIdentity(current.id, { name, color: persona.color }) : null),
    [current.id, name, persona.color]
  )

  useEffect(() => {
    if (identity) setDevIdentity(identity)
  }, [identity])

  const avatar = identity?.avatar
  return (
    <main className="mx-auto w-full max-w-lg px-6 py-10">
      <Link href="/dev" className="text-sm text-muted-foreground hover:text-foreground">
        ← Dev pages
      </Link>
      <header className="mt-5">
        <h1 className="text-xl font-medium">Collab identity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up who this browser tab is. To test with two people, open this page in a second tab
          and set up another identity.
        </p>
      </header>
      <div className="mt-8 flex items-start gap-6">
        {avatar ? (
          <img src={avatar} alt="" className="size-24 shrink-0 rounded-full" />
        ) : (
          <div className="size-24 shrink-0 rounded-full bg-muted" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            Name
            <Input
              value={persona.name}
              maxLength={80}
              placeholder="Type a name"
              autoComplete="off"
              spellCheck={false}
              onChange={event => setPersona({ ...persona, name: event.target.value })}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span id="collab-color-label">Color</span>
            <div
              role="radiogroup"
              aria-labelledby="collab-color-label"
              className="flex flex-wrap gap-2"
            >
              {PERSONA_COLORS.map(([label, hex]) => (
                <label key={hex} className="cursor-pointer">
                  <input
                    type="radio"
                    name="color"
                    value={hex}
                    aria-label={label}
                    checked={persona.color === hex}
                    onChange={() => setPersona({ ...persona, color: hex })}
                    className="peer sr-only"
                  />
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="size-6 rounded-full ring-foreground ring-offset-2 ring-offset-background transition-shadow peer-checked:ring-2 peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                  >
                    <circle cx="12" cy="12" r="12" fill={hex} />
                  </svg>
                </label>
              ))}
            </div>
          </div>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPersona(value => randomPersona(value))}
            >
              <IconArrowsShuffle stroke={1.75} />
              Randomize
            </Button>
          </div>
        </div>
      </div>
      <p className="mt-8 text-xs text-muted-foreground">
        Kept in this tab’s session storage as {current.id}
        {avatar && ` with a ${formatKb(avatar.length)} PNG avatar`}. Start moi with{' '}
        <code className="font-mono">--experimental-collab</code> to connect.
      </p>
    </main>
  )
}
