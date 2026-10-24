import { defineCommand } from 'citty'
import { resolve } from 'path'

import { dirArg } from '../args'
import { sendControl } from '../control'

export const call = defineCommand({
  meta: { name: 'call', description: 'Call a published server tool with named JSON arguments' },
  args: {
    target: { type: 'positional', required: true, description: 'Tool target, e.g. view:orders' },
    tool: { type: 'positional', required: true, description: 'Tool name' },
    args: { type: 'positional', required: false, description: 'JSON object (default {})' },
    dir: dirArg
  },
  run({ args }) {
    const path = resolve(args.dir)
    sendControl(
      path,
      { type: 'tools:call', path, target: args.target, name: args.tool, args: args.args ?? '{}' },
      res => {
        console.log(JSON.stringify(res.result, null, 2))
      }
    )
  }
})
