import { WorkspacesPage } from './WorkspacesPage'
import { SidebarLayout } from './layout/SidebarLayout'

// The `/` route: the app shell (sidebar + header) wrapping the workspaces view.
export function HomePage() {
  return (
    <SidebarLayout title="Home">
      <WorkspacesPage />
    </SidebarLayout>
  )
}
