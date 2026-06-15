Widget design guidelines. Read before creating or modifying any widget.

## The one idea

A widget is **glanceable in under 2 seconds** — and earns **one signature moment**: a single expressive flourish (a live visualization, a 3D flip, a tactile surface, a satisfying state change) that makes it feel alive. Restraint everywhere except that one place. If everything is emphasized, nothing is.

## Rules — never break

- **Content-only root.** The root is a plain `w-full h-full` rectangle. The host card owns the shell — never put `rounded-*`, an outer `border`, `shadow-*`, or a card-surface background on the root. Use `flex flex-col` + `overflow-hidden`; push footers down with `mt-auto`.
- **Three states, always.** Loading → skeleton (never a spinner). Error → one human sentence + a retry. Empty → a short prompt, never blank. (Patterns below.)
- **Height is the hard constraint.** `height = rowSpan×160 + (rowSpan−1)×16`, exact. Width flexes with the viewport. Design for height first; clip risk → `overflow-hidden`, long text → `truncate` / `line-clamp`.
- **Tailwind for static styling.** No custom CSS, no `@apply`, no *static* `style={{}}`. Icons only from `@tabler/icons-react` (no raw `<svg>`, no other icon packs). Widgets import only from their own folder.
- **No auto-playing audio or video.** Media is always user-initiated.
- **No page-level horizontal scroll.** A deliberate, bounded internal scroller (e.g. a Kanban board) is fine; the widget itself never makes the page scroll sideways.

## Sizing

Grid: 4 columns · 160px row height · 16px gap. `export const config = { colSpan, rowSpan } as const` (each defaults to 1).

| Config | ~Width | Height | Usable (after p-4/5) |
|--------|--------|--------|----------------------|
| 1×1 | 284px | 160px | ~252 × 128 |
| 2×1 | 584px | 160px | ~552 × 128 |
| 2×2 | 584px | 336px | ~552 × 304 |
| 4×2 | 1184px | 336px | ~1152 × 304 |
| 4×3 | 1184px | 512px | ~1152 × 480 |

Start at the smallest size that fits; grow only if content demands it. After changing `config` size, rebuild with `moi bundle --force`.

## Defaults — break with intent

These are taste, not law. Break any of them when the widget is genuinely better for it — just know you're doing it.

- **Background — varies.** Pick a surface that fits the content: a tonal **gradient** (`bg-linear-to-br`, 2–3 stops, one hue family), a **flat metaphor color**, an **image**, or neutral `bg-background`. A soft ambient glow blob (`absolute … rounded-full bg-…/20 blur-3xl`) adds depth. Keep it one family — tonal, not rainbow. Color should mean something (domain, status), not just decorate.
- **Hierarchy.** One hero element your eye hits first (up to `text-5xl`), ≤2 supporting elements (≤`text-sm`), tertiary muted. The size *gap* is the hierarchy. If two things compete, cut one.
- **Type.** ≤2 families. Match the hero font to the workspace personality — serif for warmth, geometric/sans for crisp data. `font-mono tabular-nums` for live/changing numbers. Small labels read well uppercase with wide tracking (e.g. `text-[11px] uppercase tracking-[0.2em] text-foreground/60`).
- **Color tokens.** On neutral surfaces use semantic tokens (`text-foreground`, `text-muted-foreground`, `bg-background`, `border-border`, `text-destructive`). On saturated/gradient surfaces, `text-white` / `text-stone-900` and `white/NN` opacities are correct. Accent colors (a red play button, emerald progress, amber/sky/emerald status dots) signal action or state.
- **Spacing.** 4px scale. Tight (4–8px) = belongs together; medium (12–16px) = grouped; wide (24px+) = section break. Prefer spacing over dividers. `p-4`/`p-5` content padding; never touch the edges.
- **Density.** Every element earns its pixel. Prefer live info over static labels. One binary mode toggle (e.g. card/list) is fine — but no tabs, wizards, or multi-step flows.
- **Family.** Widgets in one workspace should feel related — a shared move (gradient + glow, tracked labels, rounded-pill controls, the same hero font) ties them together.

