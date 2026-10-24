---
description: Keep the visual tests in tests/visual covering every component, page, and visible state.
globs: '*.tsx, *.css'
alwaysApply: false
---

- Add or update the capture in the same change as the UI it covers, never as a follow-up: a component, page, or visible state without one can break unseen.
- A new `registry:ui` component needs a preview in `UI_COMPONENT_PREVIEWS`; `tests/visual/ui-components.visual.ts` captures every preview alone on a blank canvas, and `tests/visual/coverage.test.ts` fails without one.
- A component state reached by interaction (an open menu, a second tab) gets an entry in `STATES` in `ui-components.visual.ts`.
- A new app page or visible page state gets a test in `tests/visual/app.visual.ts`. Pages are captured whole, on desktop and on a phone; limit a test to desktop only when the phone can't reach that state, and say why in a comment.
- A new `/dev` playground page gets a capture in `tests/visual/dev-pages.visual.ts`, with the playground's own controls removed; `coverage.test.ts` checks every `/dev` route.
- Before editing a shared component, find its importers and check that each screen they touch has a capture, so the diff shows every place the change lands.
- Assert the content that tells the state apart before capturing: text that is also in a loading state proves nothing.
- Pin what varies between runs at capture time (clock, animation, server answers) rather than accepting a capture that changes on its own.
- Run `bun run test:visual` to capture every file, or pass files and a test name to capture only what you touched: `bun tests/visual/run.ts tests/visual/app.visual.ts -t "settings"`. It writes `uiverify-archive/`.
- Preview a change against the accepted baseline with `npx -y uiverify@1.8.0 check --static-dir uiverify-archive` (needs `UIVERIFY_API_KEY`); it renders only what the archive holds and moves no baseline. Without a key, push and read the PR's UI Verify check instead.
- CI uploads on every pull request, including ones from forks (`visual.yml` saves a fork's capture and `visual-upload.yml` uploads it with the repo's key). Don't upload from a laptop; read and accept a PR's changes through the UI Verify MCP with the `triage-visual-changes` skill.
