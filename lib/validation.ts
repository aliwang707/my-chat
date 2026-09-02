/**
 * 该模块保留手写的请求校验逻辑，以展示边界判断和类型收敛的工程方式。
 * 前端校验可以改善交互体验，但后端校验才是安全可信的真实依据。
 */
import z from 'zod';

export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(10000),
}).strict();

export const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(20),
  sessionId: z.string().uuid().optional(),
});

export type ChatRequestType = z.infer<typeof ChatRequestSchema>;