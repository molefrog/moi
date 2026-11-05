import { run } from '@uiverify/bun/run'

process.exitCode = await run({ shards: { 'tests/visual/ui-components.visual.ts': 4 } })
