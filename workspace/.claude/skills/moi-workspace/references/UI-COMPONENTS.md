# UI components

Use bundled components for standard controls. They use Base UI, Tabler icons, and workspace
theme tokens. Follow [DESIGN.md](DESIGN.md) for visual decisions.

## Workflow

Run commands from the project root. Check what's available and installed, read the docs
before using or changing a component, then add all missing components in one call.

```sh
moi ui-components                                # catalog and installed state
moi ui-components docs select date-picker         # usage and examples
moi ui-components add select date-picker --install
moi bundle                                       # rebuild after editing applets
```

`add` copies source and support files into `.moi/ui/`. Source and docs work offline;
`--install` runs `bun install` in `.moi/` and may need network access. Without it, run the
dependency command printed by `add`. Rebuilding with `moi bundle` is always a separate step.

Recipes use the same `add` and `docs` commands. They install their building blocks;
follow the recipe docs to compose them.

## Imports

Use relative imports from applets and shared modules under `.moi/`:

```tsx
import { Button } from '../ui/button'
import { cn } from '../ui/utils'
import { IconSearch } from '@tabler/icons-react'
```

Adapt aliases in examples to relative imports. Applets cannot use `@/` aliases or import host
components. Use `moi ui-components` for installation; no `components.json` setup is needed.

## Composition

Use the anatomy and props in `moi ui-components docs <name>`. Inspect the installed source
when an example differs or a component has local edits; it defines the supported API.
Keep required groups, labels, and titles when composing parts.

Custom triggers and close controls use Base UI's `render` prop, not Radix's `asChild`:

```tsx
<DialogTrigger render={<Button variant="outline" />}>Open</DialogTrigger>
```

Don't nest buttons inside triggers. When `render` replaces a button with a non-button
element, also pass `nativeButton={false}`.

## Overlays

Use the installed portal and stacking behavior; don't add a second portal or z-index overrides.
`applet-portal.tsx` preserves applet styles for portalled content. Never edit or remove it.

Drawer is view-only and opens inside its view. Widgets must use another overlay or open a view.

## Styling and icons

- Use semantic theme tokens and built-in variants. Reserve `className` for layout;
  avoid overriding component colors or typography and adding manual `dark:` color overrides.
- Prefer default sizes. Use smaller controls when space calls for them, keeping neighboring
  controls consistent and comfortable to use.
- Prefer `gap-*` for spacing, `size-*` for equal width and height, and `truncate` for ellipsis.
- Use `cn()` from `../ui/utils` for conditional classes.
- Use Tabler icons with explicit `stroke` following [the icon guidance](DESIGN.md#icons).
  Let components size their icons; in buttons, mark position with
  `data-icon="inline-start"` or `data-icon="inline-end"`.
- Pass icons as component objects, such as `icon={IconSearch}`.

## Customization and updates

Use `moi theme` for workspace-wide appearance. When variants and layout props aren't enough,
edit the source in `.moi/ui/`; every importing applet gets the change. Put reusable compositions
in `_`-prefixed shared modules next to applets.

Existing files are skipped by `add`. Use `--force` only for an intended reinstall, after checking
local edits. Existing support files remain protected even with `--force`; request a dependency
component explicitly to update it.
