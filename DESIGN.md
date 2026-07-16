# moi main app design

This is the visual contract for the host app and its chrome. Workspace widget/view internals and generated applets use their workspace-local design guidance instead.

This file owns visual direction and semantic choices. Topic rules own syntax, `client/components/ui` owns component APIs and dimensions, and the theme CSS owns token values. Existing UI is inventory, not design precedent.

Generic design skills may help with usability and polish. They cannot introduce a new aesthetic, palette, type system, decoration style, or motion language. Project rules override generic shadcn advice: use installed components and ask before adding a missing primitive or variant.

## Visual Direction

moi is a local AI space. The host app should feel calm, precise, compact, and a little quirky. It is a serious tool, not a marketing page or visual showcase.

Prefer density with breathing room. Use readable logs, compact controls, quiet panel chrome, and clear interaction states. Personality should come from product-specific copy, icons, and small interaction moments. Avoid gradients, decorative blobs, oversized type, dramatic shadows, large empty hero layouts, and one-off visual systems.

Keep shapes tight and utilitarian. Use component-defined radii, with softer panels and dialogs. Reserve full rounding for pills and circular controls. Do not mix several radius families in one surface.

## Color and Typography

Use semantic color tokens by intent:

- `background` and `foreground` for the main app surface and primary content.
- `card` for intentionally framed surfaces and `popover` for floating UI.
- `primary` for the single most important action in a local region.
- `muted` for quiet structure or disabled fills and `muted-foreground` for secondary content.
- `accent` for hover, active, selection, and subtle highlights.
- `destructive` for destructive actions, invalid states, and errors.
- `border`, `input`, and `ring` for structure, controls, and focus.

Do not add raw color utilities, manual `dark:` colors, or `foreground` alpha fills. Use alpha only when the semantic token already has the correct role. Do not add, rename, or redefine tokens without explicit owner approval. If no token fits, use the closest semantic role and report the limitation.

Use `font-sans` for UI, including paths and ids. Reserve `font-mono` for code and fixed-width alignment. Keep titles modest and metadata quiet. Agents use only regular weight and medium for emphasis. Other weights are reserved for owner hand-tuning. Use `tabular-nums` where alignment matters.

## Layout and Hierarchy

Build hierarchy with type weight, spacing, tonal surfaces, and subtle shadow-defined edges. Use the Tailwind scale and component sizes instead of copying numeric geometry into feature code.

Use subtle shadows instead of borders for standalone contained blocks and outline-style controls. Keep nested elements flat unless they represent a separate contained object. For interactive elements, let the shadow become one step darker or deeper on hover using the existing shadow scale. Use CSS borders only for separators and hard structural boundaries.

Respect the layout variables in `client/index.css`; do not hardcode equivalent page or chat dimensions. Make layouts work at narrow and wide widths without clipped controls, overlapping text, or large dead areas.

Repeated rows must form stable lanes. Give leading icons, status markers, counters, and trailing actions fixed slots so changing content does not shift alignment. Keep component trees shallow and split components for state, data flow, repeated structure, or meaningful sub-surfaces.

Avoid cards inside cards. Page sections should usually be unframed regions, panels, or bordered rows. Use a framed surface only when it represents a real contained object, preview, dialog, or tool.

## Components and Accessibility

Check `client/components/ui` and existing feature components before writing styled native markup. Use installed primitives and their built-in variants. Component source is the authority for APIs, sizes, and composition.

If an atomic control is missing, stop and ask before adding a shadcn-style primitive or variant. Do not import an uninstalled component or hand-roll badges, tabs, segmented controls, selects, alerts, skeletons, empty states, and similar controls at the call site.

Use `Button` for normal actions and allow one primary action per local region. A specialized native control is acceptable when no primitive fits; keep it accessible and promote it if the pattern repeats.

Use the installed input and overlay primitives. Follow Base UI composition APIs instead of nesting interactive elements. Dialogs need a title, including visually hidden titles. Icon-only controls need an `aria-label` and a tooltip when the meaning is not obvious.

Cover the states the interaction can reach: focus, hover, disabled, loading, empty, and error. Do not hide a required state behind color alone. Errors should explain what happened and what the user can do next.

Prefer skeletons for loading content, lists, cards, and page regions so the pending layout resembles the result. Use spinners only for compact inline actions, very small blocks, or work with no meaningful content shape.

## Icons, Motion, and Copy

Use Tabler icons and follow `.agents/rules/icons.md`; it is the only source for icon sizes and strokes. Do not copy that matrix into feature docs or components.

Motion should explain a state or spatial change. Follow `.agents/rules/animations.md`. Keep feedback short, avoid decorative loops, and do not add custom keyframes.

Follow `.agents/rules/product-language.md` for casing, sentence case, terminology, tone, and action copy.

## Final Review

Before finishing host-app UI work, confirm:

- The change belongs to the host app and follows this visual direction.
- Existing components are reused; missing primitives received approval.
- Colors use the correct semantic roles and no tokens were invented.
- Rows stay aligned and the layout works at narrow and wide widths.
- Interactive and accessibility states are complete.
- Icons, motion, Tailwind, and TypeScript follow their owning rules.
- The markup is as simple as the behavior allows.
