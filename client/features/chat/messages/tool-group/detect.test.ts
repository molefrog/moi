import { describe, expect, test } from 'bun:test'

import type { ToolCall } from '@/lib/types'

import { detectOutput } from './detect'

function call(name: string, input: unknown, sidecar?: Record<string, unknown>): ToolCall {
  return {
    toolCallId: 'c',
    name,
    input,
    caller: 'model',
    provider: 'fx',
    state: 'success',
    ...(sidecar ? { sidecar } : {})
  }
}

describe('fx tool output', () => {
  test('unwraps fx file reads into highlighted source', () => {
    const output = '<path>src/a.ts</path>\n<content>\n1\tconst a = 1\n2\texport { a }\n</content>'
    expect(detectOutput(call('read_file', { path: 'src/a.ts' }), output)).toEqual({
      kind: 'highlight',
      code: 'const a = 1\nexport { a }',
      label: 'ts'
    })
  })

  test('shows written content for fx writes', () => {
    const write = call('write_file', { path: 'src/a.ts', content: 'export const a = 1\n' })
    expect(detectOutput(write, 'wrote src/a.ts (19 bytes)')).toMatchObject({
      kind: 'highlight',
      code: 'export const a = 1\n'
    })
  })

  test('renders live edits from their replaced and new text', () => {
    const edit = call('edit_file', {
      path: 'a.txt',
      old_string: 'hello',
      new_string: 'hello\nworld'
    })
    expect(detectOutput(edit, 'edited a.txt (11 bytes)')).toEqual({
      kind: 'diff',
      label: 'diff',
      code: '-hello\n+hello\n+world',
      lines: [
        { kind: 'deletion', text: 'hello' },
        { kind: 'addition', text: 'hello' },
        { kind: 'addition', text: 'world' }
      ]
    })
  })

  test("prefers fx's committed diff and keeps new files as source", () => {
    const change = {
      path: 'a.ts',
      kind: 'edited',
      lines: [
        { kind: 'context', text: 'keep' },
        { kind: 'addition', text: 'add' }
      ]
    }
    expect(
      detectOutput(
        call('write_file', { path: 'a.ts', content: 'keep\nadd' }, { fxFileChange: change }),
        ''
      )
    ).toMatchObject({
      kind: 'diff',
      code: ' keep\n+add'
    })
    const added = { ...change, kind: 'added' }
    expect(
      detectOutput(
        call('write_file', { path: 'a.ts', content: 'new' }, { fxFileChange: added }),
        ''
      )
    ).toMatchObject({
      kind: 'highlight',
      code: 'new'
    })
  })

  test('leaves other output alone', () => {
    expect(detectOutput(call('read_file', { path: 'notes' }), 'plain text')).toEqual({
      kind: 'plain'
    })
  })
})
