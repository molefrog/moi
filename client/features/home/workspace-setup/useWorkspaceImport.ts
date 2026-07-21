import { useState } from 'react'

import { useImportWorkspace } from '../api'
import { WORKSPACE_TYPE_ORDER } from '@/lib/workspace-types'
import type { DiscoveredWorkspace, WorkspaceEntry, WorkspaceType } from '@/lib/types'

export function workspaceImportDefaultType(workspace: DiscoveredWorkspace): WorkspaceType {
  return workspace.types[0] ?? WORKSPACE_TYPE_ORDER[0]
}

type UseWorkspaceImportProps = {
  onSuccess: (entry: WorkspaceEntry) => void
}

export type WorkspaceImportChoice = {
  workspace: DiscoveredWorkspace
  selectedType: WorkspaceType
}

export function useWorkspaceImport({ onSuccess }: UseWorkspaceImportProps) {
  const mutation = useImportWorkspace()
  const [choice, setChoice] = useState<WorkspaceImportChoice | null>(null)

  function startImport(workspace: DiscoveredWorkspace) {
    mutation.reset()
    setChoice({
      workspace,
      selectedType: workspaceImportDefaultType(workspace)
    })
  }

  function selectType(type: WorkspaceType) {
    setChoice(current => (current ? { ...current, selectedType: type } : current))
  }

  function submit() {
    if (!choice || mutation.isPending) return
    mutation.mutate(
      {
        path: choice.workspace.path,
        type: choice.selectedType
      },
      { onSuccess }
    )
  }

  function reset() {
    setChoice(null)
    mutation.reset()
  }

  return {
    choice,
    isPending: mutation.isPending,
    error: mutation.error,
    startImport,
    selectType,
    submit,
    reset
  }
}
