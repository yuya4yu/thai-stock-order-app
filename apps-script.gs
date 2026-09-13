/**
 * 在庫記録 / บันทึกสต๊อก 受け口（Google Apps Script）
 *
 * 使い方：このファイルの中身を「すべて」コピーして、
 *   スプレッドシート → 拡張機能 → Apps Script を開き、
 *   もとからある function myFunction() {} を消してから貼り付けて保存する。
 *
 * ※ Markdown の ``` で始まる行は絶対に貼り付けないこと。
 *    貼り付けると TypeError: "" is not a function というエラーになる。
 *    このファイルはそのまま貼れるように、``` を含めていない。
 */

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

    // 同じ送信を二重に記録しない（通信の再送やボタンの二度押し対策）
    if (data.batchId && isDuplicate_(data.batchId)) {
      return json_({ ok: true, added: 0, duplicate: true });
    }

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
    if (data.batchId) markSeen_(data.batchId);
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

// 受け取り済みの送信IDを覚えておき、同じものが来たら書き込まない
function isDuplicate_(batchId) {
  const seen = PropertiesService.getScriptProperties().getProperty('SEEN_BATCHES') || '';
  return seen.split(',').indexOf(batchId) >= 0;
}

function markSeen_(batchId) {
  const props = PropertiesService.getScriptProperties();
  const seen = (props.getProperty('SEEN_BATCHES') || '').split(',').filter(String);
  seen.push(batchId);
  props.setProperty('SEEN_BATCHES', seen.slice(-300).join(','));
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
