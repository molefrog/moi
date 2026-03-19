import { IconHeartbeat } from '@tabler/icons-react'

const bpm = 72
const status = 'Resting'

export function HeartRateWidget() {
  return (
    <div className="flex h-full flex-col justify-between bg-rose-50 p-4 text-sm">
      <div className="flex items-center gap-2">
        <IconHeartbeat size={20} stroke={1.5} className="text-rose-600" />
        <span className="font-semibold text-rose-900">Heart Rate</span>
      </div>

      <div>
        <span className="text-3xl font-bold tracking-tight text-rose-900">{bpm}</span>
        <span className="ml-1 text-rose-600">bpm</span>
      </div>

      <span className="text-xs text-rose-600">{status}</span>
    </div>
  )
}
