import { useRef } from 'react'
import type { ReactNode } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../components/ui/resizable'

import type { WorkspaceSplitLayoutConstraints } from './useFitsSplitLayout'

type WorkspaceSplitLayoutProps = WorkspaceSplitLayoutConstraints & {
  workspace: ReactNode
  chat: ReactNode
  chatWidth: number
  onChatWidthChange: (width: number) => void
}

export function WorkspaceSplitLayout({
  workspace,
  chat,
  workspaceMinWidth,
  chatMinWidth,
  chatMaxWidth,
  chatWidth,
  onChatWidthChange
}: WorkspaceSplitLayoutProps) {
  const chatPanelRef = useRef<PanelImperativeHandle>(null)

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="overflow-visible!"
      onLayoutChanged={(_layout, meta) => {
        if (meta.isUserInteraction) {
          requestAnimationFrame(() => {
            const size = chatPanelRef.current?.getSize()
            if (size) onChatWidthChange(Math.round(size.inPixels))
          })
        }
      }}
    >
      <ResizablePanel id="workspace" className="overflow-visible!" minSize={workspaceMinWidth}>
        <div data-slot="workspace-split-workspace" className="flex h-full min-h-0 min-w-0 flex-col">
          {workspace}
        </div>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize chat" />
      <ResizablePanel
        id="chat"
        defaultSize={chatWidth}
        minSize={chatMinWidth}
        maxSize={chatMaxWidth}
        groupResizeBehavior="preserve-pixel-size"
        panelRef={chatPanelRef}
      >
        {/* Keep chat content in its own layout boundary so a later enter/exit
            transition can move it without coupling animation to resizing. */}
        <div data-slot="workspace-split-chat" className="flex h-full min-h-0 min-w-0 flex-col">
          {chat}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
