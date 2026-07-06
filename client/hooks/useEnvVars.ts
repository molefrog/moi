import { useQueryClient } from '@tanstack/react-query'

import { useUpdateEnv, useWorkspaceEnv, workspaceKeys } from '@/client/api/workspaces'

import { useMeiEvent } from './useMeiEvents'

// Workspace env state in one hook: the masked env view (query), the patch
// mutation, and live tracking — anything that changes the env outside this
// client (the `moi env` CLI, another tab) makes the server broadcast
// `env:updated`, which invalidates the query so consumers stay fresh without
// wiring the subscription themselves.
export function useEnvVars(workspaceId: string) {
  const qc = useQueryClient()
  useMeiEvent(e => {
    if (e.type === 'env:updated' && e.workspaceId === workspaceId) {
      qc.invalidateQueries({ queryKey: workspaceKeys.env(workspaceId) })
    }
  })
  return { env: useWorkspaceEnv(workspaceId), update: useUpdateEnv(workspaceId) }
}
