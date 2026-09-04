# UI components

Components use Base UI, Tabler icons, and workspace theme tokens. Their source and docs
are bundled with moi and work offline.

## Workflow

Run these commands from the project root. Read the docs before composing an unfamiliar
component, and pass all needed names in one `add` call.

```sh
moi ui-components                                # catalog and installed state
moi ui-components docs select date-picker         # usage and examples
moi ui-components add select date-picker --install
moi bundle                                       # rebuild after editing applets
```

`add` copies source into `.moi/ui/` and includes component dependencies. `--install` runs
`bun install` in `.moi/` for npm dependencies; this may need network access. Without it,
run the dependency command printed by `add`. If a package is missing in an older workspace,
check `.moi/package.json` and install it there.

Recipes such as `date-picker` and `data-table` use the same `add` and `docs` commands.
They install their building blocks; compose those using the recipe docs.

Files in `.moi/ui/` are shared by every applet that imports them. Existing requested files
are skipped unless you pass `--force`. Existing support files stay untouched even with
`--force`; request a dependency component explicitly when you want to update it.

## Imports

Use relative imports from applets and shared modules under `.moi/`:

```tsx
import { Button } from '../ui/button'
import { cn } from '../ui/utils'
import { IconSearch } from '@tabler/icons-react'
```

Adapt `@/components/ui/...` and utility aliases in bundled examples to these local imports.
Applets cannot import host components or use `@/` aliases.

## Composition

Custom triggers and close controls use Base UI's `render` prop:

```tsx
<DialogTrigger render={<Button variant="outline" />}>Open</DialogTrigger>
```

When rendering a button as a non-button element, pass `nativeButton={false}`:

```tsx
<Button render={<a href="/docs" />} nativeButton={false}>Read the docs</Button>
```

- Keep select and menu items and labels inside their matching Group component.
- Give every dialog, alert dialog, and drawer its matching Title component.
  Use `className="sr-only"` when the title should be visually hidden.
- Build forms with `FieldGroup` and `Field`; use `FieldSet` and `FieldLegend` for grouped controls.
- Put `data-invalid` on Field and `aria-invalid` on its control. For disabled fields, use
  `data-disabled` on Field and `disabled` on the control.
- Inside `InputGroup`, use `InputGroupInput` or `InputGroupTextarea`, with addons for buttons.

## Overlays

Overlay components include `AppletPortal` to preserve applet styles when they portal outside
the applet. Leave `applet-portal.tsx` in place and unchanged. Use the installed overlay parts
and their built-in stacking.

Drawer is view-only and opens inside the current view. Put growing content in `DrawerBody`.
From widgets, use a popover, dialog, or `focusTab` to open a view.

## Styling and icons

- Use workspace theme tokens and built-in variants. Reserve `className` for layout.
- Prefer the default component size. Use smaller sizes when space calls for them, keeping
  neighboring controls consistent and comfortable to use.
- Use `cn()` from `../ui/utils` for conditional classes.
- Use Tabler icons. In buttons, mark their position with `data-icon="inline-start"` or
  `data-icon="inline-end"`; let the component size them.
- Pass icons as component objects, such as `icon={IconSearch}`.
