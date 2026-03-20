import { IconMoon } from '@tabler/icons-react'

const hours = 7
const minutes = 24
const quality = 'Good'

export function SleepWidget() {
  return (
    <div className="flex h-full flex-col justify-between bg-indigo-50 p-4 text-sm">
      <div className="flex items-center gap-2">
        <IconMoon size={20} stroke={1.5} className="text-indigo-600" />
        <span className="font-semibold text-indigo-900">Sleep</span>
      </div>

      <div>
        <span className="text-3xl font-bold tracking-tight text-indigo-900">{hours}</span>
        <span className="ml-0.5 text-indigo-600">h</span>
        <span className="ml-1 text-3xl font-bold tracking-tight text-indigo-900">{minutes}</span>
        <span className="ml-0.5 text-indigo-600">m</span>
      </div>

      <span className="text-xs text-indigo-600">{quality} quality · Last night</span>
    </div>
  )
}
