import { fetchAlpha } from '../alpha.server'

export default function EscapeWidget() {
  return <button onClick={() => fetchAlpha()}>Escape</button>
}
