Widget design guidelines. Follow these when creating or modifying widgets.

## Content Principles

- **Glanceability is everything.** A widget should communicate its value in under 2 seconds. If the user needs to read a paragraph, it belongs in a full view — not a widget.
- Show the most relevant, up-to-date information for the widget's purpose. Avoid cramming multiple unrelated pieces of data into one widget.
- Use a clear visual hierarchy: one primary piece of information (large, prominent), with optional secondary context (smaller, muted).
- Avoid placeholder or empty-looking states. If data isn't available yet, show a meaningful skeleton or brief status message — never a blank card.
- Do not replicate full app screens. A widget is a focused snapshot, not a miniature app.

## Layout & Grid

- Widgets live on a 4-column grid. 
- 1 cell is approximately 160x160 px.
- Widget can define a row/col span (default is 1x1) by exporting a `config` object (see example below).
  - `export const config = { rowSpan: 2, colSpan: 1} as const`
- These dimensions MUST BE selected based on the widget purpose.
- **Widgets are compact.** Design everything to fit within their size. Use space efficiently — no oversized text, no excessive padding, no wasted vertical space.
- The widget's root element must fill the entire card: use `w-full h-full` so it stretches to the grid cell boundaries.
- Pad content with `p-4` or `p-6` inside the root element. Never let content touch the card edges.
- Center content vertically and horizontally when the widget has a single focal element (e.g. a clock, a stat). Use `flex flex-col items-center justify-center w-full h-full`.
- For list-style content, align to the top-left: `flex flex-col items-start justify-start w-full h-full`.

## Colors & Theming

- **All widgets are dark themed.** The widget container applies the `dark` class automatically, so all semantic tokens resolve to their dark variants inside widgets. You do not need to add `dark` yourself.
- **Use semantic tokens everywhere.** Available tokens (all resolve to dark values inside widgets):
  - `text-foreground` — primary text (white in dark theme).
  - `text-muted-foreground` — secondary/supporting text.
  - `bg-background` / `text-foreground` — the widget surface itself (dark).
  - `bg-secondary` / `text-secondary-foreground` — inset areas, tags.
  - `bg-muted` / `text-muted-foreground` — subdued elements, secondary labels.
  - `bg-accent` / `text-accent-foreground` — interactive hover states.
  - `bg-primary` / `text-primary-foreground` — buttons and key interactive elements (light-on-dark in dark theme).
  - `text-destructive` — errors and destructive actions.
  - `border-border` — dividers and outlines.
- Do not use `text-white`, `text-black`, `white/70`, or any raw color. Always use semantic tokens — they adapt to the dark theme automatically.
- **Widget backgrounds should be fun and metaphorical.** Pick a Tailwind palette background color that relates to the widget's purpose or content. Examples:
  - Weather → sky color: `bg-sky-500` (clear), `bg-slate-600` (overcast), `bg-indigo-900` (night).
  - Activity/fitness → `bg-emerald-600` or `bg-green-600`.
  - Music/audio → `bg-violet-600` or `bg-fuchsia-600`.
  - Finance/money → `bg-emerald-700` or `bg-teal-600`.
  - Alerts/urgent → `bg-red-600` or `bg-orange-600`.
  - Time/clock → `bg-blue-600` or `bg-indigo-600`.
  - Notes/text → `bg-amber-500` or `bg-yellow-500`.
- Use the 500–700 range for backgrounds — vivid enough to feel fun, dark enough for white text contrast.
- Fall back to `bg-background` (black in dark theme) only when no metaphor fits. Try to find one first.
- Apart from the background color, use semantic tokens for everything else (text, borders, buttons, etc.). Do not use palette colors for text or UI elements.
- Do not add `rounded-*` to the widget root — the card container already applies border radius.

## Typography

- Use the default sans-serif (`font-sans`) for all UI text.
- Use monospace (`font-mono`) only for numeric displays that update frequently (clocks, counters, live data) — it keeps digits from jumping via `tabular-nums`.
- Size scale for widget content:
  - **Hero number/stat**: `text-xl font-bold` or `text-2xl font-bold`.
  - **Title/heading**: `text-sm font-semibold`.
  - **Body text**: `text-sm`.
  - **Caption/label**: `text-xs text-muted-foreground`.
