import type { ActivityProps } from 'moi/collab'
import { useMe, usePeers } from '../hooks'
import { Facepile } from './facepile'
export type { ActivityProps } from 'moi/collab'

export function Activity({ scope = 'page', className }: ActivityProps) {
  const peers = usePeers({ scope })
  const me = useMe()
  const users = me ? [me, ...peers] : peers
  return <Facepile ids={users.map(user => user.id)} max={users.length} className={className} />
}
