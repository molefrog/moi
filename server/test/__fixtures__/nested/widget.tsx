import { getDeep } from './deep.server'

export default function NestedWidget() {
  return <button onClick={() => getDeep()}>Deep</button>
}
