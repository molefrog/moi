import { IconArticle, type TablerIcon } from '@tabler/icons-react'

import { resolveIdentityIcon } from '@/client/lib/identity-icon-registry'
import type { ViewInfo } from '@/lib/types'

export function getViewLabel(view: ViewInfo): string {
  return view.title || (view.status === 'compiled' ? view.id : 'New view')
}

export function getViewIcon(view: ViewInfo): TablerIcon {
  return resolveIdentityIcon(view.icon) ?? IconArticle
}
