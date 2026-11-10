import { afterEach, expect, spyOn, test } from 'bun:test'
import { act } from 'react'
import { cleanupAccount, mountAccount } from '../account/account-test-utils'
import { getIdentity } from '../identity/store'
import { toast } from '@/client/components/ui/toast'
import { AvatarUpload } from './avatar-upload'

afterEach(cleanupAccount)

test('my avatar opens a file picker and uploads through the cloud profile API', async () => {
  const ui = await mountAccount({
    children: (
      <AvatarUpload>
        <span>Avatar</span>
      </AvatarUpload>
    )
  })
  const input = ui.document.querySelector<HTMLInputElement>('[aria-label="Choose an avatar file"]')!
  const picker = spyOn(input, 'click')
  const notification = spyOn(toast, 'add')
  try {
    await ui.click('Change your avatar')
    expect(picker).toHaveBeenCalledTimes(1)
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => input.dispatchEvent(new ui.window.Event('change', { bubbles: true })))
    await ui.settle()
    await ui.settle()
    expect(ui.calls.filter(call => call.path === '/cloud/api/me/avatar')).toHaveLength(1)
    expect(getIdentity()?.avatar).toBe('https://example.com/new.png')
    expect(notification).toHaveBeenCalledWith({ title: 'Avatar updated', type: 'success' })
    expect(input.disabled).toBe(false)
    // Clearing the file input allows choosing the same file a second time.
    expect(input.value).toBe('')
  } finally {
    picker.mockRestore()
    notification.mockRestore()
  }
})

test('a failed avatar upload preserves the current avatar and allows retry', async () => {
  const ui = await mountAccount({
    children: (
      <AvatarUpload>
        <span>Avatar</span>
      </AvatarUpload>
    )
  })
  await ui.settle()
  const original = getIdentity()?.avatar
  const notification = spyOn(toast, 'add')
  try {
    const input = ui.document.querySelector<HTMLInputElement>(
      '[aria-label="Choose an avatar file"]'
    )!
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['avatar'], 'avatar.png', { type: 'image/png' })]
    })
    ui.failures.mutation = true
    await act(async () => input.dispatchEvent(new ui.window.Event('change', { bubbles: true })))
    await ui.settle()
    expect(getIdentity()?.avatar).toBe(original)
    expect(notification).toHaveBeenCalledWith({
      title: 'Couldn’t update avatar',
      description: 'Only the owner can do that.',
      type: 'error'
    })
    expect(input.disabled).toBe(false)
    ui.failures.mutation = false
    await act(async () => input.dispatchEvent(new ui.window.Event('change', { bubbles: true })))
    await ui.settle()
    expect(getIdentity()?.avatar).toBe('https://example.com/new.png')
  } finally {
    notification.mockRestore()
  }
})
