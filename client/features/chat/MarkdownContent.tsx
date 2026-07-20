import type { ComponentProps } from 'react'

import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

import { cn } from '@/client/lib/cn'

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

const components = {
  code({ className, children, ...props }: ComponentProps<'code'>) {
    return (
      <code
        className={cn(
          'rounded-[4px] bg-accent px-1 py-0.5 font-mono font-normal before:content-none after:content-none',
          className
        )}
        {...props}
      >
        {children}
      </code>
    )
  },
  pre({ children }: ComponentProps<'pre'>) {
    return (
      <div className="not-prose my-2 rounded-md border border-border bg-muted px-3 py-2.5">
        <pre className="max-h-[300px] overflow-auto font-mono text-xs leading-relaxed whitespace-pre text-foreground [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0">
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
