# Moi applet design

Applets should feel useful, clear, and at home in the workspace.

This guide is the highest-priority visual contract for widgets and views inside a Moi workspace. Follow generic design guidance only where it agrees with this guide.

## Design principles

### Focus on the task

Decide what people need to understand and do before choosing how the screen should look. Include only the information and controls that serve that task. Relevant source context can inform the work without becoming a field, section, or feature. Available space is not a reason to add content. A sparse screen can be complete.

Lead with what people came for and make the next action obvious. Individually useful elements can still compete or repeat one another, so consolidate related information and give supporting content less emphasis.

### Start with one useful workflow

For a new view, build the smallest complete workflow that helps the user do something useful. Include what that workflow needs to work end to end. Add secondary workflows, configuration, reporting, and extra ways to organize things as the user asks for them.

### Use progressive disclosure

Keep essential information and frequent actions visible. Reveal supporting details when the user selects an item or chooses a clearly named action, and show editing controls when they choose to edit. Keep those entry points easy to find and preserve context when opening and closing details. Don't hide the main task behind clicks or build speculative features just to tuck them into accordions.

### Give expression a purpose

Use typography, composition, color, imagery, texture, or a small content-linked metaphor to give the applet character. A visual detail may support the subject or mood without carrying data or enabling an action. Keep the treatment focused so the content remains easy to scan.

## Layout

**Group through spacing and alignment.** Start with an open layout. Add a divider only when adjacent regions need a visible boundary. Use surfaces only for interactive objects, independent scrolling regions, distinct states, or a dedicated work area. Keep ordinary headings, tabs, summaries, metrics, and sections unboxed. Avoid large rounded page frames and nested cards.

**Keep a consistent rhythm.** Use a 4 px spacing rhythm, with smaller gaps inside groups and larger gaps between them. Apply outer padding once. Align repeated values and actions so content changes do not move them around. When removing a container, remove its unnecessary padding and radius and realign its contents.

**Size to the content.** Use natural height for simple tasks and extra space for tables, boards, canvases, and other work areas that benefit from it. Don't stretch content to fill the frame. Adapt to narrow widths, long content, and chat sharing the workspace.

## Shared system

### Typography

**Use a small, consistent set of styles.** Establish clear roles for headings, ordinary content, and supporting information. Text with the same role and importance shares the same typography.

Inherit the workspace font. Use regular weight for most text and medium for emphasis, including focal prompts or values when weight helps establish hierarchy. Reserve other weights for explicit user customization.

**Choose readable defaults.** Use `text-sm` for controls and general UI, and `text-base` for focused content when space allows. Sizes below `text-sm` should be rare, limited to unusually tight controls. Use larger text for headings or a focal value.

Reserve `font-mono` for code, commands, and code-like identifiers. Numeric values, measurements, percentages, timers, timestamps, prices, counts, labels, keyboard shortcuts, and key names use the workspace font. Add `tabular-nums` when stable widths or alignment help.

### Controls

Use [bundled components](UI-COMPONENTS.md) with their existing variants, sizes, and shapes. Controls with the same role and importance share component variants. Keep feedback near the action that caused it.

### Icons

Use Tabler icons when they clarify meaning, identify a familiar action, or reinforce a focused visual metaphor. Avoid adding an icon to every label or control. Set stroke explicitly: `1.75` at 12–16 px and `1.5` at 20–24 px. Let components control icon size when provided.

### Color and surfaces

Use semantic tokens and their matching foregrounds. The default root is `h-full w-full bg-background text-foreground`.

For widgets, the host sets the `background` token to the workspace’s `primary`, supplies a readable `foreground`, and derives a light local `primary` action surface. The host wrapper is transparent: each widget must paint its own opaque root, normally with `bg-background`, or provide an opaque fallback behind full-bleed media. Views inherit the page theme.

| Intent | Classes |
| --- | --- |
| Main content | `text-foreground` |
| Supporting content | `text-muted-foreground` |
| Inset surface | `bg-card text-card-foreground` |
| Quiet fill | `bg-muted` for inset regions, skeletons, and disabled structure |
| Control state | `bg-accent text-accent-foreground` for hover, active, and selected controls |
| Main action | `bg-primary text-primary-foreground hover:bg-primary/90` |
| State | `text-success`, `bg-success/10`, `text-destructive`, or `bg-destructive/10` in views; `text-foreground` in widgets |
| Object edge | `ring-1 ring-border` for complete container and control outlines |
| Separator | A one-sided border such as `border-b border-border`, never doubled with a ring |
| Focus | `focus-visible:ring-2 focus-visible:ring-ring` |
| Floating content | `bg-popover text-popover-foreground` for menus, tooltips, and popovers inside the applet scope |

