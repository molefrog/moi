import { useEffect, useState } from 'react'

export default function ClockWidget() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center gap-1 p-6">
      <span className="font-mono text-2xl font-bold tabular-nums">{time.toLocaleTimeString()}</span>
      <span className="text-muted-foreground text-xs">{time.toLocaleDateString()}</span>
    </div>
  )
}
