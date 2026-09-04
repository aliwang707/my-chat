'use client';
import { UserButton } from '@clerk/nextjs';
import { Session } from '@/hooks/useSessions';
import { Skeleton } from './ui/Skeleton';

type Props = {
  sessions: Session[];
  loadingSessions: boolean;
  currentSessionId: string | null;
  deletingSessionId: string | null;
  sidebarOpen: boolean;
  onClose: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteClick: (id: string, title: string) => void;
  userFullName?: string | null;
};

export const Sidebar = ({
  sessions,
  loadingSessions,
  currentSessionId,
  deletingSessionId,
  sidebarOpen,
  onClose,
  onNewSession,
  onSelectSession,
  onDeleteClick,
  userFullName,
}: Props) => (
  <div
    className={`w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col fixed md:static h-full z-40 transition-transform duration-300 px-6 py-4 ${
      sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
    }`}
  >
    {/* 顶部：关闭按钮 + 用户信息 */}
    <div className="flex items-center gap-2 mb-4">
      <button
        onClick={onClose}
        className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        aria-label="关闭侧边栏"
      >
        ✕
      </button>
      <UserButton />
      <span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-24">
        {userFullName}
      </span>
    </div>

    {/* 新建会话按钮 */}
    <button
      onClick={onNewSession}
      className="w-full bg-blue-600 dark:bg-blue-700 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors mb-4"
    >
      + 新建会话
    </button>

    {/* 会话列表 */}
    <div className="flex-1 overflow-y-auto sidebar-scroll">
      {loadingSessions ? (
        <Skeleton count={5} />
      ) : sessions.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">暂无会话，新建一个吧~</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group/session flex items-center justify-between px-3 py-3 rounded-lg transition-all ${
                currentSessionId === s.id
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <button
                onClick={() => onSelectSession(s.id)}
                className="flex-1 truncate text-left"
                title={s.title || '新会话'}
              >
                {s.title || '新会话'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteClick(s.id, s.title);
                }}
                disabled={deletingSessionId === s.id}
                className="opacity-100 sm:opacity-0 group-hover/session:sm:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded ml-2 disabled:opacity-50 transition-opacity text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                {deletingSessionId === s.id ? '⏳' : '🗑️'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);