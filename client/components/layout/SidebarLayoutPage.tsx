import { SidebarLayout } from './SidebarLayout'

// Test route for the sidebar layout shell. The panel content here is just a
// placeholder — the shell (sidebar + header + collapse) is the component under test.
export function SidebarLayoutPage() {
  return (
    <SidebarLayout title="Home">
      <div className="flex h-full items-center justify-center">
        <span className="text-muted-foreground text-sm">Main content area</span>
      </div>
    </SidebarLayout>
  )
}
