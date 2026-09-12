// Real fx smoke test: isolated concurrent chats, shell streaming/cancel,
// continuation after cancellation, inline-only vision, and cold history.
// Uses the existing fx login. Leaves disposable fx history and report.json in
// ~/.cache/moi-fx-lifecycle-*/; never changes the provider's profile settings.
// Usage: bun scripts/probe-fx-lifecycle.ts
// Env: PROBE_MODEL (default anthropic/claude-sonnet-5), FX_BIN (optional).
import { mkdir, mkdtemp } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'

import type { StreamEvent } from '@/lib/types'
import type { AcpProviderConfig } from '../server/harness/acp/session'

const cache = join(homedir(), '.cache')
await mkdir(cache, { recursive: true })
const root = await mkdtemp(join(cache, 'moi-fx-lifecycle-'))
const workspacePath = join(root, 'workspace')
await mkdir(workspacePath)
process.env.MOI_DATA_DIR = join(root, 'moi-data')

const { getClientFrameLog, getWireLog } = await import('../server/harness/debug')
const { killAllAcpClients } = await import('../server/harness/acp/client')
const { listAcpSessions } = await import('../server/harness/acp/discovery')
const {
  sendAcpMessage,
  interruptAcpRun,
  getLiveAcpEvents,
  getAcpActiveSessions,
  forgetAllAcpSessions,
  ensureAcpSessionLive
} = await import('../server/harness/acp/session')
const { fxConfig } = await import('../server/harness/fx')
const { addUpload } = await import('../server/uploads')

const model = process.env.PROBE_MODEL ?? 'anthropic/claude-sonnet-5'
const config: AcpProviderConfig = {
  ...fxConfig,
  modelStateFingerprint: undefined,
  async spawn(ctx) {
    const spec = await fxConfig.spawn(ctx)
    return {
      ...spec,
      command: process.env.FX_BIN ?? spec.command,
      env: { ...spec.env, FX_MODEL: model }
    }
  }
}
const workspaceId = `fx-lifecycle-${crypto.randomUUID()}`
const tempA = crypto.randomUUID()
const tempB = crypto.randomUUID()
const tempImage = crypto.randomUUID()
const startMarker = `START_${crypto.randomUUID().slice(0, 8)}`
const cancelledMarker = `UNEXPECTED_${crypto.randomUUID().slice(0, 8)}`
const shellMarker = `SHELL_${crypto.randomUUID().slice(0, 8)}`
const imageDigits = String(Math.floor(100000 + Math.random() * 900000))
const checks: Record<string, boolean> = {}
const report: Record<string, unknown> = { model, workspacePath, checks }

