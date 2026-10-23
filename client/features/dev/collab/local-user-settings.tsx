import { useSyncExternalStore } from 'react'

import { USER_COLORS } from '@/lib/collab/colors'
import type { UserProfile } from '@/lib/collab/types'
import { User } from '@/client/features/collab/components/user'
import { UserAvatar } from '@/client/features/collab/components/user-avatar'
import {
  getCurrentUser,
  getCurrentUserSource,
  setLocalUser,
  subscribeCurrentUserStore
} from '@/client/features/collab/host-state'

export function LocalUserSettings() {
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
        Couldn’t resolve your user identity. Reload Moi to try again.
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
            : 'This server uses Cloudflare Access, but this page wasn’t opened through it. Open Moi at its Cloudflare Access address to appear in workspaces.'}
        </p>
      </header>
      {profile && <User profile={profile} />}
    </section>
  )
}

type LocalUserEditorProps = { profile: UserProfile }

function LocalUserEditor({ profile }: LocalUserEditorProps) {
  return (
    <section aria-labelledby="local-user-title" className="flex flex-col gap-5">
      <header>
        <h2 id="local-user-title" className="text-base font-medium">
          Local user
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Change your avatar color here. Edit your name in Settings.
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
            <UserAvatar profile={profile} className="data-[size=default]:size-full" />
          </div>
          <div className="flex w-full max-w-sm min-w-0 flex-col gap-4">
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
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Your user is saved in this browser and shared across tabs. The playground below uses its
          own sample users.
        </p>
      </div>
    </section>
  )
}
