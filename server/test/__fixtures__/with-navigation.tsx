import { navigate } from 'moi'
export const config = { title: 'Focus' }
export default function WithFocus() {
  return <button onClick={() => navigate('moi:/views/orders?order=o-1')}>Open order</button>
}
