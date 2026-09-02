'use client';
import { Message } from '@/hooks/useChatStream';
import { StreamingMarkdown } from './StreamingMarkdown';
import { EmptyState } from './ui/EmptyState';
import { TypingDots } from './ui/TypingDots';
import toast from 'react-hot-toast';

type Props = {
  messages: Message[];
  loadingMessages: boolean;
  loading: boolean;
  onSelectQuickQuestion: (q: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
};

export const MessageList = ({ messages, loadingMessages, loading, onSelectQuickQuestion, messagesEndRef }: Props) => {
  const copyToClipboard = async (content: string) => {
    try { await navigator.clipboard.writeText(content); toast.success('已复制到剪贴板'); }
    catch { toast.error('复制失败，请手动复制'); }
  };

  const getBubbleClass = (role: Message['role'], error?: boolean) => {
    if (role === 'user') {
      return 'bg-blue-600 text-white rounded-tr-sm';
    }
    if (role === 'system') {
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-tl-sm';
    }
    return 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm';
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 space-y-6" role="log" aria-live="polite" aria-label="聊天消息记录">
      {loadingMessages ? (
        <div className="flex justify-center py-8"><div className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-5 py-3 rounded-2xl animate-pulse">加载历史消息中...</div></div>
      ) : messages.length === 0 ? (
        <EmptyState onSelect={onSelectQuickQuestion} />
      ) : (
        messages.map(msg => (
          <div key={msg.id} className={`group flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0 text-sm mt-1">🤖</div>
            )}
            <div className={`
              rounded-2xl px-4 sm:px-5 py-3 
              max-w-[85%] sm:max-w-[75%]
              overflow-hidden
              wrap-break-word
              whitespace-pre-wrap
              ${getBubbleClass(msg.role, msg.error)}
              ${msg.error ? 'border border-red-300 dark:border-red-700' : ''}
            `}>
              <StreamingMarkdown content={msg.content} isStreaming={msg.isLoading} />
            </div>
            {/* 为 user 和 assistant 消息都添加复制按钮，但系统错误消息不复制 */}
            {msg.role !== 'system' && !msg.isLoading && !msg.error && (
              <button
                type="button"
                onClick={() => copyToClipboard(msg.content)}
                className="shrink-0 mt-1 p-1.5 rounded-lg bg-white/70 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-600 transition-opacity shadow-sm backdrop-blur-sm z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label="复制消息内容"
                title="复制"
              >
                📋
              </button>
            )}
          </div>
        ))
      )}
      {loading && <TypingDots />}
      <div ref={messagesEndRef} />
    </div>
  );
};