### Color reference

Starting points, not mandates — use them, tint them, or turn an anchor into a 2–3 stop gradient.

**Semantic tokens** (for neutral surfaces; auto-resolve to the dark widget theme):

| Token | Class | Purpose |
|-------|-------|---------|
| Primary text | `text-foreground` | Main content, headings, hero numbers |
| Secondary text | `text-muted-foreground` | Supporting labels, captions, timestamps |
| Subdued text | `text-foreground/50` | Lowest-priority metadata |
| Error text | `text-destructive` | Error messages, destructive states |
| Surface | `bg-background` | Widget surface (dark) |
| Raised surface | `bg-card` | Cards within cards, inset areas |
| Muted surface | `bg-muted` | Subdued backgrounds, skeleton blocks |
| Secondary surface | `bg-secondary` | Tags, badges, inset regions |
| Primary action | `bg-primary text-primary-foreground` | Buttons, key interactive elements |
| Border | `border-border` | Dividers, outlines |

**Background anchors by domain** (a tonal base — gradient it or pair with a glow):

| Content domain | Anchor colors | Range |
|----------------|---------------|-------|
| Weather / sky | `sky-500`, `sky-600`, `blue-600`, `blue-700` | 500–700 |
| Night / dark sky | `indigo-900`, `slate-800` | 800–900 |
| Overcast / fog | `slate-500`, `slate-600` | 500–600 |
| Nature / health | `emerald-600`, `green-600` | 500–700 |
| Finance / money | `emerald-700`, `teal-600` | 600–700 |
| Music / audio | `violet-600`, `fuchsia-600` | 500–700 |
| Alerts / urgent | `red-600`, `orange-600` | 500–700 |
| Time / clock | `blue-600`, `indigo-600` | 500–700 |
| Notes / text | `amber-500`, `yellow-500` | 400–600 |
| Social / comms | `pink-500`, `rose-500` | 400–600 |
| Productivity | `cyan-600`, `sky-700` | 500–700 |
| Neutral / generic | `zinc-700`, `neutral-700` | 600–800 |

## Motion & interaction

- **Layered, but ranked.** (1) one **entrance** (`animate-in fade-in-0 zoom-in-95`, may stagger via a dynamic `animationDelay`); (2) **feedback** on every interaction (hover lift, `active:scale-[0.98]`, optimistic toggles, `transition-colors`, `disabled:opacity-50`); (3) **≤1 signature** animation (a waveform, a flip, confetti). Never two signatures in one widget. Don't animate a frequently-updating number — just swap it.
- **Dynamic `style` is allowed — for data only.** Use `style={{}}` solely for genuinely dynamic, computed values: per-frame transforms, data-driven widths/heights, per-index stagger delays, flip rotations. Everything static stays in Tailwind.
- **Tactility (optional, ≤1 per widget).** Interactive surfaces (keys, cards, toggles) may feel physical with an inset top-sheen + soft drop shadow + inset ring, e.g. `shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_3px_6px_rgba(0,0,0,0.3)] ring-1 ring-inset ring-white/20`. Never on the root.

## States

**Loading** — a skeleton that mirrors the real layout (vary block widths), keeping the background:
```tsx
<div className="h-3 w-20 rounded bg-foreground/20 animate-pulse" />
```
**Error** — drop to `bg-background`, one sentence, a retry:
```tsx
<div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-background p-4 text-center">
  <Icon size={24} stroke={1.5} className="text-muted-foreground" />
  <span className="text-xs text-destructive">Could not load</span>
  <button onClick={retry} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
    Try again
  </button>
</div>
```
**Empty** — a short prompt, never blank. **Refresh** — keep current data visible (use a separate `refreshing` flag, `animate-spin` the button). **Stale** — a `text-foreground/50` timestamp pinned to the bottom with `mt-auto`, re-rendered on an interval.

## Helper

Widgets can't import the project `cn`. Use a local `cx()`; never template-literal ternaries in `className`:
```tsx
function cx(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}
```
