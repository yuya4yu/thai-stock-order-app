# 発注アプリ スマホ運用セット 引き継ぎ

作成日: 2026-09-13

`発注アプリ_引き継ぎ書`（アプリ本体の仕様書、Googleドキュメント）の補足として、
リポジトリ管理・公開・Claude Codeによるスマホ運用の設定一式をここに記録する。
同内容をGoogleドキュメント「発注アプリ_スマホ運用セット_引き継ぎ」にも保存済み。

## 1. 現在の状態
- リポジトリ（公開）: https://github.com/yuya4yu/thai-stock-order-app
- 公開URL（GitHub Pages）: https://yuya4yu.github.io/thai-stock-order-app/
- main にマージすると GitHub Pages が自動更新される
- 品目・仕入先・単価データはコードに含まれた状態のまま公開している（社内確認・了承済み）

## 2. 含まれる設定ファイル
- [.mcp.json](.mcp.json) — GitHub / Playwright / Context7 の各MCPサーバー
- [CLAUDE.md](CLAUDE.md) — concise-mode・mobile-check・push-notify・GitHub運用のルール
- [.claude/settings.json](.claude/settings.json) — 承認待ち・完了時の通知フック
- [.claude/commands/mobile-check.md](.claude/commands/mobile-check.md) — `/mobile-check` コマンド
- [scripts/notify.sh](scripts/notify.sh) — LINE公式アカウント（Messaging API）への通知スクリプト

## 3. 残っている作業（未対応）

- [ ] **GITHUB_TOKEN** 環境変数の設定
  GitHubでPersonal Access Token（`repo`スコープ）を発行し、
  `~/.claude/settings.json` の `"env"` かシェルの `export` で設定する。
- [ ] **LINE通知の設定**（LINE公式アカウント Messaging API）
  1. [LINE Developers](https://developers.line.biz/)でチャネルを作成
  2. チャネルアクセストークンを発行
  3. 通知先ユーザーIDを取得
  4. `LINE_MESSAGING_TOKEN` / `LINE_MESSAGING_TO` を環境変数に設定
  ※アカウント・チャネルの新規作成が伴うため要ユーザー対応
- [ ] `chmod +x scripts/notify.sh`（Mac/Linux環境のみ。Windows単体では不要）

## 4. 今後の運用の流れ
- UI変更はブランチを切り、PR経由でmainにマージする（force push・直接pushはしない）
- UI変更後は `/mobile-check` でローカルと公開URL双方の表示崩れを確認する
- スマホから操作する場合は `claude remote-control`（既存セッションなら `/rc`）でQRコードを表示し、
  Claudeアプリでスキャンする

## 5. 注意点
- Google Drive同期フォルダ内でgit管理しているため、大きな変更をコミットする際は同期完了後に行うと安全
- リポジトリが公開のため、仕入先・単価データも第三者から閲覧可能。非公開化が必要になった場合は
  GitHub Pagesの無料公開が使えなくなるため、ホスティング方法の見直しが必要
  （Google Apps Scriptでの組織内限定公開などを検討）
