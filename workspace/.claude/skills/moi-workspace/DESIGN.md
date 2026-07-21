# moi applet design

This is the visual contract for widgets and views inside a moi workspace. The host app stays calm,
precise, and quiet. Applets may be more expressive and information-rich while still feeling related
to the workspace around them.

This file owns visual direction, layout, states, and interaction design. `SKILL.md` owns file layout,
imports, styling syntax, and build instructions. The workspace theme owns fonts and semantic color
values.

## Visual direction

Design around the content and the task. Give every applet a clear first reading, then add detail in
proportion to its size and purpose. Dense information is welcome when hierarchy and alignment keep
it easy to scan.

An applet may have one expressive focal point: a visualization, strong surface, image, tactile
interaction, or satisfying state change. It is optional. Use it when it helps the content and keep
the rest restrained so it remains meaningful. Avoid decorative clutter, competing effects, and a
different visual system for every section.

Widgets and views in one workspace should feel like a family through shared typography, palette,
spacing, or interaction patterns. They do not need to look identical.

## Color

Start with the semantic colors supplied by the applet's surface. Widgets use the host's dark card
theme. Views inherit the workspace surface. Semantic colors keep ordinary text, structure, controls,
and states readable and consistent.

| Intent | Tailwind token | Use |
| --- | --- | --- |
| Primary content | `text-foreground` | Headings, values, body text, and important icons |
| Secondary content | `text-muted-foreground` | Labels, captions, timestamps, and supporting metadata |
| Main surface | `bg-background text-foreground` | The default applet surface |
| Inset surface | `bg-card text-card-foreground` | A real contained object or raised region inside the applet |
| Floating surface | `bg-popover text-popover-foreground` | Menus, tooltips, and other floating content |
| Primary action | `bg-primary text-primary-foreground` | The most important action in a local region |
| Subdued surface | `bg-muted` | Skeletons, quiet fills, and disabled structure |
| Interaction | `bg-accent text-accent-foreground` | Hover, active, selected, and subtle highlighted states |
| Error or danger | `text-destructive` / `bg-destructive` | Errors, destructive actions, and invalid states |
| Structure | `border-border`, `border-input`, `ring-ring` | Dividers, controls, and visible focus |

Use lower foreground opacity only for tertiary metadata that remains readable. Avoid weak alpha text
for important labels or values. Keep inset surfaces rare so a widget does not become a stack of
cards.

Custom color is welcome when it carries identity, data, status, or useful emphasis. On a saturated
surface, choose an explicit light or dark foreground with strong contrast. Keep state colors
consistent and pair them with text, shape, or an icon when they convey meaning.

A tonal gradient may use two or three stops from one hue family. A soft glow or image can add depth
when it supports the subject. Avoid rainbow palettes and decorative color with no connection to the
content.

### Color starting points

These are anchors, not fixed palettes. Tint them, turn them into a tonal gradient, or use a single
accent.

| Content | Useful color families | Typical range |
| --- | --- | --- |
| Weather, sky, time | Sky, blue, indigo | 500–700 |
| Night or dark environments | Indigo, slate | 800–900 |
| Overcast or neutral data | Slate, zinc, neutral | 500–800 |
| Nature and health | Emerald, green, teal | 500–700 |
| Finance and positive movement | Emerald, teal | 600–700 |
| Music and creative media | Violet, fuchsia | 500–700 |
| Alerts and urgency | Red, orange | 500–700 |
| Notes and text | Amber, yellow | 400–600 |
| Social and communication | Pink, rose | 400–600 |
| Productivity and systems | Cyan, sky | 500–700 |

Use the middle and darker parts of a Tailwind color scale for substantial surfaces, then verify the
foreground contrast. Brighter values work better as small accents, chart marks, and status signals.

## Typography and hierarchy

Inherit the workspace font. Use sentence case for headings, labels, actions, and navigation. Use
regular weight for most text and medium for emphasis. Other weights are reserved for owner
hand-tuning.

Use monospace and tabular numbers for code, identifiers, timers, and values that need stable
alignment. A stronger display treatment may lead a widget or view when it serves the content, but it
should not become a separate type system. Keep no more than two clear type roles in one applet.

Build hierarchy with a visible size gap. Give the main value, message, or task the strongest
emphasis, keep supporting content quieter, and make tertiary metadata easy to ignore. A widget may
use a large hero value when its footprint supports it. If two elements compete for attention, reduce
one.

Use a 4 px spacing rhythm. As a guide:

- 4–8 px keeps tightly related items together.
- 12–16 px separates groups within a region.
- 24 px or more marks a section change in larger widgets and views.

Prefer spacing over dividers. Keep repeated rows, chart labels, status markers, counters, and
trailing actions in stable lanes so changing values do not shift the layout.

## Interaction and motion

Widgets support quick interactions such as a filter, toggle, refresh, or direct action. Multi-step
workflows and deep navigation belong in a view. Views may use tabs, filters, and master-detail
layouts when they organize one coherent screen.

Every interactive area must be obvious, keyboard-operable, and large enough to use comfortably.
Controls need a visible focus state and an accessible name. Use Tabler icons with consistent visual
weight. Do not rely on color alone, and keep charts understandable with labels, legends, patterns,
or direct values where needed.

