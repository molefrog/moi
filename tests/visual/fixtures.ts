import {
  DEFAULT_VIEWPORT,
  defineSuite,
  expect,
  type Page,
  type Route,
  type SuiteOptions,
  type Viewports
} from '@uiverify/bun'

import type { HarnessAvailability } from '@/lib/types'

import { agentResponse, CREATE_WORKSPACE_INFO } from './server-responses'

// Google Fonts picks the font files by the browser asking, so a laptop, a CI
// runner, or the next Chrome would each capture different glyphs. Ask for the
// stylesheet as one fixed browser; the font URLs it lists are versioned.
const FONTS_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

async function pinGoogleFontsStylesheet(route: Route) {
  const response = await fetch(route.request().url(), {
    headers: { 'user-agent': FONTS_USER_AGENT }
  })
  route.fulfill({
    status: response.status,
    body: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'text/css',
    headers: { 'access-control-allow-origin': '*' }
  })
}

// A page is captured on desktop and on a phone.
export const PAGE_VIEWPORTS: Viewports = {
  '': DEFAULT_VIEWPORT,
  mobile: { width: 390, height: 844 }
}

type Options = SuiteOptions & {
  // What the workspace's agent reports; every page sees this instead of the
  // machine's real CLI state.
  agentAvailability: HarnessAvailability
}

// The server pushes its own live agent check over /ws; drop it so the pinned
// answer the test routes stands. Runs in the page, so it uses nothing from
// this module.
function dropHarnessUpdates() {
  const RealWebSocket = WebSocket
  const isHarnessUpdate = (event: MessageEvent) =>
    typeof event.data === 'string' && event.data.includes('"harness:updated"')
  class FilteredWebSocket extends RealWebSocket {
    #filter: boolean
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      this.#filter = new URL(String(url), location.href).pathname === '/ws'
    }
    set onmessage(listener: ((event: MessageEvent) => void) | null) {
      super.onmessage =
        listener &&
        ((event: MessageEvent) => {
          if (this.#filter && isHarnessUpdate(event)) return
          listener.call(this, event)
        })
    }
    get onmessage() {
      return super.onmessage
    }
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) {
      if (type !== 'message') return super.addEventListener(type, listener, options)
      super.addEventListener(
        type,
        event => {
          if (this.#filter && isHarnessUpdate(event as MessageEvent)) return
          if (typeof listener === 'function') listener.call(this, event)
          else listener.handleEvent(event)
        },
        options
      )
    }
  }
  window.WebSocket = FilteredWebSocket
}

// The collab demo names its local user `local-<randomUUID>`, and the avatar's
// shape and blink are drawn from that name. Math.random is seeded for every
// capture, crypto.randomUUID isn't, so hand out the same ids in the same order.
function pinRandomUuids() {
  let next = 0
  crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}` as const
}

export const visualSuite = defineSuite<Options>(
  {
    viewports: { '': DEFAULT_VIEWPORT },
    now: '2026-05-12T09:30:00Z',
    agentAvailability: { status: 'available' }
  },
  async (page, { agentAvailability }) => {
    page.route(/\/api\/workspaces\/[^/]+\/agent(\?|$)/, route =>
      route.fulfill({ json: agentResponse(agentAvailability) })
    )
    page.route(/\/api\/harnesses\/[^/]+\/auth$/, route =>
      route.fulfill({ json: { availability: agentAvailability } })
    )
    page.route('**/api/workspaces/create', route =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: CREATE_WORKSPACE_INFO })
        : route.fallback()
    )
    // The real answer probes each server through the agent CLI.
    page.route('**/api/workspaces/*/mcp', route => route.fulfill({ json: [] }))
    // The browser renders widget thumbnails while an overview is open and
    // uploads them, so whether one exists depends on which tests ran first.
    page.route('**/api/workspaces/*/applet-thumbnails', route =>
      route.fulfill({ json: { thumbnails: [] } })
    )
    page.route('https://fonts.googleapis.com/**', pinGoogleFontsStylesheet)
    await page.addInitScript(dropHarnessUpdates)
    await page.addInitScript(pinRandomUuids)
  }
)

// A running subagent cycles through sport icons every 600 ms; stop the page
// clock on the basketball so every capture shows the same one.
export async function holdSportIcon(page: Page) {
  const basketball = page.locator('.tabler-icon-play-basketball').first()
  await page.waitUntil('the basketball icon to hold', async () => {
    await page.resumeClock()
    await expect(basketball).toBeVisible()
    await page.pauseClock()
    return (await basketball.count()) === 1
  })
}
