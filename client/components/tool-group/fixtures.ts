// Test fixtures for <ToolCallGroup>. Real tool calls captured from the live API
// events stream of the "spoiled" workspace's Notion thread (session 3cc7132d…),
// fetched via GET /api/workspaces/:id/sessions/:sid/events.
//
// Tool outputs are VERBATIM from that stream — not truncated here. Note the
// adapter (lib/claude-adapter.ts `blockOutputText`) caps each result at 4000
// chars at ingest, so a long result (e.g. notionSearch) ends exactly where the
// stream ends. Two exceptions: `toolSearch` (output reconstructed from the raw
// JSONL — see below) and `readFile` (synthesized — see below).
//
// `FIXTURE_CWD` is that workspace's working directory — pass it to the group so
// file paths render shortened (relative), exactly like the live chat.
//
// The lists are `Part[]` (reasoning + tool-call), so a run reads as a mixed
// timeline. The `thinking` and `githubCall` items come from a different thread
// ("lilmd-demo", session c3d7caba) — see their definitions below.
import type { Part, ToolCall } from '@/lib/types'

export const FIXTURE_CWD = '/Users/molefrog/git/spoiled'

// `select:`-style tool discovery. The API stream shows this empty because the
// adapter's `blockOutputText()` keeps only `text` blocks and a ToolSearch result
// is all `tool_reference` blocks. The `output` below is reconstructed from the
// raw session JSONL — the names of the tools this call loaded into context, one
// per line (the data the adapter currently drops; a real ToolSearch card would
// render these).
const toolSearch: ToolCall = {
  toolCallId: 'toolu_01GoGuLKFHZKsukHfGymeaKz',
  name: 'ToolSearch',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {
    query:
      'select:mcp__notion__notion-search,mcp__notion__notion-get-teams,mcp__notion__notion-get-users',
    max_results: 3
  },
  output: 'mcp__notion__notion-search\nmcp__notion__notion-get-teams\nmcp__notion__notion-get-users'
}

