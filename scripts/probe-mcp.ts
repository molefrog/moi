// Probe MCP server status for a workspace via the real server code path
// (server/mcp.ts getMcpStatus: streaming-input session, poll until settled,
// no model turn). Prints the settled JSON.
//
// Usage: bun scripts/probe-mcp.ts <workspaceId>

import { getMcpStatus } from '../server/mcp'
import { getWorkspace } from '../server/registry'

const id = process.argv[2] ?? '83f08193-3812-4dd0-ac06-7d2cba88a7c3'

const ws = await getWorkspace(id)
if (!ws) {
  console.error(`Workspace not found: ${id}`)
  process.exit(1)
}

console.error(`Probing MCP for workspace ${id} at ${ws.path}\n`)

const t = Date.now()
const status = await getMcpStatus(ws.path)
console.error(`settled in ${Date.now() - t}ms\n`)

console.log(JSON.stringify(status, null, 2))
process.exit(0)
