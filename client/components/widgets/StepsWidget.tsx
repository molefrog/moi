import { IconWalk } from '@tabler/icons-react'

const steps = 8_432
const goal = 10_000
const progress = Math.min(steps / goal, 1)

export function StepsWidget() {
  return (
    <div className="flex h-full flex-col justify-between bg-emerald-50 p-4 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconWalk size={20} stroke={1.5} className="text-emerald-700" />
          <span className="font-semibold text-emerald-900">Steps</span>
        </div>
        <span className="text-xs text-emerald-600">Today</span>
      </div>

      <div>
        <span className="text-3xl font-bold tracking-tight text-emerald-900">
          {steps.toLocaleString()}
        </span>
        <span className="ml-1.5 text-emerald-600">/ {goal.toLocaleString()}</span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-200">
          <div className="h-full w-[84%] rounded-full bg-emerald-500 transition-all" />
        </div>
        <span className="text-xs text-emerald-600">
          {Math.round(progress * 100)}% of daily goal
        </span>
      </div>
    </div>
  )
}
