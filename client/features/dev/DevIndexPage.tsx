import { Link } from 'wouter'

type DevRouteEntry = {
  path: string
  title: string
  description: string
}

const DEV_ROUTES: DevRouteEntry[] = [
  {
    path: '/dev/blobatar-shapes',
    title: 'Blobatar shape builder',
    description: 'Tune all 10 shape families and their geometry traits for the agent.'
  },
  {
    path: '/dev/chat-states',
    title: 'Chat states',
    description:
      'Every chat state as one continuous conversation, rendered by the production components over fixtures.'
  },
  {
    path: '/dev/tool-calls',
    title: 'Tool calls',
    description: 'Tool-call group fixtures: single and merged runs, live states, subagent traces.'
  },
  {
    path: '/dev/ui-components',
    title: 'UI components',
    description: 'Interactive previews for every component in the local moi registry.'
  },
  {
    path: '/dev/textures',
    title: 'Texture lab',
    description: 'Every texture across color presets, dark mode, widget tokens, and vivid surfaces.'
  },
  {
    path: '/dev/harness',
    title: 'Harness debug',
    description:
      'Drive a workspace over the real chat protocol with wire, client, and durable event logs.'
  }
]

// The /dev index — a plain list of every dev route so pages stay
// discoverable. Add new entries here when adding a route in DevRoutes.
export function DevIndexPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-6 py-10">
      <span className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
        Playground
      </span>
      <ul className="mt-6 flex flex-col gap-5">
        {DEV_ROUTES.map(route => (
          <li key={route.path}>
            <div className="flex items-baseline gap-2">
              <Link href={route.path} className="underline underline-offset-4">
                {route.title}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">{route.path}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{route.description}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
