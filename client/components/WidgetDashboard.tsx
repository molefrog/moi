import { useWidget } from '../hooks/useWidget'
import { useWidgetList } from '../hooks/useWidgetList'

type WidgetCardProps = {
  name: string
}

function WidgetCard({ name }: WidgetCardProps) {
  const widget = useWidget(name)

  return (
    <div className="flex min-h-[120px] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{name}</span>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        {widget.status === 'loading' && (
          <p className="text-xs text-muted-foreground">Loading...</p>
        )}
        {widget.status === 'error' && (
          <p className="text-xs text-destructive">{widget.error}</p>
        )}
        {widget.status === 'ready' && <widget.Component />}
      </div>
    </div>
  )
}

export function WidgetDashboard() {
  const widgets = useWidgetList()

  if (widgets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">No widgets found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h2 className="text-sm font-medium text-muted-foreground">Widgets</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {widgets.map((name) => (
          <WidgetCard key={name} name={name} />
        ))}
      </div>
    </div>
  )
}
