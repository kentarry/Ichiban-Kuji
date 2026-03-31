// ============================================================
// 一番賞抽籤 / 刮刮樂 — Google Apps Script 後端 v3
// 新增：機率分配、金額設定、多抽、併發處理
// ============================================================

const SS_ID = '1ben31KoUoQn6U_XDzlk-AiR9FTHx2IXEQyqcuh_hhPg';
const USERS_SHEET = '_Users';
const INDEX_SHEET = '_Index';

function doGet(e)  { return handleRequest(e, 'GET');  }
function doPost(e) { return handleRequest(e, 'POST'); }

function handleRequest(e, method) {
  let params;
  if (method === 'POST' && e.postData) {
    try { params = JSON.parse(e.postData.contents); } catch(_) { params = e.parameter || {}; }
  } else { params = e.parameter || {}; }
  let result;
  try {
    switch (params.action) {
      case 'init':              result = initSheets(); break;
      case 'register':          result = register(params.username, params.password); break;
      case 'login':             result = login(params.username, params.password); break;
      case 'getActivities':     result = getActivities(); break;
      case 'verifyActivity':    result = verifyActivity(params.sheetName, params.password); break;
      case 'createActivity':    result = createActivity(typeof params.data === 'string' ? JSON.parse(params.data) : params.data); break;
      case 'getActivityDetail': result = getActivityDetail(params.sheetName); break;
      case 'drawPrize':         result = drawPrize(params.sheetName, params.playerName, params.ticketIndices); break;
      case 'scratchNumber':     result = scratchNumber(params.sheetName, parseInt(params.number), params.playerName); break;
      case 'getDrawLog':        result = getDrawLog(params.sheetName); break;
      case 'resetActivity':     result = resetActivity(params.sheetName); break;
      case 'deleteActivity':    result = deleteActivity(params.sheetName); break;
      default: result = { success: false, error: '未知操作' };
    }
  } catch (err) { result = { success: false, error: err.toString() }; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// ── 初始化 ────────────────────────────────────────────────

function ensureInit() {
  const ss = SpreadsheetApp.openById(SS_ID);
  if (!ss.getSheetByName(USERS_SHEET)) {
    const s = ss.insertSheet(USERS_SHEET);
    s.appendRow(['帳號', '密碼', '建立時間']);
    s.setFrozenRows(1);
  }
  if (!ss.getSheetByName(INDEX_SHEET)) {
    const s = ss.insertSheet(INDEX_SHEET);
    s.appendRow(['活動ID','活動名稱','類型','建立時間','總數量','已抽出','狀態','大獎剩餘','頁籤名稱','建立者','活動密碼','單抽價格','多抽數量','多抽價格']);
    s.setFrozenRows(1);
  }
  return ss;
}

function initSheets() { ensureInit(); return { success: true }; }

// ── 註冊 & 登入 ──────────────────────────────────────────

function register(username, password) {
  if (!username || !password) return { success: false, error: '請填寫帳號密碼' };
  if (String(password).length < 4) return { success: false, error: '密碼至少4個字元' };
  const ss = ensureInit();
  const sheet = ss.getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(username).trim()) return { success: false, error: '此帳號已存在' };
  }
  sheet.appendRow([username.trim(), password.trim(), Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm')]);
  return { success: true, message: '註冊成功' };
}

function login(username, password) {
  const ss = ensureInit();
  const sheet = ss.getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(username).trim() && String(data[i][1]).trim() === String(password).trim()) {
      return { success: true, username: data[i][0] };
    }
  }
  return { success: false, error: '帳號或密碼錯誤' };
}

// ── 活動列表（公開） ─────────────────────────────────────

function getActivities() {
  const ss = ensureInit();
  const sheet = ss.getSheetByName(INDEX_SHEET);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, activities: [] };
  const activities = [];
  for (let i = 1; i < data.length; i++) {
    activities.push({
      id: data[i][0], name: data[i][1], type: data[i][2], created: data[i][3],
      total: data[i][4], drawn: data[i][5], status: data[i][6], hasBigPrize: data[i][7],
      sheetName: data[i][8], creator: data[i][9],
      singlePrice: data[i][11] || 0, multiCount: data[i][12] || 0, multiPrice: data[i][13] || 0
    });
  }
  return { success: true, activities };
}

// ── 驗證活動密碼（抽獎時才需要）──────────────────────────

function verifyActivity(sheetName, password) {
  const ss = ensureInit();
  const indexSheet = ss.getSheetByName(INDEX_SHEET);
  const data = indexSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][8]) === String(sheetName)) {
      if (String(data[i][10]).trim() === String(password).trim()) return { success: true };
      return { success: false, error: '活動密碼錯誤' };
    }
  }
  return { success: false, error: '找不到活動' };
}

// ── 建立活動 ──────────────────────────────────────────────

