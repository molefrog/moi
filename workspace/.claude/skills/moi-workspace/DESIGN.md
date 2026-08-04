# moi applet design

This is the visual contract for widgets and views inside a moi workspace. The host app stays calm,
precise, and quiet. Applets may be more expressive and information-rich while still feeling related
to the workspace around them.

This file owns visual direction, layout, states, and interaction design. `SKILL.md` owns file layout,
imports, styling syntax, and build instructions. The host owns fonts and semantic color values.
Widgets and views resolve color tokens in different scopes, described below.

## Visual direction

Design around the content and the task. Give every applet a clear first reading, then add detail in
proportion to its size and purpose. Dense information is welcome when hierarchy and alignment keep
it easy to scan.

An applet may have one expressive focal point: a visualization, strong surface, image, or satisfying
state change. It is optional. Use it when it helps the content and keep the rest restrained so it
remains meaningful. Avoid decorative clutter, competing effects, and a different visual system for
every section.

Every visible element must help the user understand useful content, see a real state, or take an
action. Do not add category eyebrows that repeat the title, readiness badges for an obvious default
state, helper copy that repeats nearby text, decorative status pills, or icons with no useful
meaning. Clear and simple applets contain fewer elements, and each one earns its place.

Widgets and views in one workspace should feel like a family through shared typography, palette,
spacing, or interaction patterns. They do not need to look identical.

## Color

### Widget surfaces

The host applies the `.dark` class around every widget. Semantic tokens inside a widget therefore
use dark-mode values regardless of the workspace color preset. The host frame stays transparent, so
every widget root must cover the full frame with an opaque background.

Use `h-full w-full bg-background text-foreground` for most widget roots. In the widget scope, it
resolves to a dark background with light text. When the whole widget has a clear positive or
negative state, tint the opaque background by mixing `--background` with `--success` or
`--destructive`. Use opacity variants such as `bg-success/10` for contained elements. An image or
visualization may own the surface when it has an opaque fallback.

### View surfaces

Views are separate pages. Their semantic tokens inherit the workspace theme, so
`h-full w-full bg-background text-foreground` is a sensible default root.

| Context or intent | Tailwind classes | Use |
| --- | --- | --- |
| Default widget root | `bg-background text-foreground` | Dark semantic surface for most widgets |
| Default view root | `bg-background text-foreground` | The workspace page surface and text |
| Primary content | `text-foreground` | Content on the default dark widget surface or normal view surface |
| Secondary content | `text-muted-foreground` | Supporting content on the default dark widget surface or normal view surface |
| Inset surface | `bg-card text-card-foreground` | A functionally distinct contained region, used sparingly |
| Floating surface | `bg-popover text-popover-foreground` | Menus, tooltips, and other floating content |
| Primary action | `bg-primary text-primary-foreground` | The most important action in a local region |
| Subdued surface | `bg-muted` | Skeletons, quiet fills, and disabled structure |
| Control state | `bg-accent text-accent-foreground` | Hover, active, and selected states on interactive controls |
| Positive or active state | `text-success` / `bg-success/10` | Positive outcomes, healthy states, presence, and progress indicators |
| Error or danger | `text-destructive` / `bg-destructive/10` | Errors, destructive actions, and invalid states |
| Object edge | `ring-1 ring-border` | Complete outlines around containers and controls |
| Focus | `focus-visible:ring-2 focus-visible:ring-ring` | Visible keyboard focus on interactive elements |
| Separator | `border-b border-border` | A one-sided division between adjacent regions |

Use lower opacity from the surface's foreground only for tertiary metadata that remains readable.
Avoid weak alpha text for important labels or values.

Prefer a subtle ring for the complete outline of a container or control. Use `ring-1 ring-border` on
semantic surfaces and an equally restrained ring color on custom light or colored surfaces. Reserve
one-sided borders such as `border-b` for separators between adjacent regions. Never use a border
and a ring on the same element. Avoid raw high-contrast colors for either treatment.

Derive extra neutral or tonal colors from semantic tokens with `color-mix()`. Use Tailwind palette
colors when they have clear content meaning, such as blue for clear-sky weather, or when an
infographic needs multiple colors to distinguish categories or series. A user-requested palette is
also a clear reason. Keep each mapping consistent and explain it with labels, legends, shapes, or
direct values. Do not use palette colors for generic decoration or unrelated widget backgrounds.
On a saturated surface, choose an explicit light or dark foreground with strong contrast.

### Surfaces and grouping

