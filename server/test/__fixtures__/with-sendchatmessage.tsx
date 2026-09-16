import { sendChatMessage } from 'moi'
export const config = { title: 'Chase' }
export default function WithChat() {
  return (
    <button onClick={() => sendChatMessage({ message: 'Chase order o-1', context: { order: 'o-1' } })}>Chase order</button>
  )
}
