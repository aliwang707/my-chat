/**
 * 该路由负责返回当前用户的会话列表，并按最近更新时间倒序展示。
 * 路径规则保持为 /api/sessions，供前端拉取会话元数据和切换历史上下文。
 */
import { auth } from "@clerk/nextjs/server";
import { supabase } from "@/lib/supabase";
import { NextResponse,NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 这里只返回当前登录用户的会话，避免跨用户数据泄漏；前端不得拿到其他账号的会话列表。
    const { data, error } = await supabase
      .from('sessions')
      .select('id, title, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('获取会话列表失败:', error);
      return NextResponse.json({ error: '获取会话列表失败' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('获取会话列表错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}