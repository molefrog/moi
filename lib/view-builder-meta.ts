const VIEW_BUILDER_OPEN = '<moi>'
const VIEW_BUILDER_CLOSE = '</moi>'
const VIEW_BUILDER_MARKER = 'View builder request'

export function appendViewBuilderMeta(requirements: string, builderId: string): string {
  const context = [
    VIEW_BUILDER_OPEN,
    VIEW_BUILDER_MARKER,
    `Builder id: ${builderId}`,
    'Before writing view files, infer a stable view id and title, then run:',
    `moi view-builder claim --builder ${builderId} --id <view-id> --title "<title>"`,
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
