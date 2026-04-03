This directory contains widgets — small React components that appear in the UI.
No subdirectories.

Folder structure
```
mei/
  cmd              executable — runs CLI commands (e.g. ./cmd bundle)
  package.json     dependencies for widgets (bun install here if needed)
  :name.tsx        widget source
  :name.server.ts  server functions (optional, paired with a widget)
  .build/          compiled output (don't edit, auto-generated)
  README.md        this file
```

## Writing a widget

Create a `.tsx` file with a default export:

```tsx
// counter.tsx
import { useState } from 'react'

export default function Counter() {
  const [n, setN] = useState(0)

  return (
    <div className="flex items-center gap-2 p-4">
      <span className="text-lg font-bold">{n}</span>
      <button
        onClick={() => setN(n + 1)}
        className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
      >
        +1
      </button>
    </div>
  )
}
```

- Use React (hooks, JSX — all standard)
- Use Tailwind classes for styling
- React is external — don't install it, just import it
- Imports: widgets are self-contained, so when importing TSX/JSX modules you can only import them from 
  the same folder OR packages available in `mei/package.json`. Hence, no `@/` imports allowed.

After writing/editing/deleting a widget/widgets, run `./cmd bundle`. Everything will be rebundled
and automatically updated in the UI (no page reload needed).

### Defining widget configuration
Widget can export `config` object to define it's metadata, e.g. how it will look in the layout.

```tsx
export const config = { 
  rowSpan: 1, // how many rows widget occupies on the grid (def: 1)
  colSpan: 1  // how many cols widget occupies on the grid (def: 1)
} as const
```

## Server functions

If a widget needs server-side logic (read files, call APIs with secrets, access databases),
create a `.server.ts` file with the same name:

```ts
// weather.server.ts
export async function getWeather(city: string) {
  const key = process.env.WEATHER_API_KEY
  const res = await fetch(`https://api.weather.com/${city}?key=${key}`)
  return res.json()
}
```

Import it from the widget as a regular module:

```tsx
// weather.tsx
import { getWeather } from './weather.server'

export default function Weather() {
  // getWeather() is async — it calls the server behind the scenes
  // ...
}
```

Rules for `.server.ts`:
- Every export must be an `async function` (not const, not sync, not class)
- The function runs on the server in Bun — it has access to `process.env`, filesystem, etc.
- ALWAYS PREFER Bun APIs, including S3, SQLite, Redis, importing MD, JSON etc.
- Refer to Bun docs if needed https://bun.com/docs
- You **ARE ALLOWED** to access files in the workspace, i.e. outside the `mei` folder in the workspace,
  for example importing a SQLite db from `../db.sqlite`
- Arguments and return values are serialized automatically (supports Date, Map, Set, etc.)
