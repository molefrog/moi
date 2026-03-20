#!/usr/bin/env bun

import { defineCommand, runMain } from 'citty'

import { CONTROL_PORT, PORT } from './constants'

const serve = defineCommand({
  meta: { description: 'Start web + control servers' },
  async run() {
    await import('./web')
    console.log(`Web server on http://localhost:${PORT}`)
    console.log(`Control server on port ${CONTROL_PORT}`)
  },
})

function colorStatus(status: string) {
  const reset = '\x1b[0m'
  if (status === 'built') return `${Bun.color('green', 'ansi')}${status}${reset}`
  if (status === 'failed') return `${Bun.color('red', 'ansi')}${status}${reset}`
  return `\x1b[2m${status}${reset}`
}

const bundle = defineCommand({
  meta: { description: 'Rebuild changed widgets' },
  run() {
    const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'bundle' }))

    ws.onmessage = (event) => {
      const results = JSON.parse(String(event.data))
      if (!Array.isArray(results)) return

      const table = results.map((r: { name: string; status: string }) => ({
        widget: r.name,
        status: colorStatus(r.status),
      }))

      console.log()
      console.table(table)

      const failed = results.filter((r: { status: string; error?: string }) => r.status === 'failed')
      if (failed.length) {
        const red = Bun.color('red', 'ansi')
        const reset = '\x1b[0m'
        console.log()
        for (const f of failed) {
          console.log(`${red}${f.name}:${reset}`)
          console.log(`  ${f.error}\n`)
        }
      }

      ws.close()
      process.exit(failed.length > 0 ? 1 : 0)
    }

    ws.onerror = () => {
      console.error('Could not connect to control server. Is the main process running?')
      process.exit(1)
    }
  },
})

const main = defineCommand({
  meta: { name: 'mei', version: '0.1.0', description: 'MEI widget system' },
  subCommands: { serve, bundle },
})

runMain(main)
