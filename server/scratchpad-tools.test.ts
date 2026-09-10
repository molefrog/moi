import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import sharp from 'sharp'

import { addClient, removeClient } from './state'
import { getScratchpadPath, loadScratchpadDoc, saveScratchpadDoc } from './scratchpad'
import { resolveScratchOp } from './scratchpad-relay'
import { callTool, listTools } from './tools'

let root = ''
let workspace: { id: string; path: string }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'moi-scratch-tools-'))
  workspace = { id: `scratch-${crypto.randomUUID()}`, path: root }
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const call = (name: string, args: Record<string, unknown> = {}) =>
  callTool(workspace, 'scratchpad', name, args)

describe('scratchpad tools', () => {
  test('discovers the complete built-in catalog without view UI metadata', async () => {
    const result = await listTools(workspace, 'scratchpad')
    expect(result).toEqual({
      target: 'scratchpad',
      tools: expect.arrayContaining([
        expect.objectContaining({ name: 'read_canvas', runtime: 'server' }),
        expect.objectContaining({ name: 'clear_canvas', runtime: 'server' })
      ])
    })
    expect(result.tools.map(tool => tool.name)).toEqual([
      'read_canvas',
      'read_image',
      'render_canvas',
      'add_text',
      'add_rectangle',
      'add_note',
      'add_arrow',
      'add_image',
      'move_shape',
      'set_shape_text',
      'delete_shape',
      'clear_canvas'
    ])
    expect(result.tools.every(tool => tool.inputSchema.additionalProperties === false)).toBe(true)
    expect(result.tools.find(tool => tool.name === 'read_canvas')?.annotations).toEqual({
      readOnlyHint: true
    })
    expect(result.tools.find(tool => tool.name === 'delete_shape')?.annotations).toEqual({
      consequentialHint: true
    })
  })

  test('maps every shape mutation onto the existing headless executor', async () => {
    expect(
      await call('add_rectangle', {
        id: 'box',
        x: 10,
        y: 20,
        width: 100,
        height: 80,
        text: 'Old',
        color: '#4465e9',
        fill: 'pattern',
        fontSize: 'big'
      })
    ).toEqual({ id: 'box' })
    expect(await call('add_text', { x: 150, y: 20, text: 'Label' })).toEqual({
      id: expect.stringMatching(/^s_[0-9a-f]{8}$/)
    })
    expect(await call('add_note', { id: 'note', x: 300, y: 20, text: 'Note' })).toEqual({
      id: 'note'
    })
    expect(
      await call('add_arrow', {
        id: 'arrow',
        from: 'box',
        to: { x: 400, y: 100 },
        color: 'red',
        stroke: 'large',
        elbow: true
      })
    ).toEqual({ id: 'arrow' })
    expect(await call('move_shape', { id: 'box', x: 25, y: 35 })).toEqual({ ok: true })
    expect(await call('set_shape_text', { id: 'box', text: 'New' })).toEqual({ ok: true })

    const read = await call('read_canvas')
    expect(read).toMatchObject({
      shapes: expect.arrayContaining([
        expect.objectContaining({ id: 'box', x: 25, y: 35, text: 'New' }),
        expect.objectContaining({ id: 'note', text: 'Note' }),
        expect.objectContaining({ id: 'arrow', type: 'arrow' })
      ])
    })
    const { document } = await loadScratchpadDoc(root)
    const box = document?.store?.['shape:box'] as { props?: Record<string, unknown> } | undefined
    expect(box?.props).toMatchObject({ color: 'blue', fill: 'pattern', size: 'xl' })

    expect(await call('delete_shape', { id: 'arrow' })).toEqual({ ok: true })
    expect(await call('clear_canvas')).toEqual({ ok: true })
    expect(await call('read_canvas')).toEqual({ shapes: [] })
  })

  test('validates named JSON arguments before changing the canvas', async () => {
    await expect(call('add_rectangle', { x: 0, y: 0, width: 20 })).rejects.toThrow(
      'Invalid tool arguments'
    )
    await expect(call('add_text', { x: 0, y: 0, text: 'x', color: 'purple' })).rejects.toThrow(
      'Invalid tool arguments'
    )
    await expect(call('add_arrow', { from: { x: 0 }, to: { x: 1, y: 2 } })).rejects.toThrow(
      'Invalid tool arguments'
    )
    await expect(call('read_canvas', { extra: true })).rejects.toThrow('Invalid tool arguments')
    await expect(call('missing')).rejects.toThrow('Unknown tool "missing" for scratchpad')
    await expect(listTools(workspace, 'widgets')).rejects.toThrow('tool target')
  })

  test('adds images and materializes image bytes through tool results', async () => {
    const source = join(root, 'source.png')
    await sharp({
      create: { width: 64, height: 32, channels: 3, background: { r: 20, g: 80, b: 160 } }
    })
      .png()
      .toFile(source)

    expect(await call('add_image', { id: 'pic', path: 'source.png', x: 4, y: 8 })).toEqual({
      id: 'pic'
    })
    const requested = join(root, 'copy.webp')
    expect(await call('read_image', { id: 'pic', outputPath: 'copy.webp' })).toEqual({
      path: requested
    })
    expect(await Bun.file(requested).exists()).toBe(true)

    const automatic = (await call('read_image', { id: 'pic' })) as { path: string }
    expect(isAbsolute(automatic.path)).toBe(true)
    expect(await Bun.file(automatic.path).exists()).toBe(true)
    rmSync(automatic.path, { force: true })
  })

  test('returns remote image URLs without downloading them', async () => {
    await saveScratchpadDoc(
      {
        store: {
          'shape:remote': {
            typeName: 'shape',
            id: 'shape:remote',
            type: 'image',
            x: 0,
            y: 0,
            props: { assetId: 'asset:remote' }
          },
          'asset:remote': {
            typeName: 'asset',
            id: 'asset:remote',
            props: { src: 'https://example.com/image.png' }
          }
        }
      },
      root
    )
    expect(await call('read_image', { id: 'remote' })).toEqual({
      url: 'https://example.com/image.png'
    })
  })

  test('renders through the live Scratchpad relay and returns a file path', async () => {
    const bytes = Buffer.from('rendered canvas')
    const client = {
      send(json: string) {
        const message = JSON.parse(json) as { type?: string; opId?: string }
        if (message.type === 'scratchpad:op' && message.opId) {
          queueMicrotask(() =>
            resolveScratchOp(message.opId!, {
              image: `data:image/png;base64,${bytes.toString('base64')}`
            })
          )
        }
      }
    } as unknown as Bun.ServerWebSocket<unknown>
    addClient(client)
    try {
      const path = join(root, 'canvas.png')
      expect(await call('render_canvas', { outputPath: 'canvas.png' })).toEqual({ path })
      expect(Buffer.from(await Bun.file(path).arrayBuffer())).toEqual(bytes)

      const automatic = (await call('render_canvas')) as { path: string }
      expect(isAbsolute(automatic.path)).toBe(true)
      expect(Buffer.from(await Bun.file(automatic.path).arrayBuffer())).toEqual(bytes)
      rmSync(automatic.path, { force: true })
    } finally {
      removeClient(client)
    }
  })

  test('reports the existing error when render_canvas has no live Scratchpad', async () => {
    await expect(call('render_canvas')).rejects.toThrow(
      'No live canvas — open the Scratchpad tab for this workspace.'
    )
  }, 12_000)

  test('keeps raw reads available while mutations report version skew', async () => {
    await call('add_note', { id: 'note', x: 0, y: 0, text: 'Hello' })
    const path = getScratchpadPath(root)
    const file = JSON.parse(await Bun.file(path).text())
    file.document.schema.sequences['com.tldraw.shape.note'] += 1
    file.writer = { moi: '9.9.9', tldraw: '99.0.0' }
    await Bun.write(path, JSON.stringify(file))

    expect(await call('read_canvas')).toEqual({
      shapes: [expect.objectContaining({ id: 'note', text: 'Hello' })]
    })
    await expect(call('add_rectangle', { x: 0, y: 0, width: 10, height: 10 })).rejects.toThrow(
      'written by a newer moi'
    )
  })
})