// Native MCP call: server is encoded in the name (`mcp__notion__notion-search`),
// `caller` is still `model`, and `mcpServer` is absent. The current chat renders
// these via the generic card (the MCP card only matches `mcporter call …` Bash).
const notionSearch: ToolCall = {
  toolCallId: 'toolu_01PQt8FuJScNcAqqNscG35nd',
  name: 'mcp__notion__notion-search',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {
    query: 'project notes docs overview',
    query_type: 'internal',
    page_size: 25
  },
  output:
    '{"results":[{"id":"49ec4ef2-0d62-4511-9dc9-5b7f38409a22","title":"Lecture Notes","url":"https://app.notion.com/p/49ec4ef20d6245119dc95b7f38409a22?pvs=1","type":"page","highlight":"Lecture Notes","timestamp":"2024-10-17T13:51:00.000Z"},{"id":"9f5d18aa-6741-4993-88bc-5adf2dabb8da","title":"To-Do","url":"https://app.notion.com/p/9f5d18aa6741499388bc5adf2dabb8da?pvs=1","type":"page","highlight":"https://docs.mcp-use.com/typescript/server/ui-widgets docs.mcp-use.com/typescript/server/ui-widgets","timestamp":"2026-06-15T13:14:00.000Z"},{"id":"211536fd-e65b-433f-92bf-aa95efa91f35","title":"Plans & Notes","url":"https://app.notion.com/p/211536fde65b433f92bfaa95efa91f35?pvs=1","type":"database","highlight":"Plans & Notes","timestamp":"2024-02-06T10:02:00.000Z"},{"id":"29d78a44-b678-8035-b58e-d33e3ce86f5e","title":"RAG & Agents Notes","url":"https://app.notion.com/p/29d78a44b6788035b58ed33e3ce86f5e?pvs=1","type":"page","highlight":"speculative RAG  research.google/blog/speculative-rag-enhancing-retrieval-augmented-generation-through-drafting/    — generate N drafts in parallel (multiple perspective of the doc)","timestamp":"2025-11-03T08:07:00.000Z"},{"id":"31878a44-b678-80df-ade3-dd8cec63de64","title":"CRM","url":"https://app.notion.com/p/31878a44b67880dfade3dd8cec63de64?pvs=1","type":"database","highlight":"CRM","timestamp":"2026-06-09T08:00:00.000Z"},{"id":"f9f78a44-b678-823e-9795-01de5d5f6734","title":"AI meeting notes","url":"https://app.notion.com/p/f9f78a44b678823e979501de5d5f6734?pvs=1","type":"database","highlight":"AI meeting notes","timestamp":"2025-11-06T15:22:00.000Z"},{"id":"31a78a44-b678-801d-948f-c47118e21516","title":"illustrations","url":"https://app.notion.com/p/31a78a44b678801d948fc47118e21516?pvs=1","type":"page","highlight":"illustrations","timestamp":"2026-06-09T18:01:00.000Z"},{"id":"564db5b4-8d50-4938-8808-716a4e89dba6","title":"Weekly Update: March 4 2019","url":"https://app.notion.com/p/564db5b48d5049388808716a4e89dba6?pvs=1","type":"page","highlight":"add backlog project for migrating V1 users","timestamp":"2022-07-30T18:34:00.000Z"},{"id":"2e178a44-b678-807b-9340-e1e830e38c50","title":"ficus.io","url":"https://app.notion.com/p/2e178a44b678807b9340e1e830e38c50?pvs=1","type":"page","highlight":"Collaborative documents (Google Docs style)","timestamp":"2026-06-15T08:15:00.000Z"},{"id":"31e78a44-b678-806b-9a90-efaac9d864cf","title":"User Widget Submissions","url":"https://app.notion.com/p/31e78a44b678806b9a90efaac9d864cf?pvs=1","type":"database","highlight":"User Widget Submissions","timestamp":"2026-03-09T13:03:00.000Z"},{"id":"7e2bbddd-ce16-4002-bcb1-ead4923b9963","title":"Beta feedback (KDK playtesters)","url":"https://app.notion.com/p/7e2bbdddce164002bcb1ead4923b9963?pvs=1","type":"database","highlight":"Beta feedback (KDK playtesters)","timestamp":"2026-04-22T11:56:00.000Z"},{"id":"34878a44-b678-80f3-8f04-cc7fef16e055","title":"moi-w","url":"https://app.notion.com/p/34878a44b67880f38f04cc7fef16e055?pvs=1","type":"page","highlight":"Pi Coding Agent github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md","timestamp":"2026-04-21T09:42:00.000Z"},{"id":"34978a44-b678-8145-9023-ffb37c04037d","title":"Jonas Bartasius","url":"https://app.notion.com/p/34978a44b67881459023ffb37c04037d?pvs=1","type":"page","highlight":"Jonas Bartasius","timestamp":"2026-04-21T13:07:00.000Z"},{"id":"36578a44-b678-81ea-845c-d7cc7c2ad2c4","title":"Sales Operations","url":"https://app.notion.com/p/36578a44b67881ea845cd7cc7c2ad2c4?pvs=1","type":"page","highlight":"📘 Sales Agent Context — full briefing doc (product, voice, CRM snapshot)","timestamp":"2026-06-09T08:44:00.000Z"},{"id":"31b78a44-b678-802c-a8e7-d897826cf96d","title":"old","url":"https://app.notion.com/p/31b78a44b678802ca8e7d897826cf96d?pvs=1","type":"page","highlight":"Notes:","timestamp":"2026-03-06T16:31:00.000Z"},{"id":"b78788f6-9908-4d54-be46-a974ac5019da","title":"Weekly Update: Jan 28 2019","url":"https://app.notion.com/p/b78788f699084d54be46a974ac5019da'
}

const notionFetchOpenSource: ToolCall = {
  toolCallId: 'toolu_01YLadtEch5JsyvhAoD5C2fk',
  name: 'mcp__notion__notion-fetch',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {
    id: '233f350e-1f0f-47cd-9422-bd7dbc54d536'
  },
  output:
    '{"metadata":{"type":"page"},"title":"🛥 Open-Source","url":"https://app.notion.com/p/233f350e1f0f47cd9422bd7dbc54d536","text":"Here is the result of \\"view\\" for the Page with URL https://app.notion.com/p/233f350e1f0f47cd9422bd7dbc54d536 as of 2026-05-29T13:08:56.275Z:\\n<page url=\\"https://app.notion.com/p/233f350e1f0f47cd9422bd7dbc54d536\\" icon=\\"🛥\\">\\n<ancestor-path></ancestor-path>\\n<properties>\\n{\\"title\\":\\"Open-Source\\"}\\n</properties>\\n<content>\\n<page url=\\"https://app.notion.com/p/164f35996438406fac456aeef33a046d\\">wouter</page>\\n<page url=\\"https://app.notion.com/p/72c25fbe45af40c28a19f635332f9c4c\\">spoiled</page>\\n<page url=\\"https://app.notion.com/p/68d8786d210d42e0888168401a40345e\\">retreat</page>\\n<page url=\\"https://app.notion.com/p/01f714ee111a4df295726341c22decbc\\">presa</page>\\n<page url=\\"https://app.notion.com/p/3184781d05c743628f0c0b864b4182ee\\">`use-leader`</page>\\n<page url=\\"https://app.notion.com/p/6d1a390c1e5d4e888f6cdb86e5adcb9d\\">use-pong</page>\\n<empty-block/>\\n<empty-block/>\\n</content>\\n</page>"}'
}

