import type { ReactNode } from 'react'

type ChatHeaderLabelProps = {
  children: ReactNode
}

export function ChatHeaderLabel({ children }: ChatHeaderLabelProps) {
  return <div className="flex h-7 items-center px-2.5 text-sm font-medium">{children}</div>
}
