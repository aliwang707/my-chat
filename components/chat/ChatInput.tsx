'use client';
import { useRef } from 'react';

type Props = {
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  onSubmit: () => void;
  onCancel: () => void;
};

export const ChatInput = ({ input, setInput, loading, onSubmit, onCancel }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
      <div className="flex gap-2 sm:gap-3">
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(); } }} placeholder="输入消息..." disabled={loading} className="flex-1 border bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 rounded-full px-4 sm:px-5 py-2 sm:py-3 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label="消息输入框" />
        {loading ? (
          <button onClick={onCancel} className="bg-red-500 text-white font-semibold px-4 sm:px-8 py-2 sm:py-3 rounded-full hover:bg-red-600 whitespace-nowrap">取消</button>
        ) : (
          <button onClick={onSubmit} disabled={!input.trim()} className={`font-semibold px-4 sm:px-8 py-2 sm:py-3 rounded-full whitespace-nowrap ${!input.trim() ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>发送</button>
        )}
      </div>
    </div>
  );
};