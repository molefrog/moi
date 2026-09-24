// Request-specific context for initial and later messages to a pending view.
// The moi-workspace skill owns the general build workflow.
export function viewBuildDirectives(viewId: string, availableIcons: readonly string[]): string[] {
  return [
    'View build request — follow the pending view steps in the moi-workspace skill.',
    `View id: ${viewId} (already assigned)`,
    `Available view icons: ${availableIcons.join(', ')}`,
    `Set the provisional title and icon with: moi views set ${viewId} --title "<title>" --icon <icon-id>`,
    `Keep the user's current tab open. Link to moi:/views/${viewId} when the build is done.`
  ]
}