Use an open layout by default. Group content with spacing, alignment, type hierarchy, and, when
needed, a one-sided separator. Add a wrapper with its own fill, ring, radius, or shadow only when it
marks an interactive object, an independently scrolling region, a distinct state, or the main work
surface above a texture. Page headers, tab rows, empty states, summaries, metrics, and ordinary
sections stay unboxed. Standard controls keep their normal component surfaces.

Keep related content in one surface. Avoid adjacent or nested cards and wrappers that only repeat
the page structure. Remove a container when it does not clarify interaction, state, scrolling, or
content ownership.

### Textures

Apply at most one texture, usually to the applet root. Pair it with an opaque semantic base, such as
`h-full w-full bg-background texture-checker`. If content needs contrast, place one solid semantic
work surface above the texture and keep related content together inside it. Skip texture if the
layout would need several solid wrappers to stay readable.

| Texture | Tailwind class | Character |
| --- | --- | --- |
| Checker | `texture-checker` | Two softly tinted semantic squares with no empty cells |
| Grid | `texture-grid` | Fine semantic graph-paper lines over the base color |
| Noise | `texture-noise` | Foreground-tinted fractal grain that lets the base tint show through |
| Linear gradient | `texture-gradient-linear` | A restrained top-to-bottom wash derived from `primary` |
| Inset shadow | `texture-inset-shadow` | A soft edge glow derived from `primary` |

Textures add an effect without setting `background-color`; the base color remains visible through
them. An internal textured component is a rare exception and must act as a background behind solid
child objects. Do not apply texture to a card, panel, control, or text region. Do not stack textures
or add tuning variables.

Check nearby widgets and views before choosing one. Give unrelated applets different textures so
they remain distinct at a glance. A widget that opens, summarizes, or represents a view shares that
view's texture as part of the same visual language.

Custom gradients mix semantic tokens by default. Tailwind palette colors are appropriate when they
have clear content meaning, distinguish infographic data, or follow an explicit user request.

Use purple, violet, and fuchsia only when the content, brand, or user preference calls for them.
Never use a purple gradient as a default creativity or technology cue.

## Typography and hierarchy

Inherit the workspace font. Use sentence case for headings, labels, actions, and navigation. Use
regular weight for most text and medium for emphasis. Other weights are reserved for owner
hand-tuning.

Use a small, consistent type scale. `text-sm` (14 px) is the default for UI text. Use smaller text
only for genuinely compact metadata and larger text only for clear headings or one meaningful
display value. Do not create many label styles with slightly different sizes.

Keep text contrast clear and follow the foreground pairing for the chosen surface. Avoid several
near-identical text styles that make hierarchy hard to read.

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

Widgets may include compact controls such as filters, toggles, refresh actions, and links. Keep
interaction feedback on the control that performs the action. The widget surface stays unchanged on
hover. Multi-step workflows and deep navigation belong in a view.

Controls must be obvious, keyboard-operable, and large enough to use comfortably. Give them a
visible focus state and an accessible name. Use Tabler icons with consistent visual weight. Do not
rely on color alone, and keep charts understandable with labels, legends, patterns, or direct values
where needed.

Use short, interruptible motion for meaningful state changes and control feedback. Respect
reduced-motion preferences and animate transform and opacity where possible. Do not loop decorative
motion or animate frequently updating numbers. Audio and video must be user-initiated.

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
transparent. The widget root fills that rectangle and adds no outer card chrome. Its surface follows
the color guidance above.

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

After implementation, do a removal pass from top to bottom. Review every visible element and
wrapper, and remove anything that does not improve understanding, interaction, state, or hierarchy.

Before finishing an applet, confirm:

- Every visible element has a clear purpose.
- Its purpose and first reading are clear at the intended size.
- Semantic colors handle structure, and widget roots use the default semantic surface.
- Palette colors communicate content, distinguish infographic data, or follow a user request.
- Custom gradients mix semantic tokens unless content meaning or a user request calls for a palette.
- Purple appears only for a content, brand, or user reason and never as a default gradient.
- Type, spacing, density, and expression support the content.
- Numeric UI values use the default font, with `tabular-nums` when alignment helps.
- Complete object outlines use rings, borders act as one-sided separators, and no element uses both.
- The layout handles realistic content and deliberate overflow.
- Every control is necessary, complete, and accessible.
- The widget or view follows its frame, sizing, and scrolling rules.
- It feels related to the workspace without copying the quieter host shell.
