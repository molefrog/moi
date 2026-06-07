import { IconRobotFace } from '@tabler/icons-react'

import { useWorkspacePreview } from '@/client/api/workspaces'

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
    <div className="bg-muted flex size-24 shrink-0 items-center justify-center rounded-lg p-2">
      {hasItems && (
        <svg
          viewBox={`0 0 ${cols} ${rows}`}
          preserveAspectRatio="none"
          className="animate-in fade-in size-full duration-300"
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
        <IconRobotFace
          size={20}
          stroke={1.5}
          className="text-muted-foreground/40 animate-in fade-in duration-300"
        />
      )}
    </div>
  )
}
