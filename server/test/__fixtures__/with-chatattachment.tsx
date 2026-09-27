import { addChatAttachment } from 'moi'

export default function AttachmentButton() {
  return <button onClick={() => addChatAttachment({ type: 'text', label: 'Order #1042', text: 'Order ID: 1042' })}>Add order to chat</button>
}
