import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { SetSessionConfigOptionResponse } from '@agentclientprotocol/sdk'

import { fxModels, fxModelState } from '../fx/models'
import { DEFAULT_ARCHIVED_SESSIONS_PATH, setArchivedSessionsPath } from './archived'
import { killAcpWorkspace } from './client'
import { listAcpModels, listAcpSessions, probeAcpModel } from './discovery'
import { clearAcpModelCache } from './model-state'
import type { AcpProviderConfig } from './session'

// fx-shaped agent: effort is advertised only for the session's current model.
const SOURCE = `
const {appendFileSync}=require('node:fs')
const send=value=>process.stdout.write(JSON.stringify(value)+'\\n')
const efforts={'model-a':['auto','low'],'model-b':['auto','high','max'],'model-c':[]}
const options=model=>[
  {id:'provider',name:'Provider',category:'model',type:'select',currentValue:'gateway',options:[{value:'gateway',name:'Gateway'}]},
  {id:'model',name:'Model',category:'model',type:'select',currentValue:model,options:Object.keys(efforts).map(value=>({value,name:value}))},
  ...(efforts[model].length?[{id:'effort',name:'Effort',category:'thought_level',type:'select',currentValue:'auto',options:efforts[model].map(value=>({value,name:value}))}]:[])
]
let n=0,buffer='';const created=[]
process.stdin.on('data',chunk=>{
  buffer+=chunk
  let nl
  while((nl=buffer.indexOf('\\n'))>=0){
    const msg=JSON.parse(buffer.slice(0,nl));buffer=buffer.slice(nl+1)
    appendFileSync(process.env.LOG,JSON.stringify({method:msg.method,params:msg.params})+'\\n')
    const result=value=>send({jsonrpc:'2.0',id:msg.id,result:value})
    if(msg.method==='initialize') result({protocolVersion:1,agentCapabilities:{}})
    else if(msg.method==='session/new') {
      const sessionId='probe-'+process.pid+'-'+(++n)
      created.push({sessionId,cwd:msg.params.cwd})
      appendFileSync(process.env.SESSIONS,JSON.stringify({sessionId,cwd:msg.params.cwd})+'\\n')
      result({sessionId,configOptions:options('model-a')})
    }
    else if(msg.method==='session/set_config_option') result({configOptions:options(msg.params.value)})
    else if(msg.method==='session/list') result({sessions:require('node:fs').readFileSync(process.env.SESSIONS,'utf8').trim().split('\\n').filter(Boolean).map(line=>JSON.parse(line))})
    else if(msg.id!==undefined) result({})
  }
})
`

const directories: string[] = []
afterEach(async () => {
  for (const dir of directories.splice(0)) {
    killAcpWorkspace(dir, 'fx')
    clearAcpModelCache(dir, 'fx')
    await rm(dir, { recursive: true, force: true })
  }
  setArchivedSessionsPath(DEFAULT_ARCHIVED_SESSIONS_PATH)
})

test('fx learns an unseen model effort levels without changing the default', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'moi-acp-probe-test-')))
  directories.push(dir)
  setArchivedSessionsPath(join(dir, 'archived.json'))
  const log = join(dir, 'calls.jsonl')
  await Bun.write(join(dir, 'sessions.jsonl'), '')
  const config: AcpProviderConfig = {
    id: 'fx',
    provider: 'fx',
    processScope: 'session',
    modelState: fxModelState,
    mapModels: fxModels,
    probeModelOptions: async (client, sessionId, modelId) =>
      fxModelState({
        configOptions: (
          await client.rpc<SetSessionConfigOptionResponse>('session/set_config_option', {
            sessionId,
            configId: 'model',
            value: modelId
          })
        ).configOptions
      }),
    spawn: async () => ({
      provider: 'fx',
      command: process.execPath,
      args: ['-e', SOURCE],
      workspacePath: dir,
      env: { LOG: log, SESSIONS: join(dir, 'sessions.jsonl') }
    })
  }
  const ctx = { workspaceId: dir, workspacePath: dir }
  const find = async (value: string) =>
    (await listAcpModels(config, ctx)).find(model => model.value === value)
  const calls = async () =>
    (await Bun.file(log).text())
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as { method: string })

  expect((await find('model-b'))?.supportsEffort).toBeUndefined()
  await probeAcpModel(config, ctx, 'model-b')
  expect(await find('model-b')).toMatchObject({
    supportsEffort: true,
    supportedEffortLevels: ['auto', 'high', 'max']
  })
  expect((await find('default'))?.resolvedModel).toBe('model-a')
  expect((await find('model-a'))?.supportedEffortLevels).toEqual(['auto', 'low'])

  await probeAcpModel(config, ctx, 'model-c')
  expect((await find('model-c'))?.supportsEffort).toBe(false)

  // Known models and ids outside the catalog start no probe session.
  const before = (await calls()).filter(call => call.method === 'session/new').length
  await probeAcpModel(config, ctx, 'model-b')
  await probeAcpModel(config, ctx, 'not-a-model')
  expect((await calls()).filter(call => call.method === 'session/new')).toHaveLength(before)
  // Probe sessions exist in the agent's history but are hidden from the chat list.
  expect((await Bun.file(join(dir, 'sessions.jsonl')).text()).trim().split('\n').length).toBe(
    before
  )
  expect(await listAcpSessions(config, ctx)).toEqual([])

  // Refreshing the chat list reuses one warm process instead of spawning per call.
  const initializes = (await calls()).filter(call => call.method === 'initialize').length
  await Promise.all([listAcpSessions(config, ctx), listAcpSessions(config, ctx)])
  await listAcpSessions(config, ctx)
  expect((await calls()).filter(call => call.method === 'initialize')).toHaveLength(initializes)
})