type Frame = {
  type?: string
  kind?: string
  from?: string
  to?: string
  sessionId?: string
  content?: string
}
function frames(): Frame[] {
  return getClientFrameLog(workspaceId).map(entry => entry.frame as Frame)
}
function sessionId(temporary: string): string {
  return (
    frames().find(frame => frame.type === 'session_renamed' && frame.from === temporary)?.to ??
    temporary
  )
}
function events(id: string): StreamEvent[] {
  return getLiveAcpEvents(workspaceId, id) ?? []
}
function toolCalls(items: StreamEvent[]) {
  return items.flatMap(event =>
    event.kind === 'turn'
      ? event.turn.parts.flatMap(part => (part.type === 'tool-call' ? [part.call] : []))
      : []
  )
}
function assistantText(items: StreamEvent[]) {
  return items
    .flatMap(event =>
      event.kind === 'turn' && event.turn.role === 'assistant'
        ? event.turn.parts.flatMap(part => (part.type === 'text' ? [part.text] : []))
        : []
    )
    .join('\n')
}
async function until(check: () => boolean, label: string, milliseconds = 90000) {
  const end = Date.now() + milliseconds
  while (!check()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${label}`)
    await Bun.sleep(50)
  }
}
function send(id: string, isNew: boolean, content: string, attachments?: string[]) {
  return sendAcpMessage(config, {
    workspaceId,
    workspacePath,
    sessionId: id,
    isNew,
    content,
    attachments,
    stream: true
  })
}

let failed = false
const deadline = setTimeout(() => {
  console.error('Lifecycle probe exceeded four minutes')
  forgetAllAcpSessions('fx')
  killAllAcpClients('fx')
}, 240000)
try {
  console.log(`Workspace: ${workspacePath}`)
  console.log('1. Start a shell in A, then run B while A remains active')
  const runningA = send(
    tempA,
    true,
    `Run exactly this shell command: printf '${startMarker}\\n'; sleep 60; printf '${cancelledMarker}\\n'. Wait for it to finish. Do not alter the command or start background work.`
  )
  await until(
    () =>
      toolCalls(events(sessionId(tempA))).some(
        call => typeof call.output === 'string' && call.output.includes(startMarker)
      ),
    'A shell output'
  )
  const a = sessionId(tempA)
  const runningB = send(
    tempB,
    true,
    `Run exactly this shell command: printf '${shellMarker}\\n'; printf '%0300d\\n' 0; printf 'OUTPUT_END\\n'. Then reply B_READY. Do not read or change any files.`
  )
  await until(
    () => getAcpActiveSessions('fx').filter(item => item.workspaceId === workspaceId).length === 2,
    'two simultaneous active chats'
  )
  checks.concurrentSessions = true
  console.log('Two chats are active in the same workspace')

  console.log('2. Cancel A during its shell; B must continue')
  const cancelledAt = Date.now()
  await interruptAcpRun(config, { workspaceId, sessionId: a })
  await runningA
  report.cancellationMs = Date.now() - cancelledAt
  checks.cancelledAcknowledged = frames().some(
    frame => frame.kind === 'stopped' && frame.sessionId === a
  )
  checks.cancelDidNotReportSuccess = toolCalls(events(a)).some(
    call => call.name === 'shell' && call.state !== 'success'
  )
  checks.cancelledCommandDidNotFinish = !toolCalls(events(a)).some(
    call => typeof call.output === 'string' && call.output.includes(cancelledMarker)
  )
  report.cancelledEvents = events(a)
  console.log(
    `Cancellation acknowledged: ${checks.cancelledAcknowledged} (${report.cancellationMs} ms)`
  )

  await runningB
  const b = sessionId(tempB)
  const bTools = toolCalls(events(b))
  checks.shellCompleted = bTools.some(call => call.name === 'shell' && call.state === 'success')
  checks.shellOutputPreserved = bTools.some(
    call =>
      typeof call.output === 'string' &&
      call.output.includes(shellMarker) &&
      call.output.includes('OUTPUT_END')
  )
  checks.bSurvivedCancellation = assistantText(events(b)).includes('B_READY')
  report.shellEvents = events(b)
  console.log(
    `B completed: ${checks.bSurvivedCancellation}; full live shell output: ${checks.shellOutputPreserved}`
  )

  console.log('3. Continue A after cancellation')
  await send(a, false, 'Do not run tools. Reply exactly A_READY.')
  checks.continuedAfterCancellation = assistantText(events(a)).includes('A_READY')

  console.log('4. Upload an in-memory image whose six digits appear nowhere in the prompt')
  const png = await sharp(
    Buffer.from(
      `<svg width="440" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="30" y="110" font-family="monospace" font-size="88" fill="black">${imageDigits}</text></svg>`
    )
  )
    .png()
    .toBuffer()
  const upload = await addUpload({
    workspaceId,
    filename: 'vision.png',
    mediaType: 'image/png',
    bytes: png
  })
  await send(
    tempImage,
    true,
    'Read the six digits in the attached image. Reply only with the digits. Do not call tools or inspect files.',
    [upload.id]
  )
  const imageSession = sessionId(tempImage)
  checks.inlineVision = assistantText(events(imageSession)).trim() === imageDigits
  checks.visionDidNotReadFiles = toolCalls(events(imageSession)).length === 0
  report.imageAnswer = assistantText(events(imageSession))
  report.imageExpected = imageDigits
  console.log(`Inline-only image read: ${checks.inlineVision}`)

  console.log('5. Kill owned processes, discover chats, and cold-load all three')
  forgetAllAcpSessions('fx')
  killAllAcpClients('fx')
  const listed = await listAcpSessions(config, { workspaceId, workspacePath })
  checks.discoveredAllSessions = [a, b, imageSession].every(id =>
    listed.some(row => row.sessionId === id)
  )
  const replayA = await ensureAcpSessionLive(config, { workspaceId, workspacePath, sessionId: a })
  const replayB = await ensureAcpSessionLive(config, { workspaceId, workspacePath, sessionId: b })
  const replayImage = await ensureAcpSessionLive(config, {
    workspaceId,
    workspacePath,
    sessionId: imageSession
  })
  checks.cancelledHistoryRetained = assistantText(replayA).includes('A_READY')
  checks.shellReplayStructured = toolCalls(replayB).some(
    call => call.name === 'shell' && call.state === 'success'
  )
  checks.shellReplayShowsOutputLimit = toolCalls(replayB).some(
    call =>
      typeof call.output === 'string' && call.output.includes('did not include command output')
  )
  checks.visionReplayRetained =
    assistantText(replayImage).trim() === imageDigits &&
    replayImage.some(
      event =>
        event.kind === 'turn' &&
        event.turn.role === 'user' &&
        event.turn.parts.some(part => part.type === 'file' && part.mediaType.startsWith('image/'))
    )
  report.replayShellEvents = replayB
  report.replayImageEvents = replayImage
  report.errors = frames().filter(frame => frame.kind === 'error')
  checks.noHostErrors = (report.errors as unknown[]).length === 0
  report.wire = getWireLog(workspacePath)
  console.log(JSON.stringify(checks, null, 2))
  failed = Object.values(checks).some(result => !result)
} catch (error) {
  failed = true
  report.failure = error instanceof Error ? error.message : String(error)
  report.errors = frames().filter(frame => frame.kind === 'error')
  report.wire = getWireLog(workspacePath)
  console.error(report.failure)
} finally {
  clearTimeout(deadline)
  forgetAllAcpSessions('fx')
  killAllAcpClients('fx')
  const path = join(root, 'report.json')
  await Bun.write(
    path,
    JSON.stringify(
      report,
      (key, value: unknown) =>
        (key === 'data' || key === 'url') && typeof value === 'string' && value.length > 256
          ? '(inline image omitted)'
          : value,
      2
    )
  )
  console.log(`Report: ${path}`)
}
process.exit(failed ? 1 : 0)
