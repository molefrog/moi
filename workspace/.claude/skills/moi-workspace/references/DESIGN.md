# moi applet design

This visual contract covers widgets and views inside a moi workspace. Applets may be expressive
while staying related to the calm host. This guide owns design decisions, `SKILL.md` owns
implementation, and the host owns fonts and semantic color values.

## Core principles and visual hierarchy

Design around the content and task. Give every applet one clear first reading, then add detail in
proportion to its purpose and space. Dense information needs hierarchy, alignment, and stable lanes.

An applet may have one expressive focal point, such as a visualization, image, strong surface, or
state change. Keep the rest restrained. Avoid decorative clutter and competing effects.

Every visible element must explain content, show a real state, or enable an action. Remove repeated
labels, obvious readiness badges, redundant helper copy, decorative status pills, and meaningless
icons. Relate a workspace's applets through typography, palette, spacing, or interaction patterns.

Lead with the main value, message, or task. Quiet supporting content and make tertiary metadata easy
to ignore. A widget may use one large hero value when its footprint supports it. When two elements
compete, reduce one.

## Shared system

### Color and surfaces

Use `h-full w-full bg-background text-foreground` for most roots. Widgets and views share token
meaning while the host resolves their values differently:

- **Widgets:** `background` is the workspace `primary`, `foreground` is its readable pair, and the
  local `primary` pair becomes a derived light action surface. The transparent host frame requires
  an opaque root or an opaque fallback behind a full-bleed image or visualization.
- **Views:** tokens inherit the workspace page theme, so the default root matches the page.
- **Floating UI:** menus, tooltips, and popovers use `bg-popover text-popover-foreground` inside
  the applet scope.

| Intent | Classes and guidance |
| --- | --- |
| Main content | `text-foreground` for titles, labels, values, and important icons |
| Supporting content | `text-muted-foreground` for descriptions and secondary information |
| Inset surface | `bg-card text-card-foreground`, used only for a distinct functional region |
| Quiet fill | `bg-muted` for inset regions, skeletons, and disabled structure |
| Control state | `bg-accent text-accent-foreground` for hover, active, and selected controls |
| Main action | `bg-primary text-primary-foreground hover:bg-primary/90` |
| State | Views may use `text-success`, `bg-success/10`, `text-destructive`, or `bg-destructive/10`; widgets use `text-foreground`. Add clear wording and, when useful, an icon or shape. |
| Object edge | `ring-1 ring-border` for complete container and control outlines |
| Focus | `focus-visible:ring-2 focus-visible:ring-ring` |
| Separator | A one-sided border such as `border-b border-border` between adjacent regions |

Use lower foreground opacity only for readable tertiary metadata. Important text needs full
contrast. Saturated surfaces need an explicit readable light or dark foreground. Never rely on
color alone.

Use rings for complete outlines and one-sided borders for separators; never combine both. Keep
edges subtle and avoid raw high-contrast colors. Derive tonal colors and custom gradients from
local tokens with `color-mix()`. Tailwind palette colors need a content, data, brand, or user reason.
Explain consistent data mappings with labels, legends, shapes, or values. Never use palette colors
for generic decoration or unrelated widget backgrounds. Purple, violet, and fuchsia also need a
reason and never act as a default creativity or technology cue.

Use an open layout. Group with spacing, alignment, type, and occasional separators. Add a surface
only around an interactive object, independent scroller, distinct state, or self-contained work
area. Standard controls keep their surfaces; headers, tabs, summaries, metrics, and ordinary
sections stay unboxed.

Avoid large rounded page frames, adjacent or nested cards, and structural wrappers. Align content
to shared edges or grid columns. Apply outer padding once, then use gaps. Removing a surface also
means removing its card-like padding and radius and realigning its children.

### Stacking and overlays

Use DOM order for normal stacking: later siblings appear above earlier ones. Avoid z-index for
ordinary layout. When floating UI must escape clipping or a local stacking context, portal it into
the closest `[data-applet]` root to preserve applet scope and theme tokens. Never portal applet UI
to `document.body`.

Add a local, minimal z-index only when DOM order and a scoped portal cannot solve the stacking need.
Several layers or escalating values mean the layout structure needs reconsideration.

### Textures

Texture is optional and belongs only on the applet root. Choose it after the content layout is
clear, use at most one, and pair it with an opaque semantic base such as
`bg-background text-foreground texture-checker`.

Available treatments are `texture-checker`, `texture-grid`, `texture-noise`,
`texture-gradient-linear`, and `texture-inset-shadow`. They use semantic colors without replacing
the base background color.

Match treatment to density. Dense root content uses plain `bg-background`,
`texture-gradient-linear`, or `texture-inset-shadow`; sparse content may use any readable texture.
Checker, grid, or noise may surround dense content only when it already needs an opaque or tonal
work surface. Full-bleed images, maps, canvases, and visualizations use no texture.

Never add wrappers to rescue a busy texture; choose a quieter root. Do not texture cards, panels,
controls, or text regions, stack textures, or add tuning variables. Check nearby applets: unrelated
applets use different textures, while a widget representing a view shares its texture. Any texture
should become easy to ignore while reading.

### Type

Inherit the workspace font and use sentence case. Use regular weight for most text and medium for
emphasis; other weights are reserved for owner hand-tuning. `text-sm` (14 px) is the UI default.
Use smaller text for compact metadata and larger text for headings or one display value. Keep at
most two clear type roles and avoid near-identical label styles.

