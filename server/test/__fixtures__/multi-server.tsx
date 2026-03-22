import { fetchAlpha } from './alpha.server'
import { fetchBeta } from './beta.server'

export default function MultiWidget() {
  return (
    <div>
      <button onClick={() => fetchAlpha()}>Alpha</button>
      <button onClick={() => fetchBeta()}>Beta</button>
    </div>
  )
}
