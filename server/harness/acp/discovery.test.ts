import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { killAllAcpClients } from './client'
import { clearAcpModelCache, listAcpModels } from './discovery'
import type { AcpProviderConfig } from './session'

const AGENT_SOURCE = `
const states = JSON.parse(process.env.MOCK_MODEL_STATES ?? '[]')
const send = value => process.stdout.write(JSON.stringify(value) + '\\n')
let stateIndex = 0
let buffer = ''
process.stdin.on('data', chunk => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    if (!line.trim()) continue
    const message = JSON.parse(line)
    if (message.method === 'initialize') {
      send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1, agentCapabilities: {} } })
    } else if (message.method === 'session/new') {
      const models = states[Math.min(stateIndex++, states.length - 1)]
      send({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'discovery-test', models } })
    }
  }
})
`

const modelStates = [
  {
    availableModels: [{ modelId: 'model-a' }, { modelId: 'model-b' }],
    currentModelId: 'model-a'
  },
  {
    availableModels: [{ modelId: 'model-a' }, { modelId: 'model-b' }],
    currentModelId: 'model-b'
  }
]

async function mockConfig(refreshModelState: boolean) {
  const workspacePath = await mkdtemp(join(tmpdir(), 'acp-discovery-test-'))
  const agentPath = join(workspacePath, 'mock-acp-agent.js')
  await Bun.write(agentPath, AGENT_SOURCE)
  const config: AcpProviderConfig = {
    id: 'hermes',
    provider: 'hermes',
    refreshModelState,
    mapModels: state => [
      {
        value: state.currentModelId ?? 'missing',
        displayName: state.currentModelId ?? 'missing'
      }
    ],
    spawn: async () => ({
      provider: 'hermes',
      command: process.execPath,
      args: [agentPath],
      workspacePath,
      env: { MOCK_MODEL_STATES: JSON.stringify(modelStates) }
    })
  }
  return { config, workspacePath }
}

afterAll(() => {
  killAllAcpClients()
})

describe('ACP model discovery cache', () => {
  test('refreshes mutable model state for providers that opt in', async () => {
    const { config, workspacePath } = await mockConfig(true)
    const context = { workspaceId: 'refresh', workspacePath }

    expect((await listAcpModels(config, context))[0]?.value).toBe('model-a')
    expect((await listAcpModels(config, context))[0]?.value).toBe('model-b')
  })

  test('keeps the existing process-lifetime cache for other ACP providers', async () => {
    const { config, workspacePath } = await mockConfig(false)
    const context = { workspaceId: 'cached', workspacePath }

    expect((await listAcpModels(config, context))[0]?.value).toBe('model-a')
    expect((await listAcpModels(config, context))[0]?.value).toBe('model-a')
    clearAcpModelCache(workspacePath)
    expect((await listAcpModels(config, context))[0]?.value).toBe('model-b')
  })
})
