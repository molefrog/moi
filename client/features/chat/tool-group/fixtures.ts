// Test fixtures for <ToolCallGroup>. Shaped exactly like real tool calls from a
// Claude Code session (states, providers, MCP naming, output truncation), but
// all data — paths, Notion pages, GitHub profile, repo names — is synthetic.
//
// Note the adapter (lib/claude-adapter.ts `blockOutputText`) caps each result at
// 4000 chars at ingest, so `notionSearch` below ends mid-JSON on purpose — that
// is what a capped result looks like in the stream. `toolSearch` output is the
// tool-name-per-line form a real ToolSearch result reduces to (the adapter keeps
// only `text` blocks and a ToolSearch result is all `tool_reference` blocks, so
// the live stream shows it empty; a real ToolSearch card would render these).
//
// `FIXTURE_CWD` is the fixture workspace's working directory — pass it to the
// group so file paths render shortened (relative), exactly like the live chat.
//
// The lists are `Part[]` (reasoning + tool-call), so a run reads as a mixed
// timeline.
import type { Part, ToolCall } from '@/lib/types'

export const FIXTURE_CWD = '/Users/kim/git/confetti'

// `select:`-style tool discovery.
const toolSearch: ToolCall = {
  toolCallId: 'toolu_fixture_tool_search',
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
  toolCallId: 'toolu_fixture_notion_search',
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
    '{"results":[{"id":"3f1c9a72-0d62-4511-9dc9-5b7f38409a22","title":"Reading List","url":"https://app.notion.com/p/3f1c9a720d6245119dc95b7f38409a22?pvs=1","type":"page","highlight":"Reading List","timestamp":"2024-10-17T13:51:00.000Z"},{"id":"8b2d17aa-6741-4993-88bc-5adf2dabb8da","title":"To-Do","url":"https://app.notion.com/p/8b2d17aa6741499388bc5adf2dabb8da?pvs=1","type":"page","highlight":"canvas-confetti performance notes and particle pooling","timestamp":"2026-06-15T13:14:00.000Z"},{"id":"244536fd-e65b-433f-92bf-aa95efa91f35","title":"Plans & Notes","url":"https://app.notion.com/p/244536fde65b433f92bfaa95efa91f35?pvs=1","type":"database","highlight":"Plans & Notes","timestamp":"2024-02-06T10:02:00.000Z"},{"id":"5a668c31-b678-4035-b58e-d33e3ce86f5e","title":"Animation Research","url":"https://app.notion.com/p/5a668c31b6784035b58ed33e3ce86f5e?pvs=1","type":"page","highlight":"spring easings vs. bezier — generate N particle bursts in parallel and compare frame budgets","timestamp":"2025-11-03T08:07:00.000Z"},{"id":"41c28e19-b678-40df-ade3-dd8cec63de64","title":"Roadmap","url":"https://app.notion.com/p/41c28e19b67840dfade3dd8cec63de64?pvs=1","type":"database","highlight":"Roadmap","timestamp":"2026-06-09T08:00:00.000Z"},{"id":"6d9e2f44-b678-423e-9795-01de5d5f6734","title":"Meeting notes","url":"https://app.notion.com/p/6d9e2f44b678423e979501de5d5f6734?pvs=1","type":"database","highlight":"Meeting notes","timestamp":"2025-11-06T15:22:00.000Z"},{"id":"7fa31c55-b678-401d-948f-c47118e21516","title":"illustrations","url":"https://app.notion.com/p/7fa31c55b678401d948fc47118e21516?pvs=1","type":"page","highlight":"illustrations","timestamp":"2026-06-09T18:01:00.000Z"},{"id":"92e4b5c8-8d50-4938-8808-716a4e89dba6","title":"Weekly Update: March 4","url":"https://app.notion.com/p/92e4b5c88d5049388808716a4e89dba6?pvs=1","type":"page","highlight":"add backlog project for migrating v1 users","timestamp":"2022-07-30T18:34:00.000Z"},{"id":"1c778a02-b678-407b-9340-e1e830e38c50","title":"demo site","url":"https://app.notion.com/p/1c778a02b678407b9340e1e830e38c50?pvs=1","type":"page","highlight":"Interactive playground (CodeSandbox style)","timestamp":"2026-06-15T08:15:00.000Z"},{"id":"e3558d21-b678-406b-9a90-efaac9d864cf","title":"Feature Requests","url":"https://app.notion.com/p/e3558d21b678406b9a90efaac9d864cf?pvs=1","type":"database","highlight":"Feature Requests","timestamp":"2026-03-09T13:03:00.000Z"},{"id":"a91f4c6e-ce16-4002-bcb1-ead4923b9963","title":"Beta feedback","url":"https://app.notion.com/p/a91f4c6ece164002bcb1ead4923b9963?pvs=1","type":"database","highlight":"Beta feedback","timestamp":"2026-04-22T11:56:00.000Z"},{"id":"b0537e88-b678-40f3-8f04-cc7fef16e055","title":"confetti-v2","url":"https://app.notion.com/p/b0537e88b67840f38f04cc7fef16e055?pvs=1","type":"page","highlight":"WebGL renderer spike — offscreen canvas + worker, fall back to 2d context","timestamp":"2026-04-21T09:42:00.000Z"},{"id":"c6b19d34-b678-4145-9023-ffb37c04037d","title":"Physics Notes","url":"https://app.notion.com/p/c6b19d34b67841459023ffb37c04037d?pvs=1","type":"page","highlight":"Physics Notes","timestamp":"2026-04-21T13:07:00.000Z"},{"id":"d84a6f10-b678-41ea-845c-d7cc7c2ad2c4","title":"Docs Outline","url":"https://app.notion.com/p/d84a6f10b67841ea845cd7cc7c2ad2c4?pvs=1","type":"page","highlight":"📘 Getting started — full walkthrough (install, first burst, presets)","timestamp":"2026-06-09T08:44:00.000Z"},{"id":"f2c07b45-b678-402c-a8e7-d897826cf96d","title":"old","url":"https://app.notion.com/p/f2c07b45b678402ca8e7d897826cf96d?pvs=1","type":"page","highlight":"Notes:","timestamp":"2026-03-06T16:31:00.000Z"},{"id":"09d6e2a7-9908-4d54-be46-a974ac5019da","title":"Weekly Update: Jan 28","url":"https://app.notion.com/p/09d6e2a799084d54be46a974ac5019da'
}

