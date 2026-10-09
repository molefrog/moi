---
description: How to write and maintain pull request titles and descriptions.
alwaysApply: true
---

- Lead with 2–3 sentences of what changed and why, describing behavior the reviewer can observe — never a file-by-file or function-by-function inventory; the diff already shows that.
- Language: concise, simple, easy to read by ACTUAL HUMANS. Formatting: less.
- Show the artifact right after the intro: the rendered output, a screenshot for UI changes, a wire sample. One example explains more than any amount of prose.
- Keep the whole body around 25 lines. Put deep detail in repo docs (`NOTES.md`, rules) or commit messages and link to it instead of duplicating.
- Update the description whenever the design pivots mid-PR. The body must describe the final state — a description written at PR-open and never touched becomes misleading.
- Optionally, call out the risky or surprising spots a reviewer should look at closely, with the reason each is risky.
- Wrap literal tags like `<moi-context>` in backticks — bare angle-bracket tags are parsed as HTML by GitHub and silently vanish.
- Write the title as behavior, sentence case, no trailing period (e.g. `Add moi-context envelope for ambient workspace state`).
