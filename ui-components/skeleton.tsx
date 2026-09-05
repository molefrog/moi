import { cn } from './utils'

type SkeletonProps = React.ComponentProps<'div'>

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-lg bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
