/**
 * 该路由负责删除用户自己的会话及其关联消息，路径规则为 /api/sessions/[id].
 * 当前实现采用显式校验会话归属，并执行消息级删除后再删除会话记录，避免无权限误删。
 */
import { auth } from "@clerk/nextjs/server";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

   // 只有当前用户持有的会话才能进入删除流程；这一步是防止越权删除的关键校验。
   const { data: session, error: sessionError } = await supabase
     .from('sessions')
     .select('id')
     .eq('id', sessionId)
     .eq('user_id', userId)
     .maybeSingle();

   if (sessionError) {
     console.error('校验会话权限失败:', sessionError);
     return NextResponse.json({ error: '校验会话权限失败' }, { status: 500 });
   }

   if (!session) {
     return NextResponse.json({ error: '会话不存在或无权限' }, { status: 403 });
   }

   // 这里显式清理消息后再删除会话，确保关联子资源不会残留在数据库中。
   const { error: deleteMessagesError } = await supabase
     .from('messages')
     .delete()
     .eq('session_id', sessionId);

   if (deleteMessagesError) {
     console.error('删除会话消息失败:', deleteMessagesError);
     return NextResponse.json({ error: '删除会话消息失败' }, { status: 500 });
   }

   const { error } = await supabase
     .from('sessions')
     .delete()
     .eq('id', sessionId)
     .eq('user_id', userId);

   if (error) {
     console.error('删除会话失败:', error);
     return NextResponse.json({ error: '删除会话失败' }, { status: 500 });
   }

   return NextResponse.json({ success: true });
 } catch (error) {
   console.error('删除会话错误:', error);
   return NextResponse.json({ error: '服务器错误' }, { status: 500 });
 }
}