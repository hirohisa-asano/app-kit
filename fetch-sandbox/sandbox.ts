// ページ取得サンドボックスの純粋部分（SSRF判定・robots・本文抽出・指紋）。
//
// Deno 固有APIを使わないこと。ここは vitest からも読み込んでテストしている。
// DNS解決を伴うSSRF判定だけは呼び出し側（index.ts）がリゾルバを注入する。

import { BOT_NAME } from './config.ts'

/** IPv4 文字列を 32bit 整数にする。表記が不正なら undefined */
function ipv4ToInt(ip: string): number | undefined {
  const parts = ip.split('.')
  if (parts.length !== 4) return undefined
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return undefined
    const v = Number(p)
    if (v > 255) return undefined
    n = n * 256 + v
  }
  return n
}

/** 外部から到達すべきでないIPv4レンジ（CIDR: [先頭アドレス, プレフィックス長]） */
const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // このネットワーク
  ['10.0.0.0', 8], // プライベート
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // ループバック
  ['169.254.0.0', 16], // リンクローカル（169.254.169.254 = クラウドのメタデータ）
  ['172.16.0.0', 12], // プライベート
  ['192.0.0.0', 24], // IETF
  ['192.168.0.0', 16], // プライベート
  ['198.18.0.0', 15], // ベンチマーク
  ['224.0.0.0', 4], // マルチキャスト
  ['240.0.0.0', 4], // 予約
]

/**
 * 内部ネットワークを指すIPかどうか。
 * SSRF（社内APIやクラウドのメタデータエンドポイントを踏ませる攻撃）を防ぐための判定。
 */
export function isBlockedIp(ip: string): boolean {
  const v4mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  const target = v4mapped ? v4mapped[1] : ip

  const n = ipv4ToInt(target)
  if (n !== undefined) {
    return BLOCKED_V4.some(([base, bits]) => {
      const b = ipv4ToInt(base)!
      const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0
      return (n & mask) >>> 0 === (b & mask) >>> 0
    })
  }

  // IPv6
  const v6 = ip.toLowerCase()
  if (v6 === '::' || v6 === '::1') return true
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true // fc00::/7 ユニークローカル
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return true // fe80::/10 リンクローカル
  return false
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

/**
 * DNSを引かずに済む範囲でURLを検査する。
 * スキームと、IPリテラル直書きのホストだけここで弾く。
 */
export function checkUrlShape(raw: string): UrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'URLとして読めませんでした' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'http/https 以外は見に行けません' }
  }
  // ホストがIPリテラルなら、DNSを引くまでもなくここで判定できる
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (isBlockedIp(host)) return { ok: false, reason: '内部ネットワークのアドレスは見に行けません' }
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return { ok: false, reason: '内部ネットワークのアドレスは見に行けません' }
  }
  return { ok: true, url }
}

/**
 * robots.txt の Disallow を（User-agent: * と自分のUA名について）素朴に解釈する。
 * 完全な実装ではないが、明示的に拒否されているパスは踏まない。
 */
export function isAllowedByRobots(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split(/\r?\n/)
  let applies = false
  const disallow: string[] = []
  const allow: string[] = []
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === 'user-agent') {
      applies = value === '*' || value.toLowerCase() === BOT_NAME
    } else if (applies && key === 'disallow' && value) {
      disallow.push(value)
    } else if (applies && key === 'allow' && value) {
      allow.push(value)
    }
  }
  // Allow がより長く一致するなら許可（robots.txt の一般的な優先規則）
  const longest = (rules: string[]) =>
    rules.filter((r) => path.startsWith(r)).reduce((a, b) => (b.length > a.length ? b : a), '')
  const d = longest(disallow)
  const a = longest(allow)
  if (!d) return true
  return a.length >= d.length
}

/**
 * HTML から比較用の本文テキストを取り出す。
 * script/style/noscript/svg と HTMLコメントを落とし、タグを剥がして空白を潰す。
 * ここを通さないと、広告やCSRFトークンのような毎回変わる要素で差分が出続ける。
 */
export function extractText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 差分判定に使わない“毎回変わる値”を伏せる。
 * これを入れないと時計やアクセスカウンタだけで「更新された」と誤通知する。
 */
export function stripVolatile(text: string): string {
  return text
    .replace(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?/g, '<date>')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, '<time>')
    .replace(/[0-9a-f]{32,}/gi, '<hex>')
}

/** 一覧・詳細に出す短い要約 */
export function summarize(text: string, max = 80): string {
  const t = text.trim()
  if (!t) return 'ページを確認したよ'
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

/** 比較用の指紋。SHA-256 の先頭16桁で十分（衝突より誤検知の方が問題になる領域） */
export async function fingerprint(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
