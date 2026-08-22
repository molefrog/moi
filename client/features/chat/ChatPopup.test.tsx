import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { ChatPopup } from '@/client/features/chat/ChatPopup'

function renderChatPopup(): string {
  return renderToStaticMarkup(
    <ChatPopup
      agent="boxy"
      loading={false}
      open={false}
      onOpenChange={() => undefined}
      onOpenChangeComplete={() => undefined}
    >
      {() => null}
    </ChatPopup>
  )
}

describe('ChatPopup', () => {
  test('uses the primary color for the shadow in every theme', () => {
    const html = renderChatPopup()

    expect(html).toContain('drop-shadow-primary/30')
    expect(html).toContain('group-hover:drop-shadow-primary/40')
  })

  test('matches the Blobatar color transition', () => {
    const html = renderChatPopup()

    expect(html).toContain('transition-[filter]')
    expect(html).toContain('duration-400')
    expect(html).toContain('ease-in-out')
  })
})
