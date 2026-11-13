import { defineCommand } from 'citty'
import { parse as devalueParse } from 'devalue'
import { resolve } from 'path'
import { dirArg } from '../args'
import { sendControl } from '../control'
import pc from '../pc'

export const callServerFn = defineCommand({
  meta: {
    name: 'call-server-fn',
    description: 'Invoke an applet .server.ts function in an isolated one-shot worker (smoke test)'
  },
  args: {
    fn: {
      type: 'positional',
      required: true,
      description: 'Function path: <module>/<fn>, e.g. widgets/hello/getGreeting'
    },
    args: {
      type: 'positional',
      required: false,
      description: 'Arguments as one JSON array, e.g. \'["ann", 10]\' (default [])'
    },
    dir: dirArg
  },
  run({ args }) {
    const path = resolve(args.dir)
    sendControl(
      path,
      { type: 'call-server-fn', path, fn: args.fn, args: args.args ?? '[]' },
      res => {
        // The worker replies devalue-encoded (same wire format the browser RPC
        // parses), so Map/Set/Date render readably through Bun.inspect.
        const value = devalueParse(String(res.result))
        console.log(Bun.inspect(value, { depth: 8, colors: process.stdout.isTTY }))
        // Duration on stderr: stdout stays clean data, and a slow call is a
        // warning sign worth surfacing (browser RPC times out at 30s).
        console.error(pc.dim(`↩ ${res.ms}ms`))
      }
    )
  }
})
