import { describe, expect, test } from 'bun:test'

import {
  CODEX_LOCAL_CONTROL_CONTEXT,
  CODEX_LOCAL_CONTROL_FALLBACK,
  CODEX_THREAD_ACCESS,
  CODEX_TURN_ACCESS
} from './permissions'
import { stripMoiContext } from '@/lib/moi-context'

describe('Codex reviewed access', () => {
  test('defines reviewed workspace access for threads', () => {
    expect(CODEX_THREAD_ACCESS).toEqual({
      sandbox: 'workspace-write',
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review'
    })
  })

  test('defines reviewed network access for turns', () => {
    expect(CODEX_TURN_ACCESS).toEqual({
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review',
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false
      }
    })
  })

  test('explains reviewed local control access without leaking into replay', () => {
    expect(CODEX_LOCAL_CONTROL_CONTEXT).toEqual({
      'moi-control-access': {
        value: expect.stringContaining('sandbox_permissions set to require_escalated'),
        kind: 'application'
      }
    })
    expect(stripMoiContext(CODEX_LOCAL_CONTROL_FALLBACK)).toBe('')
  })
})
