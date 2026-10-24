import { tools } from './tool-demo.server'
export default function ImportTools() {
  return <button onClick={async () => await tools.save_order.execute({ id: 'a' })}>Save</button>
}
