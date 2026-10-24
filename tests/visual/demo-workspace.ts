// The workspaces the visual tests register: each one's id and folder name.
// `acme-store` is freshly created; `northwind` has what an agent built in it
// (widgets, a view, a theme, env keys and a chat), seeded from ./seed.
export const DEMO_WORKSPACE = 'acme-store'
export const BUILT_WORKSPACE = 'northwind'

// Printed by serve.ts once both workspaces and the seeded applets exist.
export const SERVER_READY = 'moi visual tests: ready'