const notionFetchSpoiled: ToolCall = {
  toolCallId: 'toolu_0179zYKPrLE7vwAHQNpchHzT',
  name: 'mcp__notion__notion-fetch',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {
    id: '72c25fbe45af40c28a19f635332f9c4c'
  },
  output:
    '{"metadata":{"type":"page"},"title":"spoiled","url":"https://app.notion.com/p/72c25fbe45af40c28a19f635332f9c4c","text":"Here is the result of \\"view\\" for the Page with URL https://app.notion.com/p/72c25fbe45af40c28a19f635332f9c4c as of 2024-04-19T10:05:10.098Z:\\n<page url=\\"https://app.notion.com/p/72c25fbe45af40c28a19f635332f9c4c\\" icon=\\"https://prod-files-secure.s3.us-west-2.amazonaws.com/99bed442-8dd1-4df6-b9ae-7261db17cdd8/3a9f6ee3-4e85-450f-859b-5a2ed2297f35/favicon.svg\\">\\n<ancestor-path>\\n<parent-page url=\\"https://app.notion.com/p/233f350e1f0f47cd9422bd7dbc54d536\\" title=\\"Open-Source\\"/>\\n</ancestor-path>\\n<properties>\\n{\\"title\\":\\"spoiled\\"}\\n</properties>\\n<content>\\n- [x] Подумать, как разделить шум и анимацию контента\\n- [x] Basic API для реакта\\n\\t- [x] Controlled/uncontrolled\\n\\t- [x] SSR: ok! Если перенесем transitions в реакт\\n\\t- [x] \\\\<spoiler\\\\> tag is not supported\\n\\t- [x] Detach on unmount\\n\\t- [x] `asChild` prop\\n\\t- [x] Block elements and `tagName`\\n\\t- [x] Reveal on `hover`\\n\\t- [x] Pass noise options\\n\\t- [x] asChild types\\n\\t- [x] Content transitions\\n- [x] Следить за объектом в VisibilityObserver\\n- [x] По умолчанию спойлер без транзишена. Для этого нужно сделать враппер, который через `:has` выключает селектор. Но тогда как должны анимироваться блоки? Но тогда не получится `asChild` сделать.\\n- [x] Dark/light theme, none, auto, accent color\\n- [x] Demo: light/dark theme\\n- [x] `useIsomorphicLayoutEffect`\\n- [x] Проверить селектор для текста\\n- [x] Билд и пакет\\n- [x] Лайтово опубликовать и подключить к Domik\\n- [x] Fallback для Safari + Firefox. Анимированная гифка. Можно взять три слоя сдвинутых не по простым числам. 3, 5, 7, 19 и взять три четыре кадра\\n- [x] data-hidden\\n- [x] Для фоллбека сделать pixelRatio\\n- [x] Как должны загружаться стили? Подключать отдельно.\\n- [x] Простой README\\n- [x] Сделать правильную анимацию\\n- [ ] Use inline style in SSR\\n<empty-block/>\\n```javascript\\n// Default spoiler: uncontrolled, light theme, reveals on hover, creates \\n// inline <spoiler> element, opacity no transition, does not mimic words\\n\\n/**\\n * Elements \\n */\\n<Spoiler>Hello!</Spoiler> // <spoiler>Hello!</spoiler>\\n<Spoiler className=\\"custom\\">Hello!</Spoiler>\\n\\n// block elements \\n<Spoiler block><img /></Spoiler> // <div><img /></div>\\n<Spoiler tagName=\\"div\\"><img /></Spoiler> // alias\\n\\n// advanced\\n<Spoiler asChild><blockquote aria-label=\\"hello\\" /></Spoiler>\\n\\n/**\\n * Controlled/uncontrolled component \\n */\\n\\n<Spoiler /> // reveal is hover and uncontrolled\\n<Spoiler revealOn=\\"hover\\" />\\n<Spoiler revealOn=\\"click\\" />\\n<Spoiler defaultHidden={false} onChange={(value) => change} />\\n\\n// when `hidden` option is provided, it becomes controlled and\\n// `revealOn` and `defaultHidden` have no effect \\n<Spoiler hidden={true}>Always hidden</Spoiler>               // controlled\\n<Spoiler hidden={value} onClick={() => setValue()}</Spoiler> // controlled\\n\\n/** \\n * Theming \\n */\\n\\n<Spoiler /> // default theme is `light`\\n<Spoiler theme=\\"dark\\" />\\n<Spoiler theme=\\"auto\\" /> // system-defined\\n<Spoiler theme=\\"dark\\" accentColor=\\"red\\" /> // use `colord` here\\n\\n/**\\n * Content transitions \\n */\\n\\n// disable noise animation start/stop\\n<Spoiler noiseTransition={false}></Spoiler> \\n\\n// this should disable default stylesheet injection (!) for simple opacity\\n<Spoiler><FadeTransition>Hey<FadeTransition></Spoiler> // animated opacity\\n<Spoiler><IrisTransition>Hey<IrisTransition></Spoiler> // animated mask\\n\\n/**\\n  * Noise options\\n  */\\n<Spoiler fps={12} gap={false} mimicWords>Text with words</Spoiler>\\n<Spoiler fps=\\"performance\\">Text with words</Spoiler>\\n\\n/** \\n\\t* Styling \\n  */\\n\\nimport { Spoiler } from \\"spoiled\\"\\n\\nimport { Spoiler } from \\"spoiled/unstyled\\"\\nimport \\"spoiled/styles.css\\"\\n```\\n<empty-block/>\\n<empty-block/>\\n<page url=\\"https://app.notion.com/p/69226847251d43898b7ec135fcb86c36\\">Spoiled: website</page>\\n</content>\\n</page>"}'
}

