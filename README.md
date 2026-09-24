# app-kit

個人アプリを作って App Store に出すまでの、使い回せる部品と踏んだ地雷の記録。

倉庫番（2026-09 審査提出）と Tsuuchi（同時期に開発中止）から抽出した。
**コードより `docs/` の方が価値がある**かもしれない。

## 中身

| | 中身 |
| --- | --- |
| [`asc-drive/`](./asc-drive/) | App Store Connect / AdMob をブラウザ自動操作する最小ドライバ。公開 API が無い管理画面向け |
| [`expo-supabase-push/`](./expo-supabase-push/) | 定期実行 → Push の backend 雛形。匿名認証ベースの RLS、pg_cron、Expo Push |
| [`fetch-sandbox/`](./fetch-sandbox/) | 任意 URL を安全に取得する。SSRF 対策・robots 尊重・本文抽出・指紋。テスト 22 件 |
| [`docs/ios-release.md`](./docs/ios-release.md) | 審査提出までの手順と、実際に踏んだ地雷 |
| [`docs/honest-capability.md`](./docs/honest-capability.md) | 実装できることしか名乗らせない設計。通知アプリ以外にも効く |

## 特に効いたもの

**[ios-release.md](./docs/ios-release.md)** — サポート/プライバシー URL が 404 のまま提出しかけた話、
IAP 未実装で課金 UI を出すとリジェクトされる話、AdMob の「要審査」はリジェクトではない話、
リモート Push は Expo Go でもシミュレータでも検証できない話。全部実際に踏んだ。

**[fetch-sandbox](./fetch-sandbox/)** — ユーザーが URL を指定できる機能を作るなら必ず要る。
自前で書くと `169.254.169.254` とリダイレクト経由の抜け道を落としがち。

**[honest-capability.md](./docs/honest-capability.md)** — 「原理的にできる」を
ユーザーへの約束にしてしまった話。23 ジャンル中 9 件が「見てるよ」と言いながら
一度も動いていなかった。

## 使うときの注意

`fetch-sandbox/config.ts` の User-Agent と連絡先は**必ず自分のものに書き換えること**。
相手のサーバー管理者が「これは何者で、止めたいときどこに言えばいいか」を判断できるようにするのが礼儀で、
実務上もブロックされにくくなる。

## これは何ではないか

**個人の作業記録であって、メンテナンスされるライブラリではありません。**
Issue や Pull Request への対応はお約束できません。役に立ちそうなら、
fork するかコピーして自由に使ってください。

セキュリティ上の問題（特に `fetch-sandbox` の SSRF 判定の穴）を見つけた場合は、
Issue で教えていただけると助かります。既知の限界は
[fetch-sandbox/README.md](./fetch-sandbox/README.md) に書いてあります。

## ライセンス

MIT（[LICENSE](./LICENSE)）
