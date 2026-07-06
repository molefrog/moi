import type { ScratchpadWriter } from './types'

// Version-skew detection for Scratchpad snapshots. A tldraw snapshot embeds the
// serialized schema of whatever tldraw *wrote* it, and tldraw has no
// down-migrations — a snapshot written by a newer schema can never be loaded by
// an older one. When `loadSnapshot`/`migrateStoreSnapshot` fails, these helpers
// tell "the file is from a newer tldraw" apart from genuine corruption, so both
// the server error (scratchpad-executor.ts) and the client notice
// (client/components/Scratchpad.tsx) can say something actionable instead of
// tldraw's bare `migration-error`. See docs/moi-scratchpad.md § Version skew.

// A serialized tldraw schema's migration sequences: sequence id → version, e.g.
// `{ "com.tldraw.shape.note": 9 }`.
export type SchemaSequences = Record<string, number>

// One sequence in the file that the runtime can't load: the file's version is
// ahead of the runtime's, or the runtime doesn't know the sequence at all
// (which also means a newer writer).
export type SequenceAhead = { id: string; fileVersion: number; runtimeVersion?: number }

// Pull the `sequences` map out of an unknown `document.schema` value —
// best-effort, since the file is disk JSON. Returns null when the shape isn't a
// v2 serialized schema.
export function schemaSequences(schema: unknown): SchemaSequences | null {
  if (!schema || typeof schema !== 'object') return null
  const sequences = (schema as { sequences?: unknown }).sequences
  if (!sequences || typeof sequences !== 'object') return null
  const out: SchemaSequences = {}
  for (const [id, version] of Object.entries(sequences)) {
    if (typeof version === 'number') out[id] = version
  }
  return Object.keys(out).length > 0 ? out : null
}

// The file sequences the runtime is behind on. Non-empty means the snapshot was
// written by a newer tldraw than the runtime — the load failure is skew, not
// corruption.
export function sequencesAhead(fileSchema: unknown, runtime: SchemaSequences): SequenceAhead[] {
  const file = schemaSequences(fileSchema)
  if (!file) return []
  const ahead: SequenceAhead[] = []
  for (const [id, fileVersion] of Object.entries(file)) {
    const runtimeVersion = runtime[id]
    if (runtimeVersion === undefined) ahead.push({ id, fileVersion })
    else if (fileVersion > runtimeVersion) ahead.push({ id, fileVersion, runtimeVersion })
  }
  return ahead
}

// "moi 0.1.5, tldraw 5.3.0" when the stamp is there, else the sequences that
// are ahead — so the message can always name *what* is newer.
export function describeNewerWriter(
  writer: ScratchpadWriter | undefined,
  ahead: SequenceAhead[]
): string {
  if (writer) return `moi ${writer.moi}, tldraw ${writer.tldraw}`
  return ahead
    .map(a =>
      a.runtimeVersion === undefined
        ? `${a.id} v${a.fileVersion} (unknown here)`
        : `${a.id} v${a.fileVersion} > v${a.runtimeVersion}`
    )
    .join(', ')
}
