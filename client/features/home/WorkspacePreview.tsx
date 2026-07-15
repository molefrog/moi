import { IconGhost } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'

import { useWorkspacePreview } from './api'

type WorkspacePreviewProps = {
  workspaceId: string
}

// Loose-stack placement for up to 4 thumbnails, bottom-to-top: the buried
// cards sit askew, the top one lands nearly straight. Later array entries
// render later, i.e. on top. On card hover the pile fans out a little.
const STACK = [
  cn(
    '-translate-x-[16%] -translate-y-[13%] -rotate-[11deg]',
    'group-hover:-translate-x-[21%] group-hover:-translate-y-[17%] group-hover:-rotate-[14deg]'
  ),
  cn(
    'translate-x-[17%] -translate-y-[3%] rotate-[8deg]',
    'group-hover:translate-x-[23%] group-hover:-translate-y-[5%] group-hover:rotate-[11deg]'
  ),
  cn(
    '-translate-x-[5%] translate-y-[14%] -rotate-[5deg]',
    'group-hover:-translate-x-[7%] group-hover:translate-y-[19%] group-hover:-rotate-[7deg]'
  ),
  cn('translate-x-[2%] rotate-[2deg]', 'group-hover:rotate-[1deg]')
]

// The workspace card's preview tile: a square muted stage with the captured
// widget thumbnails piled in the middle. No layout map, no ordering — just a
// stack that reads "this space has stuff in it".
export function WorkspacePreview({ workspaceId }: WorkspacePreviewProps) {
  const query = useWorkspacePreview(workspaceId)

  const thumbnails = query.data?.thumbnails ?? []
  const isEmpty = query.data !== undefined && thumbnails.length === 0
  // Fill slots from the top of the pile down, so a lone thumbnail gets the
  // straight top slot instead of a buried crooked one.
  const slots = STACK.slice(STACK.length - thumbnails.length)

  return (
    <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm bg-muted">
      {thumbnails.map((src, index) => (
        <img
          key={index}
          src={src}
          alt=""
          loading="lazy"
          className={cn(
            'absolute max-h-[55%] max-w-[64%] rounded-sm border border-border shadow-sm',
            'transition-transform duration-300 ease-out',
            'animate-in duration-300 fade-in',
            slots[index]
          )}
        />
      ))}
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
