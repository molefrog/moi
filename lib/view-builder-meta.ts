const VIEW_BUILDER_OPEN = '<moi>'
const VIEW_BUILDER_CLOSE = '</moi>'
const VIEW_BUILDER_MARKER = 'View builder request'

export function appendViewBuilderMeta(
  requirements: string,
  builderId: string,
  availableIcons: string[]
): string {
  const context = [
    VIEW_BUILDER_OPEN,
    VIEW_BUILDER_MARKER,
    `Builder id: ${builderId}`,
    `Available view icons: ${availableIcons.join(', ')}`,
    'Your first action must be to infer a stable view id, sentence-case title, and relevant icon from the requirements, then run:',
    `moi builder set <view-id> --builder ${builderId} --kind view --title "<title>" --icon <icon-id>`,
    'Do this before reading files, planning, or writing code. Choose the icon id from the available view icons above.',
    'Capitalize only the first word of the title.',
    'Use the same icon id in the view config.',
    'After building the view, run `moi bundle --only views`.',
    VIEW_BUILDER_CLOSE
  ].join('\n')
  return `${requirements.trim()}\n\n${context}`
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