function createActivity(config) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = ensureInit();
    const indexSheet = ss.getSheetByName(INDEX_SHEET);
    const activityId = 'ACT_' + new Date().getTime();
    const safeName = String(config.name).replace(/[\\\/\?\*\[\]]/g, '').substring(0, 20);
    const sheetName = safeName + '_' + activityId.slice(-8);
    const newSheet = ss.insertSheet(sheetName);

    if (config.type === 'kuji') {
      newSheet.appendRow(['編號','獎項等級','獎品名稱','獎品描述','狀態','抽獎者','抽出時間']);
      newSheet.setFrozenRows(1);
      // 建立獎券並隨機打亂順序
      var pool = [];
      (config.prizes || []).forEach(function(prize) {
        for (var i = 0; i < prize.quantity; i++) {
          pool.push({ level: prize.level, name: prize.name||'', description: prize.description||'' });
        }
      });
      // Fisher-Yates 隨機洗牌
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      }
      for (var k = 0; k < pool.length; k++) {
        newSheet.appendRow([k+1, pool[k].level, pool[k].name, pool[k].description, '未抽', '', '']);
      }
      var total = pool.length;
      var hasBig = pool.some(function(p){ return ['A賞','B賞'].includes(p.level); });
      indexSheet.appendRow([activityId, config.name, 'kuji',
        Utilities.formatDate(new Date(),'Asia/Taipei','yyyy/MM/dd HH:mm'),
        total, 0, '進行中', hasBig?'有':'無', sheetName, config.creator||'', config.activityPassword||'',
        config.singlePrice||0, config.multiCount||0, config.multiPrice||0]);
    } else if (config.type === 'scratch') {
      newSheet.appendRow(['號碼','獎項等級','獎品名稱','狀態','抽獎者','抽出時間']);
      newSheet.setFrozenRows(1);
      (config.numbers||[]).forEach(function(num) {
        newSheet.appendRow([num.number, num.level, num.name||'', '未刮', '', '']);
      });
      var total2 = (config.numbers||[]).length;
      var hasBig2 = (config.numbers||[]).some(function(n){ return ['A賞','B賞'].includes(n.level); });
      indexSheet.appendRow([activityId, config.name, 'scratch',
        Utilities.formatDate(new Date(),'Asia/Taipei','yyyy/MM/dd HH:mm'),
        total2, 0, '進行中', hasBig2?'有':'無', sheetName, config.creator||'', config.activityPassword||'',
        config.singlePrice||0, config.multiCount||0, config.multiPrice||0]);
    }
    return { success: true, activityId, sheetName };
  } finally { lock.releaseLock(); }
}

// ── 取得活動詳情（公開，不需密碼）─────────────────────────

function getActivityDetail(sheetName) {
  const ss = ensureInit();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: '找不到活動' };
  const data = sheet.getDataRange().getValues();
  if (!data.length) return { success: false, error: '無資料' };
  const headers = data[0]; const items = [];
  for (let i = 1; i < data.length; i++) {
    const item = {}; headers.forEach(function(h,j){ item[h] = data[i][j]; }); items.push(item);
  }
  const indexSheet = ss.getSheetByName(INDEX_SHEET);
  const indexData = indexSheet.getDataRange().getValues();
  let activityInfo = null;
  for (let i = 1; i < indexData.length; i++) {
    if (String(indexData[i][8]) === String(sheetName)) {
      activityInfo = { id:indexData[i][0], name:indexData[i][1], type:indexData[i][2], created:indexData[i][3],
        total:indexData[i][4], drawn:indexData[i][5], status:indexData[i][6], hasBigPrize:indexData[i][7],
        sheetName:indexData[i][8], creator:indexData[i][9],
        singlePrice:indexData[i][11]||0, multiCount:indexData[i][12]||0, multiPrice:indexData[i][13]||0 };
      break;
    }
  }
  const stats = {}; const isKuji = headers.includes('獎品描述');
  items.forEach(function(item) {
    const lv = item['獎項等級'];
    if (!stats[lv]) stats[lv] = { level:lv, name:item['獎品名稱'], total:0, drawn:0, remaining:0 };
    stats[lv].total++;
    if ((isKuji && item['狀態']==='已抽') || (!isKuji && item['狀態']==='已刮')) stats[lv].drawn++; else stats[lv].remaining++;
  });
  return { success: true, items, activityInfo, stats: Object.values(stats) };
}

// ── 一番賞抽籤（支援多抽）─────────────────────────────────

