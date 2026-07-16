import { SidebarLayout } from '@/client/app/shell/SidebarLayout'
import { HomePage } from '@/client/features/home/HomePage'

// The `/` route: the app shell wrapping the workspaces view.
export function HomeRoute() {
  return (
    <SidebarLayout panel="flat" showWorkspaces={false}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <HomePage />
      </div>
    </SidebarLayout>
  )
}
