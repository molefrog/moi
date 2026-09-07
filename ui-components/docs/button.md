---
title: Button
description: The shared button for moi and its views.
---

## Add

```sh
moi ui-components add button
```

## Usage

```tsx
import { Button } from '../ui/button'

export function Example() {
  return <Button variant="outline">Open</Button>
}
```

Variants: `default`, `secondary`, `outline`, `ghost`, and `destructive`.

Sizes: `xs`, `sm`, `default`, `lg`, `icon-xs`, `icon-sm`, `icon`, and `icon-lg`.

Mark inline icons with `data-icon="inline-start"` or `data-icon="inline-end"`. Use `buttonVariants` when another element needs the same styles. Use Base UI's `render` prop to render a link or another element.
