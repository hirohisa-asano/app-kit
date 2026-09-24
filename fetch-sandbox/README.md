# fetch-sandbox

任意の URL を安全に取得するためのサンドボックス。SSRF 対策・robots.txt 尊重・
本文抽出・差分用の指紋まで。Deno（Supabase Edge Function）想定だが、
純粋部分は Node からも読める。

```
config.ts    書き換える設定（UA、bot 名、上限値）
sandbox.ts   Deno 非依存の純粋部分。テストはここに寄せてある
fetchpage.ts DNS 解決を伴う SSRF 判定と実際の取得
__tests__/   22 件（SSRF・robots・抽出・指紋）
```

```bash
npm install && npm test
```

## 何を防いでいるか

**SSRF** — ユーザーが URL を指定できる機能は、そのままだと社内 API や
クラウドのメタデータエンドポイント（`169.254.169.254`）を踏ませる踏み台になる。

- http / https 以外を拒否
- **DNS 解決後の全 IP** を検査する。`internal.example.com A 10.0.0.1` のように
  公開 DNS が内部 IP を返す形も弾ける
- IPv4 射影アドレス（`::ffff:127.0.0.1`）も展開して判定
- **リダイレクトは手動で追い、ホップごとに検査をやり直す。**
  最初の URL だけ見て 302 で内部へ飛ばされる、が典型的な抜け道

**礼儀** — robots.txt の Disallow を尊重し、UA に連絡先を入れ、
サイズ・時間・リダイレクト回数に上限を置く。

## 差分検知に使うときの注意

生の HTML を比べると、広告・CSRF トークン・時計だけで毎回「変わった」と判定される。
`extractText` で script / style / コメントを落とし、`stripVolatile` で
日付・時刻・長い16進を伏せてから指紋を取ること。

**初回は指紋を記録するだけにして、通知は出さないこと。**

## 残っている限界

- **DNS リバインディング** — 解決と fetch の間に応答を差し替える攻撃は防げていない。
  塞ぐには解決済み IP へ直接接続して Host ヘッダを付ける必要がある
- JavaScript で描画されるページは取得できない（HTML しか見ない）
