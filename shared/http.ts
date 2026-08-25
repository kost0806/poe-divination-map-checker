/** 공통 HTTP 클라이언트: PoEDB/공식 API 조회에 쓰는 최소 재시도 래퍼 */

/**
 * poe.ninja 이용 지침이 앱과 연락 경로를 식별할 수 있는 User-Agent 를 요구한다.
 * 연락은 저장소 이슈로 받는다.
 */
const USER_AGENT =
  'poe-divination-map-checker/0.1 (+https://github.com/kost0806/poe-divination-map-checker; contact: github issues)';

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const { timeoutMs = 20_000, retries = 3, headers = {} } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // 재시도 간격은 지수 백오프 (1s, 2s, 4s)
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json', ...headers },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return await res.text();
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`요청 실패: ${url} (${String(lastError)})`);
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  return JSON.parse(await fetchText(url, options)) as T;
}

/** 동시 실행 개수를 제한하며 순서를 보존해 매핑한다 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
