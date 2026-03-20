import { useState } from 'react'

export default function HelloWidget() {
  const [count, setCount] = useState(0)

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6">
      <h2 className="text-lg font-semibold">Hello from Widget v3!</h2>
      <p className="text-muted-foreground text-sm">Clicked {count} times</p>
      <button
        onClick={() => setCount((c) => c + 1)}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        +1
      </button>
    </div>
  )
}
