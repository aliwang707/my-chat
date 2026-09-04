// components/chat/StreamingMarkdown.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';

type Props = {
  content: string;
  isStreaming?: boolean;
};

// 清理工具
const cleanMarkdown = (text: string): string => {
  return text.replace(/>\s*>{2,}/g, '> ');
};

// ========== 复制函数（提取到组件外部，引用稳定） ==========
const copyCode = (code: string) => {
  navigator.clipboard.writeText(code).then(
    () => toast.success('代码已复制'),
    () => toast.error('复制失败，请手动复制')
  );
};

// ========== 子组件 ==========
type CodeBlockProps = {
  className?: string;
  children: React.ReactNode;
  isDarkMode: boolean;
  onCopy: (code: string) => void;
};

const CodeBlock = ({ className, children, isDarkMode, onCopy, ...rest }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');
  const style = isDarkMode ? oneDark : oneLight;

  if (match) {
    return (
      <div className="relative group my-2" {...rest}>
        <SyntaxHighlighter
          style={style}
          language={lang}
          PreTag="div"
          className="rounded-lg text-sm overflow-x-auto"
          wrapLongLines={false}
          showLineNumbers={false}
        >
          {codeString}
        </SyntaxHighlighter>
        <button
          type="button"
          onClick={() => onCopy(codeString)}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-white/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 shadow-sm"
          aria-label="复制代码"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
        </button>
      </div>
    );
  }
  return (
    <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-sm wrap-break-word" {...rest}>
      {children}
    </code>
  );
};

// 其他组件都接收任意 props，并透传
const PreBlock = (props: any) => {
  return <div className="overflow-x-auto my-2" {...props} />;
};

const Paragraph = (props: any) => {
  return <p className="mb-2 last:mb-0 wrap-break-word" {...props} />;
};

const MarkdownCodeBlock = ({ className, children, isDarkMode, onCopy, ...props }: any) => {
  const codeString = String(children).replace(/\n$/, '');
  const style = isDarkMode ? oneDark : oneLight;

  return (
    <CodeBlock className={className} isDarkMode={isDarkMode} onCopy={onCopy} {...props}>
      {codeString}
    </CodeBlock>
  );
};

const TableWrapper = (props: any) => {
  const { children, ...rest } = props;
  const hasValidRows = React.Children.toArray(children).some(
    (child: any) => child?.props?.children?.length > 0
  );
  if (!hasValidRows) {
    return <div className="my-2 text-gray-500 dark:text-gray-400">（表格格式异常，已转为纯文本）</div>;
  }
  return (
    <div className="overflow-x-auto my-3" {...rest}>
      <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
        {children}
      </table>
    </div>
  );
};

const TableHead = (props: any) => {
  return <thead className="bg-gray-100 dark:bg-gray-700" {...props} />;
};

const TableBody = (props: any) => {
  return <tbody className="divide-y divide-gray-200 dark:divide-gray-700" {...props} />;
};

const TableRow = (props: any) => {
  return <tr className="even:bg-gray-50 dark:even:bg-gray-800/50" {...props} />;
};

const TableHeader = (props: any) => {
  return (
    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left font-semibold" {...props} />
  );
};

const TableData = (props: any) => {
  return (
    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2" {...props} />
  );
};

const createMarkdownComponents = (isDarkMode: boolean, onCopy: (code: string) => void) => ({
  code: (props: any) => {
    const { children, ...rest } = props;
    return (
      <MarkdownCodeBlock
        className={props.className}
        isDarkMode={isDarkMode}
        onCopy={onCopy}
        {...rest}
      >
        {children}
      </MarkdownCodeBlock>
    );
  },
  pre: PreBlock,
  p: Paragraph,
  table: TableWrapper,
  thead: TableHead,
  tbody: TableBody,
  tr: TableRow,
  th: TableHeader,
  td: TableData,
});

// ========== 主组件 ==========
export const StreamingMarkdown = ({ content, isStreaming }: Props) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  useEffect(() => {
    setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);

  // 使用外部稳定的 copyCode，无需 useCallback
  const components = useMemo(
    () => createMarkdownComponents(isDarkMode, copyCode),
    [isDarkMode] // 只依赖 isDarkMode，copyCode 是外部常量，引用永远不变
  );

  const cleanedContent = cleanMarkdown(content);

  return (
    <div className="text-sm">
      <ReactMarkdown components={components} rehypePlugins={[rehypeRaw]}>
        {cleanedContent}
      </ReactMarkdown>
    </div>
  );
};