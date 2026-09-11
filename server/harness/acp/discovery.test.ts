import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  archivedAcpSessions,
  DEFAULT_ARCHIVED_SESSIONS_PATH,
  setArchivedSessionsPath
} from './archived'
import { getAcpClient, killAcpWorkspace } from './client'
import { listAcpModels, listAcpSessions } from './discovery'
import { clearAcpModelCache } from './model-state'
import type { AcpProviderConfig } from './session'
import type { AcpNewSessionResult, ListSessionsResponse } from './wire'

// Every created session persists, including empty user chats. This mirrors the
// native stores that cannot remove model-discovery sessions through ACP.
const SOURCE = `
const {readFileSync,writeFileSync}=require('node:fs')
const rows=()=>JSON.parse(readFileSync(process.env.SESSIONS,'utf8'))
const send=value=>process.stdout.write(JSON.stringify(value)+'\\n')
let buffer=''
process.stdin.on('data',chunk=>{
  buffer+=chunk
  let nl
  while((nl=buffer.indexOf('\\n'))>=0){
    const msg=JSON.parse(buffer.slice(0,nl));buffer=buffer.slice(nl+1)
    const result=value=>send({jsonrpc:'2.0',id:msg.id,result:value})
    if(msg.method==='initialize') result({protocolVersion:1,agentCapabilities:{}})
    else if(msg.method==='session/new') {
      const sessions=rows(),sessionId='session-'+(sessions.length+1)
      sessions.push({sessionId,cwd:msg.params.cwd,title:'Untitled'})
      writeFileSync(process.env.SESSIONS,JSON.stringify(sessions))
      result({sessionId,models:{currentModelId:'model-a',availableModels:[{modelId:'model-a'}]}})
    } else if(msg.method==='session/list') result({sessions:rows()})
    else if(msg.id!==undefined) result({})
  }
})
`

const directories: string[] = []
afterEach(async () => {
  for (const dir of directories.splice(0)) {
    killAcpWorkspace(dir)
    clearAcpModelCache(dir)
    await rm(dir, { recursive: true, force: true })
  }
  setArchivedSessionsPath(DEFAULT_ARCHIVED_SESSIONS_PATH)
})

describe('ACP discovery sessions', () => {
  for (const provider of ['fx', 'hermes'] as const) {
    test(`${provider} hides only its owned model-discovery rows without deleting native history`, async () => {
      const dir = await realpath(await mkdtemp(join(tmpdir(), 'moi-acp-discovery-test-')))
      directories.push(dir)
      const nativeStore = join(dir, 'native-sessions.json')
      await Bun.write(nativeStore, '[]')
      setArchivedSessionsPath(join(dir, 'archived-sessions.json'))
      const config: AcpProviderConfig = {
        id: provider,
        provider,
        ...(provider === 'fx' ? { processScope: 'session' } : {}),
        spawn: async () => ({
          provider,
          command: process.execPath,
          args: ['-e', SOURCE],
          workspacePath: dir,
          env: { SESSIONS: nativeStore }
        })
      }
      const ctx = { workspaceId: dir, workspacePath: dir }
      const client = await getAcpClient({
        ...(await config.spawn(ctx)),
        ...(provider === 'fx' ? { scope: 'user-chat' } : {})
      })
      const userChat = await client.rpc<AcpNewSessionResult>('session/new', {
        cwd: dir,
        mcpServers: []
      })
      expect(await listAcpModels(config, ctx)).toEqual([
        { value: 'model-a', displayName: 'model-a' }
      ])
      expect((await listAcpSessions(config, ctx)).map(session => session.sessionId)).toEqual([
        userChat.sessionId
      ])
      expect(await archivedAcpSessions(dir)).toEqual(new Set(['session-2']))

      // A cached catalog creates no row. Rediscovery hides only its new id.
      await listAcpModels(config, ctx)
      clearAcpModelCache(dir, provider)
      await listAcpModels(config, ctx)
      expect(await archivedAcpSessions(dir)).toEqual(new Set(['session-2', 'session-3']))
      expect((await listAcpSessions(config, ctx)).map(session => session.sessionId)).toEqual([
        userChat.sessionId
      ])
      const native = await client.rpc<ListSessionsResponse>('session/list', { cwd: dir })
      expect(native.sessions?.map(session => session.sessionId)).toEqual([
        'session-1',
        'session-2',
        'session-3'
      ])
      expect(client.isAlive()).toBe(true)
    })
  }
})
