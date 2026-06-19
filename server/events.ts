// Live-event channel: server → browser push over the `/api/workspaces/ws`
// socket. Bundles, the control server, and the REST API publish build/refresh/
// identity events (`widgets:refresh`, `theme:updated`, `workspace:updated`, …)
// here; every subscribed browser receives them. This is not a transport of its
// own — it rides the Bun WebSocket pub/sub already open for that route.
//
// The publisher is the Bun.serve instance created in web.ts, wired in via
// `setEventServer` once it exists. Keeping `publishEvent` in its own module lets
// web.ts, control.ts, and the Hono API all publish without forming an import
// cycle through web.ts (which binds ports on load).

export const EVENTS_TOPIC = 'events'

type EventPublisher = { publish: (topic: string, data: string) => unknown }

let publisher: EventPublisher | null = null

export function setEventServer(server: EventPublisher) {
  publisher = server
}

export function publishEvent(msg: unknown) {
  publisher?.publish(EVENTS_TOPIC, JSON.stringify(msg))
}
