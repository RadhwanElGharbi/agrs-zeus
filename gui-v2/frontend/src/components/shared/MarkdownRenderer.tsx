import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-xs dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({node, ...props}) => (
            <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" />
          ),
          h1: ({node, ...props}) => <h1 {...props} className="text-xl font-bold mb-4 mt-6 text-primary" />,
          h2: ({node, ...props}) => <h2 {...props} className="text-lg font-semibold mb-3 mt-5 border-b border-border pb-1" />,
          h3: ({node, ...props}) => <h3 {...props} className="text-base font-medium mb-2 mt-4 text-foreground/90" />,
          ul: ({node, ...props}) => <ul {...props} className="list-disc pl-5 space-y-1 my-2" />,
          ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-5 space-y-1 my-2" />,
          li: ({node, ...props}) => <li {...props} className="pl-1" />,
          p: ({node, ...props}) => <p {...props} className="mb-2 leading-relaxed text-muted-foreground" />,
          strong: ({node, ...props}) => <strong {...props} className="font-semibold text-foreground" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

