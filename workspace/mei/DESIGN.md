Widget design guidelines. Read this file before creating or modifying any widget.

## 1. Design Philosophy

Six principles that guide every widget decision.

1. **Glanceable, not readable.** A widget communicates its value in under 2 seconds. If the user needs to read a paragraph, it belongs in a full view — not a widget.
2. **Content is the interface.** The data itself — a number, a label, an icon — is the design. Remove everything that isn't the information. No decorative chrome, no filler.
3. **Focused, not cramped.** Each widget serves one purpose. Show the most relevant, up-to-date information for that purpose. Avoid combining unrelated data.
4. **Hierarchy through restraint.** Use one primary element (large, prominent) and optional secondary context (smaller, muted). Three visual layers maximum: primary, secondary, tertiary. If you need more, split into two widgets.
5. **Both modes are first-class.** Dark and light themes must look intentional, not derived. Design for the dark widget surface explicitly — it's the default.
6. **Calm confidence.** Generous whitespace, deliberate alignment, and quiet typography signal quality. Empty space is not wasted space.

---

## 2. Craft Rules

### 2.1 Visual Hierarchy

- Every widget has exactly one focal element — the piece of information the user's eye hits first.
- Support it with at most two secondary elements (label, icon, subtitle).
- Tertiary elements (timestamps, units, metadata) recede into `text-muted-foreground` and smaller sizes.
- If two elements compete for attention, one of them shouldn't be there.

### 2.2 Typography Discipline

- Use at most **2 font families** per widget: `font-sans` for UI text, `font-mono` for live numeric data.
- Use at most **3 type sizes** per widget. More sizes = more visual noise.
- Use at most **2 font weights** per widget (e.g. `font-normal` + `font-bold`).

### 2.3 Spacing as Meaning

- Tight spacing (4–8px) means "these belong together."
- Medium spacing (12–16px) means "same group, different items."
- Wide spacing (24–32px) means "section break."
- Spacing communicates relationships. Use it instead of dividers when possible.

### 2.4 Color Intent

- Widget backgrounds should be **metaphorical** — pick a color that relates to the widget's content (sky blue for weather, green for health, amber for notes).
- Beyond the background, use only semantic tokens for text, borders, and UI elements.
- Color communicates meaning (status, category), never decoration. If removing the color changes nothing, remove it.
- Never use raw color values (`text-white`, `#ff0000`). Always semantic tokens or the metaphorical background palette.

### 2.5 Information Density

- Balance density: content should feel complete but not cluttered.
- Every element must earn its pixel. Ask: "If I remove this, does the widget still make sense?" If yes, remove it.
- Prefer showing dynamic information that changes throughout the day over static labels.
- Widgets are not mini-apps. No tabs, navigation, or multi-step flows.

### 2.6 Alignment and Balance

- Align elements to a consistent internal grid. Left-align text by default.
- Center content only when the widget has a single focal element (a clock, a stat, a gauge).
- For mixed content (label + value + icon), use flex layouts with consistent gaps.

### 2.7 Consistency With Intentional Contrast

- All widgets on the dashboard should feel like they belong to the same family.
- Break the pattern in exactly **one** place per widget to create a focal point — a larger number, a colored icon, a bold label.
- If everything is emphasized, nothing is.

---

## 3. Anti-Patterns

Things to never do in a widget:

- No inline `style={{}}` or custom CSS. Tailwind covers everything.
- No `text-white`, `text-black`, or raw hex colors. Semantic tokens only (except metaphorical backgrounds).
- No raw `<svg>` icons. Use `@tabler/icons-react` components.
- No text below `text-xs`. Unreadable at widget scale.
- No text above `text-3xl`. Wastes space in a 160px cell.
- No horizontal scrolling. Truncate with `truncate` or `line-clamp-2`.
- No spinners for initial load. Use skeleton placeholders.
- No full app layouts (tabs, sidebars, navigation, multi-step flows).
- No marketing copy, long descriptions, or instructions.
- No auto-playing sound or video. Media playback must be user-initiated.
- No excessive padding. Widgets are compact — every pixel counts.
- No rounded corners on the widget root — the card container handles this.
- No competing animations. One transition at a time.

---

## 4. Workflow

When creating or modifying a widget, follow this order:

