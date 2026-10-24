import { IconPackage } from '@tabler/icons-react'

export const config = { colSpan: 2, rowSpan: 1 } as const

const ORDERS = [
  { id: '#1048', customer: 'Mira Chen', status: 'Picking', total: '€184.00' },
  { id: '#1047', customer: 'Jonas Weber', status: 'Packed', total: '€320.00' },
  { id: '#1046', customer: 'Lea Haas', status: 'Shipped', total: '€72.50' }
]

export default function OrdersToday() {
  return (
    <div className="flex h-full w-full flex-col gap-3 bg-background p-5 text-foreground">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconPackage size={16} stroke={1.75} />
        Orders today
        <span className="ml-auto text-2xl font-semibold tabular-nums">38</span>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {ORDERS.map(order => (
          <li key={order.id} className="flex gap-3">
            <span className="w-12 text-foreground/70 tabular-nums">{order.id}</span>
            <span className="flex-1">{order.customer}</span>
            <span className="text-foreground/70">{order.status}</span>
            <span className="w-16 text-right tabular-nums">{order.total}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
