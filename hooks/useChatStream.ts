/**
 * 该 hook 负责网络层的流式读取与消息追加逻辑，与 UI 解耦。
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import throttle from 'lodash/throttle';

export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sessionId?: string;
  isLoading?: boolean;
  error?: boolean;
};

export type ChatStatus = 'idle' | 'loading' | 'canceled' | 'error';

export function useChatStream(
  currentSessionId: string | null,
  onSessionCreated: (id: string) => void,
  onRefreshSessions: () => void
) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentAiIdRef = useRef<string | null>(null);
  const isFinishRef = useRef(false); // 防止重复结束
  const manualCancelRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenBufferRef = useRef('');
  const throttledFlushRef = useRef<ReturnType<typeof throttle> | null>(null);
  const hasReceivedFirstTokenRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // 节流
  useEffect(() => {
    throttledFlushRef.current = throttle(() => {
      if (!tokenBufferRef.current) return;
      const tokens = tokenBufferRef.current;
      tokenBufferRef.current = '';
      setMessages(prev =>
        prev.map(m =>
          m.id === currentAiIdRef.current ? { ...m, content: m.content + tokens } : m
        )
      );
      requestAnimationFrame(scrollToBottom);
    }, 10);
    return () => throttledFlushRef.current?.cancel();
  }, [scrollToBottom]);

  // Escape 取消
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && loading) handleCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading]);

  const clearTimeoutRef = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // 统一结束函数：无论正常、取消、超时都调用
  // 统一结束函数：无论正常、取消、超时都调用
  const finishAiReply = (extraText?: string) => {
    if (isFinishRef.current) return;
    const id = currentAiIdRef.current;
    if (id) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === id
            ? {
              ...msg,
              content: msg.content + (extraText ? `\n\n${extraText}` : ''),
              isLoading: false,
            }
            : msg
        )
      );
      currentAiIdRef.current = null;
      isFinishRef.current = true;
      onRefreshSessions();
      setIsStreaming(false);
    }
  };

  // 清洗消息
  const cleanMessages = (raw: Message[]) => {
    return raw
      .slice(-20)
      .filter(m => !m.isLoading && m.content.trim().length > 0)
      .map(m => ({ role: m.role, content: m.content }));
  };

  // 错误消息插入
  const pushSystemError = (content: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'system' && last.error) return prev;
      return [
        ...prev,
        { id: `err-${Date.now()}`, role: 'system', content, error: true },
      ];
    });
  };

  // ---------- 发送主逻辑 ----------
  const handleSubmit = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || loading) return;

      // 重置标志
      manualCancelRef.current = false;
      isFinishRef.current = false;
      hasReceivedFirstTokenRef.current = false;
      setIsStreaming(false);

      tokenBufferRef.current = '';
      throttledFlushRef.current?.cancel();
      setError(null);
      setStatus('loading');
      setLoading(true);

      // 构造用户消息
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        sessionId: currentSessionId || undefined,
      };
      const nextMessages = [...messagesRef.current, userMsg];
      setMessages(nextMessages);
      setInput('');
      onRefreshSessions();

      const cleaned = cleanMessages(nextMessages);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 超时定时器
      timeoutRef.current = setTimeout(() => {
        if (controller.signal.aborted) return;
        if (!manualCancelRef.current) {
          controller.abort();
          finishAiReply('[生成超时]');
          setStatus('error');
          setError('请求超时，请稍后重试');
        }
      }, 120000);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            messages: cleaned,
            sessionId: currentSessionId || undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`请求失败：${res.status}`);
        if (!res.body) throw new Error('无法获取响应流');

        // 创建 AI 消息占位
        const aiId = `ai-${Date.now()}`;
        currentAiIdRef.current = aiId;
        setMessages(prev => [
          ...prev,
          {
            id: aiId,
            role: 'assistant',
            content: '',
            sessionId: currentSessionId || undefined,
            isLoading: true,
          },
        ]);
        onRefreshSessions();
        requestAnimationFrame(scrollToBottom);

        const reader = res.body
          .pipeThrough(new TextDecoderStream('utf-8'))
          .getReader();

        let receivedSessionId = currentSessionId;
        let totalChars = 0;
        let lastToken = '';
        let repeatCount = 0;
        const MAX_CHARS = 15000;
        const MAX_REPEAT = 10;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const lines = value.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (jsonStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.error) {
                throw new Error(parsed.error.message || 'AI 服务返回错误');
              }
              const token = parsed.token;
              if (!token) continue;

              totalChars += token.length;
              if (token === lastToken) {
                repeatCount++;
              } else {
                repeatCount = 0;
                lastToken = token;
              }
              if (totalChars > MAX_CHARS || repeatCount > MAX_REPEAT) {
                controller.abort();
                throw new Error('AbortError');
              }

              // 第一个 token 立即更新
              if (!hasReceivedFirstTokenRef.current) {
                hasReceivedFirstTokenRef.current = true;
                setIsStreaming(true);
                setMessages(prev =>
                  prev.map(m =>
                    m.id === currentAiIdRef.current
                      ? { ...m, content: m.content + token }
                      : m
                  )
                );
                tokenBufferRef.current = '';
                continue;
              }

              tokenBufferRef.current += token;
              throttledFlushRef.current?.();

              if (parsed.sessionId && !receivedSessionId) {
                receivedSessionId = parsed.sessionId;
                onSessionCreated(parsed.sessionId);
                onRefreshSessions();
              }
            } catch (e) {
              if (e instanceof Error && e.message === 'AbortError') throw e;
            }
          }
        }

        // 正常结束流
        throttledFlushRef.current?.flush();
        finishAiReply();
        clearTimeoutRef();
        setStatus('idle');
      } catch (err: any) {
        throttledFlushRef.current?.flush();
        clearTimeoutRef();
        setIsStreaming(false);

        if (manualCancelRef.current) {
          // 已在 handleCancel 中处理，这里只重置状态
          setStatus('canceled');
        } else if (err.name === 'AbortError' || err.message === 'AbortError') {
          if (status !== 'error') {
            // 若未通过超时定时器处理（可能被取消），则在这里处理
            finishAiReply('[生成超时]');
            setStatus('error');
            setError('请求超时，请稍后重试');
          }
        } else {
          // 其他错误
          setStatus('error');
          setError(err.message || '发送失败');
          onRefreshSessions();
        }
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
        clearTimeoutRef();
        setIsStreaming(false);
      }
    },
    [input, loading, status, currentSessionId, onSessionCreated, onRefreshSessions]
  );

  // ---------- 取消 ----------
  const handleCancel = useCallback(() => {
    if (!abortControllerRef.current) return;

    manualCancelRef.current = true;
    throttledFlushRef.current?.flush();
    setIsStreaming(false);

    const id = currentAiIdRef.current;
    if (id) {
      // 查找当前 AI 消息的内容
      const targetMsg = messagesRef.current.find(m => m.id === id);
      // 如果内容很短（少于 10 个字符，可以调整阈值），直接删除这条消息
      if (targetMsg && targetMsg.content.length < 10) {
        setMessages(prev => prev.filter(m => m.id !== id));
      } else {
        // 否则追加停止标记，并关闭加载状态
        setMessages(prev =>
          prev.map(msg =>
            msg.id === id
              ? { ...msg, content: msg.content + '\n\n[已停止生成]', isLoading: false }
              : msg
          )
        );
      }
      currentAiIdRef.current = null;
      isFinishRef.current = true;
    } else {
      // 极短时间取消，插入系统提示
      setMessages(prev => [
        ...prev,
        { id: `cancel-${Date.now()}`, role: 'system', content: '已取消生成', error: false },
      ]);
    }

    abortControllerRef.current.abort();
    abortControllerRef.current = null;
    clearTimeoutRef();
    setLoading(false);
    setStatus('canceled');
    onRefreshSessions();
    scrollToBottom();
  }, [scrollToBottom, onRefreshSessions]);

  // ---------- 重置 ----------
  const resetChat = useCallback(() => {
    setStatus('idle');
    setError(null);
    setLoading(false);
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearTimeoutRef();
    throttledFlushRef.current?.flush();
    finishAiReply(); // 安全结束
  }, []);

  return {
    input,
    setInput,
    messages,
    setMessages,
    loading,
    isStreaming,
    status,
    error,
    handleSubmit,
    handleCancel,
    resetChat,
    messagesEndRef,
  };
}