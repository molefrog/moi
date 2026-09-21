// Connect validated applet intents to the active chat: stage attachments in the
// draft or send a message immediately, then reveal and focus chat.
// The runtime owns argument validation, source attribution, and send rate limits;
// these handlers own draft staging, preparation, and cancellation of immediate sends.
import { stageChatAttachment } from './composer/attachments/draft-attachments'
import { reportAppletError } from '@/client/features/applets/applet-log'
import {
  type AppletChatMessage,
  appletRuntime,
  useAppletEvent
} from '@/client/features/applets/applet-runtime'
import { prepareChatAttachments, type ChatSendOptions, type PreparedAttachments } from './chat-send'
import { useLayoutEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { appUiKeys } from '@/client/api/app-ui-keys'
import { toast } from '@/client/components/ui/toast'
import { useLatestRef } from '@/client/lib/use-latest-ref'
import type { SelectedSessionState } from '@/lib/types'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import type { AgentAvailability } from '@/client/lib/agent-availability'

type UseAppletChatMessageOptions = {
  sessionId: string | null
  send: (draft: string, options?: ChatSendOptions) => void
  // Bring the chat on screen before the run starts. On a view tab in
  // full-screen mode the chat is a popover that is closed by default, so
  // without this the agent would start working somewhere the user can't see.
  revealChat: () => void
  // Same explicit availability state the composer's send button uses.
  agentAvailability: AgentAvailability
}

// Why an applet message can't go out right now, or null when it can. The gate
// is exactly the composer's. Starting a run the visible UI would have refused
// is worse than dropping a click the user can repeat a moment later.
export function appletSendBlockedReason(availability: AgentAvailability): string | null {
  if (availability.status === 'available') return null
  if (availability.status === 'checking') {
    return "this workspace's agent availability has not resolved yet"
  }
  if (availability.status === 'disconnected') return 'this workspace is disconnected from moi'
  if (availability.status === 'login-required') {
    return "this workspace's agent needs a login"
  }
  return "this workspace's agent is unavailable"
}

// One handler lifetime belongs to one workspace screen. Listen to selection
// changes in the query cache itself: switching away and back can happen before
// React renders, and must still cancel the pending send.
export function createAppletMessageHandler(
  workspaceId: string,
  queryClient: QueryClient,
  getOptions: () => UseAppletChatMessageOptions
) {
  const pending = new Set<() => void>()
  let disposed = false
  const selectedSession = () =>
    queryClient.getQueryData<SelectedSessionState>(appUiKeys.selectedSession(workspaceId))
      ?.sessionId ?? null

  async function handle(event: AppletChatMessage): Promise<void> {
    if (disposed) return
    const reportFailure = (message: string) => {
      toast.add({ title: 'Couldn’t send message', description: message, type: 'error' })
      reportAppletError(workspaceId, {
        source: 'runtime',
        message: `sendChatMessage() from ${event.source}: ${message}`
      })
    }
    const blocked = appletSendBlockedReason(getOptions().agentAvailability)
    if (blocked) {
      reportFailure(blocked)
      return
    }

    const sessionId = selectedSession()
    let active = true
    let loadingToast: string | undefined
    const finish = () => {
      active = false
      unsubscribe()
      pending.delete(cancel)
      if (loadingToast) toast.close(loadingToast)
    }
    const cancel = () => {
      if (!active) return
      finish()
      toast.add({
        title: 'Message canceled',
        description: 'The active chat changed before attachments were ready.',
        type: 'info'
      })
    }
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (selectedSession() !== sessionId) cancel()
    })
    pending.add(cancel)
    // A selection change can reach the cache before React has replaced the
    // send callback. Never invoke a callback that still targets the old chat.
    if (getOptions().sessionId !== sessionId) {
      cancel()
      return
    }
    getOptions().revealChat()

    let preparedAttachments: PreparedAttachments
    try {
      if (event.attachments.some(attachment => attachment.type === 'file')) {
        loadingToast = toast.add({ title: 'Preparing attachments…', type: 'loading', timeout: 0 })
      }
      preparedAttachments = await prepareChatAttachments(workspaceId, event.attachments)
      if (!active) return
      const options = getOptions()
      const blocked = appletSendBlockedReason(options.agentAvailability)
      if (blocked) throw new Error(blocked)
      if (options.sessionId !== sessionId) {
        cancel()
        return
      }
    } catch (error) {
      if (active) {
        finish()
        reportFailure(error instanceof Error ? error.message : 'Attachment preparation failed')
      }
      return
    }
    // Stop watching before sending: a new chat gets its first session ID here.
    finish()
    try {
      getOptions().send(event.message, { applet: { source: event.source }, preparedAttachments })
    } catch (error) {
      reportFailure(error instanceof Error ? error.message : 'Message send failed')
    }
  }

  return {
    handle,
    dispose() {
      disposed = true
      for (const cancel of pending) cancel()
    }
  }
}

export function useAppletChatMessage(options: UseAppletChatMessageOptions): void {
  const workspaceId = useWorkspaceId()
  const queryClient = useQueryClient()
  const latest = useLatestRef(options)
  useLayoutEffect(() => {
    const handler = createAppletMessageHandler(workspaceId, queryClient, () => latest.current)
    const unsubscribe = appletRuntime(workspaceId).on('sendChatMessage', event => {
      void handler.handle(event)
    })
    return () => {
      unsubscribe()
      handler.dispose()
    }
  }, [workspaceId, queryClient, latest])
}

export function useAppletChatAttachment(sessionId: string | null, revealChat: () => void): void {
  const workspaceId = useWorkspaceId()
  useAppletEvent(workspaceId, 'addChatAttachment', attachment => {
    void stageChatAttachment({ workspaceId, sessionId }, attachment)
    revealChat()
  })
}
