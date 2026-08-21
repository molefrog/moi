# UI components cheat sheet

`moi ui-components` installs standard controls from the shadcn registry, pre-tuned for moi
applets: **Base UI** primitives, **Tabler** icons, workspace theme tokens, relative imports, and
overlays patched so applet styling survives portalling. Components land in `.moi/ui/` as plain
source files you own.

This file is the catalog plus the essential usage rules (condensed from the official shadcn
skill). Read it once; fetch full per-component docs with `moi ui-components docs <name>` **before
composing a component you haven't used in this workspace** — the parts API is Base UI, not the
Radix-era shadcn you may know.

## Workflow

```sh
moi ui-components                  # catalog + what's installed
moi ui-components add select      # → .moi/ui/select.tsx (+ any support files)
moi ui-components docs select     # official docs as markdown
bun install <deps>                # in .moi/ — only when `add` prints extra deps
moi bundle                        # rebuild applets
```

```tsx
// In an applet — always relative, never @/ aliases, never the host app's components:
import { Button } from '../ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
```

- `add` writes source files and nothing else — installing the deps it prints and rebuilding is
  your job.
- **If the build fails on a missing package** (happens in workspaces scaffolded before this
  feature — `.moi/package.json` may lack the deps ui components need): check
  `.moi/package.json` and install what's missing. Every ui component needs the baseline

  ```sh
  bun install @base-ui/react class-variance-authority clsx tailwind-merge
  ```

  (run in `.moi/`), plus whatever `add` printed for the specific component (`recharts`,
  `embla-carousel-react`, `react-day-picker` + `date-fns`, `react-resizable-panels`,
  `@tanstack/react-table`).
- Files in `.moi/ui/` are yours to customize; `add` refuses to overwrite them without `--force`.
- Support files appear without being asked for (`utils.ts` with `cn`, `applet-portal.tsx`, and
  registry dependencies like `separator`, `card`, `toggle`) — normal; use them if handy.
  `applet-portal.tsx` is auto-generated machinery: never edit or remove it.

## Catalog

Import from `../ui/<name>` (same as the component name).

**Form & input:** `button` (variants, sizes, icons) · `button-group` (segmented buttons) ·
`input` · `textarea` · `input-group` (input with addons) · `field` (label + control +
description + error) · `label` · `checkbox` · `radio-group` · `switch` · `slider` · `select` ·
`combobox` (type-to-filter for long lists) · `toggle-group` (2–7 option sets) · `calendar` ·
`date-picker` (pattern: calendar in a popover — see its docs; installs `calendar` + `popover` +
`button`)

**Overlays (portal-patched):** `dialog` · `alert-dialog` (destructive confirm) · `popover` ·
`dropdown-menu` · `context-menu` (right-click) · `hover-card` · `tooltip`

**Display & feedback:** `alert` (callouts) · `badge` · `avatar` · `skeleton` · `spinner` ·
`progress` · `table` · `data-table` (pattern on `table` + `@tanstack/react-table` — see its
docs) · `chart` (Recharts wired to theme tokens) · `attachment` (file/image tile) · `bubble`
(chat message)

**Structure & navigation:** `accordion` · `collapsible` · `tabs` · `carousel` · `pagination` ·
`resizable` (split panels)

Picking one: quick info on hover → `hover-card` or `tooltip` · contextual panel on click →
`popover` · focused task needing input → `dialog` · destructive confirmation → `alert-dialog` ·
option sets of 2–7 → `toggle-group` · long searchable lists → `combobox` · boolean setting →
`switch`, boolean in a form → `checkbox`.

## Composition rules

- **Custom triggers use the `render` prop** — this is Base UI, there is no `asChild`. Never wrap
  a trigger in an extra element. Applies to every Trigger and Close part (`DialogTrigger`,
  `PopoverTrigger`, `DropdownMenuTrigger`, `TooltipTrigger`, `CollapsibleTrigger`,
  `DialogClose`, …).

  ```tsx
  <DialogTrigger render={<Button variant="outline" />}>Open</DialogTrigger>
  ```

- **`render` to a non-button element needs `nativeButton={false}`:**

  ```tsx
  <Button render={<a href="/docs" />} nativeButton={false}>Read the docs</Button>
  ```

- **Items always live inside their Group**: `SelectItem`/`SelectLabel` → `SelectGroup`;
  `DropdownMenuItem`/`DropdownMenuLabel`/`DropdownMenuSub` → `DropdownMenuGroup`;
  `ContextMenuItem` → `ContextMenuGroup`. A Label outside its Group **crashes the component at
  runtime** (Base UI requires the group context); keep items grouped too.
- **`Dialog` and `AlertDialog` always need a Title** (`DialogTitle` — use
  `className="sr-only"` to hide it visually).
- **`TabsTrigger` must be inside `TabsList`**, never directly in `Tabs`.
- **`Avatar` always needs `AvatarFallback`** for when the image fails.
- **Button has no `isLoading`** — compose: `<Button disabled><Spinner data-icon="inline-start" />Saving…</Button>`.
- **Use components, not custom markup**: callout → `Alert` (+`AlertTitle`/`AlertDescription`),
  loading placeholder → `Skeleton` (no custom `animate-pulse` divs), status chip → `Badge` (no
  styled spans), divider → `Separator` (no `<hr>`/border divs), inline loading → `Spinner`.

## Base UI API gotchas

The biggest source of bugs when you know Radix-era shadcn. When unsure, `moi ui-components docs
<name>` has the real API.

