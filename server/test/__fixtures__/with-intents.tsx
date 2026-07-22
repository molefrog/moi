import { focus, sendAction } from 'moi'

export default function WithIntents() {
  return (
    <div>
      <button onClick={() => focus('view:shop', { product: 'scarf' })}>Open</button>
      <button onClick={() => sendAction('Reorder milk', { sku: 'milk-1l' })}>Reorder</button>
    </div>
  )
}
