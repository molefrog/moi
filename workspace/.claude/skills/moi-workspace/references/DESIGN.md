# moi applet design

Applets should feel useful, clear, and at home in the workspace. Let their content give them character while keeping familiar typography, colors, and interactions.

This guide is the highest-priority visual contract for widgets and views inside a moi workspace.
Follow generic design guidance only where it agrees with this guide.

## Content and layout

**Make the purpose clear at a glance.** Lead with the information or activity people came for. Use contrast to create clear levels of emphasis without making the interface feel washed out. Keep the main action easy to find.

**Choose content before adding structure.** Include the information and controls the task needs. Add summaries, metrics, filters, and explanations when they help people understand or act. Available space is not a reason to add content. A sparse screen can be complete.

**Consider the screen as a whole.** Individually useful elements can still compete or repeat one another. Consolidate related information and reveal secondary details when needed. Keep essential information and frequent actions readily available.

**Give expression a clear focus.** Use typography, composition, color, imagery, texture, or a small content-linked metaphor to give the applet character. A visual detail may support the subject or mood without carrying data or enabling an action. Keep the treatment focused so the content remains easy to scan. Expand a focal region only when added working space helps the task.

**Group through spacing and alignment.** Start with an open layout. Use surfaces only for interactive objects, independent scrolling regions, distinct states, or a dedicated work area. Keep ordinary headings, tabs, summaries, metrics, and sections unboxed. Avoid large rounded page frames and decorative rows of cards or nested cards.

**Keep a consistent rhythm.** Use a 4 px spacing rhythm, with smaller gaps inside groups and larger gaps between them. Apply outer padding once. Align repeated values and actions so content changes do not move them around. When removing a container, remove its unnecessary padding and radius and realign its contents.

**Keep the layout comfortable.** Give content enough room to scan without making it unnecessarily dense or stretching it to fill the frame. Use natural height for simple tasks and extra space for tables, boards, canvases, and other work areas that benefit from it. When everything fits comfortably, keep essential information and actions within one viewport. Adapt to narrow widths, long content, and chat sharing the workspace. Avoid horizontal page scrolling; wide content may scroll within its own bounded region.

**Keep layers simple.** Prefer normal document order and bundled overlays with their existing portal and stacking behavior. Custom overlays must preserve applet scope and theme by using the closest `[data-applet]` root. Add minimal local z-index only when document order and a scoped portal cannot resolve the overlap.

## Shared system

### Typography

**Use a small, consistent set of styles.** Establish clear roles for headings, ordinary content, and supporting information. Text with the same role and importance shares the same typography.

Inherit the workspace font and use sentence case. Use regular weight for most text and medium for emphasis, including focal prompts or values when weight helps establish hierarchy. Reserve other weights for explicit user customization.

**Choose readable defaults.** Use `text-sm` for controls and general UI, and `text-base` for focused content when space allows. Sizes below `text-sm` should be rare, limited to unusually tight controls. Use larger text for headings or a focal value.

Reserve `font-mono` for code, commands, and code-like identifiers. Numeric values, measurements, percentages, timers, timestamps, prices, counts, labels, keyboard shortcuts, and key names use the workspace font. Add `tabular-nums` when stable widths or alignment help.

### Controls

**Use familiar controls.** Follow the [UI component guidelines](UI-COMPONENTS.md) and use bundled components with their existing variants, sizes, and shapes. Controls with the same role and importance share component variants. Keep feedback near the action that caused it.

### Icons

Use Tabler icons when they clarify meaning, identify a familiar action, or reinforce a focused visual metaphor. Avoid adding an icon to every label or control. Set stroke explicitly: `1.75` at 12–16 px and `1.5` at 20–24 px. Let components control icon size when provided.

### Color and surfaces

**Follow the workspace theme.** Use semantic tokens and their matching foregrounds. The default root is `h-full w-full bg-background text-foreground`.

For widgets, the host sets the `background` token to the workspace’s `primary`, supplies a readable `foreground`, and derives a light local `primary` action surface. The host wrapper is transparent: each widget must paint its own opaque root, normally with `bg-background`, or provide an opaque fallback behind full-bleed media. Views inherit the page theme.

| Intent | Classes and guidance |
| --- | --- |
| Main content | `text-foreground` for primary content and controls |
| Supporting content | `text-muted-foreground` for secondary emphasis |
| Inset surface | `bg-card text-card-foreground`, used only for a distinct functional region |
| Quiet fill | `bg-muted` for inset regions, skeletons, and disabled structure |
| Control state | `bg-accent text-accent-foreground` for hover, active, and selected controls |
| Main action | `bg-primary text-primary-foreground hover:bg-primary/90` |
| State | Views may use `text-success`, `bg-success/10`, `text-destructive`, or `bg-destructive/10`; widgets use `text-foreground`. Add clear wording and, when useful, an icon or shape. |
| Object edge | `ring-1 ring-border` for complete container and control outlines |
| Focus | `focus-visible:ring-2 focus-visible:ring-ring` |
| Separator | A one-sided border such as `border-b border-border` between adjacent regions |
| Floating content | `bg-popover text-popover-foreground` for menus, tooltips, and popovers inside the applet scope |

Use `text-foreground` and `text-muted-foreground` together to create clear hierarchy. Keep every level comfortably readable and avoid letting muted text dominate the screen. Communicate meaning through wording, symbols, or shapes as well as color.

Use additional colors for meaningful data, imagery, brands, a content-linked visual accent, or an explicit user preference. Keep data mappings consistent and understandable. Derive custom tonal treatments from local tokens.

**Keep surface treatment restrained.** Use the shared radius scale and existing control shapes. Reserve `rounded-full` for pills, circles, avatars, and status dots; do not turn rectangular controls into capsules. For custom regions, use rings for complete outlines and one-sided borders for separators; avoid doubling them.

