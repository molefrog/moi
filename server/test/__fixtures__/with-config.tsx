import type { WidgetConfig } from '@/lib/types'

export const config: WidgetConfig = { rowSpan: 2, colSpan: 4 }

export default function WithConfigWidget() {
  return <div>widget with config</div>
}
