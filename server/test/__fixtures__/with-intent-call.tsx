import { intent, sendAction } from 'moi'

export const config = {
  title: 'Emitter',
  intents: [{ name: 'noop' }]
} as const

export default function Emitter() {
  return (
    <button
      onClick={() => {
        intent('open-product', { id: 'p-1' })
        sendAction('Reorder low stock', { sku: 'a-1' })
      }}
    >
      go
    </button>
  )
}