Rank motion by purpose:

1. Optional entrance motion introduces the applet or a newly revealed region.
2. Interaction feedback covers hover, active, loading, disabled, and optimistic states.
3. At most one signature animation may act as the expressive focal point.

Keep motion short, interruptible, and safe for reduced-motion preferences. Animate transform and
opacity where possible. Do not loop decorative motion or animate frequently updating numbers. Audio
and video must be user-initiated.

A single interactive surface may use a restrained tactile treatment such as an inset highlight,
ring, or soft shadow. Keep this away from the widget's outer root because the host owns the card
shell.

## States

Design every state the applet can actually reach. Static applets do not need invented async states.
Data-driven applets need the following when applicable:

- **Loading:** show a skeleton that mirrors the final layout and preserves its surface. Use a spinner
  only for a compact inline action or work with no meaningful content shape.
- **Error:** explain the problem in one human sentence and provide a retry or clear recovery action.
- **Empty:** show a short explanation and a useful next step. Never leave a data region blank.
- **Refreshing:** keep current data visible and show progress on the refresh action. Do not replace
  useful content with the initial loading state.
- **Stale:** show a quiet timestamp or status near the affected data and keep it current.
- **Disabled:** preserve the label and structure while making the unavailable state clear without
  relying on color alone.

Keep state layouts stable so loading, success, empty, and error do not cause avoidable jumps. Errors
and empty states should still fit the configured widget height or the view's normal content frame.

## Widgets

Widgets are compact dashboard surfaces seen alongside other widgets. They should reveal their main
meaning within a quick scan. Larger widgets may add supporting charts, lists, metadata, filters, and
direct actions while keeping one clear first reading.

### Frame

The host card owns the outer radius, border, shadow, clipping, and elevation. A widget owns only its
content surface. Its root fills the available rectangle and must not add outer card chrome. The
content may use a semantic background, color, gradient, image, or visualization.

Use a column layout when content needs a footer or timestamp, and keep lower-priority information at
the bottom. Important content needs safe padding from every edge. Use `p-4` as the compact default;
`p-5` suits larger footprints when the content still fits.

### Grid and sizing

The dashboard grid has four columns, 160 px rows, 8 px gaps, and a maximum width of 640 px. A widget
may span one to four rows and columns. Width shrinks with the workspace; height stays fixed by the
selected row span.

The exact height is:

`rowSpan × 160 + (rowSpan − 1) × 8`

Common maximum sizes are:

| Footprint | Maximum outer size | Approximate content after `p-4` |
| --- | --- | --- |
| 1 × 1 | 154 × 160 px | 122 × 128 px |
| 2 × 1 | 316 × 160 px | 284 × 128 px |
| 2 × 2 | 316 × 328 px | 284 × 296 px |
| 4 × 2 | 640 × 328 px | 608 × 296 px |
| 4 × 3 | 640 × 496 px | 608 × 464 px |
| 4 × 4 | 640 × 664 px | 608 × 632 px |

Treat width as flexible and height as the hard constraint. Start with the smallest footprint that
presents the content clearly. Test the narrowest realistic width and the longest realistic values.
Clip decorative overflow deliberately, clamp supporting prose, and keep the widget itself from
creating horizontal page scroll or an accidental inner page scroller.

### Composition

Give the eye one primary element and no more than two supporting groups in a small widget. Larger
footprints may carry more information when spacing and alignment preserve the first reading. Prefer
live information over labels that repeat obvious context.

Keep controls limited to the immediate task. A compact mode switch can work; tabs, wizards, and
multi-step flows usually indicate that the content should become a view.

## Views

Views are full app screens for denser information and sustained work. They own their page hierarchy,
content layout, spacing, chrome, and scrolling. A view should feel complete at the available size and
remain usable when the chat shares the workspace.

One view represents one screen. Cross-screen navigation belongs to the workspace. Internal tabs,
filters, or a master-detail split may organize the current task without introducing a separate
client-side routing system.

Let the content choose the frame. Most views need clear page context, a primary work area, and an
obvious place for the main action. A header with a title and optional subtitle or action is a useful
default. A canvas, map, or immersive data surface may establish context another way.

Use generous, consistent page padding such as 24 or 32 px for normal views. Constrain prose, forms,
and narrow task flows to a readable maximum width. Let tables, boards, maps, and visual workspaces use
more of the frame when that improves the task.

Prefer one main page scroller. Use bounded internal scrolling only for regions that benefit from
independent position, such as a sticky table body, timeline, or board. The page itself must not
create horizontal scroll.

Views and widgets share the same color, type, motion, and state vocabulary. Views may use more
sections, controls, and information layers while preserving a clear primary work area. Avoid
stretching a widget-like card to fill the page.

## Final review

Before finishing an applet, confirm:

- Its purpose and first reading are clear at the intended size.
- Semantic colors handle structure and custom color has a reason.
- Type, spacing, density, and expression support the content.
- The layout handles realistic content and deliberate overflow.
- Every reachable state and interaction is complete and accessible.
- The widget or view follows its frame, sizing, and scrolling rules.
- It feels related to the workspace without copying the quieter host shell.
