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
  '発注数/สั่งซื้อ', '単価/ราคาต่อหน่วย', '金額/มูลค่า', '通貨/สกุลเงิน',
  'ロット数/จำนวนล็อต', '入数/ปริมาณต่อล็อต', 'ロット単価/ราคาต่อล็อต', 'ロット単位/หน่วยล็อต'
];

function doPost(e) {
  var lineText = '';
  var result = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 同じ送信を二重に記録しない（通信の再送やボタンの二度押し対策）
    // LINEへの送信もここで止まるので、再送しても二重には飛ばない。
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
      r.order, r.price, r.amount, r.currency,
      r.lots, r.lotSize, r.lotPrice, r.lotUnit
    ]));
    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    }
    if (data.batchId) markSeen_(data.batchId);
    lineText = String(data.lineText || '');
    result = { ok: true, added: rows.length };
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }

  // LINEへの送信はロックを外してから行う（他の店舗の記録を待たせないため）。
  // ここで失敗しても、シートへの書き込みはすでに済んでいる。
  if (lineText) {
    try {
      result.line = lineSend_(lineText);
    } catch (err2) {
      result.line = { ok: false, error: String(err2) };
    }
  }
  return json_(result);
}

/**
 * 読み出し口。
 *   ?mode=history&store=<店舗名>&days=28  … その店舗の使用履歴と、直近の在庫・発注内容を返す
 *   ?mode=linetest                        … LINEへテストメッセージを送り、結果を返す
 *   ?mode=linestatus                      … LINEのトークンが設定されているかだけを返す
 *   （引数なし）                          … 疎通確認用の {"ok":true,"message":"ready"}
 * callback= が付いているときは JSONP（JavaScript）で返す。
 * ブラウザから素の fetch で読むと CORS で弾かれることがあるため、アプリ側は JSONP で読んでいる。
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.mode === 'history') {
    return reply_(p.callback, history_(String(p.store || ''), Number(p.days) || 28));
  }
  if (p.mode === 'linetest') {
    var r;
    try {
      r = lineSend_('ทดสอบการแจ้งเตือน / LINE通知のテストです\nถ้าเห็นข้อความนี้ แสดงว่าตั้งค่าเรียบร้อย / これが届いていれば設定は完了しています');
    } catch (err) {
      r = { ok: false, error: String(err) };
    }
    return reply_(p.callback, r);
  }
  if (p.mode === 'linestatus') {
    var tk = lineToken_();
    // トークンそのものは返さない。長さと末尾4文字だけで、貼り間違いかどうかを判断する
    return reply_(p.callback, {
      ok: true,
      configured: !!tk,
      length: tk.length,
      tail: tk.slice(-4)
    });
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

/* ============ LINE通知 ============
 *
 * 「発注を記録する」を押したときに、その日の発注内容を
 * LINE公式アカウント（ONIMARU）の友だち全員へ送る（ブロードキャスト）。
 *
 * チャネルアクセストークンはこのファイルには書かない。
 *   Apps Script の左メニュー「プロジェクトの設定」→「スクリプト プロパティ」で
 *   プロパティ名  LINE_CHANNEL_TOKEN
 *   値            （LINE Developers で発行した長期のチャネルアクセストークン）
 * を登録する。登録していない場合、LINE送信だけが静かに行われず、シートへの記録は通常どおり動く。
 */
var LINE_BROADCAST_URL = 'https://api.line.me/v2/bot/message/broadcast';
var LINE_TEXT_LIMIT = 4800;   // 1通あたりの上限は5000文字。余裕をみて4800で分割する
var LINE_MAX_MESSAGES = 5;    // 1回のリクエストで送れるのは5通まで

/**
 * 権限を承認するための入口。
 *
 * LINEへの送信には「外部サービスへの接続」の権限が要る。
 * この権限は、エディタから一度手で実行しないと承認できない（末尾が _ の関数は実行メニューに出ないため、
 * この関数を用意している）。
 *
 * 手順：
 *   1. エディタ上部の関数名の欄で sendLineTest を選び、「実行」を押す。
 *   2. 「承認が必要です」と出たら、アカウントを選び「詳細」→「（安全ではないページ）に移動」→「許可」。
 *   3. 実行ログに {"ok":true,...} が出れば成功。LINEにテストが届く。
 *   4. そのあと「デプロイを管理」→「新バージョン」で再デプロイする。
 */
function sendLineTest() {
  Logger.log('トークンの長さ：' + lineToken_().length + '（正しければ 172 前後）');
  var r = lineSend_('ทดสอบการแจ้งเตือน / LINE通知のテストです\nถ้าเห็นข้อความนี้ แสดงว่าตั้งค่าเรียบร้อย / これが届いていれば設定は完了しています');
  Logger.log(JSON.stringify(r));
  return r;
}

/* トークンからは空白・改行をすべて取り除く。
   PowerShellの画面で折り返して表示されたトークンをコピーすると、
   途中に改行が入ったまま貼り付けられることがあり、そのままだとLINEが401を返すため。 */
function lineToken_() {
  return String(PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN') || '')
    .replace(/\s+/g, '');
}

function lineSend_(text) {
  var token = lineToken_();
  if (!token) return { ok: false, error: 'LINE_CHANNEL_TOKEN がスクリプト プロパティに設定されていません' };

  var body = String(text || '').trim();
  if (!body) return { ok: false, error: '本文が空です' };

  var chunks = splitText_(body, LINE_TEXT_LIMIT);
  var dropped = Math.max(0, chunks.length - LINE_MAX_MESSAGES);
  chunks = chunks.slice(0, LINE_MAX_MESSAGES);

  var res = UrlFetchApp.fetch(LINE_BROADCAST_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      messages: chunks.map(function (t) { return { type: 'text', text: t }; })
    }),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  if (code === 200) return { ok: true, messages: chunks.length, dropped: dropped };
  return { ok: false, status: code, error: String(res.getContentText()).slice(0, 300) };
}

/* 長い本文を、できるだけ行の切れ目で分ける */
function splitText_(text, limit) {
  if (text.length <= limit) return [text];
  var out = [], cur = '';
  var lines = String(text).split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    while (line.length > limit) {            // 1行だけで上限を超える場合は強制的に切る
      if (cur) { out.push(cur); cur = ''; }
      out.push(line.slice(0, limit));
      line = line.slice(limit);
    }
    if (cur && cur.length + 1 + line.length > limit) { out.push(cur); cur = line; }
    else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) out.push(cur);
  return out;
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
    return sh;
  }
  // 列を増やしたとき、既にあるシートの見出し行に足りないぶんだけ書き足す
  var width = sh.getLastColumn();
  if (width < HEADERS.length) {
    var add = HEADERS.slice(width);
    sh.getRange(1, width + 1, 1, add.length).setValues([add]).setFontWeight('bold');
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
