export function validateWorkspaceName(name: string): string | null {
  if (!name.trim()) return 'Workspace name is required'
  if (name.length > 100) return 'Workspace name is too long (max 100 characters)'
  return null
}

export function workspaceIdFromName(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 60)
      .replace(/^-|-$/g, '') || 'workspace'
  )
}