function drawPrize(sheetName, playerName, ticketIndices) {
  // ticketIndices: JSON 字串 "[0,3,5]" 或單一數字
  var indices;
  try { indices = typeof ticketIndices === 'string' ? JSON.parse(ticketIndices) : ticketIndices; } catch(e) { indices = [parseInt(ticketIndices)]; }
  if (!Array.isArray(indices)) indices = [indices];

  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const ss = ensureInit();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: '找不到活動' };
    const data = sheet.getDataRange().getValues();
    const now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
    const name = playerName || '匿名';
    const results = [];
    var anyFail = false;

    for (var n = 0; n < indices.length; n++) {
      var idx = parseInt(indices[n]);
      var row = idx + 2;
      if (row < 2 || row > data.length) { results.push({ success:false, error:'無效券號' }); anyFail=true; continue; }
      if (data[row-1][4] !== '未抽') {
        results.push({ success:false, error:'獎券 #'+data[row-1][0]+' 已被其他人抽走！請重新選擇', number:data[row-1][0] });
        anyFail=true; continue;
      }
      sheet.getRange(row, 5).setValue('已抽');
      sheet.getRange(row, 6).setValue(name);
      sheet.getRange(row, 7).setValue(now);
      sheet.getRange(row, 1, 1, 7).setBackground('#2d2d2d').setFontColor('#888');
      data[row-1][4] = '已抽'; // 更新本地快取避免同批次重複
      results.push({ success:true, prize:{ number:data[row-1][0], level:data[row-1][1], name:data[row-1][2], description:data[row-1][3] }});
    }
    updateIndexStats(ss, sheetName, 'kuji');
    return { success: !anyFail, results: results, playerName: name, hasConflict: anyFail };
  } finally { lock.releaseLock(); }
}

// ── 刮刮樂 ────────────────────────────────────────────────

function scratchNumber(sheetName, number, playerName) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const ss = ensureInit();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: '找不到活動' };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (Number(data[i][0]) === Number(number)) {
        if (data[i][3] === '已刮') return { success: false, error: '此號碼已被其他人刮過！' };
        const now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
        const name = playerName || '匿名';
        sheet.getRange(i+1,4).setValue('已刮'); sheet.getRange(i+1,5).setValue(name); sheet.getRange(i+1,6).setValue(now);
        sheet.getRange(i+1,1,1,6).setBackground('#2d2d2d').setFontColor('#888');
        updateIndexStats(ss, sheetName, 'scratch');
        return { success: true, prize: { number: data[i][0], level: data[i][1], name: data[i][2] }, playerName: name };
      }
    }
    return { success: false, error: '找不到號碼' };
  } finally { lock.releaseLock(); }
}

// ── 抽獎紀錄 ──────────────────────────────────────────────

function getDrawLog(sheetName) {
  const ss = ensureInit();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: '找不到活動' };
  const data = sheet.getDataRange().getValues();
  const headers = data[0]; const isKuji = headers.includes('獎品描述');
  const sC = isKuji?4:3, pC = isKuji?5:4, tC = isKuji?6:5;
  const log = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][sC]==='已抽'||data[i][sC]==='已刮')
      log.push({ number:data[i][0], level:data[i][1], name:data[i][2], player:data[i][pC], time:data[i][tC] });
  }
  log.sort(function(a,b){ return String(b.time).localeCompare(String(a.time)); });
  return { success: true, log };
}

// ── 統計更新 ──────────────────────────────────────────────

function updateIndexStats(ss, sheetName, type) {
  const sheet = ss.getSheetByName(sheetName);
  const indexSheet = ss.getSheetByName(INDEX_SHEET);
  const data = sheet.getDataRange().getValues();
  const indexData = indexSheet.getDataRange().getValues();
  let row = -1;
  for (let i = 1; i < indexData.length; i++) { if (String(indexData[i][8])===String(sheetName)){ row=i+1; break; } }
  if (row === -1) return;
  const sC = type==='kuji'?4:3, label = type==='kuji'?'已抽':'已刮';
  let drawn=0, hasBig=false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][sC]===label) drawn++;
    if (['A賞','B賞'].includes(String(data[i][1])) && data[i][sC]!==label) hasBig = true;
  }
  const total = data.length - 1;
  indexSheet.getRange(row,5).setValue(total);
  indexSheet.getRange(row,6).setValue(drawn);
  indexSheet.getRange(row,7).setValue(drawn>=total?'已結束':'進行中');
  indexSheet.getRange(row,8).setValue(hasBig?'有':'無');
}

// ── 重置 & 刪除 ──────────────────────────────────────────

function resetActivity(sheetName) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const ss = ensureInit(); const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: '找不到活動' };
    const data = sheet.getDataRange().getValues(); const h = data[0];
    const isKuji = h.includes('獎品描述');
    const sC=isKuji?5:4, pC=isKuji?6:5, tC=isKuji?7:6, cols=isKuji?7:6;
    for (let i = 2; i <= data.length; i++) {
      sheet.getRange(i,sC).setValue(isKuji?'未抽':'未刮');
      sheet.getRange(i,pC).setValue(''); sheet.getRange(i,tC).setValue('');
      sheet.getRange(i,1,1,cols).setBackground(null).setFontColor(null);
    }
    updateIndexStats(ss, sheetName, isKuji?'kuji':'scratch');
    return { success: true };
  } finally { lock.releaseLock(); }
}

function deleteActivity(sheetName) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const ss = ensureInit(); const sheet = ss.getSheetByName(sheetName);
    if (sheet) ss.deleteSheet(sheet);
    const indexSheet = ss.getSheetByName(INDEX_SHEET);
    const d = indexSheet.getDataRange().getValues();
    for (let i = d.length-1; i >= 1; i--) { if (String(d[i][8])===String(sheetName)){ indexSheet.deleteRow(i+1); break; } }
    return { success: true };
  } finally { lock.releaseLock(); }
}
