/**
 * 该路由用于按会话 ID 读取消息记录，路径规则为 /api/sessions/[id]/messages。
 * 会先校验与当前用户的归属关系，再返回消息列表，避免越权访问历史对话。
 */
import { auth } from "@clerk/nextjs/server";
import { supabase } from "@/lib/supabase";
import { NextResponse,NextRequest } from "next/server";
import z from "zod";

const SessionIdSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = id;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 先校验会话归属，确保用户只能访问自己的历史消息；越权访问会直接拒绝.
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 });
    }

    if (session.user_id !== userId) {
      return NextResponse.json({ error: '无权限访问该对话' }, { status: 403 });
    }

    // 2. 权限校验通过后，再查消息
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('查询消息失败:', messagesError);
      return NextResponse.json({ error: '加载消息失败' }, { status: 500 });
    }

    return NextResponse.json(messages);
  } catch (error) {
    console.error('获取消息错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}