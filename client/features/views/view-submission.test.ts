import type { SessionInfo, WorkspaceSessionSelection } from '@/lib/types'
import { afterEach, expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { recoverViewSubmission } from './view-submission'
import { liveStore, attachmentKey } from '@/client/features/chat/chat-store'
import { useUiStore } from '@/client/store/ui'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { appUiKeys } from '@/client/api/app-ui-keys'
import { composerDraftKey, draftSessionId } from '@/lib/session-drafts'
import type { StagedAttachment } from '@/client/features/chat/composer/attachments/types'

const originalFetch = globalThis.fetch
const workspaceId = 'recovery'
const text = 'Build a gardening board'
const attachment: StagedAttachment = {
  kind: 'text',
  localId: 'brief',
  source: 'views/garden',
  label: 'Brief',
  text
}

afterEach(() => {
  globalThis.fetch = originalFetch
  liveStore.setState({ attachments: {}, activity: {}, errors: {} })
  useUiStore.setState({ composerDrafts: {} })
})

function setup(status?: 'draft' | 'failed' | 'submitted') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const selection = {
    selected: status && status !== 'draft' ? { 'views/garden': 'native' } : {},
    pinned: null
  }
  const requests: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requests.push(url)
    if (!status) throw new Error('Offline')
    return Response.json(
      url.endsWith('/views')
        ? {
            views: [
              {
                id: 'garden',
                status,
                requirements: text,
                executionSessionId: status === 'draft' ? undefined : 'native'
              }
            ]
          }
        : selection
    )
  }) as typeof fetch
  liveStore.setState({
    attachments: { [attachmentKey(workspaceId, 'temporary')]: [attachment] },
    activity: { [`${workspaceId}:temporary`]: 'running' }
  })
  qc.setQueryData(workspaceKeys.sessions(workspaceId), [{ sessionId: 'temporary' }])
  return { qc, requests, selection }
}

test('validation rejection restores fresh composer, prompt, and attachments', async () => {
  const { qc, requests, selection } = setup('draft')
  await recoverViewSubmission(qc, workspaceId, 'garden', 'temporary', text, false)
  const draftId = draftSessionId('views/garden')
  expect(liveStore.getState().attachments[attachmentKey(workspaceId, draftId)]).toEqual([
    attachment
  ])
  expect(useUiStore.getState().composerDrafts[composerDraftKey(workspaceId, draftId)]).toBe(text)
  expect(
    qc.getQueryData<WorkspaceSessionSelection>(appUiKeys.sessionSelection(workspaceId))
  ).toEqual(selection)
  expect(qc.getQueryData<SessionInfo[]>(workspaceKeys.sessions(workspaceId))).toEqual([])
  expect(requests).toHaveLength(2)
})

test('failed startup keeps the server chat and restores its draft after native rename', async () => {
  const { qc, selection } = setup('failed')
  liveStore.getState().renameSession(workspaceId, 'temporary', 'native')
  await recoverViewSubmission(qc, workspaceId, 'garden', 'temporary', text, false)
  expect(liveStore.getState().attachments[attachmentKey(workspaceId, 'native')]).toEqual([
    attachment
  ])
  expect(useUiStore.getState().composerDrafts[composerDraftKey(workspaceId, 'native')]).toBe(text)
  expect(
    qc.getQueryData<WorkspaceSessionSelection>(appUiKeys.sessionSelection(workspaceId))
  ).toEqual(selection)
})

test('lost response after accepted startup retains the chat without replaying or marking it idle', async () => {
  const { qc, requests } = setup('submitted')
  await recoverViewSubmission(qc, workspaceId, 'garden', 'temporary', text, false)
  expect(liveStore.getState().activity[`${workspaceId}:native`]).toBe('running')
  expect(liveStore.getState().attachments[attachmentKey(workspaceId, 'native')]).toEqual([
    attachment
  ])
  expect(requests.every(url => !url.endsWith('/submit'))).toBe(true)
})

test('offline recovery preserves the draft and attachments without replaying', async () => {
  const { qc, requests } = setup()
  await recoverViewSubmission(qc, workspaceId, 'garden', 'temporary', text, false)
  expect(liveStore.getState().attachments[attachmentKey(workspaceId, 'temporary')]).toEqual([
    attachment
  ])
  expect(useUiStore.getState().composerDrafts[composerDraftKey(workspaceId, 'temporary')]).toBe(
    text
  )
  expect(requests).toHaveLength(2)
})

test('rejected submission moves the existing composer draft back without replacing it', async () => {
  const { qc } = setup('draft')
  useUiStore.getState().setComposerDraft(composerDraftKey(workspaceId, 'temporary'), '')
  await recoverViewSubmission(qc, workspaceId, 'garden', 'temporary', text, false)
  expect(
    useUiStore.getState().composerDrafts[
      composerDraftKey(workspaceId, draftSessionId('views/garden'))
    ]
  ).toBe('')
  expect(
    useUiStore.getState().composerDrafts[composerDraftKey(workspaceId, 'temporary')]
  ).toBeUndefined()
})
