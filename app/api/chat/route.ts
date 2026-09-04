/**
 * 该接口负责校验会话归属、保存消息记录，并以 SSE 方式将模型输出按 token 逐步返回。
 * 设计目标是尽量减少长回复等待时间，同时保持后端对用户身份、输入长度和调用频率的控制。
 */
import { env, supabase } from "@/lib/supabase";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { ChatRequestSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

const FIRST_BYTE_TIMEOUT = Number(process.env.AI_FIRST_BYTE_TIMEOUT_MS || 60000);
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let firstByteTimeoutId: NodeJS.Timeout | null = null;

  const clearFirstByteTimeout = () => {
    if (firstByteTimeoutId) {
      clearTimeout(firstByteTimeoutId);
      firstByteTimeoutId = null;
    }
  };

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    if (!rateLimit(userId)) {
      return NextResponse.json(
        { error: "请求过于频繁，请稍后再试" },
        { status: 429 }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "JSON请求格式错误" },
        { status: 400 }
      );
    }

    const validation = ChatRequestSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorMsg = validation.error.issues
        .map((i) => `${i.path.join(".")}:${i.message}`)
        .join("; ");
      return NextResponse.json(
        { error: `请求参数校验失败：${errorMsg}` },
        { status: 400 }
      );
    }

    const { messages, sessionId } = validation.data;
    const userMessage = messages[messages.length - 1];
    const recentMessages = messages.slice(-20);

    if (userMessage.role !== "user") {
      return NextResponse.json(
        { error: "最后一条消息必须来自用户" },
        { status: 400 }
      );
    }

    let activeSessionId = sessionId;

    if (!activeSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from("sessions")
        .insert([
          {
            user_id: userId,
            title: null,
            updated_at: new Date().toISOString(),
          },
        ])
        .select("id")
        .single();

      if (sessionError || !newSession) {
        console.error("创建会话失败:", sessionError);
        return NextResponse.json(
          { error: "创建会话失败" },
          { status: 500 }
        );
      }
      activeSessionId = newSession.id;
    } else {
      // 校验会话归属
      const { data: sessionCheck, error: sessionErr } = await supabase
        .from("sessions")
        .select("id")
        .eq("id", activeSessionId)
        .eq("user_id", userId)
        .single();

      if (sessionErr || !sessionCheck) {
        return NextResponse.json(
          { error: "会话不存在或无权访问" },
          { status: 403 }
        );
      }

      const { error: updateError } = await supabase
        .from("sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeSessionId)
        .eq("user_id", userId);
      if (updateError) {
        console.error("更新会话时间失败:", updateError);
      }
    }

    // 保存用户消息
    const { error: userMsgError } = await supabase
      .from("messages")
      .insert([
        {
          session_id: activeSessionId,
          role: "user",
          content: userMessage.content,
        },
      ]);

    if (userMsgError) {
      console.error("保存用户消息失败:", userMsgError);
      return NextResponse.json(
        { error: "保存消息失败" },
        { status: 500 }
      );
    }

    const abortController = new AbortController();

    // 首字节超时定时器
    firstByteTimeoutId = setTimeout(() => {
      console.warn("首字节超时，终止请求");
      abortController.abort();
    }, FIRST_BYTE_TIMEOUT);

    let isCancelled = false;

    // 客户端取消时触发
    request.signal.addEventListener("abort", () => {
      isCancelled = true;
      clearFirstByteTimeout();
      abortController.abort();
      // 如果已有内容，追加中断标记，以便保存时带上
      if (fullAiReply && fullAiReply.length > 0) {
        fullAiReply += "\n\n[用户已中断]";
      }
    });

    let response;
    try {
      response = await fetch(`${env.SILICONFLOW_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.SILICONFLOW_API_KEY}`,
          "Accept-Encoding": "identity",
        },
        body: JSON.stringify({
          model: env.AI_MODEL,
          messages: [
            {
              role: "system",
              content: "你是一个专业、友好的AI助手，请用中文回答。",
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
      clearFirstByteTimeout();
      console.error("AI 服务网络错误:", fetchError);
      return NextResponse.json(
        { error: "AI 服务网络错误" },
        { status: 502 }
      );
    }

    if (!response.ok) {
      clearFirstByteTimeout();
      const errorText = await response.text();
      console.error(`AI 服务返回错误 ${response.status}，详情已脱敏`);
      if (process.env.NODE_ENV === "development") {
        console.error(errorText.slice(0, 200));
      }
      return NextResponse.json(
        { error: `AI 服务暂时不可用 (${response.status})` },
        { status: 502 }
      );
    }

    if (!response.body) {
      clearFirstByteTimeout();
      return NextResponse.json(
        { error: "无法获取响应流" },
        { status: 502 }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullAiReply = "";
    let hasSaved = false;
    const sessionIdForSave = activeSessionId;

    const saveAiReply = async () => {
      // 取消时也保存已有内容，fullAiReply 已追加 [用户已中断] 标记
      if (hasSaved || !fullAiReply || !sessionIdForSave) {
        return;
      }
      try {
        const { error } = await supabase
          .from("messages")
          .insert([
            {
              session_id: sessionIdForSave,
              role: "assistant",
              content: fullAiReply,
            },
          ]);
        if (error) {
          console.error("保存AI消息失败:", error);
        } else {
          hasSaved = true;

          // 更新会话标题（仅在标题为空时更新）
          try {
            const { data: sessionData, error: fetchError } = await supabase
              .from("sessions")
              .select("title")
              .eq("id", sessionIdForSave)
              .single();

            if (!fetchError && sessionData && !sessionData.title) {
              const summary =
                fullAiReply.replace(/\n/g, " ").slice(0, 30) +
                (fullAiReply.length > 30 ? "..." : "");
              const { error: updateTitleError } = await supabase
                .from("sessions")
                .update({ title: summary })
                .eq("id", sessionIdForSave);
              if (updateTitleError) {
                console.error("更新会话标题失败:", updateTitleError);
              }
            }
          } catch (titleError) {
            console.error("更新标题异常:", titleError);
          }
        }
      } catch (saveError) {
        console.error("保存AI消息抛出异常:", saveError);
      }
    };

    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        let buffer = "";
        let isFirstToken = true;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (jsonStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(jsonStr);

                // AI 返回业务错误，立即终止流
                if (parsed.error) {
                  console.error("AI 返回错误:", parsed.error);
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        token: `AI 服务错误: ${parsed.error.message || "未知错误"}`,
                      })}\n\n`
                    )
                  );
                  break;
                }

                if (!parsed.choices || parsed.choices.length === 0) {
                  console.warn("choices 为空，跳过此 chunk");
                  continue;
                }

                const content = parsed.choices[0]?.delta?.content || "";
                if (!content) continue;

                if (isFirstToken) {
                  clearFirstByteTimeout();
                  isFirstToken = false;
                }

                fullAiReply += content;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      token: content,
                      sessionId: sessionIdForSave,
                    })}\n\n`
                  )
                );
              } catch (parseError) {
                console.warn("JSON 解析失败，原始数据:", jsonStr);
              }
            }
          }

          // 处理剩余 buffer
          if (buffer) {
            const tailLines = buffer.split("\n");
            for (const line of tailLines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.choices && parsed.choices.length > 0) {
                  const content = parsed.choices[0]?.delta?.content || "";
                  if (content) {
                    fullAiReply += content;
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          token: content,
                          sessionId: sessionIdForSave,
                        })}\n\n`
                      )
                    );
                  }
                }
              } catch (e) {
                /* ignore */
              }
            }
          }

          // 保存 AI 回复
          await saveAiReply();
          controller.close();
        } catch (err: any) {
          clearFirstByteTimeout();
          console.error("流处理错误:", err);
          // 尝试保存已有内容
          await saveAiReply();
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  token: "\n\n[生成已中断]",
                })}\n\n`
              )
            );
            controller.close();
          } catch {
            controller.error(err);
          }
        }
      },
      cancel() {
        clearFirstByteTimeout();
        saveAiReply().finally(() => {
          abortController.abort();
        });
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Encoding": "identity",
      },
    });
  } catch (error: any) {
    clearFirstByteTimeout();
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "请求超时或被取消" },
        { status: 408 }
      );
    }
    console.error("未捕获的异常:", error);
    console.error("堆栈:", error.stack);
    return NextResponse.json(
      {
        error: "服务器内部错误",
        detail: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}