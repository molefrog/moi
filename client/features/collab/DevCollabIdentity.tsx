import { useMemo, useState, useSyncExternalStore } from 'react'

import { IconArrowsShuffle } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import type { CollabIdentity } from '@/lib/collab/types'

import { PERSONA_COLORS, createDevIdentity, personaIdentity, randomPersona } from './dev-persona'
import type { Persona } from './dev-persona'
import { getIdentity, getIdentitySource, setDevIdentity, subscribeIdentityStore } from './identity'

export function DevCollabIdentity() {
  const source = useSyncExternalStore(subscribeIdentityStore, getIdentitySource, getIdentitySource)
  const identity = useSyncExternalStore(subscribeIdentityStore, getIdentity, getIdentity)
  if (source === 'external') return null
  return <DevIdentityForm key={identity?.id ?? 'setup'} savedIdentity={identity} />
}

type DevIdentityFormProps = { savedIdentity: CollabIdentity | null }

function DevIdentityForm({ savedIdentity }: DevIdentityFormProps) {
  const [initial] = useState(() => savedIdentity ?? createDevIdentity())
  const [persona, setPersona] = useState<Persona>({ name: initial.name, color: initial.color })
  const name = persona.name.trim()
  const identity = useMemo(
    () => (name ? personaIdentity(initial.id, { name, color: persona.color }) : null),
    [initial.id, name, persona.color]
  )
  const changed = name !== savedIdentity?.name || persona.color !== savedIdentity?.color

  return (
    <section aria-labelledby="dev-identity-title" className="flex flex-col gap-5">
      <header>
        <h2 id="dev-identity-title" className="text-base font-medium">
          Dev identity
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use a local profile in real workspaces. To test with two people, set up another profile in
          a second browser tab.
        </p>
      </header>
      <form
        className="flex flex-col gap-5"
        onSubmit={event => {
          event.preventDefault()
          if (identity) setDevIdentity(identity)
        }}
      >
        <div className="flex flex-col items-start gap-5 sm:flex-row">
          {identity?.avatar ? (
            <img
              src={identity.avatar}
              alt="Identity preview"
              className="size-16 shrink-0 rounded-full"
            />
          ) : (
            <div aria-hidden="true" className="size-16 shrink-0 rounded-full bg-muted" />
          )}
          <div className="flex w-full max-w-sm min-w-0 flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              Name
              <Input
                value={persona.name}
                maxLength={80}
                required
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
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!identity || !changed}>
                {savedIdentity ? 'Save identity' : 'Use dev identity'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPersona(randomPersona(persona))}
              >
                <IconArrowsShuffle stroke={1.75} />
                Randomize
              </Button>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {savedIdentity
            ? 'Your dev identity is saved in this browser tab. '
            : 'Creating a profile is optional. '}
          Start moi with <code className="font-mono">--experimental-collab</code> to use it in
          workspaces. The playground below uses its own sample people.
        </p>
      </form>
    </section>
  )
}
