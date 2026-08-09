import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../components/ui/resizable'
import { cn } from '../../lib/cn'

import type { WorkspaceSplitLayoutConstraints } from './useFitsSplitLayout'

type WorkspaceSplitLayoutProps = WorkspaceSplitLayoutConstraints & {
  workspace: ReactNode
  chat: ReactNode
  open: boolean
  chatWidth: number
  onCollapse: () => void
  onChatWidthChange: (width: number) => void
}

export function WorkspaceSplitLayout({
  workspace,
  chat,
  open,
  workspaceMinWidth,
  chatMinWidth,
  chatMaxWidth,
  chatWidth,
  onCollapse,
  onChatWidthChange
}: WorkspaceSplitLayoutProps) {
  const chatPanelRef = useRef<PanelImperativeHandle>(null)
  const transitionFrameRef = useRef<number | null>(null)
  const [transitionsEnabled, setTransitionsEnabled] = useState(false)
  const openChatWidth = Math.min(Math.max(chatWidth, chatMinWidth), chatMaxWidth)
  const defaultChatSize = useRef(open ? openChatWidth : 0).current

  useLayoutEffect(() => {
    const chatPanel = chatPanelRef.current
    if (!chatPanel) return

    if (open) {
      chatPanel.resize(openChatWidth)
    } else {
      chatPanel.collapse()
    }
  }, [openChatWidth, open])

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className={cn(
        'overflow-visible!',
        transitionsEnabled &&
          '[&>#chat]:transition-[flex-grow] [&>#chat]:duration-200 [&>#chat]:ease-in-out motion-reduce:[&>#chat]:transition-none!',
        transitionsEnabled && 'has-[[data-separator=active]]:[&>#chat]:transition-none!'
      )}
      onLayoutChanged={(_layout, meta) => {
        if (!transitionsEnabled && transitionFrameRef.current === null) {
          transitionFrameRef.current = requestAnimationFrame(() => {
            setTransitionsEnabled(true)
          })
        }

        if (meta.isUserInteraction) {
          requestAnimationFrame(() => {
            const chatPanel = chatPanelRef.current
            if (!chatPanel) return
            const size = chatPanel.getSize()
            if (size.inPixels > 0) onChatWidthChange(Math.round(size.inPixels))
          })
        }
      }}
    >
      <ResizablePanel id="workspace" className="overflow-visible!" minSize={workspaceMinWidth}>
        <div data-slot="workspace-split-workspace" className="flex h-full min-h-0 min-w-0 flex-col">
          {workspace}
        </div>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize chat" disabled={!open} />
      <ResizablePanel
        id="chat"
        aria-hidden={!open}
        inert={!open}
        collapsible
        collapsedSize={0}
        defaultSize={defaultChatSize}
        minSize={chatMinWidth}
        maxSize={chatMaxWidth}
        groupResizeBehavior="preserve-pixel-size"
        panelRef={chatPanelRef}
        onResize={(size, _id, previousSize) => {
          if (open && size.inPixels === 0 && previousSize && previousSize.inPixels > 0) {
            onCollapse()
          }
        }}
        className={cn(
          'overflow-hidden!',
          transitionsEnabled &&
            'transition-opacity duration-200 ease-in-out motion-reduce:transition-none',
          open ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div
          data-slot="workspace-split-chat"
          className="flex h-full min-h-0 min-w-(--chat-min) flex-col"
        >
          {chat}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