const notionFetchOpenSource: ToolCall = {
  toolCallId: 'toolu_fixture_notion_fetch_oss',
  name: 'mcp__notion__notion-fetch',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {
    id: '55e1c208-1f0f-47cd-9422-bd7dbc54d536'
  },
  output:
    '{"metadata":{"type":"page"},"title":"🛥 Open-Source","url":"https://app.notion.com/p/55e1c2081f0f47cd9422bd7dbc54d536","text":"Here is the result of \\"view\\" for the Page with URL https://app.notion.com/p/55e1c2081f0f47cd9422bd7dbc54d536 as of 2026-05-29T13:08:56.275Z:\\n<page url=\\"https://app.notion.com/p/55e1c2081f0f47cd9422bd7dbc54d536\\" icon=\\"🛥\\">\\n<ancestor-path></ancestor-path>\\n<properties>\\n{\\"title\\":\\"Open-Source\\"}\\n</properties>\\n<content>\\n<page url=\\"https://app.notion.com/p/71a2b39c6438406fac456aeef33a046d\\">tinyrouter</page>\\n<page url=\\"https://app.notion.com/p/83b4c5de45af40c28a19f635332f9c4c\\">confetti</page>\\n<page url=\\"https://app.notion.com/p/95c6d7f0210d42e0888168401a40345e\\">mdnav</page>\\n<page url=\\"https://app.notion.com/p/07d8e912111a4df295726341c22decbc\\">pixelpad</page>\\n<page url=\\"https://app.notion.com/p/19e0fb3405c743628f0c0b864b4182ee\\">`use-sparkle`</page>\\n<page url=\\"https://app.notion.com/p/2bf21c561e5d4e888f6cdb86e5adcb9d\\">use-hotkey</page>\\n<empty-block/>\\n<empty-block/>\\n</content>\\n</page>"}'
}

