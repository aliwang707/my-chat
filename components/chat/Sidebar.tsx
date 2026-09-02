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

export const Sidebar = ({ sessions, loadingSessions, currentSessionId, deletingSessionId, sidebarOpen, onClose, onNewSession, onSelectSession, onDeleteClick, userFullName }: Props) => (
  <div className={`w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col fixed md:static h-full z-40 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onClose} className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="关闭侧边栏">✕</button>
        <UserButton /><span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-25">{userFullName}</span>
      </div>
      <button onClick={onNewSession} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700" aria-label="新建会话">▪ 新建会话</button>
    </div>
    <div className="flex-1 overflow-y-auto p-4">
      {loadingSessions ? <Skeleton count={5} /> : sessions.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">暂无会话，新建一个吧~</p>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <div key={s.id} className={`group/session flex items-center justify-between px-3 py-3 rounded-lg ${currentSessionId === s.id ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
              <button onClick={() => onSelectSession(s.id)} className="flex-1 truncate text-left text-gray-900 dark:text-gray-100" title={s.title}>{s.title}</button>
              <button onClick={e => { e.stopPropagation(); onDeleteClick(s.id, s.title); }} disabled={deletingSessionId === s.id} className="opacity-0 group-hover/session:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded ml-2 disabled:opacity-50 transition-opacity">
                {deletingSessionId === s.id ? '⏳' : '🗑️'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);