# asc-drive

App Store Connect や AdMob のように、公開 API でメタデータを入れる手段が乏しい
管理画面を、ログイン済みの Chrome に CDP で繋いで自動操作するための最小ドライバ。

倉庫番と Tsuuchi の審査提出で実際に使ったもの。

## 使い方

Chrome を専用プロファイルで、リモートデバッグを有効にして起動する。

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9333 \
  --user-data-dir="$PWD/profile" \
  --no-first-run --no-default-browser-check \
  --window-size=1400,1000
```

**この Chrome で人間が 1 回ログインする**（Apple ID は 2FA があるので自動化しない）。
以降はプロファイルにセッションが残るので、コマンドで操作できる。

```bash
npm install
node drive.mjs goto "https://appstoreconnect.apple.com/apps/<ID>/distribution"
node drive.mjs shot ./shot.png
node drive.mjs eval "document.body.innerText.slice(0,2000)"
node drive.mjs fill "input[name=supportUrl]" "https://example.com/support"
node drive.mjs click "保存"
```

`CDP_URL` 環境変数でポートを変えられる（既定 `http://localhost:9333`）。

## 注意

- **セッションは数日で切れる。** ASC なら URL が `authResult=FAILED` になっていないか確認する
- ページが遅いので、`goto` の後は数秒待ってから読むこと
- フォームは**ロケールごとに別項目**のことがある。1 回保存して終わりにしない
- 保存したら必ず読み直して確認する。押せたように見えて反映されていないことがある
