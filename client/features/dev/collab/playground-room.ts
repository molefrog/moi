import type { Connection } from '@/lib/collab/types'
import type { FakeEngine } from '@/client/features/collab/testing/fake-engine'

// Relay each participant's own connection, just as a room would broadcast it.
export function connectPlaygroundParticipants(
  rooms: readonly FakeEngine[],
  background: readonly Connection[] = []
): () => void {
  const snapshots = new Map<FakeEngine, string>()
  const sync = (source: FakeEngine) => {
    const state = source.getSnapshot()
    const own = state.connections.find(connection => connection.connectionId === state.connectionId)
    const snapshot = JSON.stringify(own)
    if (snapshots.get(source) === snapshot) return
    // Cache before broadcasting: peers announce their new snapshots synchronously.
    snapshots.set(source, snapshot)
    for (const room of rooms) {
      const peers = rooms
        .filter(peer => peer !== room)
        .flatMap(peer => {
          const state = peer.getSnapshot()
          const own = state.connections.find(
            connection => connection.connectionId === state.connectionId
          )
          return own ? [{ ...own, connectionId: `preview:${own.userId}` }] : []
        })
      room.setOtherConnections([...background, ...peers])
    }
  }
  const unsubscribe = rooms.map(room => room.subscribe(() => sync(room)))
  rooms.forEach(sync)
  return () => unsubscribe.forEach(dispose => dispose())
}
