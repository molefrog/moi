import type { AppletBridge, AttachmentInput } from '../../../lib/types'

import { APPLET_API_BASE_SENTINEL } from './base'

type AppletChatInput = {
  message: string
  attachments?: AttachmentInput[]
}

const BASE = APPLET_API_BASE_SENTINEL

let bridge: Partial<AppletBridge> | null = null

export function __attachBridge(next: Partial<AppletBridge>): void {
  bridge = next
}

export function __getBridge(): Partial<AppletBridge> | null {
  return bridge
}

export function fileUrl(path: string): string {
  const clean = String(path).replace(/^\/+/, '')
  return BASE + '/fs/' + clean.split('/').map(encodeURIComponent).join('/')
}

export function navigate(href: string): void {
  bridge?.navigate?.(href)
}

export function resolveHref(href: string): string {
  return bridge?.resolveHref?.(href) ?? ''
}

export function addChatAttachment(input: AttachmentInput): void {
  bridge?.addChatAttachment?.(input)
}

// Keep positional calls working for previously built applets.
export function sendChatMessage(input: AppletChatInput | string, legacyContext?: unknown): void {
  bridge?.sendChatMessage?.(input, legacyContext)
}
