import { expect, test } from 'bun:test'
import { Children, createElement, isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Button } from '@/client/components/ui/button'

import { ChatErrorBanner } from './ChatErrorBanner'

test('renders a dismissible destructive chat error', () => {
  const html = renderToStaticMarkup(
    createElement(ChatErrorBanner, {
      error: 'The agent stopped unexpectedly',
      onDismiss: () => undefined
    })
  )

  expect(html).toContain('role="alert"')
  expect(html).toContain('The agent stopped unexpectedly')
  expect(html).toContain('text-destructive')
  expect(html).toContain('aria-label="Dismiss error"')
})

test('dismisses the chat error', () => {
  let dismissed = false
  const banner = ChatErrorBanner({
    error: 'The agent stopped unexpectedly',
    onDismiss: () => {
      dismissed = true
    }
  })
  const dismissButton = Children.toArray(banner.props.children).find(
    child => isValidElement(child) && child.type === Button
  )

  if (!isValidElement<{ onClick: () => void }>(dismissButton)) {
    throw new Error('Dismiss button not found')
  }
  dismissButton.props.onClick()

  expect(dismissed).toBe(true)
})
