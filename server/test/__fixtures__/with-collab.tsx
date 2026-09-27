import { addChatAttachment } from 'moi'
import { useWorkspaceUsers } from 'moi/collab'

export default function CollaborationFixture() {
  const users = useWorkspaceUsers()
  return (
    <button
      onClick={() =>
        addChatAttachment({ type: 'text', label: 'People', text: users.map(user => user.name).join(', ') })
      }
    >
      Share people
    </button>
  )
}
