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
    // A failure keeps its row's output and replaces only the failure text.
    expect(enrichments.get('rd')).toEqual({ errorText: 'no such file' })
  })

  // fx keeps 4,096 bytes of a result, which cuts a long shell envelope.
  function cutShellHistory(stdout: string) {
    const envelope = JSON.stringify({
      session_id: null,
      state: 'completed',
      backend: 'captured',
      persistence: 'process',
      output_truncated: false,
      exit_code: 3,
      signal: null,
      duration_ms: 12,
      output_delta: stdout
    })
    const output = envelope.slice(0, 4096)
    return {
      history: [
        {
          execution: {
            tool_steps: [
              {
                tool_results: [
                  { tool_call_id: 'long', tool_name: 'shell', status: 'success', output }
                ]
              }
            ]
          }
        }
      ]
    }
  }

  test('recovers the outcome of a shell envelope cut short', () => {
    const stdout = Array.from({ length: 1500 }, (_, i) => `line "${i + 1}"`).join('\n')
    const saved = parseFxToolHistory(cutShellHistory(stdout)).get('long')?.shell
    expect(saved).toMatchObject({ exitCode: 3, signal: null, state: 'completed', partial: true })
    expect(saved?.output.length).toBeGreaterThan(3000)
    expect(stdout.startsWith(saved!.output)).toBe(true)
  })

  test('a cut shell copy never replaces output that streamed in full', () => {
    const stdout = Array.from({ length: 1500 }, (_, i) => `${i + 1}`).join('\n')
    const results = parseFxToolHistory(cutShellHistory(stdout))
    const row = (output: string) => ({
      toolCallId: 'long',
      name: 'shell',
      input: {},
      caller: 'model' as const,
      provider: 'fx' as const,
      state: 'success' as const,
      output
    })
    expect(fxToolEnrichments(results, [row(stdout)]).get('long')).toEqual({
      sidecar: { fxShell: { exitCode: 3, signal: null } }
    })
    // A replayed row with only a status line gets what fx saved, marked cut.
    const replayed = fxToolEnrichments(results, [
      row('fx did not include command output in this history preview.')
    ]).get('long')
    expect(replayed?.output).toStartWith('1\n2\n3\n')
    expect(replayed?.output).toEndWith('\n… (fx saved only part of this output)')
  })

  test('a failure envelope becomes its sentence', () => {
    const failed = {
      history: [
        {
          execution: {
            tool_steps: [
              {
                tool_results: [
                  {
                    tool_call_id: 'w',
                    tool_name: 'write_file',
                    status: 'failure',
                    output: JSON.stringify({
                      error: { code: 'PermissionDenied', message: 'Held for review' }
                    })
                  }
                ]
              }
            ]
          }
        }
      ]
    }
    expect(fxToolEnrichments(parseFxToolHistory(failed)).get('w')).toEqual({
      errorText: 'Held for review.'
    })
  })

  test('renders a compact diff body', () => {
    const change = parseFxToolHistory(history).get('ed')?.file
    expect(change && fxFileChangeText(change)).toBe('-hello\n+hello world')
  })
})
