// A finished Claude Code chat in the populated workspace, written where the
// Claude harness discovers sessions: one JSONL line per message, in the
// format Claude Code stores them.
export const CHAT_SESSION_ID = '5b0c8f9e-2d41-4c57-9a1e-0c3f6d2b8a71'

// Before the pages' start time, so "how long ago" labels are fixed.
export const CHAT_TIME = new Date('2026-05-11T16:20:00Z')

export function chatSessionLines(cwd: string): string {
  const widget = `${cwd}/.moi/widgets/orders-today.tsx`
  const messages = [
    {
      type: 'user',
      message: {
        role: 'user',
        content:
          "Add a widget to the overview with today's orders: the count, and the last few with their status."
      }
    },
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "I'll add an **Orders today** widget with the count and the latest three orders."
          },
          {
            type: 'tool_use',
            id: 'toolu_01',
            name: 'Write',
            input: { file_path: widget, content: '…' }
          }
        ]
      }
    },
    {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_01',
            content: `File created successfully at: ${widget}`
          }
        ]
      }
    },
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_02',
            name: 'Bash',
            input: {
              command: 'moi bundle --only widgets/orders-today',
              description: 'Build the widget'
            }
          }
        ]
      }
    },
    {
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_02', content: 'widget  orders-today  built' }
        ]
      }
    },
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Done. **Orders today** is on your overview: 38 orders so far, with the three latest and their status. It spans two columns next to the revenue chart.'
          }
        ]
      }
    }
  ]
  return messages
    .map((entry, i) =>
      JSON.stringify({
        ...entry,
        uuid: `msg-${i + 1}`,
        parentUuid: i === 0 ? null : `msg-${i}`,
        sessionId: CHAT_SESSION_ID,
        timestamp: new Date(CHAT_TIME.getTime() + i * 15_000).toISOString(),
        cwd,
        ...(entry.type === 'assistant'
          ? { message: { ...entry.message, id: `msg_${i + 1}`, model: 'claude-opus-5-5' } }
          : {})
      })
    )
    .join('\n')
    .concat('\n')
}
