import {
  DEFAULT_VIEWPORT,
  defineSuite,
  type Route,
  serveBundle,
  type SuiteOptions
} from '@uiverify/bun'
import tailwind from 'bun-plugin-tailwind'
import { afterAll } from 'bun:test'

import {
  DEV_CWD,
  conversationNotices,
  conversationTurns
} from '@/client/features/dev/chat-states-fixtures'
import type { StreamEvent } from '@/lib/format'
import type {
  AppSettings,
  ClientAppConfig,
  HarnessStatuses,
  McpServer,
  SessionSummary,
  UpdateStatus,
  WorkspaceEntry,
  WorkspaceHarness,
  WorkspaceLayoutResponse,
  WorkspacePreview,
  WorkspaceState
} from '@/lib/types'

// app.tsx bundled and served on its own: no moi server, no workspace on disk.
const app = await serveBundle({
  entrypoint: new URL('./app.html', import.meta.url).pathname,
  plugins: [tailwind],
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.MOI_DEV_ROUTES': '"false"',
    'process.env.PUBLIC_TLDRAW_LICENSE_KEY': '""'
  }
})
afterAll(() => app.stop())

export const WORKSPACE = 'northwind'
const SESSION = 'chat-states'

const workspaces: WorkspaceEntry[] = [
  {
    id: WORKSPACE,
    path: '/Users/mole/projects/northwind',
    displayPath: '~/projects/northwind',
    addedAt: '2026-05-01T09:00:00.000Z',
    type: 'claude-code'
  },
  {
    id: 'acme-store',
    path: '/Users/mole/projects/acme-store',
    displayPath: '~/projects/acme-store',
    addedAt: '2026-05-02T09:00:00.000Z',
    type: 'claude-code'
  }
]

const layout: WorkspaceLayoutResponse = {
  version: 1,
  widgetGrid: [{ i: '_moi_views', x: 0, y: 0 }],
  layoutMode: 'split',
  tabs: { open: ['overview', 'scratchpad'], active: 'overview' },
  name: WORKSPACE,
  cwd: DEV_CWD,
  provider: 'claude-code'
}

const harness: WorkspaceHarness = {
  provider: 'claude-code',
  availability: { status: 'available' },
  supportsStreaming: true,
  supportsArchiving: true,
  models: [
    {
      value: 'default',
      resolvedModel: 'claude-opus-5-5',
      displayName: 'Default (recommended)',
      description: 'Use the default model (currently Opus 5.5) · $4/$20 per Mtok',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
      supportsAdaptiveThinking: true,
      supportsFastMode: true,
      supportsAutoMode: true
    },
    {
      value: 'opus',
      resolvedModel: 'claude-opus-5-5',
      displayName: 'Opus',
      description: 'Opus 5.5 · Best for everyday, complex tasks · $4/$20 per Mtok',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
      supportsAdaptiveThinking: true,
      supportsFastMode: true,
      supportsAutoMode: true
    },
    {
      value: 'fable',
      resolvedModel: 'claude-fable-5-1',
      displayName: 'Fable',
      description:
        'Fable 5.1 · Most capable for your hardest and longest-running tasks · $10/$50 per Mtok',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
      supportsAdaptiveThinking: true,
      supportsAutoMode: true
    },
    {
      value: 'sonnet',
      resolvedModel: 'claude-sonnet-5-5',
      displayName: 'Sonnet',
      description: 'Sonnet 5.5 · Efficient for routine tasks · $2/$10 per Mtok',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
      supportsAdaptiveThinking: true,
      supportsAutoMode: true
    },
    {
      value: 'haiku',
      resolvedModel: 'claude-haiku-5-5',
      displayName: 'Haiku',
      description:
        'Haiku 5.5 · Fastest for quick answers · $0.10/$0.50 per Mtok ($0.50/$2.50 for prompts over 100k)',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
      supportsAdaptiveThinking: true,
      supportsAutoMode: true
    }
  ]
}

export const HARNESSES: HarnessStatuses = {
  'claude-code': { availability: { status: 'available' } },
  codex: { availability: { status: 'available' } },
  openclaw: {
    availability: { status: 'unavailable', reason: 'Not installed', code: 'not-installed' }
  },
  hermes: {
    availability: { status: 'unavailable', reason: 'Not installed', code: 'not-installed' }
  }
}

