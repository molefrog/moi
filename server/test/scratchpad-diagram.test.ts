import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'path'

import { createTLStore, defaultBindingUtils, defaultShapeUtils, loadSnapshot } from 'tldraw'

import type { ScratchDiagramSpec, ScratchOp } from '@/lib/types'

import { loadScratchpadDoc, readScratchpadShapes } from '../scratchpad'
import { compileDiagramSpec } from '../scratchpad-diagram'
import { executeScratchOp } from '../scratchpad-executor'
import { fitRectToLabel } from '../scratchpad-metrics'

// The diagram compiler end-to-end: spec in, measured + ELK-laid-out tldraw
// records out, persisted through the same headless path as every other op. The
// tests assert the *guarantees* the compiler makes — no overlaps, labels fit,
// groups contain their children, arrows are bound — not exact pixel positions,
// which belong to ELK.

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'scratch-diagram-test-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

const run = (op: ScratchOp) => executeScratchOp(WS, 'ws-test', op)

// Loads the persisted snapshot into a fresh store the way the browser does. Throws
// (failing the test) if any record is invalid, then returns the shape count.
async function assertLoadable(): Promise<number> {
  const { document } = await loadScratchpadDoc(WS)
  const store = createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils })
  loadSnapshot(store, { document } as unknown as Parameters<typeof loadSnapshot>[1])
  return store.allRecords().filter(r => r.typeName === 'shape').length
}

// The design doc's motivating scenario: browser → proxy → service-in-a-private-
// network, labeled edges, a title, and a side note.
const TAILSCALE_SPEC: ScratchDiagramSpec = {
  title: 'How to expose a Tailscale service',
  direction: 'right',
  nodes: [
    { id: 'browser', label: 'Browser (internet)', color: 'blue' },
    {
      id: 'proxy',
      label: 'Reverse proxy (Caddy)\nterminates TLS, forwards to the tailnet',
      color: 'green',
      width: 280
    },
    { id: 'svc', label: 'Service\nlocalhost:3000', color: 'black' },
    {
      id: 'tip',
      label: 'MagicDNS gives every machine a stable name',
      shape: 'note',
      color: 'yellow'
    }
  ],
  groups: [
    { id: 'tailnet', label: 'Tailscale network (private)', color: 'grey', children: ['svc'] }
  ],
  edges: [
    { from: 'browser', to: 'proxy', label: 'https://app.yourdomain.com', color: 'blue' },
    { from: 'proxy', to: 'svc', label: 'tailnet IP', elbow: true }
  ]
}

type Rect = { x: number; y: number; w: number; h: number }
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// Read a shape's rect off the disk snapshot; notes have no w/h props (fixed 200).
async function shapeRects(): Promise<Map<string, Rect & { type: string; text?: string }>> {
  const shapes = await readScratchpadShapes(WS)
  return new Map(
    shapes.map(s => [
      s.id,
      { x: s.x, y: s.y, w: s.w ?? 200, h: s.h ?? 200, type: s.type, text: s.text }
    ])
  )
}

