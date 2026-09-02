'use client';
import { memo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export const CodeBlock = memo(({ node, inline, className, children, isStreaming, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const codeContent = String(children).replace(/\n$/, '');

  // 流式输出时，代码块按纯文本渲染，避免半成品代码造成渲染异常
  if (isStreaming && !inline && match) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  // 非流式模式下使用高亮渲染
  if (!inline && match) {
    return (
      <div className="relative group/code my-4">
        <div className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100 transition-opacity">
          <button
            onClick={() => navigator.clipboard.writeText(codeContent)}
            className="px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
          >
            复制
          </button>
        </div>
        <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div">
          {codeContent}
        </SyntaxHighlighter>
      </div>
    );
  }

  // 行内代码
  return <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm" {...props}>{children}</code>;
});

CodeBlock.displayName = 'CodeBlock';