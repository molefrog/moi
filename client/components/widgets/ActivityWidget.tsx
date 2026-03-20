import { IconFlame } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'

const calories = 486
const activeMinutes = 38
const distance = 5.2
const activeDays = 5

export function ActivityWidget() {
  return (
    <div className="flex h-full flex-col justify-between bg-amber-50 p-4 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconFlame size={20} stroke={1.5} className="text-amber-600" />
          <span className="font-semibold text-amber-900">Activity</span>
        </div>
        <span className="text-xs text-amber-600">Today</span>
      </div>

      <div className="flex items-end gap-6">
        <div>
          <span className="text-3xl font-bold tracking-tight text-amber-900">{calories}</span>
          <span className="ml-1 text-amber-600">kcal</span>
        </div>
        <div className="mb-1 flex gap-4">
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-amber-900">{activeMinutes}</span>
            <span className="text-xs text-amber-600">min active</span>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-amber-900">{distance}</span>
            <span className="text-xs text-amber-600">km</span>
          </div>
        </div>
      </div>

      <div className="flex gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i < activeDays ? 'bg-amber-400' : 'bg-amber-200'
            )}
          />
        ))}
      </div>
    </div>
  )
}