const bash: ToolCall = {
  toolCallId: 'toolu_01WXqjUXgUJPaexqLb7pZkgH',
  name: 'Bash',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {
    command:
      'pwd && echo "---" && ls -la && echo "--- git ---" && git rev-parse --is-inside-work-tree 2>/dev/null && git remote -v 2>/dev/null',
    description: 'Show current directory and git info'
  },
  output:
    '/Users/molefrog/git/spoiled\n---\ntotal 232\ndrwxr-xr-x   19 molefrog  staff    608 Jun  9 19:41 .\ndrwxr-xr-x   52 molefrog  staff   1664 Jun 15 10:32 ..\ndrwx------    3 molefrog  staff     96 Nov 17  2025 .claude\n-rw-r--r--@   1 molefrog  staff   6148 Nov 13  2025 .DS_Store\ndrwxr-xr-x   15 molefrog  staff    480 May 23 09:30 .git\n-rw-r--r--    1 molefrog  staff    294 May 23 08:52 .gitignore\ndrwxr-xr-x@   3 molefrog  staff     96 Jun  9 19:41 .moi\n-rw-r--r--    1 molefrog  staff     95 Nov 13  2025 .prettierrc\n-rw-r--r--    1 molefrog  staff  73126 May 23 09:29 bun.lock\ndrwxr-xr-x@   8 molefrog  staff    256 May 23 09:31 esm\n-rw-r--r--    1 molefrog  staff   1210 Nov 13  2025 LICENSE\ndrwxr-xr-x  160 molefrog  staff   5120 May 23 09:30 node_modules\n-rw-r--r--    1 molefrog  staff   2072 May 23 08:52 package.json\n-rw-r--r--@   1 molefrog  staff   4600 May  5 21:49 README.md\ndrwxr-xr-x   16 molefrog  staff    512 May  5 21:50 src\n-rw-r--r--    1 molefrog  staff    605 Nov 13  2025 tsconfig.json\n-rw-r--r--    1 molefrog  staff    233 Nov 13  2025 tsconfig.node.json\n-rw-r--r--    1 molefrog  staff   1582 May 23 08:52 vite.config.ts\ndrwxr-xr-x   11 molefrog  staff    352 May  5 21:49 web\n--- git ---\ntrue\norigin\tgit@github.com:molefrog/spoiled.git (fetch)\norigin\tgit@github.com:molefrog/spoiled.git (push)'
}

