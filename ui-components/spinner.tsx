import { IconLoader2 } from '@tabler/icons-react'

import { cn } from './utils'

type SpinnerProps = React.ComponentProps<typeof IconLoader2>

function Spinner({ className, ...props }: SpinnerProps) {
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
