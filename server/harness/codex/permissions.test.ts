import { describe, expect, test } from 'bun:test'

import {
  type CodexThreadAccessParams,
  codexLocalControlAccessContext,
  codexServerRequestFallback,
  codexThreadAccessParams,
  codexTurnAccessParams
} from './permissions'

describe('Codex reviewed access', () => {
  test('uses the same reviewed workspace access for thread start and resume', () => {
    const expected: CodexThreadAccessParams = {
      sandbox: 'workspace-write',
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review'
    }

    expect(codexThreadAccessParams()).toEqual(expected)
    expect(codexThreadAccessParams()).toEqual(expected)
  })

  test('keeps network access reviewed on every turn', () => {
    expect(codexTurnAccessParams()).toEqual({
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

  test('tells Codex to request reviewed access before contacting the local control server', () => {
    expect(codexLocalControlAccessContext()).toEqual({
      'moi-control-access': {
        value: expect.stringContaining('sandbox_permissions set to require_escalated'),
        kind: 'application'
      }
    })
  })
})

describe('Codex unreviewed server requests', () => {
  test('declines modern and legacy command or file approvals', () => {
    expect(codexServerRequestFallback('item/commandExecution/requestApproval')).toEqual({
      result: { decision: 'decline' }
    })
    expect(codexServerRequestFallback('item/fileChange/requestApproval')).toEqual({
      result: { decision: 'decline' }
    })
    expect(codexServerRequestFallback('applyPatchApproval')).toEqual({
      result: { decision: 'decline' }
    })
    expect(codexServerRequestFallback('execCommandApproval')).toEqual({
      result: { decision: 'denied' }
    })
  })

  test('rejects requests that the automatic reviewer did not handle', () => {
    expect(codexServerRequestFallback('item/permissions/requestApproval')).toEqual({
      error: {
        code: -32601,
        message: 'moi does not handle item/permissions/requestApproval'
      }
    })
  })
})
