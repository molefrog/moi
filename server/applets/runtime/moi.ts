import type { AttachmentInput, ChatMessageInput } from 'moi'
import type { AppletBridge } from '../../../lib/types'
import { resolveUrl as resolveWorkspaceUrl } from '../../../lib/navigation'

import { APPLET_API_BASE_SENTINEL } from '../api-base'

let bridge: Partial<AppletBridge> | null = null

export function __attachBridge(next: Partial<AppletBridge>): void {
  bridge = next
}

export function __getBridge(): Partial<AppletBridge> | null {
  return bridge
}

export function resolveUrl(url: string): string {
  // File URLs also work during module evaluation, before the host attaches.
  if (url.startsWith('moi:/files/'))
    return resolveWorkspaceUrl(url, { apiBase: APPLET_API_BASE_SENTINEL })
  return bridge?.resolveUrl?.(url) ?? ''
}

export function navigate(url: string): void {
  bridge?.navigate?.(url)
}

export function addChatAttachment(input: AttachmentInput): void {
  bridge?.addChatAttachment?.(input)
}

// Keep positional calls working for previously built applets.
export function sendChatMessage(input: ChatMessageInput | string, legacyContext?: unknown): void {
  bridge?.sendChatMessage?.(input, legacyContext)
}
