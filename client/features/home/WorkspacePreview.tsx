import { IconGhost } from '@tabler/icons-react'

import { useWorkspacePreview } from './api'

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

  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-sm bg-muted p-3">
      {hasItems && (
        <svg
          viewBox={`0 0 ${cols} ${rows}`}
          preserveAspectRatio="none"
          className="size-full animate-in duration-300 fade-in"
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
