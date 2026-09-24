// ページ取得のサンドボックス本体（DNS解決を伴うSSRF判定つき）。
// Deno固有API（resolveDns）を使うのでテストは sandbox.ts 側に寄せてある。

import { checkUrlShape, isAllowedByRobots, isBlockedIp } from './sandbox.ts'
import { FETCH_TIMEOUT_MS, MAX_BYTES, MAX_REDIRECTS, USER_AGENT } from './config.ts'

/**
 * ホスト名を解決して、内部ネットワークを指していないか確かめる。
 * 解決後のIPを全部見るので、`internal.example.com A 10.0.0.1` のような
 * 「公開DNSで社内IPを返す」形のSSRFも弾ける。
 *
 * 注意: 解決してから fetch が再解決するまでの間に応答を差し替える
 * DNSリバインディングまでは防げない。完全に塞ぐには解決済みIPへ直接
 * 接続してHostヘッダを付ける必要があり、それは将来の課題。
 */
async function blockedHostReason(hostname: string): Promise<string | undefined> {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    return isBlockedIp(host) ? '内部ネットワークのアドレスは見に行けません' : undefined
  }
  const [a, aaaa] = await Promise.all([
    Deno.resolveDns(host, 'A').catch(() => [] as string[]),
    Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
  ])
  const ips = [...a, ...aaaa]
  if (ips.length === 0) return 'ホスト名を解決できませんでした'
  if (ips.some(isBlockedIp)) return '内部ネットワークのアドレスは見に行けません'
  return undefined
}

/** 1回の呼び出し中だけ robots.txt を覚えておく（同じサイトを何度も叩かない） */
type RobotsCache = Map<string, string>

async function robotsAllows(url: URL, cache: RobotsCache): Promise<boolean> {
  const origin = url.origin
  let txt = cache.get(origin)
  if (txt === undefined) {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      })
      // robots.txt が無い(404)なら制限なしとして扱うのが慣例
      txt = res.ok ? (await res.text()).slice(0, 100_000) : ''
    } catch {
      txt = ''
    }
    cache.set(origin, txt)
  }
  return isAllowedByRobots(txt, url.pathname)
}

/** 本文を上限バイト数まで読む。巨大ファイルでメモリを食い潰さないため */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  await reader.cancel().catch(() => {})
  const buf = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    const take = Math.min(c.length, total - off)
    buf.set(c.subarray(0, take), off)
    off += take
    if (off >= total) break
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf)
}

export type PageResult = { ok: true; html: string; finalUrl: string } | { ok: false; error: string }

/**
 * ページを取得する。リダイレクトは手動で追い、ホップごとに検査をやり直す
 * （最初のURLだけ検査して 302 で内部へ飛ばされる、という抜け道を塞ぐため）。
 */
export async function fetchPage(rawUrl: string, cache: RobotsCache): Promise<PageResult> {
  let current = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const shape = checkUrlShape(current)
    if (!shape.ok) return { ok: false, error: shape.reason }

    const blocked = await blockedHostReason(shape.url.hostname)
    if (blocked) return { ok: false, error: blocked }

    if (!(await robotsAllows(shape.url, cache))) {
      return { ok: false, error: 'このサイトは自動での取得を許可していません' }
    }

    let res: Response
    try {
      res = await fetch(shape.url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en;q=0.8',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (e) {
      const msg = e instanceof Error && e.name === 'TimeoutError' ? '時間内に応答がありませんでした' : 'ページに接続できませんでした'
      return { ok: false, error: msg }
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      await res.body?.cancel().catch(() => {})
      if (!loc) return { ok: false, error: 'リダイレクト先が分かりませんでした' }
      current = new URL(loc, shape.url).toString()
      continue
    }

    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      return { ok: false, error: `ページを取得できませんでした (${res.status})` }
    }

    const type = res.headers.get('content-type') ?? ''
    if (type && !/text\/html|text\/plain|application\/xhtml|application\/xml|\+xml/i.test(type)) {
      await res.body?.cancel().catch(() => {})
      return { ok: false, error: 'HTMLではないので中身を見られませんでした' }
    }

    return { ok: true, html: await readCapped(res), finalUrl: shape.url.toString() }
  }
  return { ok: false, error: 'リダイレクトが多すぎます' }
}
