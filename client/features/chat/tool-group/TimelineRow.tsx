// Timeline rail primitives shared by every row in <ToolCallGroup>: the row
// wrapper that draws the 1px vertical rule + node, the disclosure chevron, the
// shared header layout, and the node-box markers (icon / MCP logo). Kept free of
// any dependency on the rows themselves, so both ToolCallGroup and SubagentCard
// can build on them without a cycle.
import type { ReactNode } from 'react'

import { IconChevronRight, IconLoader2, IconPackage } from '@tabler/icons-react'
import { motion } from 'motion/react'

import { IconMcp } from '@/client/features/connectors/IconMcp'
import { cn } from '@/client/lib/cn'

// Where a row sits in the group — drives which rail segments to draw so the rule
// starts on the first node and ends on the last.
export type RowPosition = { isFirst: boolean; isLast: boolean }

// Header layout shared by every row's clickable button. The `group/row` token
// lives here (on the button, not the row wrapper) so a nested sub-timeline's
// chevrons don't all reveal when a parent card is hovered.
export const HEADER = 'group/row flex w-full items-center gap-2 py-1.5 text-left select-none'

// Row wrapper + left timeline rail: one node per row linked by a 1px vertical
// rule. The node sits at the header's first-line center (`top-[15px]`); the rule
// above spans 0→node, below spans node→bottom (covering an expanded body down to
// the next node). Adjacent rows are flush, so segments join. `marker` replaces
// the dot with a custom node (e.g. an MCP server logo).
type TimelineRowProps = RowPosition & {
  marker?: ReactNode
  // In-progress dotted row: a small spinner replaces the dot node (ignored when
  // `marker` is set — icon rows keep their logo and spin in the header).
  loading?: boolean
  isError?: boolean
  children: ReactNode
}
export function TimelineRow({
  isFirst,
  isLast,
  marker,
  loading = false,
  isError = false,
  children
}: TimelineRowProps) {
  return (
    <div className="relative flex gap-2.5">
      {/* Odd rail width (13px) puts the centerline on a half-pixel, so a crisp
          1px rule lands on a single pixel column instead of straddling two. */}
      <div className="relative w-[13px] shrink-0">
        {!isFirst && (
          <span className="absolute top-0 left-1/2 h-3 w-px -translate-x-1/2 bg-border" />
        )}
        {!isLast && (
          <span className="absolute top-[18px] bottom-0 left-1/2 w-px -translate-x-1/2 bg-border" />
        )}
        {marker ? (
          <span className="absolute top-[15px] left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            {marker}
          </span>
        ) : loading ? (
          // A spinner node stands in for the dot; bg-background carves the rule.
          <span className="absolute top-[15px] left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 rounded-full bg-background p-0.5">
            <IconLoader2 size={12} stroke={1.75} className="animate-spin text-ring" />
          </span>
        ) : (
          // Background-colored ring carves a gap in the rule around the dot.
          <span
            className={cn(
              'absolute top-[15px] left-1/2 z-10 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-3 ring-background',
              isError ? 'bg-destructive' : 'bg-border'
            )}
          />
        )}
      </div>
      {children}
    </div>
  )
}

// Disclosure chevron — hidden until its own header (group/row) is hovered or the
// row is open; rotates with a spring (same feel as the meta-ficus accordion). The
// group lives on the header button, not the whole row, so a nested sub-timeline's
// chevrons don't all reveal when the parent card is hovered.
export function RowChevron({ open }: { open: boolean }) {
  return (
    <motion.span
      animate={{ rotate: open ? 90 : 0 }}
      transition={{ type: 'spring', duration: 0.2, bounce: 0.1 }}
      className={cn(
        'flex shrink-0',
        open ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'
      )}
    >
      <IconChevronRight size={12} stroke={1.75} />
    </motion.span>
  )
}

// A rounded node box used as a timeline marker (size-4 by default). The bg-colored
// ring carves it out of the rule, matching the dot rows. Shared by the MCP logo,
// the skill node, and the (larger) subagent node; pass `className` to resize.
export function NodeBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-4 items-center justify-center overflow-hidden rounded-[4px] bg-muted ring-2 ring-background',
        className
      )}
    >
      {children}
    </span>
  )
}

// A Tabler icon centered in the node box (e.g. the skill package node, or the
// MCP fallback plug). size/stroke default to the plug's values; the skill node
// overrides them.
export function IconMarker({
  icon: Icon,
  size = 12,
  stroke = 1.75
}: {
  icon: typeof IconPackage
  size?: number
  stroke?: number
}) {
  return (
    <NodeBox>
      <Icon size={size} stroke={stroke} className="text-muted-foreground" />
    </NodeBox>
  )
}

// The MCP server logo, used as the timeline node. Falls back to the generic MCP
// glyph (same as the workspace header) when the server has no known logo.
export function McpLogo({ src }: { src?: string }) {
  if (!src)
    return (
      <NodeBox>
        <IconMcp className="size-3 text-muted-foreground" />
      </NodeBox>
    )
  return (
    <NodeBox>
      <img src={src} alt="" className="size-full object-cover" />
    </NodeBox>
  )
}