const notionFetchConfetti: ToolCall = {
  toolCallId: 'toolu_fixture_notion_fetch_confetti',
  name: 'mcp__notion__notion-fetch',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {
    id: '83b4c5de-45af-40c2-8a19-f635332f9c4c'
  },
  output:
    '{"metadata":{"type":"page"},"title":"confetti","url":"https://app.notion.com/p/83b4c5de45af40c28a19f635332f9c4c","text":"Here is the result of \\"view\\" for the Page with URL https://app.notion.com/p/83b4c5de45af40c28a19f635332f9c4c as of 2024-04-19T10:05:10.098Z:\\n<page url=\\"https://app.notion.com/p/83b4c5de45af40c28a19f635332f9c4c\\">\\n<ancestor-path>\\n<parent-page url=\\"https://app.notion.com/p/55e1c2081f0f47cd9422bd7dbc54d536\\" title=\\"Open-Source\\"/>\\n</ancestor-path>\\n<properties>\\n{\\"title\\":\\"confetti\\"}\\n</properties>\\n<content>\\n- [x] Split the physics step from the render step\\n- [x] Basic React API\\n\\t- [x] Controlled/uncontrolled\\n\\t- [x] SSR: ok! No canvas until mount\\n\\t- [x] Detach on unmount\\n\\t- [x] `asChild` prop\\n\\t- [x] Block elements and `tagName`\\n\\t- [x] Fire on `click`\\n\\t- [x] Pass particle options\\n\\t- [x] asChild types\\n\\t- [x] Reduced-motion fallback\\n- [x] Pause bursts when the tab is hidden (VisibilityObserver)\\n- [x] Default burst has no trail. Needs a wrapper that disables the selector via `:has` — but then how do block elements animate? And `asChild` breaks.\\n- [x] Dark/light theme, none, auto, accent color\\n- [x] Demo: light/dark theme\\n- [x] `useIsomorphicLayoutEffect`\\n- [x] Particle pooling (no per-frame allocs)\\n- [x] Build and package\\n- [x] Publish a canary and dogfood it on the demo site\\n- [x] Fallback for Safari + Firefox: pre-rendered sprite sheet, three layers offset by primes 3, 5, 7 — loop four frames\\n- [x] data-active\\n- [x] pixelRatio for the fallback\\n- [x] How should styles load? Ship them separately.\\n- [x] Simple README\\n- [x] Get the easing curve right\\n- [ ] Use inline style in SSR\\n<empty-block/>\\n```javascript\\n// Default confetti: uncontrolled, light theme, fires on click, creates an\\n// inline <span> wrapper, no trail, does not follow the pointer\\n\\n/**\\n * Elements \\n */\\n<Confetti>Party!</Confetti> // <span>Party!</span>\\n<Confetti className=\\"custom\\">Party!</Confetti>\\n\\n// block elements \\n<Confetti block><img /></Confetti> // <div><img /></div>\\n<Confetti tagName=\\"div\\"><img /></Confetti> // alias\\n\\n// advanced\\n<Confetti asChild><button aria-label=\\"celebrate\\" /></Confetti>\\n\\n/**\\n * Controlled/uncontrolled component \\n */\\n\\n<Confetti /> // fires on click, uncontrolled\\n<Confetti fireOn=\\"click\\" />\\n<Confetti fireOn=\\"hover\\" />\\n<Confetti defaultActive={false} onChange={(value) => change} />\\n\\n// when `active` is provided, it becomes controlled and\\n// `fireOn` and `defaultActive` have no effect \\n<Confetti active={true}>Always bursting</Confetti>            // controlled\\n<Confetti active={value} onClick={() => setValue()}</Confetti> // controlled\\n\\n/** \\n * Theming \\n */\\n\\n<Confetti /> // default theme is `light`\\n<Confetti theme=\\"dark\\" />\\n<Confetti theme=\\"auto\\" /> // system-defined\\n<Confetti theme=\\"dark\\" accentColor=\\"red\\" /> // use `colord` here\\n\\n/**\\n * Particle options\\n */\\n<Confetti count={120} gravity={0.8} spread={60}>Boom</Confetti>\\n<Confetti preset=\\"fireworks\\">Boom</Confetti>\\n\\n/** \\n * Styling \\n */\\n\\nimport { Confetti } from \\"confetti\\"\\n\\nimport { Confetti } from \\"confetti/unstyled\\"\\nimport \\"confetti/styles.css\\"\\n```\\n<empty-block/>\\n<empty-block/>\\n<page url=\\"https://app.notion.com/p/3dc43e781e5d4e888f6cdb86e5adcb00\\">Confetti: website</page>\\n</content>\\n</page>"}'
}

