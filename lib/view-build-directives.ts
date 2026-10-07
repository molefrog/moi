// One-time instructions when a chat starts working on a pending view.
// The moi-workspace skill owns the general build workflow.
export function viewBuildDirectives(viewId: string, availableIcons: readonly string[]): string[] {
  return [
    'Build a new view from this message. Follow the pending view steps in the moi-workspace skill.',
    `The view id is \`${viewId}\`. Write the view source to \`.moi/views/${viewId}.tsx\`.`,
    `Before building, set a provisional title and icon: \`moi views set ${viewId} --title "<title>" --icon <icon-id>\`. Use sentence case for the title.`,
    `Available view icons: ${availableIcons.join(', ')}`,
    'If the user asks for an additional view, create it with: `moi views create --requirements "<complete requirements>"`.',
    `When done, do not navigate. Keep the user's current tab open and end your reply with \`[Open the view](moi:/views/${viewId})\`.`
  ]
}