1. **Purpose.** Define the single thing this widget communicates. Write it in one sentence.
2. **Size.** Choose grid span (`colSpan` x `rowSpan`) based on information density. Start small — only go larger if the content demands it.
3. **Hierarchy.** Identify the primary element, then secondary, then tertiary. Sketch the layout mentally.
4. **Background.** Choose a metaphorical background color from the palette (Section 6).
5. **Build.** Implement using tokens (Sections 5–8) and component patterns (Section 9).
6. **Check.** Verify against anti-patterns (Section 3). Remove anything that doesn't earn its space.

---

## 5. Grid & Widget Sizing

### Grid Constants

| Property | Value |
|----------|-------|
| Columns | 4 |
| Row height | 160px |
| Gap (between cells) | 16px |
| Container padding | 0px |
| Max container width | 1184px |

### How Widget Size Is Calculated

Each widget exports a `config` with `colSpan` and `rowSpan` (both default to 1):

```tsx
export const config = { rowSpan: 2, colSpan: 1 } as const
```

**Height** is deterministic — it depends only on `rowSpan`:
```
height = rowSpan × 160 + (rowSpan − 1) × 16
```

**Width** depends on `colSpan` and the actual container width. At max container (1184px), one column is 284px:
```
width = colSpan × columnWidth + (colSpan − 1) × 16
```

### Size Reference Table

These are the **exact pixel dimensions** your widget content must fit within. Content that exceeds the height will be clipped by `overflow-hidden` on the card container.

| Config | Name | Width | Height | Usable area (after p-4) |
|--------|------|-------|--------|------------------------|
| `1×1` | Small | ~284px | **160px** | ~252 × 128px |
| `1×2` | Tall | ~284px | **336px** | ~252 × 304px |
| `2×1` | Wide | ~584px | **160px** | ~552 × 128px |
| `2×2` | Medium | ~584px | **336px** | ~552 × 304px |
| `3×1` | Wide-L | ~884px | **160px** | ~852 × 128px |
| `4×1` | Full-W | ~1184px | **160px** | ~1152 × 128px |
| `4×2` | Full | ~1184px | **336px** | ~1152 × 304px |

> Width is approximate (column width varies with viewport). Height is exact. **Always design for the height constraint first** — it's the dimension that causes overflow.

### Height Budget

When planning content for a widget, count the pixels vertically. With `p-4` (16px padding top + bottom), the usable height is `height - 32px`.

**1-row widget (160px total, 128px usable):**
- Category label (text-xs): ~16px
- Gap: ~16px
- Hero metric (text-2xl): ~32px
- Subtitle (text-xs): ~16px
- Remaining: ~48px for spacing or one more element

**2-row widget (336px total, 304px usable):**
- Category label: ~16px
- Gap: ~16px
- Hero metric (text-2xl): ~32px
- Subtitle: ~16px
- Stats row: ~32px
- Remaining: ~192px for lists, charts, or generous spacing

If your content doesn't fit the height budget, either reduce content or increase `rowSpan`. Never allow content to overflow.

### Sizing Rules

- Choose the **smallest size** that fits the content. Start at 1×1 and grow only if information demands it.
- **Height is the hard constraint.** Width is flexible (columns resize with the viewport), but height is fixed at `rowSpan × 160 + (rowSpan − 1) × 16`.
- Always use `w-full h-full` on the widget root to fill the card.
- Use `overflow-hidden` if there's any risk of content exceeding bounds (e.g. dynamic text).
- Use `flex flex-col` on the root and `mt-auto` to push footer elements (timestamps) to the bottom — this works because the widget fills its exact height.

---

## 6. Colors

### Semantic Tokens

Use these for all UI elements (text, borders, interactive states). They auto-resolve to dark theme inside widgets.

| Token | Class | Purpose |
|-------|-------|---------|
| **Primary text** | `text-foreground` | Main content, headings, hero numbers |
| **Secondary text** | `text-muted-foreground` | Supporting labels, captions, timestamps |
| **Subdued text** | `text-foreground/50` | Lowest-priority metadata |
| **Error text** | `text-destructive` | Error messages, destructive states |
| **Surface** | `bg-background` | Widget surface (dark) |
| **Raised surface** | `bg-card` | Cards within cards, inset areas |
| **Muted surface** | `bg-muted` | Subdued backgrounds, skeleton blocks |
| **Secondary surface** | `bg-secondary` | Tags, badges, inset regions |
| **Primary action** | `bg-primary text-primary-foreground` | Buttons, key interactive elements |
| **Border** | `border-border` | Dividers, outlines |

