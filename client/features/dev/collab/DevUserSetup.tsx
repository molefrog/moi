import { useMemo, useState, useSyncExternalStore } from 'react'

import { IconArrowsShuffle } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { USER_COLORS } from '@/lib/collab/colors'
import type { UserProfile } from '@/lib/collab/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui-components/avatar'

import { facehashDataUrl } from '@/client/features/collab/facehash-avatar'
import { userDisplayName } from '@/client/features/collab/users'
import { createDevUser, devUserProfile, randomDevUser } from './dev-user'
import type { DevUserDraft } from './dev-user'
import {
  getCurrentUser,
  getCurrentUserSource,
  setDevUser,
  subscribeCurrentUserStore
} from '@/client/features/collab/host-state'

export function DevUserSetup() {
  const source = useSyncExternalStore(
    subscribeCurrentUserStore,
    getCurrentUserSource,
    getCurrentUserSource
  )
  const profile = useSyncExternalStore(subscribeCurrentUserStore, getCurrentUser, getCurrentUser)
  if (source === 'external') return null
  if (source === 'cloudflare-access') return <AccessUser profile={profile} />
  return <DevUserForm key={profile?.id ?? 'setup'} savedUser={profile} />
}

type AccessUserProps = { profile: UserProfile | null }

// Behind Cloudflare Access the profile is inherited, so there is nothing to edit.
// Access profiles carry no name, so the label is the email, as in workspaces.
function AccessUser({ profile }: AccessUserProps) {
  const label = profile ? userDisplayName(profile) : null
  const avatar = useMemo(
    () => (profile && label ? (profile.avatar ?? facehashDataUrl(label, profile.color)) : null),
    [profile, label]
  )
  return (
    <section aria-labelledby="access-user-title" className="flex flex-col gap-5">
      <header>
        <h2 id="access-user-title" className="text-base font-medium">
          Cloudflare Access user
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile
            ? 'This server uses your Cloudflare Access account. You appear by your email, with a color picked from your Access user ID.'
            : 'This server uses Cloudflare Access, but this page wasn’t opened through it. Open moi at its Cloudflare Access address to appear in workspaces.'}
        </p>
      </header>
      {label && (
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            {avatar && <AvatarImage src={avatar} alt="" />}
            <AvatarFallback>{label.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 truncate text-sm font-medium">{label}</span>
        </div>
      )}
    </section>
  )
}

type DevUserFormProps = { savedUser: UserProfile | null }

function DevUserForm({ savedUser }: DevUserFormProps) {
  const [initial] = useState(() => savedUser ?? createDevUser())
  const [draft, setDraft] = useState<DevUserDraft>({
    name: initial.name ?? '',
    color: initial.color
  })
  const name = draft.name.trim()
  const profile = useMemo(
    () => devUserProfile(initial.id, { name, color: draft.color }),
    [initial.id, name, draft.color]
  )
  const changed = name !== (savedUser?.name ?? '') || draft.color !== savedUser?.color

  return (
    <section aria-labelledby="dev-user-title" className="flex flex-col gap-5">
      <header>
        <h2 id="dev-user-title" className="text-base font-medium">
          Local test user
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up a local test user for this browser tab. To test with two users, set up another test
          user in a second browser tab.
        </p>
      </header>
      <form
        className="flex flex-col gap-5"
        onSubmit={event => {
          event.preventDefault()
          setDevUser(profile)
        }}
      >
        <div className="flex flex-col items-start gap-5 sm:flex-row">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt="Test user preview"
              className="size-16 shrink-0 rounded-full"
            />
          ) : (
            <div aria-hidden="true" className="size-16 shrink-0 rounded-full bg-muted" />
          )}
          <div className="flex w-full max-w-sm min-w-0 flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              Name (optional)
              <Input
                value={draft.name}
                maxLength={80}
                placeholder="Type a name"
                autoComplete="off"
                spellCheck={false}
                onChange={event => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <div className="flex flex-col gap-1.5 text-sm">
              <span id="collab-color-label">Color</span>
              <div
                role="radiogroup"
                aria-labelledby="collab-color-label"
                className="flex flex-wrap gap-2"
              >
                {USER_COLORS.map(([label, hex]) => (
                  <label key={hex} className="cursor-pointer">
                    <input
                      type="radio"
                      name="color"
                      value={hex}
                      aria-label={label}
                      checked={draft.color === hex}
                      onChange={() => setDraft({ ...draft, color: hex })}
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
              <Button type="submit" size="sm" disabled={!changed}>
                {savedUser ? 'Save test user' : 'Use test user'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDraft(randomDevUser(draft))}
              >
                <IconArrowsShuffle stroke={1.75} />
                Randomize
              </Button>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {savedUser
            ? 'Your test user is saved in this browser tab. '
            : 'Setting up a test user is optional. '}
          Start moi with <code className="font-mono">--experimental-collab</code> to use it in
          workspaces. The playground below uses its own sample users.
        </p>
      </form>
    </section>
  )
}
