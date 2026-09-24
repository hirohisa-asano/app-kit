// このテンプレートを使うときに書き換える設定。
//
// UA には必ず連絡先を入れること。相手のサーバー管理者が
// 「これは何者で、止めたいときどこに言えばいいか」を判断できるようにするのが礼儀で、
// 実務上もブロックされにくくなる。

/** 相手サーバーに名乗る User-Agent */
export const USER_AGENT = 'YourBot/1.0 (+https://example.com/about-our-bot)'

/** robots.txt の `User-agent:` 行で自分を指す名前（小文字で比較する） */
export const BOT_NAME = 'yourbot'

/** 1ページあたりの取得上限 */
export const MAX_BYTES = 2 * 1024 * 1024
/** 1ページあたりのタイムアウト */
export const FETCH_TIMEOUT_MS = 15_000
/** 手動で追うリダイレクトの上限。各ホップでSSRF判定をやり直す */
export const MAX_REDIRECTS = 3
