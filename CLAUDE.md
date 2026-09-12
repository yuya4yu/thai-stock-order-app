# プロジェクト共通指示（スマホ運用モード）

## このプロジェクトについて
タイの店舗向け在庫・発注アプリ（`stock-order-app.html`、単一HTMLファイル）。
バックエンドはGoogle Apps Script（`google-sheet-setup.md`参照）。
GitHub Pagesで公開し、店舗スタッフを含む複数人がスマホのブラウザからアクセスして使う。

## 前提
このプロジェクトは Claude Code の Remote Control（`/rc` または `claude remote-control`）経由で
スマホから運用されることが多い。ソフトウェアキーボードでの長文入力は避けたいので、
以下のルールを常に守ること。

## concise-mode（回答の形式）
- 通常の説明・レビュー結果は「箇条書き3行以内」を基本とする。
- コード差分は全文を貼らず、変更点の要約＋ファイル名:行番号のみ示す。
- 詳細を知りたい場合はユーザーから追加で聞かれるので、聞かれるまで長い出力をしない。
- UIの変更を伴う作業では、必ず後述の mobile-check を実行してからスクリーンショットを提示する。

## mobile-check（表示崩れチェックのルール）
`stock-order-app.html` を編集した後、コミット・pushする前に、Playwright MCP を使って
以下3つのビューポートでスクリーンショットを撮り、崩れがないか確認する。
- 375×812（iPhone SE 相当）
- 390×844（iPhone 12/13/14 相当）
- 430×932（iPhone 14/15 Pro Max 相当）

確認方法:
1. ローカルで簡易サーバーを立てる（例: `python -m http.server 8000` をプロジェクトルートで実行し、
   `http://localhost:8000/stock-order-app.html` を開く）。
2. 上記3ビューポートでスクリーンショットを撮る。
3. main への反映後は、公開URL（GitHub Pages）でも同様に再チェックする。

チェック項目:
- 横スクロールが発生していないか（`document.body.scrollWidth` と `window.innerWidth` の比較）
- タップ可能領域（ボタン・リンク）が44×44px未満になっていないか
- 主要な要素が画面幅内に収まっているか

崩れがあれば、修正 → 再スクリーンショットを自動で繰り返す。
これは `/mobile-check` コマンド（`.claude/commands/mobile-check.md`）としても呼び出せる。

## push-notify（通知のルール）
以下のタイミングで `scripts/notify.sh` を呼び出し、スマホに通知を送ること：
- 承認待ち（ツール実行の許可待ち）になったとき
- 長時間ビルド・テストが完了したとき
- エラーで作業が止まったとき

`scripts/notify.sh "<タイトル>" "<本文>"` の形式で呼び出す。
実際の通知の発火自体は `.claude/settings.json` の Notification / Stop フックが担当するので、
エージェント側から明示的に叩く必要があるのは長時間タスクの完了報告のみ。
通知先は LINE公式アカウントのMessaging API（`LINE_MESSAGING_TOKEN` / `LINE_MESSAGING_TO`）。

## GitHub 連携
- リポジトリは公開（public）。仕入先・単価データがコード中に含まれるが、公開して問題ない前提。
- Issue からタスクを受け取ったら、着手前に対象Issueの内容を要約して確認を取る。
- 作業用ブランチを切り、完了したら PR を作成する（force push や main への直接pushはしない）。
- main にマージされると GitHub Pages が自動で更新される。マージ後は mobile-check を公開URLで再実行する。

## Web検索 / ドキュメント参照
- ライブラリのバージョンやAPI仕様は Context7 MCP で最新情報を確認してから実装する。
  記憶に頼った古い情報での実装をしない。
