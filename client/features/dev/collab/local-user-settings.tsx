import { useState, useSyncExternalStore } from 'react'

import { IconArrowsShuffle } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { useAppConfig } from '@/client/api/app-config'
import { USER_COLORS } from '@/lib/collab/colors'
import type { UserProfile } from '@/lib/collab/types'
import { User } from '@/client/features/collab/components/user'
import { UserAvatar } from '@/client/features/collab/components/user-avatar'
import { randomLocalUser } from '@/client/features/collab/local-user'
import {
  getCurrentUser,
  getCurrentUserSource,
  setLocalUser,
  subscribeCurrentUserStore
} from '@/client/features/collab/host-state'

export function LocalUserSettings() {
  const { experimental } = useAppConfig()
  const source = useSyncExternalStore(
    subscribeCurrentUserStore,
    getCurrentUserSource,
    getCurrentUserSource
  )
  const profile = useSyncExternalStore(subscribeCurrentUserStore, getCurrentUser, getCurrentUser)
  if (source === 'external') return null
  if (source === 'cloudflare-access') return <AccessUser profile={profile} />
  if (profile) return <LocalUserEditor key={profile.id} profile={profile} />
  return (
    <section aria-labelledby="local-user-title" className="flex flex-col gap-5">
      <h2 id="local-user-title" className="text-base font-medium">
        Local user
      </h2>
      <p className="text-sm text-muted-foreground">
        {experimental.collab ? (
          'Couldn’t resolve your user identity. Reload moi to try again.'
        ) : (
          <>
            Start moi with <code className="font-mono">--experimental-collab</code> to create a
            local user automatically. The playground below uses its own sample users.
          </>
        )}
      </p>
    </section>
  )
}

type AccessUserProps = { profile: UserProfile | undefined }

// Behind Cloudflare Access the profile is inherited, so there is nothing to edit.
// Access profiles carry no name, so the label is the email, as in workspaces.
function AccessUser({ profile }: AccessUserProps) {
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
      {profile && <User id={profile.id} />}
    </section>
  )
}

type LocalUserEditorProps = { profile: UserProfile }

function LocalUserEditor({ profile }: LocalUserEditorProps) {
  // Keep raw input so normalization doesn't eat spaces while a name is being typed.
  const [name, setName] = useState(profile.name ?? '')

  return (
    <section aria-labelledby="local-user-title" className="flex flex-col gap-5">
      <header>
        <h2 id="local-user-title" className="text-base font-medium">
          Local user
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the local user for this browser tab. Changes save immediately. To test with two
          users, open moi in another browser tab.
        </p>
      </header>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-start gap-5 sm:flex-row">
          <div
            data-collab-color={profile.color}
            role="img"
            aria-label="Local user preview"
            className="size-16 shrink-0 overflow-hidden rounded-full"
          >
            <UserAvatar id={profile.id} className="data-[size=default]:size-full" />
          </div>
          <div className="flex w-full max-w-sm min-w-0 flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              Name (optional)
              <Input
                value={name}
                maxLength={80}
                placeholder="Type a name"
                autoComplete="off"
                spellCheck={false}
                onChange={event => {
                  setName(event.target.value)
                  setLocalUser({ ...profile, name: event.target.value })
                }}
              />
            </label>
            <div className="flex flex-col gap-1.5 text-sm">
              <span id="collab-color-label">Color</span>
              <div
                role="radiogroup"
                aria-labelledby="collab-color-label"
                className="flex flex-wrap gap-2"
              >
                {USER_COLORS.map(color => (
                  <label key={color} data-collab-color={color} className="cursor-pointer">
                    <input
                      type="radio"
                      name="color"
                      value={color}
                      aria-label={color[0].toUpperCase() + color.slice(1)}
                      checked={profile.color === color}
                      onChange={() => setLocalUser({ ...profile, color })}
                      className="peer sr-only"
                    />
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="size-6 rounded-full ring-foreground ring-offset-2 ring-offset-background transition-shadow peer-checked:ring-2 peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                    >
                      <circle cx="12" cy="12" r="12" className="fill-collab" />
                    </svg>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const next = randomLocalUser({ name, color: profile.color })
                  setName(next.name)
                  setLocalUser({ ...profile, ...next })
                }}
              >
                <IconArrowsShuffle stroke={1.75} />
                Randomize
              </Button>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Your user is saved in this browser tab. The playground below uses its own sample users.
        </p>
      </div>
    </section>
  )
}
