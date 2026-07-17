import { IconGhost } from '@tabler/icons-react'

import { useWorkspacePreview } from './api'
import { cn } from '@/client/lib/cn'

type WorkspacePreviewProps = {
  workspaceId: string
}

export function WorkspacePreview({ workspaceId }: WorkspacePreviewProps) {
  const query = useWorkspacePreview(workspaceId)

  const items = query.data?.items ?? []
  const cols = query.data?.cols ?? 4
  const rows = items.length ? Math.max(...items.map(i => i.y + i.h)) : 0
  const hasItems = items.length > 0 && rows > 0
  const isEmpty = query.data !== undefined && !hasItems

  const overflows = rows > cols

  return (
    <div
      className={cn(
        'flex aspect-square w-full justify-center overflow-hidden rounded-sm bg-muted p-3',
        overflows ? 'items-start' : 'items-center'
      )}
    >
      {hasItems && (
        <svg
          viewBox={`0 0 ${cols} ${rows}`}
          className="w-full shrink-0 animate-in duration-300 fade-in"
        >
          {items.map((item, i) => (
            <rect
              key={i}
              x={item.x + 0.06}
              y={item.y + 0.06}
              width={item.w - 0.12}
              height={item.h - 0.12}
              rx={0.12}
              className="fill-muted-foreground/30"
            />
          ))}
        </svg>
      )}
      {isEmpty && (
        <IconGhost
          size={20}
          stroke={1.5}
          className="animate-in text-muted-foreground/40 duration-300 fade-in"
        />
      )}
    </div>
  )
}
