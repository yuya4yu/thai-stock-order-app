# スプレッドシート連携の設定手順

アプリから直接Googleドライブには書き込めないため、スプレッドシート側に受け口を1つ作ります。作業は最初の1回だけで、5分ほどで終わります。

## 手順

1. Googleドライブで新しいスプレッドシートを作り、名前を付けます（例：`在庫記録 / บันทึกสต๊อก`）。
2. メニューの「拡張機能」→「Apps Script」を開きます。
3. 出てきたコード（`function myFunction() {}`）をすべて消して、下のコードを貼り付けます。
4. 保存（フロッピーのアイコン）します。
5. 右上の「デプロイ」→「新しいデプロイ」を選びます。
6. 歯車アイコン →「ウェブアプリ」を選択。
7. 「次のユーザーとして実行」＝**自分**、「アクセスできるユーザー」＝**全員**にします。
8. 「デプロイ」を押し、権限の確認画面で承認します（「詳細」→「安全でないページに移動」と出ますが、自分で書いたスクリプトなので問題ありません）。
9. 表示された **ウェブアプリのURL**（`https://script.google.com/macros/s/.../exec`）をコピーします。
10. アプリの「設定 / ตั้งค่า」画面の「Google Apps ScriptのURL」に貼り付けます。

これで、発注リスト画面の「บันทึกลงชีต / シートに保存」を押すとスプレッドシートに行が追加されます。

> コードを後から変更したときは、「デプロイ」→「デプロイを管理」→ 鉛筆アイコン →「バージョン」を「新バージョン」にして再デプロイしてください。URLは変わりません。

## 貼り付けるコード

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

現在の計算は「前回発注した分がすべて納品された」という前提です。欠品・納期遅れ・分納があるとずれます。納品時に実数を入力する画面を足せば正確になるので、必要であれば言ってください。
