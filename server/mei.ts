// Live widget/view event channel ("mei"). Bundles, the control server, and the
// REST API push build/refresh/identity events here; every browser subscribed to
// the `/api/workspaces/ws` socket receives them.
//
// The actual publisher is the Bun.serve instance created in web.ts, wired in via
// `setMeiServer` once it exists. Keeping `publishMei` in its own module lets
// web.ts, control.ts, and the Hono API all publish without forming an import
// cycle through web.ts (which binds ports on load).

export const MEI_TOPIC = 'mei'

type MeiPublisher = { publish: (topic: string, data: string) => unknown }

let publisher: MeiPublisher | null = null

export function setMeiServer(server: MeiPublisher) {
  publisher = server
}

export function publishMei(msg: unknown) {
  publisher?.publish(MEI_TOPIC, JSON.stringify(msg))
}
