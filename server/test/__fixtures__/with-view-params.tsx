export const config = {
  title: 'Shop',
  icon: 'cart',
  params: {
    product: 'Product slug shown in the detail pane',
    'detail-tab': 'Which detail tab is open: overview or reviews'
  }
} as const

export default function Shop() {
  return <div>shop</div>
}
