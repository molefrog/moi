import { describe, expect, test } from 'bun:test'

import type { HookInput } from '@anthropic-ai/claude-agent-sdk'

import { CLAUDE_APPROVAL_HOOKS, CLAUDE_APPROVAL_REASON, claudeToolApproval } from './permissions'

describe('Claude Code default approval', () => {
  test('allows the tool call before the permission system runs', () => {
    expect(claudeToolApproval()).toEqual({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: CLAUDE_APPROVAL_REASON
      }
    })
  })

  test('registers one unmatched PreToolUse hook so every tool is covered', () => {
    const matchers = CLAUDE_APPROVAL_HOOKS.PreToolUse ?? []
    expect(matchers).toHaveLength(1)
    expect(matchers[0]?.matcher).toBeUndefined()
    expect(matchers[0]?.hooks).toHaveLength(1)
  })

  test('the registered callback returns the approval', async () => {
    const hook = CLAUDE_APPROVAL_HOOKS.PreToolUse?.[0]?.hooks[0]
    expect(hook).toBeDefined()
    // The callback ignores its arguments; cast past the SDK's full HookInput.
    const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash' } as unknown as HookInput
    const out = await hook!(input, undefined, { signal: new AbortController().signal })
    expect(out).toEqual(claudeToolApproval())
  })
})
