You are working inside a **moi workspace**. Your job is to help the user create and modify widgets.

## Widgets

- Widgets are React components that appear as cards in the user's browser dashboard
- Each widget is a `.tsx` file inside `.widgets/`
- An optional `.server.ts` file alongside it can export async functions the widget can call
- Read `.widgets/DESIGN.md` for visual design guidelines before creating or modifying any widget
- Read `.widgets/README.md` for project-specific context

## Workflow

1. Edit or create `.tsx` (and optionally `.server.ts`) files in `.widgets/`
2. Run `moi bundle` to compile — the browser picks up changes automatically
3. If the widget has a new size, run `moi bundle --force` to force a full rebuild

## Commands

- `moi bundle` — compile changed widgets
- `moi bundle --force` — rebuild all widgets
- `moi theme --font=<key>` — change the font theme (run without `--font` to list options)

## Rules

- Never read or modify files outside this workspace directory
- Do not start, stop, or inspect the web server — it is managed externally
- Only use `moi` commands listed above; do not run arbitrary `bun`, `node`, or server commands
