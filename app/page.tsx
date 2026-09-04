'use client';
import { SignInButton, useUser } from '@clerk/nextjs';
import { useEffect, useState, useCallback } from 'react';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useSessions } from '@/hooks/useSessions';
import { useChatStream, Message } from '@/hooks/useChatStream';
import { ChatErrorBoundary } from '@/components/chat/ChatErrorBoundary';
import { Sidebar } from '@/components/chat/Sidebar';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { DeleteConfirmModal } from '@/components/chat/ui/DeleteConfirmModal';

export default function Home() {
  const { isDark, toggleDarkMode } = useDarkMode();
  const { isSignedIn, user } = useUser();

  const {
    sessions, currentSessionId, setCurrentSessionId, loadingSessions, loadingMessages,
    deletingSessionId, deleteConfirm, setDeleteConfirm, loadSessions, loadSessionMessages,
    createNewSession, deleteSession,
  } = useSessions();

  const handleRefreshSessions = useCallback(() => {
    if (isSignedIn) loadSessions(true);
  }, [isSignedIn, loadSessions]);

  const {
    input, setInput, messages, setMessages, loading, status, handleSubmit, handleCancel, resetChat, messagesEndRef, isStreaming
  } = useChatStream(
    currentSessionId,
    (id) => {
      setCurrentSessionId(id);
      localStorage.setItem('currentChatSessionId', id);
      handleRefreshSessions(); // 【关键】立即刷新，确保新会话出现在列表中
    },
    handleRefreshSessions
  );

  const [sidebarOpen, setSidebarOpen] = useState(false);



 
  useEffect(() => {
  if (!isSignedIn) return;
  (async () => {
    await loadSessions(true);
    // 登录后默认进入新会话，不加载任何历史消息
    createNewSession();
    setMessages([]);
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isSignedIn]);

  const handleNewSession = () => {
    createNewSession();
    setMessages([]);
    resetChat();
    setSidebarOpen(false);
  };

  const handleSelectSession = async (id: string) => {
    setMessages([]);
    const list = await loadSessionMessages(id, true);
    if (list) setMessages(list as Message[]);
    resetChat();
    setSidebarOpen(false);
  };

  const handleDeleteConfirm = async (id: string) => {
    await deleteSession(id, true, currentSessionId, () => {
      createNewSession();
      setMessages([]);
    });
    setDeleteConfirm(null); 
  };

  if (!isSignedIn) {
    return (
      <div className="h-screen bg-slate-50 dark:bg-gray-900 flex flex-col items-center justify-center transition-colors">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-4">🤖 FlowChat</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">登录后即可开始使用智能聊天</p>
          <SignInButton mode="modal">
            <button type="button" className="bg-blue-600 dark:bg-blue-700 text-white px-8 py-3 rounded-full text-lg font-semibold hover:bg-blue-700 transition-colors">登录 / 注册</button>
          </SignInButton>
        </div>
      </div>
    );
  }

  return (
    <ChatErrorBoundary fallback={<div className="p-8 text-red-500">聊天界面加载失败，请刷新重试</div>}>
      <div className="h-screen bg-slate-50 dark:bg-gray-900 flex relative transition-colors overflow-hidden">
        {sidebarOpen && (
          <button
            type="button"
            aria-label="关闭侧边栏遮罩"
            className="md:hidden fixed inset-0 bg-black/50 z-30 border-0 p-0 cursor-default"
            onClick={() => setSidebarOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSidebarOpen(false);
              }
            }}
          />
        )}

        {deleteConfirm && (
          <DeleteConfirmModal
            id={deleteConfirm.id}
            title={deleteConfirm.title}
            onCancel={() => setDeleteConfirm(null)}
            onConfirm={handleDeleteConfirm} 
          />
        )}

        <div className="h-full overflow-y-auto shrink-0">
          <Sidebar
            sessions={sessions}
            loadingSessions={loadingSessions}
            currentSessionId={currentSessionId}
            deletingSessionId={deletingSessionId}
            sidebarOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onNewSession={handleNewSession}
            onSelectSession={handleSelectSession}
            onDeleteClick={(id, title) => setDeleteConfirm({ id, title })}
            userFullName={user?.fullName}
          />
        </div>



        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="md:hidden bg-blue-600 dark:bg-gray-800 text-white px-4 py-3 flex items-center justify-between shadow-md">
            <button type="button" onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-blue-700 dark:hover:bg-gray-700 rounded-lg" aria-label="打开侧边栏">☰</button>
            <h1 className="text-lg font-bold">🤖 FlowChat</h1>
            <button type="button" onClick={toggleDarkMode} aria-pressed={isDark} className="p-2 hover:bg-blue-700 dark:hover:bg-gray-700 rounded-lg">{isDark ? '☀️' : '🌙'}</button>
          </div>

          <div className="hidden md:flex bg-blue-600 dark:bg-gray-800 text-white px-6 py-4 shadow-md items-center justify-between">
            <h1 className="text-xl font-bold">🤖 FlowChat</h1>
            <button type="button" onClick={toggleDarkMode} aria-pressed={isDark} className="p-2 hover:bg-blue-700 dark:hover:bg-gray-700 rounded-lg">{isDark ? '☀️' : '🌙'}</button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <MessageList
              messages={messages}
              loadingMessages={loadingMessages}
              loading={loading}
              onSelectQuickQuestion={(q) => handleSubmit(q)}
              messagesEndRef={messagesEndRef}
            />
            {loading && !isStreaming && (
              <div className="animate-pulse p-4 text-gray-500 dark:text-gray-400">
                🤖 正在思考中...
              </div>
            )}
            {status === 'canceled' && (
              <div className="p-4 text-gray-400 dark:text-gray-500 text-sm">
                ⏹️ 已停止生成
              </div>
            )}
            {status === 'error' && (
              <div className="p-4 text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg mx-4 my-2">
                ❌ 请求失败，请检查网络后重试
              </div>
            )}
          </div>
          <div className="relative z-20 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <ChatInput input={input} setInput={setInput} loading={loading} onSubmit={() => handleSubmit()} onCancel={handleCancel} />
          </div>
        </div>
      </div>
    </ChatErrorBoundary>
  );
}