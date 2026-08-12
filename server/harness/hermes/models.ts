// Hermes model catalog → moi's `Model`.
//
// Hermes merges every configured provider into one flat list (59 entries on a
// stock install) and names the provider in `description`, the same string for
// every model behind it:
//
//   { modelId: 'nous:anthropic/claude-opus-5',
//     name: 'Nous Portal · anthropic/claude-opus-5',
//     description: 'Provider: Nous Portal' }
//
// Passed through as-is that description makes the picker render dozens of
// identical rows, so the provider is hoisted to a group heading and stripped
// off the front of `name` where Hermes repeats it there. It does not always:
// the Ollama rows carry a bare `name` ('gpt-oss:20b') and name their provider
// in `description` alone, which is why the group comes from that field.
import type { Model } from '@/lib/types'

import type { AcpModelInfo } from '../acp/wire'

const PROVIDER_PREFIX = /^Provider:\s*/
// Hermes marks the model it would pick itself; moi tracks its own selection.
const CURRENT_SUFFIX = /\s*•\s*current$/

function providerOf(description: string | undefined): string | undefined {
  if (!description || !PROVIDER_PREFIX.test(description)) return undefined
  return description.replace(PROVIDER_PREFIX, '').replace(CURRENT_SUFFIX, '').trim() || undefined
}

// `custom:` namespaces a provider configured in config.yaml
// (`custom:ollama-launch:…`), but is also a provider id in its own right when
// nothing follows it (`custom:kimi-k2.7-code`, the base_url escape hatch, §2).
const CUSTOM_NAMESPACE = 'custom:'

// The provider half of `<provider>:<model>`, recovered by peeling the model
// label off the end rather than splitting on the first colon — model ids carry
// their own colons (`gpt-oss:20b`) and the namespace occupies the first slot.
function providerIdOf(modelId: string, displayName: string): string | undefined {
  if (!modelId.includes(':')) return undefined
  const suffix = `:${displayName}`
  const head = modelId.endsWith(suffix) ? modelId.slice(0, -suffix.length) : modelId.split(':')[0]
  if (!head) return undefined
  return head.startsWith(CUSTOM_NAMESPACE) ? head.slice(CUSTOM_NAMESPACE.length) : head
}

function hermesModel(info: AcpModelInfo): Model {
  const group = providerOf(info.description)
  const name = info.name?.trim() || info.modelId
  const prefix = group ? `${group} · ` : ''
  const stripped = prefix && name.startsWith(prefix) ? name.slice(prefix.length).trim() : ''
  const displayName = stripped || name
  const providerId = providerIdOf(info.modelId, displayName)

  return {
    value: info.modelId,
    displayName,
    ...(group ? { group } : {}),
    ...(providerId ? { providerId } : {}),
    // A description that is not the provider label is real prose — keep it.
    ...(!group && info.description ? { description: info.description } : {})
  }
}

// A configured provider is listed twice — once under its own id
// (`ollama-launch:gpt-oss:20b`) and once namespaced (`custom:ollama-launch:…`)
// — for the same endpoint and model. Both spellings work, so keep the first
// and drop rows the picker would render as an exact duplicate. Keyed on
// `providerId` where there is one, since both spellings normalize to it.
export function hermesModels(infos: AcpModelInfo[]): Model[] {
  const seen = new Set<string>()
  const out: Model[] = []
  for (const info of infos) {
    const model = hermesModel(info)
    const key = `${model.providerId ?? model.group ?? ''} ${model.displayName}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(model)
  }
  return out
}
