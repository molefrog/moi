export const config = { colSpan: 2, rowSpan: 1 } as const

const WEEK = [
  { day: 'Mon', revenue: 2140 },
  { day: 'Tue', revenue: 2610 },
  { day: 'Wed', revenue: 1980 },
  { day: 'Thu', revenue: 3120 },
  { day: 'Fri', revenue: 3480 },
  { day: 'Sat', revenue: 2890 },
  { day: 'Sun', revenue: 1760 }
]
const MAX = Math.max(...WEEK.map(d => d.revenue))

export default function Revenue() {
  return (
    <div className="flex h-full w-full flex-col gap-3 bg-background p-5 text-foreground">
      <div className="flex items-baseline justify-between text-sm font-medium">
        Revenue this week
        <span className="text-2xl font-semibold tabular-nums">€17,980</span>
      </div>
      <div className="flex flex-1 items-end gap-2">
        {WEEK.map(d => (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-sm bg-foreground/80"
              style={{ height: `${Math.round((d.revenue / MAX) * 72)}px` }}
            />
            <span className="text-xs text-foreground/70">{d.day}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
