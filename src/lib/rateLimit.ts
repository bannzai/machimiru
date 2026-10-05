/**
 * 呼び出し元ごとに、windowMs の時間枠の中で limit 回までの呼び出しを許す制限。枠は呼び出し元の最初の呼び出しから始まる。
 * 状態はサーバーのプロセスのメモリにだけ持ち、枠を過ぎた呼び出し元の記録は次の呼び出しの時に捨てる。
 * 返す関数は、呼び出し元 clientKey の時刻 nowMs の呼び出しを許すかを返し、許した時は回数に数える (同じ引数でも回数が進むため冪等ではない)。
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const windows = new Map<string, { startedAtMs: number; count: number }>();
  return (clientKey: string, nowMs: number): boolean => {
    for (const [key, window] of windows) {
      if (nowMs - window.startedAtMs >= windowMs) {
        windows.delete(key);
      }
    }
    const window = windows.get(clientKey) ?? { startedAtMs: nowMs, count: 0 };
    if (window.count >= limit) {
      return false;
    }
    windows.set(clientKey, { ...window, count: window.count + 1 });
    return true;
  };
}

/**
 * request の呼び出し元の IP アドレスを返す。Cloudflare の `cf-connecting-ip`、無ければ `x-forwarded-for` の先頭を使い、
 * どちらも無い時 (ローカルの next start への直接の呼び出し) は、すべての呼び出しを 1 つの呼び出し元として数える。
 */
export function clientKeyOfRequest(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  );
}
