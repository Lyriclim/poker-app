/**
 * 极简内存限流器（单进程够用），用于登录/注册防暴力破解。
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}

// 定期清理过期条目，防止内存无限增长
const CLEANUP = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now >= v.resetAt) buckets.delete(k);
  }
}, 5 * 60 * 1000);
CLEANUP.unref();
