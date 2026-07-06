// Ambient declaration so tsc/editors resolve `import { mcp } from 'moi'` in
// fixture .server.ts files. At runtime the functions worker provides the
// module via Bun.plugin (see functions-worker.ts); workspaces get the full
// declaration from the scaffolded applet-env.d.ts (moi-scaffold.ts).
declare module 'moi' {
  export type McpContentBlock = { type: string; text?: string; [key: string]: unknown }
  export type McpToolResult = { content: McpContentBlock[]; structuredContent?: unknown }
  export type McpToolInfo = { name: string; description?: string; inputSchema?: unknown }
  export type McpServerSummary = {
    name: string
    status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'
    scope?: string
    callable: boolean
    reason?: string
    tools?: string[]
  }
  export const mcp: {
    callTool(server: string, tool: string, args?: Record<string, unknown>): Promise<McpToolResult>
    listTools(server: string): Promise<McpToolInfo[]>
    listServers(): Promise<McpServerSummary[]>
  }
  export function fileUrl(path: string): string
}
