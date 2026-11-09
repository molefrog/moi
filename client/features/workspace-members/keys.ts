export const memberKeys = {
  all: ['workspace-members'] as const,
  account: (accountId: string | undefined) => [...memberKeys.all, accountId ?? 'unknown'] as const,
  workspace: (accountId: string | undefined, workspaceId: string) =>
    [...memberKeys.account(accountId), workspaceId] as const
}
