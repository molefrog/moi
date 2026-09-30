// Public moi contract, reused internally and installed as `.moi/base.d.ts`.
// Editor/`tsc` only — the moi bundler needs no declarations.

declare module 'moi' {
  // Resolve moi:/views/..., moi:/files/... or an HTTP(S) address for the browser.
  // moi addresses become root-relative URLs using the current page's origin.
  // Workspace files use the server's media/asset stream.
  export function resolveUrl(url: string): string
  // Navigate to a workspace page, file, or HTTP(S) address in the current tab.
  // Workspace pages add browser history; their query strings become view params.
  export function navigate(url: string): void
  export type AttachmentInput =
    | { type: 'text'; label: string; text: string }
    | { type: 'file'; file: File; path?: never }
    | { type: 'file'; path: string; file?: never }
  // Stage an attachment in the current chat draft; does not send a message.
  export function addChatAttachment(input: AttachmentInput): void
  // Prepare optional attachments and send to the active chat without changing
  // its draft. Call from event handlers; each call starts an agent run and is
  // rate-limited. Preparation failure or navigation cancels the whole send.
  export type ChatMessageInput = { message: string; attachments?: AttachmentInput[] }
  export function sendChatMessage(input: ChatMessageInput): void
  export type WidgetConfig = {
    rowSpan: 1 | 2 | 3 | 4
    colSpan: 1 | 2 | 3 | 4
    // Advisory env hints for server functions; never blocks loading.
    requiredEnv?: string[]
  }
  export type ViewConfig = {
    // Nav tab label; defaults to the file name.
    title?: string
    // App icon registry id used by workspace tabs.
    icon?: string
    // Advisory env hints for server functions; never blocks loading.
    requiredEnv?: string[]
  }
}

// Bundled asset imports (`import logo from './logo.png'`) resolve to a URL string.
declare module '*.png' {
  const s: string
  export default s
}
declare module '*.jpg' {
  const s: string
  export default s
}
declare module '*.jpeg' {
  const s: string
  export default s
}
declare module '*.gif' {
  const s: string
  export default s
}
declare module '*.webp' {
  const s: string
  export default s
}
declare module '*.avif' {
  const s: string
  export default s
}
declare module '*.svg' {
  const s: string
  export default s
}
