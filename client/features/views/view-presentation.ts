import { IconArticle, type TablerIcon } from '@tabler/icons-react'

import { resolveAppIcon } from '@/client/lib/app-icon-registry'
import type { ViewBuilder, ViewInfo } from '@/lib/types'

export function getViewLabel(view: ViewInfo): string {
  return view.config.title || view.id
}

export function getViewIcon(view: ViewInfo, builders: readonly ViewBuilder[]): TablerIcon {
  const builder = builders.find(candidate => candidate.viewId === view.id)
  return resolveAppIcon(view.config.icon) ?? resolveAppIcon(builder?.icon) ?? IconArticle
}
