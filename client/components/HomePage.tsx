import { WorkspacesPage } from './WorkspacesPage'
import { PanelHeader, SidebarLayout, SidebarToggle } from './layout/SidebarLayout'

// The `/` route: the app shell wrapping the workspaces view.
export function HomePage() {
  return (
    <SidebarLayout>
      <PanelHeader>
        <SidebarToggle />
        <span className="text-foreground text-sm font-medium">Home</span>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspacesPage />
      </div>
    </SidebarLayout>
  )
}
