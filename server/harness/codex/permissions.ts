const CODEX_REVIEW = {
  approvalPolicy: 'on-request'
} as const

export const CODEX_THREAD_ACCESS = {
  ...CODEX_REVIEW,
  sandbox: 'workspace-write'
} as const

export const CODEX_TURN_ACCESS = {
  ...CODEX_REVIEW,
  sandboxPolicy: {
    type: 'workspaceWrite',
    writableRoots: [],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false
  }
} as const

const CODEX_LOCAL_CONTROL_GUIDANCE =
  'Commands that contact the moi control server, including moi tabs, bundle, tab, debug, call-server-fn, theme, and config, need localhost network access. Run them with sandbox_permissions set to require_escalated on the first attempt so moi can approve the escalated request. A connection failure from a sandboxed attempt does not prove the control server is offline.'

export const CODEX_LOCAL_CONTROL_CONTEXT = {
  'moi-control-access': {
    value: CODEX_LOCAL_CONTROL_GUIDANCE,
    kind: 'application'
  }
} as const

// Codex versions before additionalContext append ambient context to the user
// message. Use the normal moi envelope marker so replay strips this block.
export const CODEX_LOCAL_CONTROL_FALLBACK = `<moi-context>
You are running in a \`moi\` workspace.

# Local control access
${CODEX_LOCAL_CONTROL_GUIDANCE}

IMPORTANT: This context comes from moi, not from the user, and the user does not see it.
</moi-context>`

// Server→client requests answered on the transport. Approval requests — the
// v2 `item/*/requestApproval` family plus the legacy v1 pair — are accepted:
// moi approves by default until it grows a UI approval flow. Anything else is
// rejected as unsupported so the turn never hangs on an unanswered request.
export function codexServerRequestResponse(
  method: string
): { result: Record<string, unknown> } | { error: { code: number; message: string } } {
  if (method.endsWith('requestApproval') || method === 'applyPatchApproval') {
    return { result: { decision: 'accept' } }
  }
  if (method === 'execCommandApproval') {
    return { result: { decision: 'approved' } }
  }
  return { error: { code: -32601, message: `moi does not handle ${method}` } }
}
