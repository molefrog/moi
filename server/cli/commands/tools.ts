import { defineCommand } from 'citty'
import { resolve } from 'path'

import { dirArg } from '../args'
import { sendControl } from '../control'

export const tools = defineCommand({
  meta: { name: 'tools', description: 'List a view’s published server tools' },
  args: {
    target: { type: 'positional', required: true, description: 'Tool target, e.g. view:orders' },
    dir: dirArg
  },
  run({ args }) {
    const path = resolve(args.dir)
    sendControl(path, { type: 'tools:list', path, target: args.target }, res => {
      console.log(JSON.stringify(res.tools, null, 2))
    })
  }
})
