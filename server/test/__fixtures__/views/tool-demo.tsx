import { getSaved } from './tool-demo.server'
export default function ToolDemo() { return <button onClick={() => getSaved()}>Read saved</button> }
