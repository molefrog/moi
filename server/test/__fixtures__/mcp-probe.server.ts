// Exercises the worker-side `mcp` API end-to-end (worker → IPC → broker).
import { mcp } from 'moi'

export async function echoViaMcp(text: string): Promise<string | undefined> {
  const res = await mcp.callTool('echo', 'echo', { text })
  return res.content[0]?.text
}

export async function listServerNames(): Promise<string[]> {
  return (await mcp.listServers()).map(s => s.name)
}

export async function callUnknownServer(): Promise<void> {
  await mcp.callTool('nope', 'whatever')
}
