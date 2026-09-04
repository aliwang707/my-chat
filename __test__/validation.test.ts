import { describe, it, expect } from 'vitest';
import { ChatRequestSchema } from '@/lib/validation';

describe('ChatRequestSchema 防呆测试', () => {
  it('✅ 应通过合法的用户消息', () => {
    const result = ChatRequestSchema.safeParse({
      messages: [{ role: 'user', content: '你好' }],
    });
    expect(result.success).toBe(true);
  });

  it('❌ 应拒绝内容为空的字符串', () => {
    const result = ChatRequestSchema.safeParse({
      messages: [{ role: 'user', content: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('❌ 应拒绝超过 20 条消息（防止上下文溢出）', () => {
    const manyMessages = Array.from({ length: 21 }, (_, i) => ({
      role: 'user',
      content: `消息 ${i}`,
    }));
    const result = ChatRequestSchema.safeParse({ messages: manyMessages });
    expect(result.success).toBe(false);
  });

  it('❌ 应拒绝非 UUID 格式的 sessionId', () => {
    const result = ChatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'hi' }],
      sessionId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});