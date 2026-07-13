import { WorkspacesPage } from './WorkspacesPage'
import { SidebarLayout } from './layout/SidebarLayout'

// The `/` route: the app shell wrapping the workspaces view.
export function HomePage() {
  return (
    <SidebarLayout panel="flat">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspacesPage />
      </div>
    </SidebarLayout>
  )
}
