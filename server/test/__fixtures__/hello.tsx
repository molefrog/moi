import { useState } from 'react'

export default function HelloWidget() {
  const [count, setCount] = useState(0)

  return (
    <div className="flex items-center gap-2 p-4 font-sans">
      <span>{count}</span>
      <button className="font-mono" onClick={() => setCount(c => c + 1)}>
        +1
      </button>
    </div>
  )
}
