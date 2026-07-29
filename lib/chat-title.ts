const MAX_CHAT_TITLE_LENGTH = 64

function stripSurroundingMarkdown(value: string): string {
  let title = value
    .replace(/^#{1,6}\s+/u, '')
    .replace(/^(?:[-*+]|\d+[.)])\s+/u, '')
    .replace(/^>\s*/u, '')
    .trim()
  if (/^```[\w-]*$/u.test(title)) return ''

  const link = /^!?\[([^\]]+)\]\([^)]*\)$/u.exec(title)
  if (link?.[1]) title = link[1].trim()

  const wrappers = [
    ['```', '```'],
    ['**', '**'],
    ['__', '__'],
    ['~~', '~~'],
    ['`', '`'],
    ['*', '*'],
    ['_', '_']
  ] as const
  for (const [start, end] of wrappers) {
    if (
      title.startsWith(start) &&
      title.endsWith(end) &&
      title.length > start.length + end.length
    ) {
      title = title.slice(start.length, -end.length).trim()
      break
    }
  }
  return title
}

function firstMeaningfulLine(value: string): string {
  for (const line of value.split(/\r?\n/u)) {
    const cleaned = stripSurroundingMarkdown(line)
    if (cleaned) return cleaned
  }
  return ''
}

function firstSentence(value: string): string {
  const match = /^.*?[.!?。！？](?=\s|$)/u.exec(value)
  return match?.[0] ?? value
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  const slice = value.slice(0, maxLength + 1)
  const boundary = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\t'))
  return (boundary > maxLength / 2 ? slice.slice(0, boundary) : value.slice(0, maxLength)).trimEnd()
}

export function formatChatTitle(text: string, filenames: readonly string[] = []): string {
  const source = firstMeaningfulLine(text) || filenames.filter(Boolean).join(', ')
  if (!source) return ''
  const title = firstSentence(source).replace(/\s+/gu, ' ').trim()
  return truncateAtWordBoundary(title, MAX_CHAT_TITLE_LENGTH)
}

export function sanitizeGeneratedChatTitle(value: string): string {
  return formatChatTitle(value)
    .replace(/[.!?。！？]+$/u, '')
    .trim()
}
