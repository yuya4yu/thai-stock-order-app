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

/**
 * 読み出し口。
 *   ?mode=history&store=<店舗名>&days=28  … その店舗の使用履歴と、直近の在庫・発注内容を返す
 *   （引数なし）                          … 疎通確認用の {"ok":true,"message":"ready"}
 * callback= が付いているときは JSONP（JavaScript）で返す。
 * ブラウザから素の fetch で読むと CORS で弾かれることがあるため、アプリ側は JSONP で読んでいる。
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.mode === 'history') {
    return reply_(p.callback, history_(String(p.store || ''), Number(p.days) || 28));
  }
  return reply_(p.callback, { ok: true, message: 'ready' });
}

/**
 * LOGシートから、指定した店舗の使用履歴を組み立て直す。
 * 「何日分を使ったか」はシートに列が無いため、同じ品目の記録を日付順に並べ、
 * 1つ前の記録との日数の差から計算する（アプリが記録時に行っているのと同じ計算）。
 */
function history_(store, days) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('LOG');
    if (!sh || sh.getLastRow() < 2) return { ok: true, rows: [], prev: [] };

    var values = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
    var byItem = {};
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      if (store && String(r[2] || '') !== store) continue;   // 3列目＝店舗
      var id = String(r[6] || '');                           // 7列目＝品目ID
      var d = dateStr_(r[0]);                                // 1列目＝日付
      if (!id || !d) continue;
      if (!byItem[id]) byItem[id] = [];
      byItem[id].push({ d: d, t: String(r[1] || ''), used: r[14], stock: r[13], order: r[16] });
    }

    var limit = new Date();
    limit.setDate(limit.getDate() - days);
    var from = Utilities.formatDate(limit, tz_(), 'yyyy-MM-dd');

    var rows = [], prev = [];
    var ids = Object.keys(byItem);
    for (var k = 0; k < ids.length; k++) {
      var list = byItem[ids[k]].sort(function (a, b) {
        return (a.d + ' ' + a.t) < (b.d + ' ' + b.t) ? -1 : 1;
      });
      for (var j = 1; j < list.length; j++) {
        if (list[j].used === '' || list[j].used === null) continue;
        var used = Number(list[j].used);
        if (isNaN(used)) continue;
        var gap = dayGap_(list[j - 1].d, list[j].d);
        if (!(gap > 0 && gap <= 90)) continue;               // 同日・間隔が空きすぎの記録は使わない
        if (list[j].d < from) continue;
        rows.push({ id: ids[k], d: list[j].d, used: used, days: gap });
      }
      var last = list[list.length - 1];
      prev.push({ id: ids[k], stock: numOr_(last.stock), order: numOr_(last.order), date: last.d });
    }
    return { ok: true, rows: rows, prev: prev, store: store };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function tz_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Asia/Bangkok';
}

function dateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function dayGap_(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

function numOr_(v) {
  var n = Number(v);
  return (v === '' || v === null || isNaN(n)) ? '' : n;
}

function reply_(callback, obj) {
  var body = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
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
