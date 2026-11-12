import { defineCommand } from 'citty'
import { CONTROL_URL } from '../../constants'
import { staleSkillNotice } from '../../skills/version'
import { appletOnlyArg, readAppletSelector } from '../applet-selector'
import { exitControlUnreachable } from '../control'
import pc from '../pc'

export const refresh = defineCommand({
  meta: {
    name: 'refresh',
    description:
      'Refresh widget and view data without rebuilding. Use after the agent mutates underlying data.'
  },
  args: {
    only: appletOnlyArg
  },
  async run({ args }) {
    const only = readAppletSelector(args.only)
    const notice = await staleSkillNotice(process.cwd())
    const ws = new WebSocket(CONTROL_URL)

    ws.onopen = () =>
      ws.send(
        JSON.stringify({ type: 'applets:refresh', only, path: process.env.MOI_REMOTE_WORKSPACE })
      )

    ws.onmessage = event => {
      const data = JSON.parse(String(event.data))
      if (data.error) {
        console.error('\n' + pc.red('✗') + ' ' + data.error + '\n')
        ws.close()
        process.exit(1)
      }
      console.log('\n' + pc.green('✓') + ' Refresh signal sent' + (only ? ` (${only})` : '') + '\n')
      if (notice) console.log(pc.yellow(notice) + '\n')
      ws.close()
      process.exit(0)
    }

    ws.onerror = () => void exitControlUnreachable()
  }
})
