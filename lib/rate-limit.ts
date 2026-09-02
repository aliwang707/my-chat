/**
 * 该模块采用滑动窗口限流而不是固定窗口，以更平滑地响应突发流量。
 * 内存实现可用于本地开发和单实例部署；如果扩展到多实例环境，需改为 Redis 共享计数。
 */
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 20;
const requestLog = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(key: string): boolean {
  const now = Date.now();
  const record = requestLog.get(key);

  if (!record || now > record.resetTime) {
    requestLog.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;

  record.count++;
  return true;
}

// 过期记录会定期清理，避免单进程内存占用持续增长。
function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, record] of requestLog.entries()) {
    if (now > record.resetTime) requestLog.delete(key);
  }
}
setInterval(cleanupRateLimit, 5 * 60 * 1000);