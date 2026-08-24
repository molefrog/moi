import { describe, expect, test } from 'bun:test'

import {
  CODEX_LOCAL_CONTROL_CONTEXT,
  CODEX_LOCAL_CONTROL_FALLBACK,
  CODEX_THREAD_ACCESS,
  CODEX_TURN_ACCESS,
  codexServerRequestResponse
} from './permissions'
import { stripMoiContext } from '@/lib/moi-context'

describe('Codex reviewed access', () => {
  test('defines sandboxed workspace access for threads', () => {
    expect(CODEX_THREAD_ACCESS).toEqual({
      sandbox: 'workspace-write',
      approvalPolicy: 'on-request'
    })
  })

  test('defines sandboxed network access for turns', () => {
    expect(CODEX_TURN_ACCESS).toEqual({
      approvalPolicy: 'on-request',
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

describe('codexServerRequestResponse', () => {
  test('accepts v2 approval requests', () => {
    for (const method of [
      'item/commandExecution/requestApproval',
      'item/fileChange/requestApproval',
      'item/permissions/requestApproval'
    ]) {
      expect(codexServerRequestResponse(method)).toEqual({ result: { decision: 'accept' } })
    }
  })

  test('accepts legacy v1 approval requests with their decision vocabulary', () => {
    expect(codexServerRequestResponse('applyPatchApproval')).toEqual({
      result: { decision: 'accept' }
    })
    expect(codexServerRequestResponse('execCommandApproval')).toEqual({
      result: { decision: 'approved' }
    })
  })

  test('rejects non-approval requests as unsupported', () => {
    expect(codexServerRequestResponse('item/tool/call')).toEqual({
      error: { code: -32601, message: 'moi does not handle item/tool/call' }
    })
  })
})
