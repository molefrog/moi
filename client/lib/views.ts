// Views — custom, agent-defined tabs that render as full-area apps in the
// workspace panel (like the scratchpad). Demo only for now: not wired to a
// backend, so every workspace starts from the same list below.

export type ViewDef = {
  id: string
  name: string
}

export const DEMO_VIEWS: ViewDef[] = [
  { id: 'crm', name: 'CRM' },
  { id: 'recordings', name: 'Recordings' },
  { id: 'connections', name: 'Connections' }
]
