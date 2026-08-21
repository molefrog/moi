export type CodexThreadAccessParams = {
  sandbox: 'workspace-write'
  approvalPolicy: 'on-request'
  approvalsReviewer: 'auto_review'
}

export type CodexTurnAccessParams = {
  approvalPolicy: 'on-request'
  approvalsReviewer: 'auto_review'
  sandboxPolicy: {
    type: 'workspaceWrite'
    writableRoots: string[]
    networkAccess: false
    excludeTmpdirEnvVar: false
    excludeSlashTmp: false
  }
}

export type CodexLocalControlAccessContext = {
  'moi-control-access': {
    value: string
    kind: 'application'
  }
}

type CodexServerRequestFallback =
  | { result: { decision: 'decline' | 'denied' } }
  | { error: { code: -32601; message: string } }

export function codexThreadAccessParams(): CodexThreadAccessParams {
  return {
    sandbox: 'workspace-write',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review'
  }
}

export function codexTurnAccessParams(): CodexTurnAccessParams {
  return {
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review',
    sandboxPolicy: {
      type: 'workspaceWrite',
      writableRoots: [],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false
    }
  }
}

export function codexLocalControlAccessContext(): CodexLocalControlAccessContext {
  return {
    'moi-control-access': {
      value:
        'Commands that contact the moi control server, including moi tabs, bundle, tab, debug, call-server-fn, theme, and config, need localhost network access. Run them with sandbox_permissions set to require_escalated on the first attempt so Codex automatic review can approve or deny the request. A connection failure from a sandboxed attempt does not prove the control server is offline.',
      kind: 'application'
    }
  }
}

export function codexServerRequestFallback(method: string): CodexServerRequestFallback {
  if (
    method === 'item/commandExecution/requestApproval' ||
    method === 'item/fileChange/requestApproval' ||
    method === 'applyPatchApproval'
  ) {
    return { result: { decision: 'decline' } }
  }
  if (method === 'execCommandApproval') {
    return { result: { decision: 'denied' } }
  }
  return {
    error: {
      code: -32601,
      message: `moi does not handle ${method}`
    }
  }
}
