// hooks/useChatStream.ts
/**
 * 该 hook 只负责网络层的流式读取与消息追加逻辑，并与会话管理状态解耦。
 * 这样可以保持 UI 交互与传输实现分离，减少会话切换时的竞态问题。
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

export function useChatStream(
  currentSessionId: string | null,
  onSessionCreated: (id: string) => void,
  onRefreshSessions: () => void
) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentAiMessageIdRef = useRef<string | null>(null);
  const hasCommittedAiReply = useRef(false);

  const tokenBufferRef = useRef('');
  const throttledFlushRef = useRef<ReturnType<typeof throttle> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // 通过节流合并 token，可以减少频繁状态更新带来的重渲染成本。
  useEffect(() => {
    throttledFlushRef.current = throttle(() => {
      if (!tokenBufferRef.current) return;
      const tokens = tokenBufferRef.current;
      tokenBufferRef.current = '';

      setMessages(prev =>
        prev.map(m =>
          m.id === currentAiMessageIdRef.current
            ? { ...m, content: m.content + tokens }
            : m
        )
      );
      requestAnimationFrame(scrollToBottom);
    }, 50);

    return () => {
      throttledFlushRef.current?.cancel();
    };
  }, [scrollToBottom]);

  // AbortController 用于中断上一次请求，并确保旧流不污染当前会话的 UI 状态。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && loading) handleCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const commitAiReply = useCallback(() => {
    if (hasCommittedAiReply.current) return;
    const currentId = currentAiMessageIdRef.current;
    if (!currentId) return;

    setMessages(prev =>
      prev.map(msg =>
        msg.id === currentId && msg.isLoading
          ? { ...msg, isLoading: false }
          : msg
      )
    );
    hasCommittedAiReply.current = true;
    currentAiMessageIdRef.current = null;
  }, []);

  // 发送前会过滤近段历史并合并相邻相同角色消息，避免请求体冗余且降低上下文长度压力。
  const cleanMessages = (rawMessages: Message[]) => {
    const filtered = rawMessages
      .slice(-10)
      .filter(m => !m.isLoading && m.content.trim().length > 0);

    const result: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
    for (const curr of filtered) {
      const last = result[result.length - 1];
      if (last && last.role === curr.role) {
        if (last.content === curr.content) continue;
        result[result.length - 1] = {
          ...last,
          content: last.content + '\n' + curr.content,
        };
      } else {
        result.push({ role: curr.role, content: curr.content });
      }
    }
    return result;
  };

  // 这里保留了发送入口，并在错误流中统一处理中断状态。
  const handleSubmit = useCallback(
    async (overrideText?: string) => {
      const textToSend = (overrideText ?? input).trim();
      if (!textToSend || loading) return;

      hasCommittedAiReply.current = false;
      tokenBufferRef.current = '';
      throttledFlushRef.current?.cancel();

      setLoading(true);

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: textToSend,
        sessionId: currentSessionId || undefined,
      };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInput('');

      const cleanedPayload = cleanMessages(updatedMessages);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            messages: cleanedPayload,
            sessionId: currentSessionId || undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`请求失败：${res.status}`);
        if (!res.body) throw new Error('无法获取响应流');

        const aiMessageId = `ai-${Date.now()}`;
        currentAiMessageIdRef.current = aiMessageId;
        setMessages(prev => [
          ...prev,
          {
            id: aiMessageId,
            role: 'assistant',
            content: '',
            sessionId: currentSessionId || undefined,
            isLoading: true,
          },
        ]);
        requestAnimationFrame(scrollToBottom);

        // TextDecoderStream 会按 UTF-8 分块解码，避免中文字符在边界处被截成乱码。
        const reader = res.body
          .pipeThrough(new TextDecoderStream('utf-8'))
          .getReader();

        let receivedSessionId = currentSessionId;

        let totalChars = 0;
        let lastToken = '';
        let repeatCount = 0;
        const MAX_CHARS = 5000;
        const MAX_REPEAT_COUNT = 5;

        try {
          // 直接按流读取而不是一次性 response.json()，是为了在模型输出尚未结束时便更新 UI。
          while (true) {
            const { done, value: chunk } = await reader.read();
            if (done) break;

            const lines = chunk.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (jsonStr === '[DONE]') continue;

              try {
                const parsed: { token?: string; sessionId?: string } = JSON.parse(jsonStr);
                if (!parsed.token) continue;

                const token = parsed.token;
                totalChars += token.length;

                if (token === lastToken) {
                  repeatCount++;
                } else {
                  repeatCount = 0;
                  lastToken = token;
                }

                if (totalChars > MAX_CHARS || repeatCount > MAX_REPEAT_COUNT) {
                  controller.abort();
                  throw new Error('AbortError');
                }

                tokenBufferRef.current += token;
                throttledFlushRef.current?.();

                if (parsed.sessionId && !receivedSessionId) {
                  receivedSessionId = parsed.sessionId;
                  onSessionCreated(parsed.sessionId);
                  onRefreshSessions();
                }
              } catch (parseError) {
                if (parseError instanceof Error && parseError.message === 'AbortError') {
                  throw parseError;
                }
                // 其他解析错误忽略
              }
            }
          }
        } finally {
          throttledFlushRef.current?.flush();
          commitAiReply();
          requestAnimationFrame(scrollToBottom);
        }
      } catch (error: any) {
        throttledFlushRef.current?.flush();
        commitAiReply();

        if (error.name !== 'AbortError' && !(error instanceof Error && error.message === 'AbortError')) {
          setMessages(prev => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: 'system',
              content: '消息发送失败，请稍后重试。',
              error: true,
            },
          ]);
        } else {
          const aiId = currentAiMessageIdRef.current;
          if (aiId) {
            setMessages(prev =>
              prev.map(msg =>
                msg.id === aiId && !msg.error
                  ? { ...msg, content: msg.content + '\n\n[自动停止：内容过长或重复]' }
                  : msg
              )
            );
          }
        }
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [input, loading, messages, currentSessionId, scrollToBottom, commitAiReply, onSessionCreated, onRefreshSessions]
  );

  // ============ 取消生成 ============
  const handleCancel = useCallback(() => {
    if (!abortControllerRef.current) return;

    throttledFlushRef.current?.flush();
    commitAiReply();

    const aiMessageId = currentAiMessageIdRef.current;
    if (aiMessageId) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === aiMessageId && !msg.error
            ? { ...msg, content: msg.content + '\n\n[请求已取消]' }
            : msg
        )
      );
    }

    abortControllerRef.current.abort();
    abortControllerRef.current = null;
    setLoading(false);
    scrollToBottom();
  }, [commitAiReply, scrollToBottom]);

  return {
    input,
    setInput,
    messages,
    setMessages,
    loading,
    handleSubmit,
    handleCancel,
    messagesEndRef,
  };
}