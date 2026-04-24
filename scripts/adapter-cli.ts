#!/usr/bin/env bun
// Standalone CLI for smoke-testing the Claude→format adapter.
//
// Usage:
//   bun scripts/adapter-cli.ts "<prompt>" [--cwd <dir>] [--raw] [--view]
//
//   --cwd <dir>   Where the agent runs (default: ../lilmd-demo)
//   --raw         Print raw SDK messages (one per line) instead of events
//   --view        Print the final ViewState as pretty JSON after the stream
//
// Without flags, each StreamEvent is printed as JSONL — one event per line.
import { query } from '@anthropic-ai/claude-agent-sdk'
import { resolve } from 'node:path'

import { ClaudeAdapter } from '@/lib/claude-adapter'
import { applyEvent, emptyViewState } from '@/lib/format'

type Args = { prompt: string; cwd: string; raw: boolean; view: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = {
    prompt: '',
    cwd: resolve(import.meta.dir, '..', '..', 'lilmd-demo'),
    raw: false,
    view: false
  }
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]
    if (v === '--cwd') a.cwd = resolve(argv[++i] ?? '.')
    else if (v === '--raw') a.raw = true
    else if (v === '--view') a.view = true
    else rest.push(v)
  }
  a.prompt = rest.join(' ').trim()
  return a
}

const args = parseArgs(Bun.argv.slice(2))
if (!args.prompt) {
  console.error('usage: bun scripts/adapter-cli.ts "<prompt>" [--cwd <dir>] [--raw] [--view]')
  process.exit(1)
}

const adapter = new ClaudeAdapter()
let view = emptyViewState()

const q = query({
  prompt: args.prompt,
  options: {
    cwd: args.cwd,
    model: 'sonnet',
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    settingSources: ['user', 'project'],
    maxTurns: 30,
    env: { ...process.env, CLAUDECODE: undefined },
    stderr: (data: string) => process.stderr.write(data)
  }
})

for await (const msg of q) {
  if (args.raw) {
    console.log(JSON.stringify(msg))
    continue
  }
  const events = adapter.ingest(msg)
  for (const ev of events) {
    console.log(JSON.stringify(ev))
    view = applyEvent(view, ev)
  }
}

if (args.view) {
  process.stderr.write('\n----- final ViewState -----\n')
  process.stdout.write(JSON.stringify(view, null, 2) + '\n')
}