describe('moi scratch diagram (compiler)', () => {
  test('compiles the Tailscale spec into a browser-loadable snapshot with prefixed ids', async () => {
    const result = await run({ kind: 'diagram', name: 'd1', spec: TAILSCALE_SPEC })
    expect(result).toEqual({
      name: 'd1',
      created: [
        'd1-tailnet',
        'd1-browser',
        'd1-proxy',
        'd1-svc',
        'd1-tip',
        'd1-title',
        'd1-edge-0',
        'd1-edge-1'
      ]
    })
    // 4 nodes + 1 group + title + 2 arrows.
    expect(await assertLoadable()).toBe(8)

    const rects = await shapeRects()
    expect(rects.get('d1-browser')).toMatchObject({ type: 'geo', text: 'Browser (internet)' })
    expect(rects.get('d1-tip')?.type).toBe('note')
    expect(rects.get('d1-title')).toMatchObject({
      type: 'text',
      text: 'How to expose a Tailscale service'
    })
    expect(rects.get('d1-edge-0')).toMatchObject({
      type: 'arrow',
      text: 'https://app.yourdomain.com'
    })
  })

  test('node rects never pairwise overlap', async () => {
    await run({ kind: 'diagram', name: 'd1', spec: TAILSCALE_SPEC })
    const rects = await shapeRects()
    const nodeIds = ['d1-browser', 'd1-proxy', 'd1-svc', 'd1-tip']
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = rects.get(nodeIds[i])!
        const b = rects.get(nodeIds[j])!
        expect(overlaps(a, b)).toBe(false)
      }
    }
  })

  test('every node rect is at least as big as its measured label', async () => {
    await run({ kind: 'diagram', name: 'd1', spec: TAILSCALE_SPEC })
    const rects = await shapeRects()
    for (const node of TAILSCALE_SPEC.nodes) {
      if (node.shape === 'note') continue
      const fit = fitRectToLabel(node.label, {
        size: 'm',
        targetWidth: node.width ?? 260,
        minW: 120,
        minH: 64
      })
      const rect = rects.get(`d1-${node.id}`)!
      expect(rect.w).toBeGreaterThanOrEqual(fit.w)
      expect(rect.h).toBeGreaterThanOrEqual(fit.h)
    }
  })

  test('a group rect contains its children with padding', async () => {
    await run({ kind: 'diagram', name: 'd1', spec: TAILSCALE_SPEC })
    const rects = await shapeRects()
    const group = rects.get('d1-tailnet')!
    const child = rects.get('d1-svc')!
    // ELK padding: [top=56,left=24,bottom=24,right=24] (label room at the top).
    expect(child.x).toBeGreaterThanOrEqual(group.x + 24)
    expect(child.y).toBeGreaterThanOrEqual(group.y + 56)
    expect(child.x + child.w).toBeLessThanOrEqual(group.x + group.w - 24)
    expect(child.y + child.h).toBeLessThanOrEqual(group.y + group.h - 24)
    // Group boxes are outlines, not washes — children stay visible.
    const { document } = await loadScratchpadDoc(WS)
    const record = Object.values(document!.store!).find(
      r => (r as { id?: string }).id === 'shape:d1-tailnet'
    ) as { props: { fill: string; align: string; verticalAlign: string } }
    expect(record.props.fill).toBe('none')
    expect(record.props.align).toBe('start')
    expect(record.props.verticalAlign).toBe('start')
  })

  test('arrows are bound to their endpoint shapes', async () => {
    await run({ kind: 'diagram', name: 'd1', spec: TAILSCALE_SPEC })
    const { document } = await loadScratchpadDoc(WS)
    const bindings = Object.values(document!.store!).filter(
      r => (r as { typeName?: string }).typeName === 'binding'
    ) as { fromId: string; toId: string; props: { terminal: string } }[]
    const byArrow = (arrow: string, terminal: string) =>
      bindings.find(b => b.fromId === `shape:${arrow}` && b.props.terminal === terminal)
    expect(byArrow('d1-edge-0', 'start')?.toId).toBe('shape:d1-browser')
    expect(byArrow('d1-edge-0', 'end')?.toId).toBe('shape:d1-proxy')
    expect(byArrow('d1-edge-1', 'start')?.toId).toBe('shape:d1-proxy')
    expect(byArrow('d1-edge-1', 'end')?.toId).toBe('shape:d1-svc')
  })

  test('the title sits above every node', async () => {
    await run({ kind: 'diagram', name: 'd1', spec: TAILSCALE_SPEC })
    const rects = await shapeRects()
    const title = rects.get('d1-title')!
    for (const id of ['d1-browser', 'd1-proxy', 'd1-svc', 'd1-tip', 'd1-tailnet']) {
      expect(title.y).toBeLessThan(rects.get(id)!.y)
    }
  })

  test('a second diagram auto-places below the first; --at overrides', async () => {
    await run({ kind: 'diagram', name: 'd1', spec: TAILSCALE_SPEC })
    const before = await shapeRects()
    const firstBottom = Math.max(
      ...['d1-browser', 'd1-proxy', 'd1-svc', 'd1-tip', 'd1-tailnet'].map(id => {
        const r = before.get(id)!
        return r.y + r.h
      })
    )

    await run({
      kind: 'diagram',
      name: 'd2',
      spec: { nodes: [{ id: 'solo', label: 'Below the fold' }] }
    })
    const after = await shapeRects()
    expect(after.get('d2-solo')!.y).toBeGreaterThanOrEqual(firstBottom + 96)

    await run({
      kind: 'diagram',
      name: 'd3',
      spec: { nodes: [{ id: 'pinned', label: 'Pinned' }] },
      x: 5000,
      y: 7000
    })
    const pinned = (await shapeRects()).get('d3-pinned')!
    expect(pinned.x).toBe(5000)
    expect(pinned.y).toBe(7000)
  })

  test('an empty canvas anchors the diagram (title included) at 0,0', async () => {
    await run({ kind: 'diagram', name: 'd1', spec: TAILSCALE_SPEC })
    const rects = await shapeRects()
    // The title is the topmost element, so it carries the anchor's y.
    expect(rects.get('d1-title')!.y).toBe(0)
  })

  test('refuses to overwrite an existing shape id', async () => {
    await run({ kind: 'add-rect', name: 'd1-browser', x: 0, y: 0, w: 10, h: 10 })
    await expect(run({ kind: 'diagram', name: 'd1', spec: TAILSCALE_SPEC })).rejects.toThrow(
      /d1-browser.*already exists/
    )
  })

  test('layout is deterministic for the same spec', async () => {
    await run({ kind: 'diagram', name: 'a', spec: TAILSCALE_SPEC, x: 0, y: 0 })
    await run({ kind: 'diagram', name: 'b', spec: TAILSCALE_SPEC, x: 0, y: 10000 })
    const rects = await shapeRects()
    for (const node of TAILSCALE_SPEC.nodes) {
      const a = rects.get(`a-${node.id}`)!
      const b = rects.get(`b-${node.id}`)!
      expect(b.x).toBe(a.x)
      expect(b.y - 10000).toBe(a.y)
    }
  })

  test('nested groups are laid out and contained', async () => {
    await run({
      kind: 'diagram',
      name: 'n',
      spec: {
        nodes: [{ id: 'leaf', label: 'Leaf' }],
        groups: [
          { id: 'outer', label: 'Outer', children: ['inner'] },
          { id: 'inner', label: 'Inner', children: ['leaf'] }
        ]
      }
    })
    const rects = await shapeRects()
    const outer = rects.get('n-outer')!
    const inner = rects.get('n-inner')!
    const leaf = rects.get('n-leaf')!
    expect(inner.x).toBeGreaterThanOrEqual(outer.x)
    expect(inner.y).toBeGreaterThanOrEqual(outer.y)
    expect(inner.x + inner.w).toBeLessThanOrEqual(outer.x + outer.w)
    expect(leaf.x).toBeGreaterThanOrEqual(inner.x)
    expect(await assertLoadable()).toBe(3)
  })

  test('direction: down stacks layers vertically', async () => {
    await run({
      kind: 'diagram',
      name: 'v',
      spec: {
        direction: 'down',
        nodes: [
          { id: 'top', label: 'Top' },
          { id: 'bottom', label: 'Bottom' }
        ],
        edges: [{ from: 'top', to: 'bottom' }]
      }
    })
    const rects = await shapeRects()
    const top = rects.get('v-top')!
    const bottom = rects.get('v-bottom')!
    expect(bottom.y).toBeGreaterThanOrEqual(top.y + top.h)
  })
})

