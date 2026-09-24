import { describe, expect, it } from 'vitest'
import {
  checkUrlShape,
  extractText,
  fingerprint,
  isAllowedByRobots,
  isBlockedIp,
  stripVolatile,
  summarize,
} from '../sandbox.ts'

describe('isBlockedIp（SSRF対策）', () => {
  it('内部ネットワークのIPv4を弾く', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // クラウドのメタデータ
      '100.64.0.1',
      '0.0.0.0',
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true)
    }
  })

  it('グローバルなIPv4は通す', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.167.1.1', '93.184.216.34']) {
      expect(isBlockedIp(ip), ip).toBe(false)
    }
  })

  it('IPv6のループバック・ローカルを弾く', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1']) {
      expect(isBlockedIp(ip), ip).toBe(true)
    }
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false)
  })

  it('IPv4射影アドレスで内部IPを隠しても弾く', () => {
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true)
    expect(isBlockedIp('::ffff:169.254.169.254')).toBe(true)
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false)
  })
})

describe('checkUrlShape', () => {
  it('http/https 以外を拒む', () => {
    for (const u of ['file:///etc/passwd', 'ftp://example.com', 'gopher://example.com']) {
      const r = checkUrlShape(u)
      expect(r.ok, u).toBe(false)
    }
  })

  it('IPリテラルで内部を指すURLを拒む', () => {
    expect(checkUrlShape('http://127.0.0.1/admin').ok).toBe(false)
    expect(checkUrlShape('http://169.254.169.254/latest/meta-data/').ok).toBe(false)
    expect(checkUrlShape('http://[::1]/').ok).toBe(false)
  })

  it('localhost と .internal を拒む', () => {
    expect(checkUrlShape('http://localhost:8000/').ok).toBe(false)
    expect(checkUrlShape('http://db.internal/').ok).toBe(false)
  })

  it('ふつうのURLは通す', () => {
    const r = checkUrlShape('https://example.com/jobs?q=1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url.hostname).toBe('example.com')
  })

  it('URLとして壊れているものを拒む', () => {
    expect(checkUrlShape('not a url').ok).toBe(false)
  })
})

describe('isAllowedByRobots', () => {
  const robots = `
User-agent: *
Disallow: /private
Allow: /private/public-part

User-agent: BadBot
Disallow: /
`
  it('Disallow のパスを踏まない', () => {
    expect(isAllowedByRobots(robots, '/private/secret')).toBe(false)
  })
  it('より長く一致する Allow を優先する', () => {
    expect(isAllowedByRobots(robots, '/private/public-part/x')).toBe(true)
  })
  it('対象外のパスは許可', () => {
    expect(isAllowedByRobots(robots, '/jobs')).toBe(true)
  })
  it('robots.txt が空なら許可', () => {
    expect(isAllowedByRobots('', '/anything')).toBe(true)
  })
  it('他UA向けの Disallow: / に引きずられない', () => {
    expect(isAllowedByRobots(robots, '/')).toBe(true)
  })
})

describe('extractText', () => {
  it('script/style の中身を落とす', () => {
    const html = `<html><head><style>.a{color:red}</style><script>var x=1</script></head>
      <body><h1>求人</h1><p>新着 3 件</p></body></html>`
    const t = extractText(html)
    expect(t).toContain('求人')
    expect(t).toContain('新着 3 件')
    expect(t).not.toContain('color:red')
    expect(t).not.toContain('var x')
  })

  it('HTMLコメントとタグを落として空白を潰す', () => {
    expect(extractText('<!-- hi --><div>  a   <b>b</b>\n\n c </div>')).toBe('a b c')
  })

  it('よく使う実体参照を戻す', () => {
    expect(extractText('<p>a&nbsp;&amp;&lt;b&gt;</p>')).toBe('a &<b>')
  })
})

describe('stripVolatile', () => {
  it('日付・時刻・長い16進を伏せる', () => {
    const a = stripVolatile('更新 2026-09-24 11:30:05 token=deadbeefdeadbeefdeadbeefdeadbeef')
    const b = stripVolatile('更新 2026-09-25 09:01:22 token=cafebabecafebabecafebabecafebabe')
    expect(a).toBe(b)
  })

  it('意味のある数字は残す', () => {
    expect(stripVolatile('新着 3 件')).toBe('新着 3 件')
  })
})

describe('fingerprint', () => {
  it('同じ内容は同じ指紋、違う内容は違う指紋', async () => {
    const a = await fingerprint('新着 3 件')
    const b = await fingerprint('新着 3 件')
    const c = await fingerprint('新着 4 件')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('summarize', () => {
  it('長い本文を切り詰める', () => {
    expect(summarize('あ'.repeat(200), 10)).toBe(`${'あ'.repeat(10)}…`)
  })
  it('空なら既定文', () => {
    expect(summarize('   ')).toBe('ページを確認したよ')
  })
})
