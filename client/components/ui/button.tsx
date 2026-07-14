import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { type VariantProps, cva } from 'class-variance-authority'

import { cn } from '@/client/lib/cn'

const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100',
        secondary: 'bg-muted text-foreground hover:bg-accent hover:text-accent-foreground',
        outline: 'bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20'
      },
      size: {
        sm: 'h-7 gap-1.5 rounded-xs px-2.5 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg]:size-4',
        default:
          'h-8 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg]:size-5',
        lg: 'h-10 rounded-lg px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg]:size-5',
        'icon-sm': 'size-7 rounded-xs [&_svg]:size-4',
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
