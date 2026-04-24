import type { ComponentProps } from 'react'

import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

import { cn } from '@/client/lib/cn'

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

const components = {
  pre({ children }: ComponentProps<'pre'>) {
    return (
      <div className="not-prose border-border bg-muted my-2 rounded-md border px-3 py-2.5">
        <pre className="text-foreground/80 max-h-[300px] overflow-auto whitespace-pre font-mono text-xs leading-relaxed">
          {children}
        </pre>
      </div>
    )
  }
}

type MarkdownContentProps = {
  size?: 'sm'
  content: string
}

export function MarkdownContent({ size = 'sm', content }: MarkdownContentProps) {
  return (
    <div className={cn('prose prose-inherit', size === 'sm' && 'prose-sm')}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
