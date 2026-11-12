// Small shared helpers for the functions: one timed fetch and a JSON response builder.
export async function getText(url: string, timeoutMs: number): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'parallax-fire/1.0 (NASA Space Apps project)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

export const json = (body: unknown, status: number, cache: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...cache } });

export const cdn = (sMaxAge: number, swr: number, browser = 300): Record<string, string> => ({
  'cache-control': `public, max-age=${browser}`,
  'netlify-cdn-cache-control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`
});
