import { Component, type ErrorInfo, type ReactNode } from 'react'

import { IconAlertTriangle } from '@tabler/icons-react'

import { reportAppletError } from '@/client/features/applets/applet-log'
import type { AppletKind } from '@/lib/types'

type WidgetErrorBoundaryProps = {
  name: string
  // Applet attribution for the error journal (docs/self-correction.md). The
  // boundary wraps both widgets (WidgetShell) and views (WorkspaceScreen).
  kind: AppletKind
  workspaceId: string
  resetKey: number
  children: ReactNode
}

type State = { error: Error | null }

export class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[widget:${this.props.name}]`, error, info.componentStack)
    // Journal the crash so `moi debug logs` can surface it to the agent — the
    // console line above dies in a console nobody reads.
    reportAppletError(this.props.workspaceId, {
      source: 'render',
      kind: this.props.kind,
      name: this.props.name,
      message: error.message || String(error),
      stack: [error.stack, info.componentStack].filter(Boolean).join('\n')
    })
  }

  componentDidUpdate(prev: WidgetErrorBoundaryProps) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-start justify-start gap-1.5 p-4 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-destructive">
            <IconAlertTriangle size={16} stroke={1.75} />
            Widget crashed
          </div>
          <div className="font-mono break-words text-muted-foreground">
            {this.state.error.message}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
