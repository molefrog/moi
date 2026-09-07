# Icons

**Use Tabler in components and documentation examples.** Set `iconLibrary` to `tabler` and import `Icon`-prefixed names from `@tabler/icons-react`. Set an explicit `stroke` following the [project icon rules](../../../rules/icons.md).

---

## Icons in Button use data-icon attribute

Add `data-icon="inline-start"` (prefix) or `data-icon="inline-end"` (suffix) to the icon. No sizing classes on the icon.

**Incorrect:**

```tsx
<Button>
  <IconSearch stroke={1.5} className="mr-2 size-4" />
  Search
</Button>
```

**Correct:**

```tsx
<Button>
  <IconSearch stroke={1.5} data-icon="inline-start"/>
  Search
</Button>

<Button>
  Next
  <IconArrowRight stroke={1.5} data-icon="inline-end"/>
</Button>
```

---

## No sizing classes on icons inside components

Components handle icon sizing via CSS. Don't add `size-4`, `w-4 h-4`, or other sizing classes to icons inside `Button`, `DropdownMenuItem`, `Alert`, `Sidebar*`, or other shadcn components. Unless the user explicitly asks for custom icon sizes.

**Incorrect:**

```tsx
<Button>
  <IconSearch stroke={1.5} className="size-4" data-icon="inline-start" />
  Search
</Button>

<DropdownMenuItem>
  <IconSettings stroke={1.75} className="mr-2 size-4" />
  Settings
</DropdownMenuItem>
```

**Correct:**

```tsx
<Button>
  <IconSearch stroke={1.5} data-icon="inline-start" />
  Search
</Button>

<DropdownMenuItem>
  <IconSettings stroke={1.75} />
  Settings
</DropdownMenuItem>
```

---

## Pass icons as component objects, not string keys

Use `icon={IconCheck}`, not a string key to a lookup map.

**Incorrect:**

```tsx
const iconMap = {
  check: IconCheck,
  alert: IconAlertCircle,
}

function StatusBadge({ icon }: { icon: string }) {
  const Icon = iconMap[icon]
  return <Icon stroke={1.5} />
}

<StatusBadge icon="check" />
```

**Correct:**

```tsx
import { IconCheck } from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'

type StatusBadgeProps = { icon: TablerIcon }

function StatusBadge({ icon: Icon }: StatusBadgeProps) {
  return <Icon stroke={1.5} />
}

<StatusBadge icon={IconCheck} />
```
