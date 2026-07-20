import { useState } from 'react'

import { useImportWorkspace } from './api'
import { orderWorkspaceTypes } from '@/lib/workspace-types'
import type { DiscoveredWorkspace, WorkspaceEntry, WorkspaceType } from '@/lib/types'

const DEFAULT_IMPORT_TYPE: WorkspaceType = 'claude-code'

export function workspaceImportDefaultType(workspace: DiscoveredWorkspace): WorkspaceType {
  return orderWorkspaceTypes(workspace.types)[0] ?? DEFAULT_IMPORT_TYPE
}

type UseWorkspaceImportProps = {
  onSuccess: (entry: WorkspaceEntry) => void
}

type WorkspaceImportChoice = {
  workspace: DiscoveredWorkspace
  selectedType: WorkspaceType
}

export function useWorkspaceImport({ onSuccess }: UseWorkspaceImportProps) {
  const mutation = useImportWorkspace()
  const [choice, setChoice] = useState<WorkspaceImportChoice | null>(null)

  function addWorkspace(workspace: DiscoveredWorkspace, type: WorkspaceType) {
    mutation.mutate(
      { path: workspace.path, type },
      {
        onSuccess
      }
    )
  }

  function startImport(workspace: DiscoveredWorkspace) {
    mutation.reset()
    setChoice({
      workspace,
      selectedType: workspaceImportDefaultType(workspace)
    })
  }

  function confirmImport() {
    if (!choice || mutation.isPending) return
    addWorkspace(choice.workspace, choice.selectedType)
  }

  function setSelectedType(type: WorkspaceType) {
    setChoice(current => {
      if (!current) return current
      return { ...current, selectedType: type }
    })
  }

  function reset() {
    setChoice(null)
    mutation.reset()
  }

  return {
    choice,
    isPending: mutation.isPending,
    error: mutation.error,
    importingPath: mutation.isPending ? mutation.variables?.path : undefined,
    startImport,
    setSelectedType,
    confirmImport,
    reset
  }
}
