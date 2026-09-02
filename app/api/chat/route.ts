/**
 * 该接口负责校验会话归属、保存消息记录，并以 SSE 方式将模型输出按 token 逐步返回。
 * 设计目标是尽量减少长回复等待时间，同时保持后端对用户身份、输入长度和调用频率的控制。
 */


import { env, supabase } from "@/lib/supabase";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { ChatRequestSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

const FIRST_BYTE_TIMEOUT = 30000;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    if (!rateLimit(userId)) {
      return NextResponse.json({ error: '请求过于频繁，请稍后再试' }, { status: 429 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON请求格式错误' }, { status: 400 });
    }

    const validation = ChatRequestSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorMsg = validation.error.issues.map(i => `${i.path.join('.')}:${i.message}`).join('; ');
      return NextResponse.json({ error: `请求参数校验失败：${errorMsg}` }, { status: 400 });
    }

    const { messages, sessionId } = validation.data;
    const userMessage = messages[messages.length - 1];
    const recentMessages = messages.slice(-10);

    if (userMessage.role !== 'user') {
      return NextResponse.json({ error: '最后一条消息必须来自用户' }, { status: 400 });
    }

    let activeSessionId = sessionId;

    if (!activeSessionId) {
      const title = userMessage.content.slice(0, 20) + (userMessage.content.length > 20 ? '...' : '');
      const { data: newSession, error: sessionError } = await supabase
        .from('sessions')
        .insert([{ user_id: userId, title, updated_at: new Date().toISOString() }])
        .select('id')
        .single();

      if (sessionError || !newSession) {
        console.error('创建会话失败:', sessionError);
        return NextResponse.json({ error: '创建会话失败' }, { status: 500 });
      }
      activeSessionId = newSession.id;
    } else {
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeSessionId)
        .eq('user_id', userId);
      if (updateError) {
        console.error('更新会话时间失败:', updateError);
      }
    }

    // 保存用户消息
    const { error: userMsgError } = await supabase
      .from('messages')
      .insert([{ session_id: activeSessionId, role: 'user', content: userMessage.content }]);

    if (userMsgError) {
      console.error('保存用户消息失败:', userMsgError);
      return NextResponse.json({ error: '保存消息失败' }, { status: 500 });
    }

    const abortController = new AbortController();
    // 这类长回复在网关或上游服务中可能遇到首字节超时，超时后应主动中断，避免客户端长时间等待空白流。
    let firstByteTimeoutId: NodeJS.Timeout | null = setTimeout(() => {
      console.warn('首字节超时，终止请求');
      abortController.abort();
    }, FIRST_BYTE_TIMEOUT);

    request.signal.addEventListener('abort', () => {
      // 客户端断开时需要同步中止上游请求，防止旧流继续写入导致当前会话出现脏数据。
      if (firstByteTimeoutId) {
        clearTimeout(firstByteTimeoutId);
        firstByteTimeoutId = null;
      }
      abortController.abort();
    });

    let response;
    try {
      response = await fetch(`${env.SILICONFLOW_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SILICONFLOW_API_KEY}`,
          'Accept-Encoding': 'identity',
        },
        body: JSON.stringify({
          model: env.AI_MODEL,
          messages: [
            {
              role: 'system',
              content: `你是一个专业、友好的AI助手。当需要输出表格时，**必须使用标准Markdown表格语法**：
- 表头与内容之间用分隔线（|---|）隔开
- 列数必须一致
- 示例：
| 步骤 | 操作 | 注意事项 |
| --- | --- | --- |
| 1 | 创建项目 | 确保Node.js已安装 |

请确保所有表格都符合此格式。代码块请使用正确的语法高亮。`
            },
            ...recentMessages,
          ],
          stream: true,
          max_tokens: Math.min(env.AI_MAX_TOKENS, 1024),
          temperature: env.AI_TEMPERATURE,
          top_p: env.AI_TOP_P,
        }),
        signal: abortController.signal,
      });
    } catch (fetchError: any) {
      console.error('AI 服务网络错误:', fetchError);
      return NextResponse.json({ error: 'AI 服务网络错误' }, { status: 502 });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI 服务返回错误 ${response.status}:`, errorText);
      return NextResponse.json({ error: `AI 服务暂时不可用 (${response.status})`, detail: errorText.slice(0, 300)  }, { status: 502 });
    }
    if (!response.body) {
      return NextResponse.json({ error: '无法获取响应流' }, { status: 502 });
    }

    // TextEncoder 负责把 UTF-8 文本转成字节流，SSE 需要传输原始字节而不是字符串对象。
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullAiReply = '';
    let hasSaved = false;
    const sessionIdForSave = activeSessionId;

    const saveAiReply = async () => {
      if (hasSaved || !fullAiReply || !sessionIdForSave) {
        if (!sessionIdForSave) console.error('sessionId 为空，无法保存');
        return;
      }
      try {
        const { error } = await supabase
          .from('messages')
          .insert([{ session_id: sessionIdForSave, role: 'assistant', content: fullAiReply }]);
        if (error) {
          console.error('保存AI消息失败:', error);
        } else {
          hasSaved = true;
        }
      } catch (saveError) {
        console.error('保存AI消息抛出异常:', saveError);
      }
    };

    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        let buffer = '';
        let isFirstToken = true;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (jsonStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.error) {
                  console.error('AI 返回错误:', parsed.error);
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: `AI 服务错误: ${parsed.error.message || '未知错误'}` })}\n\n`));
                  continue;
                }
                if (!parsed.choices || parsed.choices.length === 0) {
                  console.warn('choices 为空，跳过此 chunk');
                  continue;
                }
                const content = parsed.choices[0]?.delta?.content || '';
                if (!content) continue;

                if (isFirstToken) {
                  if (firstByteTimeoutId) {
                    clearTimeout(firstByteTimeoutId);
                    firstByteTimeoutId = null;
                  }
                  isFirstToken = false;
                }

                fullAiReply += content;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: content, sessionId: sessionIdForSave })}\n\n`));
              } catch (parseError) {
                console.warn('JSON 解析失败，原始数据:', jsonStr);
              }
            }
          }

          // 处理剩余 buffer
          if (buffer) {
            const tailLines = buffer.split('\n');
            for (const line of tailLines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (jsonStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.choices && parsed.choices.length > 0) {
                  const content = parsed.choices[0]?.delta?.content || '';
                  if (content) {
                    fullAiReply += content;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: content, sessionId: sessionIdForSave })}\n\n`));
                  }
                }
              } catch (e) { /* ignore */ }
            }
          }

          // 在关闭流之前先保存 AI 回复
          await saveAiReply();
          controller.close();
        } catch (err: any) {
          console.error('流处理错误:', err);
          // 发生异常时也尝试保存
          await saveAiReply();
          controller.error(err);
        }
      },
      cancel() {
        // 客户端中断时需要清理上游连接，并尽量保存已生成的内容，避免响应被截断后的用户体验不一致。
        if (firstByteTimeoutId) {
          clearTimeout(firstByteTimeoutId);
          firstByteTimeoutId = null;
        }
        saveAiReply().finally(() => {
          abortController.abort();
        });
      },
    });

    return new Response(readableStream, {
      headers: {
        // SSE 需要明确声明事件流类型，浏览器和中间层代理才会以流式方式处理数据。
        'Content-Type': 'text/event-stream; charset=utf-8',
        // 关闭缓存和缓冲，确保客户端能尽快看到增量输出。
        'Cache-Control': 'no-cache, no-transform',
        // keep-alive 让连接保持开放，便于后续 token 继续传输。
        'Connection': 'keep-alive',
        // 关闭代理层缓冲，避免网关把增量 chunk 合并后造成明显延迟。
        'X-Accel-Buffering': 'no',
        'Content-Encoding': 'identity',
      },
    });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: '请求超时或被取消' }, { status: 408 });
    }
    console.error('未捕获的异常:', error);
    console.error('堆栈:', error.stack);
    return NextResponse.json(
      {
        error: '服务器内部错误',
        detail: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}