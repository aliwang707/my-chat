import { Component, ReactNode } from 'react';

type Props = { onSelect: (text: string) => void };
export const EmptyState = ({ onSelect }: Props) => (
  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 mt-10">
    <div className="text-5xl">🤖</div>
    <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200">你好，我是你的 AI 助手</h2>
    <p className="text-gray-500 dark:text-gray-400 max-w-sm">可以问我任何问题，或试试：</p>
    <div className="flex flex-wrap gap-2 justify-center">
      {['帮我写代码', '解释概念', '翻译一段文字'].map(q => (
        <button key={q} onClick={() => onSelect(q)} className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">
          {q}
        </button>
      ))}
    </div>
  </div>
);