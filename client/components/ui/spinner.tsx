import { IconLoader2 } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'

function Spinner({ className, ...props }: React.ComponentProps<typeof IconLoader2>) {
  return (
    <IconLoader2
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      stroke={1.75}
      {...props}
    />
  )
}

export { Spinner }
