import { isAppIconId } from './app-icons'
import type { WorkspaceIcon } from './types'

export function isWorkspaceIcon(value: unknown): value is WorkspaceIcon {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const icon = value as Record<string, unknown>
  if (typeof icon.value !== 'string') return false
  if (icon.background !== undefined && icon.background !== 'theme') return false

  switch (icon.type) {
    case 'emoji':
      return icon.value.length > 0 && icon.value.length <= 64
    case 'glyph':
      return isAppIconId(icon.value)
    case 'upload':
      return icon.background === undefined
    default:
      return false
  }
}
