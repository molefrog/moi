import { Component, type ErrorInfo, type ReactNode } from 'react'

import { IconAlertTriangle } from '@tabler/icons-react'

type Props = {
  name: string
  resetKey: number
  children: ReactNode
}

type State = { error: Error | null }

export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[widget:${this.props.name}]`, error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
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
