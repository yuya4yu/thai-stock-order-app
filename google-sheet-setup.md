# スプレッドシート連携の設定手順

アプリから直接Googleドライブには書き込めないため、スプレッドシート側に受け口を1つ作ります。作業は最初の1回だけで、5分ほどで終わります。

> **シートは未接続でも使えます。** 「発注を記録する」を押せば、発注内容・前回在庫・使用履歴は端末に記録され、納品画面と自動提案は動きます。シートを繋ぐと、それに加えて端末の外にも履歴が残り、複数店舗の集計ができるようになります。

## 手順

1. 記録用のスプレッドシートを用意します。
   すでに作成済み：**在庫記録 / บันทึกสต๊อก**
   https://docs.google.com/spreadsheets/d/1QH2Z0FOG9tGVe6VYj-4A_kyg4IH3TtNOahL1QRDf5t0/edit
   （新しく作る場合は、Googleドライブで空のスプレッドシートを作って名前を付けます）
2. メニューの「拡張機能」→「Apps Script」を開きます。
3. 出てきたコード（`function myFunction() {}`）をすべて消して、**`apps-script.gs` の中身をすべて**コピーして貼り付けます。

   > **注意：`` ``` `` で始まる行は貼り付けないでください。** 下の「貼り付けるコード」はMarkdownの表示用に `` ``` `` で囲んであります。この記号ごと貼ると `TypeError: "" is not a function（行 1）` というエラーになります。そのまま貼れる状態のものを同じフォルダの **`apps-script.gs`** に置いてあるので、そちらを開いて全選択・コピーするのが確実です。
4. 保存（フロッピーのアイコン）します。
5. 右上の「デプロイ」→「新しいデプロイ」を選びます。
6. 歯車アイコン →「ウェブアプリ」を選択。
7. 「次のユーザーとして実行」＝**自分**、「アクセスできるユーザー」＝**全員**にします。
8. 「デプロイ」を押し、権限の確認画面で承認します（「詳細」→「安全でないページに移動」と出ますが、自分で書いたスクリプトなので問題ありません）。
9. 表示された **ウェブアプリのURL**（`https://script.google.com/macros/s/.../exec`）をコピーします。
10. アプリの「設定 / ตั้งค่า」画面の「Google Apps ScriptのURL」に貼り付けます。

これで、発注リスト画面の「บันทึกการสั่งซื้อ / 発注を記録する」を押すと、端末への記録に加えてスプレッドシートにも行が追加されます。

## コードを直したあとは再デプロイが必要です

コードを編集しただけでは公開されているウェブアプリは変わりません。

1. 右上「デプロイ」→「デプロイを管理」
2. 鉛筆アイコン（編集）
3. **バージョン** を「新バージョン」に変更
4. 「デプロイ」を押す

URLは変わりません。直ったかどうかは、ウェブアプリのURLをブラウザで開いて `{"ok":true,"message":"ready"}` と表示されるかで確認できます。

## 送信に失敗したとき

通信が届かなかった場合も、発注内容は端末に記録されます。発注リスト画面に「シートに未送信のデータが◯件あります」と出るので、電波が戻ってから「未送信分を送る」を押せば送信できます（直近20件まで保持）。

> コードを後から変更したときは、「デプロイ」→「デプロイを管理」→ 鉛筆アイコン →「バージョン」を「新バージョン」にして再デプロイしてください。URLは変わりません。

## 貼り付けるコード（表示用。実際は `apps-script.gs` からコピーしてください）

```javascript
const HEADERS = [
  '日付/วันที่', '時刻/เวลา', '店舗/สาขา',
  '仕入先ID', '仕入先/ซัพพลายเออร์', '仕入先(JA)',
  '品目ID', '品目/รายการ', '品目(JA)', '区分/หมวด', '単位/หน่วย',
  '前回在庫/สต๊อกครั้งก่อน', '入荷/รับเข้า', '今回在庫/สต๊อกวันนี้',
  '使用量(概算)/ใช้ไป', '基準/มาตรฐาน',
  '発注数/สั่งซื้อ', '単価/ราคาต่อหน่วย', '金額/มูลค่า', '通貨/สกุลเงิน'
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 明細シート（追記していく元データ）
    const sh = getSheet_(ss, 'LOG');
    const rows = (data.rows || []).map(r => ([
      r.date, r.time, r.store,
      r.supplierId, r.supplier, r.supplierJa,
      r.itemId, r.item, r.itemJa, r.category, r.unit,
      r.prevStock, r.received, r.stock,
      r.used, r.par,
      r.order, r.price, r.amount, r.currency
    ]));
    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    }
    return json_({ ok: true, added: rows.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, message: 'ready' });
}

function getSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## 記録される列

| 列 | 内容 |
|---|---|
| 品目ID / 仕入先ID | 名前を変えても変わらない識別子。集計はこの列を基準にする |
| 前回在庫 | 前回保存したときの在庫数 |
| 入荷 | 前回の発注数（納品された前提の概算） |
| 今回在庫 | 今回数えた在庫数 |
| 使用量(概算) | 前回在庫 ＋ 入荷 − 今回在庫 |
| 発注数 / 金額 | 今回の発注数と概算金額 |

「使用量(概算)」が、食材の流れを見るための中心の列です。ピボットテーブルで品目×週にすると、消費量の推移とロスの傾向が見えます。

集計するときは、行に「品目ID」を置き、表示名として「品目/รายการ」または「品目(JA)」を添えてください。品目名を後から変更しても、IDが同じであれば過去の記録とつながります。逆に、品目を削除して作り直すと新しいIDになるため履歴は分かれます。名前や単価を変えたいだけのときは、削除せず編集してください。

## 使用量を正確にするには

アプリの「รับของ / 納品」画面で、実際に届いた数量を入力してください。入力した値がそのまま「入荷」列に入り、使用量が正確になります。

- 「シートに保存」を押した時点の発注内容が、納品画面に一覧として出ます。
- 発注どおり届いた場合は、画面上部の「ได้รับครบตามที่สั่ง / すべて発注どおり」を1回押せば全品目に入ります。
- 欠品・分納があった品目だけ、数量を書き換えます。不足・超過はその場に赤／黄で表示されます。
- 納品数を入力しないまま次回のカウントを保存した場合は、従来どおり「発注数どおり届いた」ものとして計算します（旧データとの互換のため）。

Apps Script 側のコードと列構成の変更は不要です。「入荷/รับเข้า」列の意味が「前回の発注数」から「実際に届いた数量」に変わるだけです。
