import { addChatContext } from 'moi'

export default function ContextButton() {
  return <button onClick={() => addChatContext({ label: 'Order #1042', context: { orderId: '1042' } })}>Add order to chat</button>
}
