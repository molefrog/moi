const CODEX_REVIEW = {
  approvalPolicy: 'on-request',
  approvalsReviewer: 'auto_review'
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
  'Commands that contact the moi control server, including moi tabs, bundle, tab, debug, call-server-fn, theme, and config, need localhost network access. Run them with sandbox_permissions set to require_escalated on the first attempt so Codex automatic review can approve or deny the request. A connection failure from a sandboxed attempt does not prove the control server is offline.'

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
