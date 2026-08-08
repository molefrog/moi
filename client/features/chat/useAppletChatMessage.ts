// Chat's half of the applet `sendChatMessage` API: turn a validated runtime
// event into a real send on the active chat.
//
// The runtime already did the untrusted work — narrowed the args, stamped the
// applet's `<kind>:<name>` as `source`, and rate-limited repeats
// (applet-runtime.ts). What's left is chat policy: reveal the chat, then send
// the text as an ordinary user message with the applet attribution riding the
// `<moi-context>` envelope.
//
// Sending while a turn is running is fine and deliberate — the composer offers
// the same ("Queue a follow-up"), and the harness queues the message into the
// live session rather than rejecting it.
import { reportAppletError } from '@/client/features/applets/applet-log'
import { type AppletChatMessage, useAppletEvent } from '@/client/features/applets/applet-runtime'
import type { ChatSendOptions } from '@/client/features/chat/chat-send'
import type { ComposerAvailability } from '@/client/components/shared/Composer'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'

type UseAppletChatMessageOptions = {
  send: (draft: string, options?: ChatSendOptions) => void
  // Bring the chat on screen before the run starts. On a view tab in
  // full-screen mode the chat is a popover that is closed by default, so
  // without this the agent would start working somewhere the user can't see.
  revealChat: () => void
  // Same explicit availability state the composer's send button uses.
  composerAvailability: ComposerAvailability
}

// Why an applet message can't go out right now, or null when it can. The gate
// is exactly the composer's. Starting a run the visible UI would have refused
// is worse than dropping a click the user can repeat a moment later.
export function appletSendBlockedReason(availability: ComposerAvailability): string | null {
  if (availability.status === 'available') return null
  if (availability.status === 'checking') {
    return "this workspace's agent availability has not resolved yet"
  }
  return "this workspace's agent is unavailable"
}

export function useAppletChatMessage({
  send,
  revealChat,
  composerAvailability
}: UseAppletChatMessageOptions): void {
  const workspaceId = useWorkspaceId()

  useAppletEvent(workspaceId, 'sendChatMessage', (event: AppletChatMessage) => {
    const blocked = appletSendBlockedReason(composerAvailability)
    if (blocked) {
      // Journaled rather than dropped quietly: from the applet's side the
      // button did nothing, and this is the only place that says why.
      reportAppletError(workspaceId, {
        source: 'runtime',
        message: `sendChatMessage("${event.message}") was dropped: ${blocked}.`
      })
      return
    }
    // `message` is the visible chat text; everything else in the event IS the
    // envelope's applet attribution.
    const { message, ...applet } = event
    revealChat()
    send(message, { applet })
  })
}
