import { SidebarLayout } from '@/client/app/shell/sidebar-layout'
import { SettingsPage } from '@/client/features/app-settings/settings-page'

export function SettingsRoute() {
  return (
    <SidebarLayout showWorkspaces={false}>
      <SettingsPage />
    </SidebarLayout>
  )
}
