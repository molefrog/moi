import { useState } from 'react'

import { useImportWorkspace } from './api'
import { orderWorkspaceTypes } from '@/lib/workspace-types'
import type { DiscoveredWorkspace, WorkspaceEntry, WorkspaceType } from '@/lib/types'

const UNDETECTED_IMPORT_TYPES: WorkspaceType[] = ['claude-code', 'codex']

export function workspaceImportTypes(workspace: DiscoveredWorkspace): WorkspaceType[] {
  return workspace.types.length > 0
    ? orderWorkspaceTypes(workspace.types)
    : [...UNDETECTED_IMPORT_TYPES]
}

export type WorkspaceImportDecision =
  | { kind: 'direct'; type: WorkspaceType }
  | { kind: 'choose'; types: WorkspaceType[]; selectedType: WorkspaceType }

export function workspaceImportDecision(workspace: DiscoveredWorkspace): WorkspaceImportDecision {
  const types = workspaceImportTypes(workspace)
  return types.length === 1
    ? { kind: 'direct', type: types[0] }
    : { kind: 'choose', types, selectedType: types[0] }
}

type UseWorkspaceImportProps = {
  onSuccess: (entry: WorkspaceEntry) => void
}

type WorkspaceImportChoice = {
  workspace: DiscoveredWorkspace
  types: WorkspaceType[]
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

  function startImport(workspace: DiscoveredWorkspace): WorkspaceImportDecision {
    mutation.reset()
    const decision = workspaceImportDecision(workspace)
    if (decision.kind === 'direct') {
      setChoice(null)
      addWorkspace(workspace, decision.type)
      return decision
    }

    setChoice({
      workspace,
      types: decision.types,
      selectedType: decision.selectedType
    })
    return decision
  }

  function confirmImport() {
    if (!choice || mutation.isPending) return
    addWorkspace(choice.workspace, choice.selectedType)
  }

  function setSelectedType(type: WorkspaceType) {
    setChoice(current => {
      if (!current?.types.includes(type)) return current
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
