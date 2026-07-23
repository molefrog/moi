import { focusTab } from 'moi'
export const config = { title: 'Focus' }
export default function WithFocus() {
  return <button onClick={() => focusTab('view:orders', { order: 'o-1' })}>Open order</button>
}
