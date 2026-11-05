---
description: Add or update a visual test in the same change as any new screen, component, or visible state.
globs: '*.tsx, *.css'
alwaysApply: false
---

- Add or update the visual test in the same change as the UI it covers, never as a follow-up: a screen or state without a capture can break unseen.
- A new `registry:ui` component needs a preview in `UI_COMPONENT_PREVIEWS`; `tests/visual/ui-components.visual.ts` captures every preview. A state reached by interaction (an open menu, a second tab) gets an entry in its `STATES`.
- A new chat message, tool, or notice state goes into `client/features/dev/chat-states-fixtures.ts`; `chat.visual.ts` captures that whole conversation.
- A new page, dialog, or visible page state gets a test in its area's file (`chat.visual.ts`, `settings.visual.ts`, `workspace.visual.ts`), or a new `<area>.visual.ts` next to them.
- A new `/api` call the screen makes gets its answer in `API` in `tests/visual/fixtures.ts`, typed with `lib/types.ts`; a missing one gets a 404 and logs `no answer for GET …`.
- Assert the content that tells the state apart before the capture: text that also shows while loading proves nothing.
- Pin what varies between runs (clock, ids, server answers) instead of accepting a capture that changes on its own.
- Run `bun run test:visual`, or one test with `bun tests/visual/run.ts tests/visual/chat.visual.ts -t "new chat"`. CI uploads on every PR and push to `main`; read a PR's visual changes with the `check-visual-changes` skill.