- Avoid going below `text-xs` — it becomes unreadable at widget scale.
- Avoid going above `text-2xl` — widgets are 160px tall and large text wastes space.
- Truncate long text with `truncate` or `line-clamp-2` rather than letting it overflow. Never allow horizontal scrolling.

## Interactive Elements

- Widgets support full interactivity: buttons, toggles, inputs, and taps.
- Use the project's `Button` component (`components/ui/button`) for actions. Choose the appropriate variant:
  - `default` — primary action (one per widget max).
  - `outline` or `ghost` — secondary actions.
  - `icon` / `icon-sm` — icon-only actions (toggle, refresh, settings).
- Keep interactions simple. A widget should have 1–2 actions at most. If you need more, the feature probably deserves a full view.
- Provide immediate visual feedback for every interaction — state change, loading indicator, or animation.
- For toggles and switches, reflect the current state clearly. The user should never wonder "is this on or off?"
- Inputs in widgets should be minimal — a single search field or a quick-entry input. Long forms don't belong in widgets.
- Interactive elements must have adequate tap targets: minimum `h-8 w-8` (32px) for icon buttons, `h-9 px-4` for text buttons.
- Use `cn()` from `@/client/lib/cn` for conditional classes. Never template literal ternaries.

## UX Patterns

- **Loading**: Show a skeleton or subtle placeholder that matches the widget's layout. Use `bg-muted animate-pulse rounded` blocks that mirror where real content will appear. Never show a spinner for initial load.
- **Error**: Display a short, human-readable message in `text-destructive text-xs`. Include a retry action if the operation can be retried. Don't show stack traces or technical details.
- **Empty state**: Show a brief message explaining why there's no data and what the user can do about it. Use `text-muted-foreground text-sm` with an optional icon.
- **Refreshing data**: For widgets that poll or fetch, update content in place without a full re-render flash. Fade new values in if they change.
- **Stale data**: If data might be outdated, show a subtle timestamp (e.g. "Updated 5m ago" in `text-xs text-muted-foreground`) so the user knows.
- **Server functions**: Call server functions (`*.server.ts`) for anything that needs secrets, filesystem access, or external APIs. Handle their async nature with loading/error states as described above.

## Animations

- Use `tw-animate-css` utility classes for all enter/exit animations. Do not write custom `@keyframes` unless absolutely necessary.
- Common patterns:
  - **Widget appearing**: `animate-in fade-in-0 zoom-in-95 duration-200`.
  - **Content update**: `animate-in fade-in-0 duration-150`.
  - **Error shake**: a brief horizontal shake — use `tw-animate-css` if available, or a minimal `@keyframes` as last resort.
- Keep animations under 300ms. Widgets should feel snappy and responsive, not cinematic.
- Never use animation as decoration. Every animation should communicate a state change (appearing, updating, error, success).
- For numeric values that update frequently (clocks, counters), do not animate each change — just swap the value. Animating every tick creates distraction.
- Layout animations (reordering, resizing) are handled by the `WidgetCard` container via Framer Motion. Don't add competing layout animations inside widget content.

## Icons

- Use `@tabler/icons-react` for all icons. Import from the root: `import { IconName } from "@tabler/icons-react"`.
- Always set `stroke={1.5}` on every icon.
- Size icons to match their context:
  - Inline with `text-xs` or `text-sm`: `size={16}`.
  - Inline with `text-base` or `text-lg`: `size={20}`.
  - Standalone or decorative: `size={24}`.
  - Inside `Button`: don't set `size` — it's handled by the button variant.
- Use icons to reinforce meaning, not replace text. A refresh icon next to "Refresh" is fine; a mystery icon with no label is not.
- For empty states and status indicators, pair an icon with a text label. Never rely on an icon alone to convey meaning in a widget.

## Don'ts

- Don't build mini-apps. If you need tabs, navigation, or multi-step flows, it's not a widget.
- Don't use custom CSS, inline `style={{}}`, or CSS modules. Tailwind covers everything.
- Don't use `text-white`, `text-black`, or raw colors — always use semantic tokens (`text-foreground`, `text-muted-foreground`, etc.).
- Don't install additional icon or animation packages.
- Don't use raw `<svg>` elements for icons — always use Tabler icon components.
- Don't overflow the widget boundary. All content must fit within the grid cell. Use `overflow-hidden` if needed.
- Don't include marketing copy, long descriptions, or instructions inside a widget. Keep text functional.
- Don't auto-play sound or video. Media playback must be user-initiated.
