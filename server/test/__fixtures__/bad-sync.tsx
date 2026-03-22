import { notAsync } from './bad-sync.server'

export default function BadSyncWidget() {
  return <button onClick={() => notAsync('hello')}>Call</button>
}
