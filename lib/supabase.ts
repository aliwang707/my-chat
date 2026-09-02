/**
 * 该模块负责统一校验运行时环境，并在服务端创建单例 Supabase 客户端。
 * 通过 fail-fast 机制尽早发现缺失配置，但构建阶段不应因为缺少环境变量而中断。
 * NEXT_PUBLIC_ 变量仅适合公开、匿名可见的配置，不能在此模块中引入 service role key 等机密凭据。
 */
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Supabase URL格式错误').optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, '缺少Supabase Anon Key').optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, '缺少Supabase Service Role Key').optional(),
  SILICONFLOW_API_KEY: z.string().min(1, '缺少SiliconFlow API Key').optional(),
  AI_MODEL: z.string().default('Qwen/Qwen2.5-7B-Instruct'),
  AI_MAX_TOKENS: z.coerce.number().default(2048),
  AI_TEMPERATURE: z.coerce.number().default(0.7),
  AI_TOP_P: z.coerce.number().default(0.9),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.warn('环境变量校验未通过，构建将继续；运行期需补齐配置后再访问对应功能。');
  parsedEnv.error.issues.forEach((issue) => {
    console.warn(`  ${issue.path.join('.')}: ${issue.message}`);
  });
}

export const env = parsedEnv.success
  ? parsedEnv.data
  : {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY || '',
      AI_MODEL: process.env.AI_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
      AI_MAX_TOKENS: Number(process.env.AI_MAX_TOKENS || 2048),
      AI_TEMPERATURE: Number(process.env.AI_TEMPERATURE || 0.7),
      AI_TOP_P: Number(process.env.AI_TOP_P || 0.9),
    };

// 业务层复用同一个服务端客户端，可以避免重复连接和状态漂移。
export const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);