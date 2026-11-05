import { expect, expectTypeOf, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { z } from 'zod'
import { actionProgressToolName, executeHarnessAction } from './run-action'
import type { HarnessActionInput } from './types'

test('progress options must be supplied together or omitted', () => {
  type Input = HarnessActionInput<string, number>
  type Base = Pick<Input, 'prompt' | 'resultSchema' | 'signal'>
  expectTypeOf<Base>().toMatchTypeOf<Input>()
  expectTypeOf<Base & { progressSchema: z.ZodNumber }>().not.toMatchTypeOf<Input>()
  expectTypeOf<Base & { onProgress: (progress: number) => void }>().not.toMatchTypeOf<Input>()
  expectTypeOf<
    Base & {
      progressSchema: z.ZodNumber
      onProgress: (progress: number) => void
    }
  >().toMatchTypeOf<Input>()
})

const input = {
  prompt: 'Work',
  resultSchema: z.object({ count: z.number() }),
  signal: new AbortController().signal
}

test.each(['fast', 'normal', 'smart', undefined] as const)(
  'forwards action model %s and defaults to normal',
  async model => {
    await executeHarnessAction({ ...input, model }, async action => {
      expect(action.model).toBe(model ?? 'normal')
      return { count: 3 }
    })
  }
)

test('actions infer and validate results without configuring progress', async () => {
  const result = await executeHarnessAction(input, async action => {
    expect(action.progressUrl).toBeUndefined()
    expect(action.prompt).toBe('Work')
    expect(action.resultSchema.$schema).toBe('http://json-schema.org/draft-07/schema#')
    return { count: 3 }
  })
  expectTypeOf(result.count).toBeNumber()
  expect(result.count).toBe(3)
  await expect(executeHarnessAction(input, async () => ({ count: 'invalid' }))).rejects.toThrow()
})

test('the reporting tool validates arbitrary metadata and closes with the action', async () => {
  const updates: number[] = []
  let endpoint = ''
  const payload = { source: 'records', meta: { processed: 2 } }
  await executeHarnessAction(
    {
      ...input,
      progressSchema: z.object({ source: z.string(), meta: z.object({ processed: z.number() }) }),
      onProgress: progress => {
        updates.push(progress.meta.processed)
      }
    },
    async action => {
      endpoint = action.progressUrl!
      const client = new Client({ name: 'action-test', version: '1.0.0' })
      const report = (progress: unknown) =>
        client.callTool({ name: actionProgressToolName, arguments: { progress } })
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)))
        expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
          actionProgressToolName
        ])
        expect((await report({ ...payload, meta: { processed: 'invalid' } })).isError).toBe(true)
        expect(updates).toEqual([])
        expect((await report(payload)).isError).not.toBe(true)
        expect(updates).toEqual([2])
        expect((await fetch(new URL('/wrong-action', endpoint))).status).toBe(404)
        expect((await fetch(endpoint, { headers: { origin: 'https://example.com' } })).status).toBe(
          404
        )
        return { count: 2 }
      } finally {
        await client.close()
      }
    }
  )
  await expect(fetch(endpoint)).rejects.toThrow()
})

for (const failure of ['cancelled', 'provider failed']) {
  test(`reporting closes when ${failure}`, async () => {
    const controller = new AbortController()
    let endpoint = ''
    await expect(
      executeHarnessAction(
        {
          ...input,
          signal: controller.signal,
          progressSchema: z.string(),
          onProgress: () => {}
        },
        async action => {
          endpoint = action.progressUrl!
          if (failure === 'provider failed') throw new Error(failure)
          controller.abort()
          return { count: 1 }
        }
      )
    ).rejects.toThrow(failure === 'cancelled' ? 'Action cancelled' : failure)
    await expect(fetch(endpoint)).rejects.toThrow()
  })
}
