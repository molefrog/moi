import { useEffect, useRef, useState } from 'react'

import { IconVersions } from '@tabler/icons-react'
import {
  type TLEditorSnapshot,
  type TLStore,
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils
} from 'tldraw'

import { describeNewerWriter, sequencesAhead } from '@/lib/scratchpad-skew'
import type { ScratchpadWriter } from '@/lib/types'

export type ScratchpadFetch = {
  document: TLEditorSnapshot['document'] | null
  writer?: ScratchpadWriter
}

export type ScratchpadSkew = {
  newer: boolean
  writer?: ScratchpadWriter
  detail: string
}

let runtimeSchemaCache: TLStore['schema'] | null = null

function runtimeSchema(): TLStore['schema'] {
  runtimeSchemaCache ??= createTLStore({
    shapeUtils: defaultShapeUtils,
    bindingUtils: defaultBindingUtils
  }).schema
  return runtimeSchemaCache
}

export function detectScratchpadSkew(
  document: NonNullable<TLEditorSnapshot['document']>,
  writer: ScratchpadWriter | undefined
): ScratchpadSkew | null {
  const schema = runtimeSchema()
  try {
    if (schema.migrateStoreSnapshot(document).type === 'success') return null
  } catch {}
  const ahead = sequencesAhead(document.schema, schema.serialize().sequences)
  if (ahead.length > 0) {
    return { newer: true, writer, detail: describeNewerWriter(writer, ahead) }
  }
  return { newer: false, writer, detail: 'The saved snapshot failed to load.' }
}

export function useScratchpadSnapshot(workspaceId: string): {
  loaded: boolean
  snapshot: TLEditorSnapshot['document'] | undefined
  skew: ScratchpadSkew | null
  flagSkew: (skew: ScratchpadSkew) => void
} {
  const [loaded, setLoaded] = useState(false)
  const [skew, setSkew] = useState<ScratchpadSkew | null>(null)
  const snapshot = useRef<TLEditorSnapshot['document'] | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setSkew(null)
    snapshot.current = undefined
    fetch(`/api/workspaces/${workspaceId}/scratchpad`)
      .then(response => response.json())
      .then((data: ScratchpadFetch) => {
        if (cancelled) return
        if (data?.document) {
          const found = detectScratchpadSkew(data.document, data.writer)
          if (found) setSkew(found)
          else snapshot.current = data.document
        }
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  return { loaded, snapshot: snapshot.current, skew, flagSkew: setSkew }
}

export function ScratchpadSkewNotice({ skew }: { skew: ScratchpadSkew }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/40 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:16px_16px] p-6">
      <div className="flex max-w-md animate-in flex-col gap-3 rounded-md bg-background p-6 shadow-xs duration-200 fade-in-0 zoom-in-95">
        <div className="flex items-center gap-2">
          <IconVersions size={20} stroke={1.5} className="shrink-0 text-amber-600" />
          <h2 className="font-medium text-foreground">
            {skew.newer ? 'This canvas needs a newer moi' : 'This canvas couldn’t be loaded'}
          </h2>
        </div>
        {skew.newer ? (
          <>
            <p className="text-sm text-pretty text-muted-foreground">
              This scratchpad was saved by a newer version of moi
              {skew.writer ? ` (v${skew.writer.moi})` : ''}.<br /> Please update moi and restart the
              server:
            </p>
            <code className="self-start rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
              bun install -g moi-computer@latest
            </code>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{skew.detail}</p>
        )}
      </div>
    </div>
  )
}