**Rules:**
- Never use `text-white`, `text-black`, or raw hex/rgb values
- Never use palette colors for text or interactive elements — only for widget backgrounds
- Opacity modifiers are allowed on `text-foreground` (e.g. `text-foreground/70`) for subtle hierarchy

### Metaphorical Background Palette

Widget backgrounds use Tailwind palette colors that relate to the widget's content. This creates visual identity and makes the dashboard feel alive.

| Content domain | Background classes | Range |
|----------------|-------------------|-------|
| Weather / sky | `bg-sky-500`, `bg-sky-600`, `bg-blue-600`, `bg-blue-700` | 500–700 |
| Night / dark sky | `bg-indigo-900`, `bg-slate-800` | 800–900 |
| Overcast / fog | `bg-slate-500`, `bg-slate-600` | 500–600 |
| Nature / health | `bg-emerald-600`, `bg-green-600` | 500–700 |
| Finance / money | `bg-emerald-700`, `bg-teal-600` | 600–700 |
| Music / audio | `bg-violet-600`, `bg-fuchsia-600` | 500–700 |
| Alerts / urgent | `bg-red-600`, `bg-orange-600` | 500–700 |
| Time / clock | `bg-blue-600`, `bg-indigo-600` | 500–700 |
| Notes / text | `bg-amber-500`, `bg-yellow-500` | 400–600 |
| Social / comms | `bg-pink-500`, `bg-rose-500` | 400–600 |
| Productivity | `bg-cyan-600`, `bg-sky-700` | 500–700 |
| Neutral / generic | `bg-zinc-700`, `bg-neutral-700` | 600–800 |

**Rules:**
- Use the **500–700 range** for most backgrounds — vivid enough to feel distinct, dark enough for white text contrast
- Use **800–900** only for night/dark themes
- Fall back to `bg-background` (solid dark) only when no metaphor fits — try to find one first
- Pair backgrounds with `text-foreground` (white in dark theme) and `text-foreground/70` for secondary text
- Don't use palette colors for anything besides the widget root background

### Status Colors

Status dots are the one exception to "no palette colors for UI elements" — they encode meaning.

| State | Dot color | Text |
|-------|-----------|------|
| Active / healthy | `bg-emerald-400` | `Active`, `Connected`, `Healthy` |
| Warning | `bg-amber-400` | `Warning`, `Degraded` |
| Error / down | `bg-red-400` | `Error`, `Down`, `Failed` |
| Inactive / off | `bg-foreground/30` | `Inactive`, `Off`, `Paused` |

Always pair a status dot with a text label. Don't rely on color alone.

---

## 7. Typography

### Font Stack

| Role | Class | When to use |
|------|-------|-------------|
| **UI text** | `font-sans` | All labels, headings, body text, descriptions |
| **Numeric data** | `font-mono tabular-nums` | Clocks, counters, live-updating numbers, stats |

Use `font-mono` only for numbers that update frequently — it prevents digit-width jitter. All other text uses `font-sans`.

### Type Scale

| Role | Classes | Use for |
|------|---------|---------|
| **Hero metric** | `text-3xl font-bold` | The single most important number in a 2x2 or larger widget |
| **Large metric** | `text-2xl font-bold` | Primary number in a 2x1 widget |
| **Medium metric** | `text-xl font-bold` | Primary number in a 1x1 widget, or secondary number in larger widgets |
| **Title** | `text-sm font-semibold` | Widget heading, section label |
| **Body** | `text-sm` | Supporting text, descriptions |
| **Caption** | `text-xs text-muted-foreground` | Timestamps, units, metadata, tertiary info |

**Limits:**
- Never go below `text-xs` (unreadable at widget scale)
- Never go above `text-3xl` (wastes space)
- Max 3 sizes per widget
- Max 2 weights per widget (`font-normal` + one of `font-semibold` or `font-bold`)

### Line Height & Tracking

