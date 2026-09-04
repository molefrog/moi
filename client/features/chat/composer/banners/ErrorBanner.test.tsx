import { expect, test } from 'bun:test'
import { Children, createElement, isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Button } from '@/client/components/ui/button'

import { ErrorBanner } from './ErrorBanner'

test('renders a dismissible destructive chat error', () => {
  const html = renderToStaticMarkup(
    createElement(ErrorBanner, {
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
  const banner = ErrorBanner({
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

test('offers retry for a failed chat load', () => {
  let retried = false
  const props = {
    error: 'Couldn’t load chat',
    onRetry: () => {
      retried = true
    }
  }
  const html = renderToStaticMarkup(createElement(ErrorBanner, props))
  expect(html).toContain('Retry')
  expect(html).not.toContain('Dismiss error')
  const banner = ErrorBanner(props)
  const retryButton = Children.toArray(banner.props.children).find(
    child => isValidElement(child) && child.type === Button
  )
  if (!isValidElement<{ onClick: () => void }>(retryButton))
    throw new Error('Retry button not found')
  retryButton.props.onClick()
  expect(retried).toBe(true)
})