**Let texture support readability.** Texture is optional, limited to the root, and backed by an opaque semantic color. Available treatments are `texture-checker`, `texture-grid`, `texture-noise`, `texture-gradient-linear`, and `texture-inset-shadow`.

For dense root content, use plain `bg-background`, `texture-gradient-linear`, or `texture-inset-shadow`. Checker, grid, and noise may surround dense content only when it already needs an opaque work area. Choose a quieter texture before adding containers. Avoid stacking or tuning textures, and omit them behind full-bleed imagery or visualizations. Coordinate related widgets and views.

### Interaction and states

**Make every action usable.** Controls need clear names, comfortable targets, keyboard support, and visible focus. Charts need understandable labels or equivalent information. Preserve accessibility when simplifying the screen.

**Show the states the applet can reach.**

- **Loading:** preserve the expected content shape with a skeleton; use spinners for compact or shapeless work.
- **Empty:** explain the absence and offer a relevant next step when one exists.
- **Error:** explain the problem plainly and provide recovery.
- **Refreshing:** keep existing content visible and show progress near the refresh action.
- **Stale:** identify outdated information near the affected content.
- **Disabled:** keep the control recognizable and make its unavailability understandable.

Keep the main work surface in the same position and size as states change. Feedback must fit the applet’s available space.

Use brief, interruptible motion to explain changes or acknowledge input. Respect reduced motion, avoid looping decoration and animation on frequently changing numbers, and make audio and video user-initiated.

## Widgets

**Widgets support a quick glance or immediate action.** Choose the smallest footprint that presents the content clearly. Keep the main information prominent and supporting controls limited to the immediate task. Put tabs, deeper navigation, and multi-step work in a view. Keep hover feedback on controls; leave the widget surface unchanged.

The host owns the widget’s outer shape, clipping, and elevation. Its wrapper is transparent. Set an opaque background on the widget’s full-size root without adding another outer card.

The grid has four columns, 160 px rows, 8 px gaps, and a maximum width of 640 px. Widgets span one to four rows and columns. Width is flexible; height is fixed:

`rowSpan × 160 + (rowSpan − 1) × 8`

Fit content and reachable states within that height without accidental scrolling or clipped controls.

## Views

**Views support sustained work.** Each view represents one screen and owns its layout, padding, and scrolling. Establish clear context, a primary work area, and relevant actions. A title is useful when the content does not already establish context.

Prefer one main scroller. Add bounded internal scrolling only when independent scroll positions help the task. Internal tabs, filters, and master-detail layouts may organize the current task. Cross-screen navigation belongs to the workspace; do not add a client-side router.

## UI copy

Words appear in a design for one reason: to make it easier to understand and use. They are design
content, not decoration. Bring the same intentionality and minimalism to copywriting that you would
bring to spacing and color. Before writing anything, ask what the design needs to say, and how it can
best be said to help the person navigate the experience.

Write from the end user's perspective. Name things in simple language people understand, not by how
the system is built. Describe what something is or does in plain terms rather than selling it.
Prefer specific, clear wording over clever wording.

Use active voice by default. An action says exactly what will happen: "Save changes," not "Submit."
Keep the same action name through the whole flow, so a button labeled "Publish" produces a
confirmation that says "Published." Interface vocabulary helps people find their way around, and
consistency helps them learn it.

Treat failure and empty states as moments for direction, not mood. Explain what went wrong and how
to fix it in the interface's voice. Errors do not apologize, and they are never vague. An empty state
is an invitation to act.

Keep the tone conversational: plain verbs, sentence case, no filler. Let each written element do
exactly one job.

Omit terminal periods in headings, labels, metadata, and short standalone UI lines. Use sentence
punctuation for paragraphs or multiple complete sentences.

## Design slop

Design slop is a repeated visual shortcut that makes an interface feel generic or agent-made. Avoid decorative patterns added by habit instead of because they suit the content.

- **Decorative accent lines:** Do not place short colored lines, partial borders, or a single colored edge beside headings, prompts, or values as generic decoration. Choose a visual treatment connected to the content, or leave the area open.
- **SaaS card kit:** Use repeated cards when they represent a real repeated unit, such as comparable
  metrics, records, or actions. Avoid turning unrelated sections into identical rounded containers
  with the same radius, border, and shadow. Surface treatment should reflect hierarchy and function.
- **Template chrome:** Avoid stock decoration: all-caps eyebrows, middle-dot metadata,
  `LABEL — fragment` headings, monospace labels, and arrows on every action. Use these patterns only
  when they clarify hierarchy, state, or sequence.

## Final review

- **Focus:** Identify what people notice first and what they can do next. Reduce competing emphasis.
- **Subtract:** Temporarily remove secondary groups, helper copy, badges, icons, and wrappers. Restore an element when its absence creates a specific problem with the task, a decision, a state, or recovery. A single deliberate visual metaphor may remain when it gives the content recognizable character without adding copy, controls, or containers. Preserve useful content and accessible labels.
- **Deduplicate:** Read all visible copy together and compare meaning, not wording. When two elements communicate the same context or instruction, keep the clearer one closest to the relevant action.
- **Character:** Identify the applet’s visual idea. If it relies only on text and standard controls, consider one content-linked accent, metaphor, image, or expressive composition. Keep it subordinate to the main content.
- **Unify:** Compare text styles and control variants by role, then check their combined emphasis. Merge unnecessary differences in typography, color, spacing, and shape.
- **Contrast:** Check that contrast creates clear levels of emphasis and the screen does not feel washed out.
- **Verify:** Check realistic content, narrow widths, reachable states, keyboard use, and whether content that should fit requires scrolling. For widgets, also review how the result sits beside other applets.
