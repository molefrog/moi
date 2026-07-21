// View-builder bootstrap instructions, delivered as one-shot directives inside
// the `<moi-context>` envelope (lib/moi-context.ts) via SendMessageInput's
// `context` channel — see the view-builder POST route in server/api.ts.
export function viewBuilderDirectives(builderId: string, availableIcons: string[]): string[] {
  return [
    'View builder request — this chat is linked to a pending view tab.',
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
