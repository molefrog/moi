import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { type VariantProps, cva } from 'class-variance-authority'

import { cn } from '@/client/lib/cn'

const buttonVariants = cva(
  'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium outline-none transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100',
        secondary: 'bg-muted text-foreground hover:bg-muted/80',
        outline: 'border-input bg-background hover:bg-muted hover:text-foreground border',
        ghost: 'hover:bg-muted'
      },
      size: {
        sm: 'rounded-xs h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg]:size-4',
        default: 'h-8 px-3 has-[>svg]:px-2.5 [&_svg]:size-5',
        lg: 'h-10 rounded-lg px-4 has-[>svg]:px-3 [&_svg]:size-5',
        'icon-sm': 'rounded-xs size-6 [&_svg]:size-4',
        icon: 'size-8 [&_svg]:size-5',
        'icon-lg': 'size-10 rounded-lg [&_svg]:size-5'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
