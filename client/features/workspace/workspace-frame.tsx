import type { MouseEventHandler, ReactNode } from 'react'

import { useUiStore } from '@/client/store/ui'
import type { LayoutMode } from '@/lib/types'

import { useFitsSplitLayout } from './use-fits-split-layout'
import { useWorkspaceLayoutCtx } from './workspace-layout-context'
import { WorkspaceSplitLayout } from './workspace-split-layout'

export function useWorkspaceFrame(expanded = false) {
  const { layout, setLayout, chatAvailable } = useWorkspaceLayoutCtx()
  const { ref, fits, constraints } = useFitsSplitLayout<HTMLDivElement>()
  const chatWidth = useUiStore(state => state.dockedChatWidth)
  const setChatWidth = useUiStore(state => state.setDockedChatWidth)
  const mode: LayoutMode =
    chatAvailable && !expanded && fits && layout.layoutMode === 'split' ? 'split' : 'fullscreen'
  const setMode = (layoutMode: LayoutMode) => setLayout({ layoutMode })

  return {
    ref,
    canUseSplit: chatAvailable && fits,
    constraints,
    mode,
    setMode,
    chatWidth,
    setChatWidth
  }
}

type WorkspaceFrameProps = {
  frame: ReturnType<typeof useWorkspaceFrame>
  workspace: ReactNode
  chat?: ReactNode
  children?: ReactNode
  onClick?: MouseEventHandler<HTMLDivElement>
}

// Ready content uses the saved pane geometry and chat width. Loading and setup
// render separately so unresolved readiness never mounts the split layout.
export function WorkspaceFrame({ frame, workspace, chat, children, onClick }: WorkspaceFrameProps) {
  const { ref, canUseSplit, constraints, mode, setMode, chatWidth, setChatWidth } = frame
  return (
    <div
      onClick={onClick}
      className="relative flex h-full min-h-0 flex-1 flex-col font-sans text-foreground"
    >
      <div ref={ref} className="flex min-h-0 flex-1">
        {canUseSplit && constraints ? (
          <WorkspaceSplitLayout
            {...constraints}
            workspace={workspace}
            chat={chat}
            open={mode === 'split'}
            chatWidth={chatWidth}
            onCollapse={() => setMode('fullscreen')}
            onChatWidthChange={setChatWidth}
          />
        ) : (
          workspace
        )}
      </div>
      {children}
    </div>
  )
}
