import { useState } from 'react'

export default function HelloWidget() {
  const [count, setCount] = useState(0)

  return (
    <div className="flex items-center gap-2 p-4">
      <span>{count}</span>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  )
}
