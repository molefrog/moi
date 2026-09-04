import { cn } from './utils'
import { IconLoader } from '@tabler/icons-react'

type SpinnerProps = React.ComponentProps<typeof IconLoader>

function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <IconLoader
      stroke={1.75}
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