- **Select needs an `items` prop on the root**; the placeholder is a `{ value: null }` item, not
  a `placeholder` prop:

  ```tsx
  const items = [
    { label: 'Pick a fruit', value: null },
    { label: 'Apple', value: 'apple' },
  ]
  <Select items={items}>
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectGroup>
        {items.map(item => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
  ```

  Extras: `multiple` + render-function `SelectValue` for multi-select; `itemToStringValue` for
  object values; `alignItemWithTrigger={false}` to position like a plain dropdown.
- **ToggleGroup**: no `type` prop — single-select by default, `multiple` for multi; `value`/
  `defaultValue` is **always an array** (`defaultValue={["daily"]}`; controlled single value:
  `value={[value]} onValueChange={v => setValue(v[0])}`).
- **Slider**: plain number for one thumb (`defaultValue={50}`), array only for ranges.
- **Accordion**: no `type`/`collapsible` props — `defaultValue` is **always an array**
  (`defaultValue={["item-1"]}`), `multiple` to allow several open.

## Forms

- Lay out forms with `FieldGroup` + `Field` — never raw `div`s with spacing utilities:

  ```tsx
  <FieldGroup>
    <Field>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input id="email" type="email" />
      <FieldDescription>Work email preferred.</FieldDescription>
    </Field>
  </FieldGroup>
  ```

  `Field orientation="horizontal"` for settings rows; `FieldSet` + `FieldLegend` for groups of
  related checkboxes/radios/switches.
- **Validation and disabled need both attributes**: `data-invalid` on `Field` + `aria-invalid`
  on the control; `data-disabled` on `Field` + `disabled` on the control.
- **Inside `InputGroup`, use `InputGroupInput`/`InputGroupTextarea`** — never raw
  `Input`/`Textarea`. A button attached to an input is `InputGroup` + `InputGroupAddon`, never
  absolute positioning over an `Input`.
- **2–7 exclusive options → `ToggleGroup`**, not a loop of `Button`s with manual active state.
- Control chooser: free text → `input`/`textarea` · predefined options → `select` · searchable →
  `combobox` · boolean setting → `switch` · boolean consent → `checkbox` · one-of-few →
  `radio-group` · numeric range → `slider`.

## Styling

- **Semantic tokens only, never raw colors**: `bg-primary`, `text-muted-foreground`,
  `text-destructive`, `bg-popover` — not `bg-blue-500` or `text-emerald-600`. Every token pairs
  `name`/`name-foreground` (background / text-on-it): `background`, `card`, `popover`,
  `primary`, `secondary`, `muted`, `accent`, `destructive`, plus `border`, `input`, `ring`,
  `chart-1…5`, and `--radius`. Status colors come from `Badge` variants or `text-destructive`.
- **Built-in variants before custom classes**: `variant="outline"`, `size="sm"` — not
  hand-rolled border/bg utilities on `Button`.
- **Prefer each component's default size.** Use smaller variants such as `sm` or `xs` only when a
  real density constraint calls for them and the reduced control remains comfortable to use. When
  using a non-default size, compare it with neighboring controls. Controls in the same group must
  have matching heights and compatible visual weight.
- **`className` is for layout** (`max-w-md`, `mt-4`, `w-full`) — never for overriding a
  component's colors or typography.
- **`gap-*`, not `space-x-*`/`space-y-*`** (`flex flex-col gap-4`). **`size-10`, not
  `w-10 h-10`.** **`truncate`**, not the three-class spell.
- **`cn()` from `../ui/utils` for conditional classes** — no template-literal ternaries.
- **No manual `z-index` on overlays** — dialog/popover/menu/tooltip handle their own stacking.

## Icons

- Tabler only: `import { IconSearch } from '@tabler/icons-react'` — every name is
  `Icon`-prefixed. Installed components already come converted.
- In a `Button`, mark position with `data-icon="inline-start"` / `"inline-end"`; **no sizing
  classes on icons inside components** (Button, DropdownMenuItem, Alert size them via CSS).
- Pass icons as component objects (`icon={IconCheck}`), never as string keys into a lookup map.

## Customization

Cheapest first — stop at the first level that works:

1. **Workspace theme** (`moi theme`) — fonts, colors, radius flow into every component through
   tokens.
2. **Built-in variants + `className` layout** at the callsite (merges correctly via `cn`).
3. **Edit the file in `.moi/ui/`** — e.g. add a `cva` variant to `button.tsx`; propagates to
   every applet using it, and `add` won't overwrite it without `--force`.
4. **Wrapper components** — compose primitives into app-level pieces (a `ConfirmDialog` wrapping
   `AlertDialog` parts) in `.moi/widgets/_shared.tsx`-style files.

## Fit within applets

- **Widgets** are small: keep the composition compact, the number of controls low, and enough room
  around each action. Keep interactions inline and self-contained; avoid layered UI such as
  popovers and tooltips. Page-scale chrome (sidebars, nav menus, sheets, toasts) is deliberately not
  in the set — widgets don't need it, and a view's chrome should be custom (see
  `references/DESIGN.md`).
- **Views** can use the full set, including `resizable` layouts and `data-table`.
- Overlays portal to `document.body` on purpose (they escape the widget frame's clipping); the
  installed portal patch keeps your applet's styling working inside them. Theme note: portalled
  content reads theme tokens from the app root, not the widget frame — with the default theme
  they match; if a popup looks off-theme in a heavily themed workspace, that's why.
