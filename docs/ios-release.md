# iOS アプリを審査に出すまで

倉庫番（2026-09、審査提出済み）と Tsuuchi（同、提出直前まで）で 2 回通した手順と、
そのとき実際に踏んだ地雷。**地雷の方が本体。**

## 全体の順番

1. Expo プロジェクト作成 → `app.json` に `bundleIdentifier` / `owner`
2. Apple Developer Program 加入（年 $99、審査に数日かかることがある）
3. App Store Connect でアプリレコードを作成 → `ascAppId` を控える
4. `eas.json` に `production` プロファイル、`submit.production.ios.ascAppId` を書く
5. `eas build -p ios --profile production`（初回は Apple ID の対話認証。以降は非対話で回せる）
6. `eas submit -p ios --latest` → TestFlight に上がる
7. ASC でメタデータ・スクショ・App Privacy を埋める
8. 「審査用に追加」→ 提出

## 踏んだ地雷

### サポート URL / プライバシー URL が 404 のまま提出しかける

Apple は審査で**この 2 つに必ずアクセスする**。404 なら落ちる。

倉庫番では、ASC に登録した URL が `asano0712.github.io/...` だったのに、
リポジトリは別アカウント（`hirohisa-asano`）にあった。**そのアカウントには public リポジトリが
1 つも無く、URL は永久に 404 だった。** 提出前に気づいたので助かった。

- 提出前に `curl -o /dev/null -w "%{http_code}"` で両方 200 を確認する
- **ロケールごとに別項目**。英語（アメリカ）と日本語で 2 回ずつ、計 4 箇所ある
- 日本語のプライバシー URL は**空欄のまま**になっていた（気づきにくい）

### GitHub Pages の有効化を忘れる

`privacy.html` をリポジトリに置いただけでは公開されない。Pages を有効化して、
ビルドが終わるまで数分待つ必要がある。

```bash
gh api -X POST repos/OWNER/REPO/pages -f 'source[branch]=main' -f 'source[path]=/'
```

### IAP 未実装のまま課金 UI を出すとリジェクト

ガイドライン 3.1.1。課金 UI があるのに購入できないと落ちる。
環境変数でまるごと隠し、初版は全機能無料で出すのが安全。

```
EXPO_PUBLIC_BILLING=0   # eas.json の production.env に書く
```

デモ用のトリガーボタンやシードデータも同様に隠す。

### リリース方法を「手動」にしていると、承認後も公開されない

承認メールが来たあと、ASC で自分で「リリース」を押す必要がある。
意図的ならよいが、忘れると「審査は通ったのに並ばない」状態になる。

### スクリーンショットのサイズ

6.9 インチ（1320×2868）が必須。実機が Pro Max でないなら、
Simulator の iPhone 16 Pro Max で撮る。

```bash
xcrun simctl io <UDID> screenshot out.png
sips -Z ... # 必要ならリサイズ
```

シミュレータ用ビルドは `eas.json` に `simulator` プロファイルを足しておくと取れる。

## AdMob を使う場合

- アプリ一覧の **「要審査」はリジェクトではない**。「ストア情報未登録につき広告配信を制限」
  という意味で、App Store 公開後にストアを紐付ければ解消する。赤い警告アイコンが出るので
  リジェクトに見えるが、対応は不要
- ポリシーセンターに違反が出ていないかだけ確認すればよい
- 開発・TestFlight 中は**必ずテスト広告 ID を使う**。自分の実広告を自分でタップすると
  アカウント停止のリスクがある

## リモート Push

- **Expo Go では検証できない。** SDK 53 でリモート通知機能が Expo Go から削除された。
  development build か TestFlight ビルドが要る
- **シミュレータはリモート Push を受信できない。** 実機必須
- 送信結果はチケットではなくレシートで見る。チケットが `ok` でも APNs 側で落ちている

```bash
# 送信 → id が返る
curl -X POST https://exp.host/--/api/v2/push/send -H "Content-Type: application/json" \
  -d '[{"to":"ExponentPushToken[...]","title":"t","body":"b"}]'
# 数秒後にレシート
curl -X POST https://exp.host/--/api/v2/push/getReceipts -H "Content-Type: application/json" \
  -d '{"ids":["<id>"]}'
```

`BadDeviceToken` が返る場合、**APNs キー自体は設定できている**（Expo が APNs と通信できて
トークン単位のエラーが返っているため）。トークンが失効しているか、
sandbox / production の環境が噛み合っていない。

APNs キーが無い場合は `eas credentials -p ios`（対話）で追加する。
鍵は Expo サーバー側に置かれ、トークン発行はアプリ側なので**再ビルドは不要**。

## ASC のブラウザ自動操作

ASC には公開 API でメタデータを入れる手段が限られる。Playwright を CDP で
既存の Chrome に繋ぐと、ログイン済みセッションのまま自動入力できる。
→ [`../asc-drive/`](../asc-drive/)

2FA は人間が 1 回通す必要がある。セッションは数日で切れるので、
再開時は `authResult=FAILED` になっていないか確認する。
