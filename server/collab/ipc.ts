import type {
  CollabActor,
  CollabClientMessage,
  CollabCommand,
  CollabCommandResult,
  CollabServerMessage
} from '@/lib/collab/types'

export type ParentMessage =
  | { type: 'client'; connectionId: string; message: CollabClientMessage }
  | { type: 'leave'; connectionId: string }
  | { type: 'call'; requestId: string; actor: CollabActor; command: CollabCommand }
  | { type: 'shutdown' }

export type WorkerMessage =
  | { type: 'ready'; generation: string }
  | { type: 'client'; generation: string; connectionId: string; message: CollabServerMessage }
  | { type: 'result'; generation: string; requestId: string; result: CollabCommandResult }
  | { type: 'error'; generation: string; requestId: string; code: string; message: string }
