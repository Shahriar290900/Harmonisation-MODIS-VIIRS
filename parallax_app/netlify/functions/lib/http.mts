// Small shared helpers for the functions: a timed fetch, a shared time budget and a JSON response builder.
// Netlify stops synchronous functions after 10 s, so every function works inside a budget of its own (BUDGET_MS) and answers before that.
export const BUDGET_MS = 8000;

/** A deadline `ms` from now; `left()` is what remains (never below 0). */
export const budget = (ms = BUDGET_MS) => { const end = Date.now() + ms; return { left: () => Math.max(0, end - Date.now()) }; };

/** Fetch text; the whole download (body included) is cut off after `timeoutMs`. */
export async function getText(url: string, timeoutMs: number): Promise<string> {
  if (timeoutMs <= 0) throw new Error('out of time');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'parallax-fire/1.0 (NASA Space Apps project)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new Error('took too long');
    throw e;
  } finally { clearTimeout(t); }
}

export const json = (body: unknown, status: number, cache: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...cache } });

export const cdn = (sMaxAge: number, swr: number, browser = 300): Record<string, string> => ({
  'cache-control': `public, max-age=${browser}`,
  'netlify-cdn-cache-control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`
});

/** Failures are cached at the CDN too, so an outage is not hit again by every visitor (and nothing is retried). */
export const cdnFail = (sMaxAge: number): Record<string, string> => ({
  'cache-control': 'public, max-age=60',
  'netlify-cdn-cache-control': `public, s-maxage=${sMaxAge}`
});
