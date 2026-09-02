/**
 * 该 hook 负责维护会话列表和当前会话状态，与流式传输逻辑分离。
 * 这种拆分使状态更新更容易测试，并降低与 SSE 读取逻辑耦合带来的维护成本。
 */
import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

export type Session = { id: string; title: string; updated_at: string };

export type ApiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  session_id: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sessionId?: string;
};

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);

  const loadSessions = useCallback(async (isSignedIn: boolean) => {
    if (!isSignedIn) return;
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/sessions', { credentials: 'include' });
      if (res.ok) {
        const data: Session[] = await res.json();
        setSessions(data.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
      }
    } finally { setLoadingSessions(false); }
  }, []);

  // 读取历史消息时，仍然需要对会话归属做一次服务端校验，以防止越权访问。
  const loadSessionMessages = useCallback(async (sessionId: string, isSignedIn: boolean): Promise<ChatMessage[] | null> => {
    if (!isSignedIn) return null;
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, { credentials: 'include' });
      if (res.ok) {
        const data: ApiMessage[] = await res.json();
        const list: ChatMessage[] = data.map(m => ({
          id: `msg-${m.id}`,
          role: m.role,
          content: m.content,
          sessionId: m.session_id,
        }));
        setCurrentSessionId(sessionId);
        localStorage.setItem('currentChatSessionId', sessionId);
        return list; // 返回映射后的数据
      } else if (res.status === 404) {
        toast.error('会话不存在');
        localStorage.removeItem('currentChatSessionId');
        setCurrentSessionId(null);
      } else if (res.status === 403) {
        toast.error('无权限访问该对话');
      }
      return null;
    } finally { setLoadingMessages(false); }
  }, []);

  const createNewSession = useCallback(() => {
    setCurrentSessionId(null);
    setDeleteConfirm(null);
    localStorage.removeItem('currentChatSessionId');
  }, []);

  const deleteSession = useCallback(async (sessionId: string, isSignedIn: boolean, currentId: string | null, onNew: () => void) => {
    if (!isSignedIn || deletingSessionId) return;
    setDeletingSessionId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setSessions(p => p.filter(s => s.id !== sessionId));
        if (currentId === sessionId) onNew();
        setDeleteConfirm(null);
        toast.success('会话已删除');
      } else if (res.status === 403) toast.error('无权限删除该会话');
      else toast.error('删除失败，请重试');
    } finally { setDeletingSessionId(null); }
  }, [deletingSessionId]);

  return {
    sessions, setSessions,
    currentSessionId, setCurrentSessionId,
    loadingSessions, loadingMessages,
    deletingSessionId, deleteConfirm, setDeleteConfirm,
    loadSessions, loadSessionMessages, createNewSession, deleteSession,
  };
}