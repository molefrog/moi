import { IconTruckDelivery } from '@tabler/icons-react'

export const config = { colSpan: 1, rowSpan: 1 } as const

export default function Shipping() {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-background p-5 text-foreground">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconTruckDelivery size={16} stroke={1.75} />
        Waiting to ship
      </div>
      <div>
        <div className="text-3xl font-semibold tabular-nums">4</div>
        <div className="text-xs text-foreground/70">Next pickup 16:30</div>
      </div>
    </div>
  )
}
