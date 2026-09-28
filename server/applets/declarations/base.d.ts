// Base applet types installed as `.moi/base.d.ts` by moi.
// Editor/`tsc` only — the moi bundler needs no declarations.

declare module 'moi' {
  // Absolute URL to a workspace file, streamed by the server. Pass a
  // workspace-relative path (e.g. 'clips/001.mp4'). Media/asset files only.
  export function fileUrl(path: string): string
  // Navigate within this workspace. Query strings are delivered as view params.
  // Navigation adds a browser history entry. Include view params in the URL.
  export function navigate(href: string): void
  // Resolve a portable moi:/ address to a real browser href for an anchor.
  export function resolveHref(href: string): string
  export type AttachmentInput =
    | { type: 'text'; label: string; text: string }
    | { type: 'file'; file: File; path?: never }
    | { type: 'file'; path: string; file?: never }
  // Stage an attachment in the current chat draft; does not send a message.
  export function addChatAttachment(input: AttachmentInput): void
  // Prepare optional attachments and send to the active chat without changing
  // its draft. Call from event handlers; each call starts an agent run and is
  // rate-limited. Preparation failure or navigation cancels the whole send.
  export function sendChatMessage(input: { message: string; attachments?: AttachmentInput[] }): void
  export type WidgetConfig = {
    rowSpan: 1 | 2 | 3 | 4
    colSpan: 1 | 2 | 3 | 4
    requiredEnv?: string[]
  }
  export type ViewConfig = { title?: string; icon?: string; requiredEnv?: string[] }
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