Keep every text level comfortably readable and don't let muted text dominate the screen. Communicate meaning through wording, symbols, or shapes as well as color.

Use additional colors for meaningful data, imagery, brands, a content-linked visual accent, or an explicit user preference. Keep data mappings consistent and understandable. Derive custom tonal treatments from local tokens.

Use the shared radius scale and existing control shapes. Reserve `rounded-full` for pills, circles, avatars, and status dots; do not turn rectangular controls into capsules.

### Texture

Texture is optional, limited to the root, and backed by an opaque semantic color: `texture-checker`, `texture-grid`, `texture-noise`, `texture-gradient-linear`, or `texture-inset-shadow`.

Behind dense content, use plain `bg-background`, `texture-gradient-linear`, or `texture-inset-shadow`; checker, grid, and noise may only surround an opaque work area. Never stack or tune textures, or put them behind full-bleed media. Coordinate related widgets and views.

### Interaction and states

**Make every action usable.** Controls need clear names, comfortable targets, keyboard support, and visible focus. Charts need understandable labels or equivalent information.

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

The host owns the widget’s outer shape, clipping, and elevation. Do not add another outer card.

The grid has four columns, 160 px rows, 8 px gaps, and a maximum width of 640 px. Widgets span one to four rows and columns. Width is flexible; height is fixed:

`rowSpan × 160 + (rowSpan − 1) × 8`

Fit content and reachable states within that height without accidental scrolling or clipped controls.

## Views

**Views support sustained work.** Each view represents one screen and owns its layout, padding, and scrolling. Establish clear context, a primary work area, and relevant actions. A title is useful when the content does not already establish context.

Prefer one main scroller. When everything fits comfortably, keep essential information and actions within one viewport. Avoid horizontal page scrolling; wide content may scroll within its own bounded region. Add bounded internal scrolling only when independent scroll positions help the task.

Internal tabs, filters, and master-detail layouts may organize the current task. Cross-screen navigation belongs to the workspace; do not add a client-side router.

## UI copy

Write from the end user's perspective. Name things in simple language people understand, not by how the system is built. Describe what something is or does in plain terms rather than selling it. Prefer specific, clear wording over clever wording.

Use active voice by default. An action says exactly what will happen: "Save changes," not "Submit." Keep the same action name through the whole flow, so a button labeled "Publish" produces a confirmation that says "Published."

For failure and empty states, follow [Interaction and states](#interaction-and-states). Keep the wording specific and use the interface's voice. Errors do not apologize.

Use plain verbs, sentence case, and no filler. Let each written element do exactly one job. Omit terminal periods in headings, labels, metadata, and short standalone UI lines. Use sentence punctuation for paragraphs or multiple complete sentences.

## Design slop

Design slop is a repeated visual shortcut that makes an interface feel generic or agent-made. Avoid decorative patterns added by habit instead of because they suit the content.

- **Decorative accent lines:** Do not place short colored lines, partial borders, or a single colored edge beside headings, prompts, or values as generic decoration. Choose a visual treatment connected to the content, or leave the area open.
- **SaaS card kit:** Use repeated cards when they represent a real repeated unit, such as comparable metrics, records, or actions. Avoid turning unrelated sections into identical rounded containers with the same radius, border, and shadow.
- **Template chrome:** Avoid stock decoration: all-caps eyebrows, middle-dot metadata, `LABEL — fragment` headings, monospace labels, and arrows on every action. Use these patterns only when they clarify hierarchy, state, or sequence.

## Final check

- **First use:** Can someone tell what the screen is for and complete its main workflow? Check what they notice first and what they can do next.
- **Subtract:** Temporarily remove secondary groups, helper copy, badges, icons, and wrappers. Restore only what the task, a decision, a state, or recovery needs. Preserve accessible labels.
- **Deduplicate:** When two elements communicate the same thing, keep the clearer one closest to the relevant action.
- **Contrast:** Check that emphasis levels are clear and the screen does not feel washed out.
- **Verify:** Check realistic content, narrow widths, reachable states, keyboard use, and unintended scrolling. For widgets, also check how the result sits beside other applets.
