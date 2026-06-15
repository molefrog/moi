import { useMemo } from 'react'

import { highlight } from 'sugar-high'

import { cn } from '@/client/lib/cn'

type CodeBlockProps = { code: string; className?: string }

// sugar-high colors each token with `style="color:var(--sh-*)"`, so a theme is
// just these CSS vars on an ancestor. Muted palette tuned for the light
// `bg-muted` output box. Set once via Tailwind arbitrary properties.
const SH_THEME = cn(
  '[--sh-identifier:#1f2937]',
  '[--sh-keyword:#cf222e]',
  '[--sh-string:#16a34a]',
  '[--sh-class:#2d6e7e]',
  '[--sh-property:#0550ae]',
  '[--sh-entity:#6f42c1]',
  '[--sh-jsxliterals:#6f42c1]',
  '[--sh-sign:#8b949e]',
  '[--sh-comment:#9ca3af]'
)

// Lightweight syntax highlight via sugar-high (~1KB, no language config). The
// tokenize pass is pure, so memoize on `code` — it only re-runs when the source
// changes, and the component only mounts while the row is expanded.
export function CodeBlock({ code, className }: CodeBlockProps) {
  const html = useMemo(() => highlight(code), [code])
  return (
    <pre
      className={cn(
        'overflow-auto font-mono text-xs leading-relaxed whitespace-pre',
        SH_THEME,
        className
      )}
    >
      {/* sugar-high escapes token text, so this HTML is safe to inject. */}
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}
