// Capability-based intent routing (docs/intents.md): views DECLARE named
// intents in their config, and emitters dispatch by intent name — the system
// routes to whichever view declares it. Nobody addresses a tab id directly,
// so renames and rebuilds never break a link. These helpers are shared by the
// client resolver and the server's CLI dispatch/manifest, so both sides agree
// on what resolves.
import type { ViewInfo } from './types'

// Intent names are kebab-case verbs (`open-product`). Shared by the config
// extractor (skip malformed declarations) and the CLI dispatch validation.
export const INTENT_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

// One dispatch: an intent name, optional params, and the originating emitter
// (`widget:products`, `view:crm`, or `cli`).
export type IntentDispatch = {
  name: string
  params?: Record<string, unknown>
  source: string
}

// One declared intent with the view that declares it — a row of the workspace
// capability manifest (`moi intents`).
export type WorkspaceIntent = {
  name: string
  description?: string
  params?: Record<string, string>
  viewId: string
}

// Every declared intent across the workspace's views, in view (nav) order.
// Duplicate names keep every row — dispatch resolves to the first declarer
// (a chooser for multiple handlers is deliberately deferred).
export function collectIntents(views: ViewInfo[]): WorkspaceIntent[] {
  const out: WorkspaceIntent[] = []
  for (const view of views) {
    for (const intent of view.config.intents ?? []) {
      out.push({
        name: intent.name,
        ...(intent.description ? { description: intent.description } : {}),
        ...(intent.params ? { params: intent.params } : {}),
        viewId: view.id
      })
    }
  }
  return out
}

// Declared intent names, deduped, in declaration order — the terse list the
// moi-context envelope carries as `availableIntents`.
export function intentNames(views: ViewInfo[]): string[] {
  return [...new Set(collectIntents(views).map(intent => intent.name))]
}

// The routing rule: the first view whose config declares `name`, or null when
// nothing does (an unresolved dispatch — journaled client-side, refused by
// the CLI server-side).
export function resolveIntentView(views: ViewInfo[], name: string): ViewInfo | null {
  return views.find(view => (view.config.intents ?? []).some(i => i.name === name)) ?? null
}
