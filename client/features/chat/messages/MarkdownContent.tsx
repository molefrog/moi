import type { ComponentProps } from 'react'
import { useRouter } from 'wouter'

import ReactMarkdown, { defaultUrlTransform, type ExtraProps } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { resolveWorkspaceHref } from '@/lib/navigation'
import { cn } from '@/client/lib/cn'

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

const components = {
  code({ node: _node, className, children, ...props }: ComponentProps<'code'> & ExtraProps) {
    return (
      <code
        className={cn(
          'rounded-xs bg-accent px-1 py-0.5 font-mono font-normal before:content-none after:content-none',
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
      <div className="not-prose my-2 rounded-lg border border-border bg-accent px-3 py-2.5">
        <pre className="overflow-auto font-mono text-xs leading-relaxed whitespace-pre text-foreground [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0">
          {children}
        </pre>
      </div>
    )
  }
}

type MarkdownContentProps = {
  // 'xs' fits markdown inside compact surfaces such as tool output.
  size?: 'sm' | 'xs'
  content: string
}

type PlainMarkdownTextProps = {
  content: string
}

export function MarkdownContent({ size = 'sm', content }: MarkdownContentProps) {
  const workspaceId = useWorkspaceId()
  const { base } = useRouter()
  return (
    <div
      className={cn(
        'prose max-w-full min-w-0 wrap-anywhere prose-inherit',
        size === 'sm' && 'prose-sm',
        size === 'xs' && 'prose-sm text-xs leading-relaxed'
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={(url, key, node) => {
          if (node.tagName === 'a' && key === 'href' && url.startsWith('moi:')) {
            try {
              return resolveWorkspaceHref(workspaceId, url, base)
            } catch {
              return ''
            }
          }
          return defaultUrlTransform(url)
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function PlainMarkdownText({ content }: PlainMarkdownTextProps) {
  return (
    <ReactMarkdown allowedElements={[]} skipHtml unwrapDisallowed>
      {content}
    </ReactMarkdown>
  )
}
