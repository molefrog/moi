// Deciding whether a send needs `sessions.patch { model }`.
//
// The patch writes agent config, so it is skipped when nothing changed — but
// the skip has to be exact about what "changed" means. `anthropic/claude-sonnet-5`
// and `claude-cli/claude-sonnet-5` are BOTH in the catalog (`models list --all`)
// and name different runtimes for the same model, so a user can pick between
// them and the switch has to reach the gateway. Rows echo back the provider of
// the ref that was patched (verified live), so an exact compare is enough on
// both sides.
import { describe, expect, test } from 'bun:test'

// The decision under test, mirrored from applySessionSettings. Kept as a small
// pure function here because the real one is buried behind a gateway call.
function needsModelPatch(
  requested: string,
  state: { requestedModel?: string; wireModel?: string }
): boolean {
  const moved = state.wireModel !== undefined && state.wireModel !== state.requestedModel
  return requested !== state.requestedModel || moved
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

  test('a model changed outside moi is picked back up', () => {
    expect(
      needsModelPatch('anthropic/claude-sonnet-5', {
        requestedModel: 'anthropic/claude-sonnet-5',
        wireModel: 'ollama-cloud/glm-5.2:cloud'
      })
    ).toBe(true)
  })

  test('the same model id under two providers is still a change', () => {
    // `kimi-k3:cloud` exists under more than one provider, with different menus.
    expect(
      needsModelPatch('openai/kimi-k3:cloud', {
        requestedModel: 'ollama/kimi-k3:cloud',
        wireModel: 'ollama/kimi-k3:cloud'
      })
    ).toBe(true)
  })
})