const bash: ToolCall = {
  toolCallId: 'toolu_fixture_bash_pwd',
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
    '/Users/kim/git/confetti\n---\ntotal 232\ndrwxr-xr-x   19 kim  staff    608 Jun  9 19:41 .\ndrwxr-xr-x   52 kim  staff   1664 Jun 15 10:32 ..\ndrwx------    3 kim  staff     96 Nov 17  2025 .claude\ndrwxr-xr-x   15 kim  staff    480 May 23 09:30 .git\n-rw-r--r--    1 kim  staff    294 May 23 08:52 .gitignore\ndrwxr-xr-x@   3 kim  staff     96 Jun  9 19:41 .moi\n-rw-r--r--    1 kim  staff     95 Nov 13  2025 .prettierrc\n-rw-r--r--    1 kim  staff  73126 May 23 09:29 bun.lock\ndrwxr-xr-x@   8 kim  staff    256 May 23 09:31 esm\n-rw-r--r--    1 kim  staff   1210 Nov 13  2025 LICENSE\ndrwxr-xr-x  160 kim  staff   5120 May 23 09:30 node_modules\n-rw-r--r--    1 kim  staff   2072 May 23 08:52 package.json\n-rw-r--r--@   1 kim  staff   4600 May  5 21:49 README.md\ndrwxr-xr-x   16 kim  staff    512 May  5 21:49 src\n-rw-r--r--    1 kim  staff    605 Nov 13  2025 tsconfig.json\n-rw-r--r--    1 kim  staff    233 Nov 13  2025 tsconfig.node.json\n-rw-r--r--    1 kim  staff   1582 May 23 08:52 vite.config.ts\ndrwxr-xr-x   11 kim  staff    352 May  5 21:49 web\n--- git ---\ntrue\norigin\tgit@github.com:acme/confetti.git (fetch)\norigin\tgit@github.com:acme/confetti.git (push)'
}

// Matches a real Claude Read result (cat -n style body).
const readFile: ToolCall = {
  toolCallId: 'toolu_fixture_read_readme',
  name: 'Read',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {
    file_path: '/Users/kim/git/confetti/docs/open-source/README.md'
  },
  output:
    '     1\t# 🛥 Open-Source\n     2\t\n     3\tWorking notes, specs, and ideas for my open-source projects.\n     4\t\n     5\t| Project | What it is |\n     6\t|---------|------------|\n     7\t| tinyrouter | Minimalist hooks-based router for React |\n     8\t| confetti | <Confetti> burst effect for React |\n'
}

// A native GitHub MCP call. Renders via the same native-MCP path as notion:
// github logo + "Github" + `get_me`.
const githubCall: ToolCall = {
  toolCallId: 'toolu_fixture_github_get_me',
  name: 'mcp__github__get_me',
  caller: 'model',
  provider: 'claude-code',
  state: 'success',
  input: {},
  output:
    '{"login":"octocat","id":583231,"profile_url":"https://github.com/octocat","avatar_url":"https://avatars.githubusercontent.com/u/583231?v=4","details":{"name":"The Octocat","blog":"https://github.blog","location":"San Francisco","hireable":true,"twitter_username":"github","public_repos":8,"public_gists":8,"followers":700,"following":9,"created_at":"2011-01-25T18:44:36Z","updated_at":"2026-06-13T09:04:50Z"}}'
}

// A reasoning ("Thinking") step. It's a Part, not a ToolCall, which is why the
// lists are `Part[]`.
const thinking: Part = {
  type: 'reasoning',
  text: 'The user is greeting me casually with "Hey bro". This is a friendly greeting and they\'re not asking me to do anything specific yet. I should respond in a friendly, casual way and let them know I\'m ready to help with whatever they need.'
}