// Synthesized to match a real Claude Read result (cat -n style body): neither
// recorded thread included a Read, but the group spec calls for one.
const readFile: ToolCall = {
  toolCallId: 'toolu_fixture_read_readme',
  name: 'Read',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {
    file_path: '/Users/molefrog/git/spoiled/docs/open-source/README.md'
  },
  output:
    '     1\t# 🛥 Open-Source\n     2\t\n     3\tWorking notes, specs, and ideas for my open-source projects.\n     4\t\n     5\t| Project | What it is |\n     6\t|---------|------------|\n     7\t| wouter | Minimalist hooks-based router for React |\n     8\t| spoiled | <Spoiler> reveal effect for React |\n'
}

// A native GitHub MCP call (from the lilmd-demo thread). Renders via the same
// native-MCP path as notion: github logo + "Github" + `get_me`.
const githubCall: ToolCall = {
  toolCallId: 'toolu_01BN1AFsafzezpUwm8uhGWKa',
  name: 'mcp__github__get_me',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {},
  output:
    '{"login":"molefrog","id":671276,"profile_url":"https://github.com/molefrog","avatar_url":"https://avatars.githubusercontent.com/u/671276?v=4","details":{"name":"Alexey Taktarov","blog":"https://molefrog.com","location":"Copenhagen","hireable":true,"twitter_username":"mlfrg","public_repos":64,"public_gists":10,"followers":700,"following":444,"created_at":"2011-03-15T15:58:23Z","updated_at":"2026-06-13T09:04:50Z"}}'
}

// A reasoning ("Thinking") step (from the lilmd-demo thread). It's a Part, not a
// ToolCall, which is why the lists are `Part[]`.
const thinking: Part = {
  type: 'reasoning',
  text: 'The user is greeting me casually with "Hey bro". This is a friendly greeting and they\'re not asking me to do anything specific yet. I should respond in a friendly, casual way and let them know I\'m ready to help with whatever they need.'
}

// A Skill launch (from the lilmd-demo thread). `name: 'Skill'` + a `skill`
// sidecar; renders as a "Loading Skill" timeline row.
const skillCall: ToolCall = {
  toolCallId: 'toolu_01ADt4E1V39b8rhGUEuTQvdP',
  name: 'Skill',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: { skill: 'widgets' },
  skill: { skillName: 'widgets' },
  output: 'Launching skill: widgets'
}

// Variant 1 — a single tool call (the degenerate group).
export const singleToolCall: Part[] = [{ type: 'tool-call', call: bash }]

// Variant 2 — a realistic mixed timeline: thinking, tool search, skill, 2 notion,
// read file, bash, notion, then a github call.
export const multipleToolCalls: Part[] = [
  thinking,
  { type: 'tool-call', call: toolSearch },
  { type: 'tool-call', call: skillCall },
  { type: 'tool-call', call: notionSearch },
  { type: 'tool-call', call: notionFetchOpenSource },
  { type: 'tool-call', call: readFile },
  { type: 'tool-call', call: bash },
  { type: 'tool-call', call: notionFetchSpoiled },
  { type: 'tool-call', call: githubCall }
]

// A still-running Bash — no output yet, state 'running'. Dotted (not MCP), so
// its timeline node renders a spinner instead of a dot.
const runningBash: ToolCall = {
  toolCallId: 'toolu_fixture_running_bash',
  name: 'Bash',
  caller: 'model',
  provider: 'claude-code',
  state: 'running',
  input: { command: 'bun test --coverage', description: 'Run the test suite' }
}

// Variant 3 — a live (mid-flight) trace, rendered with `processing`. Exercises
// the in-progress states in one view: a finished "Thought", a running dotted
// tool (spinner node), and a trailing live "Thinking" (spinner node). The last
// two wouldn't co-occur in a real stream — this is a state showcase.
export const liveToolCalls: Part[] = [
  thinking,
  { type: 'tool-call', call: toolSearch },
  { type: 'tool-call', call: notionSearch },
  { type: 'tool-call', call: runningBash },
  {
    type: 'reasoning',
    text: 'The test run is still going. Once it passes I will write the summary into docs/ and open a PR.'
  }
]
