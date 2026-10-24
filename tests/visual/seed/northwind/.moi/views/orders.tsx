export const config = { title: 'Orders', icon: 'cart' } as const

const ORDERS = [
  {
    id: '#1048',
    customer: 'Mira Chen',
    items: 'Desk lamp, Moss',
    status: 'Picking',
    total: '€184.00'
  },
  { id: '#1047', customer: 'Jonas Weber', items: 'Oak shelf', status: 'Packed', total: '€320.00' },
  {
    id: '#1046',
    customer: 'Lea Haas',
    items: 'Linen napkins ×4',
    status: 'Shipped',
    total: '€72.50'
  },
  {
    id: '#1045',
    customer: 'Tomás Ruiz',
    items: 'Ceramic vase',
    status: 'Delivered',
    total: '€58.00'
  }
]

export default function Orders() {
  return (
    <div className="h-full w-full overflow-auto bg-background p-8">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">38 orders today, 4 waiting to ship.</p>
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Order</th>
            <th className="py-2 font-medium">Customer</th>
            <th className="py-2 font-medium">Items</th>
            <th className="py-2 font-medium">Status</th>
            <th className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {ORDERS.map(order => (
            <tr key={order.id} className="border-t border-border">
              <td className="py-2 tabular-nums">{order.id}</td>
              <td className="py-2">{order.customer}</td>
              <td className="py-2">{order.items}</td>
              <td className="py-2">{order.status}</td>
              <td className="py-2 text-right tabular-nums">{order.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
