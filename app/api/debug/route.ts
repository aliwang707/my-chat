import { NextResponse } from 'next/server'

export async function GET() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return NextResponse.json({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'MISSING',
    anonKeyExists: !!anonKey,
    anonKeyPrefix: anonKey?.slice(0, 15) || 'MISSING',
    anonKeyLength: anonKey?.length || 0,
    // 如果是新版 Supabase，key 以 sb_publishable_ 开头
    // 如果是旧版，以 eyJ 开头
  })
}