- Hero/large metrics: add `leading-none` to keep numbers tight
- Body text: default leading is fine (don't override)
- Monospace numbers: always pair with `tabular-nums` to prevent width jitter

---

## 8. Spacing, Radius, Motion & Icons

### Spacing Scale

Based on a 4px unit. Every spacing value should come from this scale.

| Token | Value | Tailwind | Semantic meaning |
|-------|-------|----------|-----------------|
| **Micro** | 2px | `gap-0.5`, `p-0.5` | Optical adjustment |
| **Tight** | 4px | `gap-1`, `p-1` | Belongs together (icon + label) |
| **Snug** | 8px | `gap-2`, `p-2` | Related items in a row |
| **Base** | 12px | `gap-3`, `p-3` | Comfortable separation |
| **Medium** | 16px | `gap-4`, `p-4` | Standard content padding, group separation |
| **Wide** | 24px | `gap-6`, `p-6` | Section break within widget |
| **Spacious** | 32px | `gap-8`, `p-8` | Major section break (rare in widgets) |

Content padding: `p-4` for all widgets, `p-6` for 2x2 or larger if needed. Never let content touch the card edges. Inner elements use `gap-*` for spacing between siblings, not margin.

Icon-text pairing: `gap-1` (4px) inline, `gap-2` (8px) stacked.

### Border Radius

The widget container applies outer border radius automatically (`rounded-2xl`). Do not add `rounded-*` to the widget root.

| Element | Class |
|---------|-------|
| Inner cards/surfaces | `rounded-lg` or `rounded-xl` |
| Tags/badges | `rounded-md` or `rounded-full` |
| Skeleton blocks | `rounded` or `rounded-md` |
| Images/avatars | `rounded-lg` or `rounded-full` |

Inner radius should always be smaller than outer radius.

### Motion & Animation

| Category | Duration | Use for |
|----------|----------|---------|
| **Micro** | 100–150ms | Hover states, opacity toggles, color transitions |
| **Standard** | 200–250ms | Content appearing, card transitions |
| **Emphasis** | 300ms | Important state changes (max for widgets) |

- Enter: `ease-out`. Exit: `ease-in`. Interactive: `ease-in-out`.
- Use `tw-animate-css` classes. No custom `@keyframes` unless absolutely necessary.
- Widget appear: `animate-in fade-in-0 zoom-in-95 duration-200`
- Content update: `animate-in fade-in-0 duration-150`
- Never animate frequently-updating numbers — just swap the value.
- Never exceed 300ms. One animation at a time. Every animation must communicate a state change.

### Iconography

All icons from `@tabler/icons-react`. No other packages. No raw `<svg>`.

| Context | Size prop |
|---------|-----------|
| Inline with `text-xs`/`text-sm` | `size={16}` |
| Inline with `text-base`/`text-lg` | `size={20}` |
| Standalone / decorative | `size={24}` |
| Hero icon (rare, 2x2 widgets) | `size={32}` |
| Inside `Button` | Don't set `size` |

Always set `stroke={1.5}`. Icons reinforce meaning — pair with a label except in obvious cases (refresh, close). Use `text-foreground` for primary, `text-foreground/70` or `text-muted-foreground` for secondary. Max 3–4 icons per widget.

---

## 9. Widget Component Patterns

### 9.1 Metric Widget

Display a single important number with context. Sizes: 1x1, 1x2, 2x1.

```
┌──────────────────────┐
│ ▪ Category Label     │  ← text-xs text-foreground/70, optional icon (size={12})
│                      │
│ 42.7°                │  ← text-2xl font-bold font-mono tabular-nums leading-none
│ Feels like 38°       │  ← text-xs text-foreground/70
│                      │
│ Updated 5m ago       │  ← text-xs text-foreground/50, pushed to bottom with mt-auto
└──────────────────────┘
```

```tsx
<div className="flex flex-col w-full h-full p-4 {bg-color}">
  <div className="flex items-center gap-1">
    <Icon size={12} stroke={1.5} className="text-foreground/70" />
    <span className="text-xs text-foreground/70">Label</span>
  </div>
  <span className="text-2xl font-bold font-mono tabular-nums leading-none mt-4">42.7°</span>
  <span className="text-xs text-foreground/70 mt-1">Subtitle</span>
  <span className="text-xs text-foreground/50 mt-auto">Updated 5m ago</span>
</div>
```

Variants: **Centered** (`items-center justify-center text-center`), **With icon** (icon + metric in a `flex items-end gap-2` row), **With trend** (`text-xs text-emerald-400` for positive), **With sparkline** (mini chart beside the number, 2x1 recommended).

### 9.2 Dual Metric Widget

Compare two related numbers side by side. Sizes: 2x1, 2x2.

```tsx
<div className="flex flex-col w-full h-full p-4 {bg-color}">
  <span className="text-xs text-foreground/70">Category</span>
  <div className="flex items-end gap-6 mt-4">
    <div className="flex flex-col">
      <span className="text-xl font-bold font-mono tabular-nums leading-none">72</span>
      <span className="text-xs text-foreground/70 mt-1">Heart Rate</span>
    </div>
    <div className="flex flex-col">
      <span className="text-xl font-bold font-mono tabular-nums leading-none">118/76</span>
      <span className="text-xs text-foreground/70 mt-1">Blood Pressure</span>
    </div>
  </div>
</div>
```

Max 2 metrics. Both use the same type size. Separate with `gap-6` or `border-r border-foreground/20`.

### 9.3 List Widget

Short list of items (3–7 rows). Sizes: 1x2, 2x2.

```tsx
<div className="flex flex-col w-full h-full p-4 {bg-color}">
  <span className="text-sm font-semibold text-foreground">Title</span>
  <div className="flex flex-col mt-3">
    {items.map((item, i) => (
      <div
        key={i}
        className={cx(
          'flex items-center justify-between py-2',
          i > 0 && 'border-t border-foreground/10'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={16} stroke={1.5} className="text-foreground/70 shrink-0" />
          <span className="text-sm text-foreground truncate">{item.label}</span>
        </div>
        <span className="text-xs text-foreground/70 shrink-0 ml-2">{item.value}</span>
      </div>
    ))}
  </div>
</div>
```

Max 7 items in a 2-row widget, 3–4 in a 1-row. Truncate long labels. Right-align numeric values. Min `h-8` per row for interactive items.

### 9.4 Status Widget

Current state of something (on/off, healthy/error). Size: 1x1.

```tsx
<div className="flex flex-col items-center justify-center w-full h-full p-4 {bg-color}">
  <div className="flex items-center gap-2">
    <span className="h-2 w-2 rounded-full bg-emerald-400" />
    <span className="text-sm font-semibold text-foreground">Active</span>
  </div>
  <span className="text-xs text-foreground/70 mt-1">Server Name</span>
</div>
```

Status dot: `h-2 w-2 rounded-full`. See Section 6 for status colors.

### 9.5 Progress Widget

Progress toward a goal. Sizes: 1x1, 2x1.

```tsx
<div className="flex flex-col w-full h-full p-4 {bg-color}">
  <span className="text-xs text-foreground/70">Steps Today</span>
  <span className="text-xl font-bold font-mono tabular-nums leading-none mt-3">7,432</span>
  <div className="flex items-center gap-2 mt-3">
    <div className="flex-1 h-1.5 bg-foreground/20 rounded-full overflow-hidden">
      <div className="h-full bg-foreground rounded-full" />
    </div>
    <span className="text-xs text-foreground/70 shrink-0">74%</span>
  </div>
  <span className="text-xs text-foreground/50 mt-1">Goal: 10,000</span>
</div>
```

Track: `h-1.5 bg-foreground/20 rounded-full`. Fill: `h-full bg-foreground rounded-full` with inline width. Always show numeric value alongside the bar.

### 9.6 Chart Widget

Visualize data trends. Sizes: 2x1 (sparkline), 2x2 (full), 4x2 (detailed).

```tsx
<div className="flex items-center w-full h-full p-4 {bg-color}">
  <div className="flex flex-col shrink-0">
    <span className="text-xs text-foreground/70">Revenue</span>
    <span className="text-xl font-bold font-mono tabular-nums leading-none mt-1">$12.4k</span>
    <span className="text-xs text-emerald-400 mt-1">+8.2%</span>
  </div>
  <div className="flex-1 h-full ml-4">{/* SVG or canvas chart */}</div>
</div>
```

Charts must always include a numeric readout. Primary series: `stroke-foreground` / `fill-foreground/80`. Secondary: `stroke-foreground/40`. Gridlines: `stroke-foreground/10`. Labels: `text-xs text-foreground/50 font-mono tabular-nums`.

### 9.7 Toggle / Control Widget

Quick on/off action. Size: 1x1.

```tsx
<div className="flex flex-col items-center justify-center w-full h-full p-4 {bg-color}">
  <Icon size={24} stroke={1.5} className="text-foreground" />
  <span className="text-sm font-semibold text-foreground mt-2">Label</span>
  <button
    onClick={toggle}
    className={cx(
      'mt-2 px-3 py-1 rounded-full text-xs font-semibold transition-colors',
      isOn ? 'bg-foreground text-background' : 'bg-foreground/20 text-foreground/70'
    )}
  >
    {isOn ? 'ON' : 'OFF'}
  </button>
</div>
```

Active = `bg-foreground text-background` (inverted). Inactive = `bg-foreground/20`. Max 1–2 interactive elements per 1x1.

### 9.8 Media Widget

Album art, photo, or visual content. Sizes: 1x1, 2x1, 2x2.

```tsx
<div className="relative w-full h-full overflow-hidden">
  <img src={url} alt={alt} className="w-full h-full object-cover" />
  <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent p-4">
    <span className="text-sm font-semibold text-white">Title</span>
    <span className="text-xs text-white/70">Subtitle</span>
  </div>
</div>
```

Images: `object-cover`. Text over images requires gradient overlay. `text-white` is acceptable here — it's an image overlay, not a semantic surface.

---

## 10. UX Patterns

### 10.1 Loading

Show skeleton shapes that mirror the widget's real layout. Communicates "content is coming" without text.

```tsx
<div className="flex flex-col w-full h-full p-4 {bg-color}">
  <div className="h-3 w-20 bg-foreground/20 rounded animate-pulse" />
  <div className="h-8 w-24 bg-foreground/20 rounded animate-pulse mt-4" />
  <div className="h-3 w-28 bg-foreground/20 rounded animate-pulse mt-2" />
  <div className="h-3 w-16 bg-foreground/20 rounded animate-pulse mt-auto" />
</div>
```

- Skeleton blocks: `bg-foreground/20 rounded animate-pulse`. Match the real layout's height, width, and position.
- Vary block widths to mimic real content.
- **Never use spinners** for initial load. Keep the metaphorical background color during loading.

### 10.2 Error

```tsx
<div className="flex flex-col items-center justify-center w-full h-full p-4 gap-2 bg-background">
  <Icon size={24} stroke={1.5} className="text-muted-foreground" />
  <span className="text-xs text-destructive text-center">Could not load weather</span>
  <button
    onClick={retry}
    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
  >
    Try again
  </button>
</div>
```

- Use `bg-background` — drop the metaphorical color for errors.
- Max one sentence, human-readable. Never show stack traces.
- Always offer retry if the operation can be retried. Use a contextual icon.

### 10.3 Empty State

```tsx
<div className="flex flex-col items-center justify-center w-full h-full p-4 gap-2 bg-background">
  <Icon size={24} stroke={1.5} className="text-muted-foreground" />
  <span className="text-sm text-muted-foreground text-center">No tasks yet</span>
  <span className="text-xs text-muted-foreground/70 text-center">Add a task to get started</span>
</div>
```

- Use `bg-background`. All text in `text-muted-foreground`. Don't leave completely blank.

### 10.4 Refreshing

- **Keep showing current data** during refresh. Never blank the widget.
- Spinning icon: `animate-spin` on refresh button. Disable while refreshing: `disabled:opacity-50`.
- Update in place when new data arrives. Use `animate-in fade-in-0 duration-150` for changed values.

### 10.5 Stale Data

```tsx
<span className="text-xs text-foreground/50 mt-auto">Updated {timeAgo(fetchedAt)}</span>
```

Position at widget bottom with `mt-auto`. Use `text-xs text-foreground/50`. Re-render on interval (e.g. every 60s).

### 10.6 Interactive Elements

- Use the project's `Button` component: `default` (1 per widget max), `outline`, `ghost`, `icon`/`icon-sm`.
- Tap targets: icon buttons `h-8 w-8` (32px), text buttons `h-9 px-4`, list rows `h-8`.
- Max 1–2 actions per widget. Immediate visual feedback for every interaction.
- Use `transition-colors` for hover states. Disable during async: `disabled:opacity-50`.

### 10.7 Server Function Data Flow

```tsx
export default function MyWidget() {
  const [data, setData] = useState<DataType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const result = await fetchData()
      setData(result)
      setError(null)
    } catch {
      setError('Could not load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <Skeleton />
  if (error || !data) return <ErrorState error={error} onRetry={load} />
  return <Content data={data} />
}
```

Always handle three states: loading, error, success. Wrap fetch in `useCallback` for reuse. For refresh, add separate `refreshing` state so existing content stays visible.

### 10.8 Conditional Classes

Use `cx()` helper for conditional classes (widgets can't import from `@/client/lib/cn`):

```tsx
function cx(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}

// Usage
<div className={cx('flex p-4', isActive && 'bg-foreground/10')} />
```

Never use template literal ternaries for `className`.