describe('diagram spec validation', () => {
  const expectFail = (spec: unknown, pattern: RegExp) =>
    expect(() => compileDiagramSpec(spec)).toThrow(pattern)

  test('rejects a non-object spec', () => {
    expectFail([], /must be a JSON object/)
    expectFail('nope', /must be a JSON object/)
  })

  test('rejects empty or missing nodes', () => {
    expectFail({}, /"nodes" must be a non-empty array/)
    expectFail({ nodes: [] }, /needs at least one node/)
  })

  test('rejects duplicate ids across nodes and groups', () => {
    expectFail(
      {
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'a', label: 'A again' }
        ]
      },
      /duplicate id "a"/
    )
    expectFail(
      { nodes: [{ id: 'a', label: 'A' }], groups: [{ id: 'a', label: 'G', children: ['a'] }] },
      /duplicate id "a"/
    )
  })

  test('rejects an unknown edge endpoint, naming it', () => {
    expectFail(
      { nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'ghost' }] },
      /unknown endpoint "ghost"/
    )
  })

  test('rejects an unknown color with the palette in the message', () => {
    expectFail({ nodes: [{ id: 'a', label: 'A', color: 'mauve' }] }, /Unknown color "mauve".*blue/)
  })

  test('rejects unknown keys (typo safety)', () => {
    expectFail({ nodes: [{ id: 'a', label: 'A', colour: 'blue' }] }, /unknown key "colour"/)
    expectFail({ nodes: [{ id: 'a', label: 'A' }], arrows: [] }, /unknown key "arrows"/)
  })

  test('rejects unknown group children and double membership', () => {
    expectFail(
      { nodes: [{ id: 'a', label: 'A' }], groups: [{ id: 'g', children: ['ghost'] }] },
      /unknown child "ghost"/
    )
    expectFail(
      {
        nodes: [{ id: 'a', label: 'A' }],
        groups: [
          { id: 'g1', children: ['a'] },
          { id: 'g2', children: ['a'] }
        ]
      },
      /child of both "g1" and "g2"/
    )
  })

  test('rejects group nesting cycles', () => {
    expectFail(
      {
        nodes: [{ id: 'a', label: 'A' }],
        groups: [
          { id: 'g1', children: ['g2'] },
          { id: 'g2', children: ['g1', 'a'] }
        ]
      },
      /cycle/
    )
  })

  test('rejects reserved and malformed ids', () => {
    expectFail({ nodes: [{ id: 'title', label: 'T' }] }, /reserved/)
    expectFail({ nodes: [{ id: 'edge-0', label: 'E' }] }, /reserved/)
    expectFail({ nodes: [{ id: 'has space', label: 'X' }] }, /invalid/)
  })

  test('rejects fill on note-shaped nodes and bad directions', () => {
    expectFail(
      { nodes: [{ id: 'a', label: 'A', shape: 'note', fill: 'semi' }] },
      /"fill" doesn't apply to note/
    )
    expectFail({ direction: 'left', nodes: [{ id: 'a', label: 'A' }] }, /"right" or "down"/)
  })

  test('validation errors surface through the executor too', async () => {
    await expect(
      run({ kind: 'diagram', name: 'd', spec: { nodes: [] } as unknown as ScratchDiagramSpec })
    ).rejects.toThrow(/at least one node/)
  })
})