// A Skill launch. `name: 'Skill'` + a `skill` sidecar; renders as a
// "Loading Skill" timeline row.
const skillCall: ToolCall = {
  toolCallId: 'toolu_fixture_skill_widgets',
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
  { type: 'tool-call', call: notionFetchConfetti },
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

// A *streaming* subagent (caller='subagent', name='Agent'), shaped like a live
// Explore subagent run. The `subagent` record fills in incrementally from
// `task_*` events (lib/claude-adapter.ts): `progress[]` accumulates one "latest
// action" line per tool use (the last is what the collapsed card shows live),
// alongside `status`, `usage`, and a growing `transcript`. None of it is
// persisted — a finished/replayed Agent call has none of this, only a live one
// does. Here it's mid-run (status 'running'); the transcript is a trimmed
// version of the work so far.
const subagentCall: ToolCall = {
  toolCallId: 'toolu_fixture_subagent',
  name: 'Agent',
  caller: 'subagent',
  provider: 'claude-code',
  state: 'running',
  input: {
    description: 'Explore mdnav-demo repo structure and purpose',
    subagent_type: 'Explore',
    prompt:
      'Explore the mdnav-demo repository to understand what it is. Look at the repo structure, what mdnav is, example markdown, and the purpose. Give a comprehensive overview citing specific files.'
  },
  // Still streaming — no final result yet.
  output: '',
  subagent: {
    taskId: 'task_explore_mdnav',
    description: 'Explore mdnav-demo repo structure and purpose',
    status: 'running',
    usage: { totalTokens: 18407, toolUses: 8, durationMs: 10725 },
    // Each entry is the "latest action" at that step.
    progress: [
      'Reading ~/git/mdnav-demo',
      'Reading README.md',
      'Reading package.json',
      'Reading CLAUDE.md',
      'Running ls -la /Users/kim/git/mdnav-demo/',
      'Finding **/*.md',
      'Finding **/*.{js,ts,jsx,tsx}',
      'Running head -100 /Users/kim/git/mdnav-demo/moby-dick.md'
    ],
    transcript: [
      {
        id: 'sub-1',
        role: 'assistant',
        origin: { kind: 'user-input' },
        parts: [
          {
            type: 'reasoning',
            text: 'Let me map the repo: list the markdown files, read the README, then see what the mdnav binary does.'
          },
          {
            type: 'tool-call',
            call: {
              toolCallId: 'sub-glob',
              name: 'Glob',
              caller: 'model',
              provider: 'claude-code',
              state: 'success',
              input: { pattern: '**/*.md' },
              output:
                'README.md\ndocs/moby-dick.md\ndocs/sections/01-introduction.md\ndocs/sections/02-findings.md'
            }
          },
          {
            type: 'tool-call',
            call: {
              toolCallId: 'sub-bash',
              name: 'Bash',
              caller: 'model',
              provider: 'claude-code',
              state: 'success',
              input: { command: 'mdnav --help' },
              output:
                'mdnav — navigate large markdown\n\nUSAGE: mdnav <file> <command>\n\nCOMMANDS:\n  toc       print the table of contents\n  read      read a section (fuzzy/regex/path selector)\n  search    full-text search'
            }
          }
        ]
      },
      {
        id: 'sub-2',
        role: 'assistant',
        origin: { kind: 'user-input' },
        parts: [
          {
            type: 'text',
            text: '## Comprehensive Overview of mdnav-demo\n\n**mdnav-demo** showcases **mdnav**, a CLI for large markdown documents, using the full text of Moby-Dick as a large-document fixture.'
          }
        ]
      }
    ]
  }
}

// The same subagent once it has finished: status 'completed', a final summary in
// `output`, and the toolUses count shown in place of the latest-action line.
const subagentDoneCall: ToolCall = {
  ...subagentCall,
  toolCallId: 'toolu_fixture_subagent_done',
  state: 'success',
  output:
    'mdnav-demo showcases **mdnav**, a CLI for navigating large markdown documents. The repo is a demo harness: a single `moby-dick.md` fixture plus a thin CLI (`toc`/`read`/`search`) that fuzzy-selects sections. README and CLAUDE.md frame it as a worked example, not a library.',
  subagent: {
    ...subagentCall.subagent!,
    taskId: 'task_explore_mdnav_done',
    status: 'completed'
  }
}

// Variant 4 — a streamed subagent call (the card we show when an Agent tool is
// running). Iterate on it in /playground/tool-calls.
export const subagentTrace: Part[] = [
  {
    type: 'reasoning',
    text: 'This needs a deeper look — let me spin up an Explore subagent to map the repo while I keep going.'
  },
  { type: 'tool-call', call: subagentCall }
]

// Variant 5 — the same subagent after it finished, so we can style the completed
// card (✓, tool-count sub-line, no shimmer) alongside the running one.
export const subagentDoneTrace: Part[] = [
  {
    type: 'reasoning',
    text: 'This needs a deeper look — let me spin up an Explore subagent to map the repo while I keep going.'
  },
  { type: 'tool-call', call: subagentDoneCall }
]
