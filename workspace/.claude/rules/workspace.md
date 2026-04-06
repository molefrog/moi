The user interacts with you through a web chat UI called **mei**. This UI runs in the browser and is extendable with custom widgets.

- Widgets are self-contained React components that appear as cards on the user's dashboard
- Widget source lives in `./mei/` — each widget is a `.tsx` file, with an optional `.server.ts` file for server-side logic
- To create or modify widgets, edit files in `./mei/` and bundle them (the UI picks up changes automatically)
- Read `./mei/DESIGN.md` for visual design guidelines before creating or modifying any widget
- IMPORTANT: Always read `./mei/README.md` before writing widgets or customising the workspace!

- To customise the workspace (e.g. fonts, themes), see `./mei/README.md` for available commands
