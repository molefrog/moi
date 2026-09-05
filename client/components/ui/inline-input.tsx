import { useRef } from 'react'
import type { ComponentProps } from 'react'

import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '@/client/lib/cn'

type InputPrimitiveProps = ComponentProps<typeof InputPrimitive>
type InputFocusEvent = Parameters<NonNullable<InputPrimitiveProps['onFocus']>>[0]
type InputKeyboardEvent = Parameters<NonNullable<InputPrimitiveProps['onKeyDown']>>[0]

type InlineInputProps = Omit<InputPrimitiveProps, 'onChange'> & {
  onValueChange?: (value: string) => void
  onValueCommit?: (value: string) => void
}

function InlineInput({
  className,
  onBlur,
  onFocus,
  onKeyDown,
  onValueChange,
  onValueCommit,
  ...props
}: InlineInputProps) {
  const valueBeforeEditRef = useRef<string | null>(null)

  function handleBlur(event: InputFocusEvent) {
    const shouldCommit = valueBeforeEditRef.current !== null
    valueBeforeEditRef.current = null
    onBlur?.(event)
    if (!event.defaultPrevented && shouldCommit) {
      onValueCommit?.(event.currentTarget.value)
    }
  }

  function handleFocus(event: InputFocusEvent) {
    valueBeforeEditRef.current = event.currentTarget.value
    event.currentTarget.select()
    onFocus?.(event)
  }

  function handleKeyDown(event: InputKeyboardEvent) {
    onKeyDown?.(event)
    if (event.defaultPrevented) return

    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      const valueBeforeEdit = valueBeforeEditRef.current ?? event.currentTarget.value
      valueBeforeEditRef.current = null
      event.currentTarget.value = valueBeforeEdit
      onValueChange?.(valueBeforeEdit)
      event.currentTarget.blur()
    }
  }

  return (
    <InputPrimitive
      data-slot="inline-input"
      className={cn(
        '-ml-2 [field-sizing:content] w-auto max-w-full min-w-0 rounded-md bg-transparent px-2 py-0.5 text-sm shadow-none outline-none focus:[field-sizing:fixed] focus:w-full focus-visible:border-ring focus-visible:bg-accent disabled:pointer-events-none',
        className
      )}
      onBlur={handleBlur}
      onChange={event => onValueChange?.(event.target.value)}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
}

export { InlineInput }
