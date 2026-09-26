import type { CollabClientMessage, CollabServerMessage } from '@/lib/collab/types'

export type ParentMessage =
  | { type: 'client'; connectionId: string; message: CollabClientMessage }
  | { type: 'leave'; connectionId: string }
  | { type: 'shutdown' }

export type WorkerMessage =
  | { type: 'ready'; generation: string }
  | { type: 'client'; generation: string; connectionId: string; message: CollabServerMessage }
