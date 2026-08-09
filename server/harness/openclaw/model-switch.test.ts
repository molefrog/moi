// Deciding whether a send needs `sessions.patch { model }`.
//
// The patch writes agent config, so it is skipped when nothing changed — but
// the skip has to be exact about what "changed" means. `anthropic/claude-sonnet-5`
// and `claude-cli/claude-sonnet-5` are BOTH in the catalog (`models list --all`)
// and name different runtimes for the same model, so a user can pick between
// them and the switch has to reach the gateway. Meanwhile a session pinned to a
// CLI runtime can echo that runtime back as its provider, which names the same
// model and must not read as an external change.
import { describe, expect, test } from 'bun:test'

import { openClawModelRefsEquivalent } from './thinking'

// The decision under test, mirrored from applySessionSettings. Kept as a small
// pure function here because the real one is buried behind a gateway call.
function needsModelPatch(
  requested: string,
  state: { requestedModel?: string; wireModel?: string }
): boolean {
  const drifted =
    state.wireModel && state.requestedModel
      ? !openClawModelRefsEquivalent(state.wireModel, state.requestedModel)
      : false
  return requested !== state.requestedModel || drifted
}

describe('when a send has to patch the model', () => {
  test('the first send on a session patches', () => {
    expect(needsModelPatch('anthropic/claude-sonnet-5', {})).toBe(true)
  })

  test('sending the same pick again does not', () => {
    expect(
      needsModelPatch('anthropic/claude-sonnet-5', {
        requestedModel: 'anthropic/claude-sonnet-5',
        wireModel: 'anthropic/claude-sonnet-5'
      })
    ).toBe(false)
  })

  test('switching between two runtimes of one model patches', () => {
    // The regression: treating these as equivalent silently dropped the switch
    // and left the session on the runtime the user just moved away from.
    expect(
      needsModelPatch('claude-cli/claude-sonnet-5', {
        requestedModel: 'anthropic/claude-sonnet-5',
        wireModel: 'anthropic/claude-sonnet-5'
      })
    ).toBe(true)
    expect(
      needsModelPatch('anthropic/claude-sonnet-5', {
        requestedModel: 'claude-cli/claude-sonnet-5',
        wireModel: 'claude-cli/claude-sonnet-5'
      })
    ).toBe(true)
  })

  test('a row echoing the runtime as provider is not a change', () => {
    // We asked for `anthropic/…`; the row came back `claude-cli/…` because the
    // config resolves that model through the CLI runtime. Same model — patching
    // again on every send would be pure round-trips.
    expect(
      needsModelPatch('anthropic/claude-sonnet-5', {
        requestedModel: 'anthropic/claude-sonnet-5',
        wireModel: 'claude-cli/claude-sonnet-5'
      })
    ).toBe(false)
  })

  test('a model changed outside moi is picked back up', () => {
    expect(
      needsModelPatch('anthropic/claude-sonnet-5', {
        requestedModel: 'anthropic/claude-sonnet-5',
        wireModel: 'ollama-cloud/glm-5.2:cloud'
      })
    ).toBe(true)
  })

  test('same model id under two real providers stays a change', () => {
    // `kimi-k3:cloud` exists under more than one provider with different menus;
    // only a runtime alias collapses, and neither of these is one.
    expect(openClawModelRefsEquivalent('ollama/kimi-k3:cloud', 'openai/kimi-k3:cloud')).toBe(false)
  })
})
