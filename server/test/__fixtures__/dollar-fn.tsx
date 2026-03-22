import { get$Data } from './dollar-fn.server'

export default function DollarWidget() {
  return <button onClick={() => get$Data()}>Get</button>
}
