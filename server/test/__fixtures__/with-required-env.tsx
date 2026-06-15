import type { WidgetConfig } from '@/lib/types'

export const config: WidgetConfig = {
  rowSpan: 2,
  colSpan: 2,
  requiredEnv: ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID']
}

export default function WithRequiredEnvWidget() {
  return <div>widget needing env</div>
}
