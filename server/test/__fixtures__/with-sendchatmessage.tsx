import { sendChatMessage } from 'moi'
export const config = { title: 'Chase' }
export default function WithChat() {
  return (
    <button onClick={() => sendChatMessage('Chase order o-1', { order: 'o-1' })}>Chase order</button>
  )
}