Reserve `font-mono` for code, commands, and code-like identifiers. Numeric values, measurements,
percentages, timers, timestamps, prices, counts, and labels use the workspace font. Add
`tabular-nums` when stable widths or alignment help.

### Icons

Set `stroke` explicitly on every Tabler icon; the package default of `2` is heavier than the
workspace chrome. Use `1.75` for 12–16 px icons and `1.5` for 20–24 px icons. When a component sets
the icon size, omit `size` and use the stroke that matches its rendered size.

### Spacing and shape

Follow a 4 px spacing rhythm: 4–8 px within a tight group, 12–16 px between groups in a region, and
24 px or more at section changes in larger applets. Prefer spacing over dividers. Keep repeated
rows, chart labels, status markers, counters, and trailing actions in stable lanes so changing
values do not shift the layout.

Use the shared radius scale and default control radii. Use `rounded-lg` or `rounded-xl` for
ordinary regions, `rounded-2xl` or `rounded-3xl` for one focal surface, and `rounded-full` only for
real pills, circles, avatars, and status dots. Rectangular controls must not become capsules.

### Interaction, motion, and states

Controls must be obvious, keyboard-operable, comfortably sized, visibly focused, and accessibly
named. Use Tabler icons with consistent visual weight. Keep charts understandable through labels,
legends, patterns, or direct values as needed.

Use short, interruptible motion for meaningful state changes and control feedback. Respect reduced
motion and prefer transform and opacity. Avoid looping decoration and animation on frequently
updating numbers. Audio and video must be user-initiated.

Design only states the applet can reach. For data-driven applets, handle these when applicable:

- **Loading:** preserve the final layout and surface with a matching skeleton. Use a spinner only
  for compact inline work or work without a meaningful content shape.
- **Error:** explain the problem in one human sentence and offer retry or a clear recovery action.
- **Empty:** explain the absence briefly and provide a useful next step; never leave a data region
  blank.
- **Refreshing:** keep current data visible and show progress on the refresh control.
- **Stale:** show a quiet, current timestamp or status near the affected data.
- **Disabled:** preserve the label and structure while making unavailability clear without color
  alone.

Keep loading, populated, empty, success, and error layouts stable. A primary surface remains in the
same position and size through those states. Errors and empty states must fit the configured Widget
height or the View's normal content frame.

## Widgets

Widgets are compact dashboard surfaces seen beside other widgets. Their main meaning should be
clear in a quick scan. Larger footprints may add charts, lists, metadata, filters, and direct
actions while preserving one first reading.

The host card owns outer radius, border, shadow, clipping, and elevation. Its interior is
transparent. Fill it with an opaque `h-full w-full` root and add no outer card chrome. Use `p-4` as
the compact padding default or `p-5` for larger footprints when content still fits. Use a column
layout when content needs a footer or timestamp and keep lower-priority information at the bottom.

The grid has four columns, 160 px rows, 8 px gaps, and a maximum width of 640 px. A Widget may span
one to four rows and columns. Width shrinks with the workspace; height remains fixed by row span:

`rowSpan × 160 + (rowSpan − 1) × 8`

Treat width as flexible and height as the hard constraint. Start with the smallest footprint that
presents the content clearly. Test the narrowest realistic width and longest realistic values.
Clip decorative overflow deliberately, clamp supporting prose, and prevent horizontal page scroll
and accidental inner page scrolling.

A small Widget has one primary element and at most two supporting groups. Larger footprints may
carry more when hierarchy remains clear. Prefer live information over labels that repeat context.
Limit controls to the immediate task: filters, toggles, refresh actions, and links are appropriate.
Keep feedback on the control and leave the Widget surface unchanged on hover. Tabs, wizards,
multi-step workflows, deep navigation, and slide-in panels belong in a View (the `drawer` ui
component is views only).

## Views

Views are full app screens for denser information and sustained work. They own page hierarchy,
layout, spacing, chrome, and scrolling. A View must remain complete and usable at the available
width, including when chat shares the workspace.

One View represents one screen. Cross-screen navigation belongs to the workspace. Internal tabs,
filters, and master-detail layouts may organize the current task without adding a client-side
router; a `drawer` opening from the right is the standard detail pane beside a table or list.

Let content choose the frame. Most Views need clear page context, a primary work area, and an
obvious place for the main action. A title with an optional subtitle or action is a useful default;
a canvas, map, or immersive visualization may establish context another way.

Use consistent page padding such as 24 or 32 px. Constrain prose, forms, and narrow task flows to a
readable maximum width. Let tables, boards, maps, and visual workspaces use more of the frame when
the task benefits.

Prefer one main page scroller. Use bounded internal scrolling only where independent position helps,
such as a sticky table body, timeline, or board. Never create horizontal page scroll. Views may use
more sections, controls, and information layers than Widgets while keeping one primary work area;
do not stretch a Widget-like card to fill the page.

## Final review

Remove elements and wrappers that do not improve understanding, action, or state recognition, then
realign what remains. Confirm the first reading is clear; the visual system stays readable and
purposeful; realistic content and reachable states fit without overflow or jumps; controls are
necessary and accessible; and the applet follows its Widget or View contract.