const sessions: SessionSummary[] = [
  {
    sessionId: SESSION,
    summary: 'Why do concurrent layout saves race?',
    lastModified: 1778578200000
  }
]

// The chat every state of the team's chat playground is in
// (client/features/dev/chat-states-fixtures.ts).
const events: StreamEvent[] = [
  ...conversationTurns.map(turn => ({ kind: 'turn' as const, turn })),
  ...conversationNotices.map(notice => ({ kind: 'notice' as const, notice }))
]

// What each GET answers, by path. A test changes any of them with
// `test(name, body, { api: { '/api/…': … } })`.
export const API: Record<string, unknown> = {
  '/api/config': {
    environment: 'local',
    demo: false,
    demoInstallUrl: 'https://moi.computer'
  } satisfies ClientAppConfig,
  '/api/update': { runningVersion: '0.12.0', availableVersion: null } satisfies UpdateStatus,
  '/api/settings': { showOnboarding: false, autoUpdateSkills: false } satisfies AppSettings,
  '/api/harnesses/status': HARNESSES,
  '/api/workspaces': workspaces,
  '/api/workspaces/shared': [],
  '/api/workspaces/discover': [],
  '/api/workspaces/previews': {
    [WORKSPACE]: {
      thumbnails: [],
      firstUserMessage: sessions[0]?.summary,
      updatedAt: 1778578200000
    },
    'acme-store': { thumbnails: [] }
  } satisfies Record<string, WorkspacePreview>,
  [`/api/workspaces/${WORKSPACE}`]: layout,
  [`/api/workspaces/${WORKSPACE}/harness`]: harness,
  [`/api/workspaces/${WORKSPACE}/state`]: {
    revision: 1,
    selected: { overview: SESSION },
    sessions: {},
    pendingViews: {}
  } satisfies WorkspaceState,
  [`/api/workspaces/${WORKSPACE}/sessions`]: sessions,
  [`/api/workspaces/${WORKSPACE}/sessions/${SESSION}/events`]: events,
  [`/api/workspaces/${WORKSPACE}/views`]: { views: [] },
  [`/api/workspaces/${WORKSPACE}/widgets`]: { widgets: [] },
  [`/api/workspaces/${WORKSPACE}/skills`]: { skills: [], updateAvailable: false },
  [`/api/workspaces/${WORKSPACE}/applet-thumbnails`]: { thumbnails: [] },
  [`/api/workspaces/${WORKSPACE}/mcp`]: [
    { name: 'linear', status: 'connected' },
    { name: 'postgres', status: 'connected' },
    { name: 'stripe', status: 'needs-auth' },
    { name: 'sentry', status: 'failed' }
  ] satisfies McpServer[],
  [`/api/workspaces/${WORKSPACE}/env`]: {
    vars: [{ key: 'SHOP_API_URL', source: 'dotenv', files: ['.env'] }],
    files: [{ file: '.env', count: 1 }],
    inheritDotenv: true,
    backend: 'keychain',
    required: []
  }
}

// Google Fonts picks the font files by the browser asking, so a laptop, a CI
// runner or the next Chrome would each capture different glyphs. Ask for the
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

type Options = SuiteOptions & { api: Record<string, unknown> }

const visualSuite = defineSuite<Options>(
  {
    viewports: { '': DEFAULT_VIEWPORT },
    now: '2026-05-12T09:30:00Z',
    api: {}
  },
  (page, { api }) => {
    const answers = { ...API, ...api }
    page.route('**/api/**', route => {
      const { pathname } = new URL(route.request().url())
      if (route.request().method() !== 'GET') return route.fulfill({ json: {} })
      if (pathname in answers) return route.fulfill({ json: answers[pathname] })
      console.warn(`visual tests: no answer for GET ${pathname}`)
      route.fulfill({ status: 404, json: { error: 'Not found' } })
    })
    page.route('https://fonts.googleapis.com/**', pinGoogleFontsStylesheet)
  }
)

// Each file passes its own path so its snapshot ids name it.
export const suite = (file: string) => visualSuite(file, { baseUrl: app.url })
