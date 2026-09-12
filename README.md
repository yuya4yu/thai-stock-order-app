# 発注アプリ（タイ店舗向け在庫・発注管理）

タイの店舗スタッフがスマホから在庫を記録し、発注数を計算するための単一HTMLアプリ。
記録は Google スプレッドシートに送信される（`google-sheet-setup.md` 参照）。

- `stock-order-app.html` … アプリ本体
- `index.html` … `stock-order-app.html` へのリダイレクト（GitHub Pagesのルートアクセス用）
- `google-sheet-setup.md` … Google Apps Script 側のセットアップ手順

## 公開URL
GitHub Pages: `https://yuya4yu.github.io/thai-stock-order-app/`

## Claude Code スマホ運用セット
このリポジトリには、Claude Code の Remote Control でスマホから運用するための設定一式が含まれる。

- `.mcp.json` … GitHub / Playwright / Context7 の各MCP
- `CLAUDE.md` … concise-mode・mobile-check・push-notify・GitHub運用のルール
- `.claude/settings.json` … 承認待ち・完了時にスマホへ通知するフック
- `.claude/commands/mobile-check.md` … `/mobile-check` カスタムコマンド
- `scripts/notify.sh` … LINE公式アカウント（Messaging API）に通知を送るスクリプト

### セットアップ手順
1. `chmod +x scripts/notify.sh`
2. 環境変数を設定する（`~/.claude/settings.json` の `"env"` か、シェルの `export`）:
   - `GITHUB_TOKEN` … GitHub PAT（`.mcp.json`が参照。`repo`スコープがあればOK）
   - `LINE_MESSAGING_TOKEN` / `LINE_MESSAGING_TO` … LINE公式アカウントのMessaging API
     （LINE Developersコンソールでチャネルを作成し、チャネルアクセストークンと
     送信先ユーザーIDを取得する。LINE Notifyは2025年3月末で終了済み）
3. プロジェクトディレクトリで `claude` を起動 → `/mcp` で `.mcp.json` のサーバーを承認。
4. スマホから操作したい時は、ターミナルで `claude remote-control`（既存セッションなら `/rc`）を実行し、
   表示されたQRコードをClaudeアプリでスキャンする。

### 注意点
- リポジトリは公開（public）。品目・仕入先・単価データがコードに含まれるが、公開して問題ない前提で運用している。
- main にマージすると GitHub Pages が自動更新される。UI変更後は `/mobile-check` を公開URLでも再実行すること。
