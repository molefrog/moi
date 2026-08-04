import { useState } from 'react'

export default function HelloWidget() {
  const [count, setCount] = useState(0)

  return (
    <div className="flex items-center gap-2 bg-success/10 p-4 font-sans text-success">
      <span>{count}</span>
      <button className="font-mono" onClick={() => setCount(c => c + 1)}>
        +1
      </button>
    </div>
  )
}
