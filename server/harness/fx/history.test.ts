import { describe, expect, test } from 'bun:test'

import { fxFileChangeText, fxToolEnrichments, parseFxToolHistory } from './history'

// Trimmed from real `fx session --id <id> --json` output (fx 0.0.11).
const history = {
  kind: 'session_detail',
  id: 'abc',
  history: [
    {
      kind: 'assistant',
      user: { text: 'go', images: [] },
      assistant: 'done',
      execution: {
        schema_version: 3,
        tool_steps: [
          {
            assistant: null,
            tool_calls: [
              { id: 'sh', name: 'shell', arguments_json: '{"action":"run","command":"seq 3"}' },
              { id: 'bg', name: 'shell', arguments_json: '{"action":"run","command":"sleep 9"}' }
            ],
            tool_results: [
              {
                tool_call_id: 'sh',
                tool_name: 'shell',
                status: 'success',
                output: JSON.stringify({
                  session_id: null,
                  state: 'completed',
                  exit_code: 0,
                  signal: null,
                  output_delta: '1\n2\n3\n'
                })
              },
              {
                tool_call_id: 'bg',
                tool_name: 'shell',
                status: 'success',
                output: JSON.stringify({
                  session_id: 'shell-1',
                  state: 'running',
                  exit_code: null,
                  output_delta: 'partial'
                })
              }
            ]
          },
          {
            assistant: null,
            tool_calls: [{ id: 'ed', name: 'edit_file', arguments_json: '{}' }],
            tool_results: [
              {
                tool_call_id: 'ed',
                tool_name: 'edit_file',
                status: 'success',
                output: 'edited out.txt (11 bytes)',
                committed_file_presentation: {
                  path: 'out.txt',
                  kind: 'edited',
                  lines: [
                    { kind: 'deletion', old_line: 1, new_line: null, text: 'hello' },
                    { kind: 'addition', old_line: null, new_line: 1, text: 'hello world' }
                  ],
                  additions: 1,
                  deletions: 1,
                  truncated: false
                }
              },
              {
                tool_call_id: 'rd',
                tool_name: 'read_file',
                status: 'failure',
                output: 'no such file'
              }
            ]
          }
        ]
      }
    },
    { kind: 'interrupted', user: { text: 'stop' } }
  ]
}

describe('fx tool history', () => {
  test('parses shell output, file changes and failures by call id', () => {
    const results = parseFxToolHistory(history)
    expect(results.get('sh')).toMatchObject({
      status: 'success',
      shell: { output: '1\n2\n3\n', exitCode: 0, signal: null, state: 'completed' }
    })
    expect(results.get('ed')?.file).toEqual({
      path: 'out.txt',
      kind: 'edited',
      additions: 1,
      deletions: 1,
      truncated: false,
      lines: [
        { kind: 'deletion', text: 'hello' },
        { kind: 'addition', text: 'hello world' }
      ]
    })
    expect(results.get('rd')).toMatchObject({ status: 'failure', output: 'no such file' })
  })

  test('ignores unknown shapes instead of failing', () => {
    expect(parseFxToolHistory(null).size).toBe(0)
    expect(parseFxToolHistory({ history: [{ execution: { tool_steps: [{}] } }] }).size).toBe(0)
  })

  test('maps saved results to row updates and keeps live background streams', () => {
    const enrichments = fxToolEnrichments(parseFxToolHistory(history))
    expect(enrichments.get('sh')).toEqual({
      output: '1\n2\n3\n',
      sidecar: { fxShell: { exitCode: 0, signal: null } }
    })
    expect(enrichments.has('bg')).toBe(false)
    expect(enrichments.get('ed')?.sidecar?.fxFileChange).toBeDefined()
    expect(enrichments.get('rd')).toEqual({ output: 'no such file' })
  })

  test('renders a compact diff body', () => {
    const change = parseFxToolHistory(history).get('ed')?.file
    expect(change && fxFileChangeText(change)).toBe('-hello\n+hello world')
  })
})
