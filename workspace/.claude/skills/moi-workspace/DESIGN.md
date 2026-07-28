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

Every visible element must help the user understand useful content, see a real state, or take an
action. Do not add category eyebrows that repeat the title, readiness badges for an obvious default
state, helper copy that repeats nearby text, decorative status pills, or icons with no useful
meaning. Clear and simple applets contain fewer elements, and each one earns its place.

Widgets and views in one workspace should feel like a family through shared typography, palette,
spacing, or interaction patterns. They do not need to look identical.

## Color

The host supplies semantic color values; it does not paint a widget's fill. Every widget root must
cover the full frame with an opaque background. Start with `bg-background text-foreground`, or use
an intentional solid color, image, or visualization with a solid fallback. Widgets resolve semantic
tokens through the host's dark card theme. Views inherit the workspace surface. Semantic colors keep
ordinary text, structure, controls, and states readable and consistent.

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
| Structure | `ring-1 ring-border`, `border-input`, `ring-ring` | Custom container edges, controls, and visible focus |

Use lower foreground opacity only for tertiary metadata that remains readable. Avoid weak alpha text
for important labels or values. Keep inset surfaces rare so a widget does not become a stack of
cards.

Keep container edges subtle. Use `ring-1 ring-border` for custom container outlines. Do not use a
bare `border`, black borders, or raw high-contrast border colors as custom container chrome.

Custom color is welcome when it carries identity, data, status, or useful emphasis. On a saturated
surface, choose an explicit light or dark foreground with strong contrast. Keep state colors
consistent and pair them with text, shape, or an icon when they convey meaning.

Use solid filled surfaces by default. A restrained shadow, glow, texture, image, or visualization
may add depth when it supports the subject. Do not use gradients as generic visual polish. Use a
gradient only when it encodes information or is essential to the specific content.

Use purple, violet, and fuchsia only when the content, brand, or user preference calls for them.
Never use a purple gradient as a default creativity or technology cue.

### Color starting points

These are anchors, not fixed palettes. Tint them or use a single accent.

| Content | Useful color families | Typical range |
| --- | --- | --- |
| Weather, sky, time | Sky, blue, indigo | 500–700 |
| Night or dark environments | Indigo, slate | 800–900 |
| Overcast or neutral data | Slate, zinc, neutral | 500–800 |
| Nature and health | Emerald, green, teal | 500–700 |
| Finance and positive movement | Emerald, teal | 600–700 |
| Music and creative media | Blue, teal, amber, rose | 500–700 |
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

Use a small, consistent type scale. `text-sm` (14 px) is the default for UI text. Use smaller text
only for genuinely compact metadata and larger text only for clear headings or one meaningful
display value. Do not create many label styles with slightly different sizes.

Keep text contrast clear. Use `text-foreground` for primary content and `text-muted-foreground` for
genuinely secondary content. Avoid several near-identical text styles that make hierarchy hard to
read.

Reserve `font-mono` for code, command text, and truly code-like identifiers. Do not use monospace for
numeric UI values, measurements, percentages, timers, timestamps, prices, counts, or labels. Numbers
inherit the workspace's default font; add `tabular-nums` when stable digit widths or alignment help.
A stronger display treatment may lead a widget or view when it serves the content, but it should not
become a separate type system. Keep no more than two clear type roles in one applet.

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

## Shape and radius

Use the shared shadcn radius scale and keep its default radius on standard controls. Ordinary cards,
fields, list rows, and repeated sections should use `rounded-lg` or `rounded-xl`. Reserve
`rounded-2xl` and `rounded-3xl` for one expressive focal surface, and use `rounded-full` only for
real pills, circular buttons, avatars, and status dots. Controls and rectangular content regions
must not look capsule-shaped.

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

The host card owns the outer radius, border, shadow, clipping, and elevation. It leaves the inside
transparent. The widget root fills that rectangle and must paint an opaque content surface while
adding no outer card chrome. Use `h-full w-full bg-background text-foreground` as the safe default.
A solid color, image, or visualization can replace the semantic background when it has a solid
fallback. Keep loading, error, and empty states opaque too.

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

After implementation, do a removal pass from top to bottom. For every label, badge, icon, helper
sentence, container, divider, and decoration, ask which user decision, action, or understanding it
improves. Remove it when the screen stays equally clear and usable without it.

Before finishing an applet, confirm:

- Every visible element has a clear purpose.
- Its purpose and first reading are clear at the intended size.
- Every widget root fills the frame with an opaque background in every state.
- Semantic colors handle structure and custom color has a reason.
- Surfaces use solid fills by default; gradients have a content-specific reason.
- Purple appears only for a content, brand, or user reason and never as a default gradient.
- Type, spacing, density, and expression support the content.
- Numeric UI values use the default font, with `tabular-nums` when alignment helps.
- Custom container outlines use a subtle `ring-border`.
- The layout handles realistic content and deliberate overflow.
- Every reachable state and interaction is complete and accessible.
- The widget or view follows its frame, sizing, and scrolling rules.
- It feels related to the workspace without copying the quieter host shell.
