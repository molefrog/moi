#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty'
import Table from 'cli-table3'
import pc from 'picocolors'

import { FONT_THEMES } from '@/lib/themes'
import type { FontTheme } from '@/lib/themes'

import { CONTROL_PORT, PORT } from './constants'

const serve = defineCommand({
  meta: { description: 'Start web + control servers' },
  async run() {
    await import('./web')
    console.log(`Web server on http://localhost:${PORT}`)
    console.log(`Control server on port ${CONTROL_PORT}`)
  }
})

function colorStatus(status: string) {
  if (status === 'built') return pc.green(status)
  if (status === 'failed') return pc.red(status)
  return pc.dim(status)
}

const bundle = defineCommand({
  meta: { description: 'Rebuild changed widgets' },
  run() {
    const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'bundle' }))

    ws.onmessage = event => {
      const results = JSON.parse(String(event.data))
      if (!Array.isArray(results)) return

      const table = new Table({ head: [pc.bold('widget'), pc.bold('status')] })
      for (const r of results as { name: string; status: string; error?: string }[]) {
        table.push([r.name, colorStatus(r.status)])
      }
      console.log('\n' + table.toString())

      const failed = results.filter(
        (r: { status: string; error?: string }) => r.status === 'failed'
      )
      if (failed.length) {
        console.log()
        for (const f of failed) {
          console.log(pc.red(pc.bold(f.name + ':')))
          console.log('  ' + f.error + '\n')
        }
      }

      ws.close()
      process.exit(failed.length > 0 ? 1 : 0)
    }

    ws.onerror = () => {
      console.error('Could not connect to control server. Is the main process running?')
      process.exit(1)
    }
  }
})

const theme = defineCommand({
  meta: { description: 'Show or set the workspace font theme' },
  args: {
    font: { type: 'string', description: 'Font theme key to apply' }
  },
  run({ args }) {
    const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'theme', font: args.font ?? null }))

    ws.onmessage = event => {
      const res = JSON.parse(String(event.data))

      if (res.error) {
        console.error('\n' + pc.red(pc.bold('Error:')) + ' ' + res.error + '\n')
        ws.close()
        process.exit(1)
      }

      if (res.ok) {
        const config = FONT_THEMES[res.font as FontTheme]
        console.log(
          '\n' +
            pc.green('✓') +
            ' Font theme set to ' +
            pc.bold(config.label) +
            pc.dim(` (${config.sans} / ${config.mono})`) +
            '\n'
        )
        ws.close()
        process.exit(0)
      }

      // Listing mode — show table
      const current: FontTheme = res.currentFont ?? 'system'
      console.log('\n' + pc.bold('mei theme') + ' — workspace font themes')
      console.log(pc.dim('  Usage: ./cmd theme --font=<key>') + '\n')

      const table = new Table({
        head: ['', 'key', 'label', 'sans', 'mono', 'feel'].map(h => pc.bold(h)),
        style: { border: [], head: [] }
      })

      for (const key of Object.keys(FONT_THEMES) as FontTheme[]) {
        const f = FONT_THEMES[key]
        const selected = key === current
        const marker = selected ? pc.green('→') : ''
        const row = [
          marker,
          selected ? pc.bold(key) : key,
          f.label,
          pc.dim(f.sans),
          pc.dim(f.mono),
          pc.dim(f.feel)
        ]
        table.push(row)
      }

      console.log(table.toString() + '\n')
      ws.close()
      process.exit(0)
    }

    ws.onerror = () => {
      console.error('Could not connect to control server. Is the main process running?')
      process.exit(1)
    }
  }
})

const main = defineCommand({
  meta: { name: 'mei', version: '0.1.0', description: 'MEI widget system' },
  subCommands: { serve, bundle, theme }
})

runMain(main)
