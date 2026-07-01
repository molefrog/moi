// The file-path note appended to the agent-facing text when a message carries
// non-image attachments (the agent Reads them from a temp path — see
// dev/file-uploads.md). Shared between the senders (cc-session, openclaw) and
// the replay adapter: the SDK persists the appended text verbatim into the
// session `.jsonl`, so on cold reload the adapter strips the note back out and
// re-renders the files as chips — keeping the reloaded bubble identical to the
// live one instead of leaking temp paths into it.

export const ATTACHMENT_NOTE_HEADER =
  'The user attached the following file(s); read them as needed:'

// The stand-in prompt for a message that is *only* attachments (an Anthropic
// message must end with a non-empty text block). The adapter drops it on
// replay so the reloaded bubble shows just the attachments, like the live one.
export const ATTACHMENT_ONLY_PLACEHOLDER = '(see attached files)'

export type AttachmentNoteFile = { filename: string; path: string }

// `text` plus the note listing each attachment as `- <filename>: <path>`.
// Filenames are sanitized at upload time (no colons/newlines), so the line
// format is unambiguous for `splitAttachmentNote`.
export function appendAttachmentNote(text: string, files: AttachmentNoteFile[]): string {
  if (files.length === 0) return text
  const list = files.map(f => `- ${f.filename}: ${f.path}`).join('\n')
  return `${text}\n\n${ATTACHMENT_NOTE_HEADER}\n${list}`.trim()
}

// Inverse of `appendAttachmentNote`. Returns the user's original text and the
// listed files; if the text carries no note (or the tail doesn't parse as one),
// it is returned untouched.
export function splitAttachmentNote(text: string): {
  text: string
  files: AttachmentNoteFile[]
} {
  const idx = text.lastIndexOf(ATTACHMENT_NOTE_HEADER)
  if (idx === -1) return { text, files: [] }
  const files: AttachmentNoteFile[] = []
  for (const raw of text.slice(idx + ATTACHMENT_NOTE_HEADER.length).split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = /^- (.+?): (.+)$/.exec(line)
    // Any non-matching line means this isn't our note — leave the text as-is.
    if (!m) return { text, files: [] }
    files.push({ filename: m[1], path: m[2] })
  }
  if (files.length === 0) return { text, files: [] }
  return { text: text.slice(0, idx).trimEnd(), files }
}
