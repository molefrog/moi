const MAX_CHAT_TITLE_LENGTH = 64

export function formatChatTitle(text: string, filenames: readonly string[] = []): string {
  const source = text.trim() || filenames.filter(Boolean).join(', ')
  return source.replace(/\s+/gu, ' ').trim().slice(0, MAX_CHAT_TITLE_LENGTH).trimEnd()
}
