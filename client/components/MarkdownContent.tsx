import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'

import { cn } from '@/client/lib/cn'

const rehypePlugins = [rehypeHighlight]

type MarkdownContentProps = {
  size?: 'sm'
  content: string
}

export function MarkdownContent({ size = 'sm', content }: MarkdownContentProps) {
  return (
    <div className={cn('prose prose-inherit', size === 'sm' && 'prose-sm')}>
      <ReactMarkdown rehypePlugins={rehypePlugins}>{content}</ReactMarkdown>
    </div>
  )
}
