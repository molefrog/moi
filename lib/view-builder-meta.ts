// View-builder bootstrap instructions, delivered as one-shot directives inside
// the `<moi-context>` envelope (lib/moi-context.ts) via SendMessageInput's
// `context` channel — see the view-builder POST route in server/api.ts.
//
// `stripViewBuilderMeta` remains for LEGACY transcripts only: view-builder
// requests used to append their own `<moi>…</moi>` block to the user text, and
// messages persisted by the backends still carry it. Display paths keep
// stripping it so old bubbles render clean; no new messages produce it.
const VIEW_BUILDER_OPEN = '<moi>'
const VIEW_BUILDER_CLOSE = '</moi>'
const VIEW_BUILDER_MARKER = 'View builder request'

export function viewBuilderDirectives(builderId: string, availableIcons: string[]): string[] {
  return [
    `${VIEW_BUILDER_MARKER} — this chat is linked to a pending view tab.`,
    `Builder id: ${builderId}`,
    `Available view icons: ${availableIcons.join(', ')}`,
    'Your first action must be to infer a stable view id, sentence-case title, and relevant icon from the requirements, then run:',
    `moi builder set <view-id> --builder ${builderId} --kind view --title "<title>" --icon <icon-id>`,
    'Do this before reading files, planning, or writing code. Choose the icon id from the available view icons above.',
    'Capitalize only the first word of the title.',
    'Use the same icon id in the view config.',
    'After building the view, run `moi bundle --only views`.'
  ]
}

export function stripViewBuilderMeta(text: string): string {
  const start = text.lastIndexOf(VIEW_BUILDER_OPEN)
  if (start === -1) return text
  const end = text.indexOf(VIEW_BUILDER_CLOSE, start)
  if (end === -1) return text
  if (!text.slice(start, end).includes(VIEW_BUILDER_MARKER)) return text
  const before = text.slice(0, start)
  const after = text.slice(end + VIEW_BUILDER_CLOSE.length)
  return `${before}${after}`.trim()
}
